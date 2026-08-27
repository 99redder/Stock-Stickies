// Breaking U.S. market-news aggregator for the Live Dashboard news ticker.
//
// Fetches a handful of real-time breaking headline feeds server-side, normalizes
// them into a single newest-first list, dedupes, and returns compact JSON. The
// client polls this endpoint and shows the freshest headlines as dismissible
// bottom-right alerts. Keeping the fetch server-side avoids per-source CORS/CSP
// issues and lets the edge cache one copy for every viewer.

const EDGE_CACHE_SECONDS = 30
// Only surface genuinely fresh, breaking headlines. Anything older than this is
// dropped so the ticker never fills with stale news the user must click through.
const MAX_HEADLINE_AGE_MS = 30 * 60 * 1000
const MAX_HEADLINES = 25

// Breaking, market-focused, free RSS feeds. Each is fetched independently and a
// dead/slow feed never blocks the others. Swap or add feeds here if one goes stale.
const FEEDS = [
    { source: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_bulletins' },          // Breaking bulletins
    { source: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines' },
    { source: 'CNBC', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html' },                       // Markets
    { source: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },                      // Top News
    { source: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' }
]

const FEED_USER_AGENT = 'Mozilla/5.0 (compatible; StockStickiesNewsTicker/1.0; +https://stockstickies.com)'

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${EDGE_CACHE_SECONDS}, s-maxage=${EDGE_CACHE_SECONDS}`,
        'X-Content-Type-Options': 'nosniff'
    }
})

const decodeEntities = (value) => String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const firstMatch = (block, pattern) => {
    const match = block.match(pattern)
    return match ? decodeEntities(match[1]) : ''
}

// Headlines counted as the same story when their word sets overlap this much.
// Catches lightly-reworded republishes (e.g. "the AI startup" vs "the
// open-source AI startup") while leaving genuinely different headlines apart.
const DUPLICATE_SIMILARITY = 0.6

const titleTokens = (title) => new Set(
    String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
)

const tokenSimilarity = (a, b) => {
    if (a.size === 0 || b.size === 0) return 0
    let intersection = 0
    for (const token of a) if (b.has(token)) intersection += 1
    return intersection / (a.size + b.size - intersection)
}

const parseFeed = (xml, source) => {
    const items = []
    for (const match of String(xml || '').matchAll(/<item[\s\S]*?<\/item>/g)) {
        const block = match[0]
        const title = firstMatch(block, /<title[^>]*>([\s\S]*?)<\/title>/)
        if (!title) continue
        const link = firstMatch(block, /<link[^>]*>([\s\S]*?)<\/link>/)
            || firstMatch(block, /<guid[^>]*>([\s\S]*?)<\/guid>/)
        const pubDate = firstMatch(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/)
            || firstMatch(block, /<dc:date[^>]*>([\s\S]*?)<\/dc:date>/)
        const publishedAt = Date.parse(pubDate)
        items.push({
            title,
            url: /^https?:\/\//i.test(link) ? link : '',
            source,
            publishedAt: Number.isFinite(publishedAt) ? publishedAt : null
        })
    }
    return items
}

const loadFeed = async (feed, signal) => {
    try {
        const upstream = await fetch(feed.url, {
            signal,
            headers: {
                Accept: 'application/rss+xml, application/xml, text/xml',
                'User-Agent': FEED_USER_AGENT
            }
        })
        if (!upstream.ok) return []
        return parseFeed(await upstream.text(), feed.source)
    } catch {
        // A single unreachable feed must never break the ticker.
        return []
    }
}

export async function onRequestGet(context) {
    const cache = caches.default
    const cacheKey = new Request(new URL(context.request.url).origin + '/api/news/breaking', { method: 'GET' })
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)

    try {
        const results = await Promise.all(FEEDS.map((feed) => loadFeed(feed, controller.signal)))
        const now = Date.now()
        const fresh = results
            .flat()
            // Require a real timestamp — an undateable item can't be proven fresh.
            .filter((item) => Number.isFinite(item.publishedAt) && now - item.publishedAt <= MAX_HEADLINE_AGE_MS)
            .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))

        // Newest-first pass that drops near-duplicate rewordings, keeping the freshest.
        const accepted = []
        for (const item of fresh) {
            const tokens = titleTokens(item.title)
            if (tokens.size === 0) continue
            if (accepted.some((prev) => tokenSimilarity(prev.tokens, tokens) >= DUPLICATE_SIMILARITY)) continue
            accepted.push({ item, tokens })
            if (accepted.length >= MAX_HEADLINES) break
        }

        const headlines = accepted.map(({ item }) => ({
            // A stable id so the client can remember which headlines were dismissed.
            id: (item.url || item.title).slice(0, 240),
            title: item.title,
            url: item.url,
            source: item.source,
            publishedAt: item.publishedAt
        }))

        const response = jsonResponse({ fetchedAt: now, headlines })
        context.waitUntil(cache.put(cacheKey, response.clone()))
        return response
    } catch (error) {
        console.error('Breaking news fetch failed:', error instanceof Error ? error.message : String(error))
        return jsonResponse({ fetchedAt: Date.now(), headlines: [], error: 'Unable to load breaking news right now.' }, 502)
    } finally {
        clearTimeout(timeout)
    }
}
