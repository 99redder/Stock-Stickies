import { useState } from 'react'

// First-run walkthrough. App.jsx opens it on every sign-in until a Finnhub
// key is saved; keys typed here go through the same state (and encrypted
// autosave) as the header inputs.

const STEPS = ['Welcome', 'Finnhub key', 'News key', 'Get started']

const ExternalButton = ({ href, children }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-gray-950 hover:bg-cyan-400"
    >
        {children}
        <span aria-hidden="true">↗</span>
    </a>
)

const Instructions = ({ items }) => (
    <ol className="space-y-2.5">
        {items.map((item, index) => (
            <li key={index} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-bold text-cyan-300">
                    {index + 1}
                </span>
                <span className="text-gray-300">{item}</span>
            </li>
        ))}
    </ol>
)

const SavedBadge = ({ children }) => (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">
        <span aria-hidden="true">✓</span>
        {children}
    </div>
)

// A real quote request is the only reliable check that a Finnhub key works.
async function testFinnhubKey(key) {
    try {
        const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(key)}`)
        if (response.status === 401 || response.status === 403) return 'invalid'
        if (response.status === 429) return 'ok' // rate limited, but the key was accepted
        if (!response.ok) return 'unreachable'
        const data = await response.json()
        return Number(data?.c) > 0 ? 'ok' : 'invalid'
    } catch {
        return 'unreachable'
    }
}

export default function OnboardingWalkthrough({
    finnhubApiKey,
    marketauxApiKey,
    validateApiKey,
    maxKeyLength,
    onSaveFinnhubKey,
    onSaveMarketauxKey,
    onClose,
    onOpenDashboard,
    onOpenQuickStart,
}) {
    const [step, setStep] = useState(finnhubApiKey ? 2 : 0)
    const [finnhubDraft, setFinnhubDraft] = useState('')
    const [finnhubStatus, setFinnhubStatus] = useState('idle')
    const [marketauxDraft, setMarketauxDraft] = useState('')
    const [marketauxError, setMarketauxError] = useState('')

    const saveFinnhub = async (skipTest = false) => {
        const key = finnhubDraft.trim()
        if (!validateApiKey(key, 'finnhub')) {
            setFinnhubStatus('format')
            return
        }
        if (!skipTest) {
            setFinnhubStatus('testing')
            const result = await testFinnhubKey(key)
            if (result !== 'ok') {
                setFinnhubStatus(result)
                return
            }
        }
        onSaveFinnhubKey(key)
        setFinnhubStatus('saved')
    }

    const saveMarketaux = () => {
        const key = marketauxDraft.trim()
        if (!validateApiKey(key, 'marketaux')) {
            setMarketauxError('That doesn’t look like a MarketAux token — it should be a long string of letters and numbers.')
            return
        }
        setMarketauxError('')
        onSaveMarketauxKey(key)
    }

    const finnhubMessage = {
        testing: { tone: 'text-gray-400', text: 'Checking the key with Finnhub…' },
        format: { tone: 'text-red-400', text: 'That doesn’t look like a Finnhub key. Copy the whole key from your Finnhub dashboard (20+ letters and numbers).' },
        invalid: { tone: 'text-red-400', text: 'Finnhub rejected this key. Double-check you copied the full key from your dashboard.' },
        unreachable: { tone: 'text-amber-300', text: 'Couldn’t reach Finnhub to test the key.' },
    }[finnhubStatus]

    const canContinue = step !== 1 || Boolean(finnhubApiKey)
    const inputClass = 'w-full rounded-lg border-2 border-gray-600 bg-gray-800 px-3 py-2 font-mono text-sm text-white outline-none focus:border-cyan-400'

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="onboarding-title"
                className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 text-sm text-gray-200 shadow-2xl"
            >
                <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
                    <div className="flex items-center gap-2">
                        {STEPS.map((label, index) => (
                            <span
                                key={label}
                                title={label}
                                className={`h-2 rounded-full transition-all ${index === step ? 'w-8 bg-cyan-400' : index < step ? 'w-2 bg-cyan-700' : 'w-2 bg-gray-700'}`}
                            />
                        ))}
                        <span className="ml-2 text-xs font-semibold text-gray-500">Step {step + 1} of {STEPS.length}</span>
                    </div>
                    <button type="button" onClick={onClose} className="text-xs font-semibold text-gray-400 hover:text-white">
                        {finnhubApiKey ? 'Close' : 'Remind me later'}
                    </button>
                </div>

                <div className="space-y-5 overflow-y-auto px-6 py-6">
                    {step === 0 && (
                        <>
                            <h2 id="onboarding-title" className="text-2xl font-extrabold text-white">Welcome to Stock Stickies 👋</h2>
                            <p className="text-gray-300">
                                Stock Stickies is a sticky-note board for your stock ideas, with live prices, a portfolio view, and a
                                customizable Live Dashboard.
                            </p>
                            <div className="rounded-xl border border-gray-700 bg-gray-950/50 p-4">
                                <p className="font-semibold text-white">It runs on your own free API keys</p>
                                <p className="mt-1 text-gray-400">
                                    Market data comes from Finnhub using a key in your name. Setup takes about 3 minutes and costs
                                    nothing. Your keys are encrypted and saved to your account — you only do this once.
                                </p>
                            </div>
                            <ul className="space-y-1.5 text-gray-300">
                                <li><span className="font-semibold text-white">Required:</span> a Finnhub key (prices, quotes, Live Dashboard)</li>
                                <li><span className="font-semibold text-white">Optional:</span> a MarketAux key (news on each ticker)</li>
                            </ul>
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <h2 id="onboarding-title" className="text-2xl font-extrabold text-white">Get your free Finnhub key</h2>
                            <Instructions items={[
                                <>Open <span className="font-semibold text-white">finnhub.io</span> in a new tab with the button below.</>,
                                <>Sign up for a <span className="font-semibold text-white">free</span> account, then confirm it from the email Finnhub sends you.</>,
                                <>Sign in. Your <span className="font-semibold text-white">API key</span> is shown at the top of your Finnhub dashboard — copy it.</>,
                                <>Come back here, paste it in the box, and click <span className="font-semibold text-white">Test &amp; save</span>.</>,
                            ]} />
                            <ExternalButton href="https://finnhub.io/register">Open Finnhub</ExternalButton>
                            {finnhubApiKey ? (
                                <SavedBadge>Finnhub key saved — prices and the Live Dashboard are ready.</SavedBadge>
                            ) : (
                                <div className="space-y-2">
                                    <label htmlFor="onboarding-finnhub" className="block text-xs font-bold uppercase tracking-wide text-gray-400">Finnhub API key</label>
                                    <div className="flex gap-2">
                                        <input
                                            id="onboarding-finnhub"
                                            type="text"
                                            autoComplete="off"
                                            spellCheck={false}
                                            value={finnhubDraft}
                                            maxLength={maxKeyLength}
                                            onChange={(event) => { setFinnhubDraft(event.target.value); setFinnhubStatus('idle') }}
                                            onKeyDown={(event) => { if (event.key === 'Enter') saveFinnhub() }}
                                            placeholder="Paste your key here"
                                            className={inputClass}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => saveFinnhub()}
                                            disabled={!finnhubDraft.trim() || finnhubStatus === 'testing'}
                                            className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 font-bold text-gray-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            Test &amp; save
                                        </button>
                                    </div>
                                    {finnhubMessage && (
                                        <p className={`text-xs ${finnhubMessage.tone}`}>
                                            {finnhubMessage.text}
                                            {finnhubStatus === 'unreachable' && (
                                                <button type="button" onClick={() => saveFinnhub(true)} className="ml-2 font-semibold text-cyan-300 underline hover:text-cyan-200">
                                                    Save it anyway
                                                </button>
                                            )}
                                        </p>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <h2 id="onboarding-title" className="text-2xl font-extrabold text-white">
                                Add news <span className="text-base font-semibold text-gray-500">(optional)</span>
                            </h2>
                            <p className="text-gray-400">A free MarketAux key adds recent headlines when you open a ticker. You can skip this and add it later from the header.</p>
                            <Instructions items={[
                                <>Open <span className="font-semibold text-white">marketaux.com</span> and create a free account.</>,
                                <>Confirm your email and sign in.</>,
                                <>Copy the <span className="font-semibold text-white">API token</span> from your MarketAux dashboard.</>,
                                <>Paste it below and click <span className="font-semibold text-white">Save</span>.</>,
                            ]} />
                            <ExternalButton href="https://www.marketaux.com/register">Open MarketAux</ExternalButton>
                            {marketauxApiKey ? (
                                <SavedBadge>MarketAux key saved — ticker news is on.</SavedBadge>
                            ) : (
                                <div className="space-y-2">
                                    <label htmlFor="onboarding-marketaux" className="block text-xs font-bold uppercase tracking-wide text-gray-400">MarketAux API token</label>
                                    <div className="flex gap-2">
                                        <input
                                            id="onboarding-marketaux"
                                            type="text"
                                            autoComplete="off"
                                            spellCheck={false}
                                            value={marketauxDraft}
                                            maxLength={maxKeyLength}
                                            onChange={(event) => { setMarketauxDraft(event.target.value); setMarketauxError('') }}
                                            onKeyDown={(event) => { if (event.key === 'Enter') saveMarketaux() }}
                                            placeholder="Paste your token here"
                                            className={inputClass}
                                        />
                                        <button
                                            type="button"
                                            onClick={saveMarketaux}
                                            disabled={!marketauxDraft.trim()}
                                            className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 font-bold text-gray-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            Save
                                        </button>
                                    </div>
                                    {marketauxError && <p className="text-xs text-red-400">{marketauxError}</p>}
                                </div>
                            )}
                        </>
                    )}

                    {step === 3 && (
                        <>
                            <h2 id="onboarding-title" className="text-2xl font-extrabold text-white">You’re all set 🎉</h2>
                            <p className="text-gray-400">Here’s where to go next:</p>
                            <div className="space-y-3">
                                <div className="rounded-xl border border-gray-700 bg-gray-950/50 p-4">
                                    <p className="font-semibold text-white">📝 Make your first sticky note</p>
                                    <p className="mt-1 text-gray-400">On the <span className="text-gray-200">Notes</span> tab, click <span className="text-gray-200">New Note</span>, pick a category for it, then type a ticker like AAPL and why you’re watching it. Click a note to see its live quote and chart.</p>
                                </div>
                                <div className="hidden rounded-xl border border-gray-700 bg-gray-950/50 p-4 md:block">
                                    <p className="font-semibold text-white">📊 Build your Live Dashboard <span className="text-xs font-semibold text-gray-500">(desktop)</span></p>
                                    <p className="mt-1 text-gray-400">Open the <span className="text-gray-200">Live Dashboard</span> tab and click <span className="text-gray-200">+ Add Widget</span> to stream live prices for the tickers you care about.</p>
                                </div>
                                <div className="rounded-xl border border-gray-700 bg-gray-950/50 p-4">
                                    <p className="font-semibold text-white">💼 Track your portfolio</p>
                                    <p className="mt-1 text-gray-400">Click the lock on a note to enter how many shares you own — it then shows up on the <span className="text-gray-200">Portfolio</span> tab with its value and allocation.</p>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">
                                Want the full tour? The{' '}
                                <button type="button" onClick={onOpenQuickStart} className="font-semibold text-cyan-300 underline hover:text-cyan-200">Quick Start Guide</button>
                                {' '}button next to your name covers everything in detail.
                            </p>
                        </>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-gray-800 px-6 py-4">
                    <button
                        type="button"
                        onClick={() => setStep(step - 1)}
                        className={`rounded-lg px-4 py-2 font-semibold text-gray-400 hover:text-white ${step === 0 ? 'invisible' : ''}`}
                    >
                        Back
                    </button>
                    {step < STEPS.length - 1 ? (
                        <button
                            type="button"
                            onClick={() => setStep(step + 1)}
                            disabled={!canContinue}
                            title={canContinue ? undefined : 'Save your Finnhub key to continue'}
                            className="rounded-lg bg-cyan-500 px-5 py-2 font-bold text-gray-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {step === 0 ? 'Let’s go' : step === 2 && !marketauxApiKey ? 'Skip for now' : 'Next'}
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <button type="button" onClick={onClose} className="rounded-lg border border-gray-600 px-4 py-2 font-semibold text-gray-200 hover:border-gray-400">
                                Start with a note
                            </button>
                            <button type="button" onClick={onOpenDashboard} className="hidden rounded-lg bg-cyan-500 md:block px-4 py-2 font-bold text-gray-950 hover:bg-cyan-400">
                                Open Live Dashboard
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
