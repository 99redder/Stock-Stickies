import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const API_BASE_URL = 'https://rentals-api.99redder.workers.dev'
const PLAID_SCRIPT_ID = 'stock-stickies-plaid-link'

function RobinhoodLogo({ size = 23 }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0.4 0.21 597.05 799.48"
      width={size}
      height={size}
      fill="currentColor"
    >
      <path d="m250.85 627.43-5.28 1.78c-34.2 11.36-84.77 28.85-130.17 49.71-2.43 1.14-4.03 4.32-4.03 4.32-.84 1.95-1.89 4.35-3.08 7.07l-.18.35c-5.08 11.57-12.1 28.98-15.1 36.07l-2.34 5.58c-.36.88-.15 1.9.56 2.57.42.4.93.63 1.55.65.32 0 .7-.07 1.03-.24l5.49-2.61c12.41-5.9 28.14-14.86 44.63-22.69l.57-.27c31.35-14.87 66.74-31.65 88.06-41.81 0-.01 3.42-1.84 5.15-5.26l15.95-31.99c.42-.83.29-1.85-.29-2.56-.65-.7-1.63-.96-2.52-.67zm-127.46-49.58c2.22-4.37 12.59-24.26 14.93-28.72l.42-.76c69.24-130.58 153.63-253.74 250.77-366.06l2.69-3.1c.82-.97.97-2.36.38-3.49-.64-1.13-1.92-1.75-3.15-1.58l-4.07.55c-63.76 8.78-128.26 20.94-191.82 36.12-6.3 1.76-10.37 5.87-11.26 6.83-47.56 56.94-92.61 116.89-133.93 178.31-2.07 3.1-2.29 10.52-2.29 10.52s10.41 79.98 25.57 138.92c-37.57 108.01-71.11 250.35-71.11 250.35-.27.92-.08 1.91.47 2.69.57.78 1.47 1.23 2.44 1.26h21.38a3.17 3.17 0 0 0 3.02-2.03l1.45-4c21.83-59.51 46.73-118.29 74.23-175.55 6.4-13.34 19.88-40.26 19.88-40.26z" />
      <path d="m420.88 205.66-.04-4.07c-.04-1.28-.84-2.43-2.02-2.86-1.2-.45-2.58-.11-3.4.87l-2.66 3.08c-113.27 130.96-208.47 276.32-282.97 432.03l-1.73 3.64c-.57 1.15-.33 2.54.52 3.46.59.61 1.37.95 2.22.95.37.02.83-.06 1.22-.22l3.73-1.55c63.62-26.35 128.6-49.18 193.15-67.83 3.86-1.12 7.13-3.81 8.96-7.39 28.29-55.13 93.99-161.86 93.99-161.86 1.69-2.41 1.26-5.98 1.26-5.98s-11.51-127.67-12.23-192.27z" />
      <path d="m567.34 21.53c-16.08-13.94-39.4-20.49-75.66-21.27-32.87-.7-71.97 6.37-116.24 20.97-6.64 2.33-11.91 6-16.64 10.65a2138.718 2138.718 0 0 0-130.22 133.41l-3.19 3.53c-.88 1-1.01 2.45-.36 3.6a3.07 3.07 0 0 0 3.33 1.47l4.64-.98c66.73-14.26 134.11-25.16 200.19-32.39 4.35-.48 8.84.97 12.09 3.93 3.24 2.99 5.1 7.24 5.02 11.67-1.09 65.57 1.28 131.47 7.13 195.89l.37 4.2a3.099 3.099 0 0 0 2.32 2.7c.22.06.44.11.73.12.98.01 2-.46 2.6-1.32l2.42-3.46c37.24-53.11 77.77-104.74 120.38-153.57l-.02-.01c4.77-5.43 6.04-8.87 6.93-13.8 13.42-85.84-7.29-149.28-25.82-165.34z" />
    </svg>
  )
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase()
}

function isSupportedTicker(value) {
  return /^[A-Z0-9]{1,5}(?:\.[A-Z0-9]{1,3})?$/.test(normalizeTicker(value))
}

function positionKey(account, ticker) {
  return `${account}:${normalizeTicker(ticker)}`
}

function buildRobinhoodReconciliation(notes, positions, ignoredCryptoTickers = []) {
  const ignoredCrypto = new Set(
    (Array.isArray(ignoredCryptoTickers) ? ignoredCryptoTickers : []).map(normalizeTicker)
  )
  const usable = []
  const unsupported = []
  for (const position of Array.isArray(positions) ? positions : []) {
    if (!position.stockStickiesAccount || !isSupportedTicker(position.ticker) || !Number.isFinite(position.quantity)) {
      unsupported.push(position)
      continue
    }
    usable.push(position)
  }

  const usedNoteIds = new Set()
  const updates = []
  const additions = []

  for (const position of usable) {
    const ticker = normalizeTicker(position.ticker)
    let note = notes.find(candidate =>
      !usedNoteIds.has(candidate.id) &&
      candidate.plaidAccountId === position.accountId &&
      candidate.plaidSecurityId === position.securityId
    )
    if (!note) {
      note = notes.find(candidate =>
        !usedNoteIds.has(candidate.id) &&
        normalizeTicker(candidate.title) === ticker &&
        candidate.account === position.stockStickiesAccount
      )
    }

    if (!note) {
      additions.push({ ...position, ticker })
      continue
    }

    usedNoteIds.add(note.id)
    const oldShares = Number(note.shares)
    const sharesChanged = !Number.isFinite(oldShares) || Math.abs(oldShares - position.quantity) > 1e-8
    const accountChanged = note.account !== position.stockStickiesAccount
    const identifiersChanged =
      note.plaidAccountId !== position.accountId ||
      note.plaidSecurityId !== position.securityId
    if (sharesChanged || accountChanged || identifiersChanged) {
      updates.push({
        noteId: note.id,
        ticker,
        oldShares: Number.isFinite(oldShares) ? oldShares : null,
        newShares: position.quantity,
        oldAccount: note.account || 'unassigned',
        newAccount: position.stockStickiesAccount,
        plaidAccountId: position.accountId,
        plaidSecurityId: position.securityId,
      })
    }
  }

  const liveKeys = new Set(usable.map(position =>
    positionKey(position.stockStickiesAccount, position.ticker)
  ))
  const possibleClosed = notes.filter(note =>
    Number(note.shares) > 0 &&
    ['individual', 'traditional', 'roth'].includes(note.account) &&
    !ignoredCrypto.has(normalizeTicker(note.title)) &&
    !liveKeys.has(positionKey(note.account, note.title))
  )

  return { updates, additions, possibleClosed, unsupported, usable }
}

function loadPlaidScript() {
  if (window.Plaid) return Promise.resolve()
  const existing = document.getElementById(PLAID_SCRIPT_ID)
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', () => reject(new Error('Plaid Link could not load.')), { once: true })
    })
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = PLAID_SCRIPT_ID
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
    script.async = true
    script.onload = resolve
    script.onerror = () => reject(new Error('Plaid Link could not load.'))
    document.head.appendChild(script)
  })
}

export default function RobinhoodSync({
  authUser,
  notes,
  ready,
  darkMode,
  onCreateBackup,
  onApply,
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(null)
  const [holdings, setHoldings] = useState(null)
  const [backup, setBackup] = useState(null)
  const [result, setResult] = useState(null)
  const [autoSyncState, setAutoSyncState] = useState('idle')
  const autoSyncStartedRef = useRef(false)
  const notesRef = useRef(notes)
  const onApplyRef = useRef(onApply)
  notesRef.current = notes
  onApplyRef.current = onApply

  const reconciliation = useMemo(
    () => buildRobinhoodReconciliation(
      notes,
      holdings?.positions || [],
      holdings?.ignoredCryptoTickers || []
    ),
    [notes, holdings]
  )

  const apiFetch = useCallback(async (path, options = {}) => {
    if (!authUser) throw new Error('Sign in again before syncing Robinhood.')
    let response
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const idToken = await authUser.getIdToken(attempt === 1)
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${idToken}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
      })
      if (response.status !== 401 || attempt === 1) break
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.ok === false) {
      const requestError = new Error(data.error || `Robinhood request failed (${response.status}).`)
      requestError.code = data.code || ''
      requestError.needsConsent = data.needsConsent === true
      throw requestError
    }
    return data
  }, [authUser])

  useEffect(() => {
    if (!ready || !authUser || autoSyncStartedRef.current) return undefined

    // React StrictMode mounts effects twice in development. Deferring one tick lets
    // the throwaway mount clean up before this page-load-only sync can start.
    const timer = window.setTimeout(() => {
      if (autoSyncStartedRef.current) return
      autoSyncStartedRef.current = true
      setAutoSyncState('syncing')

      void (async () => {
        try {
          const connection = await apiFetch('/api/stock-stickies/plaid/status')
          setStatus(connection)
          if (!connection.investmentsEnabled) {
            setAutoSyncState('needs-consent')
            return
          }

          const data = await apiFetch('/api/stock-stickies/plaid/holdings')
          setHoldings(data)
          const automaticReconciliation = buildRobinhoodReconciliation(
            notesRef.current,
            data.positions || [],
            data.ignoredCryptoTickers || []
          )
          if (automaticReconciliation.updates.length || automaticReconciliation.additions.length) {
            const applied = await onApplyRef.current(automaticReconciliation)
            setResult(applied)
            setBackup(applied.backup)
            setAutoSyncState('applied')
          } else {
            setAutoSyncState('current')
          }
        } catch (syncError) {
          console.error('Automatic Robinhood sync failed:', syncError)
          setAutoSyncState(syncError?.needsConsent ? 'needs-consent' : 'failed')
        }
      })()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [apiFetch, authUser, ready])

  const openSync = async () => {
    setOpen(true)
    setLoading(true)
    setError('')
    setResult(null)
    setHoldings(null)
    try {
      const [backupResult, statusResult] = await Promise.allSettled([
        onCreateBackup('pre-plaid-connection'),
        apiFetch('/api/stock-stickies/plaid/status'),
      ])
      if (backupResult.status !== 'fulfilled') throw backupResult.reason
      setBackup(backupResult.value)
      if (statusResult.status === 'fulfilled') {
        setStatus(statusResult.value)
      } else {
        setError(statusResult.reason?.message || 'The Robinhood connection could not be checked.')
      }
    } catch (openError) {
      setError(openError?.message || 'Robinhood sync could not be prepared.')
    } finally {
      setLoading(false)
    }
  }

  const loadHoldings = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await apiFetch('/api/stock-stickies/plaid/holdings')
      setHoldings(data)
      setStatus(previous => ({ ...(previous || {}), investmentsEnabled: true }))
    } catch (holdingsError) {
      setError(holdingsError?.message || 'Robinhood positions could not be loaded.')
      if (holdingsError?.needsConsent) {
        setStatus(previous => ({ ...(previous || {}), investmentsEnabled: false }))
      }
    } finally {
      setLoading(false)
    }
  }

  const connectInvestments = async () => {
    setLoading(true)
    setError('')
    try {
      const [{ linkToken }] = await Promise.all([
        apiFetch('/api/stock-stickies/plaid/link-token', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
        loadPlaidScript(),
      ])
      if (!linkToken || !window.Plaid) throw new Error('Plaid Link is unavailable.')

      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: async () => {
          handler.destroy()
          await loadHoldings()
        },
        onExit: (exitError) => {
          handler.destroy()
          setLoading(false)
          if (exitError) setError('Robinhood permission was not completed.')
        },
      })
      handler.open()
    } catch (connectError) {
      setLoading(false)
      setError(connectError?.message || 'Robinhood permission could not be started.')
    }
  }

  const applyChanges = async () => {
    if (!holdings || (!reconciliation.updates.length && !reconciliation.additions.length)) return
    setApplying(true)
    setError('')
    try {
      const applied = await onApply(reconciliation)
      setResult(applied)
      setBackup(applied.backup)
    } catch (applyError) {
      setError(applyError?.message || 'No Stock Stickies changes were applied.')
    } finally {
      setApplying(false)
    }
  }

  const panel = darkMode
    ? 'bg-gray-900 border-gray-700 text-gray-100'
    : 'bg-white border-gray-200 text-gray-900'
  const muted = darkMode ? 'text-gray-400' : 'text-gray-600'
  const card = darkMode ? 'bg-gray-950 border-gray-700' : 'bg-gray-50 border-gray-200'

  return (
    <>
      <button
        type="button"
        onClick={openSync}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#00c805]/50 bg-black text-[#00c805] shadow-lg transition-colors hover:bg-gray-900"
        title={
          autoSyncState === 'syncing'
            ? 'Automatically syncing Robinhood positions'
            : autoSyncState === 'applied'
              ? 'Robinhood positions were updated automatically'
              : autoSyncState === 'current'
                ? 'Robinhood positions are current'
                : autoSyncState === 'needs-consent'
                  ? 'Open to grant one-time Robinhood Investments permission'
                  : autoSyncState === 'failed'
                    ? 'Automatic sync failed; open to retry'
                    : 'Preview share quantities from Robinhood'
        }
        aria-label="Sync Robinhood positions"
      >
        <span className={autoSyncState === 'syncing' ? 'animate-pulse' : ''}>
          <RobinhoodLogo />
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className={`max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border shadow-2xl ${panel}`}>
            <div className={`sticky top-0 z-10 flex items-center justify-between border-b p-5 ${panel}`}>
              <div>
                <h2 className="text-xl font-black">Robinhood Position Sync</h2>
                <p className={`mt-1 text-xs ${muted}`}>Preview first. Existing notes and research are never deleted.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className={`rounded-lg px-3 py-2 ${muted}`}>✕</button>
            </div>

            <div className="space-y-4 p-5">
              <div className={`rounded-xl border p-4 ${card}`}>
                <div className="font-bold text-emerald-500">Safety checkpoint</div>
                {backup ? (
                  <p className={`mt-1 text-sm ${muted}`}>
                    Protected {backup.noteCount} notes before this session. Backup ID: <span className="font-mono">{backup.id}</span>
                  </p>
                ) : (
                  <p className={`mt-1 text-sm ${muted}`}>Creating a full Firestore backup before Robinhood can be used…</p>
                )}
                <p className={`mt-2 text-xs ${muted}`}>Applying a preview creates another backup. Possible closed positions are reported but left unchanged.</p>
              </div>

              {error && <div className="rounded-xl border border-red-500/50 bg-red-950/30 p-3 text-sm text-red-400">{error}</div>}
              {result && (
                <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/30 p-3 text-sm text-emerald-400">
                  Applied {result.updatedCount} share update{result.updatedCount === 1 ? '' : 's'} and added {result.addedCount} new position note{result.addedCount === 1 ? '' : 's'}. Rollback backup: {result.backup.id}.
                </div>
              )}

              {!holdings && (
                <div className={`rounded-xl border p-4 ${card}`}>
                  <div className="font-bold">Connection</div>
                  <p className={`mt-1 text-sm ${muted}`}>
                    {loading
                      ? 'Checking the existing Plaid connection…'
                      : status?.investmentsEnabled
                        ? 'Robinhood Investments access is enabled.'
                        : 'One-time Robinhood permission is required before positions can be read.'}
                  </p>
                  {!loading && backup && (
                    <button
                      type="button"
                      onClick={status?.investmentsEnabled ? loadHoldings : connectInvestments}
                      className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
                    >
                      {status?.investmentsEnabled ? 'Load Position Preview' : 'Connect Robinhood Positions'}
                    </button>
                  )}
                </div>
              )}

              {holdings && (
                <>
                  <div className="grid gap-3 sm:grid-cols-4">
                    {[
                      ['Share updates', reconciliation.updates.length],
                      ['New positions', reconciliation.additions.length],
                      ['Possible closed', reconciliation.possibleClosed.length],
                      ['Needs review', reconciliation.unsupported.length],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-xl border p-3 ${card}`}>
                        <div className={`text-xs ${muted}`}>{label}</div>
                        <div className="mt-1 text-2xl font-black">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className={`rounded-xl border ${card}`}>
                    <div className="border-b border-inherit px-4 py-3 font-bold">Changes that will be applied</div>
                    <div className="max-h-64 overflow-y-auto">
                      {!reconciliation.updates.length && !reconciliation.additions.length ? (
                        <div className={`p-4 text-sm ${muted}`}>Stock Stickies already matches the returned Robinhood positions.</div>
                      ) : (
                        <>
                          {reconciliation.updates.map(change => (
                            <div key={`update-${change.noteId}`} className="flex items-center justify-between gap-4 border-b border-inherit px-4 py-3 text-sm">
                              <div><span className="font-bold">{change.ticker}</span> · {change.newAccount}</div>
                              <div className={muted}>{change.oldShares ?? '—'} → <span className="font-bold text-emerald-500">{change.newShares}</span> shares</div>
                            </div>
                          ))}
                          {reconciliation.additions.map(position => (
                            <div key={`add-${position.accountId}-${position.securityId}`} className="flex items-center justify-between gap-4 border-b border-inherit px-4 py-3 text-sm">
                              <div><span className="font-bold">{position.ticker}</span> · {position.stockStickiesAccount}</div>
                              <div className={muted}>New unclassified note · <span className="font-bold text-emerald-500">{position.quantity}</span> shares</div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>

                  {(reconciliation.possibleClosed.length > 0 || reconciliation.unsupported.length > 0) && (
                    <div className={`rounded-xl border border-amber-500/40 p-4 ${card}`}>
                      <div className="font-bold text-amber-500">Review only — no automatic changes</div>
                      {reconciliation.possibleClosed.length > 0 && (
                        <p className={`mt-2 text-sm ${muted}`}>
                          Not returned by Plaid: {reconciliation.possibleClosed.map(note => `${note.title} (${note.account})`).join(', ')}. Their shares will stay unchanged.
                        </p>
                      )}
                      {reconciliation.unsupported.length > 0 && (
                        <p className={`mt-2 text-sm ${muted}`}>
                          Unsupported/missing ticker or account mapping: {reconciliation.unsupported.map(position => position.ticker || position.name || 'Unknown security').join(', ')}.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-3">
                    <button type="button" onClick={loadHoldings} disabled={loading || applying} className={`rounded-lg border px-4 py-2 text-sm font-bold ${muted}`}>
                      {loading ? 'Refreshing…' : 'Refresh Preview'}
                    </button>
                    <button
                      type="button"
                      onClick={applyChanges}
                      disabled={applying || (!reconciliation.updates.length && !reconciliation.additions.length)}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {applying ? 'Backing up & applying…' : 'Back Up & Apply Preview'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
