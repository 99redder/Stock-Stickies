import { useCallback, useEffect, useState } from 'react'
import {
    EmailAuthProvider,
    getAuth,
    getMultiFactorResolver,
    GoogleAuthProvider,
    multiFactor,
    reauthenticateWithCredential,
    reauthenticateWithPopup,
    sendEmailVerification,
    TotpMultiFactorGenerator,
} from 'firebase/auth'

// Two-step verification (TOTP authenticator app) for the signed-in user.
// Optional for everyone; App.jsx opens it with `required` for the owner account
// until a factor is enrolled, and the owner-only Workers refuse owner tokens
// signed in without one.

const ISSUER = 'Stock Stickies'

const totpFactors = (user) => {
    if (!user) return []
    try {
        return multiFactor(user).enrolledFactors.filter((factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID)
    } catch {
        return []
    }
}

const friendlyError = (error) => {
    switch (error?.code) {
        case 'auth/invalid-verification-code':
            return 'That code didn’t match. Check the time on your phone and enter the newest code.'
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'That password is not correct.'
        case 'auth/popup-closed-by-user':
            return 'The Google window was closed before signing in.'
        case 'auth/too-many-requests':
            return 'Too many attempts. Wait a minute and try again.'
        default:
            return error?.message || 'Something went wrong. Try again.'
    }
}

export default function TwoStepVerification({ user, required = false, onClose, onSignOut, onChange }) {
    // step: 'status' | 'verify-email' | 'reauth' | 'scan' | 'done' | 'unavailable'
    const [step, setStep] = useState('status')
    const [pendingAction, setPendingAction] = useState(null) // 'enroll' | 'remove'
    const [factors, setFactors] = useState(() => totpFactors(user))
    const [secret, setSecret] = useState(null)
    const [qrDataUrl, setQrDataUrl] = useState('')
    const [code, setCode] = useState('')
    const [password, setPassword] = useState('')
    // Signing in again on an account that already has a factor asks for its code too.
    const [reauthResolver, setReauthResolver] = useState(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')

    const usesPassword = !!user?.providerData?.some((provider) => provider.providerId === 'password')
    const enrolled = factors.length > 0
    const canClose = !required || enrolled || step === 'unavailable'

    const refreshFactors = useCallback(() => {
        const next = totpFactors(user)
        setFactors(next)
        onChange?.(next.length > 0)
        return next
    }, [onChange, user])

    const startEnroll = useCallback(async () => {
        setError('')
        setPendingAction('enroll')
        if (!user.emailVerified) {
            setStep('verify-email')
            return
        }
        setBusy(true)
        try {
            const session = await multiFactor(user).getSession()
            const nextSecret = await TotpMultiFactorGenerator.generateSecret(session)
            const QRCode = await import('qrcode')
            const url = nextSecret.generateQrCodeUrl(user.email || 'Stock Stickies account', ISSUER)
            setQrDataUrl(await QRCode.toDataURL(url, { margin: 1, width: 220 }))
            setSecret(nextSecret)
            setCode('')
            setStep('scan')
        } catch (err) {
            if (err?.code === 'auth/requires-recent-login') setStep('reauth')
            else if (err?.code === 'auth/unverified-email') setStep('verify-email')
            else if (err?.code === 'auth/operation-not-allowed' || err?.code === 'auth/admin-restricted-operation') setStep('unavailable')
            else {
                setError(friendlyError(err))
                // Never leave the required (owner) setup with no way past a failure.
                if (required) setStep('unavailable')
            }
        } finally {
            setBusy(false)
        }
    }, [required, user])

    // The owner goes straight to setup.
    useEffect(() => {
        if (required && !enrolled && step === 'status') startEnroll()
    }, [enrolled, required, startEnroll, step])

    const finishEnroll = async (event) => {
        event.preventDefault()
        if (!secret || !/^\d{6}$/.test(code.trim())) {
            setError('Enter the 6-digit code from your authenticator app.')
            return
        }
        setBusy(true)
        setError('')
        try {
            const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim())
            await multiFactor(user).enroll(assertion, 'Authenticator app')
            // A fresh token carries the second-factor claim the Workers check.
            await user.getIdToken(true).catch(() => {})
            refreshFactors()
            setSecret(null)
            setStep('done')
        } catch (err) {
            setError(friendlyError(err))
        } finally {
            setBusy(false)
        }
    }

    const removeFactor = async () => {
        setError('')
        setPendingAction('remove')
        setBusy(true)
        try {
            for (const factor of factors) await multiFactor(user).unenroll(factor)
            refreshFactors()
            setNotice('Two-step verification is off. You can turn it back on any time.')
            setStep('status')
        } catch (err) {
            if (err?.code === 'auth/requires-recent-login') setStep('reauth')
            else if (err?.code === 'auth/user-token-expired') {
                setNotice('Two-step verification is off. Please sign in again.')
                onSignOut?.()
            } else setError(friendlyError(err))
        } finally {
            setBusy(false)
        }
    }

    const continueAfterReauth = async () => {
        setPassword('')
        setCode('')
        setReauthResolver(null)
        setBusy(false)
        if (pendingAction === 'remove') await removeFactor()
        else await startEnroll()
    }

    const reauthenticate = async (event) => {
        event?.preventDefault()
        setBusy(true)
        setError('')
        try {
            if (reauthResolver) {
                const hint = reauthResolver.hints.find((item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID)
                await reauthResolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim()))
            } else if (usesPassword) {
                await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
            } else {
                await reauthenticateWithPopup(user, new GoogleAuthProvider())
            }
            await continueAfterReauth()
        } catch (err) {
            if (err?.code === 'auth/multi-factor-auth-required') {
                setReauthResolver(getMultiFactorResolver(getAuth(), err))
                setCode('')
            } else setError(friendlyError(err))
            setBusy(false)
        }
    }

    const sendVerification = async () => {
        setBusy(true)
        setError('')
        try {
            await sendEmailVerification(user)
            setNotice(`We sent a verification link to ${user.email}. Open it, then come back and click “I’ve verified it”.`)
        } catch (err) {
            setError(friendlyError(err))
        } finally {
            setBusy(false)
        }
    }

    const checkVerified = async () => {
        setBusy(true)
        setError('')
        try {
            await user.reload()
            if (!user.emailVerified) {
                setError('That email isn’t verified yet. Open the link in the email first.')
                setBusy(false)
                return
            }
            await user.getIdToken(true)
            setNotice('')
            setBusy(false)
            await startEnroll()
        } catch (err) {
            setError(friendlyError(err))
            setBusy(false)
        }
    }

    const primaryButton = 'rounded-lg bg-cyan-500 px-5 py-2 font-bold text-gray-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40'
    const secondaryButton = 'rounded-lg px-4 py-2 font-semibold text-gray-400 hover:text-white'

    return (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4">
            <div role="dialog" aria-modal="true" aria-labelledby="two-step-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 text-sm shadow-2xl">
                <div className="space-y-4 px-6 py-5">
                    <h2 id="two-step-title" className="text-xl font-extrabold text-white">Two-step verification</h2>

                    {required && !enrolled && step !== 'unavailable' && step !== 'done' && (
                        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
                            This account has brokerage access, so two-step verification is required. Set it up once and you’re done.
                        </p>
                    )}
                    {notice && <p className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-3 text-cyan-100">{notice}</p>}

                    {step === 'status' && (
                        enrolled ? (
                            <p className="text-gray-300">
                                <span className="font-semibold text-emerald-300">On.</span> Signing in asks for a code from your authenticator app.
                            </p>
                        ) : (
                            <p className="text-gray-300">
                                Add a second step to signing in: after your password or Google sign-in, Stock Stickies asks for a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy, Microsoft Authenticator…). It’s optional.
                            </p>
                        )
                    )}

                    {step === 'verify-email' && (
                        <div className="space-y-3 text-gray-300">
                            <p>Two-step verification needs a verified email address first.</p>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={sendVerification} disabled={busy} className={primaryButton}>Send verification email</button>
                                <button type="button" onClick={checkVerified} disabled={busy} className="rounded-lg border border-gray-600 px-4 py-2 font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-40">I’ve verified it</button>
                            </div>
                        </div>
                    )}

                    {step === 'reauth' && reauthResolver && (
                        <form onSubmit={reauthenticate} className="space-y-3">
                            <p className="text-gray-300">Enter the 6-digit code from your authenticator app.</p>
                            <input
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                value={code}
                                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-center text-lg tracking-[0.4em] text-white outline-none focus:ring-2 focus:ring-cyan-500"
                                placeholder="123456"
                            />
                            <button type="submit" disabled={busy || code.length !== 6} className={primaryButton}>Continue</button>
                        </form>
                    )}

                    {step === 'reauth' && !reauthResolver && (
                        usesPassword ? (
                            <form onSubmit={reauthenticate} className="space-y-3">
                                <p className="text-gray-300">For your security, enter your password again.</p>
                                <input
                                    type="password"
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    className="w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-white outline-none focus:ring-2 focus:ring-cyan-500"
                                    placeholder="Password"
                                />
                                <button type="submit" disabled={busy || !password} className={primaryButton}>Continue</button>
                            </form>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-gray-300">For your security, sign in with Google again.</p>
                                <button type="button" onClick={reauthenticate} disabled={busy} className={primaryButton}>Continue with Google</button>
                            </div>
                        )
                    )}

                    {step === 'scan' && (
                        <form onSubmit={finishEnroll} className="space-y-3 text-gray-300">
                            <p>1. Scan this code with your authenticator app.</p>
                            {qrDataUrl && <img src={qrDataUrl} alt="QR code for your authenticator app" className="mx-auto h-[220px] w-[220px] rounded-lg bg-white p-2" />}
                            <p className="text-xs text-gray-500">
                                Can’t scan? Enter this key instead:{' '}
                                <code className="select-all break-all rounded bg-gray-800 px-1.5 py-0.5 text-gray-200">{secret?.secretKey}</code>
                            </p>
                            <p>2. Enter the 6-digit code it shows.</p>
                            <input
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                value={code}
                                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-center text-lg tracking-[0.4em] text-white outline-none focus:ring-2 focus:ring-cyan-500"
                                placeholder="123456"
                            />
                            <button type="submit" disabled={busy || code.length !== 6} className={primaryButton}>Turn on</button>
                        </form>
                    )}

                    {step === 'done' && (
                        <p className="text-gray-300">
                            <span className="font-semibold text-emerald-300">Two-step verification is on.</span> Next time you sign in — here, on the iPad board, or in the mobile app — you’ll be asked for a code from your authenticator app. Keep that app (or its backup) safe: without it you can’t sign in.
                        </p>
                    )}

                    {step === 'unavailable' && (
                        <p className="text-gray-300">Two-step verification isn’t available right now. Try again later.</p>
                    )}

                    {error && <p className="text-red-400">{error}</p>}
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-gray-800 px-6 py-4">
                    {canClose ? (
                        <button type="button" onClick={onClose} className={secondaryButton}>{step === 'done' ? 'Done' : 'Close'}</button>
                    ) : (
                        <button type="button" onClick={onSignOut} className={secondaryButton}>Sign out</button>
                    )}
                    {step === 'status' && !enrolled && (
                        <button type="button" onClick={startEnroll} disabled={busy} className={primaryButton}>Set up</button>
                    )}
                    {step === 'status' && enrolled && !required && (
                        <button type="button" onClick={removeFactor} disabled={busy} className="rounded-lg border border-red-500/60 px-4 py-2 font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-40">Turn off</button>
                    )}
                </div>
            </div>
        </div>
    )
}
