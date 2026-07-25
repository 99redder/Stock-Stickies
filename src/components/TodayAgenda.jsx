import { useCallback, useEffect, useMemo, useState } from 'react'

const LOOK_AHEAD_API_URL = 'https://look-ahead-planner.99redder.workers.dev'
const PASSWORD_STORAGE_KEY = 'stock-stickies:lookahead-password'

function localDateKey(date = new Date()) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function formatTime(raw) {
    const value = String(raw || '')
    if (!/^\d{4}$/.test(value)) return ''
    const hours = Number(value.slice(0, 2))
    const minutes = value.slice(2)
    if (hours > 23 || Number(minutes) > 59) return ''
    const suffix = hours >= 12 ? 'PM' : 'AM'
    return `${hours % 12 || 12}:${minutes} ${suffix}`
}

function safeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : '#06b6d4'
}

export default function TodayAgenda({ darkMode }) {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [connected, setConnected] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [passwordDraft, setPasswordDraft] = useState('')

    const loadToday = useCallback(async (password, signal) => {
        const appPassword = String(password || '').trim()
        if (!appPassword) {
            setConnected(false)
            return
        }

        setLoading(true)
        setError('')
        try {
            const today = localDateKey()
            const response = await fetch(`${LOOK_AHEAD_API_URL}/api/planner/items?includeDone=1&dueDate=${encodeURIComponent(today)}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-App-Password': appPassword
                },
                signal
            })
            const data = await response.json().catch(() => ({}))

            if (response.status === 401) {
                localStorage.removeItem(PASSWORD_STORAGE_KEY)
                setConnected(false)
                setShowPassword(true)
                throw new Error('The Look Ahead password needs to be updated.')
            }
            if (!response.ok || data.ok === false) {
                throw new Error(data.error || `Calendar request failed (${response.status}).`)
            }

            const todayItems = (Array.isArray(data.items) ? data.items : [])
                .filter((item) => String(item.kind || 'task').toLowerCase() !== 'category')
                .filter((item) => item.due_date === today)
                .sort((a, b) => {
                    const statusOrder = (a.status === 'done') - (b.status === 'done')
                    if (statusOrder) return statusOrder
                    return String(a.due_time || '9999').localeCompare(String(b.due_time || '9999'))
                })

            setItems(todayItems)
            setConnected(true)
        } catch (requestError) {
            if (requestError?.name !== 'AbortError') {
                setError(requestError?.message || 'Unable to load today’s calendar.')
            }
        } finally {
            if (!signal?.aborted) setLoading(false)
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        const savedPassword = localStorage.getItem(PASSWORD_STORAGE_KEY) || ''
        if (savedPassword) loadToday(savedPassword, controller.signal)
        return () => controller.abort()
    }, [loadToday])

    const dateLabel = useMemo(
        () => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()),
        []
    )

    const savePassword = async (event) => {
        event.preventDefault()
        const password = passwordDraft.trim()
        if (!password) return
        localStorage.setItem(PASSWORD_STORAGE_KEY, password)
        setShowPassword(false)
        setPasswordDraft('')
        await loadToday(password)
    }

    const refresh = () => {
        const password = localStorage.getItem(PASSWORD_STORAGE_KEY) || ''
        if (password) loadToday(password)
        else setShowPassword(true)
    }

    const panelClass = darkMode
        ? 'border-cyan-700/70 bg-gray-900 text-gray-100'
        : 'border-cyan-300 bg-white text-gray-900'

    return (
        <>
            <section
                className={`w-72 shrink-0 rounded-lg border shadow-lg px-3 py-2 ${panelClass}`}
                aria-label={`Look Ahead calendar for ${dateLabel}`}
            >
                <div className="mb-1.5 flex items-center gap-2">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-cyan-500" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="17" rx="2" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <div className="min-w-0 flex-1 text-left">
                        <div className="text-[11px] font-black uppercase tracking-wider text-cyan-500">Today</div>
                        <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{dateLabel}</div>
                    </div>
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={loading}
                        className={`rounded p-1.5 ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} disabled:opacity-50`}
                        title="Refresh today’s calendar"
                        aria-label="Refresh today’s calendar"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
                            <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5" />
                            <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" />
                        </svg>
                    </button>
                    {connected && (
                        <button
                            type="button"
                            onClick={() => setShowPassword(true)}
                            className={`rounded p-1.5 ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                            title="Update Look Ahead password"
                            aria-label="Update Look Ahead password"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z" />
                            </svg>
                        </button>
                    )}
                </div>

                {!connected && !loading ? (
                    <button
                        type="button"
                        onClick={() => setShowPassword(true)}
                        className="w-full rounded-md bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-700"
                    >
                        Connect Look Ahead
                    </button>
                ) : loading && items.length === 0 ? (
                    <div className={`py-2 text-left text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Loading today’s items…</div>
                ) : items.length === 0 ? (
                    <div className={`py-2 text-left text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Nothing scheduled for today.</div>
                ) : (
                    <div className="max-h-24 space-y-1 overflow-y-auto pr-1">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                className={`flex items-start gap-2 rounded px-1.5 py-1 text-left text-xs ${darkMode ? 'bg-gray-800/80' : 'bg-gray-50'} ${item.status === 'done' ? 'opacity-55' : ''}`}
                            >
                                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: safeColor(item.category_color) }} />
                                <span className={`w-[4.25rem] shrink-0 font-mono text-[11px] ${darkMode ? 'text-cyan-300' : 'text-cyan-700'}`}>
                                    {formatTime(item.due_time) || 'Anytime'}
                                </span>
                                <span className={`min-w-0 break-words ${item.status === 'done' ? 'line-through' : ''}`}>{item.title}</span>
                            </div>
                        ))}
                    </div>
                )}

                {error && <div className="mt-1 text-left text-[10px] leading-tight text-red-500">{error}</div>}
            </section>

            {showPassword && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4" onMouseDown={() => setShowPassword(false)}>
                    <form
                        onSubmit={savePassword}
                        onMouseDown={(event) => event.stopPropagation()}
                        className={`w-full max-w-sm rounded-xl border p-5 text-left shadow-2xl ${darkMode ? 'border-gray-700 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-900'}`}
                    >
                        <h2 className="text-lg font-bold">Connect Look Ahead</h2>
                        <p className={`mt-1 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Enter the same planner password used by the Look Ahead app. It stays in this browser.
                        </p>
                        <input
                            type="password"
                            value={passwordDraft}
                            onChange={(event) => setPasswordDraft(event.target.value)}
                            autoFocus
                            className={`mt-4 w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 ${darkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-white'}`}
                            placeholder="Look Ahead password"
                            autoComplete="current-password"
                        />
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" onClick={() => setShowPassword(false)} className={`rounded-lg px-4 py-2 text-sm ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>Cancel</button>
                            <button type="submit" disabled={!passwordDraft.trim()} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50">Connect</button>
                        </div>
                    </form>
                </div>
            )}
        </>
    )
}
