import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

// The iPad board's Reflect page: the year's five best and five worst trades by
// dollar P&L (rentals-api /plaid/reflect: Robinhood's activity exports plus the
// Plaid trades since, per account and ticker, stock and options together), and
// below them the YTD return vs SPY that the desktop Portfolio tab charts
// (/plaid/performance). Both come through the loadReflect prop.

const REFRESH_MS = 10 * 60 * 1000
const ACCOUNT_LABELS = { individual: 'INDIVIDUAL', traditional: 'TRADITIONAL IRA', roth: 'ROTH IRA' }
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const formatDollars = (value) => {
    if (!Number.isFinite(value)) return '—'
    const rounded = Math.round(value)
    return `${rounded < 0 ? '−' : '+'}$${Math.abs(rounded).toLocaleString()}`
}
// One decimal, as desktop shows YTD returns.
const formatPercent = (value) => (Number.isFinite(value) ? `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(1)}%` : '—')
const formatDay = (isoDate) => {
    const [year, month, day] = String(isoDate || '').split('-').map(Number)
    return year ? `${MONTHS[month - 1]} ${day}` : ''
}
const formatQuantity = (value) => (Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 4 }))

// "ROBINHOOD EXPORTS THROUGH SEP 22 (TRADITIONAL IRA, ROTH IRA) · JUL 24 (INDIVIDUAL)"
const describeThrough = (through) => {
    const byDate = new Map()
    Object.entries(through || {}).forEach(([account, date]) => {
        if (!date) return
        byDate.set(date, [...(byDate.get(date) || []), ACCOUNT_LABELS[account] || account.toUpperCase()])
    })
    const parts = [...byDate].sort((a, b) => b[0].localeCompare(a[0])).map(([date, accounts]) => `${formatDay(date)} (${accounts.join(', ')})`)
    return parts.length ? `ROBINHOOD EXPORTS THROUGH ${parts.join(' · ')} · PLAID SINCE` : ''
}

function TradeTile({ trade, rank }) {
    const tone = trade.pnl >= 0 ? 'up' : 'down'
    // The holdings' count; the records' (sharesNow) can be off where Plaid missed a trade.
    const shares = trade.sharesHeld ?? trade.sharesNow
    const held = shares > 0
        ? `HELD ${formatQuantity(shares)} SH`
        : trade.optionContractsNow
            ? `${Math.abs(trade.optionContractsNow)} CONTRACT${Math.abs(trade.optionContractsNow) === 1 ? '' : 'S'} OPEN`
            : 'CLOSED'
    return (
        <div className={`paged-tile runner-tile reflect-tile quote-${tone}`}>
            <div className="paged-tile-body runner-tile-body">
                <div className="runner-tile-row">
                    <span className="runner-tile-symbol">{trade.ticker}</span>
                    <span className="runner-tile-rank">#{rank}</span>
                </div>
                <div className="runner-tile-percent">
                    {trade.estimated && <span className="reflect-estimate" title="Plaid is missing a trade for this position; this figure is an estimate">≈</span>}
                    {formatDollars(trade.pnl)}
                </div>
                <div className="runner-tile-row reflect-tile-split">
                    <span>STOCK {formatDollars(trade.stockPnl)}</span>
                    {trade.optionPnl !== 0 && <span>OPT {formatDollars(trade.optionPnl)}</span>}
                </div>
                <div className="runner-tile-row runner-tile-group">
                    <span>{ACCOUNT_LABELS[trade.account] || trade.account.toUpperCase()}</span>
                    {trade.pending && !trade.estimated
                        ? <span className="reflect-pending" title="Today's trades in this position aren't in Plaid yet">TODAY PENDING</span>
                        : <span>{held}</span>}
                </div>
            </div>
        </div>
    )
}

// Cumulative YTD return, all accounts vs SPY, sized to its box.
function YtdChart({ points }) {
    const boxRef = useRef(null)
    const [size, setSize] = useState({ width: 0, height: 0 })
    useLayoutEffect(() => {
        const box = boxRef.current
        if (!box || typeof ResizeObserver === 'undefined') return undefined
        const measure = () => setSize({ width: box.clientWidth, height: box.clientHeight })
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(box)
        return () => observer.disconnect()
    }, [])

    const chart = useMemo(() => {
        const { width, height } = size
        if (!width || !height || points.length < 2) return null
        const pad = { top: 10, right: 64, bottom: 24, left: 46 }
        const values = points.flatMap((point) => [point.total, point.spy]).filter(Number.isFinite)
        const low = Math.min(0, ...values)
        const high = Math.max(0, ...values)
        const step = [1, 2, 5, 10, 20, 25, 50].find((candidate) => (high - low) / candidate <= 6) || 100
        const min = Math.floor(low / step) * step
        const max = Math.ceil(high / step) * step || step
        const x = (index) => pad.left + (index / (points.length - 1)) * (width - pad.left - pad.right)
        const y = (value) => pad.top + ((max - value) / (max - min)) * (height - pad.top - pad.bottom)
        const line = (key) => points.reduce((path, point, index) => {
            if (!Number.isFinite(point[key])) return path
            return `${path}${path ? 'L' : 'M'}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`
        }, '')
        const ticks = []
        for (let value = min; value <= max + 1e-9; value += step) ticks.push(value)
        const months = []
        points.forEach((point, index) => {
            const month = Number(String(point.date).slice(5, 7))
            if (index > 0 && month !== Number(String(points[index - 1].date).slice(5, 7))) months.push({ index, label: MONTHS[month - 1] })
        })
        const last = (key) => {
            for (let index = points.length - 1; index >= 0; index -= 1) if (Number.isFinite(points[index][key])) return { index, value: points[index][key] }
            return null
        }
        const lastPortfolio = last('total')
        const lastSpy = last('spy')
        // End labels sit beside each line's last point, pushed apart when they would overlap.
        const labelY = { portfolio: lastPortfolio && y(lastPortfolio.value), spy: lastSpy && y(lastSpy.value) }
        if (lastPortfolio && lastSpy && Math.abs(labelY.portfolio - labelY.spy) < 14) {
            const middle = (labelY.portfolio + labelY.spy) / 2
            const portfolioAbove = lastPortfolio.value >= lastSpy.value
            labelY.portfolio = middle + (portfolioAbove ? -7 : 7)
            labelY.spy = middle + (portfolioAbove ? 7 : -7)
        }
        return { width, height, x, y, ticks, months, portfolio: line('total'), spy: line('spy'), lastPortfolio, lastSpy, labelY }
    }, [points, size])

    return (
        <div className="reflect-chart" ref={boxRef}>
            {chart && (
                <svg width={chart.width} height={chart.height} role="img" aria-label="Year-to-date return, all accounts compared with SPY">
                    {chart.ticks.map((value) => (
                        <g key={value}>
                            <line className={value === 0 ? 'reflect-chart-zero' : 'reflect-chart-grid'} x1={chart.x(0)} x2={chart.x(points.length - 1)} y1={chart.y(value)} y2={chart.y(value)} />
                            <text className="reflect-chart-axis" x={chart.x(0) - 8} y={chart.y(value)} textAnchor="end" dominantBaseline="middle">{value}%</text>
                        </g>
                    ))}
                    {chart.months.map(({ index, label }) => (
                        <text key={label} className="reflect-chart-axis" x={chart.x(index)} y={chart.height - 6} textAnchor="middle">{label}</text>
                    ))}
                    <path className="reflect-chart-spy" d={chart.spy} />
                    <path className="reflect-chart-portfolio" d={chart.portfolio} />
                    {chart.lastSpy && (
                        <text className="reflect-chart-end is-spy" x={chart.x(chart.lastSpy.index) + 8} y={chart.labelY.spy} dominantBaseline="middle">SPY</text>
                    )}
                    {chart.lastPortfolio && (
                        <>
                            <circle className="reflect-chart-dot" cx={chart.x(chart.lastPortfolio.index)} cy={chart.y(chart.lastPortfolio.value)} r="4" />
                            <text className="reflect-chart-end" x={chart.x(chart.lastPortfolio.index) + 8} y={chart.labelY.portfolio} dominantBaseline="middle">ALL</text>
                        </>
                    )}
                </svg>
            )}
        </div>
    )
}

export default function ReflectPage({ active, loadReflect }) {
    const [data, setData] = useState(null)
    const [status, setStatus] = useState('idle') // idle | loading | ready | error
    // True while any load is in flight, the first one included, so REFRESH shows it.
    const [refreshing, setRefreshing] = useState(false)
    const [updatedAt, setUpdatedAt] = useState(null)
    const [error, setError] = useState('')
    const loadedAtRef = useRef(0)
    const inFlightRef = useRef(false)

    const refresh = useCallback(async () => {
        if (inFlightRef.current) return
        inFlightRef.current = true
        setRefreshing(true)
        setStatus((current) => (current === 'ready' ? current : 'loading'))
        try {
            const next = await loadReflect()
            setData(next)
            setError([next?.tradesError, next?.performanceError].filter(Boolean).join(' · '))
            setStatus('ready')
            setUpdatedAt(new Date())
            loadedAtRef.current = Date.now()
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Reflect could not be loaded.')
            setStatus((current) => (current === 'ready' ? current : 'error'))
        } finally {
            inFlightRef.current = false
            setRefreshing(false)
        }
    }, [loadReflect])

    // Load on first view, then every ten minutes while the page is showing.
    useEffect(() => {
        if (!active) return undefined
        const first = window.setTimeout(() => {
            if (Date.now() - loadedAtRef.current > REFRESH_MS) refresh()
        }, 0)
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') refresh()
        }, REFRESH_MS)
        return () => {
            window.clearTimeout(first)
            window.clearInterval(timer)
        }
    }, [active, refresh])

    const trades = data?.trades
    const performance = data?.performance
    const year = trades?.year || performance?.year || new Date().getFullYear()
    const points = useMemo(() => (Array.isArray(performance?.ytdSeries?.points) ? performance.ytdSeries.points : []), [performance])
    const lastPoint = [...points].reverse().find((point) => Number.isFinite(point.total))
    const lastSpyPoint = [...points].reverse().find((point) => Number.isFinite(point.spy))
    const headline = performance?.total?.status === 'ready' ? performance.total : null
    // The figures desktop shows: the reconciled headline return (Modified Dietz,
    // Robinhood-anchored) and SPY over the same dates. The chart line is the
    // time-weighted return from daily closes, which can end elsewhere; it is the
    // fallback only while the headline isn't ready.
    const portfolioReturn = Number.isFinite(headline?.returnPercent) ? headline.returnPercent : lastPoint?.total
    const spyReturn = Number.isFinite(performance?.benchmark?.ytdReturnPercent) ? performance.benchmark.ytdReturnPercent : lastSpyPoint?.spy
    const versusSpy = Number.isFinite(portfolioReturn) && Number.isFinite(spyReturn) ? portfolioReturn - spyReturn : null
    // The YTD share card's risk tiles: Sharpe, max drawdown and beta, from daily closes.
    const risk = performance?.total?.risk || null
    const riskTiles = [
        Number.isFinite(risk?.sharpeRatio) && { label: 'SHARPE', value: risk.sharpeRatio.toFixed(2) },
        Number.isFinite(risk?.maxDrawdownPercent) && {
            label: 'MAX DRAWDOWN',
            value: `${risk.maxDrawdownPercent < 0 ? '−' : ''}${Math.abs(risk.maxDrawdownPercent).toFixed(1)}%`,
            detail: risk.maxDrawdownDate ? formatDay(risk.maxDrawdownDate) : '',
        },
        Number.isFinite(risk?.beta) && { label: `BETA VS ${risk.benchmark || 'SPY'}`, value: risk.beta.toFixed(2) },
    ].filter(Boolean)
    const waiting = status === 'loading' || status === 'idle'
    const tone = (value) => (Number.isFinite(value) ? (value >= 0 ? 'is-up' : 'is-down') : '')

    const renderSection = (title, list, sectionTone) => (
        <div className={`runners-section reflect-section is-${sectionTone}`}>
            <div className="diagnostic-theme-heading paged-group-heading runners-heading">
                <span>{title}</span>
                <span>{year} YTD · STOCK + OPTIONS, PER ACCOUNT</span>
            </div>
            <div className="runners-tiles">
                {trades?.status === 'no-history' && <div className="runners-empty">The year’s Robinhood activity hasn’t been imported yet.</div>}
                {trades?.status === 'ready' && list.length === 0 && <div className="runners-empty">No {sectionTone === 'up' ? 'winning' : 'losing'} trades this year.</div>}
                {!trades && <div className="runners-empty">{waiting ? 'Loading your trades…' : 'Trades could not be loaded. Tap REFRESH to try again.'}</div>}
                {list.map((trade, index) => <TradeTile key={trade.id} trade={trade} rank={index + 1} />)}
            </div>
        </div>
    )

    const shownTrades = [...(trades?.best || []), ...(trades?.worst || [])]
    const estimatedShown = shownTrades.some((trade) => trade.estimated)
    const pendingShown = shownTrades.some((trade) => trade.pending && !trade.estimated)

    return (
        <>
            {renderSection('REFLECT · BEST TRADES', trades?.best || [], 'up')}
            {renderSection('REFLECT · WORST TRADES', trades?.worst || [], 'down')}
            <div className="reflect-performance">
                <div className="diagnostic-theme-heading paged-group-heading reflect-heading">
                    <span>{year} YTD RETURN VS SPY · ALL ACCOUNTS</span>
                    <span className="lookback-heading-side reflect-heading-side">
                        {error && <span className="lookback-error">{error}</span>}
                        {!error && updatedAt && !refreshing && (
                            <span className="reflect-updated">UPDATED {updatedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toUpperCase()}</span>
                        )}
                        <button type="button" className={`reflect-refresh ${refreshing ? 'is-busy' : ''}`} onClick={refresh} disabled={refreshing} aria-busy={refreshing}>
                            <span className="reflect-refresh-icon" aria-hidden="true">↻</span>
                            {refreshing ? 'REFRESHING…' : 'REFRESH'}
                        </button>
                    </span>
                </div>
                <div className="reflect-performance-body">
                    <div className="reflect-stats">
                        <div className={`reflect-stat ${tone(portfolioReturn)}`}>
                            <span className="reflect-stat-label">PORTFOLIO</span>
                            <span className="reflect-stat-value">{formatPercent(portfolioReturn)}</span>
                        </div>
                        <div className={`reflect-stat ${tone(spyReturn)}`}>
                            <span className="reflect-stat-label">SPY</span>
                            <span className="reflect-stat-value">{formatPercent(spyReturn)}</span>
                        </div>
                        {versusSpy !== null && (
                            <div className={`reflect-stat is-small ${tone(versusSpy)}`}>
                                <span className="reflect-stat-label">VS SPY</span>
                                <span className="reflect-stat-value">{`${versusSpy < 0 ? '−' : '+'}${Math.abs(versusSpy).toFixed(1)} PTS`}</span>
                            </div>
                        )}
                        {headline && Number.isFinite(headline.gain) && (
                            <div className={`reflect-stat is-small ${tone(headline.gain)}`}>
                                <span className="reflect-stat-label">YTD GAIN</span>
                                <span className="reflect-stat-value">{formatDollars(headline.gain)}</span>
                            </div>
                        )}
                    </div>
                    <div className="reflect-chart-row">
                        {points.length >= 2
                            ? <YtdChart points={points} />
                            : <div className="reflect-chart reflect-chart-empty">{waiting ? 'Loading performance…' : 'The YTD chart isn’t available right now.'}</div>}
                        {riskTiles.length > 0 && (
                            // Neutral on purpose: red/green is for gains and losses.
                            <div className="reflect-risk">
                                {riskTiles.map((tile) => (
                                    <div key={tile.label} className="reflect-risk-tile">
                                        <span className="reflect-risk-label">{tile.label}</span>
                                        <span className="reflect-risk-value">
                                            {tile.value}
                                            {tile.detail && <span className="reflect-risk-detail"> {tile.detail}</span>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="reflect-footnote">
                    {lastPoint && (
                        <span>
                            {headline ? 'PORTFOLIO AND YTD GAIN ARE THE RECONCILED HEADLINE FIGURES, AS ON DESKTOP · ' : ''}
                            CHART: TIME-WEIGHTED FROM DAILY CLOSES THROUGH {formatDay(lastPoint.date)}, ENDING {formatPercent(lastPoint.total)}
                            {risk?.firstDate && risk?.lastDate ? ` · RISK FROM DAILY CLOSES ${formatDay(risk.firstDate)} – ${formatDay(risk.lastDate)}` : ''}
                        </span>
                    )}
                    {trades?.status === 'ready' && <span>TRADES: {describeThrough(trades.through)}{estimatedShown ? ' · ≈ PLAID IS MISSING A TRADE, ESTIMATED' : ''}{pendingShown ? ' · TODAY PENDING: TODAY’S TRADES COUNT ONCE PLAID PUBLISHES THEM, USUALLY BY MORNING' : ''}</span>}
                </div>
            </div>
        </>
    )
}
