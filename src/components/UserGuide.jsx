import { useEffect, useRef, useState } from 'react'

// The in-app User Guide (header button). A sidebar of sections on wide screens,
// a chip row on narrow ones; the section in view is highlighted as you scroll.

const SECTIONS = [
    { id: 'start', icon: '🚀', title: 'Getting started' },
    { id: 'notes', icon: '📝', title: 'Notes & categories' },
    { id: 'positions', icon: '💼', title: 'Positions & accounts' },
    { id: 'board', icon: '🧭', title: 'Organizing your board' },
    { id: 'portfolio', icon: '📊', title: 'Portfolio tab' },
    { id: 'watch', icon: '👀', title: 'Watch List & RADAR' },
    { id: 'dashboard', icon: '📡', title: 'Live Dashboard' },
    { id: 'askk', icon: '💬', title: 'Ask K' },
    { id: 'security', icon: '🔐', title: 'Security & two-step' },
    { id: 'backups', icon: '🛟', title: 'Backups & restore' },
    { id: 'mobile', icon: '📱', title: 'Mobile app' },
]

// A button or label exactly as it appears in the app.
const Ui = ({ children }) => (
    <span className="whitespace-nowrap rounded-md border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-[0.8em] font-semibold text-white">
        {children}
    </span>
)

const Steps = ({ items }) => (
    <ol className="space-y-2.5">
        {items.map((item, index) => (
            <li key={index} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-bold text-cyan-300 ring-1 ring-cyan-500/40">
                    {index + 1}
                </span>
                <span className="text-gray-300">{item}</span>
            </li>
        ))}
    </ol>
)

const Bullets = ({ items }) => (
    <ul className="space-y-2">
        {items.map((item, index) => (
            <li key={index} className="flex gap-3 text-gray-300">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
                <span>{item}</span>
            </li>
        ))}
    </ul>
)

const Tip = ({ children, tone = 'cyan' }) => {
    const tones = {
        cyan: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-100',
        amber: 'border-amber-500/30 bg-amber-500/5 text-amber-100',
        emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100',
    }
    return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>
}

const Feature = ({ title, children }) => (
    <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
        <p className="font-semibold text-white">{title}</p>
        <div className="mt-1 text-gray-400">{children}</div>
    </div>
)

const ActionButton = ({ onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        className="rounded-lg border border-cyan-500/60 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/10"
    >
        {children}
    </button>
)

function Section({ id, icon, title, lead, children, sectionRef }) {
    return (
        <section id={`guide-${id}`} ref={sectionRef} className="scroll-mt-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-5 md:p-6">
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-800 text-xl" aria-hidden="true">{icon}</span>
                <div>
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    {lead && <p className="mt-0.5 text-gray-400">{lead}</p>}
                </div>
            </div>
            <div className="mt-4 space-y-4">{children}</div>
        </section>
    )
}

export default function UserGuide({
    onClose,
    onOpenBackups,
    onOpenKeys,
    onOpenTwoStep,
    twoStepEnrolled = false,
    accountsEnabled = false,
}) {
    const scrollRef = useRef(null)
    const sectionRefs = useRef({})
    const [active, setActive] = useState(SECTIONS[0].id)

    useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    // Highlight the section nearest the top of the scroll area.
    useEffect(() => {
        const root = scrollRef.current
        if (!root || typeof IntersectionObserver === 'undefined') return undefined
        const observer = new IntersectionObserver((entries) => {
            const visible = entries.filter((entry) => entry.isIntersecting)
                .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
            if (visible[0]) setActive(visible[0].target.id.replace('guide-', ''))
        }, { root, rootMargin: '0px 0px -65% 0px' })
        Object.values(sectionRefs.current).forEach((node) => node && observer.observe(node))
        return () => observer.disconnect()
    }, [])

    const jumpTo = (id) => {
        setActive(id)
        sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    const sectionProps = (id) => {
        const section = SECTIONS.find((item) => item.id === id)
        return { id, icon: section.icon, title: section.title, sectionRef: (node) => { sectionRefs.current[id] = node } }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4">
            <div role="dialog" aria-modal="true" aria-labelledby="user-guide-title" className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-950 text-sm text-gray-200 shadow-2xl">
                <div className="flex items-center justify-between gap-4 border-b border-gray-800 bg-gradient-to-r from-fuchsia-500/10 via-purple-500/10 to-emerald-400/10 px-5 py-4 sm:px-6">
                    <div>
                        <h2 id="user-guide-title" className="text-xl font-extrabold text-white">Stock Stickies User Guide</h2>
                        <p className="text-xs text-gray-400">Everything the app does, in the order you’ll need it.</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close the User Guide" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex min-h-0 flex-1">
                    <nav aria-label="Guide sections" className="hidden w-56 shrink-0 overflow-y-auto border-r border-gray-800 p-3 md:block">
                        {SECTIONS.map((section) => (
                            <button
                                key={section.id}
                                type="button"
                                onClick={() => jumpTo(section.id)}
                                aria-current={active === section.id ? 'true' : undefined}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-medium transition ${active === section.id ? 'bg-cyan-500/15 text-cyan-200' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}
                            >
                                <span aria-hidden="true">{section.icon}</span>
                                {section.title}
                            </button>
                        ))}
                    </nav>

                    <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
                        <div className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-gray-800 bg-gray-950/95 px-4 py-2 backdrop-blur md:hidden">
                            {SECTIONS.map((section) => (
                                <button
                                    key={section.id}
                                    type="button"
                                    onClick={() => jumpTo(section.id)}
                                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${active === section.id ? 'bg-cyan-500/20 text-cyan-200' : 'bg-gray-900 text-gray-400'}`}
                                >
                                    {section.icon} {section.title}
                                </button>
                            ))}
                        </div>

                        <div className="space-y-5 p-4 sm:p-6">
                            <Section {...sectionProps('start')} lead="Stock Stickies runs on your own free market-data keys. Setup takes about three minutes.">
                                <Steps items={[
                                    <>Get a free <span className="font-semibold text-white">Finnhub</span> key — it powers prices, quotes, earnings dates, and the Live Dashboard.</>,
                                    <>Optionally add a free <span className="font-semibold text-white">MarketAux</span> key for news on each ticker.</>,
                                    <>Paste them into the setup walkthrough (it opens on your first sign-in). Keys are encrypted and saved to your account.</>,
                                ]} />
                                {onOpenKeys && <ActionButton onClick={onOpenKeys}>Set up API keys</ActionButton>}
                            </Section>

                            <Section {...sectionProps('notes')} lead="Each sticky note is one ticker plus your thinking about it.">
                                <Steps items={[
                                    <>Click <Ui>New Note</Ui>. It appears in the <span className="font-semibold text-white">Unclassified</span> row at the top.</>,
                                    <>Pick a category for it, then type the ticker (e.g. <span className="font-semibold text-white">AMZN</span>) and your thesis, targets, or plan.</>,
                                    <>Click a note to open it — live quote, chart, fundamentals, earnings date, and news.</>,
                                ]} />
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Feature title="Categories">Up to 10 color-coded categories. Rename or recolor them from the legend, add new ones, and delete any you don’t need — notes in a deleted category are moved, never lost.</Feature>
                                    <Feature title="Reorder">In the legend, drag a category’s grip handle to change the order sections appear on the board.</Feature>
                                </div>
                                <Tip>Notes save automatically as you type and sync to every device you sign in on.</Tip>
                            </Section>

                            <Section {...sectionProps('positions')} lead="Add share counts to turn notes into a tracked portfolio.">
                                <Steps items={[
                                    <>Click the <span className="font-semibold text-white">lock</span> on a note (or in its expanded view) to unlock it.</>,
                                    <>Enter how many shares you own{accountsEnabled ? ' and choose which account holds them' : ''}.</>,
                                    <>Click the lock again — or <Ui>Lock All</Ui> in the toolbar — to protect it from accidental edits. Notes re-lock every time you reload.</>,
                                ]} />
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Feature title="Accounts">Keep everything as one portfolio, or name your accounts (Brokerage, Roth IRA, 401(k)…). Change this any time with <Ui>Manage accounts</Ui> on the Notes tab — nothing is deleted when you switch.</Feature>
                                    <Feature title="Duplicates">A ticker can live in several accounts, but only once per account. A red <span className="font-semibold text-red-300">Duplicate</span> banner flags a collision so you can fix it.</Feature>
                                </div>
                            </Section>

                            <Section {...sectionProps('board')} lead="Choose how the Notes tab is laid out.">
                                <Bullets items={[
                                    <><span className="font-semibold text-white">Group By</span> — {accountsEnabled ? <><Ui>Portfolio</Ui> (one section per account), </> : null}<Ui>Category</Ui>, or <Ui>Size</Ui> (one list, largest position first). Within a section, positions are always ordered by market value.</>,
                                    <><Ui>Hide Legend</Ui> and <Ui>Hide Toolbar</Ui> collapse the side panels for a clean reading view.</>,
                                    <><Ui>Hide Shares</Ui> masks share counts — handy when sharing your screen.</>,
                                    <>Collapse any section by clicking its header. Your layout choices are remembered.</>,
                                ]} />
                            </Section>

                            <Section {...sectionProps('portfolio')} lead="Your holdings, priced and charted. Prices refresh at 9:35 AM, 1:00 PM, and 4:05 PM Eastern, or on demand with Refresh Prices. Before the open and after the close they include pre-market and after-hours trades.">
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <Feature title="Allocation"><Ui>Donut</Ui> by ticker, <Ui>Sector</Ui> by your own sector buckets, or <Ui>Map</Ui> as a treemap.</Feature>
                                    <Feature title="Positions">A table of market value, cost basis, and unrealized P&amp;L where available.</Feature>
                                    <Feature title="Share it"><Ui>Copy</Ui> puts the view on your clipboard as Markdown for any AI chat; <Ui>Snapshot</Ui> downloads an image.</Feature>
                                </div>
                                <Bullets items={[
                                    ...(accountsEnabled ? [<>Account chips above the chart narrow everything — percentages included — to one account.</>] : []),
                                    <>In <Ui>Sector</Ui> view, assign each ticker to a bucket with its dropdown, and add or remove buckets with the chips.</>,
                                    <>The eye button blurs every dollar figure while you present.</>,
                                    <>Cash secured puts are listed in their own panel, with the buying obligation counted separately from your holdings.</>,
                                ]} />
                            </Section>

                            <Section {...sectionProps('watch')} lead="Track ideas you don’t own yet.">
                                <Bullets items={[
                                    <>The <span className="font-semibold text-white">Watch List</span> holds any number of tickers with a live quote and a short note each.</>,
                                    <><span className="font-semibold text-white">RADAR</span> is your shortlist — up to 3 top ideas, pinned above the watch list with room for longer notes. Move a ticker back to the Watch List to free a slot.</>,
                                ]} />
                            </Section>

                            <Section {...sectionProps('dashboard')} lead="A full-screen wall of streaming prices, grouped by theme (desktop only).">
                                <Steps items={[
                                    <>Open the <Ui>Live Dashboard</Ui> tab.</>,
                                    <>Use <Ui>+ Add Widget</Ui> to add a ticker to a group, or add whole groups (AI, Space, Energy, Defense…).</>,
                                    <>Drag tiles and groups to arrange them. Your layout is saved to your account.</>,
                                ]} />
                                <Tip tone="amber">Finnhub’s free plan streams up to 50 tickers live. Anything beyond that still updates every 15 seconds — the tile label tells you which is which.</Tip>
                            </Section>

                            <Section {...sectionProps('askk')} lead="An AI assistant that reads your portfolio and notes.">
                                <Bullets items={[
                                    <>Click <Ui>Ask K</Ui> and ask about concentration, sector mix, cash-secured-put obligations, or how your watch list compares to what you own.</>,
                                    <>K gives observations, not financial advice, and only ever sees your own portfolio.</>,
                                    <>You get 5 questions a day; the count resets at midnight UTC.</>,
                                ]} />
                            </Section>

                            <Section {...sectionProps('security')} lead="Two-step verification asks for a 6-digit code from an authenticator app each time you sign in, so a stolen password alone can’t open your account.">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${twoStepEnrolled ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40' : 'bg-gray-800 text-gray-300 ring-1 ring-gray-700'}`}>
                                        {twoStepEnrolled ? '✓ Two-step verification is on' : 'Two-step verification is off'}
                                    </span>
                                    {onOpenTwoStep && <ActionButton onClick={onOpenTwoStep}>{twoStepEnrolled ? 'Manage two-step verification' : 'Turn it on'}</ActionButton>}
                                </div>
                                <Steps items={[
                                    <>Install an authenticator app — Google Authenticator, Microsoft Authenticator, 1Password, or Authy.</>,
                                    <>Click <Ui>Security</Ui> (next to Backups), then <Ui>Set up</Ui>. You may be asked to verify your email or sign in again first.</>,
                                    <>Scan the QR code with the app (or type the key shown under it) and enter the 6-digit code to finish.</>,
                                    <>From then on, signing in — on the website, the iPad board, or the mobile app — asks for the current code after your password or Google sign-in.</>,
                                ]} />
                                <Tip tone="amber">Keep your authenticator app backed up (most can sync to the cloud). Without it you can’t sign in. To switch phones, turn two-step off from <Ui>Security</Ui> and set it up again on the new one.</Tip>
                                <Tip tone="amber">Leaving? <Ui>Security</Ui> → <span className="font-semibold">Delete my account</span> permanently removes your notes, settings, keys, every backup, and your login. You’ll confirm twice, type <span className="font-mono font-semibold">delete</span>, and sign in once more first — it can’t be undone.</Tip>
                                <Tip tone="emerald">Account emails (password reset, verification) always come from <span className="font-semibold">noreply@stockstickies.com</span>. If an email asks you to sign in somewhere else, don’t.</Tip>
                            </Section>

                            <Section {...sectionProps('backups')} lead="Your whole account is backed up automatically — notes, categories, watch list, puts, keys, profile, and dashboard.">
                                <Bullets items={[
                                    <>A backup is saved as you make changes (at most every 10 minutes) and before every <Ui>Update positions</Ui>.</>,
                                    <>Older backups thin out on their own: everything from the last 2 weeks, one a day for 3 months, one a week for a year. Your newest 30 are never removed.</>,
                                    <>If two tabs or computers save at nearly the same time, the newer save wins and the other tab’s change is kept as a <span className="font-semibold text-white">save-conflict</span> backup — nothing is lost.</>,
                                ]} />
                                <p className="font-semibold text-white">To restore</p>
                                <Steps items={[
                                    <>Click <Ui>Backups</Ui> next to the User Guide button. Backups are listed newest first.</>,
                                    <>Pick the newest one that looks complete — your usual note count, several categories, and your key, nickname, and photo present. A backup with 0 notes was taken after something went wrong.</>,
                                    <>Click <Ui>Restore</Ui>. Your current state is backed up first, so a restore can itself be undone.</>,
                                ]} />
                                {onOpenBackups && <ActionButton onClick={onOpenBackups}>Open Backups</ActionButton>}
                            </Section>

                            <Section {...sectionProps('mobile')} lead="A read-only companion for checking your portfolio on the go.">
                                <Bullets items={[
                                    <>Open <span className="font-semibold text-white">mobile.stockstickies.com</span> on your phone and sign in with the same account.</>,
                                    <>In Safari, tap Share → <span className="font-semibold text-white">Add to Home Screen</span> to install it like an app. It updates itself.</>,
                                    <>Editing happens here on the website; the mobile app shows your positions, prices, and Ask K.</>,
                                ]} />
                            </Section>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
