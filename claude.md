# Stock Stickies - Project Context

## Overview
A single-page React application for managing stock-related sticky notes with portfolio tracking, real-time stock data, and cloud sync via Firebase.

## Tech Stack
- **Frontend**: React 18 (via CDN), Babel for JSX transpilation
- **Styling**: Tailwind CSS (via CDN)
- **Backend**: Firebase Firestore (real-time database), Firebase Authentication
- **APIs**: Finnhub (stock quotes), MarketAux (news)
- **Charts**: Chart.js with Data Labels plugin
- **Security**: Firebase App Check with reCAPTCHA v3, AES-GCM encryption for API keys

## File Structure
```
Sticky-Notes/
├── index.html          # Single-file application (all code embedded)
├── claude.md           # This file - project context
├── ENCRYPTION_IMPLEMENTATION.md
└── SECURITY_RECOMMENDATIONS.md
```

## Key Features
1. **Sticky Notes**: Create, edit, delete notes with ticker symbols and share counts
2. **Categories**: Customizable color-coded categories (add, delete, change colors)
3. **Portfolio View**: Pie chart visualization of holdings with real-time prices
   - Updates 3x daily: 9:35 AM (market open), 1:00 PM (midday), 4:05 PM (market close) EST
   - Prices cached locally to minimize API calls
4. **Stock Data**: Live quotes, fundamentals, 52-week range, earnings dates
5. **News Feed**: MarketAux integration for stock news
6. **Watch List**: Track stocks without notes
7. **Dark Mode**: Toggle between light/dark themes
8. **Cloud Sync**: Real-time sync via Firebase with offline support

## Important Code Locations (index.html)

### Constants & Configuration
- **Lines 74-97**: Color constants (`DEFAULT_COLOR_LABELS`, `DEFAULT_COLORS`, `AVAILABLE_COLORS`, `MIN_CATEGORIES`, `MAX_CATEGORIES`)
- **Lines 86-91**: Input validation constants

### State Management
- **Lines 294-345**: All useState declarations
- **Line 304**: `isLoadingRef` - Prevents orphan repair during data load
- **Line 311**: `categories` state (dynamic category colors)
- **Lines 312-317**: Category modal states

### Critical Refs (Race Condition Prevention)
- **Line 303**: `isSavingRef` - Prevents loading during save
- **Line 304**: `isLoadingRef` - Prevents orphan repair during load
- **Line 703**: `isChangingColorRef` - Prevents orphan repair during color change

### Core Functions
- **Lines 535-567**: `handleLogin` - Authentication
- **Lines 571-617**: `syncNow` - Firestore sync (properly awaited)
- **Lines 641-649**: `handleLogout` - Awaits sync before logout
- **Lines 651-653**: `classifyNote` - Assign note to category
- **Lines 655-659**: `deleteNote` - Delete a note

### Category Management Functions (Lines 661-730)
- `getAvailableColors()` - Colors not in use
- `getNotesCountForCategory()` - Count notes per category
- `addCategory()` - Add new category
- `handleDeleteCategory()` - Delete with reassignment check
- `confirmDeleteCategory()` - Execute deletion after reassignment
- `changeCategoryColor()` - Change category color (with race condition protection)

### Auto-Repair Logic
- **Lines 759-776**: Orphaned notes repair (skips during load/color change)
- **Lines 778-791**: Missing category labels repair (skips during load)

### Data Loading (Lines 364-425)
- Firestore onSnapshot listener
- Sets `isLoadingRef` during load to prevent orphan repair
- Loads categories FIRST, then notes (order matters!)
- 200ms delay before clearing loading flag

### UI Components
- **Lines 1268-1306**: Login page (dark mode styled)
- **Lines 1291-1531**: Expanded note modal with stock data
- **Lines 1684-1798**: Category management modals (Add Category, Reassign Notes)
- **Lines 2075-2135**: Legend UI with add/delete/color-change buttons
- **Lines 2136-2158**: Unclassified notes section
- **Lines 2159-2220**: Category sections with notes grid
- **Lines 2310-2312**: Fixed footer ("Website created by Chris Gorham")

## Race Condition Fixes

### Problem: Notes moving to wrong category
When changing category colors, a race condition occurred:
1. `setCategories()` updated categories array
2. Orphan repair ran before `setNotes()` completed
3. Notes appeared "orphaned" and got moved to first category

### Solution
- Added `isChangingColorRef` flag set before color change
- Orphan repair checks this flag and skips if true
- Flag resets after 100ms timeout

### Problem: Data not persisting on logout
The logout function wasn't waiting for sync to complete.

### Solution
- `syncNow()` now properly awaits Firestore write
- `handleLogout()` awaits `syncNow()` before signing out
- Added `isLoadingRef` to prevent orphan repair during login data load
- Data load order changed: categories first, then notes

### Problem: Category labels resetting to "Category" on login
The missing labels repair was running before colorLabels loaded from Firestore.

### Solution
- Added `isLoadingRef` check to missing labels repair useEffect
- Repair now skips during initial data load

### Problem: Categories and notes lost on logout/login
The auto-save useEffect (line 437) was missing `categories` in updateData object.

### Solution
- Added `categories` to updateData in auto-save useEffect (line 440)
- Now all three save locations include categories: syncNow, auto-save, beforeunload

### Problem: Notes don't load on login until page refresh
The `isSavingRef.current` was still `true` from a previous save, blocking data load.

### Solution
- Reset `isSavingRef`, `isLoadingRef`, and clear `saveTimeoutRef` in handleLogout
- Ensures clean state when user logs back in

## Color System
Categories use Tailwind CSS background classes:
```javascript
AVAILABLE_COLORS = [
  'bg-yellow-200', 'bg-yellow-300', 'bg-yellow-400',
  'bg-pink-200', 'bg-pink-300', 'bg-pink-400',
  'bg-blue-200', 'bg-blue-300', 'bg-blue-400',
  'bg-green-200', 'bg-green-300', 'bg-green-400',
  'bg-red-200', 'bg-red-300', 'bg-red-400',
  'bg-orange-200', 'bg-orange-300', 'bg-orange-400',
  'bg-purple-200', 'bg-purple-300', 'bg-purple-400',
  'bg-teal-200', 'bg-teal-300', 'bg-cyan-200'
]
```

## Note Object Structure
```javascript
{
  id: number,           // Unique identifier
  title: string,        // Ticker symbol (1-5 chars, uppercase)
  text: string,         // Note content (up to 10,000 chars)
  color: string,        // Tailwind bg class (e.g., 'bg-yellow-200')
  classified: boolean,  // Whether note has been categorized
  shares?: number       // Optional: shares for portfolio tracking
}
```

## Portfolio Update Schedule
```javascript
// 15-minute fetch windows (EST):
// - Market open: 9:35-9:50 AM
// - Midday: 1:00-1:15 PM
// - Market close: 4:05-4:20 PM
// Cache expires after 8 hours
```

## Testing Checklist
1. Login/logout functionality (verify data persists)
2. Create/edit/delete notes
3. Add/delete/recolor categories (notes should stay in place)
4. Category reassignment when deleting with notes
5. Dark mode toggle
6. Portfolio chart updates at scheduled times
7. Stock data fetching
8. Cloud sync (check sync status indicator)
9. Page refresh persistence
10. Logout and login (categories and notes should persist)
