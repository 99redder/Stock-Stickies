import { useCallback, useEffect, useMemo, useState } from 'react'

const LOOK_AHEAD_API_URL = 'https://look-ahead-planner.99redder.workers.dev'
const LEGACY_PASSWORD_STORAGE_KEY = 'stock-stickies:lookahead-password'

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

export default function TodayAgenda({ authUser }) {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        // Remove the credential saved by the previous integration. Authentication now
        // uses the signed-in user's short-lived Firebase token instead.
        localStorage.removeItem(LEGACY_PASSWORD_STORAGE_KEY)
    }, [])

    const loadToday = useCallback(async (signal, forceRefresh = false) => {
        if (!authUser) {
            setItems([])
            setError('Sign in to load today’s calendar.')
            return
        }

        setLoading(true)
        setError('')
        try {
            const today = localDateKey()
            let response

            // Firebase refreshes short-lived ID tokens automatically. A single forced
            // refresh handles the edge case where a cached token expires mid-request.
            for (let attempt = 0; attempt < 2; attempt += 1) {
                const idToken = await authUser.getIdToken(forceRefresh || attempt === 1)
                response = await fetch(`${LOOK_AHEAD_API_URL}/api/planner/items?includeDone=1&dueDate=${encodeURIComponent(today)}`, {
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    signal
                })
                if (response.status !== 401 || attempt === 1) break
            }

            const data = await response.json().catch(() => ({}))
            if (response.status === 401 || response.status === 403) {
                throw new Error('Unable to authorize Look Ahead for this account.')
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
        } catch (requestError) {
            if (requestError?.name !== 'AbortError') {
                setError(requestError?.message || 'Unable to load today’s calendar.')
            }
        } finally {
            if (!signal?.aborted) setLoading(false)
        }
    }, [authUser])

    useEffect(() => {
        const controller = new AbortController()
        loadToday(controller.signal)
        return () => controller.abort()
    }, [loadToday])

    const dateLabel = useMemo(
        () => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()),
        []
    )

    return (
        <section
            className="min-w-0 flex-1 rounded-xl border border-[#39ff14] bg-[#090f0b] px-3 py-2.5 text-[#b6ffac] shadow-[0_0_0_1px_rgba(57,255,20,0.12),0_0_22px_rgba(57,255,20,0.16)]"
            aria-label={`Look Ahead calendar for ${dateLabel}`}
        >
            <div className="mb-2 flex items-center gap-2">
                <img src="/assets/look-ahead-logo.svg" alt="Look Ahead Planner" className="h-10 min-w-0 flex-1 object-contain object-left" />
                <button
                    type="button"
                    onClick={() => loadToday(undefined, true)}
                    disabled={loading}
                    className="shrink-0 rounded-lg border border-[#214526] bg-[#0f2a12] p-2 text-[#39ff14] transition-colors hover:border-[#ff4fd8] hover:text-[#ff4fd8] disabled:opacity-50"
                    title="Refresh today’s calendar"
                    aria-label="Refresh today’s calendar"
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
                        <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5" />
                        <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" />
                    </svg>
                </button>
            </div>
            <div className="mb-2 flex items-center justify-end border-t border-[#214526] pt-2">
                <span className="text-right font-mono text-[11px] text-[#7dff63]">{dateLabel}</span>
            </div>

            {loading && items.length === 0 ? (
                <div className="py-2 text-left font-mono text-xs text-[#7dff63]">Loading today’s items…</div>
            ) : error ? (
                <div className="rounded-lg border border-[#5a2222] bg-[#16080f] px-2.5 py-2 text-left text-xs leading-snug text-[#ff8fb3]">{error}</div>
            ) : items.length === 0 ? (
                <div className="py-2 text-left font-mono text-xs text-[#7dff63]">Nothing scheduled for today.</div>
            ) : (
                <div className="max-h-24 space-y-1 overflow-y-auto pr-1">
                    {items.map((item) => (
                        <div
                            key={item.id}
                            className={`flex items-start gap-2 rounded-lg border border-[#214526] bg-[#0f2a12] px-2 py-1.5 text-left text-xs text-[#b6ffac] ${item.status === 'done' ? 'opacity-55' : ''}`}
                        >
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: safeColor(item.category_color) }} />
                            <span className="w-[4.25rem] shrink-0 font-mono text-[11px] font-bold text-[#39ff14]">
                                {formatTime(item.due_time) || 'Anytime'}
                            </span>
                            <span className={`min-w-0 break-words ${item.status === 'done' ? 'line-through' : ''}`}>{item.title}</span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    )
}
