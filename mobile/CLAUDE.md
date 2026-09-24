# Stock Stickies Mobile — Agent Guide

> `mobile/AGENTS.md` mirrors this file for Codex (which runs the Sites releases). Keep the
> two in sync — change both in the same commit.

The read-only mobile companion PWA at **https://mobile.stockstickies.com**. This file covers
what you need when working in `mobile/`. The root `claude.md` ("Mobile Companion
Architecture" and everything it links to) is the full reference — read it for cash/CSP
rules, cost basis, YTD reconciliation, and the Worker details.

## Ground rules

- This is **not** a responsive build of desktop. Never move mobile UI into `src/App.jsx`,
  never deploy the root `dist/` to the mobile domain, and never assume a root build
  contains mobile changes.
- **Read-only.** Mobile never writes to Firestore (no portfolio edits, no derived balances,
  no Plaid quantities written back). Desktop is the editing surface.
- **No allocation donut or treemap** on mobile. Composition percentages stay neutral;
  red/green is reserved for gain/loss. Cost-basis gain/loss is always **Unrealized P&L**,
  and **2026 YTD** is a separate cash-flow-adjusted measure — never relabel one as the other.
- Current dark design, `app-icon-v2` icons (normal + maskable), build label inside the
  Profile modal (keep all existing profile fields). Cash & Collateral starts collapsed →
  per-account totals → components.

## Who sees what

Mobile is open to **every** Stock Stickies account.

| | Owner (`OWNER_UID`) | Everyone else |
|---|---|---|
| Positions | Notes, with share counts from live Plaid holdings when matched | Their notes and `note.shares` |
| Prices | Finnhub (+ Plaid prices for crypto) | Their own Finnhub key |
| Accounts | Fixed Individual / Traditional IRA / Roth IRA | Accounts they named on desktop (`customAccounts` / `accountSetup`), or one "Portfolio" |
| Plaid balances, YTD, Share YTD | ✓ | — (the brokerage fetch is skipped entirely) |
| Ask K | Unlimited | 5 questions / UTC day |

Implementation notes (`src/App.jsx`):

- `OWNER_UID` gates the `rentals-api` brokerage fetch, the YTD line, and **Share YTD**. The
  Worker also rejects non-owners server-side — the client check only avoids a pointless call.
- Account helpers (`ACCOUNTS`, `ACCOUNT_IDS`, `getAccount`, `getAccountLabel`,
  `getPutAccount`, `cashAccountIds`) live **inside `App`** and are memoized; module level
  only has `BUILTIN_ACCOUNTS` and the sanitizers. Same rules as desktop: owner → built-ins;
  a chosen setup → `customAccounts` or none; not yet chosen → built-ins only if notes already
  use built-in ids, otherwise none.
- With accounts off (`accountsEnabled === false`): no account chips, labels read
  "Portfolio", everything sits in the implicit `unassigned` bucket, and put collateral counts
  toward the balance.
- Owner-only legacy rules stay owner-only: a `USD` note without an account belongs to
  `individual`, and account-less puts belong to `roth`.
- New users get guidance, not errors: no Firestore doc → "set up at stockstickies.com on a
  computer"; no Finnhub key → a hint under the Update button; no positions → an empty-state
  pointer to the desktop site.

## Services

- **Ask K** — `https://stock-stickies-askk.99redder.workers.dev/api/ask-k` with
  `Authorization: Bearer <Firebase ID token>`. The Worker requires the token (401 without
  it), caps non-owners, and only sees the portfolio sent with the question. Builds ≤ 38 sent
  no token.
- **Brokerage** (owner only) — `https://rentals-api.99redder.workers.dev/api/stock-stickies/plaid/holdings`,
  also token-authenticated and owner-verified server-side. Its response includes
  `performance` (YTD, per-scope `risk` stats, `benchmark` SPY YTD).
- Both URLs carry `client=mobile-build-9` — a client-contract marker, not the visible build
  number. Leave it unless the API contract changes.
- Firebase web config and reCAPTCHA have **source fallbacks** in `App.jsx` because Vite
  inlines `VITE_*` at build time; don't remove them.

## YTD share card

`src/ytdShareCard.js` is the single source (desktop re-exports it). It renders the 1600×900
card with YTD gain/percent, the S&P comparison from `performance.benchmark.ytdReturnPercent`
(hidden if absent), and neutral **Sharpe / Max drawdown / Beta vs SPY** tiles from the
scope's `risk` block with a "From daily closes · <first> – <last>" caption. Owner-only on
mobile.

## Releasing

Current visible release: **Build 39** (released 2026-09-23 via Sites from commit
`91e207d`; verified `version.json` and the live asset hash).

1. Increment all three build markers together: `APP_BUILD` in `src/main.jsx`, `build` in
   `public/version.json`, and the "Build N" label in the Profile modal (`src/App.jsx`).
2. Review the service-worker cache name in `public/sw.js` only if shell caching changed
   (it is still `stock-stickies-mobile-v38`; names must keep the `stock-stickies-mobile-`
   prefix). Keep `public/_headers` no-cache rules and `reset.html`.
3. `npm run build` **from `mobile/`**; confirm `dist/.openai/hosting.json` still contains
   `appgprj_6a64e76c7c4081919d6a6ae6fa349d49`.
4. Commit and push the exact source state to `main`.
5. Release with the **Sites** build → save version (with that commit SHA) → deploy workflow
   to the existing project. Claude Code has no Sites tool — this is done from Codex. Never
   create a second site or invent a project id. A GitHub push alone releases only desktop.
6. Verify `https://mobile.stockstickies.com/version.json?checked=<timestamp>` returns the new
   build, then check an installed iPhone PWA updates without reinstalling
   (`/reset.html` is the last-resort recovery).

## Legacy repo

The GitHub repo `99redder/stock-stickies-mobile` (last commit Jul 25, 2026; **archived**,
read-only, on 2026-09-24) is an **old standalone copy** that predates this `mobile/` folder — it still has the removed allocation
donut and no Sites project id. Its local checkout (`~/Websites/Stock-Stickies-Mobile`) was
removed on 2026-09-24. Don't clone, edit, or release from it; `mobile/` is the only source.
