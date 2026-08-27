import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './FinnhubDiagnosticDashboard.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

const STORAGE_KEY = 'stock-stickies-finnhub-diagnostic-v8'
const PREVIOUS_STORAGE_KEY = 'stock-stickies-finnhub-diagnostic-v7'
const QUOTE_CACHE_KEY = 'stock-stickies-finnhub-diagnostic-quotes-v1'
const SUBSCRIPTION_CAP_KEY = 'stock-stickies-finnhub-subscription-cap-v1'
const MAX_SYMBOL_LENGTH = 24
const SUBSCRIPTION_PROBE_DELAY_MS = 350
const SNAPSHOT_INTERVAL_MS = 1250
const SUBSCRIPTION_CAP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const DASHBOARD_THEMES = [
    { id: 'mag7', label: 'MAG 7 STOCKS', symbols: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOG', 'META', 'TSLA'], priority: true },
    { id: 'drones', label: 'DRONE STOCKS', symbols: ['AVAV', 'KTOS', 'RCAT', 'UMAC', 'ONDS'] },
    { id: 'robotics', label: 'ROBOTICS', symbols: ['OUST', 'BOT', 'CCXI', 'RR', 'SERV'] },
    { id: 'market', label: 'INDEXES & MARKET DATA', symbols: ['SPY', 'IWM', 'QQQ', 'VIX', 'GLD', 'BTC', 'DGS30'], priority: true },
    { id: 'ai', label: 'AI TRADE', symbols: ['AMD', 'AVGO', 'VRT', 'NBIS', 'INTC', 'MU', 'PLTR', 'BOTZ', 'CRWD', 'PANW'] },
    { id: 'space', label: 'SPACE STOCKS', symbols: ['RKLB', 'ASTS', 'RDW', 'LUNR', 'PL', 'BKSY', 'SPCE'] },
    { id: 'financials', label: 'FINANCIALS', symbols: ['JPM', 'GS', 'BAC', 'COIN', 'HOOD'] },
    { id: 'nuclear', label: 'NUCLEAR', symbols: ['CCJ', 'CEG', 'VST', 'NEE', 'NLR', 'URNM'] },
    { id: 'energy', label: 'ENERGY', symbols: ['EXE', 'DVN', 'EQT', 'XOM', 'UNG', 'CVX'] },
    { id: 'other', label: 'OTHER', symbols: [] }
]

const THEME_BY_ID = Object.fromEntries(DASHBOARD_THEMES.map((theme) => [theme.id, theme]))
const themeHeaderId = (themeId) => `theme-heading-${themeId}`
const GRID_COLUMNS = { lg: 30, md: 24, sm: 18, xs: 12, xxs: 6 }
const CLUSTER_THEME_ORDER = ['mag7', 'drones', 'robotics', 'ai', 'space', 'market', 'financials', 'nuclear', 'energy', 'other']

const makeId = () => `quote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const cleanSymbol = (value) => String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9.\-:/^]/g, '')
    .slice(0, MAX_SYMBOL_LENGTH)

const providerSymbol = (symbol) => {
    const normalized = cleanSymbol(symbol)
    if (normalized === 'BTC' || normalized === 'BTCUSD') return 'BINANCE:BTCUSDT'
    return normalized
}

const isDailyMacroSymbol = (symbol) => providerSymbol(symbol) === 'DGS30'

const displaySymbol = (symbol) => {
    const normalized = cleanSymbol(symbol)
    return normalized === 'BINANCE:BTCUSDT' ? 'BTC' : normalized
}

const createDefaultWidgets = () => DASHBOARD_THEMES.flatMap((theme) => theme.symbols.map((symbol, index) => ({
    id: `diagnostic-${theme.id}-${index + 1}`,
    symbol,
    themeId: theme.id,
    priority: Boolean(theme.priority)
})))

const createGodelLayout = (widgets, totalColumns) => {
    const layout = []
    const clusterColumns = totalColumns >= 24 ? 3 : totalColumns >= 12 ? 2 : 1
    const clusterGap = 1
    const clusterWidth = Math.floor((totalColumns - clusterGap * (clusterColumns - 1)) / clusterColumns)
    const yByColumn = Array(clusterColumns).fill(0)

    CLUSTER_THEME_ORDER.forEach((themeId, themeIndex) => {
        const theme = THEME_BY_ID[themeId]
        const themedWidgets = widgets.filter((widget) => widget.themeId === theme.id)
        if (themedWidgets.length === 0) return
        const clusterColumn = themeIndex % clusterColumns
        const clusterX = clusterColumn * (clusterWidth + clusterGap)
        const clusterY = yByColumn[clusterColumn]
        const widgetColumns = clusterWidth >= 9 ? 3 : clusterWidth >= 6 ? 2 : 1
        const widgetWidth = Math.max(2, Math.floor(clusterWidth / widgetColumns))

        layout.push({ i: themeHeaderId(theme.id), x: clusterX, y: clusterY, w: clusterWidth, h: 1, static: true })
        themedWidgets.forEach((widget, index) => {
            const column = index % widgetColumns
            const row = Math.floor(index / widgetColumns)
            layout.push({
                i: widget.id,
                x: clusterX + column * widgetWidth,
                y: clusterY + 1 + row * 2,
                w: widgetWidth,
                h: 2,
                minW: 2,
                minH: 2,
                maxW: 8,
                maxH: 5
            })
        })
        yByColumn[clusterColumn] += 1 + Math.ceil(themedWidgets.length / widgetColumns) * 2 + 1
    })

    return layout
}

const createDashboardLayouts = (widgets) => Object.fromEntries(
    Object.entries(GRID_COLUMNS).map(([breakpoint, columns]) => [breakpoint, createGodelLayout(widgets, columns)])
)

const loadSavedDashboard = () => {
    const defaults = createDefaultWidgets()
    try {
        const currentSaved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
        const previousSaved = currentSaved ? null : JSON.parse(localStorage.getItem(PREVIOUS_STORAGE_KEY) || 'null')
        const saved = currentSaved || previousSaved
        const isPreviousVersion = Boolean(!currentSaved && previousSaved)
        if (!saved || !Array.isArray(saved.widgets) || saved.widgets.length === 0) {
            return { widgets: defaults, layouts: createDashboardLayouts(defaults) }
        }

        let widgets = saved.widgets
            .filter((widget) => widget && typeof widget.id === 'string' && cleanSymbol(widget.symbol))
            .map((widget) => ({
                id: widget.id,
                symbol: cleanSymbol(widget.symbol),
                themeId: THEME_BY_ID[widget.themeId] ? widget.themeId : 'other',
                priority: Boolean(widget.priority)
            }))
        if (isPreviousVersion) {
            const migrationSymbols = new Set(['OUST', 'BOT', 'CCXI', 'RR', 'SERV'])
            widgets = widgets.map((widget) => (
                migrationSymbols.has(providerSymbol(widget.symbol))
                    ? { ...widget, themeId: 'robotics' }
                    : widget
            ))
            const existingSymbols = new Set(widgets.map((widget) => providerSymbol(widget.symbol)))
            const newThemeWidgets = defaults.filter((widget) => (
                migrationSymbols.has(widget.symbol) && !existingSymbols.has(providerSymbol(widget.symbol))
            ))
            widgets = [...widgets, ...newThemeWidgets]
            return { widgets, layouts: createDashboardLayouts(widgets) }
        }
        if (widgets.length === 0) return { widgets: defaults, layouts: createDashboardLayouts(defaults) }

        const activeThemeIds = new Set(widgets.map((widget) => widget.themeId))
        const validIds = new Set([
            ...widgets.map((widget) => widget.id),
            ...[...activeThemeIds].map(themeHeaderId)
        ])
        const layouts = saved.layouts && typeof saved.layouts === 'object'
            ? Object.fromEntries(Object.entries(saved.layouts).map(([breakpoint, layout]) => [
                breakpoint,
                Array.isArray(layout) ? layout.filter((item) => validIds.has(item?.i)) : []
            ]))
            : createDashboardLayouts(widgets)

        const expectedLayoutItems = widgets.length + activeThemeIds.size
        if (!layouts.lg || layouts.lg.length !== expectedLayoutItems) return { widgets, layouts: createDashboardLayouts(widgets) }
        return { widgets, layouts }
    } catch {
        return { widgets: defaults, layouts: createDashboardLayouts(defaults) }
    }
}

const loadCachedQuotes = () => {
    const quotes = {}
    const addCachedPrice = (symbol, quote, cachedAt) => {
        const normalized = providerSymbol(symbol)
        const price = Number(quote?.price)
        if (!normalized || !Number.isFinite(price) || price <= 0) return
        quotes[normalized] = {
            price,
            previousClose: Number.isFinite(Number(quote?.previousClose)) ? Number(quote.previousClose) : undefined,
            change: Number.isFinite(Number(quote?.change)) ? Number(quote.change) : undefined,
            changePercent: Number.isFinite(Number(quote?.changePercent)) ? Number(quote.changePercent) : undefined,
            high: Number.isFinite(Number(quote?.high)) ? Number(quote.high) : undefined,
            low: Number.isFinite(Number(quote?.low)) ? Number(quote.low) : undefined,
            daily: Boolean(quote?.daily || isDailyMacroSymbol(normalized)),
            sourceDate: typeof quote?.sourceDate === 'string' ? quote.sourceDate : undefined,
            cachedAt: Number(cachedAt) || Date.now(),
            isFresh: false,
            events: 0
        }
    }

    try {
        const saved = JSON.parse(localStorage.getItem(QUOTE_CACHE_KEY) || 'null')
        Object.entries(saved?.quotes || {}).forEach(([symbol, quote]) => addCachedPrice(symbol, quote, saved.savedAt))
    } catch {
        // A malformed cache should never prevent the dashboard from opening.
    }

    try {
        const portfolioCache = JSON.parse(localStorage.getItem('portfolio_prices_cache') || 'null')
        Object.entries(portfolioCache?.prices || {}).forEach(([symbol, price]) => {
            const normalized = providerSymbol(symbol)
            if (!quotes[normalized]) addCachedPrice(symbol, { price }, portfolioCache.timestamp)
        })
    } catch {
        // Portfolio prices are an optional first-visit seed.
    }

    return quotes
}

const loadRememberedSubscriptionCap = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(SUBSCRIPTION_CAP_KEY) || 'null')
        const cap = Number(saved?.cap)
        const detectedAt = Number(saved?.detectedAt)
        if (Number.isInteger(cap) && cap > 0 && Date.now() - detectedAt < SUBSCRIPTION_CAP_MAX_AGE_MS) return cap
    } catch {
        // An invalid or expired result simply triggers a fresh one-time probe.
    }
    return null
}

const formatPrice = (value) => {
    if (!Number.isFinite(value)) return '—'
    if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (Math.abs(value) < 1) return value.toFixed(4)
    return value.toFixed(2)
}

const formatSigned = (value, digits = 2) => {
    if (!Number.isFinite(value)) return '—'
    return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
}

const QuoteWidget = React.memo(function QuoteWidget({ widget, quote, streamEnabled, editing, onBeginEdit, onCancelEdit, onSaveEdit, onTogglePriority, onRemove }) {
    const [draft, setDraft] = useState(widget.symbol)
    const price = quote?.price
    const change = quote?.change
    const changePercent = quote?.changePercent
    const direction = Number.isFinite(change) ? (change >= 0 ? 'up' : 'down') : 'flat'
    const isFresh = Boolean(quote?.isFresh)
    const isDaily = Boolean(quote?.daily || isDailyMacroSymbol(widget.symbol))
    const feedLabel = isDaily
        ? 'DAILY'
        : isFresh
        ? 'LIVE'
        : quote?.cachedAt
            ? 'LAST KNOWN'
        : streamEnabled
            ? (quote?.snapshotAt ? 'SNAPSHOT / STREAM' : 'STREAM READY')
            : (quote?.snapshotAt ? 'SNAPSHOT ONLY' : 'QUEUED')

    const save = () => {
        const next = cleanSymbol(draft)
        if (next) onSaveEdit(widget.id, next)
    }

    const beginEdit = () => {
        setDraft(widget.symbol)
        onBeginEdit(widget.id)
    }

    return (
        <div className={`finnhub-quote-widget quote-drag-handle quote-${direction}`}>
            <div className="quote-widget-topline">
                {editing ? (
                    <input
                        autoFocus
                        value={draft}
                        maxLength={MAX_SYMBOL_LENGTH}
                        onChange={(event) => setDraft(cleanSymbol(event.target.value))}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') save()
                            if (event.key === 'Escape') onCancelEdit()
                        }}
                        className="quote-symbol-input quote-action"
                        aria-label={`Edit ${displaySymbol(widget.symbol)} symbol`}
                    />
                ) : (
                    <button type="button" className="quote-symbol quote-action" onDoubleClick={beginEdit} title="Double-click to edit symbol">
                        {displaySymbol(widget.symbol)}
                    </button>
                )}
                <div className="quote-widget-actions quote-action">
                    {editing ? (<>
                        <button type="button" onClick={save} title="Save symbol" aria-label="Save symbol">✓</button>
                        <button type="button" onClick={onCancelEdit} title="Cancel editing" aria-label="Cancel editing">×</button>
                    </>) : (<>
                        <button type="button" onClick={beginEdit} title="Edit symbol" aria-label={`Edit ${displaySymbol(widget.symbol)}`}>✎</button>
                        <button type="button" onClick={() => onRemove(widget.id)} title="Remove widget" aria-label={`Remove ${displaySymbol(widget.symbol)}`}>×</button>
                    </>)}
                </div>
            </div>

            <div
                key={quote?.events || 'no-live-ticks'}
                className={`quote-widget-reading ${quote?.events ? 'quote-tick-blink' : ''}`}
            >
                <div className="quote-price">
                    {Number.isFinite(price) ? (isDaily ? `${formatPrice(price)}%` : `$${formatPrice(price)}`) : 'WAITING'}
                </div>
                <div className="quote-change">
                    {isDaily && Number.isFinite(change)
                        ? `${formatSigned(change * 100, 0)} BP${quote?.sourceDate ? ` · ${quote.sourceDate}` : ''}`
                        : Number.isFinite(changePercent) && Number.isFinite(change)
                        ? `${formatSigned(changePercent)}% ${formatSigned(change)}`
                        : quote?.cachedAt ? 'LAST SAVED PRICE' : quote?.error || 'NO PRINT YET'}
                </div>
            </div>

            <div className="quote-widget-footer">
                <span className="quote-widget-status">
                    {!isDaily && (
                        <button
                            type="button"
                            className={`quote-priority-toggle quote-action ${widget.priority ? 'is-priority' : ''}`}
                            onClick={() => onTogglePriority(widget.id)}
                            title={widget.priority ? 'Remove live-stream priority' : 'Prioritize for live streaming'}
                            aria-label={`${widget.priority ? 'Remove' : 'Add'} live-stream priority for ${displaySymbol(widget.symbol)}`}
                        >
                            {widget.priority ? '★' : '☆'}
                        </button>
                    )}
                    <span className={`quote-freshness ${isFresh ? 'is-live' : ''}`}>{feedLabel}</span>
                </span>
                <span>{quote?.events ? `${quote.events.toLocaleString()} ticks` : ''}</span>
            </div>
        </div>
    )
}, (previous, next) => (
    previous.widget === next.widget
    && previous.quote === next.quote
    && previous.streamEnabled === next.streamEnabled
    && previous.editing === next.editing
))

export default function FinnhubDiagnosticDashboard({ apiKey, fullScreen = false, onExit }) {
    const [initial] = useState(() => loadSavedDashboard())
    const [initialQuotes] = useState(() => loadCachedQuotes())
    const [initialSubscriptionCap] = useState(() => loadRememberedSubscriptionCap())
    const [widgets, setWidgets] = useState(initial.widgets)
    const [layouts, setLayouts] = useState(initial.layouts)
    const [connectionState, setConnectionState] = useState('disconnected')
    const [connectionError, setConnectionError] = useState('')
    const [socketEpoch, setSocketEpoch] = useState(0)
    const [quotes, setQuotes] = useState(initialQuotes)
    const [editingWidgetId, setEditingWidgetId] = useState(null)
    const [newSymbol, setNewSymbol] = useState('')
    const [newThemeId, setNewThemeId] = useState('other')
    const [addWidgetError, setAddWidgetError] = useState('')
    const [layoutLocked, setLayoutLocked] = useState(false)
    const [streamPaused, setStreamPaused] = useState(false)
    const [streamedSymbols, setStreamedSymbols] = useState([])
    const [subscriptionNotice, setSubscriptionNotice] = useState('')
    const [stats, setStats] = useState({ totalEvents: 0, eventsPerMinute: 0, eventsPerSecond: 0, liveSymbols: 0, peakPerSecond: 0 })

    const socketRef = useRef(null)
    const subscribedSymbolsRef = useRef(new Set())
    const quotesRef = useRef(initialQuotes)
    const totalEventsRef = useRef(0)
    const eventsThisSecondRef = useRef(0)
    const eventsHistoryRef = useRef([])
    const peakPerSecondRef = useRef(0)
    const pausedRef = useRef(false)
    const reconnectTimerRef = useRef(null)
    const snapshotRequestTimesRef = useRef({})
    const lastSnapshotRequestAtRef = useRef(0)
    const subscriptionTimerRef = useRef(null)
    const lastSubscriptionAttemptRef = useRef('')
    const subscriptionCapRef = useRef(initialSubscriptionCap)

    const symbolKey = useMemo(() => widgets.map((widget) => providerSymbol(widget.symbol)).sort().join('|'), [widgets])

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ widgets, layouts }))
    }, [widgets, layouts])

    useEffect(() => {
        pausedRef.current = streamPaused
    }, [streamPaused])

    useEffect(() => {
        if (!onExit) return undefined
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onExit()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onExit])

    useEffect(() => {
        const saveQuoteCache = () => {
            const cacheableQuotes = Object.fromEntries(Object.entries(quotesRef.current)
                .filter(([, quote]) => Number.isFinite(quote?.price) && quote.price > 0)
                .map(([symbol, quote]) => [symbol, {
                    price: quote.price,
                    previousClose: quote.previousClose,
                    change: quote.change,
                    changePercent: quote.changePercent,
                    high: quote.high,
                    low: quote.low,
                    daily: quote.daily,
                    sourceDate: quote.sourceDate
                }]))
            if (Object.keys(cacheableQuotes).length > 0) {
                localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), quotes: cacheableQuotes }))
            }
        }

        const timer = window.setInterval(saveQuoteCache, 10000)
        window.addEventListener('pagehide', saveQuoteCache)
        return () => {
            window.clearInterval(timer)
            window.removeEventListener('pagehide', saveQuoteCache)
            saveQuoteCache()
        }
    }, [])

    useEffect(() => {
        const timer = setInterval(() => {
            const now = Date.now()
            const thisSecond = eventsThisSecondRef.current
            eventsThisSecondRef.current = 0
            eventsHistoryRef.current = [...eventsHistoryRef.current.slice(-59), thisSecond]
            peakPerSecondRef.current = Math.max(peakPerSecondRef.current, thisSecond)
            const nextQuotes = Object.fromEntries(Object.entries(quotesRef.current).map(([symbol, quote]) => {
                const isFresh = Boolean(quote.lastEventAt && now - quote.lastEventAt < 5000)
                if (quote.isFresh === isFresh) return [symbol, quote]
                const nextQuote = { ...quote, isFresh }
                quotesRef.current[symbol] = nextQuote
                return [symbol, nextQuote]
            }))
            setQuotes(nextQuotes)
            setStats({
                totalEvents: totalEventsRef.current,
                eventsPerMinute: eventsHistoryRef.current.reduce((sum, count) => sum + count, 0),
                eventsPerSecond: thisSecond,
                liveSymbols: Object.values(nextQuotes).filter((quote) => quote.isFresh).length,
                peakPerSecond: peakPerSecondRef.current
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        const hasDgs30Widget = widgets.some((widget) => isDailyMacroSymbol(widget.symbol))
        if (!hasDgs30Widget) return undefined

        let active = true
        const controller = new AbortController()

        const loadThirtyYearYield = async () => {
            try {
                const response = await fetch('/api/treasury/dgs30', { signal: controller.signal })
                if (!response.ok) throw new Error('Treasury rate unavailable')
                const data = await response.json()
                const price = Number(data.value)
                const previousClose = data.previousValue === null ? Number.NaN : Number(data.previousValue)
                if (!active || !Number.isFinite(price)) return
                const previous = quotesRef.current.DGS30 || {}
                const change = Number.isFinite(previousClose) ? price - previousClose : undefined
                const nextQuote = {
                    ...previous,
                    price,
                    previousClose: Number.isFinite(previousClose) ? previousClose : undefined,
                    change,
                    changePercent: Number.isFinite(change) && previousClose !== 0 ? (change / previousClose) * 100 : undefined,
                    daily: true,
                    sourceDate: data.date,
                    cachedAt: null,
                    snapshotAt: Date.now(),
                    error: null
                }
                quotesRef.current.DGS30 = nextQuote
                setQuotes((current) => ({ ...current, DGS30: nextQuote }))
            } catch (error) {
                if (!active || error?.name === 'AbortError') return
                const previous = quotesRef.current.DGS30 || {}
                const nextQuote = { ...previous, daily: true, error: 'DAILY RATE UNAVAILABLE' }
                quotesRef.current.DGS30 = nextQuote
                setQuotes((current) => ({ ...current, DGS30: nextQuote }))
            }
        }

        loadThirtyYearYield()
        const refreshTimer = window.setInterval(loadThirtyYearYield, 4 * 60 * 60 * 1000)
        return () => {
            active = false
            controller.abort()
            window.clearInterval(refreshTimer)
        }
    }, [symbolKey, widgets])

    useEffect(() => {
        let active = true
        if (!apiKey) {
            return undefined
        }

        const connect = () => {
            if (!active) return
            setConnectionState('connecting')
            setConnectionError('')
            setSubscriptionNotice('')
            setStreamedSymbols([])
            subscribedSymbolsRef.current = new Set()
            subscriptionCapRef.current = loadRememberedSubscriptionCap()
            lastSubscriptionAttemptRef.current = ''
            if (subscriptionTimerRef.current) clearTimeout(subscriptionTimerRef.current)
            const socket = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(apiKey)}`)
            socketRef.current = socket

            socket.onopen = () => {
                if (!active) return
                setConnectionState('connected')
                setSocketEpoch((current) => current + 1)
            }

            socket.onmessage = (event) => {
                if (!active) return
                try {
                    const message = JSON.parse(event.data)
                    if (message.type === 'error') {
                        const providerMessage = message.msg || 'Finnhub stream error'
                        if (/too many symbols/i.test(providerMessage)) {
                            if (subscriptionTimerRef.current) clearTimeout(subscriptionTimerRef.current)
                            const rejectedSymbol = lastSubscriptionAttemptRef.current
                            if (rejectedSymbol) subscribedSymbolsRef.current.delete(rejectedSymbol)
                            const accepted = [...subscribedSymbolsRef.current]
                            subscriptionCapRef.current = accepted.length
                            localStorage.setItem(SUBSCRIPTION_CAP_KEY, JSON.stringify({ cap: accepted.length, detectedAt: Date.now() }))
                            setStreamedSymbols(accepted)
                            setSubscriptionNotice(`Finnhub accepted ${accepted.length} simultaneous symbols on this API key. The remaining widgets will continue with paced snapshots.`)
                            setConnectionError('')
                        } else {
                            setConnectionError(providerMessage)
                        }
                        return
                    }
                    if (message.type !== 'trade' || !Array.isArray(message.data)) return
                    if (pausedRef.current) return

                    message.data.forEach((trade) => {
                        const symbol = cleanSymbol(trade.s)
                        const price = Number(trade.p)
                        if (!symbol || !Number.isFinite(price)) return
                        const previous = quotesRef.current[symbol] || {}
                        const previousClose = previous.previousClose
                        const change = Number.isFinite(previousClose) && previousClose !== 0 ? price - previousClose : previous.change
                        const changePercent = Number.isFinite(previousClose) && previousClose !== 0 ? (change / previousClose) * 100 : previous.changePercent
                        quotesRef.current[symbol] = {
                            ...previous,
                            price,
                            change,
                            changePercent,
                            cachedAt: null,
                            lastEventAt: Date.now(),
                            providerTimestamp: Number(trade.t) || null,
                            events: (previous.events || 0) + 1
                        }
                        totalEventsRef.current += 1
                        eventsThisSecondRef.current += 1
                    })
                } catch {
                    setConnectionError('Received an unreadable Finnhub message')
                }
            }

            socket.onerror = () => {
                if (active) setConnectionError('Finnhub WebSocket connection error')
            }
            socket.onclose = () => {
                if (!active) return
                socketRef.current = null
                subscribedSymbolsRef.current = new Set()
                setStreamedSymbols([])
                setConnectionState('reconnecting')
                reconnectTimerRef.current = setTimeout(connect, 3000)
            }
        }

        connect()
        return () => {
            active = false
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
            if (subscriptionTimerRef.current) clearTimeout(subscriptionTimerRef.current)
            const socket = socketRef.current
            socketRef.current = null
            if (socket) socket.close()
            subscribedSymbolsRef.current = new Set()
            lastSubscriptionAttemptRef.current = ''
        }
    }, [apiKey])

    useEffect(() => {
        const socket = socketRef.current
        if (!socket || socket.readyState !== WebSocket.OPEN) return
        const orderedSymbols = []
        const seenSymbols = new Set()
        const streamableWidgets = widgets.filter((widget) => !isDailyMacroSymbol(widget.symbol))
        const orderedWidgets = [...streamableWidgets.filter((widget) => widget.priority), ...streamableWidgets.filter((widget) => !widget.priority)]
        orderedWidgets.forEach((widget) => {
            const symbol = providerSymbol(widget.symbol)
            if (symbol && !seenSymbols.has(symbol)) {
                seenSymbols.add(symbol)
                orderedSymbols.push(symbol)
            }
        })
        const wanted = new Set(orderedSymbols)
        const subscribed = subscribedSymbolsRef.current
        const knownCap = subscriptionCapRef.current
        const desiredSymbols = knownCap === null ? orderedSymbols : orderedSymbols.slice(0, knownCap)
        const desired = new Set(desiredSymbols)

        if (subscriptionTimerRef.current) clearTimeout(subscriptionTimerRef.current)

        subscribed.forEach((symbol) => {
            if (!desired.has(symbol)) {
                socket.send(JSON.stringify({ type: 'unsubscribe', symbol }))
                subscribed.delete(symbol)
            }
        })
        setStreamedSymbols([...subscribed])

        const queue = desiredSymbols.filter((symbol) => !subscribed.has(symbol))

        if (knownCap !== null) {
            const snapshotOnlyCount = Math.max(0, wanted.size - desired.size)
            setSubscriptionNotice(snapshotOnlyCount
                ? `Finnhub accepted ${knownCap} simultaneous symbols on this API key. ${snapshotOnlyCount} widget${snapshotOnlyCount === 1 ? '' : 's'} will use paced snapshots.`
                : '')

            queue.forEach((symbol) => {
                lastSubscriptionAttemptRef.current = symbol
                socket.send(JSON.stringify({ type: 'subscribe', symbol }))
                subscribed.add(symbol)
            })
            setStreamedSymbols([...subscribed])
            return undefined
        }

        const subscribeNext = () => {
            if (queue.length === 0 || socket.readyState !== WebSocket.OPEN) return
            const symbol = queue.shift()
            lastSubscriptionAttemptRef.current = symbol
            socket.send(JSON.stringify({ type: 'subscribe', symbol }))
            subscribed.add(symbol)
            setStreamedSymbols([...subscribed])
            subscriptionTimerRef.current = setTimeout(subscribeNext, SUBSCRIPTION_PROBE_DELAY_MS)
        }
        subscribeNext()

        return () => {
            if (subscriptionTimerRef.current) clearTimeout(subscriptionTimerRef.current)
        }
    }, [symbolKey, socketEpoch, widgets])

    useEffect(() => {
        if (!apiKey) return undefined
        const controller = new AbortController()
        const targets = [...new Set(widgets
            .filter((widget) => !isDailyMacroSymbol(widget.symbol))
            .map((widget) => providerSymbol(widget.symbol))
            .filter((symbol) => symbol && !symbol.includes(':')))]
        const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

        const loadSnapshots = async () => {
            while (!controller.signal.aborted) {
                const now = Date.now()
                const eligible = targets.filter((symbol) => {
                    const quote = quotesRef.current[symbol] || {}
                    const hasPrice = Number.isFinite(quote.price) && quote.price > 0
                    const hasBaseline = Number.isFinite(quote.previousClose) && quote.previousClose > 0
                    const needsInitialData = !hasPrice || !hasBaseline
                    const attemptedAt = snapshotRequestTimesRef.current[symbol] || 0
                    if (needsInitialData && now - attemptedAt < 60000) return false
                    return needsInitialData || !subscribedSymbolsRef.current.has(symbol)
                }).sort((a, b) => {
                    const aHasPrice = Number.isFinite(quotesRef.current[a]?.price) && quotesRef.current[a].price > 0
                    const bHasPrice = Number.isFinite(quotesRef.current[b]?.price) && quotesRef.current[b].price > 0
                    if (aHasPrice !== bHasPrice) return aHasPrice ? 1 : -1
                    return (snapshotRequestTimesRef.current[a] || 0) - (snapshotRequestTimesRef.current[b] || 0)
                })

                if (eligible.length === 0) {
                    await wait(1000)
                    continue
                }

                const rateLimitDelay = Math.max(0, SNAPSHOT_INTERVAL_MS - (Date.now() - lastSnapshotRequestAtRef.current))
                if (rateLimitDelay) await wait(rateLimitDelay)
                if (controller.signal.aborted) return

                const symbol = eligible[0]
                snapshotRequestTimesRef.current[symbol] = Date.now()
                lastSnapshotRequestAtRef.current = Date.now()
                try {
                    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`, { signal: controller.signal })
                    if (response.ok) {
                        const data = await response.json()
                        const price = Number(data.c)
                        const previousClose = Number(data.pc)
                        const validPrice = Number.isFinite(price) && price > 0
                        const validPreviousClose = Number.isFinite(previousClose) && previousClose > 0
                        if (validPrice || validPreviousClose) {
                            const previous = quotesRef.current[symbol] || {}
                            quotesRef.current[symbol] = {
                                ...previous,
                                price: validPrice ? price : previous.price,
                                previousClose: validPreviousClose ? previousClose : previous.previousClose,
                                change: Number.isFinite(Number(data.d)) ? Number(data.d) : previous.change,
                                changePercent: Number.isFinite(Number(data.dp)) ? Number(data.dp) : previous.changePercent,
                                high: Number(data.h) || null,
                                low: Number(data.l) || null,
                                cachedAt: null,
                                snapshotAt: Date.now()
                            }
                        }
                    }
                } catch (error) {
                    if (error?.name === 'AbortError') return
                }
            }
        }

        loadSnapshots()
        return () => controller.abort()
    }, [apiKey, symbolKey, widgets])

    const addWidget = () => {
        const symbol = cleanSymbol(newSymbol)
        if (!symbol) {
            setAddWidgetError('Enter a symbol first.')
            return
        }
        const themeId = THEME_BY_ID[newThemeId] ? newThemeId : 'other'
        const widget = { id: makeId(), symbol, themeId, priority: false }
        setWidgets((current) => [...current, widget])
        setLayouts(createDashboardLayouts([...widgets, widget]))
        setNewSymbol('')
        setAddWidgetError('')
    }

    const removeWidget = (widgetId) => {
        const removedWidget = widgets.find((widget) => widget.id === widgetId)
        const removesTheme = removedWidget && widgets.filter((widget) => widget.themeId === removedWidget.themeId).length === 1
        setWidgets((current) => current.filter((widget) => widget.id !== widgetId))
        setLayouts((current) => Object.fromEntries(
            Object.entries(current).map(([breakpoint, layout]) => [breakpoint, layout.filter((item) => (
                item.i !== widgetId && (!removesTheme || item.i !== themeHeaderId(removedWidget.themeId))
            ))])
        ))
        if (editingWidgetId === widgetId) setEditingWidgetId(null)
    }

    const saveWidgetSymbol = (widgetId, symbol) => {
        setWidgets((current) => current.map((widget) => widget.id === widgetId ? { ...widget, symbol } : widget))
        setEditingWidgetId(null)
    }

    const toggleWidgetPriority = (widgetId) => {
        setWidgets((current) => current.map((widget) => (
            widget.id === widgetId ? { ...widget, priority: !widget.priority } : widget
        )))
    }

    const resetDashboard = () => {
        const nextWidgets = createDefaultWidgets()
        setWidgets(nextWidgets)
        setLayouts(createDashboardLayouts(nextWidgets))
        setEditingWidgetId(null)
    }

    const displayedConnectionState = apiKey ? connectionState : 'missing-key'
    const connectedClass = displayedConnectionState === 'connected' ? 'connected' : displayedConnectionState === 'connecting' || displayedConnectionState === 'reconnecting' ? 'connecting' : 'disconnected'
    const streamedSymbolSet = useMemo(() => new Set(streamedSymbols), [streamedSymbols])
    const uniqueSymbolCount = useMemo(() => new Set(widgets
        .filter((widget) => !isDailyMacroSymbol(widget.symbol))
        .map((widget) => providerSymbol(widget.symbol))
        .filter(Boolean)).size, [widgets])
    const activeThemeIds = useMemo(() => new Set(widgets.map((widget) => widget.themeId)), [widgets])

    return (
        <section className={`finnhub-diagnostic-shell ${fullScreen ? 'is-fullscreen' : ''}`}>
            <header className="finnhub-diagnostic-toolbar">
                <div className="diagnostic-brand">
                    <div className="diagnostic-kicker">FINNHUB // STREAM DIAGNOSTIC</div>
                    <div className="diagnostic-title">STOCK STICKIES TERMINAL</div>
                </div>

                <div className="diagnostic-stats">
                    <div><span>WIDGETS</span><strong>{widgets.length}</strong></div>
                    <div><span>STREAMED</span><strong>{streamedSymbols.length}/{uniqueSymbolCount}</strong></div>
                    <div><span>LIVE ≤5S</span><strong>{stats.liveSymbols}</strong></div>
                    <div><span>EVENTS/MIN</span><strong>{stats.eventsPerMinute.toLocaleString()}</strong></div>
                    <div><span>EVENTS/SEC</span><strong>{stats.eventsPerSecond.toLocaleString()}</strong></div>
                    <div><span>PEAK/SEC</span><strong>{stats.peakPerSecond.toLocaleString()}</strong></div>
                    <div><span>TOTAL</span><strong>{stats.totalEvents.toLocaleString()}</strong></div>
                </div>

                <div className="diagnostic-connection">
                    <span className={`connection-light ${connectedClass}`} />
                    <span>{displayedConnectionState.replace('-', ' ').toUpperCase()}</span>
                </div>
                {onExit && (
                    <button
                        type="button"
                        className="diagnostic-exit"
                        onClick={onExit}
                        title="Return to Stock Stickies"
                        aria-label="Close Live Dashboard and return to Stock Stickies"
                    >
                        ×
                    </button>
                )}
            </header>

            <div className="finnhub-diagnostic-controls">
                <div className="diagnostic-add-control">
                    <input
                        value={newSymbol}
                        maxLength={MAX_SYMBOL_LENGTH}
                        onChange={(event) => {
                            setNewSymbol(cleanSymbol(event.target.value))
                            if (addWidgetError) setAddWidgetError('')
                        }}
                        onKeyDown={(event) => event.key === 'Enter' && addWidget()}
                        placeholder="SYMBOL"
                        aria-label="Symbol for new diagnostic widget"
                        aria-invalid={Boolean(addWidgetError)}
                        aria-describedby={addWidgetError ? 'diagnostic-add-error' : undefined}
                        className={addWidgetError ? 'has-error' : ''}
                    />
                    <select value={newThemeId} onChange={(event) => setNewThemeId(event.target.value)} aria-label="Theme for new diagnostic widget">
                        {DASHBOARD_THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
                    </select>
                    <button type="button" onClick={addWidget}>+ ADD WIDGET</button>
                    {addWidgetError && <span id="diagnostic-add-error" className="diagnostic-add-error" role="alert">{addWidgetError}</span>}
                </div>
                <div className="diagnostic-control-buttons">
                    <button type="button" className={streamPaused ? 'is-active' : ''} onClick={() => setStreamPaused((current) => !current)}>{streamPaused ? '▶ RESUME' : 'Ⅱ PAUSE'}</button>
                    <button type="button" className={layoutLocked ? 'is-active' : ''} onClick={() => setLayoutLocked((current) => !current)}>{layoutLocked ? 'UNLOCK LAYOUT' : 'LOCK LAYOUT'}</button>
                    <button type="button" onClick={resetDashboard}>RESET GROUPS</button>
                </div>
            </div>

            {!apiKey && (
                <div className="diagnostic-alert">Add your Finnhub API key in the Stock Stickies header to start the diagnostic stream.</div>
            )}
            {connectionError && <div className="diagnostic-alert diagnostic-alert-error">{connectionError}</div>}
            {subscriptionNotice && <div className="diagnostic-alert diagnostic-alert-cap">{subscriptionNotice}</div>}

            <div className="finnhub-grid-canvas">
                <ResponsiveGridLayout
                    className="finnhub-responsive-grid"
                    layouts={layouts}
                    breakpoints={{ lg: 1400, md: 1050, sm: 760, xs: 480, xxs: 0 }}
                    cols={GRID_COLUMNS}
                    rowHeight={27}
                    margin={[6, 6]}
                    containerPadding={[6, 6]}
                    compactType={null}
                    preventCollision={false}
                    isDraggable={!layoutLocked}
                    isResizable={!layoutLocked}
                    draggableHandle=".quote-drag-handle"
                    draggableCancel=".quote-action"
                    resizeHandles={['se', 'sw']}
                    onLayoutChange={(_layout, nextLayouts) => setLayouts(nextLayouts)}
                >
                    {DASHBOARD_THEMES.filter((theme) => activeThemeIds.has(theme.id)).map((theme) => (
                        <div key={themeHeaderId(theme.id)} className="diagnostic-theme-heading">
                            <span>{theme.label}</span>
                            <span>{widgets.filter((widget) => widget.themeId === theme.id).length}</span>
                        </div>
                    ))}
                    {widgets.map((widget) => (
                        <div key={widget.id}>
                            <QuoteWidget
                                widget={widget}
                                quote={quotes[providerSymbol(widget.symbol)]}
                                streamEnabled={streamedSymbolSet.has(providerSymbol(widget.symbol))}
                                editing={editingWidgetId === widget.id}
                                onBeginEdit={setEditingWidgetId}
                                onCancelEdit={() => setEditingWidgetId(null)}
                                onSaveEdit={saveWidgetSymbol}
                                onTogglePriority={toggleWidgetPriority}
                                onRemove={removeWidget}
                            />
                        </div>
                    ))}
                </ResponsiveGridLayout>
            </div>

            <footer className="finnhub-diagnostic-footer">
                <span>★ PRIORITIZES A SYMBOL FOR LIVE STREAMING</span>
                <span>DRAG ANY TILE · RESIZE FROM LOWER CORNERS</span>
                <span>SNAPSHOT-ONLY TILES ROTATE AT 48/MIN · LIVE TICKS USE ONE WEBSOCKET</span>
            </footer>
        </section>
    )
}
