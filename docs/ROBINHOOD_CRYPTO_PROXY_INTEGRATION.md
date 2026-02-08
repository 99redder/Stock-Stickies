# Robinhood Crypto API Proxy Integration (Placeholder)

Last Updated: 2026-02-07

## Scope

- Robinhood **Crypto-only** integration section under Portfolio side panel.
- Proxy-backed architecture (same pattern as IBKR): frontend never signs requests directly.

## Frontend Contract (placeholder)

Endpoint:

- `POST /api/robinhood/crypto/holdings`

Request body:

```json
{
  "apiKeyId": "<optional-placeholder>"
}
```

Headers:

- `Content-Type: application/json`
- `x-api-key: <optional proxy key>`

Response accepted by frontend:

- Array of holdings, or
- Object with `holdings` array.

## Notes from Robinhood docs

- Crypto trading API uses API credentials and request signing.
- Backend should own signing logic and private key material.
- This implementation is placeholders only (UI + proxy contract) until your credentials are ready.

## Production Requirements

1. Store Robinhood private key server-side only.
2. Sign each outbound request server-side per Robinhood requirements.
3. Add per-user authorization and allowlists.
4. Add retries + rate limit handling + audit logs.
5. Avoid exposing Robinhood secrets to browser/local storage.
