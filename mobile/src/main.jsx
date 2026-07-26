import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

const APP_BUILD = '17'
const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let reloading = false
  let checking = false
  let registration

  const clearAppCaches = async () => {
    if (!('caches' in window)) return
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => key.startsWith('stock-stickies-mobile-'))
        .map((key) => caches.delete(key)),
    )
  }

  const reloadForUpdate = async (build = APP_BUILD) => {
    if (reloading) return
    reloading = true
    try {
      await clearAppCaches()
    } catch {
      // A cache cleanup failure should not block loading the new app shell.
    }
    window.location.replace(`/?build=${encodeURIComponent(build)}&updated=${Date.now()}`)
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    reloadForUpdate()
  })

  const checkForUpdate = async () => {
    if (checking || reloading) return
    checking = true
    try {
      registration ||= await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      await registration.update()

      const response = await fetch(`/version.json?checked=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (!response.ok) return

      const latest = await response.json()
      if (String(latest.build) !== APP_BUILD) {
        if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        await reloadForUpdate(latest.build)
      }
    } catch {
      // The app remains usable online if an update check fails.
    } finally {
      checking = false
    }
  }

  checkForUpdate()
  window.addEventListener('pageshow', checkForUpdate)
  window.addEventListener('focus', checkForUpdate)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate()
  })
  window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
