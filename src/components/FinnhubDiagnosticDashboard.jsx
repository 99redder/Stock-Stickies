import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './FinnhubDiagnosticDashboard.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

const STORAGE_KEY = 'stock-stickies-finnhub-diagnostic-v1'
const MAX_SYMBOL_LENGTH = 24

const DEFAULT_SYMBOLS = [
    'AMZN', 'GOOG', 'TSLA', 'META', 'AAPL', 'NVDA',
    'MSFT', 'AVGO', 'NFLX', 'AMD', 'RTX', 'LMT',
    'LDOS', 'NOC', 'MOG.A', 'UMAC', 'AVAV', 'SPCX',
    'RKLB', 'ASTS', 'RDW', 'VRT', 'NBIS', 'INTC',
    'MU', 'PFE', 'EXE', 'DVN', 'EQT', 'XOM',
    'UNG', 'CVX', 'CCJ', 'CEG', 'VST', 'NEE',
    'WM', 'OUST', 'BOTZ', 'KWEB', 'BABA', 'PLTR',
    'CRWD', 'PANW', 'JPM', 'GS', 'BAC', 'COIN',
    'SPY', 'QQQ', 'IWM', 'DIA', 'GLD', 'TLT',
    'VIX', 'BTC', 'ONDS', 'LPTH', 'KTOS', 'US30Y'
]

const ROW_PATTERNS = [
    [4, 4, 4, 4, 4, 4],
    [3, 3, 4, 4, 3, 3],
    [3, 3, 3, 3, 3, 3, 3],
    [5, 4, 4, 4, 4],
    [3, 3, 3, 3, 3, 3],
    [4, 4, 4, 4, 4, 4]
]

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

const displaySymbol = (symbol) => {
    const normalized = cleanSymbol(symbol)
    return normalized === 'BINANCE:BTCUSDT' ? 'BTC' : normalized
}

const createDefaultWidgets = () => DEFAULT_SYMBOLS.map((symbol, index) => ({
    id: `diagnostic-${index + 1}`,
    symbol
}))

const createGodelLayout = (widgets) => {
    const layout = []
    let widgetIndex = 0
    let rowIndex = 0
    let y = 0

    while (widgetIndex < widgets.length) {
        const pattern = ROW_PATTERNS[rowIndex % ROW_PATTERNS.length]
        const widths = pattern.slice(0, Math.min(pattern.length, widgets.length - widgetIndex))
        const totalWidth = widths.reduce((sum, width) => sum + width, 0)
        let x = Math.max(0, Math.floor((24 - totalWidth) / 2))
        const rowHeight = rowIndex % 4 === 3 ? 3 : 2

        widths.forEach((width) => {
            const widget = widgets[widgetIndex]
            layout.push({
                i: widget.id,
                x,
                y,
                w: width,
                h: rowHeight,
                minW: 2,
                minH: 2,
                maxW: 10,
                maxH: 6
            })
            x += width
            widgetIndex += 1
        })

        y += rowHeight + 1
        rowIndex += 1
    }

    return layout
}

const loadSavedDashboard = () => {
    const defaults = createDefaultWidgets()
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
        if (!saved || !Array.isArray(saved.widgets) || saved.widgets.length === 0) {
            return { widgets: defaults, layouts: { lg: createGodelLayout(defaults) } }
        }

        const widgets = saved.widgets
            .filter((widget) => widget && typeof widget.id === 'string' && cleanSymbol(widget.symbol))
            .map((widget) => ({ id: widget.id, symbol: cleanSymbol(widget.symbol) }))
        if (widgets.length === 0) return { widgets: defaults, layouts: { lg: createGodelLayout(defaults) } }

        const validIds = new Set(widgets.map((widget) => widget.id))
        const layouts = saved.layouts && typeof saved.layouts === 'object'
            ? Object.fromEntries(Object.entries(saved.layouts).map(([breakpoint, layout]) => [
                breakpoint,
                Array.isArray(layout) ? layout.filter((item) => validIds.has(item?.i)) : []
            ]))
            : { lg: createGodelLayout(widgets) }

        if (!layouts.lg || layouts.lg.length !== widgets.length) layouts.lg = createGodelLayout(widgets)
        return { widgets, layouts }
    } catch {
        return { widgets: defaults, layouts: { lg: createGodelLayout(defaults) } }
    }
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

const QuoteWidget = ({ widget, quote, measuredAt, editing, onBeginEdit, onCancelEdit, onSaveEdit, onRemove }) => {
    const [draft, setDraft] = useState(widget.symbol)
    const price = quote?.price
    const change = quote?.change
    const changePercent = quote?.changePercent
    const direction = Number.isFinite(change) ? (change >= 0 ? 'up' : 'down') : 'flat'
    const isFresh = quote?.lastEventAt && measuredAt - quote.lastEventAt < 5000
    const isFlashing = quote?.lastDirectionAt && measuredAt - quote.lastDirectionAt < 1500

    const save = () => {
        const next = cleanSymbol(draft)
        if (next) onSaveEdit(widget.id, next)
    }

    const beginEdit = () => {
        setDraft(widget.symbol)
        onBeginEdit(widget.id)
    }

    return (
        <div className={`finnhub-quote-widget quote-drag-handle quote-${direction} ${isFlashing ? `quote-flash-${quote.lastDirection}` : ''}`}>
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

            <div className="quote-widget-reading">
                <div className="quote-price">{Number.isFinite(price) ? `$${formatPrice(price)}` : 'WAITING'}</div>
                <div className="quote-change">
                    {Number.isFinite(changePercent) && Number.isFinite(change)
                        ? `${formatSigned(changePercent)}% ${formatSigned(change)}`
                        : quote?.error || 'NO PRINT YET'}
                </div>
            </div>

            <div className="quote-widget-footer">
                <span className={`quote-freshness ${isFresh ? 'is-live' : ''}`}>{isFresh ? 'LIVE' : quote?.snapshotAt ? 'SNAPSHOT' : 'PENDING'}</span>
                <span>{quote?.events ? `${quote.events.toLocaleString()} ticks` : ''}</span>
            </div>
        </div>
    )
}

export default function FinnhubDiagnosticDashboard({ apiKey }) {
    const [initial] = useState(() => loadSavedDashboard())
    const [widgets, setWidgets] = useState(initial.widgets)
    const [layouts, setLayouts] = useState(initial.layouts)
    const [connectionState, setConnectionState] = useState('disconnected')
    const [connectionError, setConnectionError] = useState('')
    const [socketEpoch, setSocketEpoch] = useState(0)
    const [quotes, setQuotes] = useState({})
    const [editingWidgetId, setEditingWidgetId] = useState(null)
    const [newSymbol, setNewSymbol] = useState('')
    const [layoutLocked, setLayoutLocked] = useState(false)
    const [streamPaused, setStreamPaused] = useState(false)
    const [stats, setStats] = useState({ totalEvents: 0, eventsPerMinute: 0, eventsPerSecond: 0, liveSymbols: 0, peakPerSecond: 0, measuredAt: 0 })

    const socketRef = useRef(null)
    const subscribedSymbolsRef = useRef(new Set())
    const quotesRef = useRef({})
    const totalEventsRef = useRef(0)
    const eventsThisSecondRef = useRef(0)
    const eventsHistoryRef = useRef([])
    const peakPerSecondRef = useRef(0)
    const pausedRef = useRef(false)
    const reconnectTimerRef = useRef(null)
    const snapshotLoadedRef = useRef(new Set())

    const symbolKey = useMemo(() => widgets.map((widget) => providerSymbol(widget.symbol)).sort().join('|'), [widgets])

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ widgets, layouts }))
    }, [widgets, layouts])

    useEffect(() => {
        pausedRef.current = streamPaused
    }, [streamPaused])

    useEffect(() => {
        const timer = setInterval(() => {
            const now = Date.now()
            const thisSecond = eventsThisSecondRef.current
            eventsThisSecondRef.current = 0
            eventsHistoryRef.current = [...eventsHistoryRef.current.slice(-59), thisSecond]
            peakPerSecondRef.current = Math.max(peakPerSecondRef.current, thisSecond)
            const nextQuotes = { ...quotesRef.current }
            setQuotes(nextQuotes)
            setStats({
                totalEvents: totalEventsRef.current,
                eventsPerMinute: eventsHistoryRef.current.reduce((sum, count) => sum + count, 0),
                eventsPerSecond: thisSecond,
                liveSymbols: Object.values(nextQuotes).filter((quote) => quote.lastEventAt && now - quote.lastEventAt < 5000).length,
                peakPerSecond: peakPerSecondRef.current,
                measuredAt: now
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        let active = true
        if (!apiKey) {
            return undefined
        }

        const connect = () => {
            if (!active) return
            setConnectionState('connecting')
            setConnectionError('')
            subscribedSymbolsRef.current = new Set()
            const socket = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(apiKey)}`)
            socketRef.current = socket

            socket.onopen = () => {
                if (!active) return
                setConnectionState('connected')
                setSocketEpoch((current) => current + 1)
            }

            socket.onmessage = (event) => {
                if (!active || pausedRef.current) return
                try {
                    const message = JSON.parse(event.data)
                    if (message.type === 'error') {
                        setConnectionError(message.msg || 'Finnhub stream error')
                        return
                    }
                    if (message.type !== 'trade' || !Array.isArray(message.data)) return

                    message.data.forEach((trade) => {
                        const symbol = cleanSymbol(trade.s)
                        const price = Number(trade.p)
                        if (!symbol || !Number.isFinite(price)) return
                        const previous = quotesRef.current[symbol] || {}
                        const previousPrice = previous.price
                        const previousClose = previous.previousClose
                        const change = Number.isFinite(previousClose) && previousClose !== 0 ? price - previousClose : previous.change
                        const changePercent = Number.isFinite(previousClose) && previousClose !== 0 ? (change / previousClose) * 100 : previous.changePercent
                        const lastDirection = Number.isFinite(previousPrice) && price !== previousPrice
                            ? (price > previousPrice ? 'up' : 'down')
                            : previous.lastDirection
                        quotesRef.current[symbol] = {
                            ...previous,
                            price,
                            change,
                            changePercent,
                            lastEventAt: Date.now(),
                            providerTimestamp: Number(trade.t) || null,
                            events: (previous.events || 0) + 1,
                            lastDirection,
                            lastDirectionAt: price !== previousPrice ? Date.now() : previous.lastDirectionAt
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
                setConnectionState('reconnecting')
                reconnectTimerRef.current = setTimeout(connect, 3000)
            }
        }

        connect()
        return () => {
            active = false
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
            const socket = socketRef.current
            socketRef.current = null
            if (socket) socket.close()
            subscribedSymbolsRef.current = new Set()
        }
    }, [apiKey])

    useEffect(() => {
        const socket = socketRef.current
        if (!socket || socket.readyState !== WebSocket.OPEN) return
        const wanted = new Set(widgets.map((widget) => providerSymbol(widget.symbol)).filter(Boolean))
        const subscribed = subscribedSymbolsRef.current

        subscribed.forEach((symbol) => {
            if (!wanted.has(symbol)) {
                socket.send(JSON.stringify({ type: 'unsubscribe', symbol }))
                subscribed.delete(symbol)
            }
        })
        wanted.forEach((symbol) => {
            if (!subscribed.has(symbol)) {
                socket.send(JSON.stringify({ type: 'subscribe', symbol }))
                subscribed.add(symbol)
            }
        })
    }, [symbolKey, socketEpoch, widgets])

    useEffect(() => {
        if (!apiKey) return undefined
        const controller = new AbortController()
        const targets = [...new Set(widgets.map((widget) => providerSymbol(widget.symbol)).filter((symbol) => symbol && !symbol.includes(':')))]
            .filter((symbol) => !snapshotLoadedRef.current.has(symbol))

        const loadSnapshots = async () => {
            for (const symbol of targets) {
                if (controller.signal.aborted) return
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
                                price: Number.isFinite(previous.price) ? previous.price : (validPrice ? price : previous.price),
                                previousClose: validPreviousClose ? previousClose : previous.previousClose,
                                change: Number.isFinite(Number(data.d)) ? Number(data.d) : previous.change,
                                changePercent: Number.isFinite(Number(data.dp)) ? Number(data.dp) : previous.changePercent,
                                high: Number(data.h) || null,
                                low: Number(data.l) || null,
                                snapshotAt: Date.now()
                            }
                        }
                    }
                } catch (error) {
                    if (error?.name === 'AbortError') return
                }
                snapshotLoadedRef.current.add(symbol)
                await new Promise((resolve) => setTimeout(resolve, 1250))
            }
        }

        loadSnapshots()
        return () => controller.abort()
    }, [apiKey, symbolKey, widgets])

    const addWidget = () => {
        const symbol = cleanSymbol(newSymbol)
        if (!symbol) return
        const widget = { id: makeId(), symbol }
        setWidgets((current) => [...current, widget])
        setLayouts((current) => {
            const next = { ...current }
            Object.keys(next).forEach((breakpoint) => {
                next[breakpoint] = [...next[breakpoint], { i: widget.id, x: 0, y: 9999, w: 4, h: 2, minW: 2, minH: 2, maxW: 10, maxH: 6 }]
            })
            if (!next.lg) next.lg = [{ i: widget.id, x: 0, y: 9999, w: 4, h: 2, minW: 2, minH: 2, maxW: 10, maxH: 6 }]
            return next
        })
        setNewSymbol('')
    }

    const removeWidget = (widgetId) => {
        setWidgets((current) => current.filter((widget) => widget.id !== widgetId))
        setLayouts((current) => Object.fromEntries(
            Object.entries(current).map(([breakpoint, layout]) => [breakpoint, layout.filter((item) => item.i !== widgetId)])
        ))
        if (editingWidgetId === widgetId) setEditingWidgetId(null)
    }

    const saveWidgetSymbol = (widgetId, symbol) => {
        setWidgets((current) => current.map((widget) => widget.id === widgetId ? { ...widget, symbol } : widget))
        setEditingWidgetId(null)
    }

    const resetDashboard = () => {
        const nextWidgets = createDefaultWidgets()
        setWidgets(nextWidgets)
        setLayouts({ lg: createGodelLayout(nextWidgets) })
        setEditingWidgetId(null)
    }

    const displayedConnectionState = apiKey ? connectionState : 'missing-key'
    const connectedClass = displayedConnectionState === 'connected' ? 'connected' : displayedConnectionState === 'connecting' || displayedConnectionState === 'reconnecting' ? 'connecting' : 'disconnected'

    return (
        <section className="finnhub-diagnostic-shell">
            <header className="finnhub-diagnostic-toolbar">
                <div className="diagnostic-brand">
                    <div className="diagnostic-kicker">FINNHUB // STREAM DIAGNOSTIC</div>
                    <div className="diagnostic-title">STOCK STICKIES TERMINAL</div>
                </div>

                <div className="diagnostic-stats">
                    <div><span>WIDGETS</span><strong>{widgets.length}</strong></div>
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
            </header>

            <div className="finnhub-diagnostic-controls">
                <div className="diagnostic-add-control">
                    <input
                        value={newSymbol}
                        maxLength={MAX_SYMBOL_LENGTH}
                        onChange={(event) => setNewSymbol(cleanSymbol(event.target.value))}
                        onKeyDown={(event) => event.key === 'Enter' && addWidget()}
                        placeholder="SYMBOL"
                        aria-label="Symbol for new diagnostic widget"
                    />
                    <button type="button" onClick={addWidget}>+ ADD WIDGET</button>
                </div>
                <div className="diagnostic-control-buttons">
                    <button type="button" className={streamPaused ? 'is-active' : ''} onClick={() => setStreamPaused((current) => !current)}>{streamPaused ? '▶ RESUME' : 'Ⅱ PAUSE'}</button>
                    <button type="button" className={layoutLocked ? 'is-active' : ''} onClick={() => setLayoutLocked((current) => !current)}>{layoutLocked ? 'UNLOCK LAYOUT' : 'LOCK LAYOUT'}</button>
                    <button type="button" onClick={resetDashboard}>RESET 60</button>
                </div>
            </div>

            {!apiKey && (
                <div className="diagnostic-alert">Add your Finnhub API key in the Stock Stickies header to start the diagnostic stream.</div>
            )}
            {connectionError && <div className="diagnostic-alert diagnostic-alert-error">{connectionError}</div>}

            <div className="finnhub-grid-canvas">
                <ResponsiveGridLayout
                    className="finnhub-responsive-grid"
                    layouts={layouts}
                    breakpoints={{ lg: 1400, md: 1050, sm: 760, xs: 480, xxs: 0 }}
                    cols={{ lg: 24, md: 16, sm: 12, xs: 8, xxs: 4 }}
                    rowHeight={34}
                    margin={[8, 8]}
                    containerPadding={[8, 8]}
                    compactType={null}
                    preventCollision={false}
                    isDraggable={!layoutLocked}
                    isResizable={!layoutLocked}
                    draggableHandle=".quote-drag-handle"
                    draggableCancel=".quote-action"
                    resizeHandles={['se', 'sw']}
                    onLayoutChange={(_layout, nextLayouts) => setLayouts(nextLayouts)}
                >
                    {widgets.map((widget) => (
                        <div key={widget.id}>
                            <QuoteWidget
                                widget={widget}
                                quote={quotes[providerSymbol(widget.symbol)]}
                                measuredAt={stats.measuredAt}
                                editing={editingWidgetId === widget.id}
                                onBeginEdit={setEditingWidgetId}
                                onCancelEdit={() => setEditingWidgetId(null)}
                                onSaveEdit={saveWidgetSymbol}
                                onRemove={removeWidget}
                            />
                        </div>
                    ))}
                </ResponsiveGridLayout>
            </div>

            <footer className="finnhub-diagnostic-footer">
                <span>DOUBLE-CLICK A SYMBOL TO EDIT</span>
                <span>DRAG ANY TILE · RESIZE FROM LOWER CORNERS</span>
                <span>SNAPSHOTS LOAD AT 48/MIN · LIVE TICKS USE ONE WEBSOCKET</span>
            </footer>
        </section>
    )
}
