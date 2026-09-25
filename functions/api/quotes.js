// Batch stock quotes for the Live Dashboard's non-streaming widgets. Finnhub's free
// WebSocket streams at most 50 symbols and its REST quote costs one call per symbol
// against a 60/minute key limit, so everything past the stream cap refreshes here in
// one request instead. Source: Yahoo Finance's spark endpoint (≤20 symbols a call).
const MAX_SYMBOLS = 100
const YAHOO_BATCH_SIZE = 20
const CACHE_SECONDS = 10
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.\-^]{0,11}$/

// Finnhub-style symbols the dashboard uses → Yahoo symbols.
const YAHOO_ALIASES = { VIX: '^VIX' }
const toYahooSymbol = (symbol) => YAHOO_ALIASES[symbol] || symbol.replace(/\./g, '-')

const jsonResponse = (body, status = 200, maxAge = CACHE_SECONDS) => new Response(JSON.stringify(body), {
    status,
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': status === 200 ? `public, max-age=${Math.min(maxAge, 5)}, s-maxage=${maxAge}` : 'no-store',
        'X-Content-Type-Options': 'nosniff'
    }
})

const finite = (value) => {
    const number = Number(value)
    return Number.isFinite(number) ? number : null
}

const fetchYahooBatch = async (yahooSymbols) => {
    const params = new URLSearchParams({ symbols: yahooSymbols.join(','), range: '1d', interval: '1d' })
    const upstream = await fetch(`https://query1.finance.yahoo.com/v7/finance/spark?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; stock-stickies)', Accept: 'application/json' }
    })
    if (!upstream.ok) throw new Error(`Yahoo returned ${upstream.status}`)
    const data = await upstream.json()
    const results = data?.spark?.result
    if (!Array.isArray(results)) throw new Error(data?.spark?.error?.description || 'Yahoo returned no results')
    return results
}

export async function onRequestGet(context) {
    const url = new URL(context.request.url)
    const symbols = [...new Set(String(url.searchParams.get('symbols') || '')
        .toUpperCase()
        .split(',')
        .map((symbol) => symbol.trim())
        .filter((symbol) => SYMBOL_PATTERN.test(symbol)))]
        .sort()
    if (symbols.length === 0) return jsonResponse({ error: 'Pass ?symbols=AAPL,MSFT' }, 400)
    if (symbols.length > MAX_SYMBOLS) return jsonResponse({ error: `At most ${MAX_SYMBOLS} symbols per request.` }, 400)

    // Normalized (sorted, de-duplicated) key so equivalent requests share the edge cache.
    const cacheKey = new Request(`${url.origin}${url.pathname}?symbols=${symbols.join(',')}`, { method: 'GET' })
    const cache = caches.default
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    const requestedByYahoo = new Map(symbols.map((symbol) => [toYahooSymbol(symbol), symbol]))
    const yahooSymbols = [...requestedByYahoo.keys()]
    const batches = []
    for (let index = 0; index < yahooSymbols.length; index += YAHOO_BATCH_SIZE) {
        batches.push(yahooSymbols.slice(index, index + YAHOO_BATCH_SIZE))
    }

    const settled = await Promise.allSettled(batches.map(fetchYahooBatch))
    const quotes = {}
    settled.forEach((outcome) => {
        if (outcome.status !== 'fulfilled') return
        outcome.value.forEach((result) => {
            const symbol = requestedByYahoo.get(result?.symbol)
            const meta = result?.response?.[0]?.meta
            const price = finite(meta?.regularMarketPrice)
            if (!symbol || !price || price <= 0) return
            const previousClose = finite(meta.chartPreviousClose ?? meta.previousClose)
            const change = previousClose ? price - previousClose : null
            quotes[symbol] = {
                price,
                previousClose,
                change,
                changePercent: previousClose ? (change / previousClose) * 100 : null,
                high: finite(meta.regularMarketDayHigh),
                low: finite(meta.regularMarketDayLow),
                timestamp: finite(meta.regularMarketTime) ? meta.regularMarketTime * 1000 : null
            }
        })
    })

    const failures = settled.filter((outcome) => outcome.status === 'rejected')
    if (failures.length === batches.length) {
        console.error('Quote batch failed:', failures[0].reason instanceof Error ? failures[0].reason.message : String(failures[0].reason))
        return jsonResponse({ error: 'Unable to load quotes right now.' }, 502)
    }

    // Cache a partial result only briefly so a failed chunk is retried soon.
    const response = jsonResponse({ quotes, source: 'yahoo', fetchedAt: Date.now() }, 200, failures.length ? 3 : CACHE_SECONDS)
    context.waitUntil(cache.put(cacheKey, response.clone()))
    return response
}
