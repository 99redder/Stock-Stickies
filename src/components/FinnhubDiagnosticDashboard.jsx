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
// Finnhub's free REST limit is 60 calls/minute (and 30/second) per key, shared with
// the rest of the app. The startup burst spends part of that budget at once, then a
// sliding one-minute window keeps the steady pace under it with some headroom.
const STARTUP_SNAPSHOT_BURST_SIZE = 25
const SNAPSHOT_REQUESTS_PER_MINUTE = 50
// A streamed symbol with no trade for this long (since it last traded, or since it
// was subscribed) gets a REST snapshot, then another every interval while quiet.
const STALE_STREAM_AFTER_MS = 15000
const STALE_STREAM_SNAPSHOT_INTERVAL_MS = 30000
// Non-streaming widgets refresh together from /api/quotes (one request, no Finnhub
// calls). A symbol the batch priced recently is skipped by the per-symbol Finnhub
// queue, which takes over on its own if the batch endpoint stops answering.
const QUOTES_BATCH_ENDPOINT = '/api/quotes'
const BATCH_POLL_INTERVAL_MS = 15000
const BATCH_COVERAGE_MS = 60000
const SUBSCRIPTION_CAP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
// Crypto trades arrive on the stream with no previous close, so the tile had nothing to
// compute a change from. The batch endpoint supplies one (Yahoo's BTC-USD: the prior UTC
// day's close), re-read this often because that day rolls over at 8 PM Eastern.
const CRYPTO_BASELINE_INTERVAL_MS = 5 * 60 * 1000
// Stream symbol → symbol for /api/quotes; null when the batch cannot price it.
const batchSymbolFor = (symbol) => {
    if (!symbol.includes(':')) return symbol
    const pair = /^BINANCE:([A-Z0-9]{2,8})USDT$/.exec(symbol)
    return pair ? `${pair[1]}-USD` : null
}

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

// Picked during onboarding: 'basics' is the market overview + Mag 7; 'starter' adds three
// of the owner's themed groups (~37 symbols, under Finnhub's free 50-symbol stream cap).
const STARTER_PACK_THEME_IDS = {
    basics: ['market', 'mag7'],
    starter: ['market', 'mag7', 'ai', 'space', 'nuclear'],
}

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

// A saved-dashboard object (same shape the component persists) for an onboarding pack.
// eslint-disable-next-line react-refresh/only-export-components
export const buildStarterDashboard = (pack) => {
    const themeIds = new Set(STARTER_PACK_THEME_IDS[pack] || STARTER_PACK_THEME_IDS.basics)
    const widgets = createDefaultWidgets().filter((widget) => themeIds.has(widget.themeId))
    return { version: DASHBOARD_VERSION, widgets, layouts: createDashboardLayouts(widgets), savedAt: Date.now() }
}

// ---- Paged board (iPad) ----------------------------------------------------------
// A second presentation of the same widgets: large fixed tiles in swipeable pages
// instead of the draggable grid. A page is PAGED_COLUMNS_PER_PAGE columns of groups;
// the market group stays pinned above every page. It is saved separately from the
// desktop dashboard (own localStorage key, own account field).
const PAGED_STORAGE_KEY = 'stock-stickies-ipad-board-v1'
const PAGED_BOARD_VERSION = 1
const PAGED_PINNED_THEME_ID = 'market'
const PAGED_COLUMNS_PER_PAGE = 2
const PAGED_TILES_PER_ROW = 3
// What fits in one column without scrolling on an 11" iPad in landscape.
const PAGED_COLUMN_ROWS = 7
const PAGED_COLUMN_GROUPS = 3
// A streamed page with no socket message for this long during the regular session
// has a dead connection (iPadOS can leave one open-looking after a suspend).
const STREAM_WATCHDOG_SILENCE_MS = 90000
// Reconnects back off (3s, 6s, 12s … up to a minute) so a refused connection — the key
// is already streaming on another device, or Finnhub is rate-limiting — is not hammered.
const RECONNECT_BASE_DELAY_MS = 3000
const RECONNECT_MAX_DELAY_MS = 60000
// Finnhub allows only 5 stream connections per window (its 429 carries
// x-ratelimit-limit: 5), so only a connection that lasted this long resets the backoff;
// one that opens and drops again must not retry at the base delay.
const RECONNECT_STABLE_AFTER_MS = 60000
// The paged board never probes for the stream cap (subscribing past it is the riskiest
// thing a connection does); it stays under Finnhub's free limit of 50 symbols.
const PAGED_STREAM_CAP = 45
// Starting arrangement, two columns per page: Mag 7 with AI; drones and space with
// defense; healthcare with defensive. Groups not listed are packed after these.
const PAGED_DEFAULT_COLUMNS = [
    ['mag7', 'financials'], ['ai', 'robotics'],
    ['drones', 'space'], ['defense', 'nuclear', 'energy'],
    ['healthcare', 'defensive'], ['china', 'other']
]

const sanitizeBoardWidgets = (list) => (Array.isArray(list) ? list : [])
    .filter((widget) => widget && typeof widget.id === 'string' && cleanSymbol(widget.symbol))
    .map((widget) => ({
        id: widget.id,
        symbol: cleanSymbol(widget.symbol),
        themeId: THEME_BY_ID[widget.themeId] ? widget.themeId : 'other',
        priority: Boolean(widget.priority)
    }))

const pagedThemeRows = (widgets, themeId) => Math.max(1, Math.ceil(
    widgets.filter((widget) => widget.themeId === themeId).length / PAGED_TILES_PER_ROW
))

// Keeps the saved column of every group that still has widgets, and packs groups
// that have no column yet into the last one while it has room.
const arrangePagedColumns = (savedColumns, widgets) => {
    const activeThemeIds = CLUSTER_THEME_ORDER.filter((themeId) => (
        themeId !== PAGED_PINNED_THEME_ID && widgets.some((widget) => widget.themeId === themeId)
    ))
    const active = new Set(activeThemeIds)
    const placed = new Set()
    const columns = (Array.isArray(savedColumns) ? savedColumns : []).map((column) => (
        (Array.isArray(column) ? column : []).filter((themeId) => {
            if (!active.has(themeId) || placed.has(themeId)) return false
            placed.add(themeId)
            return true
        })
    ))
    const hasRoom = (column, themeId) => column.length < PAGED_COLUMN_GROUPS
        && column.reduce((rows, id) => rows + pagedThemeRows(widgets, id), 0) + pagedThemeRows(widgets, themeId) <= PAGED_COLUMN_ROWS
    activeThemeIds.filter((themeId) => !placed.has(themeId)).forEach((themeId) => {
        const lastColumn = columns[columns.length - 1]
        if (lastColumn && lastColumn.length > 0 && hasRoom(lastColumn, themeId)) lastColumn.push(themeId)
        else columns.push([themeId])
    })
    return columns.filter((column) => column.length > 0)
}

// The desktop dashboard's widgets in on-screen order, as the starting point for the board.
const pagedSeedWidgets = (desktopDashboard) => {
    const widgets = sanitizeBoardWidgets(desktopDashboard?.widgets)
    if (widgets.length === 0) return createDefaultWidgets()
    const positions = new Map((Array.isArray(desktopDashboard?.layouts?.lg) ? desktopDashboard.layouts.lg : []).map((item) => [item?.i, item]))
    const seen = new Set()
    return widgets
        .map((widget, index) => ({ widget, index, item: positions.get(widget.id) }))
        .sort((a, b) => ((a.item?.y ?? Infinity) - (b.item?.y ?? Infinity)) || ((a.item?.x ?? 0) - (b.item?.x ?? 0)) || (a.index - b.index))
        .map(({ widget }) => widget)
        .filter((widget) => {
            const symbol = providerSymbol(widget.symbol)
            if (seen.has(symbol)) return false
            seen.add(symbol)
            return true
        })
}

const readPagedBoard = (value) => {
    if (!value || typeof value !== 'object') return null
    const widgets = sanitizeBoardWidgets(value.widgets)
    if (widgets.length === 0) return null
    // Columns are stored as objects because Firestore rejects nested arrays.
    const columns = Array.isArray(value.columns) ? value.columns.map((column) => column?.themes) : null
    return { widgets, columns, savedAt: Number(value.savedAt) || 0 }
}

// The newer of this device's copy and the account's copy wins; with neither, the
// board starts as a copy of the desktop dashboard.
const loadPagedBoard = (accountBoard, desktopDashboard) => {
    let local = null
    try {
        local = readPagedBoard(JSON.parse(localStorage.getItem(PAGED_STORAGE_KEY) || 'null'))
    } catch {
        // An unreadable local copy falls back to the account's.
    }
    const account = readPagedBoard(accountBoard)
    const saved = local && account ? (account.savedAt > local.savedAt ? account : local) : (local || account)
    // A board that has never been edited (savedAt 0) follows the current default pages.
    if (saved) return { widgets: saved.widgets, columns: arrangePagedColumns(saved.savedAt ? saved.columns : PAGED_DEFAULT_COLUMNS, saved.widgets), savedAt: saved.savedAt }
    const widgets = pagedSeedWidgets(desktopDashboard)
    return { widgets, columns: arrangePagedColumns(PAGED_DEFAULT_COLUMNS, widgets), savedAt: 0 }
}

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

const isThemeHeaderItem = (item) => typeof item?.i === 'string' && item.i.startsWith('theme-heading-')

const overlapsColumns = (item, x, w) => item.x < x + w && item.x + item.w > x

// Places a widget inside its theme's section. A full section grows by one row: the
// sections stacked below it in the same columns shift down to make room, so a new
// tile never spills into the next group's empty slots.
const appendWidgetToLayout = (layout, columns, existingWidgets, widget) => {
    let nextLayout = [...layout]
    let header = nextLayout.find((item) => item.i === themeHeaderId(widget.themeId))

    if (!header) {
        const clusterColumns = columns >= 24 ? 3 : columns >= 12 ? 2 : 1
        const clusterGap = 1
        const clusterWidth = Math.floor((columns - clusterGap * (clusterColumns - 1)) / clusterColumns)
        const bottom = nextLayout.reduce((maximum, item) => Math.max(maximum, item.y + item.h), 0)
        header = { i: themeHeaderId(widget.themeId), x: 0, y: bottom + 1, w: clusterWidth, h: 1, static: true }
        nextLayout.push(header)
    }

    const themeWidgetIds = new Set(existingWidgets.filter((item) => item.themeId === widget.themeId && item.id !== widget.id).map((item) => item.id))
    const themeLayoutItems = nextLayout.filter((item) => themeWidgetIds.has(item.i))
    const template = themeLayoutItems[0]
    const width = Math.min(template?.w || Math.max(2, Math.floor(header.w / (header.w >= 9 ? 3 : header.w >= 6 ? 2 : 1))), header.w)
    const height = template?.h || 2
    const sectionIds = new Set([header.i, ...themeLayoutItems.map((item) => item.i)])
    const sectionBottom = Math.max(header.y + 1, ...themeLayoutItems.map((item) => item.y + item.h))
    const makeItem = (x, y) => ({ i: widget.id, x, y, w: width, h: height, minW: 2, minH: 2, maxW: 8, maxH: 5 })

    // A free slot inside the section's current rows.
    for (let y = header.y + 1; y + height <= sectionBottom; y += height) {
        for (let x = header.x; x + width <= header.x + header.w; x += width) {
            const candidate = makeItem(x, y)
            if (!nextLayout.some((item) => layoutItemsCollide(candidate, item))) return [...nextLayout, candidate]
        }
    }

    // Otherwise add a row under the section, pushing what sits below it down.
    const placement = makeItem(header.x, sectionBottom)
    const shiftBelow = (items, onlySectionColumns) => items.map((item) => (
        !sectionIds.has(item.i) && item.y + item.h > sectionBottom && (!onlySectionColumns || overlapsColumns(item, header.x, header.w))
            ? { ...item, y: item.y + height }
            : item
    ))
    let shifted = shiftBelow(nextLayout, true)
    if (layoutHasCollisions([...shifted, placement])) shifted = shiftBelow(nextLayout, false)
    return [...shifted, placement]
}

const appendWidgetToLayouts = (currentLayouts, existingWidgets, widget) => Object.fromEntries(
    Object.entries(GRID_COLUMNS).map(([breakpoint, columns]) => {
        const layout = Array.isArray(currentLayouts?.[breakpoint]) ? currentLayouts[breakpoint] : createGodelLayout(existingWidgets, columns)
        return [breakpoint, appendWidgetToLayout(layout, columns, existingWidgets, widget)]
    })
)

// Earlier builds dropped a new tile into the first free slot below a full section,
// which could be inside the next group (an Energy ticker among Health Care). Move any
// tile whose nearest group header above it is another group's back into its own.
const repairStrandedWidgets = ({ widgets, layouts }) => {
    const widgetById = new Map(widgets.map((widget) => [widget.id, widget]))
    const nextLayouts = Object.fromEntries(Object.entries(layouts).map(([breakpoint, layout]) => {
        if (!Array.isArray(layout)) return [breakpoint, layout]
        const headers = layout.filter(isThemeHeaderItem)
        const stranded = layout.filter((item) => {
            const widget = widgetById.get(item.i)
            if (!widget) return false
            const owner = headers
                .filter((header) => header.y < item.y && overlapsColumns(item, header.x, header.w))
                .sort((a, b) => b.y - a.y)[0]
            return owner && owner.i !== themeHeaderId(widget.themeId)
                && headers.some((header) => header.i === themeHeaderId(widget.themeId))
        })
        if (stranded.length === 0) return [breakpoint, layout]
        const strandedIds = new Set(stranded.map((item) => item.i))
        let nextLayout = layout.filter((item) => !strandedIds.has(item.i))
        stranded.forEach((item) => {
            const placedWidgets = widgets.filter((widget) => nextLayout.some((placed) => placed.i === widget.id))
            nextLayout = appendWidgetToLayout(nextLayout, GRID_COLUMNS[breakpoint] || 30, placedWidgets, widgetById.get(item.i))
        })
        return [breakpoint, nextLayout]
    }))
    return { widgets, layouts: nextLayouts }
}

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
        return repairStrandedWidgets(migrateDashboardThemes({ widgets, layouts }, Number(saved.version) || 0))
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
                                ? (streamEnabled ? 'SAVED · AWAITING TRADE' : 'SAVED · IN QUEUE')
                                : quote?.lastEventAt
                                    ? `${!isCrypto && !isRegularUsMarketSession() ? 'MARKET CLOSED' : 'STREAM IDLE'} · ${formatQuoteTime(liveTimestamp)}`
                                    : quote?.snapshotAt
                                        ? `${streamEnabled ? 'SNAPSHOT' : 'SNAPSHOT ONLY'} · ${formatQuoteTime(quote.snapshotAt)}`
                                        : connectionState === 'missing-key'
                                            ? 'API KEY NEEDED'
                                            : streamEnabled ? 'STREAM READY' : 'QUEUED'
    const feedTitle = feedLabel.startsWith('SAVED')
        ? streamEnabled
            ? `Price saved at ${formatQuoteTime(quote.cachedAt)}. Streaming live, but no trade has arrived yet; a snapshot will refresh it shortly.`
            : `Price saved at ${formatQuoteTime(quote.cachedAt)}. Beyond Finnhub's live-stream limit, so it refreshes with snapshots about every 15 seconds and is waiting for the next one.`
        : feedLabel.startsWith('SNAPSHOT ONLY')
            ? "Beyond Finnhub's live-stream limit; refreshed with a snapshot about every 15 seconds."
            : feedLabel.startsWith('SNAPSHOT')
                ? 'Streaming live, but no recent trade; showing the latest snapshot.'
                : undefined

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
                    <span className={`quote-freshness ${isFresh ? 'is-live' : ''}`} title={feedTitle}>{feedLabel}</span>
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

// Read-only tile for the paged board: bigger type, no drag. Edit mode adds reorder
// and remove buttons.
const PagedQuoteTile = React.memo(function PagedQuoteTile({ widget, quoteStore, streamEnabled, connectionState, highlighted, editing, onMove, onRemove }) {
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
    const percentLabel = isDaily
        ? (Number.isFinite(change) ? `${formatSigned(change * 100, 0)} BP` : '')
        : (Number.isFinite(changePercent) ? `${formatSigned(changePercent)}%` : '')
    const changeLabel = !isDaily && Number.isFinite(change) ? formatSigned(change) : ''
    const status = isDaily
        ? `DAILY${quote?.sourceDate ? ` · ${quote.sourceDate}` : ''}`
        : quote?.error === 'RATE LIMITED'
            ? 'RATE LIMITED'
            : connectionState === 'missing-key'
                ? 'API KEY NEEDED'
                : streamEnabled && connectionState !== 'connected'
                    ? 'RECONNECTING'
                    : isFresh
                        ? 'LIVE'
                        : quote?.cachedAt
                            ? 'SAVED'
                            : !isCrypto && !isRegularUsMarketSession()
                                ? 'CLOSED'
                                : quote?.lastEventAt || quote?.snapshotAt
                                    ? `${streamEnabled ? 'QUIET' : 'SNAPSHOT'} · ${formatQuoteTime(Math.max(Number(quote.lastEventAt) || 0, Number(quote.snapshotAt) || 0))}`
                                    : 'WAITING'

    return (
        <div className={`paged-tile quote-${direction} ${highlighted ? 'is-highlighted' : ''}`}>
            <div key={quote?.events || 'no-live-ticks'} className={`paged-tile-body ${quote?.events ? 'quote-tick-blink' : ''}`}>
                <div className="paged-tile-row">
                    <span className="paged-tile-symbol">{displaySymbol(widget.symbol)}</span>
                    <span className="paged-tile-percent">{percentLabel}</span>
                </div>
                <div className="paged-tile-price">
                    {Number.isFinite(price) ? (isDaily ? `${formatPrice(price)}%` : `$${formatPrice(price)}`) : '—'}
                </div>
                <div className="paged-tile-row paged-tile-foot">
                    <span className={`paged-tile-status ${isFresh ? 'is-live' : ''}`}>{status}</span>
                    <span className="paged-tile-change">{changeLabel}</span>
                </div>
            </div>
            {editing && (
                <div className="paged-tile-edit">
                    <button type="button" onClick={() => onMove(widget.id, -1)} aria-label={`Move ${displaySymbol(widget.symbol)} earlier`}>‹</button>
                    <button type="button" className="is-remove" onClick={() => onRemove(widget.id)} aria-label={`Remove ${displaySymbol(widget.symbol)}`}>×</button>
                    <button type="button" onClick={() => onMove(widget.id, 1)} aria-label={`Move ${displaySymbol(widget.symbol)} later`}>›</button>
                </div>
            )}
        </div>
    )
}, (previous, next) => (
    previous.widget === next.widget
    && previous.quoteStore === next.quoteStore
    && previous.streamEnabled === next.streamEnabled
    && previous.connectionState === next.connectionState
    && previous.highlighted === next.highlighted
    && previous.editing === next.editing
))

// Shown in the board's edit bar so a layout problem on the tablet can be reported
// exactly: build, Home Screen mode, and the insets the browser reports.
const PAGED_BUILD = 12
const isHomeScreenApp = () => typeof window !== 'undefined' && (
    window.navigator?.standalone === true || Boolean(window.matchMedia?.('(display-mode: standalone)').matches)
)
const readSafeAreaInsets = () => {
    try {
        const probe = document.createElement('div')
        probe.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)'
        document.body.appendChild(probe)
        const style = window.getComputedStyle(probe)
        const insets = `${parseFloat(style.paddingTop) || 0}/${parseFloat(style.paddingBottom) || 0}`
        probe.remove()
        return insets
    } catch {
        return '?'
    }
}

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
function BreakingNewsTicker({ systemAlerts = [], maxHeadlines = MAX_VISIBLE_HEADLINES }) {
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
        .slice(0, maxHeadlines)

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

export default function FinnhubDiagnosticDashboard({ apiKey, persistedDashboard = null, onDashboardChange, fullScreen = false, onExit, onSetupApiKeys, paged = false, seedDashboard = null, onSignOut }) {
    const [initial] = useState(() => paged ? loadPagedBoard(persistedDashboard, seedDashboard) : loadSavedDashboard(persistedDashboard))
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
    const [boardColumns, setBoardColumns] = useState(initial.columns)
    // Changes only on an edit, so the newest copy (this device or the account) can win.
    const [boardSavedAt, setBoardSavedAt] = useState(initial.savedAt || 0)
    const [boardEditing, setBoardEditing] = useState(false)
    const [activePage, setActivePage] = useState(0)
    const [homeScreenApp] = useState(isHomeScreenApp)
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
    const snapshotRequestLogRef = useRef([])
    const subscribedAtRef = useRef({})
    const batchCoveredAtRef = useRef({})
    const batchSettledAtRef = useRef(0)
    const layoutsRef = useRef(initial.layouts)
    layoutsRef.current = layouts
    const subscriptionTimerRef = useRef(null)
    const lastSubscriptionAttemptRef = useRef('')
    const subscriptionCapRef = useRef(initialSubscriptionCap)
    const highlightTimerRef = useRef(null)
    const lastSocketMessageAtRef = useRef(0)
    const reconnectAttemptsRef = useRef(0)
    // Last few stream drops (close code, how long it was up, messages received), shown
    // in the paged board's edit bar to diagnose reconnect loops on the tablet.
    const streamDropLogRef = useRef([])
    const socketOpenedAtRef = useRef(0)
    const socketMessageCountRef = useRef(0)
    const pageTrackRef = useRef(null)
    const pageSettleTimerRef = useRef(null)
    const seedDashboardRef = useRef(seedDashboard)
    seedDashboardRef.current = seedDashboard

    const columns = useMemo(() => paged ? arrangePagedColumns(boardColumns, widgets) : [], [paged, boardColumns, widgets])
    const pages = useMemo(() => {
        const next = []
        for (let index = 0; index < columns.length; index += PAGED_COLUMNS_PER_PAGE) next.push(columns.slice(index, index + PAGED_COLUMNS_PER_PAGE))
        return next.length > 0 ? next : [[]]
    }, [columns])
    const shownPage = Math.min(activePage, pages.length - 1)
    const visibleThemeKey = paged ? [PAGED_PINNED_THEME_ID, ...pages[shownPage].flat()].join('|') : ''
    // Stream order: what is on screen first on the paged board, starred tiles first
    // on the desktop grid. Whatever falls beyond Finnhub's cap refreshes by snapshot.
    const streamOrderedWidgets = useMemo(() => {
        const streamable = widgets.filter((widget) => !isDailyMacroSymbol(widget.symbol))
        const visibleThemeIds = visibleThemeKey ? new Set(visibleThemeKey.split('|')) : null
        const goesFirst = (widget) => visibleThemeIds ? visibleThemeIds.has(widget.themeId) : widget.priority
        return [...streamable.filter(goesFirst), ...streamable.filter((widget) => !goesFirst(widget))]
    }, [widgets, visibleThemeKey])

    const symbolKey = useMemo(() => widgets.map((widget) => providerSymbol(widget.symbol)).sort().join('|'), [widgets])

    useEffect(() => {
        if (!paged) return
        const board = { version: PAGED_BOARD_VERSION, widgets, columns: columns.map((themes) => ({ themes })), savedAt: boardSavedAt }
        try {
            localStorage.setItem(PAGED_STORAGE_KEY, JSON.stringify(board))
        } catch {
            // The account copy still holds the board when browser storage is blocked/full.
        }
        onDashboardChange?.(board)
    }, [paged, widgets, columns, boardSavedAt, onDashboardChange])

    useEffect(() => {
        if (paged) return
        // JSON round-tripping strips any undefined layout metadata before this
        // object reaches Firestore, which rejects undefined nested values.
        const dashboard = JSON.parse(JSON.stringify({ version: DASHBOARD_VERSION, widgets, layouts, savedAt: Date.now() }))
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboard))
        } catch {
            // Account sync remains available when browser storage is blocked/full.
        }
        onDashboardChange?.(dashboard)
    }, [paged, widgets, layouts, onDashboardChange])

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
                lastSocketMessageAtRef.current = Date.now()
                socketOpenedAtRef.current = Date.now()
                socketMessageCountRef.current = 0
                setConnectionState('connected')
                setSocketEpoch((current) => current + 1)
            }

            socket.onmessage = (event) => {
                if (!active) return
                lastSocketMessageAtRef.current = Date.now()
                socketMessageCountRef.current += 1
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
                            setSubscriptionNotice(`Finnhub accepted ${accepted.length} simultaneous symbols on this API key. The remaining widgets refresh with snapshots about every 15 seconds.`)
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
                if (active) setConnectionError('Finnhub live stream could not connect. Prices still refresh every 15 seconds. Check that the Live Dashboard is not open on another device or tab.')
            }
            socket.onclose = (event) => {
                if (!active) return
                const openedAt = socketOpenedAtRef.current
                socketOpenedAtRef.current = 0
                if (openedAt && Date.now() - openedAt >= RECONNECT_STABLE_AFTER_MS) reconnectAttemptsRef.current = 0
                streamDropLogRef.current = [...streamDropLogRef.current.slice(-3), [
                    new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
                    `code ${event?.code ?? '?'}${event?.reason ? ` ${String(event.reason).slice(0, 40)}` : ''}`,
                    openedAt ? `up ${Math.round((Date.now() - openedAt) / 1000)}s` : 'never opened',
                    `${socketMessageCountRef.current} msgs`,
                    `${subscribedSymbolsRef.current.size} subs`,
                    document.visibilityState === 'visible' ? '' : 'hidden'
                ].filter(Boolean).join(' · ')]
                socketRef.current = null
                subscribedSymbolsRef.current = new Set()
                setStreamedSymbols([])
                setConnectionState('reconnecting')
                const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttemptsRef.current)
                reconnectAttemptsRef.current += 1
                reconnectTimerRef.current = setTimeout(connect, delay)
            }
        }

        connect()
        // A socket that still reads OPEN but has gone silent while the market is
        // trading is dead (a tablet suspend can leave one behind): replace it.
        const watchdog = window.setInterval(() => {
            const socket = socketRef.current
            if (!socket || socket.readyState !== WebSocket.OPEN) return
            if (!documentVisibleRef.current || subscribedSymbolsRef.current.size === 0 || !isRegularUsMarketSession()) return
            if (Date.now() - lastSocketMessageAtRef.current < STREAM_WATCHDOG_SILENCE_MS) return
            socket.onopen = null
            socket.onmessage = null
            socket.onerror = null
            socket.onclose = null
            try { socket.close() } catch { /* already gone */ }
            socketRef.current = null
            connect()
        }, 15000)
        return () => {
            active = false
            window.clearInterval(watchdog)
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
        streamOrderedWidgets.forEach((widget) => {
            const symbol = providerSymbol(widget.symbol)
            if (symbol && !seenSymbols.has(symbol)) {
                seenSymbols.add(symbol)
                orderedSymbols.push(symbol)
            }
        })
        const wanted = new Set(orderedSymbols)
        const subscribed = subscribedSymbolsRef.current
        const knownCap = paged ? Math.min(subscriptionCapRef.current ?? PAGED_STREAM_CAP, PAGED_STREAM_CAP) : subscriptionCapRef.current
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
                ? `Finnhub accepted ${knownCap} simultaneous symbols on this API key. ${snapshotOnlyCount} widget${snapshotOnlyCount === 1 ? ' refreshes' : 's refresh'} with snapshots about every 15 seconds.`
                : '')

            queue.forEach((symbol) => {
                lastSubscriptionAttemptRef.current = symbol
                socket.send(JSON.stringify({ type: 'subscribe', symbol }))
                subscribed.add(symbol)
                subscribedAtRef.current[symbol] = Date.now()
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
            subscribedAtRef.current[symbol] = Date.now()
            setStreamedSymbols([...subscribed])
            subscriptionTimerRef.current = setTimeout(subscribeNext, SUBSCRIPTION_PROBE_DELAY_MS)
        }
        subscribeNext()

        return () => {
            if (subscriptionTimerRef.current) clearTimeout(subscriptionTimerRef.current)
        }
    }, [paged, symbolKey, socketEpoch, streamOrderedWidgets])

    useEffect(() => {
        // The paged board makes no Finnhub REST calls: the key's 60-a-minute allowance is
        // shared with the desktop app's price lookups, and Finnhub drops and refuses the
        // live stream once it is used up. Its snapshots come from /api/quotes alone.
        if (!apiKey || paged) return undefined
        const controller = new AbortController()
        const targetMetadata = new Map()
        // Rank widgets by where they sit on screen (top-to-bottom, left-to-right in
        // the wide layout) so the queue fills in what the user is looking at first.
        const layoutPositions = new Map((layoutsRef.current?.lg || []).map((item) => [item.i, item]))
        const screenRank = new Map([...widgets]
            .sort((a, b) => {
                const aItem = layoutPositions.get(a.id)
                const bItem = layoutPositions.get(b.id)
                return ((aItem?.y ?? Infinity) - (bItem?.y ?? Infinity)) || ((aItem?.x ?? 0) - (bItem?.x ?? 0))
            })
            .map((widget, rank) => [widget.id, rank]))
        widgets.forEach((widget) => {
            if (isDailyMacroSymbol(widget.symbol)) return
            const symbol = providerSymbol(widget.symbol)
            if (!symbol || symbol.includes(':')) return
            const existing = targetMetadata.get(symbol)
            const rank = screenRank.get(widget.id) ?? Infinity
            targetMetadata.set(symbol, {
                index: Math.min(existing?.index ?? Infinity, rank),
                priority: Boolean(existing?.priority || widget.priority)
            })
        })
        const targets = [...targetMetadata.keys()]
        // Symbols the stream will take once connected (same order and remembered cap
        // as the subscription effect); the startup burst spends its budget elsewhere.
        const expectedStreamedSymbols = (() => {
            const cap = subscriptionCapRef.current
            const streamable = widgets.filter((widget) => !isDailyMacroSymbol(widget.symbol))
            const ordered = [...new Set([...streamable.filter((widget) => widget.priority), ...streamable.filter((widget) => !widget.priority)]
                .map((widget) => providerSymbol(widget.symbol))
                .filter(Boolean))]
            return new Set(cap === null ? ordered : ordered.slice(0, cap))
        })()
        const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
        let rateLimitCooldownUntil = 0
        const retryAfterBySymbol = {}

        const getEligibleTargets = () => {
            const now = Date.now()
            const checkedDate = getEasternMarketDate(now)
            return targets.filter((symbol) => {
                if (now < (retryAfterBySymbol[symbol] || 0)) return false
                if (now - (batchCoveredAtRef.current[symbol] || 0) < BATCH_COVERAGE_MS) return false
                const quote = quotesRef.current[symbol] || {}
                const hasPrice = Number.isFinite(quote.price) && quote.price > 0
                const hasBaseline = Number.isFinite(quote.previousClose) && quote.previousClose > 0
                const needsInitialData = !hasPrice || !hasBaseline
                const attemptedAt = snapshotRequestTimesRef.current[symbol] || 0
                if (needsInitialData && now - attemptedAt < 60000) return false
                const isSubscribed = subscribedSymbolsRef.current.has(symbol)
                const quietSince = Math.max(Number(quote.lastEventAt) || 0, subscribedAtRef.current[symbol] || 0)
                const streamIsStale = isSubscribed && now - quietSince >= STALE_STREAM_AFTER_MS
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
            snapshotRequestLogRef.current.push(Date.now())
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

        // Requests made in the last minute, across effect restarts (the log is a ref).
        const requestsInLastMinute = () => {
            const cutoff = Date.now() - 60000
            const log = snapshotRequestLogRef.current
            while (log.length && log[0] <= cutoff) log.shift()
            return log.length
        }

        const loadSnapshots = async () => {
            // Give the first batch request a moment to land so the Finnhub burst only
            // spends calls on what it could not price.
            const waitStartedAt = Date.now()
            while (!batchSettledAtRef.current && Date.now() - waitStartedAt < 3000 && !controller.signal.aborted) await wait(100)
            if (controller.signal.aborted) return
            // Startup burst: symbols that won't stream first (they have no other way
            // to refresh), then the rest, each group in screen order.
            const eligibleAtStart = getEligibleTargets()
            const burstSize = Math.max(0, Math.min(STARTUP_SNAPSHOT_BURST_SIZE, SNAPSHOT_REQUESTS_PER_MINUTE - requestsInLastMinute()))
            const startupTargets = [
                ...eligibleAtStart.filter((symbol) => !expectedStreamedSymbols.has(symbol)),
                ...eligibleAtStart.filter((symbol) => expectedStreamedSymbols.has(symbol))
            ].slice(0, burstSize)

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

                const windowFullFor = requestsInLastMinute() >= SNAPSHOT_REQUESTS_PER_MINUTE
                    ? snapshotRequestLogRef.current[0] + 60000 - Date.now() + 50
                    : 0
                const rateLimitDelay = Math.max(
                    0,
                    SNAPSHOT_INTERVAL_MS - (Date.now() - lastSnapshotRequestAtRef.current),
                    rateLimitCooldownUntil - Date.now(),
                    windowFullFor
                )
                if (rateLimitDelay) {
                    await wait(rateLimitDelay)
                    // The eligible list is stale after a wait; pick again next pass.
                    continue
                }
                if (controller.signal.aborted) return

                const symbol = eligible[0]
                await requestSnapshot(symbol)
            }
        }

        loadSnapshots()
        return () => controller.abort()
    }, [apiKey, paged, quoteStore, symbolKey, widgets])

    useEffect(() => {
        const controller = new AbortController()
        const targets = [...new Set(widgets
            .filter((widget) => !isDailyMacroSymbol(widget.symbol))
            .map((widget) => providerSymbol(widget.symbol))
            .filter((symbol) => symbol && batchSymbolFor(symbol)))]
        if (targets.length === 0) return undefined
        const streamSymbolByBatchSymbol = new Map(targets.map((symbol) => [batchSymbolFor(symbol), symbol]))
        let timer = null

        const poll = async () => {
            if (controller.signal.aborted) return
            if (documentVisibleRef.current) {
                const now = Date.now()
                // Everything not actively streaming: beyond the stream cap, or
                // subscribed but without a trade for STALE_STREAM_AFTER_MS.
                const symbols = targets.filter((symbol) => {
                    if (symbol.includes(':')) return now - (batchCoveredAtRef.current[symbol] || 0) >= CRYPTO_BASELINE_INTERVAL_MS
                    if (!subscribedSymbolsRef.current.has(symbol)) return true
                    const quote = quotesRef.current[symbol] || {}
                    const quietSince = Math.max(Number(quote.lastEventAt) || 0, subscribedAtRef.current[symbol] || 0)
                    return now - quietSince >= STALE_STREAM_AFTER_MS
                }).map(batchSymbolFor).sort()
                if (symbols.length > 0) {
                    try {
                        const response = await fetch(`${QUOTES_BATCH_ENDPOINT}?symbols=${encodeURIComponent(symbols.join(','))}`, { signal: controller.signal })
                        if (!response.ok) throw new Error(`Quote batch returned ${response.status}`)
                        const data = await response.json()
                        const receivedAt = Date.now()
                        Object.entries(data?.quotes || {}).forEach(([batchSymbol, batchQuote]) => {
                            const symbol = streamSymbolByBatchSymbol.get(batchSymbol)
                            const batchPrice = Number(batchQuote?.price)
                            if (!symbol || !Number.isFinite(batchPrice) || batchPrice <= 0) return
                            const previous = quotesRef.current[symbol] || {}
                            const previousClose = Number(batchQuote.previousClose)
                            const validPreviousClose = Number.isFinite(previousClose) && previousClose > 0
                            // A trade that arrived while the request was in flight is newer:
                            // keep its price, and take only the previous close from the batch.
                            const tradeIsNewer = Boolean(previous.lastEventAt && previous.lastEventAt > now && Number.isFinite(previous.price))
                            if (tradeIsNewer && !validPreviousClose) return
                            const price = tradeIsNewer ? previous.price : batchPrice
                            const providerTimestamp = Number(batchQuote.timestamp) || receivedAt
                            const nextQuote = {
                                ...previous,
                                price,
                                previousClose: validPreviousClose ? previousClose : previous.previousClose,
                                change: validPreviousClose ? price - previousClose : Number.isFinite(Number(batchQuote.change)) ? Number(batchQuote.change) : previous.change,
                                changePercent: validPreviousClose ? ((price - previousClose) / previousClose) * 100 : Number.isFinite(Number(batchQuote.changePercent)) ? Number(batchQuote.changePercent) : previous.changePercent,
                                high: Number(batchQuote.high) || previous.high || null,
                                low: Number(batchQuote.low) || previous.low || null,
                                cachedAt: null,
                                snapshotAt: tradeIsNewer ? previous.snapshotAt : receivedAt,
                                ...(validPreviousClose ? {
                                    baselineMarketDate: getEasternMarketDate(providerTimestamp),
                                    baselineCheckedDate: getEasternMarketDate(receivedAt)
                                } : {}),
                                error: null
                            }
                            batchCoveredAtRef.current[symbol] = receivedAt
                            quotesRef.current[symbol] = nextQuote
                            quoteStore.publish(symbol, nextQuote)
                        })
                    } catch (error) {
                        if (error?.name === 'AbortError') return
                        // The Finnhub queue picks these symbols up once coverage lapses.
                    }
                    batchSettledAtRef.current = Date.now()
                }
            }
            if (!controller.signal.aborted) timer = setTimeout(poll, BATCH_POLL_INTERVAL_MS)
        }

        poll()
        return () => {
            controller.abort()
            if (timer) clearTimeout(timer)
        }
    }, [quoteStore, symbolKey, widgets])

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
        if (paged) setBoardSavedAt(Date.now())
        else setLayouts((current) => appendWidgetToLayouts(current, widgets, widget))
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

    // ---- Paged board actions (all functional updates: tiles are memoized) ----
    const removeBoardWidget = useCallback((widgetId) => {
        setWidgets((current) => current.filter((widget) => widget.id !== widgetId))
        setBoardSavedAt(Date.now())
    }, [])

    const moveBoardWidget = useCallback((widgetId, delta) => {
        setWidgets((current) => {
            const index = current.findIndex((widget) => widget.id === widgetId)
            if (index < 0) return current
            const themeIndexes = current.map((widget, position) => widget.themeId === current[index].themeId ? position : -1).filter((position) => position >= 0)
            const target = themeIndexes[themeIndexes.indexOf(index) + delta]
            if (target === undefined) return current
            const next = [...current]
            next[index] = current[target]
            next[target] = current[index]
            return next
        })
        setBoardSavedAt(Date.now())
    }, [])

    const moveBoardGroup = (themeId, direction) => {
        const next = columns.map((column) => [...column])
        const columnIndex = next.findIndex((column) => column.includes(themeId))
        if (columnIndex < 0) return
        const position = next[columnIndex].indexOf(themeId)
        if (direction === 'up' || direction === 'down') {
            const target = position + (direction === 'up' ? -1 : 1)
            if (target < 0 || target >= next[columnIndex].length) return
            next[columnIndex][position] = next[columnIndex][target]
            next[columnIndex][target] = themeId
        } else {
            const targetColumn = columnIndex + (direction === 'left' ? -1 : 1)
            if (targetColumn < 0) return
            if (targetColumn >= next.length && next[columnIndex].length === 1) return
            next[columnIndex].splice(position, 1)
            if (!next[targetColumn]) next[targetColumn] = []
            next[targetColumn].push(themeId)
        }
        setBoardColumns(next)
        setBoardSavedAt(Date.now())
    }

    const recopyFromDesktop = () => {
        if (!window.confirm('Replace this board\'s tickers with the ones on your desktop Live Dashboard? Your page arrangement is kept where the groups still exist.')) return
        setWidgets(pagedSeedWidgets(seedDashboardRef.current))
        setBoardColumns(columns)
        setBoardSavedAt(Date.now())
    }

    const resetBoardPages = () => {
        if (!window.confirm('Put the groups back on their default pages? Your tickers are kept.')) return
        setBoardColumns(PAGED_DEFAULT_COLUMNS)
        setBoardSavedAt(Date.now())
    }

    const goToPage = useCallback((index) => {
        const track = pageTrackRef.current
        if (!track) return
        const pageCount = track.children.length
        const target = Math.max(0, Math.min(pageCount - 1, index))
        track.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' })
    }, [])

    // The stream follows the page, so wait for a swipe to settle before switching.
    const handleTrackScroll = () => {
        if (pageSettleTimerRef.current) window.clearTimeout(pageSettleTimerRef.current)
        pageSettleTimerRef.current = window.setTimeout(() => {
            const track = pageTrackRef.current
            if (track && track.clientWidth > 0) setActivePage(Math.round(track.scrollLeft / track.clientWidth))
        }, 140)
    }

    useEffect(() => {
        if (!paged) return undefined
        const handleKeyDown = (event) => {
            if (event.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return
            if (event.key === 'ArrowRight') goToPage(shownPage + 1)
            if (event.key === 'ArrowLeft') goToPage(shownPage - 1)
        }
        // A rotation or Split View resize changes the page width; stay on the page.
        const handleResize = () => {
            const track = pageTrackRef.current
            if (track) track.scrollLeft = shownPage * track.clientWidth
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('resize', handleResize)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('resize', handleResize)
        }
    }, [paged, shownPage, goToPage])

    useEffect(() => () => {
        if (pageSettleTimerRef.current) window.clearTimeout(pageSettleTimerRef.current)
    }, [])

    // Keep the tablet's screen on while the board is showing.
    useEffect(() => {
        if (!paged || typeof navigator === 'undefined' || !navigator.wakeLock) return undefined
        let lock = null
        let released = false
        const acquire = async () => {
            if (released || document.visibilityState !== 'visible') return
            try {
                lock = await navigator.wakeLock.request('screen')
                if (released) lock.release().catch(() => {})
            } catch {
                // Low Power Mode or an old browser: the screen follows Auto-Lock.
            }
        }
        acquire()
        document.addEventListener('visibilitychange', acquire)
        return () => {
            released = true
            document.removeEventListener('visibilitychange', acquire)
            if (lock) lock.release().catch(() => {})
        }
    }, [paged])

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

    if (paged) {
        const renderTile = (widget) => (
            <PagedQuoteTile
                key={widget.id}
                widget={widget}
                quoteStore={quoteStore}
                streamEnabled={streamedSymbolSet.has(providerSymbol(widget.symbol))}
                connectionState={displayedConnectionState}
                highlighted={highlightedWidgetId === widget.id}
                editing={boardEditing}
                onMove={moveBoardWidget}
                onRemove={removeBoardWidget}
            />
        )
        const pinnedWidgets = widgets.filter((widget) => widget.themeId === PAGED_PINNED_THEME_ID)
        const lastColumnIndex = columns.length - 1

        return (
            <section className={`finnhub-diagnostic-shell is-fullscreen is-paged ${boardEditing ? 'is-editing' : ''} ${homeScreenApp ? 'is-home-screen-app' : ''}`}>
                <header className="paged-toolbar">
                    <div className="paged-brand">STOCK STICKIES</div>
                    <DashboardStats
                        hidden
                        widgetCount={widgets.length}
                        streamedCount={streamedSymbols.length}
                        uniqueSymbolCount={uniqueSymbolCount}
                        quotesRef={quotesRef}
                        quoteStore={quoteStore}
                        totalEventsRef={totalEventsRef}
                        eventsThisSecondRef={eventsThisSecondRef}
                        documentVisibleRef={documentVisibleRef}
                    />
                    <div className="diagnostic-connection paged-connection">
                        <span className={`connection-light ${connectedClass}`} />
                        <span>{displayedConnectionState.replace('-', ' ').toUpperCase()}</span>
                        <span className="paged-stream-count">{streamedSymbols.length}/{uniqueSymbolCount} STREAMING</span>
                    </div>
                    <nav className="paged-pager" aria-label="Board pages">
                        <button type="button" onClick={() => goToPage(shownPage - 1)} disabled={shownPage === 0} aria-label="Previous page">‹</button>
                        {pages.map((_, index) => (
                            <button
                                key={index}
                                type="button"
                                className={`paged-dot ${index === shownPage ? 'is-active' : ''}`}
                                onClick={() => goToPage(index)}
                                aria-label={`Page ${index + 1} of ${pages.length}`}
                                aria-current={index === shownPage ? 'page' : undefined}
                            />
                        ))}
                        <button type="button" onClick={() => goToPage(shownPage + 1)} disabled={shownPage >= pages.length - 1} aria-label="Next page">›</button>
                    </nav>
                    <button type="button" className={`paged-edit-toggle ${boardEditing ? 'is-active' : ''}`} onClick={() => setBoardEditing((current) => !current)}>
                        {boardEditing ? 'DONE' : 'EDIT'}
                    </button>
                </header>

                {boardEditing && (
                    <div className="finnhub-diagnostic-controls paged-controls">
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
                                aria-label="Symbol for new tile"
                                aria-invalid={Boolean(addWidgetError)}
                                autoCapitalize="characters"
                                autoCorrect="off"
                                spellCheck={false}
                                className={addWidgetError ? 'has-error' : ''}
                            />
                            <select value={newThemeId} onChange={(event) => setNewThemeId(event.target.value)} aria-label="Group for new tile">
                                {DASHBOARD_THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
                            </select>
                            <button type="button" onClick={addWidget}>+ ADD</button>
                            {addWidgetError && <span className="diagnostic-add-error" role="alert">{addWidgetError}</span>}
                        </div>
                        <div className="diagnostic-control-buttons">
                            <button type="button" onClick={resetBoardPages}>DEFAULT PAGES</button>
                            <button type="button" onClick={recopyFromDesktop}>RE-COPY FROM DESKTOP</button>
                            {onSignOut && <button type="button" onClick={onSignOut}>SIGN OUT</button>}
                            <span className="paged-build">
                                B{PAGED_BUILD} · {homeScreenApp ? 'APP' : 'BROWSER'} · {readSafeAreaInsets()} · {window.innerWidth}×{window.innerHeight}
                            </span>
                        </div>
                        {streamDropLogRef.current.length > 0 && (
                            <div className="paged-drop-log">
                                {streamDropLogRef.current.map((entry, index) => <div key={index}>STREAM DROP · {entry}</div>)}
                            </div>
                        )}
                    </div>
                )}

                {pinnedWidgets.length > 0 && (
                    <div className="paged-pinned">
                        <div className="diagnostic-theme-heading paged-group-heading">
                            <span>{THEME_BY_ID[PAGED_PINNED_THEME_ID].label}</span>
                            <span>ON EVERY PAGE</span>
                        </div>
                        <div className="paged-tiles" style={{ '--paged-tiles-per-row': Math.min(pinnedWidgets.length, 8) }}>
                            {pinnedWidgets.map(renderTile)}
                        </div>
                    </div>
                )}

                <div className="paged-track" ref={pageTrackRef} onScroll={handleTrackScroll}>
                    {pages.map((pageColumns, pageIndex) => (
                        <div key={pageIndex} className="paged-page" aria-label={`Page ${pageIndex + 1}`}>
                            {pageColumns.map((themeIds, columnOffset) => {
                                const columnIndex = pageIndex * PAGED_COLUMNS_PER_PAGE + columnOffset
                                return (
                                    <div key={columnIndex} className="paged-column">
                                        {themeIds.map((themeId, position) => (
                                            <div key={themeId} className="paged-group">
                                                <div className="diagnostic-theme-heading paged-group-heading">
                                                    <span>{THEME_BY_ID[themeId].label}</span>
                                                    {boardEditing ? (
                                                        <span className="paged-group-moves">
                                                            <button type="button" onClick={() => moveBoardGroup(themeId, 'left')} disabled={columnIndex === 0} aria-label={`Move ${THEME_BY_ID[themeId].label} to the previous column`}>◀</button>
                                                            <button type="button" onClick={() => moveBoardGroup(themeId, 'up')} disabled={position === 0} aria-label={`Move ${THEME_BY_ID[themeId].label} up`}>▲</button>
                                                            <button type="button" onClick={() => moveBoardGroup(themeId, 'down')} disabled={position === themeIds.length - 1} aria-label={`Move ${THEME_BY_ID[themeId].label} down`}>▼</button>
                                                            <button type="button" onClick={() => moveBoardGroup(themeId, 'right')} disabled={columnIndex === lastColumnIndex && themeIds.length === 1} aria-label={`Move ${THEME_BY_ID[themeId].label} to the next column`}>▶</button>
                                                        </span>
                                                    ) : (
                                                        <span>{widgets.filter((widget) => widget.themeId === themeId).length}</span>
                                                    )}
                                                </div>
                                                <div className="paged-tiles">
                                                    {widgets.filter((widget) => widget.themeId === themeId).map(renderTile)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </div>

                {/* Tiles are large here, so keep the headline stack short. */}
                <BreakingNewsTicker systemAlerts={systemAlerts} maxHeadlines={2} />
            </section>
        )
    }

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
