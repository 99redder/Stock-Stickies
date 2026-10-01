// =============================================================================
// FILE: src/ipad/IpadBoardApp.jsx
// ROLE: The iPad board at /ipad — the Live Dashboard as swipeable pages of large
//       tiles, and nothing else. Its own entry (ipad.html), separate from App.jsx.
//
// It only READS the user's document (Finnhub key, desktop dashboard to copy from).
// Its single write is a field-level update of `ipadDashboard`; it has no code that
// writes the whole document, so it cannot overwrite notes or positions that the
// desktop app is editing at the same time.
// =============================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { doc, getFirestore, onSnapshot, updateDoc } from 'firebase/firestore'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import FinnhubDiagnosticDashboard from '../components/FinnhubDiagnosticDashboard.jsx'

// Firebase web config (public client config) — same project as the desktop app.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
}

let db = null
let auth = null
try {
  const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()
  const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY || ''
  if (appCheckSiteKey) {
    try {
      initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: false,
      })
    } catch (appCheckError) {
      if (appCheckError?.code !== 'appCheck/already-initialized') throw appCheckError
    }
  }
  db = getFirestore(firebaseApp)
  auth = getAuth(firebaseApp)
} catch (error) {
  console.error('Firebase initialization error:', error)
}

// Same derivation as App.jsx's getEncryptionKey / decryptApiKey.
const decryptApiKey = async (stored, userId) => {
  if (!stored || !userId) return ''
  if (typeof stored === 'string') return stored
  if (typeof stored !== 'object' || !stored.encrypted || !stored.iv) return ''
  try {
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(`${userId}|StockStickies|2024`), 'PBKDF2', false, ['deriveBits', 'deriveKey'])
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: encoder.encode('StockStickiesSalt2024'), iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    )
    const bytes = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(stored.iv) }, key, bytes(stored.encrypted))
    return new TextDecoder().decode(decrypted)
  } catch (error) {
    console.error('Could not read the saved Finnhub key:', error)
    return ''
  }
}

const SAVE_DELAY_MS = 1500

// The board is the owner's only. This check is what keeps other accounts out of the
// page; their data was never reachable from here (Firestore rules limit every account
// to its own document).
const OWNER_FIREBASE_UID = 'tQ4KeGwCjsb5CSbrFwmWYWX3BvI2'
const NOT_OWNER_MESSAGE = 'This board is private. That account does not have access.'

const signInErrorMessage = (error) => {
  const code = error?.code || ''
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) return 'That email and password did not match.'
  if (/popup-closed|cancelled-popup/.test(code)) return ''
  if (/popup-blocked/.test(code)) return 'The Google sign-in window was blocked. Allow pop-ups for this site, or sign in with email.'
  if (/network/.test(code)) return 'No connection. Check the Wi-Fi and try again.'
  if (/too-many-requests/.test(code)) return 'Too many attempts. Wait a minute and try again.'
  return 'Sign-in failed. Try again.'
}

function Screen({ children }) {
  return (
    <div className="ipad-board-screen">
      <div className="ipad-board-card">
        <div className="ipad-board-kicker">STOCK STICKIES</div>
        <div className="ipad-board-title">LIVE BOARD</div>
        {children}
      </div>
    </div>
  )
}

export default function IpadBoardApp() {
  // undefined while Firebase restores the session, null when signed out.
  const [user, setUser] = useState(undefined)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signInError, setSignInError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  // 'loading' until the first document read; then 'ready', 'no-document' or 'error'.
  const [accountState, setAccountState] = useState('loading')
  const [apiKey, setApiKey] = useState('')
  const [desktopDashboard, setDesktopDashboard] = useState(null)
  const [accountBoard, setAccountBoard] = useState(null)

  const accountBoardRef = useRef(null)
  const latestBoardRef = useRef(null)
  const saveTimerRef = useRef(null)
  const documentExistsRef = useRef(false)

  useEffect(() => {
    if (!auth) {
      setUser(null)
      return undefined
    }
    return onAuthStateChanged(auth, (nextUser) => {
      if (nextUser && nextUser.uid !== OWNER_FIREBASE_UID) {
        setSignInError(NOT_OWNER_MESSAGE)
        setUser(null)
        signOut(auth).catch(() => {})
        return
      }
      setUser(nextUser || null)
    })
  }, [])

  // Sends the board to the account when this device's copy is the newer one. Run
  // after every edit and every document snapshot, so a desktop save that carried a
  // slightly older copy is corrected on the next snapshot.
  const scheduleBoardSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const board = latestBoardRef.current
      const userId = auth?.currentUser?.uid
      if (!board || userId !== OWNER_FIREBASE_UID || !db || !documentExistsRef.current) return
      if (!(board.savedAt > (Number(accountBoardRef.current?.savedAt) || 0))) return
      try {
        await updateDoc(doc(db, 'users', userId), { ipadDashboard: board })
      } catch (error) {
        console.error('Board backup skipped:', error)
      }
    }, SAVE_DELAY_MS)
  }, [])

  const userId = user?.uid === OWNER_FIREBASE_UID ? user.uid : null
  useEffect(() => {
    if (!userId || !db) return undefined
    let active = true
    setAccountState('loading')
    const unsubscribe = onSnapshot(doc(db, 'users', userId), async (snapshot) => {
      if (!active) return
      if (!snapshot.exists()) {
        documentExistsRef.current = false
        setAccountState('no-document')
        return
      }
      const data = snapshot.data() || {}
      documentExistsRef.current = true
      accountBoardRef.current = data.ipadDashboard && typeof data.ipadDashboard === 'object' ? data.ipadDashboard : null
      const key = await decryptApiKey(data.finnhubApiKey, userId)
      if (!active) return
      // A key that fails to decode leaves the one already in use alone.
      if (key) setApiKey(key)
      setDesktopDashboard(data.diagnosticDashboard && typeof data.diagnosticDashboard === 'object' ? data.diagnosticDashboard : null)
      setAccountBoard(accountBoardRef.current)
      setAccountState('ready')
      scheduleBoardSave()
    }, (error) => {
      console.error('Could not load the account:', error)
      if (active) setAccountState((current) => current === 'ready' ? current : 'error')
    })
    return () => {
      active = false
      unsubscribe()
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [userId, scheduleBoardSave])

  const handleBoardChange = useCallback((board) => {
    latestBoardRef.current = board
    scheduleBoardSave()
  }, [scheduleBoardSave])

  const handleSignOut = useCallback(async () => {
    if (!window.confirm('Sign out of the board on this iPad?')) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    latestBoardRef.current = null
    accountBoardRef.current = null
    documentExistsRef.current = false
    setApiKey('')
    setDesktopDashboard(null)
    setAccountBoard(null)
    if (auth) await signOut(auth)
  }, [])

  const signInWithEmail = async (event) => {
    event.preventDefault()
    if (!auth || signingIn) return
    setSigningIn(true)
    setSignInError('')
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      setPassword('')
    } catch (error) {
      setSignInError(signInErrorMessage(error))
    } finally {
      setSigningIn(false)
    }
  }

  const signInWithGoogle = async () => {
    if (!auth || signingIn) return
    setSigningIn(true)
    setSignInError('')
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (error) {
      setSignInError(signInErrorMessage(error))
    } finally {
      setSigningIn(false)
    }
  }

  if (!auth || !db) {
    return <Screen><p className="ipad-board-message">Stock Stickies could not start on this device. Reload the page.</p></Screen>
  }

  if (user === undefined) {
    return <Screen><div className="ipad-board-status">LOADING…</div></Screen>
  }

  if (!user || !userId) {
    return (
      <Screen>
        <form className="ipad-board-form" onSubmit={signInWithEmail}>
          <label>
            EMAIL
            <input type="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            PASSWORD
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {signInError && <p className="ipad-board-error" role="alert">{signInError}</p>}
          <button type="submit" className="ipad-board-button" disabled={signingIn}>{signingIn ? 'SIGNING IN…' : 'SIGN IN'}</button>
          <button type="button" className="ipad-board-button is-secondary" onClick={signInWithGoogle} disabled={signingIn}>CONTINUE WITH GOOGLE</button>
        </form>
      </Screen>
    )
  }

  if (accountState === 'loading') {
    return <Screen><div className="ipad-board-status">LOADING YOUR BOARD…</div></Screen>
  }

  if (accountState !== 'ready') {
    return (
      <Screen>
        <p className="ipad-board-message">
          {accountState === 'no-document'
            ? 'This account has no Stock Stickies data yet. Set it up at stockstickies.com on a computer first, then come back.'
            : 'Your account could not be loaded. Check the connection and reload the page.'}
        </p>
        <div className="ipad-board-actions">
          <button type="button" className="ipad-board-button is-secondary" onClick={handleSignOut}>SIGN OUT</button>
        </div>
      </Screen>
    )
  }

  return (
    <FinnhubDiagnosticDashboard
      key={user.uid}
      paged
      apiKey={apiKey}
      persistedDashboard={accountBoard}
      seedDashboard={desktopDashboard}
      onDashboardChange={handleBoardChange}
      onSignOut={handleSignOut}
    />
  )
}
