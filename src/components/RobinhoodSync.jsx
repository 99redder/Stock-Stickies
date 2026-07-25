import { useMemo, useState } from 'react'

const API_BASE_URL = 'https://rentals-api.99redder.workers.dev'
const PLAID_SCRIPT_ID = 'stock-stickies-plaid-link'

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase()
}

function isSupportedTicker(value) {
  return /^[A-Z0-9]{1,5}(?:\.[A-Z0-9]{1,3})?$/.test(normalizeTicker(value))
}

function positionKey(account, ticker) {
  return `${account}:${normalizeTicker(ticker)}`
}

function buildRobinhoodReconciliation(notes, positions) {
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

  const reconciliation = useMemo(
    () => buildRobinhoodReconciliation(notes, holdings?.positions || []),
    [notes, holdings]
  )

  const apiFetch = async (path, options = {}) => {
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
  }

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
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-400 bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-500"
        title="Preview share quantities from Robinhood"
      >
        ↻ Sync Robinhood
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
