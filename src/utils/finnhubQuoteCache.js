const quoteCache = new Map()
const inFlightQuotes = new Map()

const normalizeSymbol = (symbol) => String(symbol || '').trim().toUpperCase()

export async function fetchFinnhubQuote(symbol, apiKey, options = {}) {
  const normalizedSymbol = normalizeSymbol(symbol)
  if (!normalizedSymbol || !apiKey) throw new Error('A Finnhub symbol and API key are required')

  const {
    maxAgeMs = 15_000,
    force = false,
    timeoutMs = 10_000,
  } = options
  const cacheKey = `${apiKey}:${normalizedSymbol}`
  const cached = quoteCache.get(cacheKey)

  if (!force && cached && Date.now() - cached.timestamp <= maxAgeMs) {
    return cached.data
  }
  if (inFlightQuotes.has(cacheKey)) return inFlightQuotes.get(cacheKey)

  const request = (async () => {
    const controller = new AbortController()
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)
    try {
      const params = new URLSearchParams({ symbol: normalizedSymbol, token: apiKey })
      const response = await fetch(`https://finnhub.io/api/v1/quote?${params}`, {
        signal: controller.signal,
      })
      if (!response.ok) {
        const error = new Error(`Finnhub quote request failed (${response.status})`)
        error.status = response.status
        throw error
      }
      const data = await response.json()
      quoteCache.set(cacheKey, { data, timestamp: Date.now() })
      return data
    } finally {
      globalThis.clearTimeout(timeoutId)
      inFlightQuotes.delete(cacheKey)
    }
  })()

  inFlightQuotes.set(cacheKey, request)
  return request
}

export function clearFinnhubQuoteCache() {
  quoteCache.clear()
  inFlightQuotes.clear()
}
