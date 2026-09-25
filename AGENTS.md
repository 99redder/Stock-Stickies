# Stock Stickies — Project Context

> Mirror of the root `claude.md` for Codex and other AGENTS.md-aware agents, and
> `mobile/AGENTS.md` / `mobile/CLAUDE.md` summarize the mobile app. Keep each mirror in
> sync — change both files in the same commit.

## Overview
Stock Stickies has **two separate React applications in this repository**:

1. The full desktop application at `https://stockstickies.com` (and `https://www.stockstickies.com`). It owns note editing, portfolio management, categories, settings, and Firestore writes.
2. The read-only mobile companion PWA at `https://mobile.stockstickies.com`. It has its own source tree, build, hosting project, service worker, manifest, layout, and release number.

Both apps authenticate against the same Firebase project and read the same `users/{uid}` Firestore document. The mobile app also calls separate Cloudflare Workers for brokerage/Plaid data and Ask K. A desktop deployment does **not** deploy mobile, and a mobile deployment does **not** deploy desktop.

The platform is open to anyone who signs up ("bring your own API keys"). One account — the
**owner** (Firebase UID `tQ4KeGwCjsb5CSbrFwmWYWX3BvI2`) — additionally has Plaid/Robinhood
brokerage features and a fixed three-account setup. See **Owner vs. Regular Accounts**.

---

## Tech Stack
| Layer | Desktop | Mobile |
|---|---|
| Frontend | React 19 | React 19 |
| Build | Vite 7 | Vite 7 + Cloudflare/Sites plugins |
| Styling | Tailwind CSS v4 | Purpose-built CSS in `mobile/src/styles.css` |
| Auth/data | Firebase Auth + Firestore | Same Firebase Auth + read-only Firestore subscription |
| Hosting | Cloudflare Pages (`stock-stickies`); GitHub Pages is a manual fallback | OpenAI Sites custom domain |
| Brokerage | Portfolio notes plus Finnhub pricing (owner: plus Plaid sync) | Notes + user's Finnhub key; owner also gets Plaid/Robinhood data via `rentals-api` |
| AI | Ask K portfolio context | Ask K Worker (Firebase sign-in required; non-owners capped per day) |
| PWA | No | Manifest, service worker, installable Home Screen app |

Shared services include Firebase v12, Firebase App Check/reCAPTCHA v3, Finnhub, MarketAux, and Cloudflare Workers. Desktop also uses Chart.js and `html2canvas-pro`.

---

## File Structure
```
Sticky-Notes/
├── index.html                         # Vite entry point — SEO meta tags, JSON-LD schema live here
├── vite.config.js                     # Vite config (react + tailwindcss plugins)
├── package.json                       # npm scripts: dev, build, lint, preview
├── eslint.config.js
├── claude.md / AGENTS.md              # This project/agent reference (mirrored)
├── ENCRYPTION_IMPLEMENTATION.md
├── SECURITY_RECOMMENDATIONS.md
├── CNAME                              # www.stockstickies.com (copied into dist/ on deploy)
├── wrangler.jsonc                     # Cloudflare Pages project config (desktop)
├── .github/workflows/deploy.yml       # Manual-only fallback GitHub Pages workflow
├── functions/api/                     # Cloudflare Pages Functions (public, no auth):
│   ├── news/breaking.js               #   breaking-news feed for the Live Dashboard
│   ├── treasury/dgs30.js              #   30-year Treasury yield (DGS30 widget)
│   └── quotes.js                      #   batch quotes for non-streaming dashboard widgets
├── worker/                            # Ask K Worker (stock-stickies-askk) — deploy with
│   ├── wrangler.toml                  #   `npx wrangler deploy --config wrangler.toml` from worker/
│   └── src/index.js                   #   (plain `wrangler` there picks up the Pages config)
├── public/
│   ├── robots.txt                     # SEO: allow all, link to sitemap
│   ├── sitemap.xml                    # SEO: canonical URL for the SPA
│   └── assets/
│       ├── stock-stickies-favicon.svg
│       ├── stock-stickies-google-cloud-logo-1024.png   # OG image
│       └── stock-stickies-google-cloud-logo-512.png
├── src/
│   ├── main.jsx                       # React root render (ReactDOM.createRoot)
│   ├── App.jsx                        # Main application (~7,900 lines) — see map below
│   ├── App.css
│   ├── index.css
│   ├── utils/
│   │   ├── ytdShareCard.js            # Re-exports mobile/src/ytdShareCard.js
│   │   └── finnhubQuoteCache.js       # In-memory quote cache / request de-dup
│   └── components/
│       ├── NoteCard.jsx               # Draggable note card component
│       ├── OnboardingWalkthrough.jsx  # First-run walkthrough + Manage accounts modal
│       ├── FinnhubDiagnosticDashboard.jsx (+ .css)  # Live Dashboard (all users, desktop only)
│       ├── AskK.jsx                   # Ask K chat panel
│       └── RobinhoodSync.jsx          # Plaid "Update positions" (owner only)
├── assets/                            # Mirror of public/assets (keep in sync)
└── mobile/                            # Separate mobile companion application
    ├── CLAUDE.md / AGENTS.md          # Mobile agent guide (mirrored)
    ├── .openai/hosting.json           # Existing Sites project identity; never replace/invent
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── wrangler.jsonc
    ├── build/sites-vite-plugin.js     # Copies hosting metadata into the build
    ├── worker/index.js                # Static asset Worker entry
    ├── src/
    │   ├── main.jsx                   # PWA registration and version-update checks
    │   ├── App.jsx                    # Mobile UI, auth, Firestore, brokerage, Ask K
    │   └── styles.css                 # Mobile-only design system/layout
    └── public/
        ├── manifest.webmanifest
        ├── sw.js
        ├── version.json
        ├── reset.html
        ├── _headers
        └── stock-stickies-app-icon-v2-*.png
```

### Desktop Build and Deployment

```bash
npm ci
npm run dev
npm run build      # Produces root dist/
npm run preview
```

Production desktop is **Cloudflare Pages** (project `stock-stickies`, config in
`wrangler.jsonc`). Pushing `main` triggers the Pages git-integration build, which can lag. For
an immediate, deterministic deploy after committing:

```bash
npm run build
cp CNAME dist/CNAME
npx wrangler pages deploy dist --project-name stock-stickies --branch main --commit-dirty=true
```

(`npm run deploy:cloudflare` builds and runs the same Wrangler Direct Upload, but does not
copy `CNAME` into `dist/`; deploys never depend on GitHub Actions.)

Verify by comparing the live bundle hash (`curl -s https://www.stockstickies.com/ | grep -o
'index-[^"]*\.js'`) with `dist/index.html`. Build from **committed** code only — stash any
uncommitted work before `npm run build`, or it ships. `wrangler pages deploy` also bundles
`functions/`. `.github/workflows/deploy.yml` (GitHub Pages) is a `workflow_dispatch`-only
fallback. Neither path deploys `mobile/`.

### Mobile Build and Deployment

Run mobile commands from `mobile/`, not the repository root:

```bash
cd mobile
npm ci
npm run dev
npm run build
npm run preview
```

The mobile build produces a Sites/Worker-compatible artifact under `mobile/dist/`, including the client assets, server entry, and copied `.openai/hosting.json`.

Because `mobile/.openai/hosting.json` exists, mobile must be released with the **Sites build/save/deploy workflow**. Always reuse the opaque `project_id` in that file. Never create a second site or substitute a guessed ID. Push the exact source state first, package that same commit, save a version using that commit SHA, then deploy the saved version. A GitHub push alone only releases desktop.

The intended production address is always `https://mobile.stockstickies.com`. The Sites provider URL may also work, but it is not the user-facing install URL.

---

## src/App.jsx — Navigation Map (~3840 lines)

**This is a single-file React component.** All logic, state, hooks, and JSX live in `StickyNotesApp` plus top-level helpers.

> The line numbers in this map date from the ~3,840-line version; the file is now ~7,900
> lines. Treat them as ordering hints and search by name (`grep -n`) before editing.

### Top-level constants & utilities (Lines 1–329)
| Lines | What |
|---|---|
| 1–9 | Imports (React, Firebase, Chart.js, html2canvas, NoteCard) |
| 11–39 | Firebase init (firebaseConfig, appCheck, db, auth) |
| 41–67 | SVG icon components (Plus, X, Edit2, Check, LogOut, Moon, Sun, etc.) |
| 68–99 | Constants: `DEFAULT_COLOR_LABELS`, `DEFAULT_COLORS`, `AVAILABLE_COLORS`, `MIN/MAX_CATEGORIES`, validation limits |
| 100–169 | Validation & sanitization functions: `validateTicker`, `sanitizeTicker`, `validateApiKey`, `validateContent`, `validateNickname`, `sanitizeContent` |
| 161–329 | Utility functions: `buildApiUrl`, `sleep`, `fetchWithRetry`, stock/news fetch helpers |

### StickyNotesApp component (Line 330–3838)

#### State declarations (Lines 331–425)
| Lines | State |
|---|---|
| 331–340 | Auth/UI: `currentUser`, `loginUsername`, `loginPassword`, `isSignup`, `loginError`, `darkMode`, `isResettingPassword`, `resetSuccess`, `legalView`, `syncStatus` |
| 341–343 | Refs: `isSavingRef`, `isLoadingRef`, `saveTimeoutRef` |
| 344–350 | Notes & categories: `notes`, `nextId`, `colorLabels`, `editingLabel`, `tempLabel`, `collapsedCategories`, `categories` |
| 351–357 | Category modals: `showAddCategoryModal`, `newCategoryLabel`, `newCategoryColor`, `categoryToDelete`, `reassignTarget`, `editingCategoryColor` |
| 358–364 | Expanded note / stock: `expandedNote`, `stockData`, `stockLoading`, `stockError`, `finnhubApiKey`, `showApiKeySuccess` |
| 364–425 | Watch list, UI prefs, profile, portfolio, tabs, sort/group, privacy mode |

#### Critical Refs (Race Condition Guards)
| Ref | Line | Purpose |
|---|---|---|
| `isSavingRef` | 341 | Blocks Firestore onSnapshot from overwriting during a save |
| `isLoadingRef` | 342 | Prevents orphan/label repair from running during initial data load |
| `isChangingColorRef` | 1140 | Prevents orphan repair from misfiring during category color change |

#### useEffects — in order of declaration
| Lines | Effect |
|---|---|
| 372–428 | Dark mode sync to `<html>` element; body background class |
| 429–448 | Various UI cleanup effects (help modals, outside-click handlers) |
| 449–468 | Another outside-click / Escape handler |
| 469–484 | Login help modal outside-click / Escape |
| 487–501 | Firebase Auth state listener (`onAuthStateChanged`) |
| 503–570 | **Firestore onSnapshot** — loads data on login; categories FIRST then notes; sets `isLoadingRef`; 200ms delay to clear |
| 571–641 | **Auto-save** — debounced 2s Firestore write triggered by all data changes |
| 643–698 | `beforeunload` save — writes to Firestore before page close |
| 1183–1325 | Stock data fetching when `expandedNote` changes |
| 1326–1342 | **Orphan repair** — moves notes with missing category to first category; skips if `isChangingColorRef` or `isLoadingRef` |
| 1343–1357 | **Missing label repair** — resets blank category labels to "Category"; skips if `isLoadingRef` |
| 1358–1493 | Watch list quote fetching; news fetching |
| 1494–1617 | Various UI effects (portfolio card screenshot, etc.) |
| 1617–1726 | **Portfolio price fetching** — updates at 9:35 AM, 1:00 PM, 4:05 PM EST; 8-hour cache |
| 1727–1751 | Additional portfolio computed data effects |
| 1752+ | Remaining cleanup/sync effects |

#### Core functions
| Lines | Function | Notes |
|---|---|---|
| 700–824 | `handleLogin` | Firebase email/password auth; also handles signup & password reset |
| 825–897+ | `syncNow` | Awaited Firestore write; called by auto-save, beforeunload, and logout |
| 1067–1082 | `handleLogout` | Awaits `syncNow`; resets `isSavingRef`/`isLoadingRef`/`saveTimeoutRef`; signs out |
| 1085–1088 | `classifyNote` | Sets `note.color` and `note.classified = true` |
| 1089–1093 | `deleteNote` | Filters note from state |
| 1095–1094 | Category management — see table below |

#### Category management (Lines ~1095–1182)
| Function | Purpose |
|---|---|
| `getAvailableColors()` | Colors not currently assigned to a category |
| `getNotesCountForCategory(color)` | Count of notes for a given category color |
| `addCategory(color, label)` | Push new category; max 10 |
| `handleDeleteCategory(color)` | If notes exist, open reassign modal; else delete immediately |
| `confirmDeleteCategory()` | Execute deletion after reassignment confirmed |
| `changeCategoryColor(oldColor, newColor)` | Sets `isChangingColorRef`; updates categories + notes; clears flag after 100ms |

#### UI / JSX layout (Lines ~1752–3838)
| Lines | UI Block |
|---|---|
| ~1887–1944 | Login help modal |
| ~1945–2075 | Legal modals (Privacy Policy, Terms of Use) — login page copy |
| ~2077–2115 | **Login page** (form, signup toggle, password reset, Eastern Shore AI credit, Privacy/Terms) |
| ~2381–2460 | Legal modals — main app copy |
| ~2461–2600 | **Expanded note modal** (stock data, shares input, chart, news) |
| ~2900–2990 | Add Category modal |
| ~2990–3020 | Reassign Notes modal (shown when deleting a category with notes) |
| ~3100–3200 | Main toolbar (tab switcher, sort/group controls, portfolio download button) |
| ~3280–3310 | Header area (logout, dark mode toggle, user info) |
| ~3400–3690 | **Notes grid** — category sections with notes, legend panel |
| ~3700–3818 | **Watch List panel** (sidebar) |
| ~3823–3834 | **Footer** (copyright, Privacy/Terms buttons, Eastern Shore AI credit) |

---

## Key Features
1. **Sticky Notes** — Create, edit, delete notes; each note has a ticker symbol (1–5 chars) and optional share count
2. **Categories** — Up to 10 color-coded categories (add, delete, rename, recolor); minimum 1
3. **Portfolio View** — Donut/treemap of holdings with real-time prices; updates 3× daily at 9:35 AM, 1:00 PM, 4:05 PM EST; 8-hour cache. A `sector` view mode groups holdings by **user-defined sector buckets** (see Custom sector buckets)
4. **Stock Data** — Live quotes, fundamentals, 52-week range, earnings dates (Finnhub API)
5. **News Feed** — Per-ticker news from MarketAux API
6. **Watch List** — Track tickers without creating notes
7. **Dark Mode** — Toggle; synced to `<html>` class and `localStorage`
8. **Cloud Sync** — Firestore real-time sync with offline support; sync status indicator in UI
9. **Shares Privacy Mode** — Toggle to hide share counts from view
10. **Live Dashboard** — Streaming Finnhub quote widgets in themed groups (all users, desktop only)
11. **Onboarding walkthrough** — Keys + accounts setup on first sign-in (see below)
12. **Ask K** — AI portfolio assistant (all users; owner unlimited, others capped per day)
13. **User-named accounts** — or one combined portfolio (owner keeps a fixed set)

---

## Backups and Retention

Every save path writes a full copy of the user document to `users/{uid}/snapshots` (autosave
at most once per 10 minutes per session when notes/categories changed; `manual-sync` and
`pre-plaid-apply` on each **Update positions**; on restore, `pre-restore` (the state being
replaced, so a restore can be undone) and `restore-backup` (the restored state)). The
**Backups** button in the header (next to **User Guide**) opens a modal that lists the newest 60 (scrollable) with note/text counts, categories in use, and whether
the Finnhub key, nickname, and photo are present, so a full backup can be told apart from a
partial one.

`src/utils/backupRetention.js` (`selectBackupsToPrune`, tests in
`backupRetention.test.mjs`, run with `npm test`) prunes conservatively: never the newest 30;
everything from the last 14 days; the newest per local day for 90 days; the newest per
week for a year; `restore-backup` / `pre-restore` backups for 90 days; nothing older than
a year. A
background effect runs it at most once a week per user (localStorage
`stock-stickies-backup-prune-{uid}`), 30s after load, fetching only backups older than 14 days
plus the newest 30, and deletes in batches of 20 (halving on "Transaction too big" — each
delete also removes every index entry of these large documents, so batches of 400 were
rejected). The Backups window has a **Clean up old backups** button that runs the same
`runBackupCleanup` on demand and shows progress, the result, or the exact error.

The background run happens automatically — users never need the button. A run is recorded
only after it succeeds, so a failed run retries on the next page load (errors go to the
console as `Backup cleanup skipped:`). The once-a-week marker is per browser, so a second
device may run it again in the same week and simply find nothing to remove. The first real
run (Sep 24, 2026) took the owner from 1,029 backups to 194 — 838 removed, matching the
dry run — and kept the Sep 23 backup used for the restore.

### Inspecting backups outside the app (recovery runbook)

When the app itself is the problem, read Firestore directly with the Firebase CLI's existing
login (`firebase login`; project `red-s-stickies`). A small Node script can reuse that login
via `require('<global node_modules>/firebase-tools/lib/auth.js')` →
`getGlobalDefaultAccount()` → `getAccessToken(account.tokens.refresh_token, [])`, then call
the Firestore REST API with `Authorization: Bearer <token>`:

- List backups cheaply:
  `GET …/documents/users/{uid}/snapshots?pageSize=300&mask.fieldPaths=backupCreatedAt&mask.fieldPaths=backupReason`
- Inspect one backup (or the live doc) and summarize notes, text, category colors, watch
  list, key/nickname/photo presence. A **complete** backup has the usual note count, several
  categories, a watch list, and the key/nickname/photo; a wiped state shows 0 notes, and a
  post-wipe **Update positions** re-import shows notes all in the first category with no
  text or watch list.
- API keys can be checked by decrypting with the same derivation the app uses
  (PBKDF2 of `uid + '|StockStickies|2024'`, salt `StockStickiesSalt2024`, 100k iterations,
  SHA-256 → AES-256-GCM) to compare two copies — never print the key.

Keep these scripts read-only; do restores through the app's **Backups** window, which backs
up the replaced state first.

---

## Owner vs. Regular Accounts

`OWNER_FIREBASE_UID` (desktop `src/App.jsx`), `OWNER_UID` (mobile), `STOCK_STICKIES_OWNER_UID`
(`rentals-api`), and `OWNER_UID` (Ask K Worker) all hold the owner's Firebase UID.

| Feature | Owner | Everyone else |
|---|---|---|
| Notes, categories, portfolio, watch list, sectors, CSP tracking | ✓ | ✓ |
| Live Dashboard (desktop only) | ✓ | ✓ |
| Ask K | Unlimited | 5 questions / UTC day |
| Accounts | Fixed Individual / Traditional IRA / Roth IRA | Own named accounts, or none |
| Robinhood sync (Plaid), cost basis, YTD, risk stats, Share YTD | ✓ | — |
| Mobile app | Full, including brokerage data | Notes + Finnhub prices, own accounts |

Client-side checks (`isOwnerPortfolioUser` / `isOwnerAccount`, mobile `isOwner`) only hide UI.
**Real enforcement is server-side**:

- `rentals-api` `/api/stock-stickies/*` — `verifyStockStickiesOwner` verifies the Firebase ID
  token (RS256 signature against Google's keys, `aud`, `iss`, `exp`, `iat`) **and** requires
  `sub === STOCK_STICKIES_OWNER_UID` before any route runs. Other `rentals-api` routes use a
  separate admin-password session or a secret token.
- Ask K Worker — verifies the Firebase ID token on every request; owner is unlimited.

Owner-specific *content* must also stay owner-only: account strategy text
(`getAccountStrategy(id, isOwner)` returns `strategy` for the owner, neutral
`generalStrategy` for others — used in the Ask K payload, portfolio export, and tooltips) and
the Ask K `OWNER_ACCOUNT_CONTEXT` prompt. Never put the owner's strategy, numbers, or setup
into anything another user's client or prompt receives.

---

## Note Object Structure
```javascript
{
  id: number,            // Unique identifier (auto-increment)
  title: string,         // Ticker symbol — 1–5 alphanumerics, plus an optional
                         // .CLASS suffix for class shares (MOG.A, BRK.B)
  text: string,          // Note content — up to 10,000 chars
  color: string,         // Tailwind bg class (e.g., 'bg-blue-200')
  classified: boolean,   // true if note has been assigned to a category
  shares?: number,       // Optional share count for portfolio tracking
  account?: string       // Account id: owner 'individual' | 'traditional' | 'roth';
                         // other users 'acct-…' ids from customAccounts (or a built-in id
                         // on legacy notes). Missing/unknown → treated as 'unassigned'
}
```

---

## Brokerage Accounts

### Owner: fixed built-in accounts
The owner's positions use three fixed accounts (`BUILTIN_ACCOUNTS` in `src/App.jsx`), each
with its own investing intent. Plaid sync and `rentals-api` map to these exact ids, so they
are a permanent one-off: the owner is never asked about accounts, and the custom-account
fields are never written to the owner's document.

| id | Label | Intent |
|---|---|---|
| `individual` | Individual | Taxable brokerage — swing trades, shorter horizon |
| `traditional` | Traditional IRA | Long-term buy-and-hold core of quality names |
| `roth` | Roth IRA | Speculative "moon shot" names and most cash secured puts — tax-free growth upside |

### Everyone else: user-named accounts, or none
The onboarding walkthrough asks "How do you keep your investments?":

- **All in one place** → `accountSetup.mode = 'single'`. `ACCOUNTS` is empty and
  `accountsEnabled` is false: account pickers, pills, portfolio account chips, the
  "Portfolio" (by-account) grouping button, the export's account column, and Ask K's account
  fields are all hidden. `shownNotesGroupMode` falls back to category grouping without
  overwriting the saved `notesGroupMode`.
- **In separate accounts** → `mode = 'multiple'`; the user names up to 8 accounts (quick-add
  suggestions or custom, ≤30 chars) stored in `customAccounts` as `{ id: 'acct-…', label }`.

Persisted fields (non-owner only, via `accountFieldsForSave`): `customAccounts`
(`sanitizeUserAccounts`) and `accountSetup` = `{ mode, completedAt }`
(`sanitizeAccountSetup`). They are wired into every persistence path like `sectorAssignments`
(onSnapshot load, autosave, `beforeunload`, `syncNow`, backup restore, logout reset).
`saveUserDoc` writes with `merge: false`, so non-owner save objects must always include both.

Effective accounts are computed inside the component (`ACCOUNTS`, `ACCOUNT_IDS`,
`getNoteAccount`, `getAccountLabel`, `getPutAccount` are memoized there, not module-level):
owner → built-ins; chosen setup → `customAccounts` or none; not yet chosen → built-ins only if
the user's notes already use built-in ids (legacy), otherwise none. **Manage accounts** on
the Notes tab reopens the question. Nothing is destructive: switching to one portfolio keeps
account names and each note's `account` (switching back restores them), and removing an
account just shows its notes as Unassigned.

Notes created before accounts existed have no `account` field and fall into an
**Unassigned** bucket rather than defaulting into a real account.

The Portfolio tab shows a composite view by default; account filter chips (with per-account
market value and position count) switch the donut/map/legend to a single account, and all
percentages recompute relative to the set being shown. The `Unassigned` chip only appears
while unassigned positions exist. Account selection lives on the note card and in the
expanded-note modal, next to the shares input.

The Notes tab groups by account **by default** (`notesGroupMode: 'account'`, alongside
`'category'` and `'size'`). Each account renders as a collapsible section — collapse state
lives in `collapsedAccounts` and is persisted to Firestore, mirroring `collapsedCategories`.
Ordering is always by market value — there is no sort toggle. Account sections stack
biggest-first (`accountSectionOrder`) and positions sort by value within each section
(`sortedClassifiedNotes`). Positions rank above non-positions, and priced positions above
unpriced ones, so a missing quote sinks a note instead of pinning it at value 0. Unassigned
is pinned last regardless of its value. Real accounts always render a header even when
empty, so a note can be moved into one; the Unassigned section only appears while something
is in it. Unclassified notes render in their own banner section above the groups,
independent of group mode.

### Cash handling
Cash lives in a different form per account: actual dollars (ticker `USD`) in the taxable
individual account, `SGOV` in both IRAs. `CASH_EQUIVALENT_TICKERS` lists these, and
`isCashHolding` — the single predicate used by the donut, the treemap, and
`cashPortfolioValue` — counts a holding as cash if it sits in a category labelled "Cash"
**or** carries a cash-equivalent ticker. The combined pie therefore shows one Cash slice
rather than one per account; filtering to a single account narrows it to that account's
cash. SGOV keeps its real Finnhub price, so only the grouping changes, never the value.
The Ask K prompt describes the same arrangement.

### Portfolio export
`buildPortfolioExport()` renders the **current** Portfolio view as Markdown and
`handleCopyPortfolio()` puts it on the clipboard (async Clipboard API, with a hidden
textarea + `execCommand` fallback). It follows the account filter exactly like the donut
does, and emits: totals (market value, cash, CSP obligation, share of the combined
portfolio when scoped), a per-account table with each account's intent (composite view
only), a **Sector allocation** table (custom buckets — see below), a positions table, a CSP
table, and each position's note text. Intended for pasting into an outside LLM. It exports
real dollar figures even while `hidePortfolioValues` is blurring the screen — the copy is a
deliberate action, and the numbers are the point.

### Custom sector buckets
The Portfolio card's view toggle has three modes: `donut` (per-ticker), `sector`, and `map`
(`portfolioViewMode`). The **Sector** view groups holdings into **user-defined** buckets —
*not* GICS/Finnhub industries (an earlier auto-GICS version was replaced). The starter set
is `DEFAULT_SECTOR_THEMES` = Energy, Utilities, Pharma, AI trade, Defense, Financials,
China, Cloud.

Two pieces of state drive it, both persisted to the Firestore user doc alongside
`categories`:

- `sectorThemes` — the ordered, editable list of bucket names.
- `sectorAssignments` — a `ticker -> sector name` map (assignment is **per company**, so a
  ticker held in several accounts is assigned once).

`resolveSector(holding)` is the single grouping predicate: a cash holding (`isCashHolding`)
always maps to the implicit **Cash** bucket; otherwise it uses the ticker's assignment, but
only if that sector still exists in `sectorThemes` — a stale assignment to a deleted sector
falls back to the implicit **Uncategorized** bucket. `Cash` and `Uncategorized` are implicit
and must never be stored in `sectorThemes` (the sanitizer strips them). `portfolioBySector`
sums values per bucket and follows the account filter exactly like `portfolioData`, so a
single-account view breaks that account down by sector. Cash and Uncategorized always sort
to the bottom.

Assignment is **manual** and lives **inline in the Sector view** (no note-card UI): a
per-ticker dropdown (`assignSector`), removable sector chips + an "Add a sector…" input
(`addSectorTheme` / `removeSectorTheme`), and an "N holdings not yet assigned"
(`unassignedSectorCount`) hint. The secondary donut is its own Chart.js instance
(`sectorChartRef` / `sectorChartInstance`), separate from the primary per-ticker chart.

`sectorThemes` and `sectorAssignments` are wired into every persistence path —
`onSnapshot` load (via `sanitizeSectorThemes` / `sanitizeSectorAssignments`), the debounced
autosave, the `beforeunload` save, `syncNow`, `restoreBackupSnapshot`, and the logout reset.
When adding another persisted field, mirror this exact set of touch points to avoid the
documented save/load races. This feature is **desktop-only**; mobile has no sector view.

### Duplicate positions
A ticker may be held in several accounts (SGOV sits in both IRAs) but only once **within**
one account — two notes for the same holding would double-count it in that account's value
and percentages. `duplicateNoteIds` flags every note currently colliding (both sides, so
either can be fixed) and the card and expanded modal show a red "Duplicate" banner.
`updateNoteAccount` **refuses** a move that would create a collision and returns `false`;
callers must not apply their own optimistic update without checking it. Ticker collisions
are warned about on **blur**, not per keystroke — every partial ticker on the way to the
real one would otherwise trip the warning. Unclassified cards have no ticker input (the
ticker is entered after categorizing), so the blur check covers note creation.

### Locked positions
A note's `shares` and `account` are **locked by default** behind a lock icon, on both the
note card and the expanded modal. Locked, they render as a read-only readout (large
tabular-nums share count plus an account pill) with no input elements; unlocking swaps in
the number input and account select. Unlock state (`unlockedNotes`) is intentionally **not
persisted** — every note re-locks on reload so the guard can't be left off by accident.
A **Lock All** button appears in the notes toolbar while any note is unlocked (it shows the
count and clears `unlockedNotes`); it stays hidden otherwise rather than sitting there as a
no-op.

Cash secured puts carry their own `account` field (`getPutAccount`), chosen in the add/edit
modal and shown as a pill on each row (both hidden when accounts are off). The owner's legacy
puts written before the field existed fall back to `roth`, since every one of them was in the
Roth; other users' fall back to Unassigned. Per-account
obligation totals live in `putObligationByAccount`. The donut's centre callout and the
footnote under the chart use `shownPutObligation`, which follows the account filter — a
single-account view must not report the whole book's obligation. The CSP sidebar panel
still totals every put, since it lists them all.

Robinhood short calls are treated as covered calls rather than CSPs. Position sync matches
each short call to the underlying sticky note by brokerage account and ticker, then persists
the friendly contract details in `note.coveredCalls`. The note card shows a Covered Call
annotation with strike, contract count, and expiration. A completed fresh Plaid extraction
removes annotations for calls that are no longer open; stale or cached snapshots never
remove them.

Ask K always receives **all** accounts regardless of the on-screen filter: each position
carries `account`, `accountLabel`, `percentOfPortfolio`, and `percentOfAccount`, and the
payload includes an `accounts` array with per-account totals and strategy text (owner
strategy for the owner, neutral text for others). For single-portfolio users `askKPayload`
strips all account fields. The owner's account intents live only in the Worker's
owner-only `OWNER_ACCOUNT_CONTEXT` (see Ask K).

---

## Onboarding Walkthrough

`src/components/OnboardingWalkthrough.jsx`, rendered from `App.jsx` as `onboardingModal`
(also inside the full-screen dashboard view). `onboardingOpen` is `false | 'welcome' | 'keys'
| 'accounts'`:

- `'welcome'` — steps: Welcome → Finnhub key (required; **Test & save** does a real AAPL
  quote, 401/403 = rejected) → MarketAux key (optional) → Accounts (non-owners only) →
  Dashboard (only when the user has no saved `diagnosticDashboard`) → Get started. Opens automatically once per sign-in while the Finnhub key is missing **or** a
  non-owner hasn't answered the accounts question (`needsAccountSetup`). It skips ahead to the
  first unfinished step.
- `'keys'` — opened by the Live Dashboard's missing-key notice ("Set up API keys →"); starts
  at the Finnhub step.
- `'accounts'` — standalone **Manage accounts** (Save/Cancel), pre-filled with current
  names and per-account note counts.

The **Dashboard** step asks whether to start with a set: **Starter pack** (recommended —
market + Mag 7 + the owner's AI Trade, Space, and Nuclear groups; 37 widgets, under
Finnhub's free 50-symbol stream cap) or **Just the basics** (market + Mag 7). The choice goes
through `saveDashboardStarter` → the dashboard module's exported `buildStarterDashboard(pack)`
(loaded on demand) → `setDiagnosticDashboard`, and `dashboardMountKey` remounts a
dashboard that is already open. Packs are defined in `STARTER_PACK_THEME_IDS`.

`apiKeysChecked` waits for the async key decryption (and is set immediately for brand-new
users with no document) so the modal never flashes for users who already have keys. Keys
typed here go through the normal `setFinnhubApiKey` / `setMarketauxApiKey` state and
encrypted autosave. The **User Guide** (header button; formerly "Quick Start Guide") remains
the long-form reference and includes a Backups & restore section.

---

## Live Dashboard

`FinnhubDiagnosticDashboard.jsx` — available to **every** signed-in user on desktop; the tab
is hidden below the `md` breakpoint and mobile has no dashboard. It needs only the user's
Finnhub key plus the public Pages Functions (`/api/news/breaking`, `/api/treasury/dgs30`,
`/api/quotes`).
Layout persists per user as `diagnosticDashboard` in Firestore (localStorage fallback).

- Onboarding can install a starter pack instead (see Onboarding Walkthrough).
- Otherwise, new dashboards and **RESET GROUPS** start with `createStarterWidgets()` — the
  `market` (SPY, IWM, QQQ, VIX, GLD, BTC, DGS30) and `mag7` themes (14 widgets). All other
  themes (drones, robotics, AI, space, financials, nuclear, energy, defensive, China,
  healthcare, defense) remain in the group picker.
- `createGodelLayout` places clusters by the count of *present* themes, so a small dashboard
  packs side by side; full layouts are unchanged.
- Saved dashboards are versioned (`DASHBOARD_VERSION = 13`). `migrateDashboardThemes` adds
  Healthcare (v11) and Defense (v12) once to older layouts and rebalances sections older
  versions stacked in column zero (v13). The starter/reset paths bypass migration.
- With no key, the amber notice "Add your free Finnhub API key…" carries a **Set up API
  keys →** action (`onSetupApiKeys`) that opens the walkthrough at the Finnhub step.
- **How quotes refresh.** Finnhub's free WebSocket streams at most 50 symbols (the cap is
  detected once and remembered 7 days); the full theme set is 88. Everything not actively
  streaming — beyond the cap, or subscribed but without a trade for 15s — refreshes every
  15s from `/api/quotes` (`functions/api/quotes.js`): one request, Yahoo's spark endpoint
  in chunks of 20 (its limit), 10s edge cache, `VIX` → `^VIX` and `BRK.B` → `BRK-B`
  mapping. It spends no Finnhub calls. The per-symbol Finnhub REST queue is the fallback:
  it skips any symbol the batch priced in the last 60s, so it takes over by itself if
  `/api/quotes` fails. It paces under 50 calls per rolling minute (the key's 60/min limit
  is shared with the rest of the app), starts with a 25-call burst after waiting ≤3s for
  the first batch, and goes in on-screen order. Crypto (BTC) and DGS30 are not batched.
- Feed labels: **SAVED · AWAITING TRADE** (saved price, streamed symbol), **SAVED · IN
  QUEUE** (saved price, beyond the stream cap), **SNAPSHOT ONLY** (refreshed by batch or
  REST, beyond the cap), **SNAPSHOT** (streamed but quiet). Each has a hover tooltip.

---

## Ask K

Desktop `AskK.jsx` and mobile `AskK` send the user's portfolio plus a Firebase ID token
(`Authorization: Bearer`) to `https://stock-stickies-askk.99redder.workers.dev/api/ask-k`.
The Worker (`worker/src/index.js`, config `worker/wrangler.toml`):

- **Requires sign-in.** `verifyFirebaseIdToken` checks signature/`aud`/`iss`/`exp`; missing or
  invalid tokens get 401. Origin checks are only a browser courtesy.
- **Limits non-owners.** `OWNER_UID` is unlimited; others get `NON_OWNER_DAILY_LIMIT`
  (5) questions per UTC day, counted before the provider call in the `ASKK_USAGE` KV
  namespace (`usage:{uid}:{YYYY-MM-DD}`, 2-day TTL). Over the limit → 429. Responses include
  `usage: { limit, remaining }`; desktop shows "N of 5 questions left today".
- **Only sees the caller's data.** The Worker has no storage/database bindings besides the
  usage counter; it analyzes only the portfolio in the request, and the prompt tells it it
  cannot see other users. Owner-only prompt context (`OWNER_ACCOUNT_CONTEXT`: account
  intents, USD/SGOV cash, where puts are written) is sent only when `sub === OWNER_UID`;
  others get `GENERAL_ACCOUNT_CONTEXT`.
- Provider errors are logged (`askk_provider_error`), never echoed (no base URL/model leak).
- **Billing:** the provider is MiniMax on a **prepaid** credit balance (≈$25 loaded; $23.02 on
  Sep 24, 2026) shared by Ask K on all of the owner's sites — the most important being the
  survival node product page (`node.html`, eastern-shore-ai repo). Prepaid means no surprise
  bill: when credits run out, requests fail. The low non-owner cap protects that shared
  balance; the owner plans to revisit Stock Stickies' Ask K if it drops below ~$5.
- Secrets: `STOCKSTICKIES_ASKK_API_KEY`, `STOCKSTICKIES_ASKK_BASE_URL`,
  `STOCKSTICKIES_ASKK_MODEL`. Vars: `FIREBASE_PROJECT_ID`, `OWNER_UID`,
  `NON_OWNER_DAILY_LIMIT`, `ALLOWED_ORIGINS`.

---

## Security Notes

- **Firestore rules** (console, project `red-s-stickies`, reviewed 2026-09-23):
  `users/{userId}` and `users/{userId}/snapshots/{snapshotId}` are read/write only when
  `request.auth.uid == userId`; everything else `allow read, write: if false`. These rules are
  the real protection for users' API keys (below) — do not loosen them.
- **API-key "encryption" is obfuscation.** The AES-GCM key is derived from the user's UID plus
  constants shipped in the client bundle, so anyone able to read a user document could
  decrypt it. The `beforeunload` emergency save also writes keys in plain text. Keys are never
  logged, never stored in localStorage, and only sent directly to finnhub.io / MarketAux.
- **Known low-risk gap:** some localStorage caches (dashboard layout fallback,
  `portfolio_prices_cache`) are not per-user, so a second person on a shared browser could
  inherit cached tickers/layout.
- No secrets are committed: only `.env.example` templates; Firebase web config is public by
  design.

---

## Mobile Companion Architecture

The mobile app is not a responsive build of desktop. It is a separate, deliberately
read-only portfolio companion under `mobile/`. Do not move mobile UI into `src/App.jsx`,
do not deploy the root `dist/` to the mobile domain, and do not assume a root build contains
mobile changes.

### Product and Design Boundaries

- Mobile uses the current dark Stock Stickies design on both the login screen and the
  authenticated app. Do not restore the old login artwork, old yellow-sticky logo, or old
  white-background PWA icon.
- The current icons are `mobile/public/stock-stickies-app-icon-v2-*.png`, referenced by
  `manifest.webmanifest`. Keep the normal and maskable entries intact.
- Mobile has **no portfolio-allocation donut or treemap**. Those visualizations remain part
  of desktop and must not be removed from desktop when changing mobile.
- Position cards show portfolio composition as a neutral percentage in its own location.
  Red/green values are reserved for financial gain/loss, so composition must not look like
  performance.
- Cost-basis gain/loss is always labeled **Unrealized P&L**. “2026 YTD” is a separate,
  cash-flow-adjusted performance measure and must never be relabeled as unrealized P&L.
- Build information belongs inside the Profile modal under App details, not beside the
  avatar or in the main portfolio view. The profile modal must retain all existing profile
  data such as member since, last login, nickname, email, and other current fields.
- The Cash & Collateral panel starts collapsed. Expanding it once reveals per-account
  totals; expanding an account a second time reveals the component breakdown.

### Authentication and Shared Firestore Data

Mobile is open to **every** account. Plaid/Robinhood balances, YTD, and Share YTD are
owner-only (the brokerage fetch is skipped entirely unless `user.uid === OWNER_UID`).
Everyone else sees their own notes priced with their own Finnhub key, grouped by the
accounts they named on desktop (`customAccounts` / `accountSetup`, same rules as desktop), or
as one portfolio (no account chips; labels read "Portfolio"; put collateral counts toward the
balance). New users with no document, no key, or no positions get guidance pointing them to
stockstickies.com on a computer. Account helpers (`ACCOUNTS`, `getAccount`,
`getAccountLabel`, `getPutAccount`) live inside `App`, not at module level.

Mobile uses the same Firebase Auth users and the same `users/{uid}` document as desktop.
The login supports email/password, password reset, and Google sign-in. After login, the
mobile app subscribes to the user document and reads the portfolio notes, categories,
labels, cash-secured puts, watch list, profile/nickname/photo data, and encrypted API-key
data needed for quotes.

Desktop is the editing surface and performs Firestore writes. Mobile should remain
read-only for portfolio data. A mobile feature must not silently introduce a second
portfolio store or write a derived brokerage balance back over the desktop data.

For position size, mobile matches each saved note to the live Plaid holding by
account/security identifiers, then by account/ticker as a fallback. When matched,
the displayed share quantity comes directly from `holding.quantity`; `note.shares`
is only the fallback when no live holding can be matched. Mobile never writes that
quantity back to Firestore.

Desktop exposes one `Update positions` action. It checks the Plaid permission,
loads current holdings, compares them with the saved notes, creates one Firestore
backup only when changes exist, and applies share/account/metadata updates in that
same action without opening an intermediate confirmation modal. When the operation
finishes, a branded summary reports the number checked, updated, added, possibly
closed, and needing review, plus any warnings or errors. The detailed sync modal is
optional from that summary; positions absent from Plaid remain review-only and are
not automatically deleted.

**When positions are written.** Page load only *reads* holdings (`GET /plaid/holdings`,
which fetches live from Plaid, for YTD, risk stats, and the sync modal) — it never writes on
refresh. Position changes are written (a) when the owner clicks **Update positions**, or
(b) once per **scheduled sync**: the `rentals-api` cron runs the same guarded paid
`/investments/refresh` at **07:00 ET** (overnight moves) and **16:10 ET** (the day's trades),
records the completed run in KV `stock_stickies:plaid:robinhood:scheduled-sync`, and returns
it as `scheduledSync` from `/plaid/holdings`. On the next page load, if that sync is newer than
the last one this browser applied (localStorage `stock-stickies-applied-position-sync-{uid}`),
the app applies it once (updates/additions/CSPs/covered calls, with a backup; never removals).
A manual update records itself too. Changes are written at that next load, not by the cron
itself — an unattended write would need Worker-side Firestore credentials. Crons use 2
multi-hour UTC expressions (`10 20,21` and `0 10,11,12`) with Eastern-time guards; the Workers
Free plan allows only 5 cron triggers per account across all Workers.

Every successful manual `Update positions` run also refreshes prices for the complete
post-reconciliation position list, even when share quantities already match. Newly
imported positions are included in the same refresh, and the completion summary reports
how many ticker prices were refreshed or filled from brokerage data.

Never describe a zero-change sync as “Robinhood positions are current.” The Worker
can only compare against Plaid's latest available Investments snapshot, which is not
real-time and commonly updates after market hours. The completion summary must say
that the latest Plaid snapshot matched, display `fetchedAt`, explain that recent
overnight/premarket trades may still be absent, and prominently warn when
`source === 'nightly-cache'` or `stale === true`.

### Static Firebase Configuration

Vite substitutes `VITE_*` variables while compiling; a runtime hosting environment cannot
retroactively inject those values into already-built JavaScript. This previously caused
the production mobile login to display “Firebase is not configured for this app.”

`mobile/src/App.jsx` therefore has production Firebase web-config and reCAPTCHA fallbacks
in addition to `import.meta.env.VITE_*`. These are public Firebase client identifiers, not
server credentials. Keep the Google Cloud/Firebase API key restricted to the intended APIs
and origins. Do not remove the source fallbacks unless the deployment is replaced with a
verified build-time environment injection mechanism.

### Brokerage and Ask K Services

The mobile app sends the signed-in user's Firebase ID token to:

- `https://rentals-api.99redder.workers.dev/api/stock-stickies/plaid/holdings` for
  Plaid/Robinhood accounts, holdings, cost basis, transactions, YTD data, and snapshots
  (owner only — not called for other users).
- `https://stock-stickies-askk.99redder.workers.dev/api/ask-k` for Ask K (token required;
  Builds ≤ 38 sent no token and now get 401).

The current URLs include a `client=mobile-build-9` query marker. That marker identifies the
client contract; it is not the visible mobile release number and does not need to match the
current Build label unless the API contract itself changes.

Ask K must receive every account even if the user is viewing a single account. Its request
context includes positions, account labels, percentage of the total portfolio, percentage
of the account, account totals, strategies, cash, CSP data, and the available performance
fields. “Cannot reach Ask K right now” generally indicates Worker/network/config trouble,
not a Firestore sync issue.

The brokerage Worker is maintained in a separate repository:

```text
/Users/chrisgorham/Websites/rentals/cloudflare
GitHub: 99redder/stuff
Worker: rentals-api
Primary files:
  src/worker.js
  src/performance-calculations.js
```

Changes to brokerage reconciliation or YTD calculations require building/deploying that
Worker as well as releasing the frontend that consumes the changed response.

### Mobile Cash and CSP Rules

Plaid's Robinhood brokerage `current` cash value can be a cash pool that already includes
cash reserved for cash-secured puts. It does not reliably expose Robinhood's free buying
power. In the Individual account, adding the nominal CSP obligation to that cash pool
would double count collateral.

The mobile normalization therefore follows these rules:

1. `cashPool` is the brokerage cash amount returned by Plaid.
2. When that pool includes CSP-secured cash, set/display
   `cashIncludesCspCollateral`.
3. CSP obligation remains visible as a separate informational component, but uses
   `includeInCashTotal: false` and `includeInComposition: false`.
4. `totalCashPool` is the deduplicated cash total: brokerage cash pool plus SGOV where
   applicable. It is not `cash + CSP + SGOV`.
5. “Total available cash” may include SGOV as a liquid cash equivalent, but must not imply
   that the Plaid brokerage cash pool equals immediately spendable buying power.
6. Never guess the Individual free-cash/buying-power figure by subtracting or adding CSP
   unless the source data explicitly proves that treatment.

This fixed the prior Individual display of `$20,292` (`$9,092` cash plus `$11,200` CSP)
when `$9,092` already included that reserved collateral. Exact free buying power remains a
separate Robinhood concept and may require transaction/export data unavailable through
Plaid.

For all accounts, the collapsed Cash & Collateral total uses deduplicated components.
Actual cash, CSP collateral/obligation, and SGOV can each appear in the expanded detail,
with copy that makes inclusion/exclusion from the total clear.

### Cost Basis and Unrealized P&L

Plaid holdings and tax lots can supply cost basis when the institution provides it.
Mobile and desktop derive:

```text
unrealized P&L = current position value - available cost basis
```

Missing basis must remain unavailable; do not coerce it to zero. Account and portfolio
totals must distinguish known-basis positions from holdings whose basis is missing.
All-short tax-lot sets and option/short data must not be treated as ordinary long-position
cost basis without explicit handling.

Desktop shows Unrealized P&L on each note, per account where appropriate, and in portfolio
totals/line items. Mobile shows it on position cards, account summaries, and portfolio
totals where the returned data supports it.

### Reconciled 2026 YTD Performance

YTD performance is not ending balance minus opening balance. Withdrawals, deposits,
contributions, and distributions must be treated as external cash flows:

```text
gain = ending value - opening value - net external cash flow
```

The backend uses Modified Dietz for the return percentage so cash flows are weighted by
when they occurred. Dividends and trading activity are investment results, not external
cash flows. Plaid transaction subtypes such as contribution, deposit, distribution, and
withdrawal are recognized when supplied.

Opening balances and reconciliation state are server-side, not hardcoded in either
frontend. The Worker uses these KV namespaces:

```text
stock_stickies:plaid:robinhood:performance:config
stock_stickies:plaid:robinhood:performance:snapshots:
stock_stickies:plaid:robinhood:performance:transactions:
stock_stickies:plaid:robinhood:performance:daily:        # end-of-day values for risk stats
```

The performance config supports `manualExternalFlows[year]` for institution exports that
contain cash movements Plaid omitted. Each record has a stable `id`, Stock Stickies
`account`, ISO `date`, recognized `subtype`, signed investor-perspective `flow` (deposit
positive, withdrawal negative), and source note. The Worker converts those records to
Plaid's opposite amount-sign convention, replaces any Plaid external flows for the same
manually reconciled account to prevent duplicates, and preserves investment trades.
`cashFlowCoverage` records the source (for example `manual-robinhood-csv`), while
`cashFlowCoverageThrough` records the export's last covered date. The authenticated
opening-value POST must preserve these config fields when updating opening balances.

When Plaid's account-value bridge cannot reproduce the institution's own performance,
`performanceReconciliations[year][account]` can hold an institution-reported anchor:
`reportedGain`, optional `reportedRealizedGain`, the Plaid `anchorValue` observed at the
same time, ISO `asOf` date, and source. The Worker returns the institution gain on the
anchor date and rolls it forward using later Plaid value changes less later external cash
flows. This avoids permanently hardcoding a number while preventing an unreliable Plaid
opening/ending-value bridge from overriding Robinhood's own P&L. When any account uses an
institution anchor, its account-level percentage uses the same Modified Dietz
time-weighted capital denominator with the institution-reported dollar gain. Combined
dollar YTD is the sum of account gains. The all-accounts percentage divides that combined
gain by the sum of each account's Modified Dietz weighted capital, so the aggregate remains
cash-flow adjusted even when an account's dollar gain comes from an institution anchor.

The Worker also writes daily account snapshots so performance can continue from observed
values. Plaid's Robinhood feed has not consistently supplied 2026 deposits/withdrawals for
the Individual account. When external cash-flow history is incomplete, the API/frontend
uses a status such as `cash-flow-history-incomplete` and displays “Needs cash-flow
history.” It must not show a raw balance decline as a large YTD loss. A Robinhood 2026
transaction CSV can be used to reconcile the missing Individual cash flows; statement
balances alone are insufficient.

### Daily Risk Metrics (Sharpe, Max Drawdown, Beta)

`performance:daily:{year}` holds one end-of-day record per trading day:
`{ accounts: { id: { value, externalFlow } }, spy, riskFreeRate, source, snapshotFetchedAt }`.

- **Backfill (`source: 'backfill'`):** Jan 1 – Sep 22 2026 rebuilt from Robinhood activity
  CSVs: holdings rolled backward from the Sep 22 Plaid holdings, priced with Yahoo daily
  closes (split-unadjusted), options marked with Black-Scholes using IVs implied by the
  account's own fills. It reconciled to the configured Jan 1 opening values (Traditional
  −$190, Roth −$9) and to live snapshots (~0.08% median gap). Individual covers only
  Jan 2 – Jul 24 (anchored to its Jan 1 value); after that Plaid's Individual balance was
  unreliable (crypto moves, pending ACH), and the account was wound down. Its rebuilt gain
  through Jul 24 ($2,637) differs from Robinhood's reported $1,561 — unexplained.
- **Going forward (`source: 'snapshot'`):** `updateStockStickiesDailyRisk` (called from
  `buildStockStickiesPerformance`) appends a day only for post-close snapshots
  (`stockStickiesCloseDateForTimestamp`: before 9:30 ET → prior weekday, after 4:00 PM ET →
  that day, mid-session → skipped), with that period's external flows and the SPY / ^IRX
  closes fetched from Yahoo. Backfilled days are never overwritten, and a day is skipped if
  that snapshot was already recorded.
- `stockStickiesRiskMetrics` computes flow-adjusted daily returns (start-of-day flows; days
  starting under $1,000 skipped), then annualized Sharpe vs the T-bill rate, max drawdown,
  beta vs SPY, volatility, and time-weighted return (≥20 days). The combined series is
  value-weighted across accounts. Returned as `risk` on each account and on `total`.
- `stockStickiesBenchmarkReturn` returns `performance.benchmark`: SPY's price return from
  the prior year-end close to the latest stored close, so the card compares the same dates.

### YTD Social Share Card

Desktop and mobile expose a **Share YTD** control for the currently selected portfolio
scope. All Accounts produces the combined YTD card; selecting Individual, Traditional IRA,
or Roth IRA produces that account's card. The control is disabled unless that scope's
performance status is `ready`.

`mobile/src/ytdShareCard.js` is the source implementation. Desktop re-exports it through
`src/utils/ytdShareCard.js` so both experiences render the same 1600×900 (16:9) PNG. The
card includes the current Stock Stickies mark/wordmark, profile photo or initials,
nickname/email-prefix fallback, account scope, YTD dollar gain, available cash-flow-
adjusted return percentage, as-of date, and `www.stockstickies.com`. It deliberately omits
balances, positions, account numbers, and disclaimer copy.

Below the S&P comparison pill the card draws a row of neutral stat tiles from the scope's
`risk` block — **Sharpe ratio**, **Max drawdown**, **Beta vs SPY** — with a "From daily
closes · <first> – <last>" caption (red/green stays reserved for gain/loss). The S&P YTD figure
comes from `performance.benchmark.ytdReturnPercent` (the Worker's daily closes); the old
Finnhub `yearToDatePriceReturnDaily` lookup lagged several trading days and was removed. If no
benchmark is available the S&P pill is hidden. Share YTD remains owner-only.

The control opens a preview with **Copy image** and **Share / Save** actions. Copy image
writes the PNG directly to the system clipboard when the browser supports image clipboard
items. A **$ + % / % only** selector regenerates the card before export; percentage-only
mode removes the dollar gain and adds `-percent-only` to the filename. It is offered only
when a reconciled return percentage is available. Desktop always downloads from Share /
Download instead of entering the browser's
unreliable file-share path. Mobile opens the native share sheet when supported and falls
back to download if sharing fails. Profile photos use both the saved profile image and the
current authentication-provider PFP as candidates. Remote photos are fetched into a local
blob before drawing, with a CORS-safe image fallback; initials are used only when neither
photo can be read safely.

### PWA Versioning and Update Behavior

The visible release is **Build 39** (released via Sites on 2026-09-23, from commit
`91e207d`; `version.json` and the live asset hash were verified against the local build). Every mobile release must
increment and synchronize all three user-visible build markers:

| File | Marker |
|---|---|
| `mobile/src/main.jsx` | `APP_BUILD` |
| `mobile/public/version.json` | numeric `build` |
| `mobile/src/App.jsx` | Build label in the Profile modal |

Before release, search for the old build number and verify that no user-visible marker was
missed. Review the cache name in `mobile/public/sw.js` when the shell/cache contract
changes; cache names use the `stock-stickies-mobile-*` prefix.

`mobile/src/main.jsx` registers `/sw.js` with `updateViaCache: 'none'`. It checks
`/version.json` with a timestamp and no-store headers on initial load, `pageshow`, focus,
visibility changes, and periodically. When a newer build is detected it deletes mobile
caches and reloads the root with cache-busting query parameters.

`mobile/public/sw.js` uses network-first loading for same-origin GET requests, with an
offline cache fallback. It never caches `sw.js` or `version.json`, calls `skipWaiting()`,
claims clients, and deletes older Stock Stickies mobile caches on activation.

`mobile/public/_headers` applies no-cache/no-store/must-revalidate behavior to the app
shell, `index.html`, `reset.html`, manifest, service worker, and version file. Preserve
these headers so installed PWAs can discover releases without being deleted and
reinstalled.

`https://mobile.stockstickies.com/reset.html` is the recovery route for a genuinely stuck
installation. It unregisters service workers, clears Cache Storage, then redirects to a
fresh root URL. Normal releases should update automatically; removing and reinstalling
the PWA should be a last resort.

### Mobile Release Checklist

1. Make changes only in the appropriate app/service repository.
2. Increment the three mobile build markers together.
3. If shell caching behavior changed, update/review the service-worker cache identifier.
4. Run `npm run build` from `mobile/`; a root build does not validate mobile.
5. Check that `mobile/dist/.openai/hosting.json` was copied and still contains the existing
   project identity.
6. Commit and push the exact source state to `main`.
7. Use Sites to push/package that exact commit, save a version, and deploy the saved
   version to the existing project.
8. Confirm deployment reaches a terminal success state.
9. Verify `https://mobile.stockstickies.com/version.json?checked=<timestamp>` returns the
   new build.
10. Test the custom domain in a normal browser and an installed iPhone PWA: new login
    design, Firebase login, Profile build label, current branding/icon, cash totals,
    position composition, Unrealized P&L, YTD status, and Ask K.

### Mobile Troubleshooting Guide

| Symptom | First checks |
|---|---|
| Build JSON is new but Profile shows an old build | Confirm all three build markers, deployed asset hash, service-worker activation, and custom-domain cache |
| GitHub Pages 404 on a mobile path | Mobile is not hosted by GitHub Pages; use the Sites custom domain/deployment |
| Old login/logo/icon | Confirm the Sites artifact came from current `mobile/`, manifest uses `app-icon-v2`, then clear the installed manifest/SW via `reset.html` |
| “Firebase is not configured for this app” | Confirm the source fallback config survived and the built JS contains production config; runtime-only Sites env values are insufficient for Vite |
| Ask K cannot be reached | Inspect Ask K Worker reachability, URL/client contract, Firebase token, CORS, and the browser network response |
| Ask K says "Please sign in" | Client isn't sending a Firebase ID token (mobile Build ≤ 38, or signed out) |
| Ask K says the daily limit is used | Non-owner hit `NON_OWNER_DAILY_LIMIT`; resets at midnight UTC |
| Cash is too high by exactly the CSP amount | CSP was probably added to a Plaid cash pool that already includes reserved collateral |
| Individual YTD shows a large loss after withdrawals | External cash-flow history is incomplete; hide/flag YTD until transactions are reconciled |
| Installed PWA will not update | Verify `version.json`, `_headers`, SW registration, cache-name behavior, then use `/reset.html`; reinstall only if browser reset is blocked |

---

## Color System
Categories use Tailwind CSS background classes. The full palette available for custom categories:
```javascript
AVAILABLE_COLORS = [
  'bg-yellow-200', 'bg-yellow-300', 'bg-yellow-400',
  'bg-pink-200',   'bg-pink-300',   'bg-pink-400',
  'bg-blue-200',   'bg-blue-300',   'bg-blue-400',
  'bg-green-200',  'bg-green-300',  'bg-green-400',
  'bg-red-200',    'bg-red-300',    'bg-red-400',
  'bg-orange-200', 'bg-orange-300', 'bg-orange-400',
  'bg-purple-200', 'bg-purple-300', 'bg-purple-400',
  'bg-teal-200',   'bg-teal-300',   'bg-cyan-200'
]
```
Default categories: Core Holding (`bg-blue-200`), Swing Trade (`bg-green-200`), Value (`bg-purple-200`), Growth (`bg-orange-200`), Speculative (`bg-red-300`).
Unclassified notes use `bg-gray-300`.

---

## Race Condition Fixes

### Problem: Owner's document wiped on sign-in (Sep 24, 2026)
The accounts change added `accountFieldsForSave` to the autosave dependencies. For the owner
it changes identity the moment auth resolves, so autosave fired right after sign-in, set
`isSavingRef` (which blocks the Firestore load), and 2s later wrote the empty default state
over the document — `saveUserDoc` uses `merge: false`. Recovered from the Sep 23 2:31 PM
backup. **Fix**: autosave, the `beforeunload` save, and `syncNow` all return early until
`userDataReady`. **Rule**: never let any save path run before the user's document has been
applied, and treat any new autosave dependency as something that can fire before load.
Restore now restores every field in a backup and cancels a pending autosave first;
**Backups** now has its own header button next to User Guide (it used to live only in the
profile-photo menu).

### Problem: Notes moving to wrong category on color change
`setCategories()` triggering orphan repair before `setNotes()` completes caused notes to appear orphaned.
**Fix**: `isChangingColorRef` flag — orphan repair skips if set; cleared after 100ms timeout (line ~1165).

### Problem: Data not persisting on logout
Logout wasn't awaiting the Firestore sync.
**Fix**: `syncNow()` is properly awaited; `handleLogout` calls `await syncNow()` (line 1069).

### Problem: Category labels resetting to "Category" on login
Missing-label repair ran before `colorLabels` loaded from Firestore.
**Fix**: `isLoadingRef` check added to label repair useEffect (line ~1345).

### Problem: Categories and notes lost on logout/login
Auto-save useEffect was missing `categories` in the data object.
**Fix**: `categories` added to `updateData` in auto-save useEffect (line ~571).

### Problem: Notes don't load on login until page refresh
`isSavingRef.current` remained `true` from a previous session, blocking data load.
**Fix**: `handleLogout` resets `isSavingRef`, `isLoadingRef`, and clears `saveTimeoutRef` (lines 1072–1074).

---

## Portfolio Update Schedule
```
// 15-minute fetch windows (EST):
// - Market open:  9:35–9:50 AM
// - Midday:       1:00–1:15 PM
// - Market close: 4:05–4:20 PM
// Cache expires after 8 hours
```

---

## Current Legal / Branding

### Footer (main app, lines 3823–3834)
```
© {year} Stock Stickies. All rights reserved.
Privacy Policy · Terms of Use
Website created and maintained by Eastern Shore AI, LLC → https://www.easternshore.ai
```

### Login page legal area (lines ~2111–2116)
Same Eastern Shore AI credit blurb appears above Privacy/Terms buttons on the login screen.

---

## SEO Setup (index.html)
- `<title>`: Descriptive with stock tracking keywords
- `<meta name="description">`: Search-intent focused copy
- `<meta name="keywords">`: Stock tracking keyword list
- Twitter Card meta tags (`twitter:card`, `twitter:title`, etc.)
- Open Graph tags (`og:title`, `og:description`, `og:url`, `og:image`, `og:type`)
  - OG image: `/assets/stock-stickies-google-cloud-logo-1024.png`
- JSON-LD `WebApplication` schema (structured data for Google)
- `<link rel="canonical" href="https://stockstickies.com/" />`
- `public/robots.txt` — allows all crawlers, links to sitemap
- `public/sitemap.xml` — canonical URL entry

---

## Testing Checklist

### Desktop

1. Login/logout and verify data persists across sessions.
2. Create, edit, classify, move, and delete notes.
3. Add, delete, rename, and recolor categories; notes must stay assigned.
4. Test the reassignment modal when deleting a category with notes.
5. Test locked position editing, duplicate-position prevention, and account grouping.
6. Test dark mode and portfolio privacy mode.
7. Confirm the desktop donut/treemap, account filters, CSP totals, and cash grouping.
8. Verify per-position/account/portfolio Unrealized P&L and missing-basis behavior.
9. Verify scheduled stock-price updates, Finnhub data, MarketAux news, and watch list.
10. Check cloud-sync state, refresh persistence, and logout/login reload behavior.
11. With a **non-owner** test account: walkthrough appears on first sign-in, Finnhub
    Test & save, accounts question (one portfolio and named accounts), Manage accounts,
    Live Dashboard starter set, Ask K daily counter; no Robinhood/Today/YTD UI.
12. As the **owner**: no walkthrough accounts step, built-in accounts unchanged, Robinhood
    sync, YTD share card with Sharpe / drawdown / beta tiles and current SPY YTD.

### Mobile

1. Build from `mobile/` and confirm all three release markers agree.
2. Test the current login design with email/password, Google, reset, logout, and relogin.
3. Confirm the Profile modal contains the build and retains all profile metadata.
4. Confirm the new main logo and `app-icon-v2` Home Screen icon.
5. Verify all three accounts load from brokerage data and account totals reconcile.
6. Confirm Cash & Collateral starts collapsed, first expands to accounts, and second
   expands to components.
7. Confirm Individual cash does not add CSP obligation to a cash pool that already
   includes it; SGOV and CSP labels must describe their total/composition treatment.
8. Confirm mobile has no allocation donut and desktop still does.
9. Verify composition percentages are neutral and distinct from red/green Unrealized P&L.
10. Verify missing cost basis does not become `$0` basis or fabricated P&L.
11. Verify 2026 YTD shows reconciled performance only; incomplete Individual cash flows
    produce the explicit unavailable status.
12. Ask K must respond and receive all accounts regardless of the selected account.
13. Check `version.json` through the custom domain, foreground/background an installed
    iPhone PWA, and confirm it updates without deletion/reinstallation.
14. Test offline fallback and `/reset.html`.
15. Sign in as a non-owner: no brokerage request, own accounts or single "Portfolio",
    Finnhub-priced positions, no YTD/Share YTD, Ask K works.

---

## Recent Updates

### Migrated from single-file CDN app to Vite/React build
- Moved all code from `index.html` CDN script to `src/App.jsx`
- React 18 (CDN) → React 19 (npm)
- Tailwind CSS CDN → Tailwind CSS v4 via `@tailwindcss/vite`
- Firebase CDN → Firebase v12 (npm package, compat SDK)

### Footer & Login Branding Update
- Footer credit: "Website created and maintained by Eastern Shore AI, LLC" → `https://www.easternshore.ai`
- Same credit block added to login page above Privacy/Terms controls

### SEO Hardening
- Expanded meta tags (keywords, Twitter Card, og:image)
- JSON-LD `WebApplication` schema added to `index.html`
- `robots.txt` and `sitemap.xml` added to `public/`
- AI-agent navigation comment block added to top of `src/App.jsx`

### Portfolio Snapshot Fix (May 2026)
- **Problem:** Snapshot button threw `"Attempting to parse an unsupported color function oklch"` because html2canvas 1.4.1 can't parse modern CSS `oklch` colors used by Tailwind.
- **Fix:** Replaced `html2canvas` with `html2canvas-pro` (v2.0.2), which supports modern CSS color functions.
- Also fixed: `window.html2canvas` → direct import reference; App Check debug mode (`true`→`false`) which caused reCAPTCHA timeout errors.

### Mobile Companion Stabilization (July 2026)

- Established `mobile.stockstickies.com` as the clean production/install address.
- Separated mobile Sites deployment from the desktop GitHub Pages workflow.
- Added automatic release discovery, no-cache headers, service-worker cache cleanup, and
  `/reset.html` recovery so users normally do not need to reinstall the PWA.
- Standardized the new login design, app branding, and v2 PWA icon.
- Moved the visible build label into the full Profile modal without removing profile data.
- Removed the mobile allocation donut while preserving desktop portfolio visualizations.
- Added portfolio-composition percentages separately from Unrealized P&L.
- Added cost-basis-driven Unrealized P&L on mobile and desktop.
- Added reconciled 2026 YTD/Modified Dietz support and daily server-side snapshots, with an
  explicit incomplete-cash-flow state instead of a misleading balance-change loss.
- Reworked mobile Cash & Collateral into a nested collapsed view and stopped double
  counting CSP collateral already contained in the Plaid brokerage cash pool.
- Preserved production Firebase client configuration in static builds and restored Ask K
  Worker connectivity.

### Opening the Platform to Other Users (September 2026)

- **Share card risk stats:** Sharpe / max drawdown / beta tiles on the YTD card, computed by
  `rentals-api` from a new daily-values KV store backfilled from Robinhood CSVs and extended
  nightly. SPY YTD now comes from the same store (fixes a stale Finnhub figure).
- **Live Dashboard for everyone** (desktop only), with a 14-widget starter set, a "Set up API
  keys" action on the missing-key notice, and Healthcare/Defense groups (dashboard v13).
- **Onboarding walkthrough** that repeats until the Finnhub key is saved and the accounts
  question is answered, and offers a Live Dashboard starter pack.
- **User-named accounts or one combined portfolio**; the owner's three accounts stay a fixed
  one-off.
- **Security audit:** Ask K was an unauthenticated proxy on the owner's LLM key — it now
  requires Firebase sign-in, caps non-owners per day (5 as of Sep 24), and keeps owner context owner-only;
  owner account-strategy text no longer reaches other users. Plaid routes, Firestore rules,
  and key handling were verified (see Security Notes).
- **Mobile open to all accounts** (Build 39, released 2026-09-23), with Plaid-backed features owner-only.
- Shelved for now: manual cost-basis / performance entry for regular users, and multi-user
  brokerage connections (Plaid Link or SnapTrade would need a multi-tenant Worker rewrite).
- **Sep 24 follow-ups:** fixed the sign-in wipe (see Race Condition Fixes), backup retention,
  restore now backs up the replaced state first, "Quick Start Guide" renamed **User Guide**
  with a Backups & restore section, a dedicated **Backups** header button, and the owner-only
  Look Ahead (Today agenda) panel removed from Stock Stickies.
- **Backup cleanup fix:** batches of 400 deletes failed with "Transaction too big"; now 20 per
  batch (halving on that error), plus a **Clean up old backups** button. First run removed
  838 of the owner's 1,029 backups (194 remain).
- **User Guide button:** plain gradient, no outline ring; focus ring only for keyboard focus.
