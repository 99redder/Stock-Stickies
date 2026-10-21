import { useState } from 'react'
import {
    EmailAuthProvider,
    getAuth,
    getMultiFactorResolver,
    GoogleAuthProvider,
    reauthenticateWithCredential,
    reauthenticateWithPopup,
    TotpMultiFactorGenerator,
} from 'firebase/auth'

// Self-service account deletion. Two deliberate steps — read what will be deleted
// and continue, then type "delete" (and confirm who you are) — before anything is
// removed. Signing in again first means Firebase will also accept deleting the login.

const CONFIRM_WORD = 'delete'

const friendlyError = (error) => {
    switch (error?.code) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'That password is not correct.'
        case 'auth/invalid-verification-code':
            return 'That code didn’t match. Enter the newest code from your authenticator app.'
        case 'auth/popup-closed-by-user':
            return 'The Google window was closed before signing in.'
        case 'auth/too-many-requests':
            return 'Too many attempts. Wait a minute and try again.'
        default:
            return error?.message || 'Something went wrong. Nothing was deleted.'
    }
}

export default function DeleteAccountDialog({ user, onDeleteAccount, onClose }) {
    // step: 'warn' → 'confirm' → ('code') → 'deleting'
    const [step, setStep] = useState('warn')
    const [typed, setTyped] = useState('')
    const [password, setPassword] = useState('')
    const [resolver, setResolver] = useState(null)
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [progress, setProgress] = useState('')

    const usesPassword = !!user?.providerData?.some((provider) => provider.providerId === 'password')
    const typedOk = typed.trim().toLowerCase() === CONFIRM_WORD
    const canDelete = typedOk && (!usesPassword || password.length > 0) && !busy

    const runDeletion = async () => {
        setStep('deleting')
        setError('')
        try {
            await onDeleteAccount(setProgress)
        } catch (err) {
            setError(friendlyError(err))
            setStep('confirm')
            setBusy(false)
        }
    }

    const confirmDelete = async (event) => {
        event.preventDefault()
        if (!canDelete) return
        setBusy(true)
        setError('')
        try {
            if (usesPassword) {
                await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
            } else {
                await reauthenticateWithPopup(user, new GoogleAuthProvider())
            }
            await runDeletion()
        } catch (err) {
            if (err?.code === 'auth/multi-factor-auth-required') {
                setResolver(getMultiFactorResolver(getAuth(), err))
                setCode('')
                setStep('code')
            } else {
                setError(friendlyError(err))
            }
            setBusy(false)
        }
    }

    const confirmCode = async (event) => {
        event.preventDefault()
        const hint = resolver?.hints.find((item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID)
        if (!hint || code.length !== 6) return
        setBusy(true)
        setError('')
        try {
            await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code))
            await runDeletion()
        } catch (err) {
            setError(friendlyError(err))
            setBusy(false)
        }
    }

    const primaryDanger = 'rounded-lg bg-red-600 px-5 py-2 font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40'
    const secondary = 'rounded-lg px-4 py-2 font-semibold text-gray-400 hover:text-white disabled:opacity-40'
    const inputClass = 'w-full rounded-lg border-2 border-gray-600 bg-gray-800 px-3 py-2 text-white outline-none focus:border-red-400'

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
            <div role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-red-500/40 bg-gray-900 text-sm text-gray-200 shadow-2xl">
                <div className="space-y-4 px-6 py-5">
                    <h2 id="delete-account-title" className="text-xl font-extrabold text-white">Delete your account</h2>

                    {step === 'warn' && (
                        <>
                            <p className="text-gray-300">This permanently deletes, for every device you use:</p>
                            <ul className="list-inside list-disc space-y-1 text-gray-300">
                                <li>all of your notes, categories, positions, accounts, and puts</li>
                                <li>your watch list, RADAR, sector buckets, and Live Dashboard layout</li>
                                <li>your saved API keys, nickname, and profile photo</li>
                                <li>every backup of your account</li>
                                <li>your login{user?.email ? ` (${user.email})` : ''}, including two-step verification</li>
                            </ul>
                            <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 font-semibold text-red-200">
                                This can’t be undone, and Backups can’t bring it back.
                            </p>
                        </>
                    )}

                    {step === 'confirm' && (
                        <form id="delete-account-form" onSubmit={confirmDelete} className="space-y-3">
                            <label htmlFor="delete-confirm-word" className="block text-gray-300">
                                To confirm, type <span className="rounded bg-gray-800 px-1.5 py-0.5 font-mono font-bold text-red-300">{CONFIRM_WORD}</span> below.
                            </label>
                            <input
                                id="delete-confirm-word"
                                autoFocus
                                autoComplete="off"
                                spellCheck={false}
                                value={typed}
                                onChange={(event) => setTyped(event.target.value)}
                                placeholder={CONFIRM_WORD}
                                className={inputClass}
                            />
                            {usesPassword ? (
                                <>
                                    <label htmlFor="delete-password" className="block text-gray-300">Enter your password to prove it’s you.</label>
                                    <input
                                        id="delete-password"
                                        type="password"
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        className={inputClass}
                                    />
                                </>
                            ) : (
                                <p className="text-xs text-gray-500">You’ll be asked to sign in with Google once more to prove it’s you.</p>
                            )}
                        </form>
                    )}

                    {step === 'code' && (
                        <form id="delete-code-form" onSubmit={confirmCode} className="space-y-3">
                            <p className="text-gray-300">Enter the 6-digit code from your authenticator app.</p>
                            <input
                                autoFocus
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                value={code}
                                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                                className={`${inputClass} text-center text-lg tracking-[0.4em]`}
                                placeholder="123456"
                            />
                        </form>
                    )}

                    {step === 'deleting' && (
                        <p className="text-gray-300">Deleting your account… {progress}</p>
                    )}

                    {error && <p className="text-red-400">{error}</p>}
                </div>

                {step !== 'deleting' && (
                    <div className="flex items-center justify-between gap-2 border-t border-gray-800 px-6 py-4">
                        <button type="button" onClick={onClose} disabled={busy} className={secondary}>Cancel</button>
                        {step === 'warn' && (
                            <button type="button" onClick={() => setStep('confirm')} className={primaryDanger}>I understand, continue</button>
                        )}
                        {step === 'confirm' && (
                            <button type="submit" form="delete-account-form" disabled={!canDelete} className={primaryDanger}>
                                {busy ? 'Checking…' : 'Delete my account forever'}
                            </button>
                        )}
                        {step === 'code' && (
                            <button type="submit" form="delete-code-form" disabled={busy || code.length !== 6} className={primaryDanger}>
                                {busy ? 'Checking…' : 'Verify and delete'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
