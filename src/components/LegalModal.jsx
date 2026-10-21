import { useEffect } from 'react'

// Privacy Policy and Terms of Use, shown from the login page and the app footer.
// Keep the facts here in step with what the app actually does (claude.md).

const EFFECTIVE_DATE = 'October 20, 2026'
const CONTACT_EMAIL = 'contact@easternshore.ai'

const H = ({ children }) => <h3 className="mb-2 font-semibold text-white">{children}</h3>
const List = ({ items }) => (
    <ul className="list-inside list-disc space-y-1.5 text-gray-300">
        {items.map((item, index) => <li key={index}>{item}</li>)}
    </ul>
)
const Contact = () => (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-cyan-300 hover:text-cyan-200">{CONTACT_EMAIL}</a>
)

function PrivacyPolicy() {
    return (
        <>
            <p>
                This Privacy Policy explains what Stock Stickies (stockstickies.com, its iPad board, and the mobile app at
                mobile.stockstickies.com) collects, how it is used, and who it is shared with. Stock Stickies is operated by
                Eastern Shore AI, LLC. We don’t sell your information, show ads, or use third-party analytics or tracking.
            </p>
            <div>
                <H>Information we collect</H>
                <List items={[
                    <><span className="font-semibold text-white">Account details</span> — your email address and sign-in identifiers. If you sign in with Google, your name and profile photo from Google.</>,
                    <><span className="font-semibold text-white">Two-step verification</span> — if you turn it on, an authenticator enrollment held by our sign-in provider (Google Firebase). We never see your authenticator codes.</>,
                    <><span className="font-semibold text-white">What you create</span> — notes and their text, tickers, categories, share counts, account names, cash secured puts, watch list and RADAR tickers and notes, sector assignments, dashboard layouts, nickname, profile photo, and display preferences.</>,
                    <><span className="font-semibold text-white">Your API keys</span> — the Finnhub and MarketAux keys you enter, stored encrypted in your account.</>,
                    <><span className="font-semibold text-white">Backups</span> — automatic copies of your account data, so it can be restored.</>,
                    <><span className="font-semibold text-white">Technical data</span> — standard request logs (such as IP address and browser type) kept by our hosting and security providers to run the service and prevent abuse, and a bot check (reCAPTCHA) that protects sign-in.</>,
                    <><span className="font-semibold text-white">Stored on your device</span> — cached prices, layout preferences, and similar settings in your browser’s local storage.</>,
                ]} />
                <p className="mt-2">Stock Stickies does not connect to your bank or brokerage. Share counts are whatever you enter.</p>
            </div>
            <div>
                <H>How we use it</H>
                <List items={[
                    'To provide the service: sign you in, save and sync your data across devices, and show prices, charts, and news.',
                    'To keep your account safe: verify sign-ins, apply two-step verification, detect abuse, and rate-limit automated traffic.',
                    'To send account emails, such as password resets, email verification, and security notices, from noreply@stockstickies.com. We don’t send marketing email.',
                    'To answer Ask K questions you choose to ask (below).',
                ]} />
            </div>
            <div>
                <H>Ask K (AI assistant)</H>
                <p>
                    When you ask Ask K a question, your question, the recent conversation, and a summary of your portfolio
                    (positions, share counts, prices, account names, cash secured puts, watch list, and the text of your notes)
                    are sent to our Ask K server and to a third-party AI model provider to generate the answer. We don’t store
                    your questions or the answers; we keep only a daily question count tied to your account, deleted after two
                    days. The AI provider processes the request under its own terms. Ask K is only used when you ask it something.
                </p>
            </div>
            <div>
                <H>Who we share it with</H>
                <p className="mb-2">Only the service providers needed to run Stock Stickies, or when required by law:</p>
                <List items={[
                    <><span className="font-semibold text-white">Google Firebase</span> — sign-in, two-step verification, account emails, the database that stores your data and backups, and bot protection.</>,
                    <><span className="font-semibold text-white">Cloudflare</span> — website hosting, our server functions, the Ask K server, and security filtering.</>,
                    <><span className="font-semibold text-white">Finnhub and MarketAux</span> — your browser requests prices and news from them directly using your own API keys, under their terms.</>,
                    <><span className="font-semibold text-white">Public market sources</span> (such as Yahoo Finance, the U.S. Treasury, and news feeds) — our servers fetch quotes and headlines from them; none of your personal information is sent.</>,
                    <><span className="font-semibold text-white">An AI model provider</span> — only for Ask K questions, as described above.</>,
                    <><span className="font-semibold text-white">Our mobile-app hosting provider</span> — serves the mobile app’s files; your data is loaded from Firebase, not stored there.</>,
                ]} />
            </div>
            <div>
                <H>How long we keep it</H>
                <p>
                    Your data is kept while your account is active. Automatic backups thin out over time: everything from the last
                    two weeks, one per day for three months, and one per week for up to a year, after which they are deleted. Our
                    database also keeps a seven-day recovery history. When you delete your account (or ask us to), your data,
                    backups, and login are deleted right away; copies in that recovery history expire within seven days.
                </p>
            </div>
            <div>
                <H>Security</H>
                <p>
                    Your account data can be read only by your signed-in account. Connections are encrypted, API keys are stored
                    encrypted, and you can turn on two-step verification from the Security button. No system is perfectly secure,
                    so please use a strong, unique password.
                </p>
            </div>
            <div>
                <H>Your choices</H>
                <List items={[
                    'Edit or delete your notes, keys, and settings at any time in the app.',
                    'Restore an earlier version of your data from Backups.',
                    'Delete your account and all of its data yourself at any time: Security → Delete my account. It takes effect immediately.',
                    'Request a copy of your data, or help with deletion, by emailing us.',
                ]} />
            </div>
            <div>
                <H>Children</H>
                <p>Stock Stickies is not directed to children under 13, and we don’t knowingly collect their information.</p>
            </div>
            <div>
                <H>Changes</H>
                <p>We’ll update this policy as the app changes and revise the effective date above.</p>
            </div>
            <div>
                <H>Contact</H>
                <p>For privacy questions or requests, email <Contact />.</p>
            </div>
        </>
    )
}

function TermsOfUse() {
    return (
        <>
            <p>
                These Terms of Use govern your use of Stock Stickies, including stockstickies.com, its iPad board, and the mobile
                app. Stock Stickies is operated by Eastern Shore AI, LLC. By using it, you agree to these terms.
            </p>
            <div>
                <H>Not financial advice</H>
                <p>
                    Stock Stickies is a note-taking and portfolio-tracking tool. Nothing in it — including prices, charts, news,
                    portfolio figures, or Ask K’s answers — is investment, tax, or legal advice, or a recommendation to buy or sell
                    anything. You are solely responsible for your investment decisions.
                </p>
            </div>
            <div>
                <H>Market data and AI</H>
                <List items={[
                    'Prices, quotes, fundamentals, and news come from third parties and may be delayed, incomplete, or wrong. Don’t rely on them for trading.',
                    'Portfolio values and gains are estimates based on the share counts you enter and the latest available prices.',
                    'Ask K uses an AI model. Its answers can be mistaken or incomplete; check anything important yourself.',
                ]} />
            </div>
            <div>
                <H>Your account</H>
                <List items={[
                    'Provide accurate account information and keep your password private. You’re responsible for activity under your account.',
                    'If you turn on two-step verification, keep your authenticator app or its backup. If you lose it, contact us; we may need to verify your identity before restoring access.',
                    'You’re responsible for the content you store, and you keep ownership of it.',
                ]} />
            </div>
            <div>
                <H>Your API keys</H>
                <p>
                    Stock Stickies uses the Finnhub and MarketAux keys you provide. You are responsible for complying with those
                    providers’ terms and usage limits, and for any plan you choose with them.
                </p>
            </div>
            <div>
                <H>Acceptable use</H>
                <List items={[
                    'Don’t use the service to break the law or infringe anyone’s rights.',
                    'Don’t try to access other users’ data, probe or disrupt the service, or get around its limits (such as Ask K’s daily question limit).',
                    'Don’t scrape the service or use its servers or market-data endpoints for anything other than using the app.',
                ]} />
            </div>
            <div>
                <H>Availability and changes</H>
                <p>
                    Stock Stickies is provided free of charge. We may add, change, limit, or remove features — including Ask K and
                    usage limits — at any time, and the service may occasionally be unavailable. Automatic backups help protect
                    your data, but they are not guaranteed; keep your own records of anything important.
                </p>
            </div>
            <div>
                <H>Third-party services</H>
                <p>
                    The app relies on third parties such as Google Firebase, Cloudflare, Finnhub, MarketAux, and an AI model
                    provider. Their terms and privacy policies also apply to how they handle your requests.
                </p>
            </div>
            <div>
                <H>No warranty; limitation of liability</H>
                <p>
                    The service is provided “as is” and “as available,” without warranties of any kind. To the fullest extent the
                    law allows, Eastern Shore AI, LLC is not liable for any indirect, incidental, or consequential damages, or for
                    any trading or investment losses, arising from your use of Stock Stickies or its data.
                </p>
            </div>
            <div>
                <H>Termination</H>
                <p>
                    You may stop using the app and delete your account at any time from Security → Delete my account. We may suspend or end access for
                    anyone who violates these terms or misuses the service.
                </p>
            </div>
            <div>
                <H>Changes to these terms</H>
                <p>We may update these terms and will revise the effective date above. Continuing to use the app means you accept the updated terms.</p>
            </div>
            <div>
                <H>Contact</H>
                <p>Questions about these terms? Email <Contact />.</p>
            </div>
        </>
    )
}

export default function LegalModal({ view, onClose }) {
    useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div role="dialog" aria-modal="true" aria-labelledby="legal-title" className="w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
                    <h2 id="legal-title" className="text-xl font-bold text-white">
                        {view === 'privacy' ? 'Privacy Policy' : 'Terms of Use'}
                    </h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="max-h-[calc(90vh-72px)] space-y-5 overflow-auto px-6 py-5 text-sm leading-relaxed text-gray-300">
                    <p className="text-gray-400">Effective date: {EFFECTIVE_DATE}</p>
                    {view === 'privacy' ? <PrivacyPolicy /> : <TermsOfUse />}
                </div>
            </div>
        </div>
    )
}
