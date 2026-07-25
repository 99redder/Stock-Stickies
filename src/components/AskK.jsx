import React, { useState, useRef, useEffect, useCallback } from 'react'

const DEFAULT_ASKK_API_URL = 'https://stock-stickies-askk.99redder.workers.dev/api/ask-k'
const ASKK_API_URL = (typeof window !== 'undefined' && window.ASKK_API_URL) || DEFAULT_ASKK_API_URL

const QUICK_PROMPTS = [
    'How concentrated is my portfolio?',
    'What is my total CSP buying obligation vs. my long market value?',
    'Are any of my CSP expirations clustered? What does the schedule look like?',
    'How does my watch list compare to what I already own?'
]

function formatMessage(text) {
    const escaped = String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    return escaped
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>')
}

export default function AskK({ portfolio, darkMode }) {
    const [open, setOpen] = useState(false)
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [busy, setBusy] = useState(false)
    const messagesRef = useRef(null)
    const inputRef = useRef(null)
    const portfolioRef = useRef(portfolio)

    useEffect(() => { portfolioRef.current = portfolio }, [portfolio])

    useEffect(() => {
        if (messagesRef.current) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight
        }
    }, [messages, busy])

    useEffect(() => {
        if (!open) return
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [open])

    useEffect(() => {
        if (open && messages.length === 0) {
            setMessages([{
                role: 'assistant',
                content: "Hi — I'm K. I can analyze your Stock Stickies portfolio: concentration, allocation across categories, cash-secured-put obligations, expiry timing, watch-list comparisons. Ask me anything about what you're holding."
            }])
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [open, messages.length])

    const send = useCallback(async (rawText) => {
        const text = String(rawText || '').trim()
        if (!text || busy) return

        const newHistory = [...messages, { role: 'user', content: text }]
        setMessages(newHistory)
        setInput('')
        setBusy(true)

        try {
            const res = await fetch(ASKK_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: newHistory.slice(-10).filter((m) => m.role === 'user' || m.role === 'assistant'),
                    portfolio: portfolioRef.current
                })
            })
            const data = await res.json().catch(() => ({}))
            if (data?.ok && data?.reply) {
                setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
            } else {
                setMessages((prev) => [...prev, { role: 'assistant', content: data?.error || "I couldn't process that. Try again in a moment." }])
            }
        } catch {
            setMessages((prev) => [...prev, { role: 'assistant', content: "I can't reach the assistant right now. Check your connection and try again." }])
        } finally {
            setBusy(false)
            setTimeout(() => inputRef.current?.focus(), 30)
        }
    }, [busy, messages])

    const onKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send(input)
        }
    }

    const fabBg = darkMode ? 'bg-green-600 hover:bg-green-500' : 'bg-green-600 hover:bg-green-700'

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Ask K"
                className={`fixed top-5 right-5 z-40 ${fabBg} text-white rounded-full shadow-lg flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-transform hover:scale-105`}
            >
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white text-green-700 font-bold text-sm">K</span>
                <span className="hidden sm:inline">Ask K</span>
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 bg-black/40"
                    onClick={() => setOpen(false)}
                />
            )}

            <aside
                className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] shadow-2xl transition-transform duration-300 flex flex-col ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'} ${open ? 'translate-x-0' : 'translate-x-full'}`}
                role="dialog"
                aria-label="Ask K assistant"
            >
                <header className={`flex items-center gap-3 px-4 py-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">K</div>
                    <div className="flex-1">
                        <div className="font-semibold leading-tight">Ask K</div>
                        <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Portfolio analysis assistant</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        aria-label="Close"
                        className={`p-2 rounded ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </header>

                <div ref={messagesRef} className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    {messages.map((m, i) => (
                        <div
                            key={i}
                            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                                m.role === 'user'
                                    ? `ml-auto ${darkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'}`
                                    : `${darkMode ? 'bg-gray-800 text-gray-100' : 'bg-white border border-gray-200 text-gray-800'}`
                            }`}
                            dangerouslySetInnerHTML={{ __html: formatMessage(m.content) }}
                        />
                    ))}
                    {busy && (
                        <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${darkMode ? 'bg-gray-800 text-gray-300' : 'bg-white border border-gray-200 text-gray-500'}`}>
                            <span className="inline-flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-current opacity-60 animate-pulse" />
                                K is thinking…
                            </span>
                        </div>
                    )}
                    {messages.length <= 1 && !busy && (
                        <div className="pt-2">
                            <div className={`text-xs mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Try one of these:</div>
                            <div className="flex flex-wrap gap-2">
                                {QUICK_PROMPTS.map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => send(p)}
                                        className={`text-xs px-3 py-1.5 rounded-full border ${darkMode ? 'border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200' : 'border-gray-300 bg-white hover:bg-gray-100 text-gray-700'}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <footer className={`px-3 py-3 border-t ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                    <div className="flex items-end gap-2">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="Ask about your portfolio…"
                            rows={1}
                            className={`flex-1 resize-none rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${darkMode ? 'bg-gray-800 text-gray-100 placeholder-gray-500 focus:ring-blue-500' : 'bg-gray-100 text-gray-900 placeholder-gray-500 focus:ring-blue-400'}`}
                        />
                        <button
                            type="button"
                            onClick={() => send(input)}
                            disabled={busy || !input.trim()}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold text-white ${busy || !input.trim() ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            Send
                        </button>
                    </div>
                    <div className={`text-[10px] mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        K analyzes your portfolio data — observations only, not financial advice.
                    </div>
                </footer>
            </aside>
        </>
    )
}
