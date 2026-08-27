const CACHE_SECONDS = 4 * 60 * 60

const treasuryYieldCurveUrl = (year) => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=900, s-maxage=${CACHE_SECONDS}`,
        'X-Content-Type-Options': 'nosniff'
    }
})

const parseLatestReadings = (xml) => {
    const readings = []
    const entryPattern = /<entry>[\s\S]*?<d:NEW_DATE[^>]*>(\d{4}-\d{2}-\d{2})T[^<]*<\/d:NEW_DATE>[\s\S]*?<d:BC_30YEAR[^>]*>([0-9.]+)<\/d:BC_30YEAR>[\s\S]*?<\/entry>/g
    for (const match of String(xml || '').matchAll(entryPattern)) {
        const value = Number(match[2])
        if (Number.isFinite(value)) readings.push({ date: match[1], value })
    }
    return readings.sort((a, b) => a.date.localeCompare(b.date)).slice(-2)
}

export async function onRequestGet(context) {
    const cache = caches.default
    const cacheKey = new Request(context.request.url, { method: 'GET' })
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    try {
        const currentYear = new Date().getUTCFullYear()
        const loadYear = async (year) => {
            const upstream = await fetch(treasuryYieldCurveUrl(year), { headers: { Accept: 'application/xml, text/xml' } })
            if (!upstream.ok) throw new Error(`Treasury returned ${upstream.status}`)
            return parseLatestReadings(await upstream.text())
        }

        let readings = await loadYear(currentYear)
        if (readings.length < 2) readings = [...(await loadYear(currentYear - 1)), ...readings].slice(-2)
        const latest = readings.at(-1)
        const previous = readings.at(-2)
        if (!latest) throw new Error('Treasury returned no valid 30-year readings')

        const response = jsonResponse({
            symbol: 'DGS30',
            label: '30-Year Treasury Par Yield',
            unit: 'percent',
            frequency: 'daily',
            date: latest.date,
            value: latest.value,
            previousDate: previous?.date || null,
            previousValue: previous?.value ?? null,
            source: 'U.S. Department of the Treasury'
        })
        context.waitUntil(cache.put(cacheKey, response.clone()))
        return response
    } catch (error) {
        console.error('DGS30 fetch failed:', error instanceof Error ? error.message : String(error))
        return jsonResponse({ error: 'Unable to load the 30-year Treasury rate.' }, 502)
    }
}
