// Last Updated: 2026-02-07
// Example Robinhood Crypto proxy endpoint for Stock Stickies (placeholder)
// DO NOT use in production without proper auth/session/signing hardening.

import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8788;
const STOCK_STICKIES_PROXY_KEY = process.env.STOCK_STICKIES_PROXY_KEY || '';
const RH_CRYPTO_BASE_URL = process.env.RH_CRYPTO_BASE_URL || 'https://trading.robinhood.com';
const RH_API_KEY_ID = process.env.RH_API_KEY_ID || '';
const RH_PRIVATE_KEY = process.env.RH_PRIVATE_KEY || ''; // placeholder: server-side signing key

function requireProxyKey(req, res, next) {
  if (!STOCK_STICKIES_PROXY_KEY) return next();
  const provided = req.header('x-api-key');
  if (!provided || provided !== STOCK_STICKIES_PROXY_KEY) {
    return res.status(401).json({ error: 'Unauthorized proxy key' });
  }
  return next();
}

// Placeholder signer. Replace with real Robinhood signing logic.
function buildSignedHeaders(path, method = 'GET') {
  // TODO: implement required Robinhood signature headers using RH_PRIVATE_KEY
  return {
    'Content-Type': 'application/json',
    'x-rh-api-key-id': RH_API_KEY_ID,
    'x-rh-signature': 'PLACEHOLDER_SIGNATURE',
    'x-rh-timestamp': String(Date.now())
  };
}

app.post('/api/robinhood/crypto/holdings', requireProxyKey, async (req, res) => {
  try {
    if (!RH_API_KEY_ID || !RH_PRIVATE_KEY) {
      return res.status(500).json({
        error: 'Server missing RH_API_KEY_ID or RH_PRIVATE_KEY for Robinhood signing.'
      });
    }

    // Placeholder route. Update path to exact holdings endpoint once credentials are active.
    const path = '/api/v1/crypto/trading/holdings/';
    const url = `${RH_CRYPTO_BASE_URL}${path}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: buildSignedHeaders(path, 'GET')
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    return res.status(response.status).json(payload);
  } catch (err) {
    console.error('Robinhood crypto proxy error:', err);
    return res.status(500).json({ error: 'Proxy request failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Robinhood crypto proxy example listening on :${PORT}`);
});
