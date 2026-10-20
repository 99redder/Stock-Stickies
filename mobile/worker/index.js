// The Sites host does not apply public/_headers, so the Worker runs first and
// sets the same headers on every response: framing is refused (clickjacking),
// HTTPS is pinned, and the app shell is never cached so installed PWAs find
// new releases.
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

const NO_STORE_PATHS = new Set(['/', '/index.html', '/reset.html', '/manifest.webmanifest', '/sw.js', '/version.json'])

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    const headers = new Headers(response.headers)
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value)
    const { pathname } = new URL(request.url)
    const isAppShell = NO_STORE_PATHS.has(pathname) || (headers.get('Content-Type') || '').startsWith('text/html')
    if (isAppShell) headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  },
}
