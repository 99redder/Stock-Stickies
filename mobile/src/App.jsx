import React, { useEffect, useMemo, useRef, useState } from 'react'
import firebase from 'firebase/compat/app'
import 'firebase/compat/auth'
import 'firebase/compat/firestore'
import 'firebase/compat/app-check'
import { createYtdShareCard, shareOrDownloadYtdCard } from './ytdShareCard'

const firebaseConfig = {
  // Firebase web configuration is public client metadata. Keep production
  // fallbacks so a static Sites build can still initialize before runtime
  // environment variables are available.
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDoS1vAgMJGV6kwnb16XVUPLxxsH0iieCI',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'red-s-stickies.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'red-s-stickies',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'red-s-stickies.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '896398882822',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:896398882822:web:dcfc3217a949601916eb87',
}

let auth = null
let db = null
try {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig)
  const appCheckKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY || '6Ld6FE4sAAAAANxjvc3zRPUlAvZ5s-0gpKNUcRpN'
  if (appCheckKey) firebase.appCheck().activate(appCheckKey, false)
  auth = firebase.auth()
  db = firebase.firestore()
  db.enablePersistence({ cache: 'owning-tab' }).catch(() => {})
} catch (error) {
  console.error('Firebase initialization failed', error)
}

const ASKK_API_URL = import.meta.env.VITE_ASKK_API_URL
  || 'https://stock-stickies-askk.99redder.workers.dev/api/ask-k?client=mobile-build-9'
const BROKERAGE_API_URL = 'https://rentals-api.99redder.workers.dev/api/stock-stickies/plaid/holdings?client=mobile-build-9'

const ACCOUNTS = [
  { id: 'individual', label: 'Individual', short: 'Taxable', strategy: 'Taxable individual brokerage — primarily swing trades and shorter-horizon positions.' },
  { id: 'traditional', label: 'Traditional IRA', short: 'Trad. IRA', strategy: 'Traditional IRA — long-term buy-and-hold core of quality names.' },
  { id: 'roth', label: 'Roth IRA', short: 'Roth IRA', strategy: 'Roth IRA — higher-risk speculative names plus cash secured puts.' },
]
const ACCOUNT_IDS = ACCOUNTS.map((account) => account.id)
const UNASSIGNED = 'unassigned'

const normalizeTicker = (value) => String(value || '').trim().toUpperCase()
const getAccount = (note) => {
  if (ACCOUNT_IDS.includes(note?.account)) return note.account
  // Legacy cash notes predate brokerage-account attribution. Actual dollars
  // are only held in the taxable account, so USD has an unambiguous home.
  if (normalizeTicker(note?.title) === 'USD') return 'individual'
  return UNASSIGNED
}
const getAccountLabel = (id) => ACCOUNTS.find((account) => account.id === id)?.label || 'Unassigned'
const getPutAccount = (put) => ACCOUNT_IDS.includes(put?.account) ? put.account : 'roth'
const money = (value, digits = 0) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
}).format(Number(value || 0))
const signedMoney = (value, digits = 0) => {
  const amount = Number(value || 0)
  return `${amount > 0 ? '+' : ''}${money(amount, digits)}`
}
const signedPercent = (value, digits = 1) => {
  const amount = Number(value || 0)
  return `${amount > 0 ? '+' : ''}${amount.toFixed(digits)}%`
}
const number = (value, digits = 2) => Number(value || 0).toLocaleString('en-US', {
  maximumFractionDigits: digits,
})
const profileDate = (value, includeTime = false) => {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unavailable'
  return date.toLocaleString([], includeTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
}
const isCrypto = (note) => note?.plaidIsCrypto === true || note?.plaidSecurityType === 'cryptocurrency'
const plaidPrice = (note) => {
  const price = Number(note?.plaidInstitutionPrice)
  return Number.isFinite(price) && price > 0 ? price : 0
}

async function getEncryptionKey(userId) {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`${userId}|StockStickies|2024`),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('StockStickiesSalt2024'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
}

async function decryptApiKey(value, userId) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (!value.encrypted || !value.iv || !userId) return ''
  try {
    const key = await getEncryptionKey(userId)
    const encrypted = Uint8Array.from(atob(value.encrypted), (character) => character.charCodeAt(0))
    const iv = Uint8Array.from(atob(value.iv), (character) => character.charCodeAt(0))
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted)
    return new TextDecoder().decode(decrypted)
  } catch {
    return ''
  }
}

function Icon({ name, size = 20 }) {
  const paths = {
    refresh: <><path d="M20 6v5h-5" /><path d="M18.5 15a7 7 0 1 1-.5-8l2 4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    logout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-6" /></>,
    install: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.6 6.8-4.2M8.6 13.4l6.8 4.2" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function StockStickiesLogo({ compact = false }) {
  return (
    <div className={`stock-stickies-logo ${compact ? 'compact' : ''}`} aria-label="Stock Stickies">
      <svg width={compact ? 42 : 58} height={compact ? 42 : 58} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="44" height="44" rx="4" fill="#1a1a2e" stroke="#00ff9f" strokeWidth="2" />
        <path d="M8 32 L16 20 L22 26 L32 12 L40 18" stroke="#39ff14" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="20" r="3" fill="#39ff14" />
        <circle cx="32" cy="12" r="3" fill="#39ff14" />
        <rect x="6" y="36" width="8" height="6" fill="#39ff14" opacity=".7" />
        <rect x="16" y="33" width="8" height="9" fill="#39ff14" opacity=".8" />
        <rect x="26" y="30" width="8" height="12" fill="#39ff14" opacity=".9" />
        <rect x="36" y="34" width="6" height="8" fill="#39ff14" opacity=".6" />
      </svg>
      <span>
        <strong>STOCK</strong>
        <small>STICKIES</small>
      </span>
    </div>
  )
}

function AskK({ portfolio }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)
  const quickPrompts = [
    'How concentrated is my portfolio?',
    'What are my largest risks?',
    'How much cash do I have by account?',
    'Review my CSP obligations.',
  ]

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', content: "Hi — I'm K. Ask me about concentration, allocation, accounts, cash, or your CSP exposure." }])
    }
  }, [open, messages.length])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const send = async (raw) => {
    const text = String(raw || '').trim()
    if (!text || busy) return
    const history = [...messages, { role: 'user', content: text }]
    setMessages(history)
    setInput('')
    setBusy(true)
    try {
      const response = await fetch(ASKK_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: history.slice(-10),
          portfolio,
        }),
      })
      const result = await response.json().catch(() => ({}))
      setMessages((current) => [...current, {
        role: 'assistant',
        content: result?.ok && result?.reply ? result.reply : (result?.error || 'I could not process that. Try again in a moment.'),
      }])
    } catch {
      setMessages((current) => [...current, { role: 'assistant', content: 'I cannot reach Ask K right now. Check your connection and try again.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="ask-k-fab" type="button" onClick={() => setOpen(true)} aria-label="Open Ask K">
        <span>K</span> Ask K
      </button>
      {open && <button className="scrim" type="button" aria-label="Close Ask K" onClick={() => setOpen(false)} />}
      <aside className={`ask-drawer ${open ? 'open' : ''}`} aria-hidden={!open} aria-label="Ask K portfolio assistant">
        <header className="ask-header">
          <div className="k-avatar">K</div>
          <div><strong>Ask K</strong><small>Portfolio analysis assistant</small></div>
          <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close"><Icon name="close" /></button>
        </header>
        <div className="messages" ref={scrollRef}>
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
              {message.content.split('\n').map((line, lineIndex) => <React.Fragment key={lineIndex}>{lineIndex > 0 && <br />}{line}</React.Fragment>)}
            </div>
          ))}
          {busy && <div className="message assistant thinking">K is thinking<span>…</span></div>}
          {messages.length <= 1 && !busy && (
            <div className="quick-prompts">
              {quickPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => send(prompt)}>{prompt}</button>)}
            </div>
          )}
        </div>
        <form className="ask-compose" onSubmit={(event) => { event.preventDefault(); send(input) }}>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} rows="1" placeholder="Ask about your portfolio…" aria-label="Message Ask K" />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send"><Icon name="send" /></button>
          <small>K provides observations, not financial advice.</small>
        </form>
      </aside>
    </>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [success, setSuccess] = useState('')

  const signIn = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      if (!auth) throw new Error('Firebase is not configured for this app.')
      const normalizedEmail = email.trim().toLowerCase()
      if (resetMode) {
        await auth.sendPasswordResetEmail(normalizedEmail)
        setSuccess('Password reset email sent.')
      } else {
        await auth.signInWithEmailAndPassword(normalizedEmail, password)
      }
    } catch (reason) {
      setError(reason?.message || (resetMode ? 'Unable to send the reset email.' : 'Unable to sign in.'))
    } finally {
      setBusy(false)
    }
  }

  const googleSignIn = async () => {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      if (!auth) throw new Error('Firebase is not configured for this app.')
      await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
    } catch (reason) {
      setError(reason?.message || 'Unable to sign in with Google.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <StockStickiesLogo />
        <p className="login-copy">Capture stock ideas, track your portfolio value, and keep your investing notes organized.</p>
        <form onSubmit={signIn}>
          <label>Email<input type="email" autoComplete="username" placeholder="Enter email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          {!resetMode && <label>Password<input type="password" autoComplete="current-password" placeholder="Enter password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success" role="status">{success}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : resetMode ? 'Send Reset Email' : 'Login'}
          </button>
        </form>
        {!resetMode && (
          <>
            <div className="divider"><span>or</span></div>
            <button className="google-button" type="button" onClick={googleSignIn} disabled={busy}>
              <span className="google-mark">G</span>
              Continue with Google
            </button>
            <a className="account-help-link" href="https://stockstickies.com">New here? How to create an account</a>
          </>
        )}
        <div className="login-links">
          <a href="https://stockstickies.com">{resetMode ? 'Return to the main site' : 'Sign Up with Email'}</a>
          <button
            type="button"
            onClick={() => {
              setResetMode((current) => !current)
              setError('')
              setSuccess('')
            }}
          >
            {resetMode ? 'Back to login' : 'Forgot password?'}
          </button>
        </div>
        <footer className="login-footer">
          <span>Website created and maintained by <a href="https://www.easternshore.ai" target="_blank" rel="noreferrer">Eastern Shore AI, LLC</a></span>
          <small>Mobile Portfolio</small>
        </footer>
      </section>
    </main>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [dataError, setDataError] = useState('')
  const [notes, setNotes] = useState([])
  const [categories, setCategories] = useState([])
  const [colorLabels, setColorLabels] = useState({})
  const [cashSecuredPuts, setCashSecuredPuts] = useState([])
  const [watchList, setWatchList] = useState([])
  const [nickname, setNickname] = useState('')
  const [profilePhoto, setProfilePhoto] = useState('')
  const [finnhubKey, setFinnhubKey] = useState('')
  const [prices, setPrices] = useState({})
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
  const [sortMode, setSortMode] = useState('size-desc')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [installEvent, setInstallEvent] = useState(null)
  const [brokerageSnapshot, setBrokerageSnapshot] = useState(null)
  const [brokerageError, setBrokerageError] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [cashSectionExpanded, setCashSectionExpanded] = useState(false)
  const [expandedCashAccounts, setExpandedCashAccounts] = useState({})

  useEffect(() => {
    const onInstall = (event) => {
      event.preventDefault()
      setInstallEvent(event)
    }
    window.addEventListener('beforeinstallprompt', onInstall)
    return () => window.removeEventListener('beforeinstallprompt', onInstall)
  }, [])

  useEffect(() => {
    if (!auth) {
      setAuthReady(true)
      return undefined
    }
    return auth.onAuthStateChanged((nextUser) => {
      setUser(nextUser)
      setAuthReady(true)
      if (!nextUser) {
        setDataReady(false)
        setNotes([])
      }
    })
  }, [])

  useEffect(() => {
    if (!user || !db) return undefined
    const cacheKey = `stock-stickies-mobile-prices-${user.uid}`
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}')
      if (cached.prices) setPrices(cached.prices)
      if (cached.timestamp) setLastUpdated(new Date(cached.timestamp))
    } catch {
      // Ignore a malformed device cache.
    }

    return db.collection('users').doc(user.uid).onSnapshot(async (snapshot) => {
      if (!snapshot.exists) {
        setDataError('No Stock Stickies portfolio was found for this account.')
        setDataReady(true)
        return
      }
      const data = snapshot.data() || {}
      const incomingNotes = Array.isArray(data.notes) ? data.notes : []
      setNotes(incomingNotes)
      setCategories(Array.isArray(data.categories) ? data.categories : [])
      setColorLabels(data.colorLabels || {})
      setCashSecuredPuts(Array.isArray(data.cashSecuredPuts) ? data.cashSecuredPuts : [])
      setWatchList(Array.isArray(data.watchList) ? data.watchList : [])
      setNickname(data.nickname || '')
      setProfilePhoto(data.profilePhoto || user.photoURL || '')
      setFinnhubKey(await decryptApiKey(data.finnhubApiKey, user.uid))
      setPrices((current) => {
        const seeded = { ...current }
        incomingNotes.forEach((note) => {
          const ticker = normalizeTicker(note.title)
          const sourcePrice = plaidPrice(note)
          if (ticker === 'USD') seeded[ticker] = 1
          else if (ticker && sourcePrice > 0 && (!seeded[ticker] || isCrypto(note))) seeded[ticker] = sourcePrice
        })
        return seeded
      })
      setDataError('')
      setDataReady(true)
    }, (error) => {
      setDataError(error?.message || 'Unable to load the portfolio.')
      setDataReady(true)
    })
  }, [user])

  useEffect(() => {
    if (!user) {
      setBrokerageSnapshot(null)
      setBrokerageError('')
      return undefined
    }

    let active = true
    const loadBrokerageBalances = async () => {
      try {
        const idToken = await user.getIdToken()
        const response = await fetch(BROKERAGE_API_URL, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || data?.ok === false) {
          throw new Error(data?.error || `Brokerage balances could not be loaded (${response.status}).`)
        }
        if (active) {
          setBrokerageSnapshot(data)
          setBrokerageError('')
        }
      } catch (error) {
        if (active) {
          setBrokerageSnapshot(null)
          setBrokerageError(error?.message || 'Brokerage balances could not be loaded.')
        }
      }
    }

    void loadBrokerageBalances()
    return () => { active = false }
  }, [user])

  const portfolioNotes = useMemo(
    () => notes.filter((note) => normalizeTicker(note.title) && Number(note.shares) > 0),
    [notes],
  )

  const allPositions = useMemo(() => {
    const brokerByPlaidAccountSecurity = new Map()
    const brokerByStockAccountSecurity = new Map()
    const brokerByAccountTicker = new Map()
    for (const holding of Array.isArray(brokerageSnapshot?.positions) ? brokerageSnapshot.positions : []) {
      const holdingTicker = normalizeTicker(holding?.ticker) === 'CUR:USD'
        ? 'USD'
        : normalizeTicker(holding?.ticker)
      const holdingAccount = ACCOUNT_IDS.includes(holding?.stockStickiesAccount)
        ? holding.stockStickiesAccount
        : ''
      if (holding?.securityId && holding?.accountId) {
        brokerByPlaidAccountSecurity.set(`${holding.accountId}:${holding.securityId}`, holding)
      }
      if (holdingAccount && holding?.securityId) {
        brokerByStockAccountSecurity.set(`${holdingAccount}:${holding.securityId}`, holding)
      }
      if (holdingAccount && holdingTicker) {
        brokerByAccountTicker.set(`${holdingAccount}:${holdingTicker}`, holding)
      }
    }
    const raw = portfolioNotes.map((note) => {
      const ticker = normalizeTicker(note.title)
      const account = getAccount(note)
      const brokerHolding = (note.plaidAccountId && note.plaidSecurityId
        && brokerByPlaidAccountSecurity.get(`${note.plaidAccountId}:${note.plaidSecurityId}`))
        || (note.plaidSecurityId && brokerByStockAccountSecurity.get(`${account}:${note.plaidSecurityId}`))
        || brokerByAccountTicker.get(`${account}:${ticker}`)
      const brokerPrice = Number(brokerHolding?.institutionPrice)
      const price = ticker === 'USD'
        ? 1
        : Number(prices[ticker] || (Number.isFinite(brokerPrice) && brokerPrice > 0 ? brokerPrice : 0) || plaidPrice(note) || 0)
      const shares = Number(note.shares) || 0
      const category = colorLabels[note.color] || 'Unclassified'
      const rawCostBasis = brokerHolding?.costBasis ?? note.plaidCostBasis
      const parsedCostBasis = Number(rawCostBasis)
      const taxLots = Array.isArray(brokerHolding?.taxLots)
        ? brokerHolding.taxLots
        : (Array.isArray(note.plaidTaxLots) ? note.plaidTaxLots : [])
      const isShort = taxLots.length > 0 && taxLots.every((lot) => lot?.positionType === 'SHORT')
      const hasCostBasis = ticker !== 'USD'
        && !isShort
        && rawCostBasis !== null
        && rawCostBasis !== undefined
        && rawCostBasis !== ''
        && Number.isFinite(parsedCostBasis)
        && parsedCostBasis >= 0
      const costBasis = hasCostBasis ? parsedCostBasis : null
      const value = shares * price
      const unrealizedPnL = hasCostBasis && price > 0 ? value - costBasis : null
      const unrealizedPnLPercent = unrealizedPnL != null && costBasis > 0
        ? (unrealizedPnL / costBasis) * 100
        : null
      return {
        id: note.id,
        ticker,
        shares,
        price,
        value,
        costBasis,
        unrealizedPnL,
        unrealizedPnLPercent,
        taxLots,
        taxLotCount: Number.isFinite(Number(brokerHolding?.taxLotCount))
          ? Math.max(0, Math.trunc(Number(brokerHolding.taxLotCount)))
          : taxLots.length,
        account,
        category,
        note: String(note.text || '').trim(),
        isCash: category.trim().toLowerCase() === 'cash' || ticker === 'USD' || ticker === 'SGOV',
      }
    })
    const total = raw.reduce((sum, position) => sum + position.value, 0)
    return raw.map((position) => ({
      ...position,
      percentage: total > 0 ? (position.value / total) * 100 : 0,
    }))
  }, [portfolioNotes, prices, colorLabels, brokerageSnapshot])

  const accountTotals = useMemo(() => {
    const totals = {}
    allPositions.forEach((position) => {
      if (!totals[position.account]) {
        totals[position.account] = {
          value: 0,
          count: 0,
          knownCostBasis: 0,
          unrealizedPnL: 0,
          pnlCount: 0,
          missingPnlCount: 0,
        }
      }
      totals[position.account].value += position.value
      totals[position.account].count += 1
      if (position.unrealizedPnL != null) {
        totals[position.account].knownCostBasis += position.costBasis
        totals[position.account].unrealizedPnL += position.unrealizedPnL
        totals[position.account].pnlCount += 1
      } else {
        totals[position.account].missingPnlCount += 1
      }
    })
    Object.values(totals).forEach((total) => {
      total.unrealizedPnLPercent = total.knownCostBasis > 0
        ? (total.unrealizedPnL / total.knownCostBasis) * 100
        : null
    })
    return totals
  }, [allPositions])

  const brokerAccountMetrics = useMemo(() => {
    const metrics = Object.fromEntries(ACCOUNT_IDS.map((id) => [id, {
      currentBalance: 0,
      availableBalance: 0,
      holdingsValue: 0,
      nonCashHoldingsValue: 0,
      actualCashValue: 0,
      sgovValue: 0,
      sgovCostBasis: 0,
      hasSgovCostBasis: false,
      cashBalance: 0,
      hasBalance: false,
      hasAvailableBalance: false,
      hasHoldings: false,
    }]))
    const accountById = new Map()

    for (const account of Array.isArray(brokerageSnapshot?.accounts) ? brokerageSnapshot.accounts : []) {
      if (!ACCOUNT_IDS.includes(account?.stockStickiesAccount)) continue
      const id = account.stockStickiesAccount
      const currentBalance = account.currentBalance === null
        || account.currentBalance === undefined
        || account.currentBalance === ''
        ? Number.NaN
        : Number(account.currentBalance)
      if (Number.isFinite(currentBalance)) {
        metrics[id].currentBalance += currentBalance
        metrics[id].hasBalance = true
      }
      const availableBalance = account.availableBalance === null
        || account.availableBalance === undefined
        || account.availableBalance === ''
        ? Number.NaN
        : Number(account.availableBalance)
      if (Number.isFinite(availableBalance)) {
        metrics[id].availableBalance += availableBalance
        metrics[id].hasAvailableBalance = true
      }
      accountById.set(account.accountId, id)
    }

    for (const position of Array.isArray(brokerageSnapshot?.positions) ? brokerageSnapshot.positions : []) {
      const id = ACCOUNT_IDS.includes(position?.stockStickiesAccount)
        ? position.stockStickiesAccount
        : accountById.get(position?.accountId)
      const value = Number(position?.institutionValue)
      if (!id || !Number.isFinite(value)) continue
      const ticker = normalizeTicker(position?.ticker)
      metrics[id].holdingsValue += value
      metrics[id].hasHoldings = true
      const isRawCash = ticker === 'CUR:USD' || ticker === 'USD'
      if (!isRawCash) metrics[id].nonCashHoldingsValue += value
      if (isRawCash) {
        metrics[id].actualCashValue += value
        metrics[id].cashBalance += value
      } else if (ticker === 'SGOV') {
        metrics[id].sgovValue += value
        const costBasis = Number(position?.costBasis)
        if (
          position?.costBasis !== null &&
          position?.costBasis !== undefined &&
          position?.costBasis !== '' &&
          Number.isFinite(costBasis) &&
          costBasis >= 0
        ) {
          metrics[id].sgovCostBasis += costBasis
          metrics[id].hasSgovCostBasis = true
        }
        metrics[id].cashBalance += value
      }
    }

    return metrics
  }, [brokerageSnapshot])

  const cashMetricsByAccount = useMemo(() => {
    const ids = [...ACCOUNT_IDS, UNASSIGNED]
    return Object.fromEntries(ids.map((id) => {
      const noteActualCash = allPositions
        .filter((position) => position.account === id && position.ticker === 'USD')
        .reduce((sum, position) => sum + position.value, 0)
      const noteSgov = allPositions
        .filter((position) => position.account === id && position.ticker === 'SGOV')
        .reduce((sum, position) => sum + position.value, 0)
      const noteSgovPositionsWithBasis = allPositions
        .filter((position) => position.account === id && position.ticker === 'SGOV' && position.costBasis != null)
      const noteSgovCostBasis = noteSgovPositionsWithBasis
        .reduce((sum, position) => sum + position.costBasis, 0)
      const brokerMetrics = brokerAccountMetrics[id]
      const hasBrokerMetrics = Boolean(brokerMetrics?.hasBalance || brokerMetrics?.hasHoldings)
      const cspCollateral = cashSecuredPuts
        .filter((put) => getPutAccount(put) === id)
        .reduce((sum, put) => sum + (Number(put.strike) || 0) * (Number(put.qty) || 0) * 100, 0)
      const cashHolding = Math.max(0, brokerMetrics?.actualCashValue || 0)
      const institutionAvailable = brokerMetrics?.hasAvailableBalance
        ? Math.max(0, brokerMetrics.availableBalance)
        : null
      const adjustedInstitutionAvailable = institutionAvailable == null
        ? null
        : cspCollateral > 0 && institutionAvailable > cspCollateral
          ? institutionAvailable - cspCollateral
          : institutionAvailable
      const balanceDerivedAvailable = brokerMetrics?.hasBalance
        ? Math.max(0, brokerMetrics.currentBalance - brokerMetrics.nonCashHoldingsValue - cspCollateral)
        : null
      const availableCashCandidates = [
        cashHolding > 0 ? { value: cashHolding, source: 'cash-holding' } : null,
        adjustedInstitutionAvailable > 0 ? { value: adjustedInstitutionAvailable, source: 'institution-available' } : null,
        balanceDerivedAvailable > 0 ? { value: balanceDerivedAvailable, source: 'account-equation' } : null,
      ].filter(Boolean)
      const reconciledCash = availableCashCandidates.reduce(
        (lowest, candidate) => !lowest || candidate.value < lowest.value ? candidate : lowest,
        null,
      )
      const reconciledActualCash = hasBrokerMetrics
        ? (reconciledCash?.value || 0)
        : noteActualCash
      const cashPool = hasBrokerMetrics
        ? (cashHolding || reconciledActualCash)
        : noteActualCash
      const cashIncludesCspCollateral = cspCollateral > 0
        && cashPool > 0
        && (
          !institutionAvailable
          || Math.abs(institutionAvailable - cashPool) < 0.01
        )
      const actualCash = cashIncludesCspCollateral ? 0 : reconciledActualCash
      const sgov = hasBrokerMetrics ? brokerMetrics.sgovValue : noteSgov
      const sgovCostBasis = hasBrokerMetrics
        ? (brokerMetrics.hasSgovCostBasis ? brokerMetrics.sgovCostBasis : null)
        : (noteSgovPositionsWithBasis.length ? noteSgovCostBasis : null)
      return [id, {
        actualCash,
        actualCashSource: cashIncludesCspCollateral
          ? 'unavailable'
          : (hasBrokerMetrics ? (reconciledCash?.source || 'unavailable') : 'note'),
        cashPool,
        cashIncludesCspCollateral,
        sgov,
        sgovCostBasis,
        totalAvailableCash: actualCash + sgov,
        totalCashPool: cashPool + sgov,
      }]
    }))
  }, [allPositions, brokerAccountMetrics, cashSecuredPuts])

  const filteredPositions = useMemo(() => {
    const scoped = accountFilter === 'all'
      ? allPositions
      : allPositions.filter((position) => position.account === accountFilter)
    const scopedTotal = scoped.reduce((sum, position) => sum + position.value, 0)
    return scoped.map((position) => ({
      ...position,
      percentage: scopedTotal > 0 ? (position.value / scopedTotal) * 100 : 0,
    }))
  }, [allPositions, accountFilter])

  const scopedPnlTotals = useMemo(() => {
    const covered = filteredPositions.filter((position) => position.unrealizedPnL != null)
    const knownCostBasis = covered.reduce((sum, position) => sum + position.costBasis, 0)
    const unrealizedPnL = covered.reduce((sum, position) => sum + position.unrealizedPnL, 0)
    return {
      knownCostBasis,
      unrealizedPnL,
      unrealizedPnLPercent: knownCostBasis > 0 ? (unrealizedPnL / knownCostBasis) * 100 : null,
      coveredCount: covered.length,
      missingCount: filteredPositions.length - covered.length,
    }
  }, [filteredPositions])

  const allPnlTotals = useMemo(() => {
    const totals = Object.values(accountTotals)
    const knownCostBasis = totals.reduce((sum, total) => sum + total.knownCostBasis, 0)
    const unrealizedPnL = totals.reduce((sum, total) => sum + total.unrealizedPnL, 0)
    const coveredCount = totals.reduce((sum, total) => sum + total.pnlCount, 0)
    return {
      unrealizedPnL,
      unrealizedPnLPercent: knownCostBasis > 0 ? (unrealizedPnL / knownCostBasis) * 100 : null,
      coveredCount,
    }
  }, [accountTotals])
  const ytdPerformance = brokerageSnapshot?.performance || null
  const scopedYtdPerformance = accountFilter === 'all'
    ? ytdPerformance?.total
    : ytdPerformance?.accounts?.[accountFilter]

  const sortedPositions = useMemo(() => {
    const query = search.trim().toUpperCase()
    const result = filteredPositions.filter((position) => !query || position.ticker.includes(query) || position.category.toUpperCase().includes(query))
    return result.sort((a, b) => {
      if (sortMode === 'name-asc') return a.ticker.localeCompare(b.ticker)
      if (sortMode === 'name-desc') return b.ticker.localeCompare(a.ticker)
      if (sortMode === 'size-asc') return a.value - b.value || a.ticker.localeCompare(b.ticker)
      if (sortMode === 'shares-desc') return b.shares - a.shares || a.ticker.localeCompare(b.ticker)
      if (sortMode === 'price-desc') return b.price - a.price || a.ticker.localeCompare(b.ticker)
      return b.value - a.value || a.ticker.localeCompare(b.ticker)
    })
  }, [filteredPositions, search, sortMode])

  const missingPrices = filteredPositions.filter((position) => position.price <= 0).length
  const putObligationByAccount = useMemo(() => {
    const totals = {}
    cashSecuredPuts.forEach((put) => {
      const account = getPutAccount(put)
      totals[account] = (totals[account] || 0) + (Number(put.strike) || 0) * (Number(put.qty) || 0) * 100
    })
    return totals
  }, [cashSecuredPuts])
  const totalPutObligation = Object.values(putObligationByAccount).reduce((sum, value) => sum + value, 0)
  const accountDisplayBalances = Object.fromEntries(ACCOUNT_IDS.map((id) => [
    id,
    brokerAccountMetrics[id].hasBalance
      ? brokerAccountMetrics[id].currentBalance
      : brokerAccountMetrics[id].hasHoldings
        ? brokerAccountMetrics[id].holdingsValue
        : (accountTotals[id]?.value || 0) + (putObligationByAccount[id] || 0),
  ]))
  const grandAccountBalance = ACCOUNT_IDS.reduce((sum, id) => sum + accountDisplayBalances[id], 0)
    + (accountTotals[UNASSIGNED]?.value || 0)
  const accountBalance = accountFilter === 'all'
    ? grandAccountBalance
    : (accountDisplayBalances[accountFilter] ?? (accountTotals[accountFilter]?.value || 0))
  const hasBrokerPortfolio = accountFilter === 'all'
    ? ACCOUNT_IDS.some((id) => brokerAccountMetrics[id].hasBalance || brokerAccountMetrics[id].hasHoldings)
    : Boolean(brokerAccountMetrics[accountFilter]?.hasBalance || brokerAccountMetrics[accountFilter]?.hasHoldings)
  const scopedCashAccountIds = accountFilter === 'all' ? ACCOUNT_IDS : [accountFilter]
  const totalCash = scopedCashAccountIds
    .reduce((sum, id) => sum + (cashMetricsByAccount[id]?.totalCashPool || 0), 0)
  const allCashPositionRows = scopedCashAccountIds
    .flatMap((id) => {
      const accountLabel = getAccountLabel(id)
      const accountSgovValue = cashMetricsByAccount[id]?.sgov || 0
      const accountSgovCostBasis = cashMetricsByAccount[id]?.sgovCostBasis ?? null
      const accountSgovPnL = accountSgovCostBasis == null ? null : accountSgovValue - accountSgovCostBasis
      return [
        cashMetricsByAccount[id]?.cashIncludesCspCollateral ? {
          id: `cash-summary-${id}`,
          account: id,
          ticker: 'CASH',
          category: 'Brokerage cash · includes CSP-secured cash',
          accountLabel,
          value: cashMetricsByAccount[id]?.cashPool || 0,
          summaryKind: 'cash',
          summaryType: 'Brokerage cash pool',
          includeInCashTotal: true,
          includeInComposition: true,
          summaryNote: 'Plaid reports the full brokerage cash pool, not Robinhood buying power. CSP collateral is already included and is not added again.',
        } : {
          id: `cash-summary-${id}`,
          account: id,
          ticker: 'CASH',
          category: 'Actual available cash',
          accountLabel,
          value: cashMetricsByAccount[id]?.actualCash || 0,
          summaryKind: 'cash',
          summaryType: 'Liquid cash',
          includeInCashTotal: true,
          includeInComposition: true,
          summaryNote: cashMetricsByAccount[id]?.actualCashSource === 'account-equation'
            ? 'Available cash derived from account value less non-cash holdings and CSP collateral.'
            : cashMetricsByAccount[id]?.actualCashSource === 'institution-available'
            ? 'Available cash reported by the linked institution.'
            : cashMetricsByAccount[id]?.actualCashSource === 'cash-holding'
              ? 'Available cash reported as a brokerage cash holding.'
              : 'Available cash from the portfolio note.',
        },
        {
          id: `csp-summary-${id}`,
          account: id,
          ticker: 'CSP',
          category: 'Cash-secured put collateral',
          accountLabel,
          value: putObligationByAccount[id] || 0,
          summaryKind: 'csp',
          summaryType: 'Reserved collateral',
          includeInCashTotal: false,
          includeInComposition: false,
          summaryNote: 'Nominal assignment obligation shown for reference. It is not added to brokerage cash because the secured cash is already included there.',
        },
        {
          id: `sgov-summary-${id}`,
          account: id,
          ticker: 'SGOV',
          category: 'Treasury cash equivalent',
          accountLabel,
          value: accountSgovValue,
          costBasis: accountSgovCostBasis,
          unrealizedPnL: accountSgovPnL,
          unrealizedPnLPercent: accountSgovCostBasis > 0
            ? (accountSgovPnL / accountSgovCostBasis) * 100
            : null,
          summaryKind: 'sgov',
          summaryType: 'Cash equivalent',
          includeInCashTotal: true,
          includeInComposition: true,
        },
      ]
    })
    .filter((position) => position.value > 0)
  const cashAccountSummaries = scopedCashAccountIds.map((id) => {
    const components = allCashPositionRows.filter((position) => position.account === id)
    return {
      account: id,
      accountLabel: getAccountLabel(id),
      total: components
        .filter((position) => position.includeInCashTotal !== false)
        .reduce((sum, position) => sum + position.value, 0),
      components,
    }
  })
  const displayPositionCandidates = [
    ...sortedPositions.filter((position) => position.ticker !== 'USD' && position.ticker !== 'SGOV'),
  ]
  const displayCompositionTotal = [
    ...allCashPositionRows.filter((position) => position.includeInComposition !== false),
    ...filteredPositions.filter((position) => position.ticker !== 'USD' && position.ticker !== 'SGOV'),
  ].reduce((sum, position) => sum + position.value, 0)
  const displayPositions = displayPositionCandidates.map((position) => ({
    ...position,
    compositionPercentage: displayCompositionTotal > 0
      ? (position.value / displayCompositionTotal) * 100
      : 0,
  }))

  const askKPortfolio = useMemo(() => {
    const grandTotal = allPositions.reduce((sum, position) => sum + position.value, 0)
    const positionIds = new Set(allPositions.map((position) => position.id))
    const positionsWithCostBasis = allPositions.filter((position) => position.costBasis != null)
    const positionsWithUnrealizedPnL = positionsWithCostBasis.filter((position) => position.unrealizedPnL != null)
    const knownCostBasis = positionsWithUnrealizedPnL.reduce((sum, position) => sum + position.costBasis, 0)
    const knownUnrealizedPnL = positionsWithUnrealizedPnL.reduce((sum, position) => sum + position.unrealizedPnL, 0)
    return {
      asOf: new Date().toISOString(),
      nickname: nickname || null,
      totals: {
        longMarketValue: Number(grandTotal.toFixed(2)),
        accountBalance: Number(grandAccountBalance.toFixed(2)),
        actualCashBalance: Number(ACCOUNT_IDS.reduce((sum, id) => sum + cashMetricsByAccount[id].actualCash, 0).toFixed(2)),
        brokerageCashPool: Number(ACCOUNT_IDS.reduce((sum, id) => sum + cashMetricsByAccount[id].cashPool, 0).toFixed(2)),
        sgovValue: Number(ACCOUNT_IDS.reduce((sum, id) => sum + cashMetricsByAccount[id].sgov, 0).toFixed(2)),
        cashBalance: Number(ACCOUNT_IDS.reduce((sum, id) => sum + cashMetricsByAccount[id].totalAvailableCash, 0).toFixed(2)),
        availableCash: Number(ACCOUNT_IDS.reduce((sum, id) => sum + cashMetricsByAccount[id].totalAvailableCash, 0).toFixed(2)),
        totalAvailableCash: Number(ACCOUNT_IDS.reduce((sum, id) => sum + cashMetricsByAccount[id].totalAvailableCash, 0).toFixed(2)),
        totalCash: Number(ACCOUNT_IDS.reduce((sum, id) => sum + cashMetricsByAccount[id].totalCashPool, 0).toFixed(2)),
        cspObligation: Number(totalPutObligation.toFixed(2)),
        longPlusCspExposure: Number((grandTotal + totalPutObligation).toFixed(2)),
        positionCount: allPositions.length,
        cspCount: cashSecuredPuts.length,
        missingPrices: allPositions.filter((position) => position.price <= 0).length,
        positionsWithCostBasis: positionsWithCostBasis.length,
        positionsWithUnrealizedPnL: positionsWithUnrealizedPnL.length,
        knownCostBasis: Number(knownCostBasis.toFixed(2)),
        knownUnrealizedPnL: Number(knownUnrealizedPnL.toFixed(2)),
        knownUnrealizedPnLPercent: knownCostBasis > 0
          ? Number(((knownUnrealizedPnL / knownCostBasis) * 100).toFixed(2))
          : null,
      },
      accounts: [
        ...ACCOUNTS.map((account) => ({
          id: account.id,
          label: account.label,
          strategy: account.strategy,
          marketValue: Number((accountTotals[account.id]?.value || 0).toFixed(2)),
          accountBalance: Number(accountDisplayBalances[account.id].toFixed(2)),
          actualCashBalance: Number(cashMetricsByAccount[account.id].actualCash.toFixed(2)),
          brokerageCashPool: Number(cashMetricsByAccount[account.id].cashPool.toFixed(2)),
          cashIncludesCspCollateral: cashMetricsByAccount[account.id].cashIncludesCspCollateral,
          sgovValue: Number(cashMetricsByAccount[account.id].sgov.toFixed(2)),
          cashBalance: Number(cashMetricsByAccount[account.id].totalAvailableCash.toFixed(2)),
          availableCash: Number(cashMetricsByAccount[account.id].totalAvailableCash.toFixed(2)),
          totalAvailableCash: Number(cashMetricsByAccount[account.id].totalAvailableCash.toFixed(2)),
          totalCash: Number(cashMetricsByAccount[account.id].totalCashPool.toFixed(2)),
          knownCostBasis: Number(allPositions
            .filter((position) => position.account === account.id && position.unrealizedPnL != null)
            .reduce((sum, position) => sum + position.costBasis, 0)
            .toFixed(2)),
          knownUnrealizedPnL: Number(allPositions
            .filter((position) => position.account === account.id && position.unrealizedPnL != null)
            .reduce((sum, position) => sum + position.unrealizedPnL, 0)
            .toFixed(2)),
          positionCount: accountTotals[account.id]?.count || 0,
          percentOfTotal: grandTotal > 0 ? Number((((accountTotals[account.id]?.value || 0) / grandTotal) * 100).toFixed(2)) : 0,
          cspObligation: Number((putObligationByAccount[account.id] || 0).toFixed(2)),
        })),
        ...(accountTotals[UNASSIGNED] ? [{
          id: UNASSIGNED,
          label: 'Unassigned',
          strategy: 'Positions not yet assigned to an account.',
          marketValue: Number(accountTotals[UNASSIGNED].value.toFixed(2)),
          positionCount: accountTotals[UNASSIGNED].count,
          percentOfTotal: grandTotal > 0 ? Number(((accountTotals[UNASSIGNED].value / grandTotal) * 100).toFixed(2)) : 0,
        }] : []),
      ],
      positions: allPositions.map((position) => ({
        ticker: position.ticker,
        shares: position.shares,
        price: Number(position.price.toFixed(4)),
        value: Number(position.value.toFixed(2)),
        costBasis: position.costBasis == null ? null : Number(position.costBasis.toFixed(2)),
        unrealizedPnL: position.unrealizedPnL == null ? null : Number(position.unrealizedPnL.toFixed(2)),
        unrealizedPnLPercent: position.unrealizedPnLPercent == null
          ? null
          : Number(position.unrealizedPnLPercent.toFixed(2)),
        taxLotCount: position.taxLotCount,
        percentOfPortfolio: Number(position.percentage.toFixed(2)),
        account: position.account,
        accountLabel: getAccountLabel(position.account),
        percentOfAccount: accountTotals[position.account]?.value > 0
          ? Number(((position.value / accountTotals[position.account].value) * 100).toFixed(2))
          : 0,
        category: position.category,
        note: position.note.slice(0, 1500),
      })),
      researchNotes: notes
        .filter((note) => note.title && note.text && !positionIds.has(note.id))
        .slice(0, 50)
        .map((note) => ({ ticker: normalizeTicker(note.title), category: colorLabels[note.color] || 'Unclassified', note: String(note.text).slice(0, 1500) })),
      cashSecuredPuts: cashSecuredPuts.map((put) => ({
        ticker: put.ticker,
        strike: Number(put.strike) || 0,
        qty: Number(put.qty) || 0,
        expiry: put.expiry || null,
        obligation: (Number(put.strike) || 0) * (Number(put.qty) || 0) * 100,
        account: getPutAccount(put),
        accountLabel: getAccountLabel(getPutAccount(put)),
      })),
      watchList: watchList.slice(0, 100),
      categories: categories.map((color) => ({ color, label: colorLabels[color] || 'Category' })),
    }
  }, [allPositions, accountDisplayBalances, accountTotals, cashMetricsByAccount, cashSecuredPuts, categories, colorLabels, grandAccountBalance, nickname, notes, putObligationByAccount, totalPutObligation, watchList])

  const refreshPrices = async () => {
    if (!portfolioNotes.length || refreshing) return
    const needsFinnhub = portfolioNotes.some((note) => normalizeTicker(note.title) !== 'USD' && !isCrypto(note))
    if (needsFinnhub && !finnhubKey) {
      setRefreshMessage('Add a Finnhub key in the desktop app, then try again.')
      return
    }
    setRefreshing(true)
    setRefreshMessage('')
    const nextPrices = { ...prices }
    let failures = 0
    for (const note of portfolioNotes) {
      const ticker = normalizeTicker(note.title)
      try {
        if (ticker === 'USD') {
          nextPrices[ticker] = 1
          continue
        }
        if (isCrypto(note) && plaidPrice(note) > 0) {
          nextPrices[ticker] = plaidPrice(note)
          continue
        }
        const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(finnhubKey)}`)
        if (!response.ok) throw new Error('Quote request failed')
        const quote = await response.json()
        const currentPrice = Number(quote?.c)
        if (currentPrice > 0) nextPrices[ticker] = currentPrice
        else failures += 1
      } catch {
        failures += 1
      }
    }
    const timestamp = Date.now()
    setPrices(nextPrices)
    setLastUpdated(new Date(timestamp))
    setRefreshing(false)
    setRefreshMessage(failures ? `${failures} quote${failures === 1 ? '' : 's'} could not be updated.` : 'All quotes are current.')
    localStorage.setItem(`stock-stickies-mobile-prices-${user.uid}`, JSON.stringify({ prices: nextPrices, timestamp }))
  }

  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    setInstallEvent(null)
  }

  const shareYtdPerformance = async () => {
    if (scopedYtdPerformance?.status !== 'ready') {
      setRefreshMessage('YTD performance is not ready for this account yet.')
      return
    }
    const year = ytdPerformance?.year || new Date().getFullYear()
    const scopeLabel = accountFilter === 'all' ? 'All Accounts' : getAccountLabel(accountFilter)
    const displayName = nickname || user.email?.split('@')[0] || 'Investor'
    const accountSlug = accountFilter === 'all' ? 'all-accounts' : accountFilter
    try {
      const blob = await createYtdShareCard({
        year,
        gain: scopedYtdPerformance.gain,
        returnPercent: scopedYtdPerformance.returnPercent,
        scopeLabel,
        displayName,
        profilePhoto,
      })
      const result = await shareOrDownloadYtdCard(
        blob,
        `stock-stickies-${year}-ytd-${accountSlug}.png`,
        `${displayName}'s ${year} YTD performance`,
      )
      if (result === 'downloaded') setRefreshMessage('Your YTD performance image has been downloaded.')
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('Unable to create YTD performance image', error)
        setRefreshMessage('Unable to create the YTD performance image. Please try again.')
      }
    }
  }

  if (!authReady) return <div className="splash"><StockStickiesLogo compact /><p>Opening your portfolio…</p></div>
  if (!user) return <Login />
  if (!dataReady) return <div className="splash"><div className="loader" /><p>Loading your portfolio…</p></div>

  const presentAccounts = [
    ...ACCOUNT_IDS.filter((id) => accountTotals[id] || putObligationByAccount[id] || brokerAccountMetrics[id].hasBalance || brokerAccountMetrics[id].hasHoldings),
    ...(accountTotals[UNASSIGNED] ? [UNASSIGNED] : []),
  ]
  const signInMethods = [...new Set((user.providerData || []).map((provider) => {
    if (provider?.providerId === 'google.com') return 'Google'
    if (provider?.providerId === 'password') return 'Email & password'
    return provider?.providerId || null
  }).filter(Boolean))].join(', ') || 'Email & password'

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <StockStickiesLogo compact />
        </div>
        <div className="top-actions">
          {installEvent && <button className="icon-button" type="button" onClick={install} aria-label="Install app"><Icon name="install" /></button>}
          <button className="profile-button" type="button" onClick={() => setProfileOpen(true)} aria-label="Open profile">
            {profilePhoto ? <img src={profilePhoto} alt="" /> : <span className="profile-avatar">{(nickname || user.email || '?').charAt(0).toUpperCase()}</span>}
          </button>
        </div>
      </header>

      <main className="dashboard">
        <section className="hero">
          <div className="hero-topline">
            <div>
              <div className="hero-meta">
                <p className="eyebrow">{accountFilter === 'all' ? 'ALL ACCOUNTS' : getAccountLabel(accountFilter).toUpperCase()}</p>
              </div>
              <h1>{money(accountBalance)}</h1>
              <div className={scopedPnlTotals.coveredCount > 0 ? (scopedPnlTotals.unrealizedPnL >= 0 ? 'hero-pnl gain' : 'hero-pnl loss') : 'hero-pnl unavailable'}>
                <span>{scopedPnlTotals.missingCount > 0 ? 'Known unrealized P&L' : 'Unrealized P&L'}</span>
                <strong>
                  {scopedPnlTotals.coveredCount > 0
                    ? `${signedMoney(scopedPnlTotals.unrealizedPnL)}${scopedPnlTotals.unrealizedPnLPercent == null ? '' : ` · ${signedPercent(scopedPnlTotals.unrealizedPnLPercent)}`}`
                    : 'Unavailable'}
                </strong>
              </div>
              {scopedPnlTotals.coveredCount > 0 && scopedPnlTotals.missingCount > 0 && (
                <small className="pnl-coverage">Cost basis for {scopedPnlTotals.coveredCount} of {filteredPositions.length} positions</small>
              )}
              <div className={scopedYtdPerformance?.status === 'ready'
                ? (scopedYtdPerformance.gain >= 0 ? 'hero-ytd gain' : 'hero-ytd loss')
                : 'hero-ytd unavailable'}>
                <span>{ytdPerformance?.year || new Date().getFullYear()} YTD</span>
                <strong>
                  {scopedYtdPerformance?.status === 'ready'
                    ? `${signedMoney(scopedYtdPerformance.gain)}${scopedYtdPerformance.returnPercent == null ? '' : ` · ${signedPercent(scopedYtdPerformance.returnPercent)}`}`
                    : scopedYtdPerformance?.status === 'cash-flow-history-incomplete'
                      ? 'Needs cash-flow history'
                      : ytdPerformance
                        ? 'Needs opening values'
                        : 'Loading…'}
                </strong>
              </div>
              <small className="balance-caption">
                {hasBrokerPortfolio
                  ? 'Linked brokerage balance · positions, cash & CSP collateral'
                  : 'Estimated balance · positions & CSP collateral'}
              </small>
            </div>
            <div className="hero-actions">
              <button className="share-ytd-button" type="button" onClick={shareYtdPerformance} disabled={scopedYtdPerformance?.status !== 'ready'}>
                <Icon name="share" size={18} />
                <span>Share YTD</span>
              </button>
              <button className="refresh-button" type="button" onClick={refreshPrices} disabled={refreshing}>
                <Icon name="refresh" />
                <span>{refreshing ? 'Updating…' : 'Update'}</span>
              </button>
            </div>
          </div>
          <div className="status-line">
            <span className={missingPrices ? 'status-dot warning' : 'status-dot'} />
            {lastUpdated ? `Quotes updated ${lastUpdated.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Tap Update to fetch current quotes'}
          </div>
          {refreshMessage && <p className="refresh-message" role="status">{refreshMessage}</p>}
          {brokerageError && <p className="refresh-message" role="status">Cash balance unavailable: {brokerageError}</p>}
        </section>

        {dataError ? <div className="error-card">{dataError}</div> : (
          <>
            <nav className="account-scroller" aria-label="Filter by account">
              <button type="button" className={accountFilter === 'all' ? 'active' : ''} onClick={() => setAccountFilter('all')}>
                <span>All accounts</span><strong>{money(grandAccountBalance)}</strong>
                <small className={allPnlTotals.coveredCount > 0 && allPnlTotals.unrealizedPnL < 0 ? 'loss' : 'gain'}>
                  {allPnlTotals.coveredCount > 0
                    ? `Unrealized P&L ${signedMoney(allPnlTotals.unrealizedPnL)}`
                    : 'Unrealized P&L unavailable'}
                </small>
                {ytdPerformance?.total?.status === 'ready' && (
                  <small className={ytdPerformance.total.gain >= 0 ? 'gain' : 'loss'}>
                    YTD {signedMoney(ytdPerformance.total.gain)}
                    {ytdPerformance.total.returnPercent == null ? '' : ` · ${signedPercent(ytdPerformance.total.returnPercent)}`}
                  </small>
                )}
              </button>
              {presentAccounts.map((id) => (
                <button type="button" key={id} className={accountFilter === id ? 'active' : ''} onClick={() => setAccountFilter(id)}>
                  <span>{ACCOUNTS.find((account) => account.id === id)?.short || 'Unassigned'}</span>
                  <strong>{money(id === UNASSIGNED ? (accountTotals[id]?.value || 0) : accountDisplayBalances[id])}</strong>
                  <small className={(accountTotals[id]?.unrealizedPnL || 0) >= 0 ? 'gain' : 'loss'}>
                    {(accountTotals[id]?.pnlCount || 0) > 0
                      ? `${accountTotals[id].missingPnlCount > 0 ? 'Known unrealized P&L' : 'Unrealized P&L'} ${signedMoney(accountTotals[id].unrealizedPnL)}`
                      : 'Unrealized P&L unavailable'}
                  </small>
                  {ytdPerformance?.accounts?.[id]?.status === 'ready' && (
                    <small className={ytdPerformance.accounts[id].gain >= 0 ? 'gain' : 'loss'}>
                      YTD {signedMoney(ytdPerformance.accounts[id].gain)}
                      {ytdPerformance.accounts[id].returnPercent == null ? '' : ` · ${signedPercent(ytdPerformance.accounts[id].returnPercent)}`}
                    </small>
                  )}
                </button>
              ))}
            </nav>

            <section className={`cash-section ${cashSectionExpanded ? 'expanded' : ''}`}>
              <button
                className="cash-section-toggle"
                type="button"
                onClick={() => setCashSectionExpanded((current) => !current)}
                aria-expanded={cashSectionExpanded}
              >
                <span>
                  <small>CASH &amp; COLLATERAL</small>
                  <strong>{accountFilter === 'all' ? 'All accounts' : getAccountLabel(accountFilter)}</strong>
                </span>
                <span className="cash-section-total">
                  <small>Total cash</small>
                  <strong>{money(totalCash)}</strong>
                </span>
                <Icon name="chevron" size={18} />
              </button>

              {cashSectionExpanded && (
                <div className="cash-account-totals">
                  {cashAccountSummaries.map((summary) => (
                    <div className={`cash-account-panel ${expandedCashAccounts[summary.account] ? 'expanded' : ''}`} key={summary.account}>
                      <button
                        className="cash-account-toggle"
                        type="button"
                        onClick={() => setExpandedCashAccounts((current) => ({
                          ...current,
                          [summary.account]: !current[summary.account],
                        }))}
                        aria-expanded={!!expandedCashAccounts[summary.account]}
                      >
                        <span>{summary.accountLabel}</span>
                        <strong>{money(summary.total)}</strong>
                        <Icon name="chevron" size={16} />
                      </button>
                      {expandedCashAccounts[summary.account] && (
                        <div className="cash-account-components">
                          {summary.components.length > 0 ? summary.components.map((position) => {
                            const allocation = displayCompositionTotal > 0
                              ? (position.value / displayCompositionTotal) * 100
                              : 0
                            return (
                              <div className="cash-component-row" key={position.id}>
                                <div>
                                  <strong>{position.ticker}</strong>
                                  <span>{position.category}</span>
                                  <small>
                                    {position.includeInComposition === false
                                      ? 'Shown separately · not added to total cash'
                                      : `Allocation ${allocation.toFixed(2)}%`}
                                  </small>
                                </div>
                                <strong>{money(position.value)}</strong>
                              </div>
                            )
                          }) : (
                            <div className="cash-empty">No cash or collateral in this account.</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="positions-section">
              <div className="section-heading">
                <div><p className="eyebrow">HOLDINGS</p><h2>Positions</h2></div>
                <span>{displayPositions.length} shown</span>
              </div>
              <div className="position-tools">
                <label className="search-field"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a ticker" aria-label="Search positions" /></label>
                <label className="sort-field">
                  <span className="sr-only">Sort positions</span>
                  <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                    <option value="size-desc">Largest</option>
                    <option value="size-asc">Smallest</option>
                    <option value="name-asc">Name A–Z</option>
                    <option value="name-desc">Name Z–A</option>
                    <option value="shares-desc">Most shares</option>
                    <option value="price-desc">Price</option>
                  </select>
                  <Icon name="chevron" size={16} />
                </label>
              </div>

              <div className="position-list">
                {displayPositions.map((position, index) => (
                  <article className={`position-row ${position.summaryKind ? 'cash-summary-row' : ''} ${expandedId === position.id ? 'expanded' : ''}`} key={position.id}>
                    <button type="button" onClick={() => setExpandedId(expandedId === position.id ? null : position.id)} aria-expanded={expandedId === position.id}>
                      <div className="rank">{index + 1}</div>
                      <div className="ticker-block">
                        <strong>{position.ticker}</strong>
                        <span>{position.category} · {position.accountLabel || getAccountLabel(position.account)}</span>
                        <small className="allocation">Allocation {position.compositionPercentage.toFixed(2)}%</small>
                      </div>
                      <div className="value-block">
                        <strong>{money(position.value)}</strong>
                        {position.unrealizedPnL != null && (
                          <span className={position.unrealizedPnL >= 0 ? 'gain' : 'loss'}>
                            Unrealized P&amp;L {signedMoney(position.unrealizedPnL)} · {position.unrealizedPnLPercent == null ? 'n/a' : signedPercent(position.unrealizedPnLPercent)}
                          </span>
                        )}
                        {!position.summaryKind && position.unrealizedPnL == null && (
                          <span className="unavailable">Unrealized P&amp;L unavailable</span>
                        )}
                      </div>
                      <Icon name="chevron" size={16} />
                    </button>
                    {expandedId === position.id && (
                      <div className="position-detail">
                        {position.summaryKind ? (
                          <>
                            <div><span>Type</span><strong>{position.summaryType}</strong></div>
                            <div><span>Portfolio</span><strong>{position.accountLabel}</strong></div>
                            <div><span>Amount</span><strong>{money(position.value, 2)}</strong></div>
                            <div><span>Allocation</span><strong>{position.compositionPercentage.toFixed(2)}%</strong></div>
                            {position.costBasis != null && (
                              <>
                                <div><span>Cost basis</span><strong>{money(position.costBasis, 2)}</strong></div>
                                <div><span>Unrealized P&amp;L</span><strong className={position.unrealizedPnL >= 0 ? 'gain' : 'loss'}>{signedMoney(position.unrealizedPnL, 2)}</strong></div>
                                <div><span>Unrealized return</span><strong className={position.unrealizedPnL >= 0 ? 'gain' : 'loss'}>{position.unrealizedPnLPercent == null ? 'Unavailable' : signedPercent(position.unrealizedPnLPercent, 2)}</strong></div>
                              </>
                            )}
                            <small>{position.costBasis != null ? 'Estimated using the latest displayed price and Plaid cost basis.' : (position.summaryNote || 'Calculated for the selected portfolio.')}</small>
                          </>
                        ) : (
                          <>
                            <div><span>Shares</span><strong>{number(position.shares, 6)}</strong></div>
                            <div><span>Price</span><strong>{position.price ? money(position.price, 2) : 'Unavailable'}</strong></div>
                            <div><span>Market value</span><strong>{money(position.value, 2)}</strong></div>
                            <div><span>Allocation</span><strong>{position.compositionPercentage.toFixed(2)}%</strong></div>
                            <div><span>Cost basis</span><strong>{position.costBasis == null ? 'Unavailable' : money(position.costBasis, 2)}</strong></div>
                            <div><span>Unrealized P&amp;L</span><strong className={position.unrealizedPnL == null ? '' : (position.unrealizedPnL >= 0 ? 'gain' : 'loss')}>{position.unrealizedPnL == null ? 'Unavailable' : signedMoney(position.unrealizedPnL, 2)}</strong></div>
                            {position.note && <p>{position.note}</p>}
                            <small>{position.costBasis == null ? 'Cost basis was not provided by the brokerage.' : `Estimated return ${position.unrealizedPnLPercent == null ? 'unavailable' : signedPercent(position.unrealizedPnLPercent, 2)} using the latest displayed price.`}</small>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                ))}
                {!displayPositions.length && <div className="empty-list">No positions match this view.</div>}
              </div>
            </section>
          </>
        )}
      </main>

      {profileOpen && (
        <>
          <button className="profile-scrim" type="button" aria-label="Close profile" onClick={() => setProfileOpen(false)} />
          <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
            <header>
              {profilePhoto ? <img src={profilePhoto} alt="" /> : <span className="profile-modal-avatar">{(nickname || user.email || '?').charAt(0).toUpperCase()}</span>}
              <div><strong id="profile-title">{nickname || 'Stock Stickies profile'}</strong><small>{user.email}</small></div>
              <button className="icon-button" type="button" onClick={() => setProfileOpen(false)} aria-label="Close profile"><Icon name="close" /></button>
            </header>
            <p className="profile-section-label">Profile</p>
            <div className="profile-meta profile-account-details">
              <div><span>Member since</span><strong>{profileDate(user.metadata?.creationTime)}</strong></div>
              <div><span>Last login</span><strong>{profileDate(user.metadata?.lastSignInTime, true)}</strong></div>
              <div><span>Sign-in method</span><strong>{signInMethods}</strong></div>
              <div><span>Email status</span><strong className={user.emailVerified ? 'verified' : 'unverified'}>{user.emailVerified ? 'Verified' : 'Not verified'}</strong></div>
            </div>
            <p className="profile-section-label">App details</p>
            <div className="profile-meta">
              <div><span>App</span><strong>Mobile Portfolio</strong></div>
              <div><span>Version</span><strong>Build 32</strong></div>
              <div><span>Access</span><strong>Read only</strong></div>
            </div>
            <button className="signout-button" type="button" onClick={() => auth.signOut()}>
              <Icon name="logout" size={18} />
              Sign out
            </button>
          </section>
        </>
      )}

      <AskK portfolio={askKPortfolio} />
    </div>
  )
}
