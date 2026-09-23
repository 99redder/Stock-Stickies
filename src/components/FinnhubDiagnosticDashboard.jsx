import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout/legacy'
import { fetchFinnhubQuote } from '../utils/finnhubQuoteCache.js'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './FinnhubDiagnosticDashboard.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

const STORAGE_KEY = 'stock-stickies-finnhub-diagnostic-v10'
const PREVIOUS_STORAGE_KEY = 'stock-stickies-finnhub-diagnostic-v9'
const DASHBOARD_VERSION = 13
const QUOTE_CACHE_KEY = 'stock-stickies-finnhub-diagnostic-quotes-v1'
const SUBSCRIPTION_CAP_KEY = 'stock-stickies-finnhub-subscription-cap-v1'
const DISMISSED_NEWS_STORAGE_KEY = 'stock-stickies-dashboard-dismissed-news-v1'
const DISMISSED_ALERTS_STORAGE_KEY = 'stock-stickies-dashboard-dismissed-alerts-v1'
const CHROME_COLLAPSED_STORAGE_KEY = 'stock-stickies-dashboard-chrome-collapsed-v1'
const NEWS_ENDPOINT = '/api/news/breaking'
const NEWS_POLL_INTERVAL_MS = 45000
// Headlines self-expire from the ticker after this long, whether the tab was open
// or not, so a returning user never has to click through a stack of stale news.
const NEWS_MAX_DISPLAY_AGE_MS = 30 * 60 * 1000
const MAX_VISIBLE_HEADLINES = 5
const MAX_REMEMBERED_DISMISSALS = 500
const MAX_SYMBOL_LENGTH = 24
const SUBSCRIPTION_PROBE_DELAY_MS = 350
const SNAPSHOT_INTERVAL_MS = 1250
const STARTUP_SNAPSHOT_BURST_SIZE = 8
const STALE_STREAM_AFTER_MS = 15000
const STALE_STREAM_SNAPSHOT_INTERVAL_MS = 60000
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
    { id: 'defensive', label: 'DEFENSIVE', symbols: ['WM', 'MCD', 'SCHD', 'KO', 'PG', 'WMT', 'XLU', 'DUK'] },
    { id: 'china', label: 'CHINA', symbols: ['BABA', 'BIDU', 'TCEHY', 'XIACY', 'KWEB', 'KSTR'] },
    { id: 'healthcare', label: 'HEALTHCARE', symbols: ['LLY', 'JNJ', 'XLV', 'IOVA', 'NVO', 'MRK', 'AMGN'] },
    { id: 'defense', label: 'DEFENSE', symbols: ['LMT', 'RTX', 'NOC', 'ITA', 'LDOS', 'GD', 'LHX', 'HII'] },
    { id: 'other', label: 'OTHER', symbols: [] }
]

const THEME_BY_ID = Object.fromEntries(DASHBOARD_THEMES.map((theme) => [theme.id, theme]))
const themeHeaderId = (themeId) => `theme-heading-${themeId}`
const GRID_COLUMNS = { lg: 30, md: 24, sm: 18, xs: 12, xxs: 6 }
const CLUSTER_THEME_ORDER = ['mag7', 'drones', 'robotics', 'ai', 'space', 'market', 'financials', 'nuclear', 'energy', 'defensive', 'china', 'healthcare', 'defense', 'other']

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

// New dashboards (and RESET GROUPS) start small with the market overview and
// Mag 7; the other themed groups stay available from the group picker.
const STARTER_THEME_IDS = new Set(['market', 'mag7'])
const createStarterWidgets = () => createDefaultWidgets().filter((widget) => STARTER_THEME_IDS.has(widget.themeId))

const createGodelLayout = (widgets, totalColumns) => {
    const layout = []
    const clusterColumns = totalColumns >= 24 ? 3 : totalColumns >= 12 ? 2 : 1
    const clusterGap = 1
    const clusterWidth = Math.floor((totalColumns - clusterGap * (clusterColumns - 1)) / clusterColumns)
    const yByColumn = Array(clusterColumns).fill(0)
    // Count only groups that have widgets, so a small dashboard packs its
    // groups side by side instead of leaving columns for absent ones.
    let clusterIndex = 0

    CLUSTER_THEME_ORDER.forEach((themeId) => {
        const theme = THEME_BY_ID[themeId]
        const themedWidgets = widgets.filter((widget) => widget.themeId === theme.id)
        if (themedWidgets.length === 0) return
        const clusterColumn = clusterIndex % clusterColumns
        clusterIndex += 1
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

const layoutItemsCollide = (item, other) => (
    item.i !== other.i
    && item.x < other.x + other.w
    && item.x + item.w > other.x
    && item.y < other.y + other.h
    && item.y + item.h > other.y
)

const layoutHasCollisions = (layout) => Array.isArray(layout) && layout.some((item, index) => (
    layout.slice(index + 1).some((other) => layoutItemsCollide(item, other))
))

const appendWidgetToLayouts = (currentLayouts, existingWidgets, widget) => Object.fromEntries(
    Object.entries(GRID_COLUMNS).map(([breakpoint, columns]) => {
        const layout = Array.isArray(currentLayouts?.[breakpoint]) ? currentLayouts[breakpoint] : createGodelLayout(existingWidgets, columns)
        const nextLayout = [...layout]
        let header = nextLayout.find((item) => item.i === themeHeaderId(widget.themeId))

        if (!header) {
            const clusterColumns = columns >= 24 ? 3 : columns >= 12 ? 2 : 1
            const clusterGap = 1
            const clusterWidth = Math.floor((columns - clusterGap * (clusterColumns - 1)) / clusterColumns)
            const bottom = nextLayout.reduce((maximum, item) => Math.max(maximum, item.y + item.h), 0)
            header = { i: themeHeaderId(widget.themeId), x: 0, y: bottom + 1, w: clusterWidth, h: 1, static: true }
            nextLayout.push(header)
        }

        const themeWidgetIds = new Set(existingWidgets.filter((item) => item.themeId === widget.themeId).map((item) => item.id))
        const themeLayoutItems = nextLayout.filter((item) => themeWidgetIds.has(item.i))
        const template = themeLayoutItems[0]
        const width = Math.min(template?.w || Math.max(2, Math.floor(header.w / (header.w >= 9 ? 3 : header.w >= 6 ? 2 : 1))), header.w)
        const height = template?.h || 2
        const maxCandidateY = nextLayout.reduce((maximum, item) => Math.max(maximum, item.y + item.h), header.y + 1) + height + 2
        let placement = null

        for (let y = header.y + 1; y <= maxCandidateY && !placement; y += height) {
            for (let x = header.x; x + width <= header.x + header.w; x += width) {
                const candidate = { i: widget.id, x, y, w: width, h: height, minW: 2, minH: 2, maxW: 8, maxH: 5 }
                if (!nextLayout.some((item) => layoutItemsCollide(candidate, item))) {
                    placement = candidate
                    break
                }
            }
        }

        if (!placement) {
            const bottom = nextLayout.reduce((maximum, item) => Math.max(maximum, item.y + item.h), 0)
            placement = { i: widget.id, x: header.x, y: bottom + 1, w: width, h: height, minW: 2, minH: 2, maxW: 8, maxH: 5 }
        }
        nextLayout.push(placement)
        return [breakpoint, nextLayout]
    })
)

// Older dashboard versions appended newly-created sections to column zero.
// Reflow each complete section into a round-robin column assignment so the
// desktop view stays balanced (for example, 5/4/4 sections across three
// columns), while preserving each section's internal tile arrangement.
const rebalanceLayoutColumns = (widgets, layout, totalColumns) => {
    if (!Array.isArray(layout)) return layout
    const clusterColumns = totalColumns >= 24 ? 3 : totalColumns >= 12 ? 2 : 1
    if (clusterColumns === 1) return layout

    const activeThemeIds = new Set(widgets.map((widget) => widget.themeId))
    const orderedThemeIds = CLUSTER_THEME_ORDER.filter((themeId) => activeThemeIds.has(themeId))
    const widgetById = new Map(widgets.map((widget) => [widget.id, widget]))
    const nextLayout = layout.map((item) => ({ ...item }))
    const yByColumn = Array(clusterColumns).fill(0)
    const clusterGap = 1
    const clusterWidth = Math.floor((totalColumns - clusterGap * (clusterColumns - 1)) / clusterColumns)

    orderedThemeIds.forEach((themeId, themeIndex) => {
        const headerId = themeHeaderId(themeId)
        const sectionItems = nextLayout.filter((item) => (
            item.i === headerId || widgetById.get(item.i)?.themeId === themeId
        ))
        if (sectionItems.length === 0) return

        const minX = Math.min(...sectionItems.map((item) => item.x))
        const minY = Math.min(...sectionItems.map((item) => item.y))
        const maxY = Math.max(...sectionItems.map((item) => item.y + item.h))
        const sectionHeight = maxY - minY
        const header = sectionItems.find((item) => item.i === headerId)
        const sectionWidth = Math.min(header?.w || clusterWidth, clusterWidth)
        const clusterColumn = themeIndex % clusterColumns
        const targetX = clusterColumn * (clusterWidth + clusterGap)
        const targetY = yByColumn[clusterColumn]

        sectionItems.forEach((item) => {
            const nextItem = nextLayout.find((candidate) => candidate.i === item.i)
            nextItem.x = targetX + Math.max(0, item.x - minX)
            nextItem.y = targetY + (item.y - minY)
            if (nextItem.i === headerId) {
                nextItem.w = sectionWidth
                nextItem.static = true
            }
        })
        yByColumn[clusterColumn] = targetY + sectionHeight + 1
    })

    return nextLayout
}

const rebalanceDashboardLayouts = (widgets, layouts) => Object.fromEntries(
    Object.entries(GRID_COLUMNS).map(([breakpoint, columns]) => [
        breakpoint,
        rebalanceLayoutColumns(widgets, layouts?.[breakpoint], columns)
    ])
)

// Apply once to both browser-local and cloud-saved dashboards. Reuse existing
// tickers and keep unrelated tile positions intact.
const addThemeToDashboard = (widgets, layouts, themeId) => {
    const symbols = new Set(THEME_BY_ID[themeId].symbols)
    const themeWidgets = createDefaultWidgets()
        .filter((widget) => widget.themeId === themeId)
        .map((widget) => ({
            ...(widgets.find((existing) => providerSymbol(existing.symbol) === widget.symbol) || widget),
            themeId
        }))
    const nextWidgets = widgets.filter((widget) => !symbols.has(providerSymbol(widget.symbol)))
    const retainedIds = new Set([
        ...nextWidgets.map((widget) => widget.id),
        ...nextWidgets.map((widget) => themeHeaderId(widget.themeId))
    ])
    let nextLayouts = Object.fromEntries(Object.entries(layouts).map(([breakpoint, layout]) => [
        breakpoint, layout.filter((item) => retainedIds.has(item.i))
    ]))

    themeWidgets.forEach((widget) => {
        nextLayouts = appendWidgetToLayouts(nextLayouts, nextWidgets, widget)
        nextWidgets.push(widget)
    })
    return { widgets: nextWidgets, layouts: nextLayouts }
}

const migrateDashboardThemes = (dashboard, savedVersion = 0) => {
    let next = dashboard
    const migrations = [{ version: 11, themeId: 'healthcare' }, { version: 12, themeId: 'defense' }]
    migrations.forEach(({ version, themeId }) => {
        if (savedVersion < version) next = addThemeToDashboard(next.widgets, next.layouts, themeId)
    })
    if (savedVersion < 13) next = { widgets: next.widgets, layouts: rebalanceDashboardLayouts(next.widgets, next.layouts) }
    return next
}

const loadSavedDashboard = (persistedDashboard) => {
    const defaults = createDefaultWidgets()
    try {
        const currentSaved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
        const previousSaved = currentSaved ? null : JSON.parse(localStorage.getItem(PREVIOUS_STORAGE_KEY) || 'null')
        const hasPersistedDashboard = persistedDashboard && typeof persistedDashboard === 'object'
        const saved = hasPersistedDashboard ? persistedDashboard : currentSaved || previousSaved
        const isPreviousVersion = Boolean(!hasPersistedDashboard && !currentSaved && previousSaved)
        if (!saved || !Array.isArray(saved.widgets) || saved.widgets.length === 0) {
            const starter = createStarterWidgets()
            return { widgets: starter, layouts: createDashboardLayouts(starter) }
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
            const migrationSymbols = new Set(['WM', 'MCD', 'JNJ', 'SCHD', 'KO', 'PG', 'WMT', 'XLU', 'DUK'])
            widgets = widgets.map((widget) => (
                migrationSymbols.has(providerSymbol(widget.symbol))
                    ? { ...widget, themeId: 'defensive' }
                    : widget
            ))
            const existingSymbols = new Set(widgets.map((widget) => providerSymbol(widget.symbol)))
            const newThemeWidgets = defaults.filter((widget) => (
                migrationSymbols.has(widget.symbol) && !existingSymbols.has(providerSymbol(widget.symbol))
            ))
            widgets = [...widgets, ...newThemeWidgets]
            return migrateDashboardThemes({ widgets, layouts: createDashboardLayouts(widgets) })
        }
        if (widgets.length === 0) return { widgets: defaults, layouts: createDashboardLayouts(defaults) }

        const activeThemeIds = new Set(widgets.map((widget) => widget.themeId))
        const validIds = new Set([
            ...widgets.map((widget) => widget.id),
            ...[...activeThemeIds].map(themeHeaderId)
        ])
        let layouts = saved.layouts && typeof saved.layouts === 'object'
            ? Object.fromEntries(Object.entries(saved.layouts).map(([breakpoint, layout]) => [
                breakpoint,
                Array.isArray(layout) ? layout.filter((item) => validIds.has(item?.i)) : []
            ]))
            : createDashboardLayouts(widgets)

        const expectedLayoutItems = widgets.length + activeThemeIds.size
        const hasUnsafeLayout = Object.values(layouts).some(layoutHasCollisions)
        if (!layouts.lg || layouts.lg.length !== expectedLayoutItems || hasUnsafeLayout) {
            layouts = createDashboardLayouts(widgets)
        }
        // Persisting the version lets users remove or customize these tiles later
        // without the next reload adding them back.
        return migrateDashboardThemes({ widgets, layouts }, Number(saved.version) || 0)
    } catch {
        const starter = createStarterWidgets()
        return { widgets: starter, layouts: createDashboardLayouts(starter) }
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
            snapshotAt: Number(quote?.snapshotAt) || 0,
            baselineMarketDate: typeof quote?.baselineMarketDate === 'string' ? quote.baselineMarketDate : undefined,
            baselineCheckedDate: typeof quote?.baselineCheckedDate === 'string' ? quote.baselineCheckedDate : undefined,
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

const formatQuoteTime = (value) => {
    const timestamp = Number(value)
    if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
    return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

const formatTickCount = (value) => {
    const count = Math.max(0, Math.floor(Number(value) || 0))
    if (count >= 1000000) return `${(count / 1000000).toFixed(count < 10000000 ? 1 : 0).replace(/\.0$/, '')}MT`
    if (count >= 1000) return `${(count / 1000).toFixed(count < 10000 ? 1 : 0).replace(/\.0$/, '')}KT`
    return `${count}T`
}

const easternMarketClock = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
})

const easternMarketDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
})

const getEasternMarketDate = (timestamp = Date.now()) => {
    const parts = Object.fromEntries(easternMarketDate.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day}`
}

const isRegularUsMarketSession = (timestamp = Date.now()) => {
    const parts = Object.fromEntries(easternMarketClock.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]))
    if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false
    const minutes = (Number(parts.hour) * 60) + Number(parts.minute)
    return minutes >= 570 && minutes < 960
}

const createQuoteStore = (initialQuotes) => {
    const publishedQuotes = { ...initialQuotes }
    const listeners = new Map()
    return {
        getSnapshot(symbol) {
            return publishedQuotes[symbol]
        },
        publish(symbol, quote) {
            if (!symbol || publishedQuotes[symbol] === quote) return
            publishedQuotes[symbol] = quote
            listeners.get(symbol)?.forEach((listener) => listener())
        },
        subscribe(symbol, listener) {
            if (!listeners.has(symbol)) listeners.set(symbol, new Set())
            const symbolListeners = listeners.get(symbol)
            symbolListeners.add(listener)
            return () => {
                symbolListeners.delete(listener)
                if (symbolListeners.size === 0) listeners.delete(symbol)
            }
        }
    }
}

const DashboardStats = React.memo(function DashboardStats({ hidden, widgetCount, streamedCount, uniqueSymbolCount, quotesRef, quoteStore, totalEventsRef, eventsThisSecondRef, documentVisibleRef }) {
    const [stats, setStats] = useState({ totalEvents: 0, eventsPerMinute: 0, eventsPerSecond: 0, liveSymbols: 0, peakPerSecond: 0 })
    const eventsHistoryRef = useRef([])
    const peakPerSecondRef = useRef(0)

    useEffect(() => {
        const timer = window.setInterval(() => {
            if (!documentVisibleRef.current) {
                eventsThisSecondRef.current = 0
                return
            }

            const now = Date.now()
            const thisSecond = eventsThisSecondRef.current
            eventsThisSecondRef.current = 0
            eventsHistoryRef.current = [...eventsHistoryRef.current.slice(-59), thisSecond]
            peakPerSecondRef.current = Math.max(peakPerSecondRef.current, thisSecond)
            let liveSymbols = 0

            Object.entries(quotesRef.current).forEach(([symbol, quote]) => {
                const isFresh = Boolean(quote.lastEventAt && now - quote.lastEventAt < 5000)
                const nextQuote = quote.isFresh === isFresh ? quote : { ...quote, isFresh }
                if (nextQuote !== quote) quotesRef.current[symbol] = nextQuote
                if (isFresh) liveSymbols += 1
                quoteStore.publish(symbol, nextQuote)
            })

            const nextStats = {
                totalEvents: totalEventsRef.current,
                eventsPerMinute: eventsHistoryRef.current.reduce((sum, count) => sum + count, 0),
                eventsPerSecond: thisSecond,
                liveSymbols,
                peakPerSecond: peakPerSecondRef.current
            }
            setStats((current) => Object.keys(nextStats).every((key) => current[key] === nextStats[key]) ? current : nextStats)
        }, 1000)
        return () => window.clearInterval(timer)
    }, [documentVisibleRef, eventsThisSecondRef, quoteStore, quotesRef, totalEventsRef])

    return (
        <div className={`diagnostic-stats ${hidden ? 'is-hidden' : ''}`} aria-hidden={hidden}>
            <div><span>WIDGETS</span><strong>{widgetCount}</strong></div>
            <div><span>STREAMED</span><strong>{streamedCount}/{uniqueSymbolCount}</strong></div>
            <div><span>LIVE ≤5S</span><strong>{stats.liveSymbols}</strong></div>
            <div><span>EVENTS/MIN</span><strong>{stats.eventsPerMinute.toLocaleString()}</strong></div>
            <div><span>EVENTS/SEC</span><strong>{stats.eventsPerSecond.toLocaleString()}</strong></div>
            <div><span>PEAK/SEC</span><strong>{stats.peakPerSecond.toLocaleString()}</strong></div>
            <div><span>TOTAL</span><strong>{stats.totalEvents.toLocaleString()}</strong></div>
        </div>
    )
})

const QuoteWidget = React.memo(function QuoteWidget({ widget, quoteStore, streamEnabled, connectionState, streamPaused, editing, highlighted, onBeginEdit, onCancelEdit, onSaveEdit, onTogglePriority, onRemove }) {
    const [draft, setDraft] = useState(widget.symbol)
    const symbol = providerSymbol(widget.symbol)
    const subscribe = useCallback((listener) => quoteStore.subscribe(symbol, listener), [quoteStore, symbol])
    const getSnapshot = useCallback(() => quoteStore.getSnapshot(symbol), [quoteStore, symbol])
    const quote = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const price = quote?.price
    const change = quote?.change
    const changePercent = quote?.changePercent
    const direction = Number.isFinite(change) ? (change >= 0 ? 'up' : 'down') : 'flat'
    const isFresh = Boolean(quote?.isFresh)
    const isDaily = Boolean(quote?.daily || isDailyMacroSymbol(widget.symbol))
    const isCrypto = symbol.includes(':')
    const liveTimestamp = quote?.providerTimestamp || quote?.lastEventAt
    const hasCalculatedChange = Number.isFinite(changePercent) && Number.isFinite(change)
    const changeLabel = isDaily && Number.isFinite(change)
        ? `${formatSigned(change * 100, 0)} BP${quote?.sourceDate ? ` · ${quote.sourceDate}` : ''}`
        : hasCalculatedChange
            ? `${formatSigned(changePercent)}% ${formatSigned(change)}`
            : quote?.cachedAt
                ? 'LAST SAVED PRICE'
                : Number.isFinite(price)
                    ? 'CHANGE N/A'
                    : quote?.error || 'NO PRINT YET'
    const feedLabel = isDaily
        ? `DAILY${quote?.sourceDate ? ` · ${quote.sourceDate}` : ''}`
        : streamPaused
            ? 'STREAM PAUSED'
            : quote?.error === 'RATE LIMITED'
                ? 'RATE LIMITED'
                : streamEnabled && (connectionState === 'connecting' || connectionState === 'reconnecting')
                    ? 'RECONNECTING'
                    : streamEnabled && connectionState === 'disconnected'
                        ? 'STREAM OFFLINE'
                        : isFresh
                            ? `LIVE · ${formatQuoteTime(liveTimestamp)}`
                            : quote?.cachedAt
                                ? `CACHED · ${formatQuoteTime(quote.cachedAt)}`
                                : quote?.lastEventAt
                                    ? `${!isCrypto && !isRegularUsMarketSession() ? 'MARKET CLOSED' : 'STREAM IDLE'} · ${formatQuoteTime(liveTimestamp)}`
                                    : quote?.snapshotAt
                                        ? `${streamEnabled ? 'SNAPSHOT' : 'SNAPSHOT ONLY'} · ${formatQuoteTime(quote.snapshotAt)}`
                                        : connectionState === 'missing-key'
                                            ? 'API KEY NEEDED'
                                            : streamEnabled ? 'STREAM READY' : 'QUEUED'

    const save = () => {
        const next = cleanSymbol(draft)
        if (next) onSaveEdit(widget.id, next)
    }

    const beginEdit = () => {
        setDraft(widget.symbol)
        onBeginEdit(widget.id)
    }

    return (
        <div className={`finnhub-quote-widget quote-drag-handle quote-${direction} ${highlighted ? 'is-highlighted' : ''}`}>
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
                <div
                    className="quote-change"
                    title={changeLabel === 'CHANGE N/A' ? 'Live price received; previous-close baseline unavailable' : undefined}
                >
                    {changeLabel}
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
                {quote?.events ? (
                    <span className="quote-tick-count" title={`${quote.events.toLocaleString()} live trade events`}>
                        {formatTickCount(quote.events)}
                    </span>
                ) : null}
            </div>
        </div>
    )
}, (previous, next) => (
    previous.widget === next.widget
    && previous.quoteStore === next.quoteStore
    && previous.streamEnabled === next.streamEnabled
    && previous.connectionState === next.connectionState
    && previous.streamPaused === next.streamPaused
    && previous.editing === next.editing
    && previous.highlighted === next.highlighted
))

const loadDismissedNewsIds = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(DISMISSED_NEWS_STORAGE_KEY) || 'null')
        return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []
    } catch {
        return []
    }
}

const loadDismissedAlertKeys = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(DISMISSED_ALERTS_STORAGE_KEY) || 'null')
        return Array.isArray(saved) ? saved.filter((key) => typeof key === 'string') : []
    } catch {
        return []
    }
}

const getAlertDismissalKey = (alert) => (
    alert.id === 'subscription' ? alert.id : `${alert.id}:${alert.text}`
)

const formatHeadlineAge = (publishedAt) => {
    if (!Number.isFinite(publishedAt)) return ''
    const minutes = Math.floor((Date.now() - publishedAt) / 60000)
    if (minutes < 1) return 'JUST NOW'
    if (minutes < 60) return `${minutes}M AGO`
    return `${Math.floor(minutes / 60)}H AGO`
}

// Bottom-right breaking-news alerts, Godel-terminal style: red background, black
// text, each headline individually dismissible. Dismissed headlines are remembered
// in localStorage so an X'd-out story never comes back. Only polls while the
// dashboard is mounted (owner-only), every NEWS_POLL_INTERVAL_MS.
function BreakingNewsTicker({ systemAlerts = [] }) {
    const [headlines, setHeadlines] = useState([])
    const [dismissedIds, setDismissedIds] = useState(() => new Set(loadDismissedNewsIds()))
    const [dismissedAlerts, setDismissedAlerts] = useState(() => new Set(loadDismissedAlertKeys()))
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        let active = true
        const controller = new AbortController()
        const loadHeadlines = async () => {
            if (document.visibilityState !== 'visible') return
            try {
                const response = await fetch(NEWS_ENDPOINT, { signal: controller.signal, cache: 'no-store' })
                if (!response.ok) return
                const data = await response.json()
                if (!active || !Array.isArray(data?.headlines)) return
                setHeadlines(data.headlines.filter((item) => item && typeof item.id === 'string' && item.title))
            } catch {
                // A failed poll simply keeps the last headlines on screen.
            }
        }
        loadHeadlines()
        const timer = window.setInterval(loadHeadlines, NEWS_POLL_INTERVAL_MS)
        const onVisibility = () => { if (document.visibilityState === 'visible') loadHeadlines() }
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
            active = false
            controller.abort()
            window.clearInterval(timer)
            document.removeEventListener('visibilitychange', onVisibility)
        }
    }, [])

    // Re-evaluate the age window on its own cadence so headlines expire even
    // between polls (e.g. when the stream is idle overnight).
    useEffect(() => {
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') setNow(Date.now())
        }, 30000)
        return () => window.clearInterval(timer)
    }, [])

    const dismiss = (id) => {
        setDismissedIds((current) => {
            const next = [...current, id].slice(-MAX_REMEMBERED_DISMISSALS)
            try {
                localStorage.setItem(DISMISSED_NEWS_STORAGE_KEY, JSON.stringify(next))
            } catch {
                // Persistence is best-effort; the dismissal still applies this session.
            }
            return new Set(next)
        })
    }

    // Persist dashboard-alert dismissals across reconnects and remounts. The
    // subscription-cap notice uses its stable id so widget-count changes do not
    // make the same informational notice reappear; errors include their text so
    // a genuinely different problem can still surface.
    const dismissAlert = (alert) => setDismissedAlerts((current) => {
        const next = [...current, getAlertDismissalKey(alert)].slice(-MAX_REMEMBERED_DISMISSALS)
        try {
            localStorage.setItem(DISMISSED_ALERTS_STORAGE_KEY, JSON.stringify(next))
        } catch {
            // Persistence is best-effort; the dismissal still applies this session.
        }
        return new Set(next)
    })

    const visibleAlerts = systemAlerts.filter((alert) => alert.text && !dismissedAlerts.has(getAlertDismissalKey(alert)))

    const visible = headlines
        .filter((item) => !dismissedIds.has(item.id))
        .filter((item) => Number.isFinite(item.publishedAt) && now - item.publishedAt <= NEWS_MAX_DISPLAY_AGE_MS)
        .slice(0, MAX_VISIBLE_HEADLINES)

    if (visible.length === 0 && visibleAlerts.length === 0) return null

    return (
        <div className="dashboard-news-ticker" role="region" aria-label="Breaking market news and dashboard alerts">
            {visibleAlerts.map((alert) => (
                <article key={alert.id} className="dashboard-news-item is-system">
                    <div className="dashboard-news-meta">
                        <span className="dashboard-news-flag">NOTICE</span>
                        <span className="dashboard-news-source">DASHBOARD</span>
                        <button
                            type="button"
                            className="dashboard-news-dismiss quote-action"
                            onClick={() => dismissAlert(alert)}
                            title="Dismiss this alert"
                            aria-label={`Dismiss alert: ${alert.text}`}
                        >
                            ×
                        </button>
                    </div>
                    <span className="dashboard-news-headline">{alert.text}</span>
                    {alert.action && (
                        <button type="button" className="dashboard-news-action" onClick={alert.action.onClick}>
                            {alert.action.label}
                        </button>
                    )}
                </article>
            ))}
            {visible.map((item) => (
                <article key={item.id} className="dashboard-news-item">
                    <div className="dashboard-news-meta">
                        <span className="dashboard-news-flag">BREAKING</span>
                        <span className="dashboard-news-source">
                            {item.source}{item.publishedAt ? ` · ${formatHeadlineAge(item.publishedAt)}` : ''}
                        </span>
                        <button
                            type="button"
                            className="dashboard-news-dismiss quote-action"
                            onClick={() => dismiss(item.id)}
                            title="Dismiss this headline"
                            aria-label={`Dismiss headline: ${item.title}`}
                        >
                            ×
                        </button>
                    </div>
                    {item.url ? (
                        <a className="dashboard-news-headline" href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
                    ) : (
                        <span className="dashboard-news-headline">{item.title}</span>
                    )}
                </article>
            ))}
        </div>
    )
}

export default function FinnhubDiagnosticDashboard({ apiKey, persistedDashboard = null, onDashboardChange, fullScreen = false, onExit, onSetupApiKeys }) {
    const [initial] = useState(() => loadSavedDashboard(persistedDashboard))
    const [initialQuotes] = useState(() => loadCachedQuotes())
    const [initialSubscriptionCap] = useState(() => loadRememberedSubscriptionCap())
    const [widgets, setWidgets] = useState(initial.widgets)
    const [layouts, setLayouts] = useState(initial.layouts)
    const [connectionState, setConnectionState] = useState('disconnected')
    const [connectionError, setConnectionError] = useState('')
    const [socketEpoch, setSocketEpoch] = useState(0)
    const [editingWidgetId, setEditingWidgetId] = useState(null)
    const [highlightedWidgetId, setHighlightedWidgetId] = useState(null)
    const [newSymbol, setNewSymbol] = useState('')
    const [newThemeId, setNewThemeId] = useState('other')
    const [addWidgetError, setAddWidgetError] = useState('')
    const [layoutLocked, setLayoutLocked] = useState(false)
    const [streamPaused, setStreamPaused] = useState(false)
    const [streamedSymbols, setStreamedSymbols] = useState([])
    const [subscriptionNotice, setSubscriptionNotice] = useState('')
    const [chromeCollapsed, setChromeCollapsed] = useState(() => {
        try { return localStorage.getItem(CHROME_COLLAPSED_STORAGE_KEY) === '1' } catch { return false }
    })

    useEffect(() => {
        try { localStorage.setItem(CHROME_COLLAPSED_STORAGE_KEY, chromeCollapsed ? '1' : '0') } catch { /* best-effort */ }
    }, [chromeCollapsed])

    const socketRef = useRef(null)
    const quoteStoreRef = useRef(null)
    if (!quoteStoreRef.current) quoteStoreRef.current = createQuoteStore(initialQuotes)
    const quoteStore = quoteStoreRef.current
    const subscribedSymbolsRef = useRef(new Set())
    const quotesRef = useRef(initialQuotes)
    const totalEventsRef = useRef(0)
    const eventsThisSecondRef = useRef(0)
    const documentVisibleRef = useRef(typeof document === 'undefined' || document.visibilityState === 'visible')
    const pausedRef = useRef(false)
    const reconnectTimerRef = useRef(null)
    const snapshotRequestTimesRef = useRef({})
    const lastSnapshotRequestAtRef = useRef(0)
    const subscriptionTimerRef = useRef(null)
    const lastSubscriptionAttemptRef = useRef('')
    const subscriptionCapRef = useRef(initialSubscriptionCap)
    const highlightTimerRef = useRef(null)

    const symbolKey = useMemo(() => widgets.map((widget) => providerSymbol(widget.symbol)).sort().join('|'), [widgets])

    useEffect(() => {
        // JSON round-tripping strips any undefined layout metadata before this
        // object reaches Firestore, which rejects undefined nested values.
        const dashboard = JSON.parse(JSON.stringify({ version: DASHBOARD_VERSION, widgets, layouts, savedAt: Date.now() }))
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboard))
        } catch {
            // Account sync remains available when browser storage is blocked/full.
        }
        onDashboardChange?.(dashboard)
    }, [widgets, layouts, onDashboardChange])

    useEffect(() => {
        pausedRef.current = streamPaused
    }, [streamPaused])

    useEffect(() => {
        const updateVisibility = () => {
            documentVisibleRef.current = document.visibilityState === 'visible'
        }
        document.addEventListener('visibilitychange', updateVisibility)
        return () => document.removeEventListener('visibilitychange', updateVisibility)
    }, [])

    useEffect(() => () => {
        if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    }, [])

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
                    sourceDate: quote.sourceDate,
                    snapshotAt: quote.snapshotAt,
                    baselineMarketDate: quote.baselineMarketDate,
                    baselineCheckedDate: quote.baselineCheckedDate
                }]))
            if (Object.keys(cacheableQuotes).length > 0) {
                localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), quotes: cacheableQuotes }))
            }
        }

        const timer = window.setInterval(() => {
            if (documentVisibleRef.current) saveQuoteCache()
        }, 10000)
        window.addEventListener('pagehide', saveQuoteCache)
        return () => {
            window.clearInterval(timer)
            window.removeEventListener('pagehide', saveQuoteCache)
            saveQuoteCache()
        }
    }, [])

    useEffect(() => {
        const hasDgs30Widget = widgets.some((widget) => isDailyMacroSymbol(widget.symbol))
        if (!hasDgs30Widget) return undefined

        let active = true
        const controller = new AbortController()

        const loadThirtyYearYield = async () => {
            if (document.visibilityState !== 'visible') return
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
                quoteStore.publish('DGS30', nextQuote)
            } catch (error) {
                if (!active || error?.name === 'AbortError') return
                const previous = quotesRef.current.DGS30 || {}
                const nextQuote = { ...previous, daily: true, error: 'DAILY RATE UNAVAILABLE' }
                quotesRef.current.DGS30 = nextQuote
                quoteStore.publish('DGS30', nextQuote)
            }
        }

        loadThirtyYearYield()
        const refreshTimer = window.setInterval(loadThirtyYearYield, 4 * 60 * 60 * 1000)
        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') loadThirtyYearYield()
        }
        document.addEventListener('visibilitychange', refreshWhenVisible)
        return () => {
            active = false
            controller.abort()
            window.clearInterval(refreshTimer)
            document.removeEventListener('visibilitychange', refreshWhenVisible)
        }
    }, [quoteStore, symbolKey, widgets])

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
                            error: null,
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
        const targetMetadata = new Map()
        widgets.forEach((widget, index) => {
            if (isDailyMacroSymbol(widget.symbol)) return
            const symbol = providerSymbol(widget.symbol)
            if (!symbol || symbol.includes(':')) return
            const existing = targetMetadata.get(symbol)
            targetMetadata.set(symbol, {
                index: existing?.index ?? index,
                priority: Boolean(existing?.priority || widget.priority)
            })
        })
        const targets = [...targetMetadata.keys()]
        const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
        let rateLimitCooldownUntil = 0
        const retryAfterBySymbol = {}

        const getEligibleTargets = () => {
            const now = Date.now()
            const checkedDate = getEasternMarketDate(now)
            return targets.filter((symbol) => {
                if (now < (retryAfterBySymbol[symbol] || 0)) return false
                const quote = quotesRef.current[symbol] || {}
                const hasPrice = Number.isFinite(quote.price) && quote.price > 0
                const hasBaseline = Number.isFinite(quote.previousClose) && quote.previousClose > 0
                const needsInitialData = !hasPrice || !hasBaseline
                const attemptedAt = snapshotRequestTimesRef.current[symbol] || 0
                if (needsInitialData && now - attemptedAt < 60000) return false
                const isSubscribed = subscribedSymbolsRef.current.has(symbol)
                const lastEventAt = Number(quote.lastEventAt) || 0
                const streamIsStale = isSubscribed && (!lastEventAt || now - lastEventAt >= STALE_STREAM_AFTER_MS)
                const staleSnapshotIsDue = streamIsStale && now - attemptedAt >= STALE_STREAM_SNAPSHOT_INTERVAL_MS
                const baselineSnapshotIsDue = quote.baselineCheckedDate !== checkedDate
                return needsInitialData || !isSubscribed || staleSnapshotIsDue || baselineSnapshotIsDue
            }).sort((a, b) => {
                const aMetadata = targetMetadata.get(a)
                const bMetadata = targetMetadata.get(b)
                const aQuote = quotesRef.current[a] || {}
                const bQuote = quotesRef.current[b] || {}
                const aNeedsDailyBaseline = aQuote.baselineCheckedDate !== checkedDate
                const bNeedsDailyBaseline = bQuote.baselineCheckedDate !== checkedDate
                if (aNeedsDailyBaseline !== bNeedsDailyBaseline) return aNeedsDailyBaseline ? -1 : 1
                if (aNeedsDailyBaseline && aMetadata.priority !== bMetadata.priority) return aMetadata.priority ? -1 : 1
                const aHasPrice = Number.isFinite(aQuote.price) && aQuote.price > 0
                const bHasPrice = Number.isFinite(bQuote.price) && bQuote.price > 0
                if (aHasPrice !== bHasPrice) return aHasPrice ? 1 : -1
                const aHasBaseline = Number.isFinite(aQuote.previousClose) && aQuote.previousClose > 0
                const bHasBaseline = Number.isFinite(bQuote.previousClose) && bQuote.previousClose > 0
                if (aHasBaseline !== bHasBaseline) return aHasBaseline ? 1 : -1
                const attemptedDifference = (snapshotRequestTimesRef.current[a] || 0) - (snapshotRequestTimesRef.current[b] || 0)
                if (attemptedDifference) return attemptedDifference
                if (aMetadata.priority !== bMetadata.priority) return aMetadata.priority ? -1 : 1
                return aMetadata.index - bMetadata.index
            })
        }

        const requestSnapshot = async (symbol) => {
            snapshotRequestTimesRef.current[symbol] = Date.now()
            lastSnapshotRequestAtRef.current = Date.now()
            try {
                const data = await fetchFinnhubQuote(symbol, apiKey, { maxAgeMs: 5000 })
                if (controller.signal.aborted) return
                delete retryAfterBySymbol[symbol]
                const price = Number(data.c)
                const previousClose = Number(data.pc)
                const validPrice = Number.isFinite(price) && price > 0
                const validPreviousClose = Number.isFinite(previousClose) && previousClose > 0
                if (validPrice || validPreviousClose) {
                    const now = Date.now()
                    const providerTimestamp = Number(data.t) > 0 ? Number(data.t) * 1000 : now
                    const previous = quotesRef.current[symbol] || {}
                    const nextQuote = {
                        ...previous,
                        price: validPrice ? price : previous.price,
                        previousClose: validPreviousClose ? previousClose : previous.previousClose,
                        change: Number.isFinite(Number(data.d)) ? Number(data.d) : previous.change,
                        changePercent: Number.isFinite(Number(data.dp)) ? Number(data.dp) : previous.changePercent,
                        high: Number(data.h) || null,
                        low: Number(data.l) || null,
                        cachedAt: null,
                        snapshotAt: now,
                        baselineMarketDate: getEasternMarketDate(providerTimestamp),
                        baselineCheckedDate: getEasternMarketDate(now),
                        error: null
                    }
                    quotesRef.current[symbol] = nextQuote
                    quoteStore.publish(symbol, nextQuote)
                }
            } catch (error) {
                if (error?.name === 'AbortError') return
                if (error?.status === 429) {
                    rateLimitCooldownUntil = Math.max(rateLimitCooldownUntil, Date.now() + 5000)
                    retryAfterBySymbol[symbol] = Date.now() + 60000
                    const previous = quotesRef.current[symbol] || {}
                    const nextQuote = { ...previous, error: 'RATE LIMITED', healthAt: Date.now() }
                    quotesRef.current[symbol] = nextQuote
                    quoteStore.publish(symbol, nextQuote)
                }
            }
        }

        const loadSnapshots = async () => {
            const checkedDate = getEasternMarketDate()
            const startupTargets = getEligibleTargets()
                .filter((symbol) => {
                    const quote = quotesRef.current[symbol] || {}
                    const hasPrice = Number.isFinite(quote.price) && quote.price > 0
                    const hasBaseline = Number.isFinite(quote.previousClose) && quote.previousClose > 0
                    return !hasPrice || !hasBaseline || quote.baselineCheckedDate !== checkedDate
                })
                .slice(0, STARTUP_SNAPSHOT_BURST_SIZE)

            if (startupTargets.length > 0) await Promise.all(startupTargets.map(requestSnapshot))

            while (!controller.signal.aborted) {
                if (!documentVisibleRef.current) {
                    await wait(1000)
                    continue
                }
                const eligible = getEligibleTargets()

                if (eligible.length === 0) {
                    await wait(1000)
                    continue
                }

                const rateLimitDelay = Math.max(
                    0,
                    SNAPSHOT_INTERVAL_MS - (Date.now() - lastSnapshotRequestAtRef.current),
                    rateLimitCooldownUntil - Date.now()
                )
                if (rateLimitDelay) await wait(rateLimitDelay)
                if (controller.signal.aborted) return

                const symbol = eligible[0]
                await requestSnapshot(symbol)
            }
        }

        loadSnapshots()
        return () => controller.abort()
    }, [apiKey, quoteStore, symbolKey, widgets])

    const addWidget = () => {
        const symbol = cleanSymbol(newSymbol)
        if (!symbol) {
            setAddWidgetError('Enter a symbol first.')
            return
        }
        const normalized = providerSymbol(symbol)
        const existingWidget = widgets.find((widget) => providerSymbol(widget.symbol) === normalized)
        if (existingWidget) {
            setAddWidgetError(`${displaySymbol(symbol)} is already on the dashboard.`)
            setHighlightedWidgetId(existingWidget.id)
            if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
            highlightTimerRef.current = window.setTimeout(() => setHighlightedWidgetId(null), 1800)
            return
        }
        const themeId = THEME_BY_ID[newThemeId] ? newThemeId : 'other'
        const widget = { id: makeId(), symbol, themeId, priority: false }
        setWidgets((current) => [...current, widget])
        setLayouts((current) => appendWidgetToLayouts(current, widgets, widget))
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
        const normalized = providerSymbol(symbol)
        const existingWidget = widgets.find((widget) => widget.id !== widgetId && providerSymbol(widget.symbol) === normalized)
        if (existingWidget) {
            setAddWidgetError(`${displaySymbol(symbol)} is already on the dashboard.`)
            setHighlightedWidgetId(existingWidget.id)
            if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
            highlightTimerRef.current = window.setTimeout(() => setHighlightedWidgetId(null), 1800)
            return
        }
        setWidgets((current) => current.map((widget) => widget.id === widgetId ? { ...widget, symbol } : widget))
        setAddWidgetError('')
        setEditingWidgetId(null)
    }

    const toggleWidgetPriority = (widgetId) => {
        setWidgets((current) => current.map((widget) => (
            widget.id === widgetId ? { ...widget, priority: !widget.priority } : widget
        )))
    }

    const resetDashboard = () => {
        const nextWidgets = createStarterWidgets()
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

    // Dashboard status messages now surface as dismissable amber toasts in the
    // bottom-right stack (alongside the red breaking-news headlines) instead of
    // full-width bars that push the widget grid down.
    const systemAlerts = useMemo(() => {
        const alerts = []
        if (!apiKey) {
            alerts.push({
                id: 'missing-key',
                text: 'Add your free Finnhub API key to start the live stream — the setup walkthrough shows you how.',
                action: onSetupApiKeys ? { label: 'Set up API keys →', onClick: onSetupApiKeys } : null,
            })
        }
        if (connectionError) alerts.push({ id: 'connection-error', text: connectionError })
        if (subscriptionNotice) alerts.push({ id: 'subscription', text: subscriptionNotice })
        return alerts
    }, [apiKey, connectionError, subscriptionNotice, onSetupApiKeys])

    return (
        <section className={`finnhub-diagnostic-shell ${fullScreen ? 'is-fullscreen' : ''} ${chromeCollapsed ? 'chrome-collapsed' : ''}`}>
            <header className="finnhub-diagnostic-toolbar">
                <div className="diagnostic-brand">
                    <div className="diagnostic-kicker">FINNHUB // STREAM DIAGNOSTIC</div>
                    <div className="diagnostic-title">STOCK STICKIES TERMINAL</div>
                </div>

                <DashboardStats
                    hidden={chromeCollapsed}
                    widgetCount={widgets.length}
                    streamedCount={streamedSymbols.length}
                    uniqueSymbolCount={uniqueSymbolCount}
                    quotesRef={quotesRef}
                    quoteStore={quoteStore}
                    totalEventsRef={totalEventsRef}
                    eventsThisSecondRef={eventsThisSecondRef}
                    documentVisibleRef={documentVisibleRef}
                />

                <div className="diagnostic-connection">
                    <span className={`connection-light ${connectedClass}`} />
                    <span>{displayedConnectionState.replace('-', ' ').toUpperCase()}</span>
                </div>
                <div className="diagnostic-toolbar-actions">
                    <button
                        type="button"
                        className="diagnostic-chrome-toggle"
                        onClick={() => setChromeCollapsed((current) => !current)}
                        title={chromeCollapsed ? 'Show toolbar and controls' : 'Minimize toolbar for more widget space'}
                        aria-label={chromeCollapsed ? 'Expand dashboard toolbar' : 'Minimize dashboard toolbar'}
                        aria-pressed={chromeCollapsed}
                    >
                        {chromeCollapsed ? '▾' : '▴'}
                    </button>
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
                </div>
            </header>

            {!chromeCollapsed && (
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
            )}

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
                    preventCollision={true}
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
                                quoteStore={quoteStore}
                                streamEnabled={streamedSymbolSet.has(providerSymbol(widget.symbol))}
                                connectionState={displayedConnectionState}
                                streamPaused={streamPaused}
                                editing={editingWidgetId === widget.id}
                                highlighted={highlightedWidgetId === widget.id}
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
                <span>★ PRIORITIZES LIVE STREAMING + DAILY STARTUP</span>
                <span>DRAG ANY TILE · RESIZE FROM LOWER CORNERS</span>
                <span>PRIORITY STARTUP BURST · SNAPSHOT-ONLY TILES ROTATE AT 48/MIN</span>
            </footer>

            <BreakingNewsTicker systemAlerts={systemAlerts} />
        </section>
    )
}
