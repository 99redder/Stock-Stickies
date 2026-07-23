# Stock Stickies — Project Context

## Overview
A React SPA for managing stock-related sticky notes with portfolio tracking, real-time stock quotes, news, and cloud sync via Firebase. Deployed to GitHub Pages at `https://stockstickies.com`.

---

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React 19 (npm) |
| Build Tool | Vite 7 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite` plugin) |
| Auth & DB | Firebase v12 — Firestore + Firebase Auth |
| Security | Firebase App Check with reCAPTCHA v3 |
| Stock API | Finnhub (quotes, fundamentals, earnings) |
| News API | MarketAux |
| Charts | Chart.js v4 + chartjs-plugin-datalabels |
| Screenshot | html2canvas-pro |

---

## File Structure
```
Sticky-Notes/
├── index.html                         # Vite entry point — SEO meta tags, JSON-LD schema live here
├── vite.config.js                     # Vite config (react + tailwindcss plugins)
├── package.json                       # npm scripts: dev, build, lint, preview
├── eslint.config.js
├── CLAUDE.md                          # This file
├── ENCRYPTION_IMPLEMENTATION.md
├── SECURITY_RECOMMENDATIONS.md
├── CNAME                              # GitHub Pages domain → www.stockstickies.com
├── public/
│   ├── robots.txt                     # SEO: allow all, link to sitemap
│   ├── sitemap.xml                    # SEO: canonical URL for the SPA
│   └── assets/
│       ├── stock-stickies-favicon.svg
│       ├── stock-stickies-google-cloud-logo-1024.png   # OG image
│       └── stock-stickies-google-cloud-logo-512.png
├── src/
│   ├── main.jsx                       # React root render (ReactDOM.createRoot)
│   ├── App.jsx                        # ENTIRE application (~3840 lines) — see map below
│   ├── App.css
│   ├── index.css
│   └── components/
│       └── NoteCard.jsx               # Draggable note card component
└── assets/                            # Mirror of public/assets (keep in sync)
```

### Build & Deploy
```bash
npm run dev        # Local dev server (Vite HMR)
npm run build      # Produces dist/ — then push to GitHub Pages
npm run preview    # Preview dist/ locally
```
GitHub Pages reads from the `main` branch. The `CNAME` file routes `www.stockstickies.com` to the Pages site.

---

## src/App.jsx — Navigation Map (~3840 lines)

**This is a single-file React component.** All logic, state, hooks, and JSX live in `StickyNotesApp` (line 330–3838) plus top-level helpers.

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
3. **Portfolio View** — Pie chart of holdings with real-time prices; updates 3× daily at 9:35 AM, 1:00 PM, 4:05 PM EST; 8-hour cache
4. **Stock Data** — Live quotes, fundamentals, 52-week range, earnings dates (Finnhub API)
5. **News Feed** — Per-ticker news from MarketAux API
6. **Watch List** — Track tickers without creating notes
7. **Dark Mode** — Toggle; synced to `<html>` class and `localStorage`
8. **Cloud Sync** — Firestore real-time sync with offline support; sync status indicator in UI
9. **Shares Privacy Mode** — Toggle to hide share counts from view

---

## Note Object Structure
```javascript
{
  id: number,            // Unique identifier (auto-increment)
  title: string,         // Ticker symbol — 1–5 uppercase alphanumeric chars
  text: string,          // Note content — up to 10,000 chars
  color: string,         // Tailwind bg class (e.g., 'bg-blue-200')
  classified: boolean,   // true if note has been assigned to a category
  shares?: number,       // Optional share count for portfolio tracking
  account?: string       // Brokerage account id: 'individual' | 'traditional' | 'roth'
}                        // Missing/invalid → treated as 'unassigned'
```

---

## Brokerage Accounts
Positions are assigned to one of three accounts (`ACCOUNTS` in `src/App.jsx`), each with
its own investing intent:

| id | Label | Intent |
|---|---|---|
| `individual` | Individual | Taxable brokerage — swing trades, shorter horizon |
| `traditional` | Traditional IRA | Long-term buy-and-hold core of quality names |
| `roth` | Roth IRA | Speculative "moon shot" names and most cash secured puts — tax-free growth upside |

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
modal and shown as a pill on each row. Legacy puts written before the field existed fall
back to `roth` rather than Unassigned, since every one of them was in the Roth. Per-account
obligation totals live in `putObligationByAccount`. The donut's centre callout and the
footnote under the chart use `shownPutObligation`, which follows the account filter — a
single-account view must not report the whole book's obligation. The CSP sidebar panel
still totals every put, since it lists them all.

Ask K always receives **all** accounts regardless of the on-screen filter: each position
carries `account`, `accountLabel`, `percentOfPortfolio`, and `percentOfAccount`, and the
payload includes an `accounts` array with per-account totals and strategy text. The account
intents are also described in the Ask K worker system prompt (`worker/src/index.js`).

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
1. Login/logout (verify data persists across sessions)
2. Create/edit/delete notes
3. Add/delete/recolor categories (notes must stay in assigned category)
4. Category reassignment modal when deleting a category with notes
5. Dark mode toggle
6. Portfolio chart updates at scheduled times; privacy mode toggle
7. Stock data & news fetching (requires Finnhub/MarketAux keys)
8. Cloud sync status indicator
9. Page refresh persistence
10. Logout → login (categories and notes persist)
11. Watch list: add ticker, click to expand, remove

---

## Recent Updates (Feb 2026)

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
