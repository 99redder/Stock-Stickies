# IBKR Proxy Integration (Stock Stickies)

Last Updated: 2026-02-07

## Goal

Move IBKR communication off the browser and into a backend proxy so IBKR session/cookie handling is server-side.

## Current Frontend Contract

Frontend calls:

- `POST /api/ibkr/portfolio/positions`

Request body:

```json
{
  "accountId": "U1234567",
  "pageId": 0
}
```

Headers:

- `Content-Type: application/json`
- `x-api-key: <optional proxy key>`

Expected response:

- JSON array of positions **or** object with `positions` array.

## Production Notes

1. Keep browser token-free:
   - Frontend should never send IBKR session tokens; backend owns session state.
2. Server should own:
   - login/session establishment,
   - `/tickle` keepalive,
   - cookie lifecycle + refresh.
3. Add endpoint hardening:
   - authn/authz for user identity,
   - per-user account allowlist,
   - rate limits + audit logs.
4. Add retries/backoff for IBKR `429` / transient failures.

## Example Server

See: `examples/ibkr-proxy-server.js` (placeholder only).
