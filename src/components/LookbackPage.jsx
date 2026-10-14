import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// The iPad board's last page: recent Robinhood sales (from rentals-api, via the
// loadSales prop) next to each ticker's price now, to judge whether selling was
// right. Starred sales are kept on the board permanently and listed first; the
// newest other sales fill the rest of one screen.

const SALES_REFRESH_MS = 10 * 60 * 1000
const PRICE_REFRESH_MS = 30 * 1000
const QUOTES_ENDPOINT = '/api/quotes'
const QUOTES_PER_REQUEST = 90
const ACCOUNT_LABELS = { individual: 'Individual', traditional: 'Traditional IRA', roth: 'Roth IRA' }

const quoteSymbolFor = (sale) => (sale.assetClass === 'crypto' ? `${sale.ticker}-USD` : sale.ticker)

const formatMoney = (value, digits = 2) => {
    if (!Number.isFinite(value)) return '—'
    const abs = Math.abs(value)
    return `${value < 0 ? '-' : ''}$${abs.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}
const formatPrice = (value) => formatMoney(value, Math.abs(value) < 1 ? 4 : 2)
const formatQuantity = (value) => (Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 4 }))
const formatSaleDate = (date) => {
    const [year, month, day] = String(date || '').split('-').map(Number)
    if (!year) return '—'
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()
}

// One sale = two board-sized tiles side by side: what it sold for, and what it is now.
function SaleCard({ sale, price, starred, onToggleStar }) {
    const hasPrice = Number.isFinite(price) && price > 0
    const movePercent = hasPrice ? ((price - sale.price) / sale.price) * 100 : null
    // Positive: the stock rose after the sale (gain given up). Negative: it fell (loss avoided).
    const moveDollars = hasPrice ? (price - sale.price) * sale.quantity : null
    const verdict = !hasPrice || Math.abs(movePercent) < 0.5 ? 'neutral' : movePercent < 0 ? 'good' : 'early'
    const verdictText = !hasPrice
        ? 'NO PRICE YET'
        : verdict === 'neutral'
            ? 'ABOUT EVEN'
            : verdict === 'good'
                ? `SAVED ${formatMoney(Math.abs(moveDollars), 0)}`
                : `MISSED ${formatMoney(Math.abs(moveDollars), 0)}`

    return (
        <div className={`lookback-card is-${verdict} ${starred ? 'is-starred' : ''}`}>
            <div className="paged-tile lookback-tile">
                <div className="paged-tile-body">
                    <div className="paged-tile-row">
                        <span className="paged-tile-symbol">{sale.ticker}</span>
                        <span className="lookback-label">SOLD {formatSaleDate(sale.date)}</span>
                    </div>
                    <div className="paged-tile-price">{formatPrice(sale.price)}</div>
                    <div className="paged-tile-row paged-tile-foot">
                        <span className="paged-tile-status">{formatQuantity(sale.quantity)} SH · {(ACCOUNT_LABELS[sale.account] || sale.account || '').toUpperCase()}</span>
                    </div>
                </div>
            </div>
            <div className="paged-tile lookback-tile is-now">
                <div className="paged-tile-body">
                    <div className="paged-tile-row">
                        <span className="lookback-label">NOW</span>
                        <span className="paged-tile-percent lookback-move">{hasPrice ? `${movePercent >= 0 ? '+' : ''}${movePercent.toFixed(1)}%` : ''}</span>
                    </div>
                    <div className="paged-tile-price lookback-now-price">{hasPrice ? formatPrice(price) : '—'}</div>
                    <div className="paged-tile-row paged-tile-foot">
                        <span className="paged-tile-status lookback-verdict">{verdictText}</span>
                    </div>
                </div>
                <button
                    type="button"
                    className={`lookback-star ${starred ? 'is-on' : ''}`}
                    onClick={() => onToggleStar(sale)}
                    aria-pressed={starred}
                    aria-label={starred ? `Unstar ${sale.ticker} sale` : `Star ${sale.ticker} sale`}
                >
                    {starred ? '★' : '☆'}
                </button>
            </div>
        </div>
    )
}

export default function LookbackPage({ active, loadSales, starredSales, onToggleStar }) {
    const [sales, setSales] = useState([])
    const [status, setStatus] = useState('idle') // idle | loading | ready | error
    const [error, setError] = useState('')
    const [fetchedAt, setFetchedAt] = useState(null)
    const [prices, setPrices] = useState({})
    // How many recent (unstarred) sales fit in the room left below the starred ones.
    const [capacity, setCapacity] = useState(18)
    const loadedAtRef = useRef(0)
    const pageRef = useRef(null)
    const gridRef = useRef(null)
    const probeRef = useRef(null)

    const refreshSales = useCallback(async () => {
        setStatus((current) => (current === 'ready' ? current : 'loading'))
        try {
            const data = await loadSales()
            setSales(Array.isArray(data?.sales) ? data.sales : [])
            setFetchedAt(data?.fetchedAt || null)
            setError(data?.warning || '')
            setStatus('ready')
            loadedAtRef.current = Date.now()
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Sales could not be loaded.')
            setStatus((current) => (current === 'ready' ? current : 'error'))
        }
    }, [loadSales])

    // Load on first view, then every ten minutes while the page is showing.
    useEffect(() => {
        if (!active) return undefined
        const first = window.setTimeout(() => {
            if (Date.now() - loadedAtRef.current > SALES_REFRESH_MS) refreshSales()
        }, 0)
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') refreshSales()
        }, SALES_REFRESH_MS)
        return () => {
            window.clearTimeout(first)
            window.clearInterval(timer)
        }
    }, [active, refreshSales])

    // Show as many sales as fit on one screen: the starred ones (larger) first, then
    // three across, as many rows as the room left holds at the board's tile height.
    useEffect(() => {
        const page = pageRef.current?.parentElement
        const grid = gridRef.current
        const probe = probeRef.current
        if (!page || !grid || !probe || typeof ResizeObserver === 'undefined') return undefined
        const measure = () => {
            const tileHeight = probe.getBoundingClientRect().height
            if (!tileHeight) return
            const pageStyle = window.getComputedStyle(page)
            const bottom = page.getBoundingClientRect().bottom - (parseFloat(pageStyle.paddingBottom) || 0)
            const available = bottom - grid.getBoundingClientRect().top
            const gap = parseFloat(window.getComputedStyle(grid).rowGap) || 0
            const rows = Math.max(1, Math.floor((available + gap) / (tileHeight + gap)))
            const columns = window.matchMedia('(max-width: 900px)').matches ? 1 : 3
            // No room left below a long starred list: still show one row of recent sales.
            setCapacity(Math.max(1, rows) * columns)
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(page)
        return () => observer.disconnect()
    }, [starredSales.length])

    const starredIds = useMemo(() => new Set(starredSales.map((sale) => sale.id)), [starredSales])
    // Starred first (always all of them), then the newest sales in the slots left.
    const recent = useMemo(() => sales.filter((sale) => !starredIds.has(sale.id)).slice(0, capacity), [sales, starredIds, capacity])
    const shown = useMemo(() => [...starredSales, ...recent], [starredSales, recent])
    const symbolKey = useMemo(() => [...new Set(shown.map(quoteSymbolFor))].sort().join(','), [shown])

    // Current prices from the batch endpoint (no Finnhub calls), every 30s while showing.
    useEffect(() => {
        if (!active || !symbolKey) return undefined
        const controller = new AbortController()
        const symbols = symbolKey.split(',')
        const load = async () => {
            if (document.visibilityState !== 'visible') return
            const chunks = []
            for (let index = 0; index < symbols.length; index += QUOTES_PER_REQUEST) chunks.push(symbols.slice(index, index + QUOTES_PER_REQUEST))
            const results = await Promise.allSettled(chunks.map(async (chunk) => {
                const response = await fetch(`${QUOTES_ENDPOINT}?symbols=${encodeURIComponent(chunk.join(','))}`, { signal: controller.signal })
                if (!response.ok) throw new Error(`Quotes returned ${response.status}`)
                return (await response.json())?.quotes || {}
            }))
            if (controller.signal.aborted) return
            const next = {}
            results.forEach((result) => {
                if (result.status !== 'fulfilled') return
                Object.entries(result.value).forEach(([symbol, quote]) => {
                    const price = Number(quote?.price)
                    if (Number.isFinite(price) && price > 0) next[symbol] = price
                })
            })
            if (Object.keys(next).length) setPrices((current) => ({ ...current, ...next }))
        }
        load()
        const timer = window.setInterval(load, PRICE_REFRESH_MS)
        return () => {
            controller.abort()
            window.clearInterval(timer)
        }
    }, [active, symbolKey])

    const asOf = fetchedAt
        ? new Date(fetchedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : ''

    return (
        <div className="lookback-page" ref={pageRef}>
            <div className="diagnostic-theme-heading paged-group-heading lookback-heading">
                <span>LOOKBACK · RECENT SALES VS PRICE NOW</span>
                <span className="lookback-heading-side">
                    {error ? <span className="lookback-error">{error}</span> : asOf ? `ROBINHOOD AS OF ${asOf.toUpperCase()}` : ''}
                    <button type="button" className="lookback-refresh" onClick={refreshSales} disabled={status === 'loading'}>
                        {status === 'loading' ? 'LOADING…' : 'REFRESH'}
                    </button>
                </span>
            </div>
            <div className="lookback-probe" ref={probeRef} aria-hidden="true" />
            {status !== 'ready' && sales.length === 0 && starredSales.length === 0 && (
                <div className="lookback-empty">
                    {status === 'error' ? 'Sales could not be loaded. Tap REFRESH to try again.' : 'Loading your Robinhood sales…'}
                </div>
            )}
            {status === 'ready' && shown.length === 0 && <div className="lookback-empty">No stock sales found in your Robinhood activity.</div>}
            {starredSales.length > 0 && (
                <div className="lookback-grid is-starred">
                    {starredSales.map((sale) => (
                        <SaleCard key={sale.id} sale={sale} price={prices[quoteSymbolFor(sale)]} starred onToggleStar={onToggleStar} />
                    ))}
                </div>
            )}
            <div className="lookback-grid" ref={gridRef}>
                {recent.map((sale) => (
                    <SaleCard key={sale.id} sale={sale} price={prices[quoteSymbolFor(sale)]} starred={false} onToggleStar={onToggleStar} />
                ))}
            </div>
        </div>
    )
}
