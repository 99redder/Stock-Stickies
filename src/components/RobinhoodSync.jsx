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

function cspPositionKey(account, ticker, strike, expiry) {
  const normalizedStrike = Number(strike)
  return [
    account,
    normalizeTicker(ticker),
    Number.isFinite(normalizedStrike) ? normalizedStrike.toFixed(4) : '',
    String(expiry || '').slice(0, 10),
  ].join(':')
}

function normalizePlaidCsp(position) {
  const contract = position?.optionContract
  if (!contract || typeof contract !== 'object') return null
  const contractType = String(contract.contract_type || contract.contractType || '').toLowerCase()
  const ticker = normalizeTicker(
    contract.underlying_security_ticker ||
    contract.underlyingSecurityTicker
  )
  const strike = Number(contract.strike_price ?? contract.strikePrice)
  const expiry = String(contract.expiration_date || contract.expirationDate || '').slice(0, 10)
  const rawQuantity = Number(position.quantity)
  if (
    contractType !== 'put' ||
    rawQuantity >= 0 ||
    !Number.isFinite(rawQuantity) ||
    !isSupportedTicker(ticker) ||
    !Number.isFinite(strike) ||
    strike <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(expiry) ||
    !position.stockStickiesAccount
  ) return null
  return {
    accountId: position.accountId,
    securityId: position.securityId,
    optionTicker: normalizeTicker(position.ticker),
    stockStickiesAccount: position.stockStickiesAccount,
    ticker,
    strike,
    qty: Math.abs(rawQuantity),
    expiry,
  }
}

function normalizePlaidCoveredCall(position) {
  const contract = position?.optionContract
  if (!contract || typeof contract !== 'object') return null
  const contractType = String(contract.contract_type || contract.contractType || '').toLowerCase()
  const ticker = normalizeTicker(
    contract.underlying_security_ticker ||
    contract.underlyingSecurityTicker
  )
  const strike = Number(contract.strike_price ?? contract.strikePrice)
  const expiry = String(contract.expiration_date || contract.expirationDate || '').slice(0, 10)
  const rawQuantity = Number(position.quantity)
  if (
    contractType !== 'call' ||
    rawQuantity >= 0 ||
    !Number.isFinite(rawQuantity) ||
    !isSupportedTicker(ticker) ||
    !Number.isFinite(strike) ||
    strike <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(expiry) ||
    !position.stockStickiesAccount
  ) return null
  return {
    accountId: position.accountId,
    securityId: position.securityId,
    optionTicker: normalizeTicker(position.ticker),
    stockStickiesAccount: position.stockStickiesAccount,
    ticker,
    strike,
    qty: Math.abs(rawQuantity),
    expiry,
  }
}

function coveredCallKey(call) {
  return [
    call?.securityId || '',
    normalizeTicker(call?.optionTicker),
    normalizeTicker(call?.ticker),
    Number(call?.strike).toFixed(4),
    Number(call?.qty).toFixed(8),
    String(call?.expiry || '').slice(0, 10),
  ].join(':')
}

function buildRobinhoodReconciliation(notes, positions, cashSecuredPuts = []) {
  const usable = []
  const unsupported = []
  const plaidCsps = []
  const plaidCoveredCalls = []
  for (const position of Array.isArray(positions) ? positions : []) {
    const normalizedCsp = normalizePlaidCsp(position)
    if (normalizedCsp) {
      plaidCsps.push(normalizedCsp)
      continue
    }
    const normalizedCoveredCall = normalizePlaidCoveredCall(position)
    if (normalizedCoveredCall) {
      plaidCoveredCalls.push(normalizedCoveredCall)
      continue
    }
    // Options that are not short puts (for example covered calls) are outside
    // the CSP panel and should not be reported as malformed stock positions.
    if (position?.optionContract || String(position?.subtype || '').toLowerCase() === 'option') {
      continue
    }
    const cryptoHasPrice = !position.isCrypto ||
      (Number.isFinite(position.institutionPrice) && position.institutionPrice > 0)
    if (
      !position.stockStickiesAccount ||
      !isSupportedTicker(position.ticker) ||
      !Number.isFinite(position.quantity) ||
      !cryptoHasPrice
    ) {
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
    const plaidPrice = Number(position.institutionPrice)
    const oldPlaidPrice = Number(note.plaidInstitutionPrice)
    const plaidCostBasis = Number(position.costBasis)
    const oldPlaidCostBasis = Number(note.plaidCostBasis)
    const costBasisChanged =
      (position.costBasis == null) !== (note.plaidCostBasis == null) ||
      (Number.isFinite(plaidCostBasis) &&
        (!Number.isFinite(oldPlaidCostBasis) || Math.abs(oldPlaidCostBasis - plaidCostBasis) > 1e-8))
    const taxLotCount = Number(position.taxLotCount)
    const normalizedTaxLotCount = Number.isFinite(taxLotCount)
      ? Math.max(0, Math.trunc(taxLotCount))
      : (Array.isArray(position.taxLots) ? position.taxLots.length : 0)
    const taxLotsChanged = Number(note.plaidTaxLotCount || 0) !== normalizedTaxLotCount
    const plaidMetadataChanged =
      note.plaidSecurityType !== position.type ||
      Boolean(note.plaidIsCrypto) !== Boolean(position.isCrypto) ||
      (Number.isFinite(plaidPrice) &&
        (!Number.isFinite(oldPlaidPrice) || Math.abs(oldPlaidPrice - plaidPrice) > 1e-8)) ||
      note.plaidPriceAsOf !== position.priceAsOf ||
      costBasisChanged ||
      taxLotsChanged
    if (sharesChanged || accountChanged || identifiersChanged || plaidMetadataChanged) {
      updates.push({
        noteId: note.id,
        ticker,
        oldShares: Number.isFinite(oldShares) ? oldShares : null,
        newShares: position.quantity,
        oldAccount: note.account || 'unassigned',
        newAccount: position.stockStickiesAccount,
        plaidAccountId: position.accountId,
        plaidSecurityId: position.securityId,
        plaidSecurityType: position.type,
        plaidIsCrypto: Boolean(position.isCrypto),
        plaidInstitutionPrice: position.institutionPrice,
        plaidInstitutionValue: position.institutionValue,
        plaidCostBasis: position.costBasis,
        plaidTaxLotCount: normalizedTaxLotCount,
        plaidPriceAsOf: position.priceAsOf,
      })
    }
  }

  const liveKeys = new Set((Array.isArray(positions) ? positions : []).map(position =>
    positionKey(position.stockStickiesAccount, position.ticker)
  ))
  const possibleClosed = notes.filter(note =>
    Number(note.shares) > 0 &&
    ['individual', 'traditional', 'roth'].includes(note.account) &&
    (
      note.plaidSource === 'robinhood' ||
      note.plaidAccountId ||
      note.plaidSecurityId
    ) &&
    normalizeTicker(note.title) !== 'USD' &&
    note.plaidSecurityType !== 'cash' &&
    !liveKeys.has(positionKey(note.account, note.title))
  )

  const usedPutIds = new Set()
  const cspUpdates = []
  const cspAdditions = []
  for (const position of plaidCsps) {
    let put = cashSecuredPuts.find(candidate =>
      !usedPutIds.has(candidate.id) &&
      candidate.plaidAccountId === position.accountId &&
      candidate.plaidSecurityId === position.securityId
    )
    if (!put) {
      const incomingKey = cspPositionKey(
        position.stockStickiesAccount,
        position.ticker,
        position.strike,
        position.expiry
      )
      put = cashSecuredPuts.find(candidate =>
        !usedPutIds.has(candidate.id) &&
        cspPositionKey(
          candidate.account || 'roth',
          candidate.ticker,
          candidate.strike,
          candidate.expiry
        ) === incomingKey
      )
    }
    if (!put) {
      // If the friendly contract itself is unique, allow Plaid to repair an
      // outdated manually selected account instead of creating a duplicate.
      const contractMatches = cashSecuredPuts.filter(candidate =>
        !usedPutIds.has(candidate.id) &&
        normalizeTicker(candidate.ticker) === position.ticker &&
        Math.abs(Number(candidate.strike) - position.strike) <= 1e-8 &&
        String(candidate.expiry || '').slice(0, 10) === position.expiry
      )
      if (contractMatches.length === 1) put = contractMatches[0]
    }
    if (!put) {
      cspAdditions.push(position)
      continue
    }

    usedPutIds.add(put.id)
    const changed =
      normalizeTicker(put.ticker) !== position.ticker ||
      Math.abs(Number(put.strike) - position.strike) > 1e-8 ||
      Math.abs(Number(put.qty) - position.qty) > 1e-8 ||
      String(put.expiry || '').slice(0, 10) !== position.expiry ||
      (put.account || 'roth') !== position.stockStickiesAccount ||
      put.plaidAccountId !== position.accountId ||
      put.plaidSecurityId !== position.securityId ||
      put.plaidOptionTicker !== position.optionTicker
    if (changed) {
      cspUpdates.push({
        putId: put.id,
        ...position,
      })
    }
  }

  // All CSP cards represent Robinhood short puts. Once a completed fresh
  // extraction has matched the live contracts, any remaining card is closed
  // or expired—even legacy cards created before Plaid identifiers were stored.
  // The caller only removes this list for a confirmed non-stale refresh.
  const possibleClosedCsps = cashSecuredPuts.filter(put =>
    !usedPutIds.has(put.id)
  )

  const coveredCallsByPosition = new Map()
  for (const call of plaidCoveredCalls) {
    const key = positionKey(call.stockStickiesAccount, call.ticker)
    const calls = coveredCallsByPosition.get(key) || []
    calls.push(call)
    coveredCallsByPosition.set(key, calls)
  }
  const coveredCallUpdates = []
  const possibleClosedCoveredCalls = []
  for (const note of notes) {
    const incomingCalls = coveredCallsByPosition.get(positionKey(note.account, note.title)) || []
    const savedCalls = Array.isArray(note.coveredCalls) ? note.coveredCalls : []
    const incomingKeys = incomingCalls.map(coveredCallKey).sort()
    const savedKeys = savedCalls.map(coveredCallKey).sort()
    const callsChanged =
      incomingKeys.length !== savedKeys.length ||
      incomingKeys.some((key, index) => key !== savedKeys[index])
    if (incomingCalls.length > 0 && callsChanged) {
      coveredCallUpdates.push({
        noteId: note.id,
        ticker: normalizeTicker(note.title),
        account: note.account,
        calls: incomingCalls,
      })
    } else if (incomingCalls.length === 0 && savedCalls.length > 0) {
      possibleClosedCoveredCalls.push({
        noteId: note.id,
        ticker: normalizeTicker(note.title),
        account: note.account,
        calls: savedCalls,
      })
    }
  }

  return {
    updates,
    additions,
    possibleClosed,
    unsupported,
    usable,
    cspUpdates,
    cspAdditions,
    possibleClosedCsps,
    plaidCsps,
    coveredCallUpdates,
    possibleClosedCoveredCalls,
    plaidCoveredCalls,
  }
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
  cashSecuredPuts = [],
  ready,
  darkMode,
  onApply,
  onPerformanceChange,
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(null)
  const [holdings, setHoldings] = useState(null)
  const [backup, setBackup] = useState(null)
  const [result, setResult] = useState(null)
  const [syncSummary, setSyncSummary] = useState(null)
  const [autoSyncState, setAutoSyncState] = useState('idle')
  const [openingValues, setOpeningValues] = useState({
    individual: '',
    traditional: '',
    roth: '',
  })
  const [savingPerformance, setSavingPerformance] = useState(false)
  const [performanceMessage, setPerformanceMessage] = useState('')
  const autoSyncStartedRef = useRef(false)
  const notesRef = useRef(notes)
  const cashSecuredPutsRef = useRef(cashSecuredPuts)
  const onApplyRef = useRef(onApply)
  const onPerformanceChangeRef = useRef(onPerformanceChange)

  useEffect(() => {
    notesRef.current = notes
    cashSecuredPutsRef.current = cashSecuredPuts
    onApplyRef.current = onApply
    onPerformanceChangeRef.current = onPerformanceChange
  }, [cashSecuredPuts, notes, onApply, onPerformanceChange])

  const reconciliation = useMemo(
    () => buildRobinhoodReconciliation(
      notes,
      holdings?.positions || [],
      cashSecuredPuts
    ),
    [cashSecuredPuts, notes, holdings]
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
    const responseText = await response.text()
    let data = {}
    if (responseText) {
      try {
        data = JSON.parse(responseText)
      } catch {
        data = {
          error: response.status === 524
            ? 'Plaid took too long to answer. No positions were changed. Wait a few minutes, then try the update again.'
            : `Robinhood returned an unreadable response (${response.status}). Please try again.`,
          code: response.status === 524 ? 'PLAID_UPSTREAM_TIMEOUT' : 'INVALID_API_RESPONSE',
        }
      }
    }
    if (!response.ok || data.ok === false) {
      const requestError = new Error(data.error || `Robinhood request failed (${response.status}).`)
      requestError.code = data.code || ''
      requestError.needsConsent = data.needsConsent === true
      requestError.requestId = data.requestId || ''
      requestError.retryAfterSeconds = Number(data.retryAfterSeconds) || 0
      throw requestError
    }
    return data
  }, [authUser])

  const applyPerformance = useCallback((performance) => {
    if (!performance) return
    onPerformanceChangeRef.current?.(performance)
    setOpeningValues({
      individual: performance.accounts?.individual?.openingValue ?? '',
      traditional: performance.accounts?.traditional?.openingValue ?? '',
      roth: performance.accounts?.roth?.openingValue ?? '',
    })
  }, [])

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
          applyPerformance(data.performance)
          const automaticReconciliation = buildRobinhoodReconciliation(
            notesRef.current,
            data.positions || [],
            cashSecuredPutsRef.current
          )
          if (
            automaticReconciliation.updates.length ||
            automaticReconciliation.additions.length ||
            automaticReconciliation.cspUpdates.length ||
            automaticReconciliation.cspAdditions.length ||
            automaticReconciliation.coveredCallUpdates.length
          ) {
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
  }, [apiFetch, applyPerformance, authUser, ready])

  const openSync = async () => {
    setOpen(false)
    setSyncSummary(null)
    setLoading(true)
    setError('')
    setResult(null)
    setBackup(null)
    try {
      const connection = await apiFetch('/api/stock-stickies/plaid/status')
      setStatus(connection)
      if (!connection.investmentsEnabled) {
        setAutoSyncState('needs-consent')
        setOpen(true)
        return
      }
      await loadHoldings({ requestFreshData: true })
    } catch (openError) {
      const message = openError?.message || 'Robinhood positions could not be updated.'
      setError(message)
      setSyncSummary({ ok: false, message })
    } finally {
      setLoading(false)
    }
  }

  const loadHoldings = async ({ requestFreshData = false } = {}) => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await apiFetch(
        requestFreshData
          ? '/api/stock-stickies/plaid/refresh'
          : '/api/stock-stickies/plaid/holdings',
        requestFreshData
          ? { method: 'POST', body: JSON.stringify({}) }
          : {}
      )
      setHoldings(data)
      applyPerformance(data.performance)
      setStatus(previous => ({ ...(previous || {}), investmentsEnabled: true }))
      const latestReconciliation = buildRobinhoodReconciliation(
        notesRef.current,
        data.positions || [],
        cashSecuredPutsRef.current
      )
      const canConfirmClosures =
        requestFreshData &&
        data.refresh?.requested === true &&
        Boolean(data.refresh?.completedAt) &&
        data.stale !== true &&
        data.source !== 'nightly-cache'
      const actionableReconciliation = {
        ...latestReconciliation,
        removeClosedPositions: canConfirmClosures,
      }
      let applied = null
      if (
        actionableReconciliation.updates.length ||
        actionableReconciliation.additions.length ||
        actionableReconciliation.cspUpdates.length ||
        actionableReconciliation.cspAdditions.length ||
        actionableReconciliation.coveredCallUpdates.length ||
        (actionableReconciliation.removeClosedPositions &&
          (
            actionableReconciliation.possibleClosed.length ||
            actionableReconciliation.possibleClosedCsps.length ||
            actionableReconciliation.possibleClosedCoveredCalls.length
          ))
      ) {
        setApplying(true)
        applied = await onApplyRef.current(actionableReconciliation)
        setResult(applied)
        setBackup(applied.backup)
        setAutoSyncState('applied')
      } else {
        setAutoSyncState('current')
      }
      setOpen(false)
      setSyncSummary({
        ok: true,
        checkedCount: Array.isArray(data.positions) ? data.positions.length : 0,
        updatedCount: applied?.updatedCount || 0,
        addedCount: applied?.addedCount || 0,
        removedCount: applied?.removedCount || 0,
        removedPositions: applied?.removedPositions || [],
        cspUpdatedCount: applied?.cspUpdatedCount || 0,
        cspAddedCount: applied?.cspAddedCount || 0,
        cspRemovedCount: applied?.cspRemovedCount || 0,
        removedCsps: applied?.removedCsps || [],
        coveredCallUpdatedCount: applied?.coveredCallUpdatedCount || 0,
        coveredCallRemovedCount: applied?.coveredCallRemovedCount || 0,
        priceRefresh: applied?.priceRefresh || null,
        possibleClosed: canConfirmClosures
          ? []
          : latestReconciliation.possibleClosed.map(note =>
              `${note.title} (${note.account})`
            ),
        needsReview: latestReconciliation.unsupported.map(position =>
          position.ticker || position.name || 'Unknown security'
        ),
        warnings: Array.isArray(data.performance?.warnings)
          ? data.performance.warnings
          : [],
        backupId: applied?.backup?.id || null,
        snapshotFetchedAt: data.fetchedAt || null,
        refreshRequested: data.refresh?.requested === true,
        refreshStartedAt: data.refresh?.startedAt || null,
        refreshCompletedAt: data.refresh?.completedAt || null,
        positionsChangedAtSource: data.refresh?.positionsChanged === true,
        institutionDataAsOf: data.refresh?.institutionDataAsOf || null,
        source: data.source || 'live',
        stale: data.stale === true || data.source === 'nightly-cache',
      })
    } catch (holdingsError) {
      const message = holdingsError?.message || 'Robinhood positions could not be loaded.'
      setError(message)
      setAutoSyncState(holdingsError?.needsConsent ? 'needs-consent' : 'failed')
      if (holdingsError?.needsConsent) {
        setStatus(previous => ({ ...(previous || {}), investmentsEnabled: false }))
        setOpen(true)
      } else {
        setOpen(false)
        setSyncSummary({ ok: false, message })
      }
    } finally {
      setApplying(false)
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
          setOpen(false)
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

  const savePerformanceReconciliation = async () => {
    const year = Number(holdings?.performance?.year || new Date().getFullYear())
    const parsed = Object.fromEntries(
      Object.entries(openingValues).map(([id, value]) => [
        id,
        String(value).trim()
          ? Number(String(value).replace(/[$,\s]/g, ''))
          : Number.NaN,
      ])
    )
    if (Object.values(parsed).some(value => !Number.isFinite(value) || value < 0)) {
      setError('Enter a valid non-negative opening value for all three accounts.')
      return
    }
    setSavingPerformance(true)
    setError('')
    setPerformanceMessage('')
    try {
      const data = await apiFetch('/api/stock-stickies/plaid/performance', {
        method: 'POST',
        body: JSON.stringify({ year, openingValues: parsed }),
      })
      setHoldings(previous => ({ ...(previous || {}), performance: data.performance }))
      applyPerformance(data.performance)
      setPerformanceMessage(`${year} opening values reconciled. Daily snapshots are active.`)
    } catch (performanceError) {
      setError(performanceError?.message || 'The opening values could not be saved.')
    } finally {
      setSavingPerformance(false)
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
        onClick={() => void openSync()}
        disabled={loading || applying || autoSyncState === 'syncing'}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#00c805]/50 bg-black px-3 text-sm font-bold text-[#00c805] shadow-lg transition-colors hover:bg-gray-900 disabled:cursor-wait disabled:opacity-60"
        title={
          autoSyncState === 'syncing'
            ? 'Automatically syncing Robinhood positions'
            : autoSyncState === 'applied'
              ? 'Robinhood positions were updated automatically'
            : autoSyncState === 'current'
                ? 'Stock Stickies matches Plaid’s latest available snapshot'
                : autoSyncState === 'needs-consent'
                  ? 'Open to grant one-time Robinhood Investments permission'
                  : autoSyncState === 'failed'
                    ? 'Automatic sync failed; open to retry'
                  : 'Request fresh share quantities from Robinhood through Plaid'
        }
        aria-label="Sync Robinhood positions"
      >
        <span className={autoSyncState === 'syncing' ? 'animate-pulse' : ''}>
          <RobinhoodLogo />
        </span>
        <span>
          {loading || applying || autoSyncState === 'syncing'
            ? 'Updating…'
            : 'Update positions'}
        </span>
      </button>

      {syncSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className={`w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl ${panel}`}>
            <div className={`flex items-center justify-between border-b p-4 ${panel}`}>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-black text-[#00c805]">
                  <RobinhoodLogo />
                </span>
                <div>
                  <h2 className="text-lg font-black">
                    {!syncSummary.ok
                      ? 'Update didn’t finish'
                      : syncSummary.updatedCount ||
                          syncSummary.addedCount ||
                          syncSummary.removedCount ||
                          syncSummary.cspUpdatedCount ||
                          syncSummary.cspAddedCount ||
                          syncSummary.cspRemovedCount ||
                          syncSummary.coveredCallUpdatedCount ||
                          syncSummary.coveredCallRemovedCount
                        ? 'Update complete'
                        : 'Everything is current'}
                  </h2>
                  <p className={`mt-0.5 text-xs ${muted}`}>Robinhood position sync</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSyncSummary(null)}
                className={`rounded-lg px-3 py-2 ${muted}`}
                aria-label="Close position update summary"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 p-4">
              {!syncSummary.ok ? (
                <div className="rounded-xl border border-red-500/50 bg-red-950/30 p-4 text-sm text-red-400">
                  {syncSummary.message}
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/30 p-4 text-emerald-400">
                    {syncSummary.updatedCount ||
                    syncSummary.addedCount ||
                    syncSummary.removedCount ||
                    syncSummary.cspUpdatedCount ||
                    syncSummary.cspAddedCount ||
                    syncSummary.cspRemovedCount ||
                    syncSummary.coveredCallUpdatedCount ||
                    syncSummary.coveredCallRemovedCount ? (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold">
                        {syncSummary.updatedCount > 0 && <span>{syncSummary.updatedCount} updated</span>}
                        {syncSummary.addedCount > 0 && <span>{syncSummary.addedCount} added</span>}
                        {syncSummary.removedCount > 0 && <span>{syncSummary.removedCount} removed</span>}
                        {syncSummary.cspUpdatedCount > 0 && <span>{syncSummary.cspUpdatedCount} CSP{syncSummary.cspUpdatedCount === 1 ? '' : 's'} updated</span>}
                        {syncSummary.cspAddedCount > 0 && <span>{syncSummary.cspAddedCount} CSP{syncSummary.cspAddedCount === 1 ? '' : 's'} added</span>}
                        {syncSummary.cspRemovedCount > 0 && <span>{syncSummary.cspRemovedCount} CSP{syncSummary.cspRemovedCount === 1 ? '' : 's'} removed</span>}
                        {syncSummary.coveredCallUpdatedCount > 0 && <span>{syncSummary.coveredCallUpdatedCount} covered-call annotation{syncSummary.coveredCallUpdatedCount === 1 ? '' : 's'} updated</span>}
                        {syncSummary.coveredCallRemovedCount > 0 && <span>{syncSummary.coveredCallRemovedCount} covered-call annotation{syncSummary.coveredCallRemovedCount === 1 ? '' : 's'} removed</span>}
                      </div>
                    ) : (
                      <p className="text-sm font-bold">No position changes were needed.</p>
                    )}
                    {syncSummary.removedCount > 0 && (
                      <p className="mt-2 text-xs">Removed: {syncSummary.removedPositions.join(', ')}</p>
                    )}
                    {syncSummary.cspRemovedCount > 0 && (
                      <p className="mt-2 text-xs">Removed CSPs: {syncSummary.removedCsps.join(', ')}</p>
                    )}
                    {syncSummary.addedCount > 0 && syncSummary.priceRefresh && (
                      <p className="mt-2 text-xs">
                        Starting prices set for{' '}
                        {syncSummary.priceRefresh.refreshedCount + syncSummary.priceRefresh.fallbackCount}
                        {' '}of {syncSummary.priceRefresh.requestedCount} new ticker
                        {syncSummary.priceRefresh.requestedCount === 1 ? '' : 's'}.
                      </p>
                    )}
                  </div>

                  {(syncSummary.needsReview.length > 0 ||
                    syncSummary.possibleClosed.length > 0 ||
                    syncSummary.priceRefresh?.failedTickers?.length > 0) && (
                    <div className="rounded-xl border border-amber-500/50 bg-amber-950/20 p-3 text-sm text-amber-400">
                      {syncSummary.needsReview.length > 0 && (
                        <p>{syncSummary.needsReview.length} item{syncSummary.needsReview.length === 1 ? '' : 's'} need review.</p>
                      )}
                      {syncSummary.possibleClosed.length > 0 && (
                        <p>{syncSummary.possibleClosed.length} possible closed position{syncSummary.possibleClosed.length === 1 ? '' : 's'} left unchanged.</p>
                      )}
                      {syncSummary.priceRefresh?.failedTickers?.length > 0 && (
                        <p>Missing starting price: {syncSummary.priceRefresh.failedTickers.join(', ')}.</p>
                      )}
                    </div>
                  )}

                  <details className={`rounded-xl border px-3 py-2 text-xs ${card}`}>
                    <summary className={`cursor-pointer font-semibold ${muted}`}>Details</summary>
                    <div className={`mt-2 space-y-1.5 ${muted}`}>
                      <p>Checked {syncSummary.checkedCount} position{syncSummary.checkedCount === 1 ? '' : 's'}.</p>
                      {syncSummary.snapshotFetchedAt && (
                        <p>Snapshot: {new Date(syncSummary.snapshotFetchedAt).toLocaleString()}.</p>
                      )}
                      {syncSummary.institutionDataAsOf && (
                        <p>Institution data: {new Date(syncSummary.institutionDataAsOf).toLocaleString()}.</p>
                      )}
                      {syncSummary.needsReview.length > 0 && (
                        <p>Needs review: {syncSummary.needsReview.join(', ')}.</p>
                      )}
                      {syncSummary.possibleClosed.length > 0 && (
                        <p>Left unchanged: {syncSummary.possibleClosed.join(', ')}.</p>
                      )}
                      {syncSummary.warnings.map(warning => (
                        <p key={warning}>{warning}</p>
                      ))}
                      {syncSummary.backupId && <p>A rollback backup was created.</p>}
                      {syncSummary.stale && (
                        <p className="font-bold text-amber-500">
                          A saved snapshot was used because the live request did not finish.
                        </p>
                      )}
                    </div>
                  </details>
                </>
              )}

              <div className="flex flex-wrap justify-end gap-3">
                {!syncSummary.ok && (
                  <button
                    type="button"
                    onClick={() => void openSync()}
                    className={`rounded-lg border px-4 py-2 text-sm font-bold ${muted}`}
                  >
                    Try again
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSyncSummary(null)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className={`max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border shadow-2xl ${panel}`}>
            <div className={`sticky top-0 z-10 flex items-center justify-between border-b p-5 ${panel}`}>
              <div>
                <h2 className="text-xl font-black">Robinhood Position Sync</h2>
                <p className={`mt-1 text-xs ${muted}`}>One click requests a fresh Robinhood extraction and safely applies current position sizes.</p>
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
                  <p className={`mt-1 text-sm ${muted}`}>A full backup is created automatically only when position changes need to be saved.</p>
                )}
                <p className={`mt-2 text-xs ${muted}`}>A completed fresh Robinhood extraction removes positions that are no longer held. The full pre-update backup can restore them if needed.</p>
              </div>

              {error && <div className="rounded-xl border border-red-500/50 bg-red-950/30 p-3 text-sm text-red-400">{error}</div>}
              {result && (
                <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/30 p-3 text-sm text-emerald-400">
                  Applied {result.updatedCount} share update{result.updatedCount === 1 ? '' : 's'}, added {result.addedCount} position note{result.addedCount === 1 ? '' : 's'}, updated {result.cspUpdatedCount || 0} CSP{result.cspUpdatedCount === 1 ? '' : 's'}, and added {result.cspAddedCount || 0} CSP{result.cspAddedCount === 1 ? '' : 's'}. Rollback backup: {result.backup.id}.
                </div>
              )}
              {performanceMessage && (
                <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/30 p-3 text-sm text-emerald-400">
                  {performanceMessage}
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
                  {!loading && (
                    <button
                      type="button"
                      onClick={status?.investmentsEnabled ? openSync : connectInvestments}
                      className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
                    >
                      {status?.investmentsEnabled ? 'Update positions' : 'Connect Robinhood Positions'}
                    </button>
                  )}
                </div>
              )}

              {holdings && (
                <>
                  <div className={`rounded-xl border p-4 ${card}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-bold">{holdings.performance?.year || new Date().getFullYear()} YTD performance</div>
                        <p className={`mt-1 text-xs ${muted}`}>
                          December 31 closing values establish the baseline. YTD is shown only when deposits and withdrawals can also be reconciled; daily closing snapshots continue automatically.
                        </p>
                      </div>
                      {holdings.performance?.total?.status === 'ready' && (
                        <div className="text-right">
                          <div className={`text-xs ${muted}`}>All accounts</div>
                          <div className={`text-lg font-black tabular-nums ${
                            Number(holdings.performance.total.gain) >= 0 ? 'text-emerald-500' : 'text-red-500'
                          }`}>
                            {Number(holdings.performance.total.gain) >= 0 ? '+' : ''}
                            {Number(holdings.performance.total.gain).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                            {Number.isFinite(holdings.performance.total.returnPercent) &&
                              ` · ${holdings.performance.total.returnPercent >= 0 ? '+' : ''}${holdings.performance.total.returnPercent.toFixed(2)}%`}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {[
                        ['individual', 'Individual'],
                        ['traditional', 'Traditional IRA'],
                        ['roth', 'Roth IRA'],
                      ].map(([id, label]) => {
                        const performance = holdings.performance?.accounts?.[id]
                        return (
                          <label key={id} className="block">
                            <span className={`text-xs font-semibold ${muted}`}>{label} opening value</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={openingValues[id]}
                              onChange={(event) => setOpeningValues(current => ({
                                ...current,
                                [id]: event.target.value,
                              }))}
                              placeholder="0.00"
                              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm tabular-nums ${
                                darkMode
                                  ? 'border-gray-700 bg-gray-900 text-white'
                                  : 'border-gray-300 bg-white text-gray-900'
                              }`}
                            />
                            {performance?.status === 'ready' && (
                              <>
                                <span className={`mt-1 block text-xs font-bold ${
                                  Number(performance.gain) >= 0 ? 'text-emerald-500' : 'text-red-500'
                                }`}>
                                  YTD {Number(performance.gain) >= 0 ? '+' : ''}
                                  {Number(performance.gain).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                                  {Number.isFinite(performance.returnPercent) &&
                                    ` · ${performance.returnPercent >= 0 ? '+' : ''}${performance.returnPercent.toFixed(2)}%`}
                                </span>
                                <span className={`mt-1 block text-[10px] ${muted}`}>
                                  Net external flow {Number(performance.netExternalFlow) >= 0 ? '+' : ''}
                                  {Number(performance.netExternalFlow).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                                  {' · '}{performance.externalFlowCount} recognized flow{performance.externalFlowCount === 1 ? '' : 's'}
                                </span>
                              </>
                            )}
                            {performance?.status === 'cash-flow-history-incomplete' && (
                              <span className="mt-1 block text-xs font-bold text-amber-500">
                                YTD unavailable · cash-flow history is incomplete
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className={`text-xs ${muted}`}>
                        {holdings.performance?.snapshotCount || 0} daily snapshot{holdings.performance?.snapshotCount === 1 ? '' : 's'} stored
                        {holdings.performance?.asOf ? ` · through ${holdings.performance.asOf}` : ''}
                      </div>
                      <button
                        type="button"
                        onClick={savePerformanceReconciliation}
                        disabled={savingPerformance}
                        className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingPerformance ? 'Reconciling activity…' : 'Save opening values'}
                      </button>
                    </div>
                    {holdings.performance?.warnings?.map((warning) => (
                      <p key={warning} className="mt-2 text-xs text-amber-500">{warning}</p>
                    ))}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-5">
                    {[
                      ['Share updates', reconciliation.updates.length],
                      ['New positions', reconciliation.additions.length],
                      ['CSP changes', reconciliation.cspUpdates.length + reconciliation.cspAdditions.length],
                      ['Covered calls', reconciliation.coveredCallUpdates.length],
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
                      {!reconciliation.updates.length &&
                      !reconciliation.additions.length &&
                      !reconciliation.cspUpdates.length &&
                      !reconciliation.cspAdditions.length &&
                      !reconciliation.coveredCallUpdates.length ? (
                        <div className={`p-4 text-sm ${muted}`}>
                          Stock Stickies matches Plaid’s latest available position snapshot.
                        </div>
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
                              <div className={muted}>New Core Thesis note · <span className="font-bold text-emerald-500">{position.quantity}</span> shares</div>
                            </div>
                          ))}
                          {reconciliation.cspUpdates.map(change => (
                            <div key={`csp-update-${change.putId}`} className="flex items-center justify-between gap-4 border-b border-inherit px-4 py-3 text-sm">
                              <div><span className="font-bold">{change.ticker} CSP</span> · {change.stockStickiesAccount}</div>
                              <div className={muted}>${change.strike} · {change.qty} contract{change.qty === 1 ? '' : 's'} · {change.expiry}</div>
                            </div>
                          ))}
                          {reconciliation.cspAdditions.map(position => (
                            <div key={`csp-add-${position.accountId}-${position.securityId}`} className="flex items-center justify-between gap-4 border-b border-inherit px-4 py-3 text-sm">
                              <div><span className="font-bold">{position.ticker} CSP</span> · {position.stockStickiesAccount}</div>
                              <div className={muted}>New · ${position.strike} · {position.qty} contract{position.qty === 1 ? '' : 's'} · {position.expiry}</div>
                            </div>
                          ))}
                          {reconciliation.coveredCallUpdates.map(change => (
                            <div key={`cc-update-${change.noteId}`} className="flex items-center justify-between gap-4 border-b border-inherit px-4 py-3 text-sm">
                              <div><span className="font-bold">{change.ticker}</span> · {change.account}</div>
                              <div className={muted}>{change.calls.length} covered call{change.calls.length === 1 ? '' : 's'} annotated</div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>

                  {(reconciliation.possibleClosed.length > 0 ||
                    reconciliation.possibleClosedCsps.length > 0 ||
                    reconciliation.unsupported.length > 0) && (
                    <div className={`rounded-xl border border-amber-500/40 p-4 ${card}`}>
                      <div className="font-bold text-amber-500">Review only — no automatic changes</div>
                      {reconciliation.possibleClosed.length > 0 && (
                        <p className={`mt-2 text-sm ${muted}`}>
                          Not returned by Plaid: {reconciliation.possibleClosed.map(note => `${note.title} (${note.account})`).join(', ')}. Their shares will stay unchanged.
                        </p>
                      )}
                      {reconciliation.possibleClosedCsps.length > 0 && (
                        <p className={`mt-2 text-sm ${muted}`}>
                          CSPs not returned by Plaid: {reconciliation.possibleClosedCsps.map(put => `${put.ticker} $${put.strike} ${put.expiry}`).join(', ')}. They stay unchanged unless a fresh extraction confirms they are closed.
                        </p>
                      )}
                      {reconciliation.unsupported.length > 0 && (
                        <p className={`mt-2 text-sm ${muted}`}>
                          Unsupported or missing ticker, account mapping, quantity, or crypto price: {reconciliation.unsupported.map(position => position.ticker || position.name || 'Unknown security').join(', ')}.
                        </p>
                      )}
                    </div>
                  )}

                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
