const ASKK_UPSTREAM_URL = 'https://stock-stickies-askk.99redder.workers.dev/api/ask-k'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/ask-k') {
      if (request.method !== 'POST') {
        return Response.json({ ok: false, error: 'Method not allowed' }, {
          status: 405,
          headers: { Allow: 'POST' },
        })
      }

      const headers = new Headers(request.headers)
      // The upstream endpoint has browser-origin restrictions. This is a
      // trusted server-to-server hop, so do not forward the mobile Sites origin.
      headers.delete('origin')
      headers.delete('referer')

      try {
        const response = await fetch(ASKK_UPSTREAM_URL, {
          method: 'POST',
          headers,
          body: await request.arrayBuffer(),
          redirect: 'follow',
        })
        const responseHeaders = new Headers(response.headers)
        responseHeaders.set('Cache-Control', 'no-store')
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        })
      } catch {
        return Response.json({
          ok: false,
          error: 'Ask K is temporarily unavailable. Please try again.',
        }, {
          status: 502,
          headers: { 'Cache-Control': 'no-store' },
        })
      }
    }

    return env.ASSETS.fetch(request)
  },
}
