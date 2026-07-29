// =============================================================================
// FILE: src/App.jsx  (~3840 lines)
// ROLE: Entire Stock Stickies application — one React component (StickyNotesApp)
//       plus top-level constants/helpers above it.
//
// QUICK NAVIGATION FOR AI AGENTS
// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS & FIREBASE INIT        Lines   1–39
// SVG ICON COMPONENTS            Lines  41–67
// CONSTANTS (colors, limits)     Lines  68–99
// VALIDATION HELPERS             Lines 100–169
// UTILITY FUNCTIONS              Lines 170–329
//   └─ buildApiUrl, sleep, fetchWithRetry, stock/news fetch helpers
//
// StickyNotesApp (function start) Line  330
//
// STATE DECLARATIONS             Lines 331–425
//   ├─ Auth/UI state             Lines 331–340
//   ├─ isSavingRef               Line  341   ← blocks snapshot during save
//   ├─ isLoadingRef              Line  342   ← blocks repair during data load
//   ├─ Notes & categories        Lines 344–350
//   ├─ Category modals           Lines 351–357
//   ├─ Expanded note / stock     Lines 358–364
//   └─ Watch list, profile, portfolio, tabs, sort, privacy
//
// useEFFECTS (in order)
//   Dark mode sync               Line  372
//   Auth state listener          Line  487
//   Firestore onSnapshot         Line  503   ← loads data; sets isLoadingRef
//   Auto-save (debounced 2s)     Line  571
//   beforeunload save            Line  643
//   Stock data fetch             Line 1183
//   Orphan note repair           Line 1326   ← skips if isChangingColorRef/isLoadingRef
//   Missing label repair         Line 1343   ← skips if isLoadingRef
//   Watch list / news fetch      Line 1358
//   Portfolio price fetch        Line 1617   ← 9:35 AM / 1 PM / 4:05 PM EST
//
// CORE FUNCTIONS
//   handleLogin                  Line  700
//   syncNow                      Line  825
//   handleLogout                 Line 1067
//   classifyNote                 Line 1085
//   deleteNote                   Line 1089
//
// CATEGORY MANAGEMENT            Line 1095
//   getAvailableColors, addCategory, handleDeleteCategory,
//   confirmDeleteCategory, changeCategoryColor (uses isChangingColorRef ~1140)
//
// JSX / UI COMPONENTS
//   Login page JSX               Line ~2077
//   Legal modals (main app)      Line ~2381
//   Expanded note modal          Line ~2461
//   Add Category modal           Line ~2900
//   Main toolbar                 Line ~3100
//   Notes grid + legend          Line ~3400
//   Watch List panel             Line ~3700
//   Footer                       Line ~3823
//
// export default StickyNotesApp  Line 3839
// =============================================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import firebase from 'firebase/compat/app'
import 'firebase/compat/auth'
import 'firebase/compat/firestore'
import 'firebase/compat/app-check'
import { Chart } from 'chart.js/auto'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import html2canvas from 'html2canvas-pro'
import { copyYtdCardToClipboard, createYtdShareCard, shareOrDownloadYtdCard } from './utils/ytdShareCard'
import NoteCard from './components/NoteCard.jsx'
import AskK from './components/AskK.jsx'
import TodayAgenda from './components/TodayAgenda.jsx'
import RobinhoodSync from './components/RobinhoodSync.jsx'

const OWNER_FIREBASE_UID = 'tQ4KeGwCjsb5CSbrFwmWYWX3BvI2'

// Firebase web config (public client config; restrict key in Google Cloud Console)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''

};


        // Initialize Firebase
        let db = null;
        let auth = null;
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }

            // Initialize App Check with reCAPTCHA v3 (public site key)
            const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY || '';
            if (appCheckSiteKey) {
                const appCheck = firebase.appCheck();
                appCheck.activate(appCheckSiteKey, false);
            }

            db = firebase.firestore();
            auth = firebase.auth();

            // Buffer writes locally in IndexedDB so data survives tab closes / network hiccups
            db.enablePersistence({ cache: 'owning-tab' }).catch((err) => {
                if (err.code === 'failed-precondition') {
                    console.warn('Firestore persistence unavailable (multiple tabs open)');
                } else if (err.code === 'unimplemented') {
                    console.warn('Firestore persistence not supported in this browser');
                }
            });
        } catch (error) {
            console.error("Firebase initialization error:", error);
        }

        // Icons
        const Plus = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
        const X = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
        const Edit2 = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>;
        const Check = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>;
        const LogOut = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
        const Moon = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
        const Sun = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
        const ChevronDown = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>;
        const ChevronRight = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>;
        const Grip = ({ size = 24 }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="9" cy="7" r="1.5" />
                <circle cx="15" cy="7" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="17" r="1.5" />
                <circle cx="15" cy="17" r="1.5" />
            </svg>
        );
        const Cloud = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>;
        const CloudOff = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
        const Maximize = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>;
        const Eye = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
        const EyeOff = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
        const Clipboard = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/></svg>;
        const Lock = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
        const Unlock = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>;
        const Download = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
        const Share = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.6 6.8-4.2M8.6 13.4l6.8 4.2"/></svg>;

        // Default stock-focused categories (users can customize/delete/add later)
        const DEFAULT_COLOR_LABELS = {
            'bg-blue-600': 'Core Holding',
            'bg-green-600': 'Swing Trade',
            'bg-purple-600': 'Value',
            'bg-orange-500': 'Growth',
            'bg-red-600': 'Speculative'
        };


        const DEFAULT_COLORS = ['bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-orange-500', 'bg-red-600'];
        const UNCLASSIFIED_COLOR = 'bg-gray-400';


        // Available bold solid colors for category customization
        const AVAILABLE_COLORS = [
            'bg-yellow-500', 'bg-yellow-600',
            'bg-pink-500', 'bg-pink-600',
            'bg-blue-500', 'bg-blue-600', 'bg-blue-700',
            'bg-green-500', 'bg-green-600', 'bg-green-700',
            'bg-red-500', 'bg-red-600', 'bg-red-700',
            'bg-orange-500', 'bg-orange-600',
            'bg-purple-500', 'bg-purple-600', 'bg-purple-700',
            'bg-teal-500', 'bg-teal-600',
            'bg-cyan-500', 'bg-cyan-600',
            'bg-indigo-500', 'bg-indigo-600',
            'bg-rose-500', 'bg-rose-600',
            'bg-amber-500', 'bg-amber-600',
            'bg-lime-500', 'bg-lime-600',
        ];
        const TREEMAP_COLORS = [
            '#16a34a', '#c92a24', '#3b82f6', '#a16207', '#7c3aed',
            '#0f766e', '#b91c1c', '#2563eb', '#be123c', '#4d7c0f',
            '#c2410c', '#4338ca', '#047857', '#991b1b', '#0369a1'
        ];
        const layoutPortfolioTreemapTiles = (tiles, width = 100, height = 100) => {
            const validTiles = tiles
                .filter(tile => tile.value > 0)
                .sort((a, b) => b.value - a.value);
            const totalValue = validTiles.reduce((sum, tile) => sum + tile.value, 0);
            if (!totalValue) return [];

            const out = [];
            const partition = (items, x, y, w, h) => {
                if (items.length === 1) {
                    out.push({ ...items[0], x, y, w, h });
                    return;
                }

                const groupTotal = items.reduce((sum, item) => sum + item.value, 0);
                const half = groupTotal / 2;
                let splitIndex = 1;
                let running = 0;
                let bestGap = Infinity;
                for (let index = 0; index < items.length - 1; index += 1) {
                    running += items[index].value;
                    const gap = Math.abs(half - running);
                    if (gap < bestGap) {
                        bestGap = gap;
                        splitIndex = index + 1;
                    }
                }

                const first = items.slice(0, splitIndex);
                const second = items.slice(splitIndex);
                const firstValue = first.reduce((sum, item) => sum + item.value, 0);
                const firstShare = groupTotal ? firstValue / groupTotal : 0.5;

                if (w >= h) {
                    const firstW = w * firstShare;
                    partition(first, x, y, firstW, h);
                    partition(second, x + firstW, y, w - firstW, h);
                } else {
                    const firstH = h * firstShare;
                    partition(first, x, y, w, firstH);
                    partition(second, x, y + firstH, w, h - firstH);
                }
            };

            partition(validTiles, 0, 0, width, height);
            return out;
        };
        const MIN_CATEGORIES = 1;
        const MAX_CATEGORIES = 10;

        // Brokerage accounts a position can be assigned to. `strategy` is descriptive
        // context only — it is shipped to Ask K so answers can be framed per account.
        const ACCOUNTS = [
            { id: 'individual', label: 'Individual', strategy: 'Taxable individual brokerage — primarily swing trades and shorter-horizon positions.' },
            { id: 'traditional', label: 'Traditional IRA', strategy: 'Traditional IRA — long-term buy-and-hold core of quality names.' },
            { id: 'roth', label: 'Roth IRA', strategy: 'Roth IRA — higher-risk speculative "moon shot" names plus cash secured puts, where tax-free growth has the most upside. All CSPs are written in this account.' }
        ];
        const ACCOUNT_IDS = ACCOUNTS.map(a => a.id);
        const DEFAULT_ACCOUNT_ID = 'individual';
        const UNASSIGNED_ACCOUNT_ID = 'unassigned';
        // Notes created before accounts existed have no `account` field. They stay in an
        // explicit "Unassigned" bucket rather than silently landing in a real account.
        const getNoteAccount = (note) =>
            ACCOUNT_IDS.includes(note?.account) ? note.account : UNASSIGNED_ACCOUNT_ID;
        const getAccountLabel = (accountId) =>
            ACCOUNTS.find(a => a.id === accountId)?.label || 'Unassigned';

        // Input validation constants
        const MAX_TITLE_LENGTH = 10; // For ticker symbols
        const MAX_CONTENT_LENGTH = 10000; // For note content
        const MAX_NICKNAME_LENGTH = 50;
        const MAX_API_KEY_LENGTH = 200;

        // Input validation functions
        const normalizeEmail = (email) => {
            if (!email || typeof email !== 'string') return '';
            return email.trim().toLowerCase();
        };

        const validateTicker = (ticker) => {
            if (!ticker || typeof ticker !== 'string') return false;
            const trimmed = ticker.trim().toUpperCase();
            // 1-5 letters/numbers, optionally followed by a class suffix after a dot.
            // Class shares are quoted this way — Moog is MOG.A, Berkshire is BRK.B.
            const tickerRegex = /^[A-Z0-9]{1,5}(\.[A-Z0-9]{1,3})?$/;
            return tickerRegex.test(trimmed) && trimmed.length <= MAX_TITLE_LENGTH;
        };

        const sanitizeTicker = (ticker) => {
            if (!ticker || typeof ticker !== 'string') return '';
            // Keep letters, numbers and the dot that separates a share class. Everything
            // else is dropped, and the dot is normalised so partial typing can't leave a
            // leading or doubled dot behind ("..A", ".MOG").
            let sanitized = ticker.replace(/[^A-Z0-9.]/gi, '').toUpperCase();
            sanitized = sanitized.replace(/\.{2,}/g, '.').replace(/^\.+/, '');
            const firstDot = sanitized.indexOf('.');
            if (firstDot !== -1) {
                // At most one dot — drop any further ones in the suffix.
                sanitized = sanitized.slice(0, firstDot + 1) + sanitized.slice(firstDot + 1).replace(/\./g, '');
            }
            return sanitized.substring(0, MAX_TITLE_LENGTH);
        };

        const validateApiKey = (key, type) => {
            if (!key || typeof key !== 'string') return false;
            const trimmed = key.trim();
            if (trimmed.length === 0 || trimmed.length > MAX_API_KEY_LENGTH) return false;

            // Basic format validation - alphanumeric and common special chars
            const apiKeyRegex = /^[a-zA-Z0-9\-_]+$/;
            if (!apiKeyRegex.test(trimmed)) return false;

            // Type-specific validation
            if (type === 'finnhub') {
                // Finnhub keys are typically 20+ characters
                return trimmed.length >= 20;
            }
            if (type === 'marketaux') {
                // MarketAux keys are typically 32+ characters
                return trimmed.length >= 32;
            }
            return true; // Generic validation passed
        };

        const validateContent = (content) => {
            if (content === null || content === undefined) return true; // Allow empty
            if (typeof content !== 'string') return false;
            return content.length <= MAX_CONTENT_LENGTH;
        };

        const validateNickname = (nickname) => {
            if (!nickname || typeof nickname !== 'string') return true; // Allow empty
            const trimmed = nickname.trim();
            if (trimmed.length > MAX_NICKNAME_LENGTH) return false;
            // Allow alphanumeric, spaces, and common punctuation
            const nicknameRegex = /^[a-zA-Z0-9\s\-_.,!?']+$/;
            return nicknameRegex.test(trimmed);
        };

        const sanitizeContent = (content) => {
            if (content === null || content === undefined) return '';
            if (typeof content !== 'string') return String(content);
            // Limit length
            return content.substring(0, MAX_CONTENT_LENGTH);
        };

        // Helper function to build API URLs safely with URLSearchParams
        const buildApiUrl = (baseUrl, params) => {
            const url = new URL(baseUrl);
            Object.entries(params).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== '') {
                    url.searchParams.append(key, String(value));
                }
            });
            return url.toString();
        };

        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        const fetchWithRetry = async (url, options = {}, { retries = 3, backoffMs = 700, timeoutMs = 12000 } = {}) => {
            let lastError = null;

            for (let attempt = 0; attempt <= retries; attempt++) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    const response = await fetch(url, {
                        ...options,
                        signal: controller.signal
                    });
                    clearTimeout(timer);

                    if (response.status === 429 && attempt < retries) {
                        await sleep(backoffMs * Math.pow(2, attempt));
                        continue;
                    }

                    if (!response.ok) {
                        const retryable = response.status >= 500;
                        if (retryable && attempt < retries) {
                            await sleep(backoffMs * Math.pow(2, attempt));
                            continue;
                        }
                        throw new Error(`Request failed (${response.status})`);
                    }

                    return response;
                } catch (err) {
                    clearTimeout(timer);
                    lastError = err;
                    if (attempt < retries) {
                        await sleep(backoffMs * Math.pow(2, attempt));
                        continue;
                    }
                }
            }

            throw lastError || new Error('Request failed after retries');
        };

        // API Key Encryption/Decryption using Web Crypto API
        // Derives encryption key from user's Firebase UID for security
        const getEncryptionKey = async (userId) => {
            const encoder = new TextEncoder();
            // Use a combination of userId and a constant salt for key derivation
            // In production, you might want to use a more sophisticated approach
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                encoder.encode(userId + '|StockStickies|2024'), // Salt with app identifier
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );

            // Use a fixed salt for consistency (in production, consider storing per-user salt)
            const salt = encoder.encode('StockStickiesSalt2024');

            const derivedKey = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );

            return derivedKey;
        };

        // Encrypt API key before storing in Firestore
        const encryptApiKey = async (apiKey, userId) => {
            if (!apiKey || !userId) return null;

            try {
                const key = await getEncryptionKey(userId);
                const encoder = new TextEncoder();
                const data = encoder.encode(apiKey);

                // Generate a random IV for each encryption
                const iv = crypto.getRandomValues(new Uint8Array(12));

                const encrypted = await crypto.subtle.encrypt(
                    { name: 'AES-GCM', iv: iv },
                    key,
                    data
                );

                // Convert to base64 for storage in Firestore
                const encryptedArray = Array.from(new Uint8Array(encrypted));
                const ivArray = Array.from(iv);

                return {
                    encrypted: btoa(String.fromCharCode(...encryptedArray)),
                    iv: btoa(String.fromCharCode(...ivArray)),
                    version: '1' // For future migration support
                };
            } catch (error) {
                console.error('Encryption error:', error);
                return null;
            }
        };

        // Decrypt API key after loading from Firestore
        const decryptApiKey = async (encryptedData, userId) => {
            if (!encryptedData) return '';
            if (!userId) return '';

            // Handle legacy unencrypted keys (for migration)
            if (typeof encryptedData === 'string') {
                return encryptedData; // Return as-is if it's a plain string
            }

            // Handle encrypted keys
            if (!encryptedData || typeof encryptedData !== 'object') {
                return '';
            }

            if (!encryptedData.encrypted || !encryptedData.iv) {
                return '';
            }

            try {
                const key = await getEncryptionKey(userId);

                // Decode from base64
                const encrypted = Uint8Array.from(
                    atob(encryptedData.encrypted),
                    c => c.charCodeAt(0)
                );
                const iv = Uint8Array.from(
                    atob(encryptedData.iv),
                    c => c.charCodeAt(0)
                );

                const decrypted = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: iv },
                    key,
                    encrypted
                );

                const decoder = new TextDecoder();
                return decoder.decode(decrypted);
            } catch (error) {
                console.error('Decryption error:', error);
                // If decryption fails, try to return as string (might be legacy format)
                if (typeof encryptedData === 'string') {
                    return encryptedData;
                }
                return '';
            }
        };

        // Strip undefined values from a data object before writing to Firestore
        const sanitizeUserDocForSave = (data) => {
            const out = {};
            for (const [k, v] of Object.entries(data)) {
                if (v !== undefined) out[k] = v;
            }
            return out;
        };

        const isPlaidCryptoNote = (note) =>
            note?.plaidIsCrypto === true || note?.plaidSecurityType === 'cryptocurrency';

        const getPlaidCryptoPrice = (note) => {
            if (!isPlaidCryptoNote(note)) return 0;
            const price = Number(note?.plaidInstitutionPrice);
            return Number.isFinite(price) && price > 0 ? price : 0;
        };

        const getPlaidPositionPrice = (note) => {
            const price = Number(note?.plaidInstitutionPrice);
            return note?.plaidSource === 'robinhood' && Number.isFinite(price) && price > 0 ? price : 0;
        };

        function StickyNotesApp() {
            const [currentUser, setCurrentUser] = useState(null);
            const [userDataReady, setUserDataReady] = useState(false);
            const [loginUsername, setLoginUsername] = useState('');
            const [loginPassword, setLoginPassword] = useState('');
            const [isSignup, setIsSignup] = useState(false);
            const [loginError, setLoginError] = useState('');
            const [darkMode, setDarkMode] = useState(false);
            const [isResettingPassword, setIsResettingPassword] = useState(false);
            const [resetSuccess, setResetSuccess] = useState(false);
            const [legalView, setLegalView] = useState(null); // 'privacy' | 'terms' | null
            const [syncStatus, setSyncStatus] = useState('synced');
            const isSavingRef = useRef(false);
            const isLoadingRef = useRef(false);
            const saveTimeoutRef = useRef(null);
            // Serialized copy of the last snapshot payload applied to state. Guards the
            // save→snapshot→save feedback loop described at applySnapshotData.
            const lastAppliedSnapshotRef = useRef(null);
            const lastBackupSignatureRef = useRef('');
            const lastBackupAtRef = useRef(0);
            const importedPositionBadgeBackfillRef = useRef(false);
            const [notes, setNotes] = useState([]);
            const [nextId, setNextId] = useState(1);
            const [colorLabels, setColorLabels] = useState(DEFAULT_COLOR_LABELS);
            const [editingLabel, setEditingLabel] = useState(null);
            const [tempLabel, setTempLabel] = useState('');
            const [collapsedCategories, setCollapsedCategories] = useState({});
            const [collapsedAccounts, setCollapsedAccounts] = useState({});
            // Notes whose shares/account fields are unlocked for editing. Deliberately not
            // persisted — every note starts locked again on reload, so the guard can't be
            // left permanently off by accident.
            const [unlockedNotes, setUnlockedNotes] = useState({});
            const toggleNoteLock = (noteId) => {
                setUnlockedNotes(prev => ({ ...prev, [noteId]: !prev[noteId] }));
            };
            const unlockedNoteCount = Object.values(unlockedNotes).filter(Boolean).length;
            const lockAllNotes = () => setUnlockedNotes({});
            const [categories, setCategories] = useState(DEFAULT_COLORS);
            // Category management modal states
            const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
            const [newCategoryLabel, setNewCategoryLabel] = useState('');
            const [newCategoryColor, setNewCategoryColor] = useState(null);
            const [categoryToDelete, setCategoryToDelete] = useState(null);
            const [reassignTarget, setReassignTarget] = useState(null);
            const [editingCategoryColor, setEditingCategoryColor] = useState(null);
            const [noteToDelete, setNoteToDelete] = useState(null);
            const [putToDelete, setPutToDelete] = useState(null);
            const [noticeModal, setNoticeModal] = useState({ open: false, title: '', message: '', type: 'info', onConfirm: null });
            const [backupModalOpen, setBackupModalOpen] = useState(false);
            const [backupSnapshots, setBackupSnapshots] = useState([]);
            const [backupsLoading, setBackupsLoading] = useState(false);
            const [restoringBackupId, setRestoringBackupId] = useState('');
            const [expandedNote, setExpandedNote] = useState(null);
            const [stockData, setStockData] = useState(null);
            const [stockLoading, setStockLoading] = useState(false);
            const [stockError, setStockError] = useState(null);
            const [finnhubApiKey, setFinnhubApiKey] = useState('');
            const [showApiKeySuccess, setShowApiKeySuccess] = useState(false);
            const [watchList, setWatchList] = useState([]);
            const [cashSecuredPuts, setCashSecuredPuts] = useState([]);

            // API key help popovers (click-to-toggle; closes on outside click / Escape)
            const [openHelp, setOpenHelp] = useState(null); // 'finnhub' | 'marketaux' | null
            const finnhubHelpRef = useRef(null);
            const marketauxHelpRef = useRef(null);

            // Keep page/overscroll background in sync with theme mode
            useEffect(() => {
                const bgColor = darkMode ? '#111827' : '#f3f4f6';
                document.documentElement.style.backgroundColor = bgColor;
                document.body.style.backgroundColor = bgColor;
            }, [darkMode]);

            // Quick Start Guide (logged-in only)
            const [quickStartOpen, setQuickStartOpen] = useState(false);

            // Login help (login page only)
            const [loginHelpOpen, setLoginHelpOpen] = useState(false);
            const loginHelpRef = useRef(null);

            const [newWatchTicker, setNewWatchTicker] = useState('');
            const [hideEmail, setHideEmail] = useState(false);
            const [nickname, setNickname] = useState('');
            const [profilePhoto, setProfilePhoto] = useState(''); // data URL or remote URL
            const [profilePhotoMenuOpen, setProfilePhotoMenuOpen] = useState(false);
            const profilePhotoInputRef = useRef(null);
            const profilePhotoMenuRef = useRef(null);
            const [ytdSharePreview, setYtdSharePreview] = useState(null);
            const [ytdCopyStatus, setYtdCopyStatus] = useState('');
            const [ytdCardUpdating, setYtdCardUpdating] = useState(false);
            const [editingNickname, setEditingNickname] = useState(false);
            const [hidePortfolioValues, setHidePortfolioValues] = useState(false);
            const [robinhoodPerformance, setRobinhoodPerformance] = useState(null);
            const [marketauxApiKey, setMarketauxApiKey] = useState('');
            const [newsData, setNewsData] = useState(null);
            const [newsLoading, setNewsLoading] = useState(false);
            const [watchListModalTicker, setWatchListModalTicker] = useState(null);
            const [showCashSecuredPutModal, setShowCashSecuredPutModal] = useState(false);
            const [newPutTicker, setNewPutTicker] = useState('');
            const [newPutStrike, setNewPutStrike] = useState('');
            const [newPutQty, setNewPutQty] = useState('');
            const [newPutExpiry, setNewPutExpiry] = useState('');
            const [newPutAccount, setNewPutAccount] = useState('roth');
            const [editingPutId, setEditingPutId] = useState(null);
            const [cashSecuredPutsSortMode, setCashSecuredPutsSortMode] = useState('alpha');

            const parseMoneyNumber = (value) => {
                const n = parseFloat(String(value || '').replace(/[^0-9.\-]/g, ''));
                return Number.isFinite(n) ? n : 0;
            };

            const formatUsd = (value) => new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 2,
            }).format(Number(value || 0));
            const formatSignedUsd = (value) => `${Number(value) > 0 ? '+' : ''}${formatUsd(value)}`;
            const formatSignedPercent = (value, digits = 1) =>
                `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(digits)}%`;

            const getPutObligation = (put) => parseMoneyNumber(put?.strike) * parseMoneyNumber(put?.qty) * 100;
            // CSPs predate account attribution. Every put written before this field existed
            // was in the Roth, so legacy records fall back there rather than to Unassigned.
            const getPutAccount = (put) => ACCOUNT_IDS.includes(put?.account) ? put.account : 'roth';
            const totalPutObligation = cashSecuredPuts.reduce((sum, put) => sum + getPutObligation(put), 0);
            const putObligationByAccount = cashSecuredPuts.reduce((acc, put) => {
                const id = getPutAccount(put);
                acc[id] = (acc[id] || 0) + getPutObligation(put);
                return acc;
            }, {});
            const sortedCashSecuredPuts = [...cashSecuredPuts].sort((a, b) => {
                if (cashSecuredPutsSortMode === 'obligation_desc') return getPutObligation(b) - getPutObligation(a);
                if (cashSecuredPutsSortMode === 'obligation_asc') return getPutObligation(a) - getPutObligation(b);
                return String(a.ticker || '').localeCompare(String(b.ticker || ''));
            });

            const addCashSecuredPut = () => {
                const ticker = sanitizeTicker(newPutTicker);
                const strike = String(newPutStrike || '').trim();
                const qty = String(newPutQty || '').trim();
                const expiry = String(newPutExpiry || '').trim();
                const account = ACCOUNT_IDS.includes(newPutAccount) ? newPutAccount : 'roth';
                if (!ticker || !strike || !qty || !expiry) return;
                if (editingPutId) {
                    setCashSecuredPuts((prev) => prev.map((item) => item.id === editingPutId ? { ...item, ticker, strike, qty, expiry, account } : item));
                } else {
                    setCashSecuredPuts((prev) => ([...prev, { id: Date.now(), ticker, strike, qty, expiry, account }]));
                }
                setNewPutTicker('');
                setNewPutStrike('');
                setNewPutQty('');
                setNewPutExpiry('');
                setNewPutAccount('roth');
                setEditingPutId(null);
                setShowCashSecuredPutModal(false);
            };

            const startEditCashSecuredPut = (put) => {
                setEditingPutId(put.id);
                setNewPutTicker(put.ticker || '');
                setNewPutStrike(put.strike || '');
                setNewPutQty(put.qty || '');
                setNewPutExpiry(put.expiry || '');
                setNewPutAccount(getPutAccount(put));
                setShowCashSecuredPutModal(true);
            };

            const removeCashSecuredPut = (id) => {
                setCashSecuredPuts((prev) => prev.filter((item) => item.id !== id));
            };
            const portfolioCardRef = useRef(null);

            const normalizeTicker = (value) => String(value || '').trim().toUpperCase();
            const isUsdTicker = (value) => normalizeTicker(value) === 'USD';
            // Each account parks its cash differently — the taxable account holds actual
            // dollars, the IRAs hold SGOV — but it is all one cash allocation. Treating
            // these tickers as cash-equivalent collapses them into a single pie slice
            // instead of one per account. SGOV keeps its real market price; only the
            // grouping changes.
            const CASH_EQUIVALENT_TICKERS = ['USD', 'SGOV'];
            const isCashEquivalentTicker = (value) => CASH_EQUIVALENT_TICKERS.includes(normalizeTicker(value));
            // Single definition of "this holding is cash" — a position counts either by
            // sitting in a category labelled Cash or by being a cash-equivalent ticker.
            const isCashHolding = (h) =>
                (colorLabels[h?.color] || '').trim().toLowerCase() === 'cash' || isCashEquivalentTicker(h?.ticker);
            const normalizePriceMap = (prices) => {
                const normalized = {};
                if (!prices || typeof prices !== 'object') return normalized;
                Object.entries(prices).forEach(([key, value]) => {
                    const ticker = normalizeTicker(key);
                    const numeric = typeof value === 'number' ? value : parseFloat(value);
                    if (ticker && Number.isFinite(numeric) && numeric > 0) {
                        normalized[ticker] = numeric;
                    }
                });
                return normalized;
            };
            // Load cached portfolio prices immediately on init for instant chart display
            const [portfolioPrices, setPortfolioPrices] = useState(() => {
                try {
                    const cached = localStorage.getItem('portfolio_prices_cache');
                    if (cached) {
                        const { prices } = JSON.parse(cached);
                        return normalizePriceMap(prices || {});
                    }
                } catch (e) {}
                return {};
            });
            const [portfolioLoading, setPortfolioLoading] = useState(false);
            const [mainTab, setMainTab] = useState('notes');
            const [portfolioViewMode, setPortfolioViewMode] = useState('donut'); // 'donut' | 'map'
            const [portfolioAccountFilter, setPortfolioAccountFilter] = useState('all'); // 'all' | account id | 'unassigned'
            const [portfolioLegendVisible, setPortfolioLegendVisible] = useState(true);
            const [portfolioLegendDollarAmounts, setPortfolioLegendDollarAmounts] = useState(false);
            const [portfolioDonutIncludesCash, setPortfolioDonutIncludesCash] = useState(true);
            const [notesGroupMode, setNotesGroupMode] = useState('account'); // 'account' | 'category' | 'size'
            const [hideLegendPanel, setHideLegendPanel] = useState(false);
            const [hideToolbarPanel, setHideToolbarPanel] = useState(false);
            const [sharesPrivacyMode, setSharesPrivacyMode] = useState('show'); // 'show' | 'hide'
            const [draggingCategory, setDraggingCategory] = useState(null);
            const [dragOverCategory, setDragOverCategory] = useState(null);
            const chartRef = useRef(null);
            const chartInstance = useRef(null);
            const portfolioDataRef = useRef([]);

            // Compute the active ticker for data fetching (from expanded note or watch list modal)
            const activeTicker = expandedNote?.title || watchListModalTicker;

            // Owner-only brokerage integrations
            const isOwnerPortfolioUser = auth?.currentUser?.uid === OWNER_FIREBASE_UID;

            // Close API key help popovers on outside click / Escape
            useEffect(() => {
                const onMouseDown = (e) => {
                    if (!openHelp) return;
                    const t = e.target;
                    const inFinnhub = finnhubHelpRef.current && finnhubHelpRef.current.contains(t);
                    const inMarketaux = marketauxHelpRef.current && marketauxHelpRef.current.contains(t);
                    if (!inFinnhub && !inMarketaux) setOpenHelp(null);
                };
                const onKeyDown = (e) => {
                    if (e.key === 'Escape') setOpenHelp(null);
                };
                document.addEventListener('mousedown', onMouseDown);
                document.addEventListener('keydown', onKeyDown);
                return () => {
                    document.removeEventListener('mousedown', onMouseDown);
                    document.removeEventListener('keydown', onKeyDown);
                };
            }, [openHelp]);

            // Close profile photo menu on outside click / Escape
            useEffect(() => {
                if (!profilePhotoMenuOpen) return;
                const onMouseDown = (e) => {
                    const t = e.target;
                    if (profilePhotoMenuRef.current && !profilePhotoMenuRef.current.contains(t)) {
                        setProfilePhotoMenuOpen(false);
                    }
                };
                const onKeyDown = (e) => {
                    if (e.key === 'Escape') setProfilePhotoMenuOpen(false);
                };
                document.addEventListener('mousedown', onMouseDown);
                document.addEventListener('keydown', onKeyDown);
                return () => {
                    document.removeEventListener('mousedown', onMouseDown);
                    document.removeEventListener('keydown', onKeyDown);
                };
            }, [profilePhotoMenuOpen]);

            // Close login help modal on outside click / Escape
            useEffect(() => {
                if (!loginHelpOpen) return;
                const onMouseDown = (e) => {
                    const t = e.target;
                    if (loginHelpRef.current && !loginHelpRef.current.contains(t)) setLoginHelpOpen(false);
                };
                const onKeyDown = (e) => {
                    if (e.key === 'Escape') setLoginHelpOpen(false);
                };
                document.addEventListener('mousedown', onMouseDown);
                document.addEventListener('keydown', onKeyDown);
                return () => {
                    document.removeEventListener('mousedown', onMouseDown);
                    document.removeEventListener('keydown', onKeyDown);
                };
            }, [loginHelpOpen]);


            useEffect(() => {
                if (!auth) return;
                const unsubscribe = auth.onAuthStateChanged((user) => {
                    if (user) {
                        setUserDataReady(false);
                        setCurrentUser(user.email);
                        maybeAdoptCanonicalUserDoc(user).then((migrated) => {
                            if (migrated) showBrandedNotice('We found your existing StickyNotes data and reattached it to this login method.', 'Account recovered');
                        }).catch((err) => console.warn('Account adoption check failed:', err));
                        // NOTE: do NOT set profilePhoto here. profilePhoto is in the auto-save dep
                        // array, so setting it triggers the auto-save immediately — before the Firestore
                        // snapshot has loaded the user's actual data. That causes isSavingRef to block
                        // the snapshot, and the auto-save then overwrites Firestore with empty/default state.
                        // The snapshot handler already sets profilePhoto correctly (with Google URL fallback).
                    } else {
                        setUserDataReady(false);
                        setCurrentUser(null);
                        setProfilePhoto('');
                        setProfilePhotoMenuOpen(false);
                    }
                });
                return () => unsubscribe();
            }, []);

            useEffect(() => {
                if (!currentUser || !db || !auth.currentUser) return;
                const userId = auth.currentUser.uid;

                // Reset isSavingRef on every login. It can be left true if a Firestore snapshot
                // echo fired between handleLogout's explicit reset and auth.signOut(). If left true
                // it blocks every snapshot in the new session and the user's data never loads.
                isSavingRef.current = false;
                lastAppliedSnapshotRef.current = null;

                const unsubscribe = db.collection('users').doc(userId)
                    .onSnapshot((doc) => {
                        // New user — no Firestore doc yet. Seed Google avatar if available so
                        // they see their photo immediately; the auto-save will persist it shortly.
                        if (!doc.exists) {
                            if (auth.currentUser?.photoURL) setProfilePhoto(auth.currentUser.photoURL);
                            setUserDataReady(true);
                            return;
                        }
                        if (!isSavingRef.current) {
                            const data = doc.data();

                            // Every auto-save writes a fresh serverTimestamp, so Firestore always
                            // echoes a snapshot back even when nothing meaningful changed. Calling
                            // the setters with freshly-deserialized objects hands React new
                            // identities for notes/colorLabels/categories/etc., which are deps of
                            // the auto-save effect — so the echo schedules another save, which
                            // echoes again, forever. That idle loop re-ran the portfolio chart
                            // effect every few seconds and made the chart visibly blink.
                            // Applying state only when the payload actually differs breaks it.
                            const incoming = {
                                categories: data.categories || DEFAULT_COLORS,
                                colorLabels: data.colorLabels || DEFAULT_COLOR_LABELS,
                                notes: data.notes || [],
                                nextId: data.nextId || 1,
                                collapsedCategories: data.collapsedCategories || {},
                                collapsedAccounts: data.collapsedAccounts || {},
                                darkMode: data.darkMode || false,
                                watchList: data.watchList || [],
                                cashSecuredPuts: data.cashSecuredPuts || [],
                                nickname: data.nickname || '',
                                profilePhoto: data.profilePhoto || auth.currentUser?.photoURL || '',
                                notesGroupMode: data.notesGroupMode || 'account',
                                portfolioLegendVisible: data.portfolioLegendVisible !== false,
                                portfolioLegendDollarAmounts: !!data.portfolioLegendDollarAmounts,
                                portfolioDonutIncludesCash: data.portfolioDonutIncludesCash !== false,
                                hideLegendPanel: data.hideLegendPanel || false,
                                hideToolbarPanel: data.hideToolbarPanel || false,
                                sharesPrivacyMode: data.sharesPrivacyMode || 'show'
                            };
                            const incomingKey = JSON.stringify(incoming);
                            if (incomingKey === lastAppliedSnapshotRef.current) {
                                // Pure echo of our own write — nothing to apply.
                                return;
                            }
                            lastAppliedSnapshotRef.current = incomingKey;

                            // Set loading flag to prevent orphan repair during data load
                            isLoadingRef.current = true;

                            // Load all data immediately - categories FIRST, then notes
                            setCategories(incoming.categories);
                            setColorLabels(incoming.colorLabels);
                            setNotes(incoming.notes);
                            setNextId(incoming.nextId);
                            setCollapsedCategories(incoming.collapsedCategories);
                            setCollapsedAccounts(incoming.collapsedAccounts);
                            setDarkMode(incoming.darkMode);
                            setWatchList(incoming.watchList);
                            setCashSecuredPuts(incoming.cashSecuredPuts);
                            setNickname(incoming.nickname);
                            setProfilePhoto(incoming.profilePhoto);
                            setNotesGroupMode(incoming.notesGroupMode);
                            setPortfolioLegendVisible(incoming.portfolioLegendVisible);
                            setPortfolioLegendDollarAmounts(incoming.portfolioLegendDollarAmounts);
                            setPortfolioDonutIncludesCash(incoming.portfolioDonutIncludesCash);
                            setHideLegendPanel(incoming.hideLegendPanel);
                            setHideToolbarPanel(incoming.hideToolbarPanel);
                            setSharesPrivacyMode(incoming.sharesPrivacyMode);

                            // Reset loading flag after state updates settle
                            setTimeout(() => { isLoadingRef.current = false; }, 200);

                            // Handle API keys - support both encrypted and plain text formats
                            // Try to decrypt, but fallback to plain string if decryption fails or data is plain text.
                            // IMPORTANT: never call setter('') here — a null/missing key in the snapshot just means
                            // it wasn't saved yet (race with async decryption). Calling setter('') would wipe a
                            // valid in-memory key and trigger an auto-save that nulls it in Firestore permanently.
                            // The only way a key should become '' is through direct user action (clearing the input).
                            const handleApiKey = async (apiKeyData, setter) => {
                                if (!apiKeyData) {
                                    // Field is null/missing in Firestore — leave existing state alone
                                    return;
                                }

                                // If it's already a plain string, use it directly
                                if (typeof apiKeyData === 'string') {
                                    setter(apiKeyData);
                                    return;
                                }

                                // If it's an object, try to decrypt
                                if (typeof apiKeyData === 'object' && apiKeyData.encrypted && apiKeyData.iv) {
                                    try {
                                        const decrypted = await decryptApiKey(apiKeyData, userId);
                                        if (decrypted) setter(decrypted);
                                        // If decrypted is empty, leave existing state alone
                                    } catch (err) {
                                        console.error('Decryption error — leaving existing key in state:', err);
                                        // Do NOT call setter('') — that would wipe a valid key
                                    }
                                }
                                // Unknown format — leave existing state alone
                            };

                            // Decrypt API keys asynchronously (non-blocking)
                            handleApiKey(data.finnhubApiKey, setFinnhubApiKey);
                            handleApiKey(data.marketauxApiKey, setMarketauxApiKey);
                            setUserDataReady(true);
                        }
                    }, (error) => {
                        console.error('Firestore snapshot error:', error);
                    });
                return () => unsubscribe();
            }, [currentUser]);

            useEffect(() => {
                if (currentUser && auth.currentUser && db) {
                    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

                    // Immediately block incoming updates while we have pending changes
                    isSavingRef.current = true;

                    const timeout = setTimeout(async () => {
                        setSyncStatus('syncing');
                        const userId = auth.currentUser.uid;

                        const updateData = {
                            notes,
                            colorLabels,
                            categories,
                            nextId,
                            collapsedCategories,
                            collapsedAccounts,
                            darkMode,
                            watchList,
                            cashSecuredPuts,
                            cashSecuredPutsSortMode,
                            nickname,
                            profilePhoto,
                            notesGroupMode,
                            portfolioLegendVisible,
                            portfolioLegendDollarAmounts,
                            portfolioDonutIncludesCash,
                            hideLegendPanel,
                            hideToolbarPanel,
                            sharesPrivacyMode,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        };

                        // Try to encrypt API keys, but fallback to plain text if encryption fails
                        // This ensures data is always saved even if encryption has issues
                        if (finnhubApiKey) {
                            try {
                                const encrypted = await encryptApiKey(finnhubApiKey, userId);
                                updateData.finnhubApiKey = encrypted || finnhubApiKey; // Fallback to plain text
                            } catch (err) {
                                console.warn('Encryption failed, storing as plain text:', err);
                                updateData.finnhubApiKey = finnhubApiKey; // Store as plain text on error
                            }
                        } else {
                            updateData.finnhubApiKey = null;
                        }

                        if (marketauxApiKey) {
                            try {
                                const encrypted = await encryptApiKey(marketauxApiKey, userId);
                                updateData.marketauxApiKey = encrypted || marketauxApiKey; // Fallback to plain text
                            } catch (err) {
                                console.warn('Encryption failed, storing as plain text:', err);
                                updateData.marketauxApiKey = marketauxApiKey; // Store as plain text on error
                            }
                        } else {
                            updateData.marketauxApiKey = null;
                        }

                        saveUserDoc(userId, auth.currentUser?.email || currentUser, updateData, { reason: 'autosave' }).then(() => {
                            setSyncStatus('synced');
                            setTimeout(() => { isSavingRef.current = false; }, 1000);
                        }).catch((err) => {
                            console.error('Firestore save error:', err);
                            setSyncStatus('offline');
                            isSavingRef.current = false;
                        });
                    }, 2000);

                    saveTimeoutRef.current = timeout;
                    return () => {
                        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                    };
                }
            }, [notes, colorLabels, categories, nextId, collapsedCategories, collapsedAccounts, darkMode, finnhubApiKey, marketauxApiKey, watchList, cashSecuredPuts, cashSecuredPutsSortMode, nickname, profilePhoto, notesGroupMode, portfolioLegendVisible, portfolioLegendDollarAmounts, portfolioDonutIncludesCash, hideLegendPanel, hideToolbarPanel, sharesPrivacyMode]);

            useEffect(() => {
                // IMPORTANT: beforeunload handlers MUST be synchronous. The browser kills the page
                // before any awaited Promise resolves, so async encryption cannot be used here.
                // We save API keys as plain text in this emergency path — better than losing data.
                // Firestore persistence (IndexedDB) queues the write locally even if the tab closes
                // before the server ACK, so the data survives.
                const handleBeforeUnload = () => {
                    if (currentUser && auth.currentUser && db) {
                        const userId = auth.currentUser.uid;
                        const updateData = sanitizeUserDocForSave({
                            notes,
                            colorLabels,
                            categories,
                            nextId,
                            collapsedCategories,
                            collapsedAccounts,
                            darkMode,
                            watchList,
                            cashSecuredPuts,
                            cashSecuredPutsSortMode,
                            nickname,
                            profilePhoto,
                            notesGroupMode,
                            portfolioLegendVisible,
                            portfolioLegendDollarAmounts,
                            portfolioDonutIncludesCash,
                            hideLegendPanel,
                            hideToolbarPanel,
                            sharesPrivacyMode,
                            // Store as plain text — async encryption cannot run in beforeunload
                            finnhubApiKey: finnhubApiKey || null,
                            marketauxApiKey: marketauxApiKey || null,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        // Fire-and-forget — Firestore persistence queues this to IndexedDB synchronously
                        db.collection('users').doc(userId).set(updateData, { merge: false });
                    }
                };

                window.addEventListener('beforeunload', handleBeforeUnload);
                return () => window.removeEventListener('beforeunload', handleBeforeUnload);
            }, [currentUser, notes, colorLabels, categories, nextId, collapsedCategories, collapsedAccounts, darkMode, finnhubApiKey, marketauxApiKey, watchList, cashSecuredPuts, cashSecuredPutsSortMode, nickname, profilePhoto, notesGroupMode, portfolioLegendVisible, portfolioLegendDollarAmounts, portfolioDonutIncludesCash, hideLegendPanel, hideToolbarPanel, sharesPrivacyMode]);

            const handleLogin = async (e) => {
                e.preventDefault();
                setLoginError('');
                setResetSuccess(false);
                if (!loginUsername || !loginPassword) {
                    setLoginError('Please enter both email and password');
                    return;
                }
                if (!auth) {
                    setLoginError('Firebase not configured');
                    return;
                }
                try {
                    const normalizedLoginEmail = normalizeEmail(loginUsername);
                    if (isSignup) {
                        const methods = await auth.fetchSignInMethodsForEmail(normalizedLoginEmail);
                        if (methods.includes('google.com')) {
                            setLoginError('That email already exists with Google sign-in. Use Continue with Google first, then link email/password from inside the account later.');
                            return;
                        }
                        if (methods.length && !methods.includes('password')) {
                            setLoginError(`That email already exists with a different sign-in method: ${methods.join(', ')}`);
                            return;
                        }
                        await auth.createUserWithEmailAndPassword(normalizedLoginEmail, loginPassword);
                    }
                    else if (isResettingPassword) {
                        await auth.sendPasswordResetEmail(normalizedLoginEmail);
                        setResetSuccess(true);
                        setIsResettingPassword(false);
                    } else {
                        const methods = await auth.fetchSignInMethodsForEmail(normalizedLoginEmail);
                        if (methods.includes('google.com') && !methods.includes('password')) {
                            setLoginError('This email is set up with Google sign-in. Use Continue with Google.');
                            return;
                        }
                        await auth.signInWithEmailAndPassword(normalizedLoginEmail, loginPassword);
                    }
                    setLoginUsername('');
                    setLoginPassword('');
                } catch (error) {
                    setLoginError(error.message);
                }
            };

            const handleGoogleLogin = async () => {
                setLoginError('');
                setResetSuccess(false);
                if (!auth) {
                    setLoginError('Firebase not configured');
                    return;
                }
                try {
                    const provider = new firebase.auth.GoogleAuthProvider();
                    await auth.signInWithPopup(provider);
                } catch (error) {
                    if (error?.code === 'auth/account-exists-with-different-credential') {
                        setLoginError('That email already exists with email/password. Sign in with your password first, then we can link Google to the same account.');
                        return;
                    }
                    setLoginError(error.message);
                }
            };

            const MAX_PROFILE_PHOTO_BYTES = 250 * 1024; // Firestore-friendly (~250KB)

            const fileToDataUrl = (file) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const resizeImageFileToJpegDataUrl = async (file, maxSize = 96, quality = 0.82) => {
                const originalDataUrl = await fileToDataUrl(file);
                const img = new Image();

                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = originalDataUrl;
                });

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) return originalDataUrl;

                const w = img.width || 1;
                const h = img.height || 1;
                const scale = Math.min(1, maxSize / Math.max(w, h));
                const outW = Math.max(1, Math.round(w * scale));
                const outH = Math.max(1, Math.round(h * scale));

                canvas.width = outW;
                canvas.height = outH;
                ctx.drawImage(img, 0, 0, outW, outH);

                const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
                return jpegDataUrl;
            };

            const handlePickProfilePhoto = () => {
                if (profilePhotoInputRef.current) profilePhotoInputRef.current.click();
            };

            const handleProfilePhotoSelected = async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                try {
                    if (!file.type?.startsWith('image/')) {
                        showBrandedNotice('Please choose an image file.');
                        return;
                    }

                    // Reset input so selecting the same file again still triggers change
                    e.target.value = '';

                    const resized = await resizeImageFileToJpegDataUrl(file);
                    const approxBytes = Math.ceil((resized.length * 3) / 4); // base64 → bytes (rough)
                    if (approxBytes > MAX_PROFILE_PHOTO_BYTES) {
                        showBrandedNotice('That image is still a bit large. Try a smaller file.');
                        return;
                    }

                    isSavingRef.current = true;
                    setProfilePhoto(resized);
                } catch (err) {
                    console.error('Profile photo error:', err);
                    showBrandedNotice('Could not load that image. Try a different one.');
                }
            };

            const clearProfilePhoto = () => {
                isSavingRef.current = true;
                setProfilePhoto('');
            };

            const updateNoteTitle = (noteId, title) => {
                // Sanitize and validate ticker input
                const sanitized = sanitizeTicker(title);
                if (sanitized.length > MAX_TITLE_LENGTH) return; // Prevent overly long input
                setNotes(notes.map(n => n.id === noteId ? {...n, title: sanitized} : n));
                if (expandedNote && expandedNote.id === noteId) {
                    setExpandedNote({...expandedNote, title: sanitized});
                }
            };

            // Write user data to Firestore and optionally create a snapshot backup
            const saveUserDoc = async (userId, email, data, options = {}) => {
                const { reason = 'save', forceBackup = false, minIntervalMs = 10 * 60 * 1000 } = options;
                const cleanData = sanitizeUserDocForSave(data);
                await db.collection('users').doc(userId).set(cleanData, { merge: false });

                const now = Date.now();
                const signature = JSON.stringify({ notes: cleanData.notes, categories: cleanData.categories });
                const timeSinceLastBackup = now - lastBackupAtRef.current;
                const signatureChanged = signature !== lastBackupSignatureRef.current;

                if (forceBackup || (signatureChanged && timeSinceLastBackup >= minIntervalMs)) {
                    lastBackupSignatureRef.current = signature;
                    lastBackupAtRef.current = now;
                    const snapshotData = {
                        ...cleanData,
                        backupCreatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        backupReason: reason
                    };
                    await db.collection('users').doc(userId).collection('snapshots').add(snapshotData);
                }
            };

            // Check if a user's data exists under an old email-keyed doc and migrate it to UID key
            const maybeAdoptCanonicalUserDoc = async (user) => {
                if (!db || !user?.uid) return false;
                try {
                    const uidDoc = await db.collection('users').doc(user.uid).get();
                    if (uidDoc.exists) return false;
                    if (!user.email) return false;
                    // Legacy docs were keyed by sanitized email (dots replaced with underscores)
                    const emailKey = normalizeEmail(user.email).replace(/\./g, '_');
                    const emailDoc = await db.collection('users').doc(emailKey).get();
                    if (!emailDoc.exists) return false;
                    await db.collection('users').doc(user.uid).set(emailDoc.data(), { merge: false });
                    return true;
                } catch (err) {
                    console.warn('maybeAdoptCanonicalUserDoc error:', err);
                    return false;
                }
            };

            const syncNow = async () => {
                if (currentUser && auth.currentUser && db) {
                    const userId = auth.currentUser.uid;

                    const updateData = {
                        notes,
                        colorLabels,
                        categories,
                        nextId,
                        collapsedCategories,
                        collapsedAccounts,
                        darkMode,
                        watchList,
                        cashSecuredPuts,
                        cashSecuredPutsSortMode,
                        nickname,
                        profilePhoto,
                        notesGroupMode,
                        portfolioLegendVisible,
                        portfolioLegendDollarAmounts,
                        portfolioDonutIncludesCash,
                        hideLegendPanel,
                        hideToolbarPanel,
                        sharesPrivacyMode,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };

                    // Try to encrypt, but fallback to plain text if encryption fails
                    if (finnhubApiKey) {
                        try {
                            const encrypted = await encryptApiKey(finnhubApiKey, userId);
                            updateData.finnhubApiKey = encrypted || finnhubApiKey;
                        } catch (err) {
                            updateData.finnhubApiKey = finnhubApiKey; // Store as plain text on error
                        }
                    } else {
                        updateData.finnhubApiKey = null;
                    }

                    if (marketauxApiKey) {
                        try {
                            const encrypted = await encryptApiKey(marketauxApiKey, userId);
                            updateData.marketauxApiKey = encrypted || marketauxApiKey;
                        } catch (err) {
                            updateData.marketauxApiKey = marketauxApiKey; // Store as plain text on error
                        }
                    } else {
                        updateData.marketauxApiKey = null;
                    }

                    try {
                        await saveUserDoc(userId, auth.currentUser?.email || currentUser, updateData, { reason: 'manual-sync', forceBackup: true, minIntervalMs: 0 });
                        console.log('Sync completed successfully');
                        return true;
                    } catch (err) {
                        console.error('Sync error:', err);
                        return false;
                    }
                }
                return false;
            };



            const addToWatchList = () => {
                const sanitized = sanitizeTicker(newWatchTicker);
                if (!sanitized) {
                    setNewWatchTicker('');
                    return;
                }
                // Validate ticker format
                if (!validateTicker(sanitized)) {
                    showBrandedNotice('Invalid ticker symbol. Please enter 1-5 letters/numbers.');
                    return;
                }
                if (!watchList.includes(sanitized)) {
                    isSavingRef.current = true;
                    setWatchList([...watchList, sanitized]);
                    setNewWatchTicker('');
                } else {
                    showBrandedNotice('Ticker already in watch list.');
                }
            };

            const removeFromWatchList = (ticker) => {
                isSavingRef.current = true;
                setWatchList(watchList.filter(t => t !== ticker));
            };

            const refreshPortfolioPrices = async (
                targetNotes,
                { showNotices = false, cacheReason = 'manual' } = {}
            ) => {
                const uniqueNotes = Array.from(new Map(
                    (Array.isArray(targetNotes) ? targetNotes : [])
                        .map(note => [normalizeTicker(note.title), note])
                        .filter(([ticker]) => ticker)
                ).values());
                if (uniqueNotes.length === 0) {
                    if (showNotices) showBrandedNotice('No portfolio positions to refresh.');
                    return { requestedCount: 0, refreshedCount: 0, fallbackCount: 0, failedTickers: [] };
                }

                const requiresFinnhub = uniqueNotes.some(note =>
                    !isUsdTicker(note.title) && !isPlaidCryptoNote(note)
                );
                if (!finnhubApiKey && requiresFinnhub && showNotices) {
                    showBrandedNotice('Please add your Finnhub API key first.');
                    return { requestedCount: uniqueNotes.length, refreshedCount: 0, fallbackCount: 0, failedTickers: [] };
                }

                setPortfolioLoading(true);
                const prices = { ...normalizePriceMap(portfolioPrices) };
                let refreshedCount = 0;
                let fallbackCount = 0;
                const failedTickers = [];

                try {
                    for (const note of uniqueNotes) {
                        const ticker = normalizeTicker(note.title);
                        try {
                            if (isUsdTicker(ticker)) {
                                prices[ticker] = 1;
                                refreshedCount += 1;
                                continue;
                            }
                            const plaidCryptoPrice = getPlaidCryptoPrice(note);
                            if (plaidCryptoPrice > 0) {
                                prices[ticker] = plaidCryptoPrice;
                                refreshedCount += 1;
                                continue;
                            }
                            if (finnhubApiKey) {
                                const portfolioQuoteUrl = buildApiUrl('https://finnhub.io/api/v1/quote', {
                                    symbol: ticker,
                                    token: finnhubApiKey
                                });
                                const response = await fetch(portfolioQuoteUrl);
                                const data = await response.json();
                                const currentPrice = typeof data?.c === 'number' ? data.c : parseFloat(data?.c);
                                if (Number.isFinite(currentPrice) && currentPrice > 0) {
                                    prices[ticker] = currentPrice;
                                    refreshedCount += 1;
                                    continue;
                                }
                            }

                            const institutionPrice = getPlaidPositionPrice(note);
                            if (institutionPrice > 0) {
                                prices[ticker] = institutionPrice;
                                fallbackCount += 1;
                            } else {
                                failedTickers.push(ticker);
                            }
                        } catch (error) {
                            const institutionPrice = getPlaidPositionPrice(note);
                            if (institutionPrice > 0) {
                                prices[ticker] = institutionPrice;
                                fallbackCount += 1;
                            } else {
                                failedTickers.push(ticker);
                            }
                            console.error(`Failed to fetch ${note.title}`, error);
                        }
                    }

                    const normalizedPrices = normalizePriceMap(prices);
                    setPortfolioPrices(normalizedPrices);
                    localStorage.setItem('portfolio_prices_cache', JSON.stringify({
                        prices: normalizedPrices,
                        timestamp: Date.now(),
                        fetchedWindow: `${cacheReason}-${Date.now()}`
                    }));
                } finally {
                    setPortfolioLoading(false);
                }

                return {
                    requestedCount: uniqueNotes.length,
                    refreshedCount,
                    fallbackCount,
                    failedTickers
                };
            };

            const handleRefreshPortfolioPrices = async () => {
                await refreshPortfolioPrices(portfolioNotes, { showNotices: true, cacheReason: 'manual' });
            };

            const handleDownloadPortfolioSnapshot = async () => {
                const card = portfolioCardRef.current;
                if (!card) {
                    showBrandedNotice('Portfolio chart is not ready yet. Please try again in a moment.');
                    return;
                }

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const accountSlug = portfolioAccountFilter === 'all' ? '' : `-${portfolioAccountFilter}`;
                const suggestedName = `portfolio${accountSlug}-${timestamp}.png`;

                try {
                    if (typeof html2canvas === 'function') {
                        const snapshotCanvas = await html2canvas(card, {
                            backgroundColor: '#ffffff',
                            scale: window.devicePixelRatio || 1,
                            onclone: (clonedDoc) => {
                                clonedDoc.querySelectorAll('.snapshot-hide').forEach((el) => {
                                    el.style.display = 'none';
                                });
                                clonedDoc.querySelectorAll('.snapshot-only').forEach((el) => {
                                    el.style.display = 'inline';
                                });
                                clonedDoc.querySelectorAll('.snapshot-timestamp').forEach((el) => {
                                    el.textContent = `(${new Date().toLocaleString()})`;
                                });
                                clonedDoc.querySelectorAll('.portfolio-title').forEach((el) => {
                                    el.style.color = '#e5e7eb';
                                    el.style.webkitTextFillColor = '#e5e7eb';
                                    el.style.textShadow = 'none';
                                    el.style.backgroundImage = 'none';
                                });
                            }
                        });
                        const blob = await new Promise((resolve) => snapshotCanvas.toBlob(resolve, 'image/png', 1));
                        if (!blob) {
                            throw new Error('Unable to create snapshot.');
                        }
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = suggestedName;
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        URL.revokeObjectURL(url);
                        return;
                    }

                    const inlineComputedStyles = (source, target) => {
                        const computed = window.getComputedStyle(source);
                        const cssText = Array.from(computed)
                            .map((prop) => `${prop}:${computed.getPropertyValue(prop)};`)
                            .join('');
                        target.style.cssText = cssText;
                        for (let i = 0; i < source.children.length; i++) {
                            inlineComputedStyles(source.children[i], target.children[i]);
                        }
                    };

                    const rect = card.getBoundingClientRect();
                    const clone = card.cloneNode(true);
                    const chartCanvas = chartRef.current;
                    const chartRect = chartCanvas ? chartCanvas.getBoundingClientRect() : null;
                    const chartDataUrl = chartCanvas ? chartCanvas.toDataURL('image/png') : null;
                    inlineComputedStyles(card, clone);
                    if (chartDataUrl && chartRect) {
                        const originalCanvas = clone.querySelector('canvas');
                        if (originalCanvas) {
                            const imageReplacement = document.createElement('img');
                            imageReplacement.src = chartDataUrl;
                            imageReplacement.width = chartRect.width;
                            imageReplacement.height = chartRect.height;
                            imageReplacement.style.width = `${chartRect.width}px`;
                            imageReplacement.style.height = `${chartRect.height}px`;
                            imageReplacement.style.display = 'block';
                            originalCanvas.replaceWith(imageReplacement);
                        }
                    }
                    clone.style.margin = '0';

                    const container = document.createElement('div');
                    container.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
                    container.style.width = `${rect.width}px`;
                    container.style.height = `${rect.height}px`;
                    container.appendChild(clone);

                    const svg = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
                            <foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(container)}</foreignObject>
                        </svg>
                    `;
                    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
                    const svgUrl = URL.createObjectURL(svgBlob);

                    const image = new Image();
                    const blob = await new Promise((resolve, reject) => {
                        image.onload = () => {
                            const dpr = window.devicePixelRatio || 1;
                            const outputCanvas = document.createElement('canvas');
                            outputCanvas.width = rect.width * dpr;
                            outputCanvas.height = rect.height * dpr;
                            const ctx = outputCanvas.getContext('2d');
                            ctx.scale(dpr, dpr);
                            ctx.drawImage(image, 0, 0);
                            outputCanvas.toBlob((result) => {
                                if (result) resolve(result);
                                else reject(new Error('Unable to create snapshot.'));
                            }, 'image/png', 1);
                            URL.revokeObjectURL(svgUrl);
                        };
                        image.onerror = () => {
                            URL.revokeObjectURL(svgUrl);
                            reject(new Error('Snapshot render failed.'));
                        };
                        image.src = svgUrl;
                    });

                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = suggestedName;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    URL.revokeObjectURL(url);
                } catch (error) {
                    console.error('Snapshot download failed:', error);
                    showBrandedNotice('Snapshot download failed. Please try again.');
                }
            };

            const handleShareYtdPerformance = async () => {
                if (shownYtdPerformance?.status !== 'ready') {
                    showBrandedNotice('YTD performance is not ready for this account yet.');
                    return;
                }
                const year = robinhoodPerformance?.year || new Date().getFullYear();
                const scopeLabel = portfolioAccountFilter === 'all'
                    ? 'All Accounts'
                    : getAccountLabel(portfolioAccountFilter);
                const displayName = nickname || currentUser?.split('@')[0] || 'Investor';
                const accountSlug = portfolioAccountFilter === 'all' ? 'all-accounts' : portfolioAccountFilter;
                try {
                    const cardData = {
                        year,
                        gain: shownYtdPerformance.gain,
                        returnPercent: shownYtdPerformance.returnPercent,
                        scopeLabel,
                        displayName,
                        profilePhoto: [profilePhoto, auth.currentUser?.photoURL],
                        displayMode: 'full',
                    };
                    const blob = await createYtdShareCard(cardData);
                    const filenameBase = `stock-stickies-${year}-ytd-${accountSlug}`;
                    setYtdCopyStatus('');
                    setYtdSharePreview({
                        blob,
                        url: URL.createObjectURL(blob),
                        filename: `${filenameBase}.png`,
                        filenameBase,
                        title: `${displayName}'s ${year} YTD performance`,
                        cardData,
                        displayMode: 'full',
                    });
                } catch (error) {
                    if (error?.name !== 'AbortError') {
                        console.error('Unable to create YTD performance image', error);
                        showBrandedNotice('Unable to create the YTD performance image. Please try again.');
                    }
                }
            };

            const closeYtdSharePreview = () => {
                if (ytdSharePreview?.url) URL.revokeObjectURL(ytdSharePreview.url);
                setYtdSharePreview(null);
                setYtdCopyStatus('');
                setYtdCardUpdating(false);
            };

            const handleYtdDisplayMode = async (displayMode) => {
                if (!ytdSharePreview?.cardData || ytdSharePreview.displayMode === displayMode || ytdCardUpdating) return;
                setYtdCardUpdating(true);
                setYtdCopyStatus('Updating preview…');
                try {
                    const cardData = { ...ytdSharePreview.cardData, displayMode };
                    const blob = await createYtdShareCard(cardData);
                    const url = URL.createObjectURL(blob);
                    const oldUrl = ytdSharePreview.url;
                    setYtdSharePreview((current) => ({
                        ...current,
                        blob,
                        url,
                        cardData,
                        displayMode,
                        filename: `${current.filenameBase}${displayMode === 'percent-only' ? '-percent-only' : ''}.png`,
                    }));
                    window.setTimeout(() => URL.revokeObjectURL(oldUrl), 1000);
                    setYtdCopyStatus(displayMode === 'percent-only' ? 'Dollar gain hidden.' : '');
                } catch (error) {
                    console.error('Unable to update YTD performance image', error);
                    setYtdCopyStatus('Unable to update the preview. Please try again.');
                } finally {
                    setYtdCardUpdating(false);
                }
            };

            const handleCopyYtdImage = async () => {
                if (!ytdSharePreview?.blob) return;
                try {
                    await copyYtdCardToClipboard(ytdSharePreview.blob);
                    setYtdCopyStatus('Copied!');
                } catch (error) {
                    console.error('Unable to copy YTD performance image', error);
                    setYtdCopyStatus('Copy is not supported here — use Share / Download.');
                }
            };

            const handleShareOrDownloadYtdImage = async () => {
                if (!ytdSharePreview?.blob) return;
                try {
                    const result = await shareOrDownloadYtdCard(
                        ytdSharePreview.blob,
                        ytdSharePreview.filename,
                        ytdSharePreview.title,
                    );
                    if (result === 'downloaded') setYtdCopyStatus('Downloaded!');
                } catch (error) {
                    if (error?.name !== 'AbortError') {
                        console.error('Unable to share YTD performance image', error);
                        setYtdCopyStatus('Unable to share the image. Please try again.');
                    }
                }
            };

            const handleLogout = async () => {
                // Wait for sync to complete before logging out
                await syncNow();
                // Clear any pending save timeouts and reset saving flag
                if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                isSavingRef.current = false;
                isLoadingRef.current = false;
                // Logout resets state to defaults, so the next session must re-apply its
                // first snapshot even if the payload is byte-identical to this one.
                lastAppliedSnapshotRef.current = null;
                if (auth) await auth.signOut();
                setUserDataReady(false);
                setCurrentUser(null);
                setNotes([]);
                setNickname('');
                setProfilePhoto('');
                setProfilePhotoMenuOpen(false);
                setFinnhubApiKey('');
                setMarketauxApiKey('');
                // Reset categories to defaults on logout
                setCategories(DEFAULT_COLORS);
                // Clear localStorage cache on logout
                localStorage.removeItem('portfolio_prices_cache');
                setColorLabels(DEFAULT_COLOR_LABELS);
            };

            const classifyNote = (noteId, color) => {
                setNotes(notes.map(n => n.id === noteId ? {...n, color, classified: true} : n));
            };

            const deleteNote = (noteId) => {
                setNoteToDelete(noteId);
            };

            const confirmDeleteNote = () => {
                if (!noteToDelete) return;
                setNotes(notes.filter(n => n.id !== noteToDelete));
                setNoteToDelete(null);
            };

            const showBrandedNotice = (message, title = 'Heads up', type = 'info', onConfirm = null) => {
                setNoticeModal({ open: true, title, message, type, onConfirm });
            };

            const createCurrentAccountBackup = async (reason = 'manual-backup') => {
                if (!db || !auth?.currentUser) throw new Error('Sign in again before creating a backup.');
                const synced = await syncNow();
                if (!synced) throw new Error('Your current Stock Stickies data could not be backed up. Nothing else was changed.');

                const userRef = db.collection('users').doc(auth.currentUser.uid);
                const current = await userRef.get();
                if (!current.exists) throw new Error('Your Stock Stickies account data was not found.');
                const currentData = current.data() || {};
                const snapshot = await userRef.collection('snapshots').add({
                    ...currentData,
                    backupCreatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    backupReason: reason
                });
                return {
                    id: snapshot.id,
                    noteCount: Array.isArray(currentData.notes) ? currentData.notes.length : 0
                };
            };

            const applyRobinhoodReconciliation = async (reconciliation) => {
                if (!db || !auth?.currentUser) throw new Error('Sign in again before applying Robinhood changes.');
                const backup = await createCurrentAccountBackup('pre-plaid-apply');
                if (saveTimeoutRef.current) {
                    clearTimeout(saveTimeoutRef.current);
                    saveTimeoutRef.current = null;
                }
                const userRef = db.collection('users').doc(auth.currentUser.uid);
                const current = await userRef.get();
                if (!current.exists) throw new Error('Your Stock Stickies account data was not found.');

                const currentData = current.data() || {};
                const currentNotes = Array.isArray(currentData.notes) ? currentData.notes : notes;
                const updatesById = new Map((reconciliation?.updates || []).map(change => [change.noteId, change]));
                const closedNoteIds = new Set(
                    reconciliation?.removeClosedPositions
                        ? (reconciliation?.possibleClosed || []).map(note => note.id)
                        : []
                );
                const removedPositions = currentNotes
                    .filter(note => closedNoteIds.has(note.id))
                    .map(note => `${note.title} (${note.account})`);
                const syncedAt = new Date().toISOString();
                const updatedNotes = currentNotes.filter(note =>
                    !closedNoteIds.has(note.id)
                ).map(note => {
                    const change = updatesById.get(note.id);
                    if (!change) return note;
                    return {
                        ...note,
                        shares: change.newShares,
                        account: change.newAccount,
                        plaidAccountId: change.plaidAccountId,
                        plaidSecurityId: change.plaidSecurityId,
                        plaidSecurityType: change.plaidSecurityType || '',
                        plaidIsCrypto: !!change.plaidIsCrypto,
                        plaidInstitutionPrice: change.plaidInstitutionPrice ?? null,
                        plaidInstitutionValue: change.plaidInstitutionValue ?? null,
                        plaidCostBasis: change.plaidCostBasis ?? null,
                        plaidTaxLotCount: Number(change.plaidTaxLotCount) || 0,
                        plaidPriceAsOf: change.plaidPriceAsOf || null,
                        plaidSource: 'robinhood',
                        plaidLastSyncedAt: syncedAt
                    };
                });

                let importedNextId = Math.max(
                    Number(currentData.nextId) || 1,
                    Number(nextId) || 1,
                    ...updatedNotes.map(note => (Number(note.id) || 0) + 1)
                );
                const importedPositionDefaultColor =
                    categories.find(color =>
                        String(colorLabels[color] || '').trim().toLowerCase() === 'core thesis'
                    ) ||
                    categories.find(color =>
                        String(colorLabels[color] || '').trim().toLowerCase() === 'core holding'
                    ) ||
                    categories[0] ||
                    UNCLASSIFIED_COLOR;
                const importedNotes = [];
                for (const position of reconciliation?.additions || []) {
                    const importedNote = {
                        id: importedNextId,
                        title: position.ticker,
                        text: '',
                        color: importedPositionDefaultColor,
                        classified: importedPositionDefaultColor !== UNCLASSIFIED_COLOR,
                        shares: position.quantity,
                        account: position.stockStickiesAccount,
                        plaidAccountId: position.accountId,
                        plaidSecurityId: position.securityId,
                        plaidSecurityType: position.type || '',
                        plaidIsCrypto: !!position.isCrypto,
                        plaidInstitutionPrice: position.institutionPrice ?? null,
                        plaidInstitutionValue: position.institutionValue ?? null,
                        plaidCostBasis: position.costBasis ?? null,
                        plaidTaxLotCount: Number.isFinite(Number(position.taxLotCount))
                            ? Math.max(0, Math.trunc(Number(position.taxLotCount)))
                            : (Array.isArray(position.taxLots) ? position.taxLots.length : 0),
                        plaidPriceAsOf: position.priceAsOf || null,
                        plaidSource: 'robinhood',
                        plaidImportedAt: syncedAt,
                        plaidLastSyncedAt: syncedAt
                    };
                    importedNotes.push(importedNote);
                    updatedNotes.unshift(importedNote);
                    importedNextId += 1;
                }

                await userRef.set({
                    ...currentData,
                    notes: updatedNotes,
                    nextId: importedNextId,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: false });
                isSavingRef.current = true;
                setNotes(updatedNotes);
                setNextId(importedNextId);
                setUnlockedNotes({});
                const priceRefresh = importedNotes.length > 0
                    ? await refreshPortfolioPrices(importedNotes, {
                        showNotices: false,
                        cacheReason: 'position-import'
                    })
                    : null;
                return {
                    backup,
                    updatedCount: reconciliation?.updates?.length || 0,
                    addedCount: reconciliation?.additions?.length || 0,
                    removedCount: removedPositions.length,
                    removedPositions,
                    priceRefresh
                };
            };

            const loadBackupSnapshots = async () => {
                if (!db || !auth?.currentUser) return;
                setBackupsLoading(true);
                try {
                    const snap = await db.collection('users').doc(auth.currentUser.uid)
                        .collection('snapshots')
                        .orderBy('backupCreatedAt', 'desc')
                        .limit(20)
                        .get();
                    const rows = snap.docs.map((docSnap) => {
                        const data = docSnap.data() || {};
                        return {
                            id: docSnap.id,
                            ...data,
                            backupCreatedAtMs: data.backupCreatedAt?.toMillis ? data.backupCreatedAt.toMillis() : null
                        };
                    });
                    setBackupSnapshots(rows);
                } catch (err) {
                    console.error('Failed to load backups:', err);
                    showBrandedNotice('Could not load backups right now.', 'Backup error');
                } finally {
                    setBackupsLoading(false);
                }
            };

            const openBackupManager = async () => {
                setProfilePhotoMenuOpen(false);
                setBackupModalOpen(true);
                await loadBackupSnapshots();
            };

            const restoreBackupSnapshot = async (snapshotId) => {
                if (!db || !auth?.currentUser || !snapshotId) return;
                setRestoringBackupId(snapshotId);
                try {
                    const ref = db.collection('users').doc(auth.currentUser.uid).collection('snapshots').doc(snapshotId);
                    const snap = await ref.get();
                    if (!snap.exists) throw new Error('Backup snapshot not found');
                    const data = snap.data() || {};
                    const restorePayload = sanitizeUserDocForSave({
                        notes: data.notes || [],
                        colorLabels: data.colorLabels || DEFAULT_COLOR_LABELS,
                        categories: data.categories || DEFAULT_COLORS,
                        nextId: data.nextId || 1,
                        collapsedCategories: data.collapsedCategories || {},
                        collapsedAccounts: data.collapsedAccounts || {},
                        darkMode: !!data.darkMode,
                        watchList: data.watchList || [],
                        nickname: data.nickname || '',
                        profilePhoto: data.profilePhoto || '',
                        notesGroupMode: data.notesGroupMode || 'account',
                        portfolioLegendVisible: data.portfolioLegendVisible !== false,
                        portfolioLegendDollarAmounts: !!data.portfolioLegendDollarAmounts,
                        portfolioDonutIncludesCash: data.portfolioDonutIncludesCash !== false,
                        hideLegendPanel: !!data.hideLegendPanel,
                        hideToolbarPanel: !!data.hideToolbarPanel,
                        sharesPrivacyMode: data.sharesPrivacyMode || 'show',
                        finnhubApiKey: data.finnhubApiKey || null,
                        marketauxApiKey: data.marketauxApiKey || null
                    });
                    await saveUserDoc(auth.currentUser.uid, auth.currentUser.email || currentUser, restorePayload, {
                        reason: 'restore-backup',
                        forceBackup: true,
                        minIntervalMs: 0
                    });
                    setBackupModalOpen(false);
                    showBrandedNotice('Backup restored successfully. Your StickyNotes should refresh to that saved state.', 'Backup restored');
                } catch (err) {
                    console.error('Failed to restore backup:', err);
                    showBrandedNotice(err?.message || 'Could not restore that backup.', 'Restore failed');
                } finally {
                    setRestoringBackupId('');
                }
            };

            // Category management functions
            const getAvailableColors = () => AVAILABLE_COLORS.filter(c => !categories.includes(c));

            const getNotesCountForCategory = (color) => notes.filter(n => n.color === color && n.classified).length;

            const addCategory = (color, label) => {
                if (categories.length >= MAX_CATEGORIES) return;
                if (categories.includes(color)) return;
                setCategories([...categories, color]);
                setColorLabels({...colorLabels, [color]: label || 'New Category'});
                setShowAddCategoryModal(false);
                setNewCategoryLabel('');
                setNewCategoryColor(null);
            };

            const handleDeleteCategory = (color) => {
                const notesCount = getNotesCountForCategory(color);
                if (notesCount > 0) {
                    setCategoryToDelete(color);
                    setReassignTarget(categories.find(c => c !== color) || null);
                } else {
                    // No notes, delete directly
                    if (categories.length <= MIN_CATEGORIES) return;
                    setCategories(categories.filter(c => c !== color));
                    const newLabels = {...colorLabels};
                    delete newLabels[color];
                    setColorLabels(newLabels);
                }
            };

            const confirmDeleteCategory = () => {
                if (!categoryToDelete || !reassignTarget) return;
                const deleteColor = categoryToDelete;
                const moveToColor = reassignTarget;
                setCategoryToDelete(null);
                setReassignTarget(null);
                showBrandedNotice(
                    `Are you sure you want to permanently delete the "${colorLabels[deleteColor]}" category? This action cannot be undone.`,
                    'Confirm Delete',
                    'danger',
                    () => {
                        // Move all notes from deleted category to target category
                        setNotes(notes.map(n => n.color === deleteColor ? {...n, color: moveToColor} : n));
                        // Remove the category
                        setCategories(categories.filter(c => c !== deleteColor));
                        const newLabels = {...colorLabels};
                        delete newLabels[deleteColor];
                        setColorLabels(newLabels);
                    }
                );
            };

            // Ref to track intentional color changes (prevents orphan repair race condition)
            const isChangingColorRef = useRef(false);

            const changeCategoryColor = (oldColor, newColor) => {
                if (oldColor === newColor) return;
                if (categories.includes(newColor)) return;

                // Mark that we're intentionally changing colors
                isChangingColorRef.current = true;

                // Update notes FIRST, then categories (order matters for orphan detection)
                const updatedNotes = notes.map(n => n.color === oldColor ? {...n, color: newColor} : n);
                setNotes(updatedNotes);

                // Update categories array
                setCategories(categories.map(c => c === oldColor ? newColor : c));

                // Update colorLabels
                const label = colorLabels[oldColor];
                const newLabels = {...colorLabels};
                delete newLabels[oldColor];
                newLabels[newColor] = label;
                setColorLabels(newLabels);
                setEditingCategoryColor(null);

                // Reset flag after a short delay to allow state to settle
                setTimeout(() => { isChangingColorRef.current = false; }, 100);
            };

            const reorderCategories = (fromColor, toColor) => {
                if (!fromColor || !toColor) return;
                if (fromColor === toColor) return;

                const fromIdx = categories.indexOf(fromColor);
                const toIdx = categories.indexOf(toColor);
                if (fromIdx === -1 || toIdx === -1) return;

                const next = [...categories];
                const [item] = next.splice(fromIdx, 1);
                next.splice(toIdx, 0, item);
                setCategories(next);
            };

            // Close color picker when clicking outside
            useEffect(() => {
                const handleClickOutside = (e) => {
                    if (editingCategoryColor && !e.target.closest('.group')) {
                        setEditingCategoryColor(null);
                    }
                };
                document.addEventListener('click', handleClickOutside);
                return () => document.removeEventListener('click', handleClickOutside);
            }, [editingCategoryColor]);

            // Compute derived state - must be before early return to follow Rules of Hooks
            const unclassifiedNotes = useMemo(() => notes.filter(n => !n.classified), [notes]);
            const classifiedNotes = useMemo(() => notes.filter(n => n.classified), [notes]);
            const importedPositionDefaultColor = useMemo(() =>
                categories.find(color =>
                    String(colorLabels[color] || '').trim().toLowerCase() === 'core thesis'
                ) ||
                categories.find(color =>
                    String(colorLabels[color] || '').trim().toLowerCase() === 'core holding'
                ) ||
                categories[0] ||
                null,
            [categories, colorLabels]);

            // Robinhood supplies the position identity, shares, and account, so imported
            // positions should enter the normal portfolio immediately. Existing imports
            // created by older builds are migrated once categories finish loading.
            useEffect(() => {
                if (!userDataReady || !importedPositionDefaultColor) return undefined;
                const migrateImportedPositions = () => {
                    if (isLoadingRef.current) return;
                    setNotes(currentNotes => {
                        if (!currentNotes.some(note =>
                            !note.classified &&
                            note.plaidSource === 'robinhood' &&
                            note.plaidSecurityId &&
                            note.title
                        )) return currentNotes;
                        return currentNotes.map(note =>
                            !note.classified &&
                            note.plaidSource === 'robinhood' &&
                            note.plaidSecurityId &&
                            note.title
                                ? {
                                    ...note,
                                    color: importedPositionDefaultColor,
                                    classified: true,
                                }
                                : note
                        );
                    });
                };
                const timer = window.setTimeout(
                    migrateImportedPositions,
                    isLoadingRef.current ? 250 : 0
                );
                return () => window.clearTimeout(timer);
            }, [notes, userDataReady, importedPositionDefaultColor]);

            // The refresh feature predates plaidImportedAt by one deployment. Compare the
            // latest recent pre-refresh backup with the current notes once so positions
            // imported during that rollout receive the same 48-hour NEW sticker.
            useEffect(() => {
                if (
                    !userDataReady ||
                    importedPositionBadgeBackfillRef.current ||
                    !db ||
                    !auth?.currentUser
                ) return undefined;
                importedPositionBadgeBackfillRef.current = true;
                let cancelled = false;
                void (async () => {
                    try {
                        const backupQuery = await db.collection('users')
                            .doc(auth.currentUser.uid)
                            .collection('snapshots')
                            .orderBy('backupCreatedAt', 'desc')
                            .limit(20)
                            .get();
                        const cutoff = Date.now() - (48 * 60 * 60 * 1000);
                        const recentBackup = backupQuery.docs
                            .map(docSnap => docSnap.data() || {})
                            .find(data =>
                                data.backupReason === 'pre-plaid-apply' &&
                                typeof data.backupCreatedAt?.toMillis === 'function' &&
                                data.backupCreatedAt.toMillis() >= cutoff
                            );
                        if (!recentBackup || cancelled) return;
                        const backupAtMs = recentBackup.backupCreatedAt.toMillis();
                        const priorNoteIds = new Set(
                            (Array.isArray(recentBackup.notes) ? recentBackup.notes : [])
                                .map(note => note.id)
                        );
                        setNotes(currentNotes => {
                            let changed = false;
                            const backfilled = currentNotes.map(note => {
                                const syncedAtMs = Date.parse(String(note.plaidLastSyncedAt || ''));
                                const importedAtMs =
                                    Number.isFinite(syncedAtMs) && syncedAtMs >= cutoff
                                        ? syncedAtMs
                                        : backupAtMs;
                                const wasImportedByRecentRefresh =
                                    !note.plaidImportedAt &&
                                    note.plaidSource === 'robinhood' &&
                                    note.plaidSecurityId &&
                                    note.title &&
                                    !priorNoteIds.has(note.id);
                                if (!wasImportedByRecentRefresh) return note;
                                changed = true;
                                return {
                                    ...note,
                                    plaidImportedAt: new Date(importedAtMs).toISOString(),
                                };
                            });
                            return changed ? backfilled : currentNotes;
                        });
                    } catch (error) {
                        console.warn('Could not backfill recent Robinhood import badges:', error);
                    }
                })();
                return () => {
                    cancelled = true;
                };
            }, [userDataReady]);

            // Notes display ordering: always by position market value (shares * latest price).
            // Positions rank above non-positions, and priced positions above unpriced ones,
            // so a missing quote sinks a note rather than pinning it to the top at value 0.
            const sortedClassifiedNotes = useMemo(() => {
                const getTicker = (n) => (n.title || '').trim().toUpperCase();
                const getShares = (n) => (typeof n.shares === 'number' ? n.shares : parseFloat(n.shares)) || 0;
                const getPrice = (ticker) => {
                    const p = portfolioPrices[ticker];
                    return typeof p === 'number' ? p : 0;
                };

                const copy = [...classifiedNotes];
                copy.sort((a, b) => {
                    const aShares = getShares(a);
                    const bShares = getShares(b);
                    const aIsPos = aShares > 0;
                    const bIsPos = bShares > 0;
                    if (aIsPos !== bIsPos) return aIsPos ? -1 : 1; // positions above non-positions

                    // Unknown price positions should still appear above non-positions, but below priced positions
                    const aTicker = getTicker(a);
                    const bTicker = getTicker(b);
                    const aPrice = getPrice(aTicker);
                    const bPrice = getPrice(bTicker);
                    const aHasPrice = aPrice > 0;
                    const bHasPrice = bPrice > 0;
                    if (aIsPos && bIsPos && aHasPrice !== bHasPrice) return aHasPrice ? -1 : 1;

                    const aValue = aShares * aPrice;
                    const bValue = bShares * bPrice;
                    if (bValue !== aValue) return bValue - aValue;

                    // Stable tie-breakers
                    if (aTicker !== bTicker) return aTicker.localeCompare(bTicker);
                    return (a.id || 0) - (b.id || 0);
                });
                return copy;
            }, [classifiedNotes, portfolioPrices]);

            // Position ranking info (for badges on notes)
            const { positionRankById, totalPositions, positionDetailsById } = useMemo(() => {
                const getTicker = (n) => (n.title || '').trim().toUpperCase();
                const getShares = (n) => (typeof n.shares === 'number' ? n.shares : parseFloat(n.shares)) || 0;
                const getPrice = (ticker) => {
                    const p = portfolioPrices[ticker];
                    return typeof p === 'number' ? p : 0;
                };

                const positions = notes
                    .filter(n => getShares(n) > 0)
                    .map(n => {
                        const ticker = getTicker(n);
                        const shares = getShares(n);
                        const price = getPrice(ticker);
                        const value = shares * price;
                        const rawCostBasis = n.plaidCostBasis;
                        const parsedCostBasis = Number(rawCostBasis);
                        const hasCostBasis = rawCostBasis !== null
                            && rawCostBasis !== undefined
                            && rawCostBasis !== ''
                            && Number.isFinite(parsedCostBasis)
                            && parsedCostBasis >= 0;
                        const costBasis = hasCostBasis ? parsedCostBasis : null;
                        const unrealizedPnL = hasCostBasis && price > 0 ? value - costBasis : null;
                        const unrealizedPnLPercent = unrealizedPnL != null && costBasis > 0
                            ? (unrealizedPnL / costBasis) * 100
                            : null;
                        return { id: n.id, ticker, shares, price, value, costBasis, unrealizedPnL, unrealizedPnLPercent };
                    });

                // Sort by: priced positions first, then value desc, then shares desc, then ticker
                positions.sort((a, b) => {
                    const aHasPrice = a.price > 0;
                    const bHasPrice = b.price > 0;
                    if (aHasPrice !== bHasPrice) return aHasPrice ? -1 : 1;
                    if (b.value !== a.value) return b.value - a.value;
                    if (b.shares !== a.shares) return b.shares - a.shares;
                    return a.ticker.localeCompare(b.ticker);
                });

                const total = positions.reduce((sum, p) => sum + p.value, 0);
                const rankById = {};
                const detailsById = {};
                positions.forEach((p, idx) => {
                    const rank = idx + 1;
                    rankById[p.id] = rank;
                    detailsById[p.id] = {
                        ...p,
                        rank,
                        totalPositions: positions.length,
                        pctOfTotal: total > 0 ? (p.value / total) * 100 : 0,
                        totalValue: total
                    };
                });

                return { positionRankById: rankById, totalPositions: positions.length, positionDetailsById: detailsById };
            }, [notes, portfolioPrices]);

            const groupedNotes = useMemo(() => categories.reduce((acc, color) => {
                acc[color] = sortedClassifiedNotes.filter(n => n.color === color);
                return acc;
            }, {}), [sortedClassifiedNotes, categories]);

            // Notes grouped by brokerage account. Every account gets a bucket so an empty
            // account still renders its (collapsible) header; notes with no account — and
            // any note without shares — land in the Unassigned bucket.
            const groupedNotesByAccount = useMemo(() => {
                const buckets = {};
                [...ACCOUNT_IDS, UNASSIGNED_ACCOUNT_ID].forEach(id => { buckets[id] = []; });
                sortedClassifiedNotes.forEach(n => {
                    buckets[getNoteAccount(n)].push(n);
                });
                return buckets;
            }, [sortedClassifiedNotes]);



            // Detect orphaned notes (notes with colors not in categories) and auto-repair them
            useEffect(() => {
                // Skip if we're in the middle of an intentional color change or loading data
                if (isChangingColorRef.current || isLoadingRef.current) return;

                const orphanedNotes = classifiedNotes.filter(n => !categories.includes(n.color));
                if (orphanedNotes.length > 0 && categories.length > 0) {
                    console.log('Repairing orphaned notes:', orphanedNotes.length);
                    const defaultCategory = categories[0];
                    setNotes(notes.map(n =>
                        n.classified && !categories.includes(n.color)
                            ? {...n, color: defaultCategory}
                            : n
                    ));
                }
            }, [classifiedNotes, categories]);

            // Ensure all categories have labels
            useEffect(() => {
                // Skip if we're loading data from Firestore
                if (isLoadingRef.current) return;

                const missingLabels = categories.filter(c => !colorLabels[c]);
                if (missingLabels.length > 0) {
                    const newLabels = {...colorLabels};
                    missingLabels.forEach(c => {
                        newLabels[c] = DEFAULT_COLOR_LABELS[c] || 'Category';
                    });
                    setColorLabels(newLabels);
                }
            }, [categories, colorLabels]);

            // Stock data fetching effect - must be before early return to follow Rules of Hooks
            useEffect(() => {
                // Use a flag to prevent state updates on unmounted component
                let isMounted = true;

                const loadStockData = async () => {
                    if (!activeTicker) {
                        if (isMounted) {
                            setStockData(null);
                            setStockError(null);
                        }
                        return;
                    }

                    // Validate ticker format before making API calls
                    if (!validateTicker(activeTicker)) {
                        if (isMounted) {
                            setStockError('Invalid ticker symbol format');
                            setStockData(null);
                            setStockLoading(false);
                        }
                        return;
                    }

                    if (isMounted) {
                        setStockLoading(true);
                        setStockError(null);
                    }

                    try {
                        const plaidCryptoPrice = getPlaidCryptoPrice(expandedNote);
                        if (plaidCryptoPrice > 0) {
                            if (isMounted) {
                                setStockData({
                                    symbol: activeTicker,
                                    currentPrice: plaidCryptoPrice,
                                    previousClose: plaidCryptoPrice,
                                    change: 0,
                                    changePercent: 0,
                                    dayHigh: plaidCryptoPrice,
                                    dayLow: plaidCryptoPrice,
                                    volume: null,
                                    marketCap: null,
                                    currency: 'USD',
                                    peTTM: null,
                                    peForward: null,
                                    pbRatio: null,
                                    dividendYield: null,
                                    dividendRate: null,
                                    week52High: null,
                                    week52Low: null,
                                    nextEarningsDate: null
                                });
                            }
                            return;
                        }

                        if (!finnhubApiKey) {
                            if (isMounted) {
                                setStockError('Please enter your Finnhub API key in settings');
                                setStockData(null);
                            }
                            return;
                        }

                        // Fetch quote data from Finnhub - using URLSearchParams for safer URL construction
                        const quoteUrl = buildApiUrl('https://finnhub.io/api/v1/quote', {
                            symbol: activeTicker,
                            token: finnhubApiKey
                        });
                        const quoteResponse = await fetch(quoteUrl);

                        if (!quoteResponse.ok) {
                            throw new Error('Failed to fetch quote data');
                        }

                        const quoteData = await quoteResponse.json();

                        if (!quoteData.c || quoteData.c === 0) {
                            if (isMounted) {
                                setStockError('Stock not found');
                                setStockData(null);
                            }
                            return;
                        }

                        // Fetch company profile for additional info
                        const profileUrl = buildApiUrl('https://finnhub.io/api/v1/stock/profile2', {
                            symbol: activeTicker,
                            token: finnhubApiKey
                        });
                        const profileResponse = await fetch(profileUrl);
                        const profileData = profileResponse.ok ? await profileResponse.json() : {};

                        // Fetch metrics for fundamentals
                        const metricsUrl = buildApiUrl('https://finnhub.io/api/v1/stock/metric', {
                            symbol: activeTicker,
                            metric: 'all',
                            token: finnhubApiKey
                        });
                        const metricsResponse = await fetch(metricsUrl);
                        const metricsData = metricsResponse.ok ? await metricsResponse.json() : {};

                        // Fetch earnings calendar for next earnings date
                        const today = new Date();
                        const fromDate = today.toISOString().split('T')[0];
                        const toDate = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 90 days ahead
                        const earningsUrl = buildApiUrl('https://finnhub.io/api/v1/calendar/earnings', {
                            from: fromDate,
                            to: toDate,
                            symbol: activeTicker,
                            token: finnhubApiKey
                        });
                        const earningsResponse = await fetch(earningsUrl);
                        const earningsData = earningsResponse.ok ? await earningsResponse.json() : {};

                        if (isMounted) {
                            const currentPrice = quoteData.c;
                            const previousClose = quoteData.pc;
                            const change = currentPrice - previousClose;
                            const changePercent = (change / previousClose) * 100;

                            setStockData({
                                symbol: activeTicker,
                                currentPrice: currentPrice,
                                previousClose: previousClose,
                                change: change,
                                changePercent: changePercent,
                                dayHigh: quoteData.h,
                                dayLow: quoteData.l,
                                volume: null, // Finnhub doesn't provide volume in quote endpoint
                                marketCap: profileData.marketCapitalization ? profileData.marketCapitalization * 1e6 : null,
                                currency: profileData.currency || 'USD',
                                peTTM: metricsData.metric?.peBasicExclExtraTTM || metricsData.metric?.peTTM,
                                peForward: metricsData.metric?.peNormalizedAnnual,
                                pbRatio: metricsData.metric?.pbAnnual || metricsData.metric?.pbQuarterly,
                                dividendYield: metricsData.metric?.dividendYieldIndicatedAnnual ? metricsData.metric.dividendYieldIndicatedAnnual / 100 : null,
                                dividendRate: metricsData.metric?.dividendPerShareAnnual,
                                week52High: metricsData.metric?.['52WeekHigh'],
                                week52Low: metricsData.metric?.['52WeekLow'],
                                nextEarningsDate: earningsData.earningsCalendar && earningsData.earningsCalendar.length > 0 ? earningsData.earningsCalendar[0].date : null
                            });
                        }
                    } catch (error) {
                        console.error('Stock fetch error:', error);
                        if (isMounted) {
                            setStockError('Unable to fetch stock data. Please try again.');
                            setStockData(null);
                        }
                    }

                    if (isMounted) {
                        setStockLoading(false);
                    }
                };

                loadStockData();

                return () => {
                    isMounted = false;
                };
            }, [activeTicker, expandedNote, finnhubApiKey]);

            // News fetching effect
            useEffect(() => {
                let isMounted = true;

                const loadNewsData = async () => {
                    if (!activeTicker) {
                        if (isMounted) setNewsData(null);
                        return;
                    }

                    // Validate ticker format before making API calls
                    if (!validateTicker(activeTicker)) {
                        if (isMounted) setNewsData([]);
                        return;
                    }

                    if (!marketauxApiKey) {
                        if (isMounted) setNewsData(null);
                        return;
                    }

                    // Check cache - only fetch once per day per ticker
                    const cacheKey = `news_${activeTicker}`;
                    const cached = localStorage.getItem(cacheKey);
                    if (cached) {
                        const { data, date } = JSON.parse(cached);
                        const today = new Date().toISOString().split('T')[0];
                        if (date === today) {
                            if (isMounted) setNewsData(data);
                            return;
                        }
                    }

                    if (isMounted) setNewsLoading(true);

                    try {
                        const today = new Date();
                        const todayStr = today.toISOString().split('T')[0];
                        const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

                        // Fetch from MarketAux with sentiment (last 3 days to ensure coverage on weekends)
                        const marketauxUrl = buildApiUrl('https://api.marketaux.com/v1/news/all', {
                            symbols: activeTicker,
                            filter_entities: 'true',
                            published_after: threeDaysAgo,
                            api_token: marketauxApiKey
                        });
                        const marketauxResponse = await fetch(marketauxUrl);

                        let articles = [];

                        if (marketauxResponse.ok) {
                            const marketauxData = await marketauxResponse.json();
                            if (marketauxData.data && marketauxData.data.length > 0) {
                                articles = marketauxData.data.slice(0, 10).map(article => {
                                    // Find sentiment for this ticker
                                    const entity = article.entities?.find(e => e.symbol === activeTicker);
                                    const sentimentScore = entity?.sentiment_score || 0;
                                    let sentiment = 'neutral';
                                    if (sentimentScore > 0.2) sentiment = 'bullish';
                                    else if (sentimentScore < -0.2) sentiment = 'bearish';

                                    return {
                                        title: article.title,
                                        description: article.description,
                                        url: article.url,
                                        source: article.source,
                                        publishedAt: article.published_at,
                                        sentiment: sentiment,
                                        sentimentScore: sentimentScore
                                    };
                                });
                            }
                        }

                        // If no MarketAux results, try Finnhub company news as fallback
                        if (articles.length === 0 && finnhubApiKey) {
                            const finnhubNewsUrl = buildApiUrl('https://finnhub.io/api/v1/company-news', {
                                symbol: activeTicker,
                                from: threeDaysAgo,
                                to: todayStr,
                                token: finnhubApiKey
                            });
                            const finnhubResponse = await fetch(finnhubNewsUrl);
                            if (finnhubResponse.ok) {
                                const finnhubNews = await finnhubResponse.json();
                                articles = finnhubNews.slice(0, 10).map(article => ({
                                    title: article.headline,
                                    description: article.summary,
                                    url: article.url,
                                    source: article.source,
                                    publishedAt: new Date(article.datetime * 1000).toISOString(),
                                    sentiment: 'neutral',
                                    sentimentScore: 0
                                }));
                            }
                        }

                        if (isMounted) {
                            setNewsData(articles);
                            // Cache the results
                            localStorage.setItem(cacheKey, JSON.stringify({
                                data: articles,
                                date: todayStr
                            }));
                        }
                    } catch (error) {
                        console.error('News fetch error:', error);
                        if (isMounted) setNewsData([]);
                    }

                    if (isMounted) setNewsLoading(false);
                };

                loadNewsData();

                return () => { isMounted = false; };
            }, [activeTicker, marketauxApiKey, finnhubApiKey]);

            // Derive portfolio from notes that have both a ticker (title) and shares
            const portfolioNotes = useMemo(() =>
                notes.filter(n => n.title && n.shares && n.shares > 0),
            [notes]);

            const portfolioTickerKey = portfolioNotes.map(n =>
                `${normalizeTicker(n.title)}:${n.shares || 0}:${getPlaidPositionPrice(n)}`
            ).sort().join('|');

            // Plaid's nightly snapshot provides a daily price floor for every synced
            // Robinhood position. Finnhub can still overwrite stocks with fresher quotes.
            useEffect(() => {
                const plaidPrices = {};
                portfolioNotes.forEach(note => {
                    const ticker = normalizeTicker(note.title);
                    const price = getPlaidPositionPrice(note);
                    if (ticker && price > 0) plaidPrices[ticker] = price;
                });
                if (!Object.keys(plaidPrices).length) return;
                setPortfolioPrices(previous => {
                    const hasChange = Object.entries(plaidPrices)
                        .some(([ticker, price]) => previous[ticker] !== price);
                    return hasChange ? { ...previous, ...plaidPrices } : previous;
                });
            }, [portfolioNotes, portfolioTickerKey]);

            // Portfolio price fetching effect - updates at 9:35am, 1pm, and 4:05pm EST
            useEffect(() => {
                if (portfolioNotes.length === 0) return;

                const nonUsdPortfolioNotes = portfolioNotes.filter(note =>
                    !isUsdTicker(note.title) && !isPlaidCryptoNote(note)
                );
                if (!finnhubApiKey && nonUsdPortfolioNotes.length > 0) return;

                let isMounted = true;

                // Check if we should fetch prices (9:35am, 1pm, or 4:05pm EST windows, or no cached data)
                const shouldFetchPrices = () => {
                    const cacheKey = 'portfolio_prices_cache';
                    const cached = localStorage.getItem(cacheKey);

                    // Get current time in EST
                    const now = new Date();
                    const estOffset = -5; // EST is UTC-5 (ignoring DST for simplicity)
                    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
                    const estTime = new Date(utc + (3600000 * estOffset));
                    const estHour = estTime.getHours();
                    const estMinutes = estTime.getMinutes();
                    const totalMinutes = estHour * 60 + estMinutes;

                    // Define fetch windows (15-minute windows):
                    // - Market open: 9:35-9:50 EST (575-590 minutes)
                    // - Mid day: 13:00-13:15 EST (780-795 minutes)
                    // - Market close: 16:05-16:20 EST (965-980 minutes)
                    const isMarketOpenWindow = totalMinutes >= 575 && totalMinutes < 590;
                    const isMiddayWindow = totalMinutes >= 780 && totalMinutes < 795;
                    const isMarketCloseWindow = totalMinutes >= 965 && totalMinutes < 980;

                    if (!cached) {
                        return { shouldFetch: true, cachedPrices: null };
                    }

                    try {
                        const { prices, timestamp, fetchedWindow } = JSON.parse(cached);
                        const cacheAge = Date.now() - timestamp;
                        const oneHour = 60 * 60 * 1000;

                        // Determine current window identifier
                        const today = estTime.toISOString().split('T')[0];
                        const currentWindow = isMarketOpenWindow ? `${today}-935am` :
                                             isMiddayWindow ? `${today}-1pm` :
                                             isMarketCloseWindow ? `${today}-405pm` : null;

                        // Fetch if: in a fetch window AND haven't fetched this window yet
                        // OR if cache is older than 8 hours (stale data)
                        if ((isMarketOpenWindow || isMiddayWindow || isMarketCloseWindow) && fetchedWindow !== currentWindow) {
                            return { shouldFetch: true, cachedPrices: prices, currentWindow };
                        }

                        // Use cached data if less than 8 hours old
                        if (cacheAge < 8 * oneHour) {
                            return { shouldFetch: false, cachedPrices: prices };
                        }

                        // Cache is stale, fetch fresh
                        return { shouldFetch: true, cachedPrices: prices };
                    } catch (e) {
                        return { shouldFetch: true, cachedPrices: null };
                    }
                };

                const { shouldFetch, cachedPrices, currentWindow } = shouldFetchPrices();

                // If we have cached prices, use them immediately
                if (cachedPrices && Object.keys(cachedPrices).length > 0) {
                    setPortfolioPrices(cachedPrices);
                    if (!shouldFetch) {
                        setPortfolioLoading(false);
                        return;
                    }
                }

                if (!shouldFetch) {
                    setPortfolioLoading(false);
                    return;
                }

                setPortfolioLoading(true);

                const fetchPrices = async () => {
                    const prices = { ...normalizePriceMap(portfolioPrices) };
                    for (const note of portfolioNotes) {
                        try {
                            const ticker = normalizeTicker(note.title);
                            if (isUsdTicker(ticker)) {
                                prices[ticker] = 1;
                                continue;
                            }
                            const plaidCryptoPrice = getPlaidCryptoPrice(note);
                            if (plaidCryptoPrice > 0) {
                                prices[ticker] = plaidCryptoPrice;
                                continue;
                            }
                            const portfolioQuoteUrl = buildApiUrl('https://finnhub.io/api/v1/quote', {
                                symbol: ticker,
                                token: finnhubApiKey
                            });
                            const response = await fetch(portfolioQuoteUrl);
                            const data = await response.json();
                            const currentPrice = typeof data?.c === 'number' ? data.c : parseFloat(data?.c);
                            if (ticker && Number.isFinite(currentPrice) && currentPrice > 0) prices[ticker] = currentPrice;
                        } catch (e) {
                            console.error(`Failed to fetch ${note.title}`);
                        }
                    }
                    const normalizedPrices = normalizePriceMap(prices);
                    if (isMounted) {
                        setPortfolioPrices(normalizedPrices);
                        setPortfolioLoading(false);
                        // Cache the prices with timestamp and window identifier
                        localStorage.setItem('portfolio_prices_cache', JSON.stringify({
                            prices: normalizedPrices,
                            timestamp: Date.now(),
                            fetchedWindow: currentWindow || `manual-${Date.now()}`
                        }));
                    }
                };

                fetchPrices();
                return () => { isMounted = false; };
            }, [portfolioTickerKey, finnhubApiKey]);

            // Portfolio computed data - derived from notes.
            // Percentages are always relative to the set being shown, so the same builder
            // powers both the composite view and each single-account view.
            const buildHoldings = useCallback((noteList) => {
                const holdings = noteList.map(n => {
                    const ticker = normalizeTicker(n.title);
                    const price = isUsdTicker(ticker) ? 1 : portfolioPrices[ticker] || 0;
                    const value = price * n.shares;
                    const rawCostBasis = n.plaidCostBasis;
                    const parsedCostBasis = Number(rawCostBasis);
                    const hasCostBasis = rawCostBasis !== null
                        && rawCostBasis !== undefined
                        && rawCostBasis !== ''
                        && Number.isFinite(parsedCostBasis)
                        && parsedCostBasis >= 0;
                    const costBasis = hasCostBasis ? parsedCostBasis : null;
                    const hasMarketValue = Number.isFinite(price) && price > 0;
                    const unrealizedPnL = hasCostBasis && hasMarketValue ? value - costBasis : null;
                    const unrealizedPnLPercent = unrealizedPnL != null && costBasis > 0
                        ? (unrealizedPnL / costBasis) * 100
                        : null;
                    return {
                        ticker: ticker || n.title,
                        shares: n.shares,
                        price,
                        value,
                        costBasis,
                        unrealizedPnL,
                        unrealizedPnLPercent,
                        taxLotCount: Number(n.plaidTaxLotCount) || 0,
                        noteId: n.id,
                        color: n.color,
                        account: getNoteAccount(n)
                    };
                });
                const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
                return holdings.map(h => ({
                    ...h,
                    percentage: totalValue > 0 ? (h.value / totalValue) * 100 : 0
                })).sort((a, b) => b.value - a.value);
            }, [portfolioPrices]);

            // Every position, ignoring the account filter — used for account totals and Ask K.
            const allPortfolioData = useMemo(() => buildHoldings(portfolioNotes), [portfolioNotes, buildHoldings]);

            // Accounts that actually hold something, in canonical order (plus Unassigned last).
            const presentAccountIds = useMemo(() => {
                const present = new Set(allPortfolioData.map(h => h.account));
                return [
                    ...ACCOUNT_IDS.filter(id => present.has(id)),
                    ...(present.has(UNASSIGNED_ACCOUNT_ID) ? [UNASSIGNED_ACCOUNT_ID] : [])
                ];
            }, [allPortfolioData]);

            const accountTotals = useMemo(() => {
                const totals = {};
                allPortfolioData.forEach(h => {
                    if (!totals[h.account]) {
                        totals[h.account] = {
                            value: 0,
                            positionCount: 0,
                            knownCostBasis: 0,
                            unrealizedPnL: 0,
                            pnlPositionCount: 0,
                            missingPnlCount: 0,
                        };
                    }
                    totals[h.account].value += h.value;
                    totals[h.account].positionCount += 1;
                    if (h.unrealizedPnL != null) {
                        totals[h.account].knownCostBasis += h.costBasis;
                        totals[h.account].unrealizedPnL += h.unrealizedPnL;
                        totals[h.account].pnlPositionCount += 1;
                    } else {
                        totals[h.account].missingPnlCount += 1;
                    }
                });
                Object.values(totals).forEach(total => {
                    total.unrealizedPnLPercent = total.knownCostBasis > 0
                        ? (total.unrealizedPnL / total.knownCostBasis) * 100
                        : null;
                });
                return totals;
            }, [allPortfolioData]);

            const grandPortfolioValue = useMemo(() =>
                allPortfolioData.reduce((sum, h) => sum + h.value, 0),
            [allPortfolioData]);

            const allPortfolioPnlTotals = useMemo(() => {
                const covered = allPortfolioData.filter(h => h.unrealizedPnL != null);
                const knownCostBasis = covered.reduce((sum, h) => sum + h.costBasis, 0);
                const unrealizedPnL = covered.reduce((sum, h) => sum + h.unrealizedPnL, 0);
                return {
                    knownCostBasis,
                    unrealizedPnL,
                    unrealizedPnLPercent: knownCostBasis > 0 ? (unrealizedPnL / knownCostBasis) * 100 : null,
                    coveredCount: covered.length,
                    missingCount: allPortfolioData.length - covered.length,
                };
            }, [allPortfolioData]);

            // Order of the account sections in the notes grid: biggest account first, which
            // composes with the within-account size ordering from sortedClassifiedNotes.
            // Unassigned stays pinned last — it's a catch-all, not a real portfolio.
            const accountSectionOrder = useMemo(() => {
                const ids = [...ACCOUNT_IDS];
                ids.sort((a, b) => (accountTotals[b]?.value || 0) - (accountTotals[a]?.value || 0));
                return [...ids, UNASSIGNED_ACCOUNT_ID];
            }, [accountTotals]);

            // CSP obligation for whatever the pie is currently showing. Puts carry an account,
            // so a single-account view must not report the whole book's obligation.
            const shownPutObligation = portfolioAccountFilter === 'all'
                ? totalPutObligation
                : (putObligationByAccount[portfolioAccountFilter] || 0);

            const filteredPortfolioNotes = useMemo(() =>
                portfolioAccountFilter === 'all'
                    ? portfolioNotes
                    : portfolioNotes.filter(n => getNoteAccount(n) === portfolioAccountFilter),
            [portfolioNotes, portfolioAccountFilter]);

            const portfolioData = useMemo(() => buildHoldings(filteredPortfolioNotes), [filteredPortfolioNotes, buildHoldings]);

            const totalPortfolioValue = useMemo(() =>
                portfolioData.reduce((sum, h) => sum + h.value, 0),
            [portfolioData]);
            const portfolioPnlTotals = useMemo(() => {
                const covered = portfolioData.filter(h => h.unrealizedPnL != null);
                const knownCostBasis = covered.reduce((sum, h) => sum + h.costBasis, 0);
                const unrealizedPnL = covered.reduce((sum, h) => sum + h.unrealizedPnL, 0);
                return {
                    knownCostBasis,
                    unrealizedPnL,
                    unrealizedPnLPercent: knownCostBasis > 0 ? (unrealizedPnL / knownCostBasis) * 100 : null,
                    coveredCount: covered.length,
                    missingCount: portfolioData.length - covered.length,
                };
            }, [portfolioData]);
            const shownYtdPerformance = portfolioAccountFilter === 'all'
                ? robinhoodPerformance?.total
                : robinhoodPerformance?.accounts?.[portfolioAccountFilter];
            portfolioDataRef.current = portfolioData;

            // Don't strand the user on an account tab whose last position was just removed.
            useEffect(() => {
                if (portfolioAccountFilter === 'all') return;
                if (allPortfolioData.length === 0) return;
                if (!presentAccountIds.includes(portfolioAccountFilter)) setPortfolioAccountFilter('all');
            }, [portfolioAccountFilter, presentAccountIds, allPortfolioData.length]);

            const missingPortfolioPriceCount = useMemo(
                () => portfolioData.filter(h => !Number.isFinite(h.price) || h.price <= 0).length,
                [portfolioData]
            );

            const cashPortfolioValue = useMemo(() =>
                portfolioData
                    .filter(isCashHolding)
                    .reduce((sum, h) => sum + h.value, 0),
            // isCashHolding closes over colorLabels, which is already declared here.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            [portfolioData, colorLabels]);
            const cashPortfolioPercentage = totalPortfolioValue > 0
                ? (cashPortfolioValue / totalPortfolioValue) * 100
                : 0;
            const nonCashPortfolioValue = Math.max(0, totalPortfolioValue - cashPortfolioValue);
            const portfolioMapTiles = useMemo(() => {
                const cashPositions = portfolioData.filter(isCashHolding);
                const stockPositions = portfolioData.filter(h => !isCashHolding(h));
                const cashValue = cashPositions.reduce((sum, h) => sum + h.value, 0);
                const cashPercentage = cashPositions.reduce((sum, h) => sum + h.percentage, 0);
                const minNamedStockCount = Math.ceil(stockPositions.length * 0.5);
                const preferredNamedStockCount = Math.min(16, stockPositions.length);
                const namedStockCount = Math.min(
                    stockPositions.length,
                    Math.max(minNamedStockCount, preferredNamedStockCount)
                );
                const namedStocks = stockPositions.slice(0, namedStockCount);
                const others = stockPositions.slice(namedStockCount);
                const tiles = [
                    ...(cashValue > 0 ? [{
                        ticker: 'Cash',
                        value: cashValue,
                        percentage: cashPercentage,
                        color: '#16a34a'
                    }] : []),
                    ...namedStocks.map((h, i) => ({
                        ticker: h.ticker,
                        value: h.value,
                        percentage: h.percentage,
                        color: TREEMAP_COLORS[(i + 1) % TREEMAP_COLORS.length]
                    }))
                ];
                if (others.length > 0) {
                    tiles.push({
                        ticker: 'OTHERS',
                        value: others.reduce((sum, h) => sum + h.value, 0),
                        percentage: others.reduce((sum, h) => sum + h.percentage, 0),
                        color: '#6b7280'
                    });
                }

                const cashTile = tiles.find(tile => tile.ticker === 'Cash');
                const stockTiles = tiles.filter(tile => tile.ticker !== 'Cash');
                const out = [];
                const cashHeight = cashTile ? Math.max(18, Math.min(62, cashTile.percentage)) : 0;
                if (cashTile) {
                    out.push({ ...cashTile, x: 0, y: 0, w: 100, h: cashHeight, layout: 'hero' });
                }

                if (!stockTiles.length) return out;

                const stockTop = cashTile ? cashHeight : 0;
                const stockHeight = Math.max(0, 100 - stockTop);

                layoutPortfolioTreemapTiles(stockTiles, 100, stockHeight).forEach(tile => {
                    const isCompact = tile.percentage < 3 || tile.w < 12 || tile.h < 8;
                    out.push({
                        ...tile,
                        x: tile.x,
                        y: stockTop + tile.y,
                        w: tile.w,
                        h: tile.h,
                        layout: isCompact ? 'compact' : 'major'
                    });
                });

                return out;
            // isCashHolding closes over colorLabels, which is already declared here.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            }, [portfolioData, colorLabels]);

            // Content key for colorLabels. The chart effect reads colorLabels but must not
            // depend on its object identity — a snapshot that reassigns an equal object
            // would otherwise tear down and rebuild the chart for no reason.
            const colorLabelsKey = useMemo(() => JSON.stringify(colorLabels), [colorLabels]);

            // Stable key for chart redraws. Firestore snapshots can replace `notes` with
            // equal data, which creates new portfolioData arrays; depending on the array
            // identity made Chart.js destroy/recreate the pie chart and visibly flash.
            const portfolioChartDataKey = useMemo(() =>
                portfolioData.map(h => [
                    h.noteId,
                    h.ticker,
                    h.shares,
                    Number((h.price || 0).toFixed(4)),
                    Number((h.value || 0).toFixed(2)),
                    h.costBasis == null ? '' : Number(h.costBasis.toFixed(2)),
                    h.unrealizedPnL == null ? '' : Number(h.unrealizedPnL.toFixed(2)),
                    Number((h.percentage || 0).toFixed(4)),
                    h.color,
                    colorLabels[h.color] || ''
                ].join(':')).join('|'),
            [portfolioData, colorLabels]);

            // Snapshot of portfolio state shipped to the Ask K assistant on each turn.
            const askKPortfolio = useMemo(() => {
                const noteById = new Map(notes.map(n => [n.id, n]));
                const portfolioNoteIds = new Set(allPortfolioData.map(h => h.noteId));
                const trimNote = (t) => String(t || '').trim().slice(0, 1500);
                // Ask K always sees every account, regardless of which one is on screen.
                const missingPrices = allPortfolioData.filter(h => !Number.isFinite(h.price) || h.price <= 0).length;
                const positionsWithCostBasis = allPortfolioData.filter(h => h.costBasis != null);
                const positionsWithUnrealizedPnL = positionsWithCostBasis.filter(h => h.unrealizedPnL != null);
                const knownCostBasis = positionsWithUnrealizedPnL.reduce((sum, h) => sum + h.costBasis, 0);
                const knownUnrealizedPnL = positionsWithUnrealizedPnL.reduce((sum, h) => sum + h.unrealizedPnL, 0);

                return {
                    asOf: new Date().toISOString(),
                    nickname: nickname || null,
                    totals: {
                        longMarketValue: Number(grandPortfolioValue.toFixed(2)),
                        cspObligation: Number(totalPutObligation.toFixed(2)),
                        longPlusCspExposure: Number((grandPortfolioValue + totalPutObligation).toFixed(2)),
                        positionCount: allPortfolioData.length,
                        cspCount: cashSecuredPuts.length,
                        missingPrices,
                        positionsWithCostBasis: positionsWithCostBasis.length,
                        positionsWithUnrealizedPnL: positionsWithUnrealizedPnL.length,
                        knownCostBasis: Number(knownCostBasis.toFixed(2)),
                        knownUnrealizedPnL: Number(knownUnrealizedPnL.toFixed(2)),
                        knownUnrealizedPnLPercent: knownCostBasis > 0
                            ? Number(((knownUnrealizedPnL / knownCostBasis) * 100).toFixed(2))
                            : null
                    },
                    // Account definitions + per-account totals. Positions carry an `account`
                    // id so Ask K can answer composite or per-account questions.
                    accounts: [
                        ...ACCOUNTS.map(a => ({
                            id: a.id,
                            label: a.label,
                            strategy: a.strategy,
                            marketValue: Number((accountTotals[a.id]?.value || 0).toFixed(2)),
                            knownCostBasis: Number(allPortfolioData
                                .filter(h => h.account === a.id && h.unrealizedPnL != null)
                                .reduce((sum, h) => sum + h.costBasis, 0)
                                .toFixed(2)),
                            knownUnrealizedPnL: Number(allPortfolioData
                                .filter(h => h.account === a.id && h.unrealizedPnL != null)
                                .reduce((sum, h) => sum + h.unrealizedPnL, 0)
                                .toFixed(2)),
                            positionCount: accountTotals[a.id]?.positionCount || 0,
                            percentOfTotal: grandPortfolioValue > 0
                                ? Number((((accountTotals[a.id]?.value || 0) / grandPortfolioValue) * 100).toFixed(2))
                                : 0,
                            cspObligation: Number((putObligationByAccount[a.id] || 0).toFixed(2))
                        })),
                        ...(accountTotals[UNASSIGNED_ACCOUNT_ID] ? [{
                            id: UNASSIGNED_ACCOUNT_ID,
                            label: 'Unassigned',
                            strategy: 'Positions the user has not yet assigned to an account.',
                            marketValue: Number(accountTotals[UNASSIGNED_ACCOUNT_ID].value.toFixed(2)),
                            positionCount: accountTotals[UNASSIGNED_ACCOUNT_ID].positionCount,
                            percentOfTotal: grandPortfolioValue > 0
                                ? Number(((accountTotals[UNASSIGNED_ACCOUNT_ID].value / grandPortfolioValue) * 100).toFixed(2))
                                : 0
                        }] : [])
                    ],
                    positions: allPortfolioData.map(h => {
                        const n = noteById.get(h.noteId);
                        return {
                            ticker: h.ticker,
                            shares: h.shares,
                            price: Number((h.price || 0).toFixed(4)),
                            value: Number((h.value || 0).toFixed(2)),
                            costBasis: h.costBasis == null ? null : Number(h.costBasis.toFixed(2)),
                            unrealizedPnL: h.unrealizedPnL == null ? null : Number(h.unrealizedPnL.toFixed(2)),
                            unrealizedPnLPercent: h.unrealizedPnLPercent == null
                                ? null
                                : Number(h.unrealizedPnLPercent.toFixed(2)),
                            taxLotCount: h.taxLotCount,
                            percentOfPortfolio: Number((h.percentage || 0).toFixed(2)),
                            account: h.account,
                            accountLabel: getAccountLabel(h.account),
                            percentOfAccount: (accountTotals[h.account]?.value || 0) > 0
                                ? Number(((h.value / accountTotals[h.account].value) * 100).toFixed(2))
                                : 0,
                            category: colorLabels[h.color] || 'Unclassified',
                            note: trimNote(n?.text)
                        };
                    }),
                    // Notes with content that aren't tied to a position (research/thesis on watch-list or pre-position tickers).
                    researchNotes: notes
                        .filter(n => n.title && n.text && n.text.trim() && !portfolioNoteIds.has(n.id))
                        .slice(0, 50)
                        .map(n => ({
                            ticker: normalizeTicker(n.title) || n.title,
                            category: colorLabels[n.color] || 'Unclassified',
                            note: trimNote(n.text)
                        })),
                    cashSecuredPuts: cashSecuredPuts.map(p => ({
                        ticker: p.ticker,
                        strike: Number(p.strike) || 0,
                        qty: Number(p.qty) || 0,
                        expiry: p.expiry || null,
                        obligation: (Number(p.strike) || 0) * (Number(p.qty) || 0) * 100,
                        account: getPutAccount(p),
                        accountLabel: getAccountLabel(getPutAccount(p))
                    })),
                    watchList: Array.isArray(watchList) ? watchList.slice(0, 100) : [],
                    categories: categories.map(c => ({ color: c, label: colorLabels[c] || 'Category' }))
                };
            }, [notes, nickname, grandPortfolioValue, totalPutObligation, putObligationByAccount, allPortfolioData, accountTotals, cashSecuredPuts, watchList, categories, colorLabels]);

            // Markdown snapshot of whatever the Portfolio tab is currently showing, for
            // pasting into an external LLM. Follows the account filter, exactly like the
            // donut and legend do, so what you copy is what you see.
            const buildPortfolioExport = () => {
                const scopeLabel = portfolioAccountFilter === 'all' ? 'All Accounts' : getAccountLabel(portfolioAccountFilter);
                const owner = nickname || currentUser?.split('@')[0] || 'User';
                const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const noteById = new Map(notes.map(n => [n.id, n]));
                const shownPuts = portfolioAccountFilter === 'all'
                    ? cashSecuredPuts
                    : cashSecuredPuts.filter(p => getPutAccount(p) === portfolioAccountFilter);

                const lines = [];
                lines.push(`# ${owner}'s Portfolio — ${scopeLabel}`);
                lines.push(`As of ${new Date().toLocaleString()}`);
                lines.push('');

                lines.push('## Totals');
                lines.push(`- Market value: ${money(totalPortfolioValue)}`);
                lines.push(`- Positions: ${portfolioData.length}`);
                if (cashPortfolioValue > 0) {
                    const cashPct = totalPortfolioValue > 0 ? (cashPortfolioValue / totalPortfolioValue) * 100 : 0;
                    lines.push(`- Cash & equivalents (${CASH_EQUIVALENT_TICKERS.join(', ')} or Cash category): ${money(cashPortfolioValue)} (${cashPct.toFixed(1)}%)`);
                }
                if (shownPutObligation > 0) {
                    lines.push(`- Cash secured put obligation: ${money(shownPutObligation)} (collateral held separately by the broker, not included in market value)`);
                    lines.push(`- Market value + CSP obligation: ${money(totalPortfolioValue + shownPutObligation)}`);
                }
                if (portfolioAccountFilter !== 'all' && grandPortfolioValue > 0) {
                    lines.push(`- Share of combined portfolio: ${((totalPortfolioValue / grandPortfolioValue) * 100).toFixed(1)}% of ${money(grandPortfolioValue)}`);
                }
                if (missingPortfolioPriceCount > 0) {
                    lines.push(`- NOTE: ${missingPortfolioPriceCount} position(s) have no live price and are valued at $0 below.`);
                }
                lines.push('');

                if (portfolioAccountFilter === 'all' && presentAccountIds.length > 1) {
                    lines.push('## Accounts');
                    lines.push('Each account is run with a different intent, so judge a position against the account holding it.');
                    lines.push('');
                    lines.push('| Account | Intent | Market value | % of total | Positions | CSP obligation |');
                    lines.push('|---|---|---|---|---|---|');
                    presentAccountIds.forEach(id => {
                        const value = accountTotals[id]?.value || 0;
                        const pct = grandPortfolioValue > 0 ? (value / grandPortfolioValue) * 100 : 0;
                        const intent = ACCOUNTS.find(a => a.id === id)?.strategy || 'Not yet assigned to an account.';
                        lines.push(`| ${getAccountLabel(id)} | ${intent} | ${money(value)} | ${pct.toFixed(1)}% | ${accountTotals[id]?.positionCount || 0} | ${money(putObligationByAccount[id] || 0)} |`);
                    });
                    lines.push('');
                }

                lines.push('## Positions');
                if (portfolioData.length === 0) {
                    lines.push('_No positions._');
                } else {
                    lines.push('| # | Ticker | Account | Category | Shares | Price | Market value | Cost basis | Unrealized P&L | % of shown |');
                    lines.push('|---|---|---|---|---|---|---|---|---|---|');
                    portfolioData.forEach((h, i) => {
                        const priced = Number.isFinite(h.price) && h.price > 0;
                        const cells = [
                            i + 1,
                            h.ticker,
                            getAccountLabel(h.account),
                            colorLabels[h.color] || 'Unclassified',
                            h.shares.toLocaleString(),
                            priced ? money(h.price) : 'no price',
                            priced ? money(h.value) : '—',
                            h.costBasis == null ? 'unavailable' : money(h.costBasis),
                            h.unrealizedPnL == null
                                ? 'unavailable'
                                : `${h.unrealizedPnL >= 0 ? '+' : ''}${money(h.unrealizedPnL)}${h.unrealizedPnLPercent == null ? '' : ` (${h.unrealizedPnLPercent >= 0 ? '+' : ''}${h.unrealizedPnLPercent.toFixed(2)}%)`}`,
                            `${h.percentage.toFixed(2)}%`
                        ];
                        lines.push(`| ${cells.join(' | ')} |`);
                    });
                }
                lines.push('');

                if (shownPuts.length > 0) {
                    lines.push('## Cash Secured Puts');
                    lines.push('Obligation = strike x qty x 100. Assignment would add the underlying to that account.');
                    lines.push('');
                    lines.push('| Ticker | Account | Strike | Qty | Expiry | Obligation |');
                    lines.push('|---|---|---|---|---|---|');
                    shownPuts.forEach(p => {
                        lines.push(`| ${p.ticker} | ${getAccountLabel(getPutAccount(p))} | $${p.strike} | ${p.qty || '—'} | ${p.expiry || '—'} | ${money(getPutObligation(p))} |`);
                    });
                    lines.push('');
                }

                // Thesis / target notes are the most useful part for an outside analyst.
                const withNotes = portfolioData
                    .map(h => ({ h, text: String(noteById.get(h.noteId)?.text || '').trim() }))
                    .filter(entry => entry.text);
                if (withNotes.length > 0) {
                    lines.push('## Position notes');
                    withNotes.forEach(({ h, text }) => {
                        lines.push(`### ${h.ticker} — ${getAccountLabel(h.account)}`);
                        lines.push(text.slice(0, 2000));
                        lines.push('');
                    });
                }

                return lines.join('\n').trim();
            };

            const handleCopyPortfolio = async () => {
                if (portfolioData.length === 0) {
                    showBrandedNotice('Nothing to copy — this view has no positions.');
                    return;
                }
                const text = buildPortfolioExport();
                try {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(text);
                    } else {
                        // Fallback for browsers without the async clipboard API.
                        const area = document.createElement('textarea');
                        area.value = text;
                        area.setAttribute('readonly', '');
                        area.style.position = 'fixed';
                        area.style.opacity = '0';
                        document.body.appendChild(area);
                        area.select();
                        const ok = document.execCommand('copy');
                        document.body.removeChild(area);
                        if (!ok) throw new Error('Copy command was blocked');
                    }
                    const scopeLabel = portfolioAccountFilter === 'all' ? 'all accounts' : getAccountLabel(portfolioAccountFilter);
                    showBrandedNotice(
                        `Copied ${portfolioData.length} position${portfolioData.length !== 1 ? 's' : ''} (${scopeLabel}) to your clipboard as Markdown. Paste it into any LLM to have it analyzed.`,
                        'Portfolio copied'
                    );
                } catch (err) {
                    console.error('Clipboard copy failed:', err);
                    showBrandedNotice('Could not access the clipboard. Your browser may have blocked it — try again, or use the Snapshot button instead.', 'Copy failed');
                }
            };

            // Update shares for a note
            const updateNoteShares = (noteId, shares) => {
                const parsedShares = parseFloat(shares);
                setNotes(notes.map(n => n.id === noteId ? {...n, shares: isNaN(parsedShares) ? 0 : parsedShares} : n));
            };

            // Single definition of a note card's props — the notes grid renders the same
            // card under three different groupings (account, category, size).
            const renderNoteCard = (note) => (
                <NoteCard
                    key={`${note.id}:${note.plaidImportedAt || ''}`}
                    note={note}
                    darkMode={darkMode}
                    positionRankById={positionRankById}
                    totalPositions={totalPositions}
                    positionDetailsById={positionDetailsById}
                    categories={categories}
                    colorLabels={colorLabels}
                    notes={notes}
                    setNotes={setNotes}
                    deleteNote={deleteNote}
                    updateNoteTitle={updateNoteTitle}
                    updateNoteShares={updateNoteShares}
                    updateNoteAccount={updateNoteAccount}
                    accounts={ACCOUNTS}
                    accountIds={ACCOUNT_IDS}
                    isUnlocked={!!unlockedNotes[note.id]}
                    toggleNoteLock={toggleNoteLock}
                    isDuplicate={duplicateNoteIds.has(note.id)}
                    warnIfDuplicateTicker={warnIfDuplicateTicker}
                    sharesPrivacyMode={sharesPrivacyMode}
                    hidePortfolioValues={hidePortfolioValues}
                    setExpandedNote={setExpandedNote}
                    showBrandedNotice={showBrandedNotice}
                    sanitizeContent={sanitizeContent}
                    validateContent={validateContent}
                    MAX_CONTENT_LENGTH={MAX_CONTENT_LENGTH}
                    X={X}
                    Maximize={Maximize}
                    Lock={Lock}
                    Unlock={Unlock}
                />
            );

            // A ticker may legitimately be held in several accounts (SGOV sits in both IRAs),
            // but only once within a single account — two notes for the same holding would
            // double-count it in that account's market value and percentages.
            const findDuplicateNote = (ticker, accountId, excludeNoteId) => {
                const target = normalizeTicker(ticker);
                if (!target) return null;
                return notes.find(n =>
                    n.id !== excludeNoteId &&
                    normalizeTicker(n.title) === target &&
                    getNoteAccount(n) === accountId
                ) || null;
            };

            // Ids of every note currently colliding with another. Both sides of a collision
            // are flagged so either one can be fixed.
            const duplicateNoteIds = useMemo(() => {
                const seen = new Map();
                const dupes = new Set();
                notes.forEach(n => {
                    const ticker = normalizeTicker(n.title);
                    if (!ticker) return;
                    const key = `${getNoteAccount(n)}|${ticker}`;
                    if (seen.has(key)) {
                        dupes.add(seen.get(key));
                        dupes.add(n.id);
                    } else {
                        seen.set(key, n.id);
                    }
                });
                return dupes;
            }, [notes]);

            // Assign a note (position) to a brokerage account. Refuses a move that would put
            // two notes for the same ticker in one account. Returns whether it applied.
            const updateNoteAccount = (noteId, account) => {
                const nextAccount = ACCOUNT_IDS.includes(account) ? account : DEFAULT_ACCOUNT_ID;
                const note = notes.find(n => n.id === noteId);
                const clash = findDuplicateNote(note?.title, nextAccount, noteId);
                if (clash) {
                    showBrandedNotice(
                        `${normalizeTicker(note.title)} is already in ${getAccountLabel(nextAccount)}. Combine the two notes instead of holding it twice in one account.`,
                        'Duplicate position'
                    );
                    return false;
                }
                setNotes(notes.map(n => n.id === noteId ? {...n, account: nextAccount} : n));
                return true;
            };

            // Checked on blur rather than per keystroke — every partial ticker on the way to
            // the real one would otherwise trip the warning.
            const warnIfDuplicateTicker = (noteId) => {
                const note = notes.find(n => n.id === noteId);
                if (!note) return;
                const accountId = getNoteAccount(note);
                const clash = findDuplicateNote(note.title, accountId, noteId);
                if (!clash) return;
                showBrandedNotice(
                    `${normalizeTicker(note.title)} already has a note in ${getAccountLabel(accountId)}. Two notes for one holding will double-count it in that account.`,
                    'Duplicate position'
                );
            };

            // Chart rendering effect - runs when tab changes, data changes, or after a short delay to ensure canvas is mounted
            useEffect(() => {
                if (mainTab !== 'portfolio' || portfolioViewMode !== 'donut' || portfolioChartDataKey.length === 0) {
                    if (chartInstance.current) {
                        chartInstance.current.destroy();
                        chartInstance.current = null;
                    }
                    return;
                }

                // Small delay to ensure canvas is mounted in DOM
                const timeoutId = setTimeout(() => {
                    if (!chartRef.current) return;

                    const currentPortfolioData = portfolioDataRef.current;
                    if (currentPortfolioData.length === 0) return;

                    if (chartInstance.current) {
                        chartInstance.current.destroy();
                    }

                    // Group every position whose category label is "Cash" into one dedicated
                    // chart slice. Keep that Cash slice visible even if it is under the normal
                    // small-slice threshold, then combine only small non-cash positions into Others.
                    const cashPositions = currentPortfolioData.filter(isCashHolding);
                    const nonCashPositions = currentPortfolioData.filter(h => !isCashHolding(h));
                    const cashValue = cashPositions.reduce((sum, h) => sum + h.value, 0);
                    const cashPercentage = cashPositions.reduce((sum, h) => sum + h.percentage, 0);
                    const nonCashValue = nonCashPositions.reduce((sum, h) => sum + h.value, 0);
                    const chartTotalValue = portfolioDonutIncludesCash ? totalPortfolioValue : nonCashValue;
                    const withChartPercentage = (holding) => ({
                        ...holding,
                        percentage: chartTotalValue > 0 ? (holding.value / chartTotalValue) * 100 : 0
                    });
                    const cashColor = cashPositions[0]?.color;
                    const CASH_CHART_COLOR = '#16a34a';
                    const makeCashSlice = (ticker, value, extra = {}) => ({
                        ticker,
                        shares: cashPositions.reduce((sum, h) => sum + (Number(h.shares) || 0), 0),
                        price: 1,
                        value,
                        percentage: chartTotalValue > 0 ? (value / chartTotalValue) * 100 : 0,
                        cashTotalPercentage: cashPercentage,
                        percentOfCash: cashValue > 0 ? (value / cashValue) * 100 : 0,
                        color: cashColor,
                        isCashGroup: true,
                        positions: cashPositions,
                        ...extra
                    });
                    // CSP obligations are no longer carved out of the pie as a separate slice;
                    // cash is a single slice and the obligation total is annotated in the donut center.
                    const cashSlices = portfolioDonutIncludesCash && cashPositions.length > 0
                        ? [makeCashSlice('Cash', cashValue, { chartColor: CASH_CHART_COLOR })]
                        : [];
                    const groupedForChart = portfolioDonutIncludesCash && cashPositions.length > 0
                        ? [
                            { ticker: 'Cash', value: cashValue, percentage: cashPercentage, color: cashColor, isCashPlaceholder: true, slices: cashSlices },
                            ...nonCashPositions.map(withChartPercentage)
                        ].sort((a, b) => b.value - a.value)
                        : nonCashPositions.map(withChartPercentage);
                    const chartPortfolioData = groupedForChart.flatMap(h => h.isCashPlaceholder ? h.slices : [h]);
                    if (chartPortfolioData.length === 0) return;

                    // Keep the largest stock names readable, then roll small positions into "Others".
                    // A stock earns its own slice only if it clears the percent threshold, capped at
                    // a max count. If nothing clears the bar (a flat portfolio with no dominant
                    // holding), fall back to the largest few so "Others" doesn't swallow everything.
                    const STOCK_SLICE_MIN_PERCENT = 2.5;
                    const STOCK_SLICE_MAX_NAMED = 8;
                    const cashChartSlices = chartPortfolioData.filter(h => h.isCashGroup);
                    const stockChartSlices = chartPortfolioData
                        .filter(h => !h.isCashGroup)
                        .sort((a, b) => b.value - a.value);
                    let namedStockSlices = stockChartSlices
                        .filter(h => h.percentage >= STOCK_SLICE_MIN_PERCENT)
                        .slice(0, STOCK_SLICE_MAX_NAMED);
                    if (namedStockSlices.length === 0) {
                        namedStockSlices = stockChartSlices.slice(0, Math.min(stockChartSlices.length, 5));
                    }
                    const namedStockSet = new Set(namedStockSlices);
                    const smallSlices = stockChartSlices.filter(h => !namedStockSet.has(h));
                    const largeSlices = [...cashChartSlices, ...namedStockSlices]
                        .sort((a, b) => b.value - a.value);
                    const othersValue = smallSlices.reduce((sum, h) => sum + h.value, 0);
                    const othersPercentage = smallSlices.reduce((sum, h) => sum + h.percentage, 0);

                    // Build chart data: large slices + "Others" if there are small slices
                    const colors = [
                        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
                        '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
                    ];
                    const getChartColor = (h, i) => h.isCashGroup ? (h.chartColor || CASH_CHART_COLOR) : colors[i % colors.length];
                    const chartLabels = largeSlices.map(h => h.ticker);
                    const chartValues = largeSlices.map(h => h.value);
                    const chartColors = largeSlices.map(getChartColor);
                    // Hide the default solid divider between free-cash and CSP-cash arcs;
                    // a small plugin draws that one separator back as a dashed line.
                    const chartBorderColors = largeSlices.map(() => darkMode ? '#1f2937' : '#ffffff');

                    if (smallSlices.length > 0) {
                        chartLabels.push('OTHERS');
                        chartValues.push(othersValue);
                        chartColors.push('#9CA3AF'); // Gray for "Others"
                        chartBorderColors.push(darkMode ? '#1f2937' : '#ffffff');
                    }
                    const chartSlices = chartLabels.map((label, i) => {
                        const slice = i < largeSlices.length ? largeSlices[i] : null;
                        return {
                            label,
                            value: chartValues[i],
                            percentage: label === 'OTHERS' ? othersPercentage : (slice?.percentage || 0),
                            color: chartColors[i]
                        };
                    });
                    const formatPortfolioCalloutPercent = (percentage) => `${percentage.toFixed(1)}%`;
                    const formatPortfolioCalloutValue = (value) => formatUsd(value).replace(/\.00$/, '');
                    const portfolioCalloutPlugin = {
                        id: 'portfolioCalloutLabels',
                        afterDatasetsDraw: (chart) => {
                            const meta = chart.getDatasetMeta(0);
                            if (!meta?.data?.length) return;
                            const { ctx, chartArea } = chart;
                            const labelColor = darkMode ? '#D1D5DB' : '#6B7280';
                            const valueColor = darkMode ? '#E5E7EB' : '#1F2937';
                            const centerColor = darkMode ? '#F9FAFB' : '#111827';
                            const lineItems = meta.data.map((arc, index) => {
                                const angle = (arc.startAngle + arc.endAngle) / 2;
                                const side = Math.cos(angle) >= 0 ? 'right' : 'left';
                                const outerX = arc.x + Math.cos(angle) * arc.outerRadius;
                                const outerY = arc.y + Math.sin(angle) * arc.outerRadius;
                                const radialX = arc.x + Math.cos(angle) * (arc.outerRadius + 14);
                                const radialY = arc.y + Math.sin(angle) * (arc.outerRadius + 14);
                                const labelOffset = chart.width < 900 ? 118 : 170;
                                const labelGap = chart.width < 900 ? 10 : 14;
                                const textX = side === 'right'
                                    ? Math.min(chart.width - 14, arc.x + arc.outerRadius + labelOffset)
                                    : Math.max(14, arc.x - arc.outerRadius - labelOffset);
                                const lineEndX = side === 'right' ? textX - labelGap : textX + labelGap;
                                return { index, side, outerX, outerY, radialX, radialY, lineEndX, textX, textY: radialY };
                            });
                            ['left', 'right'].forEach((side) => {
                                const sideItems = lineItems
                                    .filter(item => item.side === side)
                                    .sort((a, b) => a.textY - b.textY);
                                const minY = chartArea.top + 30;
                                const maxY = chartArea.bottom - 30;
                                const minGap = portfolioLegendDollarAmounts && !hidePortfolioValues
                                    ? (chart.width < 900 ? 50 : 56)
                                    : (chart.width < 900 ? 38 : 44);
                                let nextY = minY;
                                sideItems.forEach(item => {
                                    item.textY = Math.max(item.textY, nextY);
                                    nextY = item.textY + minGap;
                                });
                                const overflow = sideItems.length ? sideItems[sideItems.length - 1].textY - maxY : 0;
                                if (overflow > 0) {
                                    const fittedGap = sideItems.length > 1
                                        ? Math.max(30, (maxY - minY) / (sideItems.length - 1))
                                        : 0;
                                    sideItems.forEach((item, i) => {
                                        item.textY = sideItems.length > 1
                                            ? minY + (i * fittedGap)
                                            : (minY + maxY) / 2;
                                    });
                                }
                            });

                            ctx.save();
                            if (portfolioLegendVisible) {
                                lineItems.forEach((item) => {
                                    const slice = chartSlices[item.index];
                                    ctx.strokeStyle = slice.color;
                                    ctx.lineWidth = 1.45;
                                    ctx.beginPath();
                                    ctx.moveTo(item.outerX, item.outerY);
                                    ctx.lineTo(item.radialX, item.radialY);
                                    ctx.lineTo(item.lineEndX, item.textY);
                                    ctx.stroke();

                                    ctx.textAlign = item.side === 'right' ? 'left' : 'right';
                                    ctx.textBaseline = 'alphabetic';
                                    ctx.fillStyle = valueColor;
                                    ctx.font = '800 19px Inter, system-ui, sans-serif';
                                    ctx.fillText(slice.label, item.textX, item.textY - 2);
                                    ctx.fillStyle = labelColor;
                                    ctx.font = '600 12px Inter, system-ui, sans-serif';
                                    ctx.fillText(formatPortfolioCalloutPercent(slice.percentage), item.textX, item.textY + 15);
                                    if (portfolioLegendDollarAmounts && !hidePortfolioValues) {
                                        ctx.font = '600 11px Inter, system-ui, sans-serif';
                                        ctx.fillText(formatPortfolioCalloutValue(slice.value), item.textX, item.textY + 30);
                                    }
                                });
                            }

                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            const centerX = meta.data[0].x;
                            const centerY = meta.data[0].y;
                            const hasCspObligation = shownPutObligation > 0;
                            ctx.fillStyle = centerColor;
                            ctx.font = '500 22px Inter, system-ui, sans-serif';
                            ctx.fillText(`${nickname || currentUser?.split('@')[0] || 'User'}`, centerX, hasCspObligation ? centerY - 18 : centerY);
                            if (hasCspObligation) {
                                ctx.fillStyle = labelColor;
                                ctx.font = '600 11px Inter, system-ui, sans-serif';
                                ctx.fillText('CSP Obligations', centerX, centerY + 8);
                                if (!hidePortfolioValues) {
                                    ctx.fillStyle = valueColor;
                                    ctx.font = '700 15px Inter, system-ui, sans-serif';
                                    ctx.fillText(formatPortfolioCalloutValue(shownPutObligation), centerX, centerY + 26);
                                }
                            }
                            ctx.restore();
                        }
                    };

                    chartInstance.current = new Chart(chartRef.current, {
                        type: 'doughnut',
                        data: {
                            labels: chartLabels,
                            datasets: [{
                                data: chartValues,
                                backgroundColor: chartColors,
                                borderWidth: 3,
                                borderColor: chartBorderColors
                            }]
                        },
                        plugins: [ChartDataLabels, portfolioCalloutPlugin],
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            cutout: '40%',
                            layout: {
                                padding: portfolioLegendVisible
                                    ? { top: 32, right: 76, bottom: 32, left: 76 }
                                    : { top: 24, right: 24, bottom: 24, left: 24 }
                            },
                            plugins: {
                                legend: {
                                    display: false
                                },
                                tooltip: {
                                    callbacks: {
                                        label: (ctx) => {
                                            const label = chartLabels[ctx.dataIndex];
                                            if (label === 'OTHERS') {
                                                const tickers = smallSlices.map(h => h.ticker).join(', ');
                                                if (hidePortfolioValues) {
                                                    return `OTHERS (${tickers}): ${othersPercentage.toFixed(1)}%`;
                                                }
                                                return `OTHERS (${tickers}): $${othersValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${othersPercentage.toFixed(1)}%)`;
                                            }
                                            const h = largeSlices[ctx.dataIndex];
                                            if (h.isCashGroup) {
                                                const tickers = [...new Set(h.positions.map(p => p.ticker))].join(', ');
                                                if (hidePortfolioValues) {
                                                    return `Cash (${tickers}): ${h.cashTotalPercentage.toFixed(1)}%`;
                                                }
                                                return `Cash (${tickers}): $${h.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${h.cashTotalPercentage.toFixed(1)}% total cash)`;
                                            }
                                            if (hidePortfolioValues) {
                                                return `${h.ticker}: ${h.shares} shares (${h.percentage.toFixed(1)}%)`;
                                            }
                                            const pnl = h.unrealizedPnL == null
                                                ? ''
                                                : ` | Unrealized P&L ${h.unrealizedPnL >= 0 ? '+' : ''}${formatUsd(h.unrealizedPnL)}${h.unrealizedPnLPercent == null ? '' : ` (${h.unrealizedPnLPercent >= 0 ? '+' : ''}${h.unrealizedPnLPercent.toFixed(1)}%)`}`;
                                            return `${h.ticker}: ${h.shares} shares @ $${h.price.toFixed(2)} = $${h.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${h.percentage.toFixed(1)}%)${pnl}`;
                                        }
                                    }
                                },
                                datalabels: {
                                    color: '#ffffff',
                                    font: {
                                        weight: 'bold',
                                        size: 10
                                    },
                                    formatter: (value, ctx) => {
                                        const label = chartLabels[ctx.dataIndex];
                                        const slice = largeSlices[ctx.dataIndex];
                                        if (slice?.isCashGroup) {
                                            return `${Math.round(slice.cashTotalPercentage)}%`;
                                        }
                                        const percentage = label === 'OTHERS' ? othersPercentage : slice.percentage;
                                        return `${percentage.toFixed(1)}%`;
                                    },
                                    anchor: 'center',
                                    align: 'center',
                                    textAlign: 'center',
                                    textStrokeColor: 'rgba(0,0,0,0.5)',
                                    textStrokeWidth: 2
                                }
                            }
                        }
                    });
                }, 50);

                return () => {
                    clearTimeout(timeoutId);
                    if (chartInstance.current) chartInstance.current.destroy();
                };
                // colorLabelsKey (not colorLabels) — depend on content, not object identity.
                // eslint-disable-next-line react-hooks/exhaustive-deps
            }, [mainTab, portfolioViewMode, portfolioChartDataKey, darkMode, hidePortfolioValues, portfolioLegendVisible, portfolioLegendDollarAmounts, portfolioDonutIncludesCash, colorLabelsKey, shownPutObligation, totalPortfolioValue, nickname, currentUser]);

            if (!currentUser) {
                return (
                    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
                        {loginHelpOpen && (
                            <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                                <div ref={loginHelpRef} className="bg-gray-900 w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
                                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                                        <h2 className="text-xl font-bold text-white">Getting started</h2>
                                        <button onClick={() => setLoginHelpOpen(false)} className="text-gray-400 hover:text-white">
                                            <X size={22} />
                                        </button>
                                    </div>
                                    <div className="px-6 py-5 space-y-5 text-sm text-gray-300 overflow-auto max-h-[calc(90vh-72px)]">
                                        <p className="text-gray-400">Two ways to create an account (pick whichever is easier):</p>

                                        <div className="space-y-2">
                                            <h3 className="text-white font-semibold">Option 1: Continue with Google (fastest)</h3>
                                            <ol className="list-decimal list-inside space-y-1">
                                                <li>Click <span className="text-white font-semibold">Continue with Google</span>.</li>
                                                <li>Select your Google account.</li>
                                                <li>That's it - your account is created automatically on first sign-in.</li>
                                            </ol>
                                        </div>

                                        <div className="space-y-2">
                                            <h3 className="text-white font-semibold">Option 2: Email + password</h3>
                                            <ol className="list-decimal list-inside space-y-1">
                                                <li>Click <span className="text-white font-semibold">Sign Up with Email</span>.</li>
                                                <li>Enter your email and a password.</li>
                                                <li>Click <span className="text-white font-semibold">Sign Up with Email</span> to create your account.</li>
                                            </ol>
                                            <p className="text-xs text-gray-400">Tip: If you already have an account, click "Login" instead.</p>
                                        </div>

                                        <div className="space-y-2">
                                            <h3 className="text-white font-semibold">Forgot password?</h3>
                                            <ol className="list-decimal list-inside space-y-1">
                                                <li>Click <span className="text-white font-semibold">Forgot password?</span></li>
                                                <li>Enter your email and send the reset email.</li>
                                                <li>Use the link in your inbox to set a new password.</li>
                                            </ol>
                                        </div>

                                        <div className="space-y-2">
                                            <h3 className="text-white font-semibold">After you sign in</h3>
                                            <ul className="list-disc list-inside space-y-1">
                                                <li>Your notes sync to your account automatically.</li>
                                                <li>API keys are optional (they unlock live quotes + news).</li>
                                            </ul>
                                        </div>

                                        <div className="pt-2 text-xs text-gray-400">
                                            You can review the <button type="button" className="text-cyan-300 hover:text-cyan-200 underline" onClick={() => { setLoginHelpOpen(false); setLegalView('privacy'); }}>Privacy Policy</button>
                                            {' '}and{' '}
                                            <button type="button" className="text-cyan-300 hover:text-cyan-200 underline" onClick={() => { setLoginHelpOpen(false); setLegalView('terms'); }}>Terms of Use</button>.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {legalView && (
                            <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                                <div className="bg-gray-900 w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
                                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                                        <h2 className="text-xl font-bold text-white">
                                            {legalView === 'privacy' ? 'Privacy Policy' : 'Terms of Use'}
                                        </h2>
                                        <button onClick={() => setLegalView(null)} className="text-gray-400 hover:text-white">
                                            <X size={22} />
                                        </button>
                                    </div>
                                    <div className="px-6 py-5 space-y-4 text-sm text-gray-300 overflow-auto max-h-[calc(90vh-72px)]">
                                        <p className="text-gray-400">Effective date: February 4, 2026</p>
                                        {legalView === 'privacy' ? (
                                            <>
                                                <p>
                                                    This Privacy Policy explains how Stock Stickies collects, uses, and shares information when you use the app.
                                                </p>
                                                <div>
                                                    <h3 className="text-white font-semibold mb-2">Information We Collect</h3>
                                                    <ul className="list-disc list-inside space-y-1 text-gray-300">
                                                        <li>Account information such as email address and authentication identifiers.</li>
                                                        <li>Content you create, including notes, categories, and settings.</li>
                                                        <li>Usage and device information for security and performance.</li>
                                                    </ul>
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-semibold mb-2">How We Use Information</h3>
                                                    <ul className="list-disc list-inside space-y-1 text-gray-300">
                                                        <li>Provide and maintain the service, including syncing your data.</li>
                                                        <li>Improve reliability, security, and user experience.</li>
                                                        <li>Communicate important updates or security notices.</li>
                                                    </ul>
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-semibold mb-2">Sharing</h3>
                                                    <p>
                                                        We share information only with service providers needed to operate the app (such as authentication
                                                        and database services) or as required by law.
                                                    </p>
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-semibold mb-2">Data Retention</h3>
                                                    <p>
                                                        We retain your data for as long as your account is active. You can request deletion by contacting us.
                                                    </p>
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-semibold mb-2">Your Choices</h3>
                                                    <p>
                                                        You can update or delete your data by managing your account and notes. You may also disable
                                                        sync by signing out.
                                                    </p>
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-semibold mb-2">Contact</h3>
                                                    <p>For privacy questions, contact support at <a href="mailto:contact@easternshore.ai" className="text-cyan-300 hover:text-cyan-200">contact@easternshore.ai</a>.</p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <p>
                                                    These Terms of Use govern your use of Stock Stickies. By using the app, you agree to these terms.
                                                </p>
                                                <div>
                                                    <h3 className="text-white font-semibold mb-2">Use of the Service</h3>
                                                    <ul className="list-disc list-inside space-y-1 text-gray-300">
                                                        <li>You must provide accurate account information and keep it updated.</li>
                                                        <li>You are responsible for the content you store in the app.</li>
                                                        <li>You may not use the service to violate laws or infringe rights.</li>
                                                    </ul>
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-semibold mb-2">Data and Security</h3>
                                                    <p>
                                                        We take reasonable measures to protect your data, but no system is 100% secure.
                                                    </p>
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-semibold mb-2">Third-Party Services</h3>
                                                    <p>
                                                        The app relies on third-party services (such as authentication and market data APIs). Their
                                                        terms and privacy policies may also apply.
                                                    </p>
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-semibold mb-2">Termination</h3>
                                                    <p>
                                                        We may suspend or terminate access if these terms are violated. You may stop using the app at any time.
                                                    </p>
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-semibold mb-2">Changes</h3>
                                                    <p>
                                                        We may update these terms from time to time. Continued use indicates acceptance of the updated terms.
                                                    </p>
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-semibold mb-2">Contact</h3>
                                                    <p>For questions about these terms, contact support at <a href="mailto:redonx99@gmail.com" className="text-cyan-300 hover:text-cyan-200">redonx99@gmail.com</a>.</p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-700">
                            <div className="flex items-center justify-center gap-4 mb-6">
                                <svg width="64" height="64" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="2" y="2" width="44" height="44" rx="4" fill="#1a1a2e" stroke="#00ff9f" strokeWidth="2"/>
                                    <path d="M8 32 L16 20 L22 26 L32 12 L40 18" stroke="#39ff14" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                    <circle cx="16" cy="20" r="3" fill="#39ff14"/>
                                    <circle cx="32" cy="12" r="3" fill="#39ff14"/>
                                    <rect x="6" y="36" width="8" height="6" fill="#39ff14" opacity="0.7"/>
                                    <rect x="16" y="33" width="8" height="9" fill="#39ff14" opacity="0.8"/>
                                    <rect x="26" y="30" width="8" height="12" fill="#39ff14" opacity="0.9"/>
                                    <rect x="36" y="34" width="6" height="8" fill="#39ff14" opacity="0.6"/>
                                </svg>
                                <div className="flex flex-col">
                                    <span className="text-4xl font-black tracking-tight" style={{fontFamily: 'monospace', color: '#00ff41'}}>
                                        STOCK
                                    </span>
                                    <span className="text-2xl font-bold tracking-widest -mt-1" style={{fontFamily: 'monospace', color: '#ff2bd6'}}>
                                        STICKIES
                                    </span>
                                </div>
                            </div>
                            <p className="text-center text-sm text-gray-400 mb-6">
                                Capture stock ideas, track your portfolio value, and keep your investing notes organized.
                            </p>
                            {!auth && <div className="bg-yellow-900 border border-yellow-600 text-yellow-200 px-4 py-3 rounded mb-4 text-sm"><strong>Setup Required:</strong> Add Firebase credentials</div>}
                            <form onSubmit={handleLogin} className="space-y-4">
                                <div><label className="block text-sm font-medium text-gray-300 mb-2">Email</label><input type="email" autocomplete="username" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none placeholder-gray-400" placeholder="Enter email"/></div>
                                {!isResettingPassword && <div><label className="block text-sm font-medium text-gray-300 mb-2">Password</label><input type="password" autocomplete="current-password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none placeholder-gray-400" placeholder="Enter password"/></div>}
                                {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
                                {resetSuccess && <p className="text-green-400 text-sm">Password reset email sent!</p>}
                                <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-lg font-medium">{isResettingPassword ? 'Send Reset Email' : (isSignup ? 'Sign Up with Email' : 'Login')}</button>
                                {!isResettingPassword && (
                                    <>
                                        <div className="flex items-center gap-3 text-gray-500 text-xs uppercase tracking-wide">
                                            <div className="h-px bg-gray-600 flex-1"></div>
                                            <span>or</span>
                                            <div className="h-px bg-gray-600 flex-1"></div>
                                        </div>
                                        <button type="button" onClick={handleGoogleLogin} className="w-full bg-white text-gray-800 py-2 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-gray-100">
                                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">G</span>
                                            Continue with Google
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setLoginHelpOpen(true)}
                                            className="w-full text-center text-xs text-gray-400 hover:text-gray-200 underline underline-offset-4"
                                        >
                                            New here? How to create an account
                                        </button>
                                    </>
                                )}
                            </form>
                            <div className="mt-4 text-center space-y-2">
                                <button onClick={() => { setIsSignup(!isSignup); setIsResettingPassword(false); setLoginError(''); }} className="text-cyan-400 hover:text-cyan-300 text-sm block w-full">{isSignup ? 'Login' : 'Sign Up with Email'}</button>
                                {!isSignup && !isResettingPassword && <button onClick={() => setIsResettingPassword(true)} className="text-gray-400 hover:text-gray-300 text-sm">Forgot password?</button>}
                                {isResettingPassword && <button onClick={() => setIsResettingPassword(false)} className="text-gray-400 hover:text-gray-300 text-sm">Back to login</button>}
                            </div>
                            <div className="mt-6 text-center text-xs text-gray-400 space-y-2">
                                <div>
                                    Website created and maintained by <a href="https://www.easternshore.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200">Eastern Shore AI, LLC</a>
                                </div>
                                <div className="space-x-2">
                                    <button type="button" onClick={() => setLegalView('privacy')} className="hover:text-gray-200">Privacy Policy</button>
                                    <span>·</span>
                                    <button type="button" onClick={() => setLegalView('terms')} className="hover:text-gray-200">Terms of Use</button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }

            return (
                <>
                {quickStartOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                        <div className="bg-gray-900 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                                <h2 className="text-xl font-bold text-white">Stock Stickies Quick Start Guide</h2>
                                <button onClick={() => setQuickStartOpen(false)} className="text-gray-400 hover:text-white">
                                    <X size={22} />
                                </button>
                            </div>
                            <div className="px-6 py-5 space-y-6 text-sm text-gray-200 overflow-auto max-h-[calc(90vh-72px)]">
                                <p className="text-gray-400">
                                    A beginner-friendly walkthrough of the basics. You can customize categories, colors, and your workflow anytime.
                                </p>

                                <div className="space-y-2">
                                    <h3 className="text-white font-semibold text-base">1) Create your first note</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                                        <div className="space-y-2">
                                            <ol className="list-decimal list-inside space-y-1 text-gray-300">
                                                <li>Click <span className="text-white font-semibold">New Note</span>.</li>
                                                <li>Type a ticker (e.g., <span className="text-white font-semibold">AMZN</span>) and your thesis/plan.</li>
                                                <li>Your notes sync automatically when you're signed in.</li>
                                            </ol>
                                        </div>
                                        <div className="rounded-xl border border-gray-700 bg-gray-950/40 p-3 -mt-1">
                                            <svg viewBox="0 0 520 220" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">
                                                <rect x="10" y="12" width="500" height="196" rx="14" fill="#0b1220" stroke="#334155" />
                                                <rect x="28" y="32" width="120" height="34" rx="10" fill="#3b82f6" />
                                                <text x="88" y="55" text-anchor="middle" font-size="14" font-weight="700" fill="#ffffff">New Note</text>
                                                <rect x="28" y="82" width="220" height="106" rx="12" fill="#fde68a" stroke="#f59e0b" />
                                                <text x="44" y="110" font-size="14" font-weight="800" fill="#111827">AMZN</text>
                                                <text x="44" y="132" font-size="12" fill="#111827">Earnings run-up idea…</text>
                                                <path d="M160 46 L270 100" stroke="#22c55e" stroke-width="4" marker-end="url(#arrow)" />
                                                <defs>
                                                    <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
                                                        <path d="M0,0 L12,6 L0,12 z" fill="#22c55e" />
                                                    </marker>
                                                </defs>
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-white font-semibold text-base">2) Add shares for portfolio tracking</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                                        <div className="space-y-2">
                                            <ol className="list-decimal list-inside space-y-1 text-gray-300">
                                                <li>Find the <span className="text-white font-semibold">Shares owned</span> input on a note.</li>
                                                <li>Click the input box and enter the number of shares you own.</li>
                                                <li>Switch to the <span className="text-white font-semibold">Portfolio</span> tab to see the pie chart.</li>
                                            </ol>
                                        </div>
                                        <div className="rounded-xl border border-gray-700 bg-gray-950/40 p-3 -mt-1">
                                            <svg viewBox="0 0 520 220" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">
                                                <rect x="10" y="12" width="500" height="196" rx="14" fill="#0b1220" stroke="#334155" />
                                                <rect x="28" y="34" width="220" height="24" rx="8" fill="#111827" stroke="#334155" />
                                                <text x="40" y="51" font-size="12" fill="#e5e7eb">Shares</text>
                                                <rect x="28" y="64" width="220" height="36" rx="10" fill="#0f172a" stroke="#38bdf8" />
                                                <text x="44" y="88" font-size="16" font-weight="800" fill="#ffffff">10</text>
                                                <rect x="300" y="40" width="150" height="150" rx="14" fill="#0f172a" stroke="#334155" />
                                                <circle cx="375" cy="115" r="56" fill="#1f2937" />
                                                <path d="M375 115 L375 59 A56 56 0 0 1 424 143 Z" fill="#3b82f6" />
                                                <path d="M375 115 L424 143 A56 56 0 0 1 326 143 Z" fill="#22c55e" />
                                                <path d="M375 115 L326 143 A56 56 0 0 1 375 59 Z" fill="#f59e0b" />
                                                <text x="375" y="200" text-anchor="middle" font-size="12" fill="#94a3b8">Portfolio</text>
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-white font-semibold text-base">3) Sort notes by position size (optional)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                                        <div className="space-y-2">
                                            <ol className="list-decimal list-inside space-y-1 text-gray-300">
                                                <li>In the Notes tab, use the <span className="text-white font-semibold">Sort</span> toggle.</li>
                                                <li>Select <span className="text-white font-semibold">Largest position</span> to order notes by market value (shares × price).</li>
                                                <li>Tip: Add your <span className="text-white font-semibold">Finnhub API key</span> to enable market value sorting.</li>
                                            </ol>
                                        </div>
                                        <div className="rounded-xl border border-gray-700 bg-gray-950/40 p-3 -mt-1">
                                            <svg viewBox="0 0 520 220" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">
                                                <rect x="10" y="12" width="500" height="196" rx="14" fill="#0b1220" stroke="#334155" />

                                                <rect x="28" y="44" width="250" height="132" rx="14" fill="#0f172a" stroke="#334155" />
                                                <text x="46" y="74" font-size="14" font-weight="800" fill="#e5e7eb">Functionality Panel</text>

                                                <rect x="46" y="92" width="110" height="34" rx="10" fill="#3b82f6" />
                                                <text x="101" y="114" text-anchor="middle" font-size="13" font-weight="800" fill="#ffffff">New Note</text>

                                                <text x="172" y="114" font-size="12" font-weight="700" fill="#94a3b8">Sort</text>
                                                <rect x="200" y="92" width="190" height="34" rx="10" fill="#111827" stroke="#334155" />

                                                <rect x="206" y="98" width="72" height="22" rx="8" fill="#0b1220" stroke="#475569" />
                                                <text x="242" y="113" text-anchor="middle" font-size="11" font-weight="800" fill="#94a3b8">Default</text>

                                                <rect x="282" y="98" width="102" height="22" rx="8" fill="#0b1220" stroke="#22c55e" />
                                                <text x="333" y="113" text-anchor="middle" font-size="11" font-weight="800" fill="#e5e7eb">Largest position</text>

                                                <path d="M400 110 L478 110" stroke="#22c55e" stroke-width="4" marker-end="url(#arrowSort)" />
                                                <defs>
                                                    <marker id="arrowSort" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
                                                        <path d="M0,0 L12,6 L0,12 z" fill="#22c55e" />
                                                    </marker>
                                                </defs>

                                                <rect x="300" y="64" width="190" height="112" rx="14" fill="#0f172a" stroke="#334155" />
                                                <text x="314" y="88" font-size="12" font-weight="800" fill="#e5e7eb">Notes</text>
                                                <rect x="314" y="98" width="162" height="14" rx="7" fill="#bbf7d0" opacity="0.7" />
                                                <rect x="314" y="118" width="128" height="14" rx="7" fill="#fde68a" opacity="0.7" />
                                                <rect x="314" y="138" width="92" height="14" rx="7" fill="#93c5fd" opacity="0.7" />
                                                <text x="314" y="168" font-size="11" fill="#94a3b8">Largest positions rise to the top</text>
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-white font-semibold text-base">4) Show/Hide Legend and Toolbar panels</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                                        <div className="space-y-2">
                                            <ol className="list-decimal list-inside space-y-1 text-gray-300">
                                                <li>In the Notes tab header, use <span className="text-white font-semibold">Show Legend</span>/<span className="text-white font-semibold">Hide Legend</span>.</li>
                                                <li>Use <span className="text-white font-semibold">Show Toolbar</span>/<span className="text-white font-semibold">Hide Toolbar</span> to collapse the Functionality panel.</li>
                                                <li>Use <span className="text-white font-semibold">Hide Shares</span> in the Notes header to mask share counts on note cards.</li>
                                                <li>Your visibility choices are saved and will persist the next time you open the app.</li>
                                            </ol>
                                        </div>
                                        <div className="rounded-xl border border-gray-700 bg-gray-950/40 p-3 -mt-1">
                                            <p className="text-xs text-gray-300 leading-relaxed">
                                                Tip: Hide both panels for a cleaner note-reading view, then turn them back on anytime from the same header buttons.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-white font-semibold text-base">5) Group by Category vs Size + reorder categories</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                                        <div className="space-y-2">
                                            <ol className="list-decimal list-inside space-y-1 text-gray-300">
                                                <li>In the Notes tab, use the <span className="text-white font-semibold">Group By</span> toggle.</li>
                                                <li><span className="text-white font-semibold">Category</span> shows notes grouped into sections (your categories).</li>
                                                <li><span className="text-white font-semibold">Size</span> shows all notes in one list sorted by your largest positions.</li>
                                                <li>In the <span className="text-white font-semibold">Legend</span>, drag the <span className="text-white font-semibold">grip icon</span> to reorder categories.</li>
                                            </ol>
                                        </div>
                                        <div className="rounded-xl border border-gray-700 bg-gray-950/40 p-3 -mt-1">
                                            <svg viewBox="0 0 520 220" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">
                                                <rect x="10" y="12" width="500" height="196" rx="14" fill="#0b1220" stroke="#334155" />

                                                <rect x="28" y="40" width="250" height="72" rx="14" fill="#0f172a" stroke="#334155" />
                                                <text x="46" y="66" font-size="14" font-weight="800" fill="#e5e7eb">Functionality Panel</text>

                                                <text x="46" y="92" font-size="12" font-weight="700" fill="#94a3b8">Group By</text>
                                                <rect x="106" y="74" width="172" height="34" rx="10" fill="#111827" stroke="#334155" />
                                                <rect x="112" y="80" width="74" height="22" rx="8" fill="#0b1220" stroke="#22c55e" />
                                                <text x="149" y="95" text-anchor="middle" font-size="11" font-weight="800" fill="#e5e7eb">Category</text>
                                                <rect x="190" y="80" width="74" height="22" rx="8" fill="#0b1220" stroke="#475569" />
                                                <text x="227" y="95" text-anchor="middle" font-size="11" font-weight="800" fill="#94a3b8">Size</text>

                                                <rect x="300" y="40" width="190" height="150" rx="14" fill="#0f172a" stroke="#334155" />
                                                <text x="314" y="66" font-size="12" font-weight="800" fill="#e5e7eb">Legend</text>

                                                <rect x="314" y="78" width="162" height="26" rx="10" fill="#111827" stroke="#334155" />
                                                <circle cx="328" cy="91" r="1.6" fill="#94a3b8" />
                                                <circle cx="336" cy="91" r="1.6" fill="#94a3b8" />
                                                <circle cx="328" cy="97" r="1.6" fill="#94a3b8" />
                                                <circle cx="336" cy="97" r="1.6" fill="#94a3b8" />
                                                <rect x="344" y="85" width="14" height="14" rx="4" fill="#93c5fd" />
                                                <rect x="364" y="87" width="90" height="10" rx="5" fill="#e5e7eb" opacity="0.9" />

                                                <rect x="314" y="112" width="162" height="26" rx="10" fill="#111827" stroke="#334155" />
                                                <circle cx="328" cy="125" r="1.6" fill="#94a3b8" />
                                                <circle cx="336" cy="125" r="1.6" fill="#94a3b8" />
                                                <circle cx="328" cy="131" r="1.6" fill="#94a3b8" />
                                                <circle cx="336" cy="131" r="1.6" fill="#94a3b8" />
                                                <rect x="344" y="119" width="14" height="14" rx="4" fill="#bbf7d0" />
                                                <rect x="364" y="121" width="78" height="10" rx="5" fill="#e5e7eb" opacity="0.9" />

                                                <path d="M288 120 L304 120" stroke="#22c55e" stroke-width="4" marker-end="url(#arrowGroup)" />
                                                <defs>
                                                    <marker id="arrowGroup" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
                                                        <path d="M0,0 L12,6 L0,12 z" fill="#22c55e" />
                                                    </marker>
                                                </defs>

                                                <text x="314" y="182" font-size="11" fill="#94a3b8">Drag the grip to reorder categories</text>
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-white font-semibold text-base">6) Customize categories</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                                        <div className="space-y-2">
                                            <ol className="list-decimal list-inside space-y-1 text-gray-300">
                                                <li>Use the category controls to rename or recolor categories.</li>
                                                <li>Add or delete categories as your strategy evolves (Core, Swing, Value, etc.).</li>
                                                <li>Notes stay organized by category.</li>
                                            </ol>
                                        </div>
                                        <div className="rounded-xl border border-gray-700 bg-gray-950/40 p-3 -mt-1">
                                            <svg viewBox="0 0 520 220" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">
                                                <rect x="10" y="12" width="500" height="196" rx="14" fill="#0b1220" stroke="#334155" />
                                                <rect x="28" y="34" width="160" height="32" rx="12" fill="#93c5fd" stroke="#3b82f6" />
                                                <text x="108" y="55" text-anchor="middle" font-size="13" font-weight="800" fill="#111827">Core Holding</text>
                                                <rect x="200" y="34" width="32" height="32" rx="10" fill="#111827" stroke="#334155" />
                                                <text x="216" y="55" text-anchor="middle" font-size="16" fill="#e5e7eb">✎</text>
                                                <rect x="240" y="34" width="32" height="32" rx="10" fill="#111827" stroke="#334155" />
                                                <circle cx="256" cy="50" r="8" fill="#f59e0b" />
                                                <rect x="28" y="86" width="220" height="34" rx="12" fill="#fde68a" stroke="#f59e0b" />
                                                <text x="44" y="108" font-size="12" font-weight="800" fill="#111827">BABA</text>
                                                <rect x="28" y="128" width="220" height="34" rx="12" fill="#bbf7d0" stroke="#22c55e" />
                                                <text x="44" y="150" font-size="12" font-weight="800" fill="#111827">SGOV</text>
                                                <text x="310" y="108" font-size="12" fill="#94a3b8">Drag notes into categories</text>
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-white font-semibold text-base">Optional: API keys (quotes + news)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                                        <div className="space-y-2">
                                            <p className="text-gray-300">You can use the app without keys, but keys unlock live quotes and news. Finnhub and MarketAux both have generous free tiers, so you can usually get everything working without spending money.</p>
                                            <ul className="list-disc list-inside space-y-1 text-gray-300">
                                                <li>Finnhub → quotes, fundamentals, earnings dates</li>
                                                <li>MarketAux → news feed</li>
                                                <li>Click the <span className="text-white font-semibold">?</span> next to each input for instructions</li>
                                            </ul>
                                        </div>
                                        <div className="rounded-xl border border-gray-700 bg-gray-950/40 p-3 -mt-1">
                                            <svg viewBox="0 0 520 220" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">
                                                <rect x="10" y="12" width="500" height="196" rx="14" fill="#0b1220" stroke="#334155" />
                                                <rect x="28" y="50" width="210" height="42" rx="12" fill="#0f172a" stroke="#38bdf8" />
                                                <text x="40" y="76" font-size="12" fill="#e5e7eb">Finnhub API Key</text>
                                                <circle cx="260" cy="71" r="14" fill="#111827" stroke="#334155" />
                                                <text x="260" y="77" text-anchor="middle" font-size="14" font-weight="800" fill="#e5e7eb">?</text>
                                                <rect x="28" y="114" width="210" height="42" rx="12" fill="#0f172a" stroke="#38bdf8" />
                                                <text x="40" y="140" font-size="12" fill="#e5e7eb">MarketAux API Key</text>
                                                <circle cx="260" cy="135" r="14" fill="#111827" stroke="#334155" />
                                                <text x="260" y="141" text-anchor="middle" font-size="14" font-weight="800" fill="#e5e7eb">?</text>
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                )}

                {legalView && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                        <div className="bg-gray-900 w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                                <h2 className="text-xl font-bold text-white">
                                    {legalView === 'privacy' ? 'Privacy Policy' : 'Terms of Use'}
                                </h2>
                                <button onClick={() => setLegalView(null)} className="text-gray-400 hover:text-white">
                                    <X size={22} />
                                </button>
                            </div>
                            <div className="px-6 py-5 space-y-4 text-sm text-gray-300 overflow-auto max-h-[calc(90vh-72px)]">
                                <p className="text-gray-400">Effective date: February 4, 2026</p>
                                {legalView === 'privacy' ? (
                                    <>
                                        <p>
                                            This Privacy Policy explains how Stock Stickies collects, uses, and shares information when you use the app.
                                        </p>
                                        <div>
                                            <h3 className="text-white font-semibold mb-2">Information We Collect</h3>
                                            <ul className="list-disc list-inside space-y-1 text-gray-300">
                                                <li>Account information such as email address and authentication identifiers.</li>
                                                <li>Content you create, including notes, categories, and settings.</li>
                                                <li>Usage and device information for security and performance.</li>
                                            </ul>
                                        </div>
                                        <div>
                                            <h3 className="text-white font-semibold mb-2">How We Use Information</h3>
                                            <ul className="list-disc list-inside space-y-1 text-gray-300">
                                                <li>Provide and maintain the service, including syncing your data.</li>
                                                <li>Improve reliability, security, and user experience.</li>
                                                <li>Communicate important updates or security notices.</li>
                                            </ul>
                                        </div>
                                        <div>
                                            <h3 className="text-white font-semibold mb-2">Sharing</h3>
                                            <p>
                                                We share information only with service providers needed to operate the app (such as authentication
                                                and database services) or as required by law.
                                            </p>
                                        </div>
                                        <div>
                                            <h3 className="text-white font-semibold mb-2">Data Retention</h3>
                                            <p>
                                                We retain your data for as long as your account is active. You can request deletion by contacting us.
                                            </p>
                                        </div>
                                        <div>
                                            <h3 className="text-white font-semibold mb-2">Your Choices</h3>
                                            <p>
                                                You can update or delete your data by managing your account and notes. You may also disable
                                                sync by signing out.
                                            </p>
                                        </div>
                                        <div>
                                            <h3 className="text-white font-semibold mb-2">Contact</h3>
                                            <p>For privacy questions, contact support at <a href="mailto:contact@easternshore.ai" className="text-cyan-300 hover:text-cyan-200">contact@easternshore.ai</a>.</p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <p>
                                            These Terms of Use govern your use of Stock Stickies. By using the app, you agree to these terms.
                                        </p>
                                        <div>
                                            <h3 className="text-white font-semibold mb-2">Use of the Service</h3>
                                            <ul className="list-disc list-inside space-y-1 text-gray-300">
                                                <li>You must provide accurate account information and keep it updated.</li>
                                                <li>You are responsible for the content you store in the app.</li>
                                                <li>You may not use the service to violate laws or infringe rights.</li>
                                            </ul>
                                        </div>
                                        <div>
                                            <h3 className="text-white font-semibold mb-2">Data and Security</h3>
                                            <p>
                                                We take reasonable measures to protect your data, but no system is 100% secure.
                                            </p>
                                        </div>
                                        <div>
                                            <h3 className="text-white font-semibold mb-2">Third-Party Services</h3>
                                            <p>
                                                The app relies on third-party services (such as authentication and market data APIs). Their
                                                availability and behavior may change without notice.
                                            </p>
                                        </div>
                                        <div>
                                            <h3 className="text-white font-semibold mb-2">Termination</h3>
                                            <p>
                                                We may suspend or terminate access if you misuse the service or violate these terms.
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {expandedNote && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                        <div className={`w-full h-full max-w-[95vw] max-h-[95vh] rounded-lg shadow-2xl overflow-hidden flex flex-col ${darkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white'}`}>
                            <div className={`flex justify-between items-center p-4 border-b ${darkMode ? 'border-gray-700' : ''}`}>
                                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{expandedNote.title || 'Untitled Note'}</h2>
                                <button onClick={() => setExpandedNote(null)} className={`${darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-800'}`}>
                                    <X size={24}/>
                                </button>
                            </div>
                            <div className="flex flex-1 overflow-hidden">
                                <div className={`w-1/2 p-6 ${expandedNote.color} overflow-auto`}>
                                    <input
                                        type="text"
                                        value={expandedNote.title || ''}
                                        onChange={(e) => updateNoteTitle(expandedNote.id, e.target.value)}
                                        placeholder="TICKER"
                                        onBlur={() => warnIfDuplicateTicker(expandedNote.id)}
                                        className={`w-full bg-transparent border-none outline-none font-bold text-3xl mb-2 uppercase ${darkMode ? 'text-gray-900 placeholder-gray-700' : 'text-gray-800 placeholder-gray-500'}`}
                                        style={{letterSpacing: '0.05em'}}
                                        maxLength={MAX_TITLE_LENGTH}
                                    />
                                    {duplicateNoteIds.has(expandedNote.id) && (
                                        <div className="mb-3 rounded border border-red-500 bg-red-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-red-800">
                                            Duplicate — {getAccountLabel(getNoteAccount(expandedNote))} already has another {normalizeTicker(expandedNote.title)} note
                                        </div>
                                    )}
                                    {/* Shares + account share one lock, same as the note card. */}
                                    <div className="flex items-start gap-3 mb-4">
                                        <div className="flex-1">
                                            {unlockedNotes[expandedNote.id] ? (
                                                <>
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <input
                                                            type={sharesPrivacyMode === 'hide' ? 'text' : 'number'}
                                                            value={sharesPrivacyMode === 'hide' ? '••••' : (expandedNote.shares || '')}
                                                            onChange={(e) => {
                                                                if (sharesPrivacyMode === 'hide') return;
                                                                const newShares = parseFloat(e.target.value) || 0;
                                                                setNotes(notes.map(n => n.id === expandedNote.id ? {...n, shares: newShares} : n));
                                                                setExpandedNote({...expandedNote, shares: newShares});
                                                            }}
                                                            readOnly={sharesPrivacyMode === 'hide'}
                                                            placeholder="# shares"
                                                            className={`w-32 bg-white bg-opacity-50 border border-gray-400 rounded px-3 py-2 text-lg text-gray-700 placeholder-gray-400 ${sharesPrivacyMode === 'hide' ? 'tracking-[0.25em] text-center cursor-not-allowed' : ''}`}
                                                        />
                                                        <span className="text-gray-600">
                                                            {sharesPrivacyMode === 'hide' ? 'shares hidden' : 'shares owned (for portfolio)'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <select
                                                            value={ACCOUNT_IDS.includes(expandedNote.account) ? expandedNote.account : ''}
                                                            onChange={(e) => {
                                                                const nextAccount = e.target.value;
                                                                if (updateNoteAccount(expandedNote.id, nextAccount)) {
                                                                    setExpandedNote({...expandedNote, account: nextAccount});
                                                                }
                                                            }}
                                                            className="w-48 bg-white bg-opacity-50 border border-gray-400 rounded px-3 py-2 text-lg text-gray-700"
                                                        >
                                                            <option value="" disabled>Select account</option>
                                                            {ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                                                        </select>
                                                        <span className="text-gray-600">account</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    {sharesPrivacyMode === 'hide' ? (
                                                        <div className="text-4xl font-bold text-gray-700 tracking-[0.25em] leading-none">••••</div>
                                                    ) : (Number(expandedNote.shares) || 0) > 0 ? (
                                                        <div className="flex items-baseline gap-2 leading-none">
                                                            <span className="text-4xl font-bold text-gray-800 tabular-nums tracking-tight">
                                                                {(Number(expandedNote.shares) || 0).toLocaleString()}
                                                            </span>
                                                            <span className="text-sm font-medium uppercase tracking-wider text-gray-700">
                                                                {(Number(expandedNote.shares) || 0) === 1 ? 'share' : 'shares'}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-lg italic text-gray-700 leading-none py-1">No position</div>
                                                    )}
                                                    {ACCOUNT_IDS.includes(expandedNote.account) && (
                                                        <div className="mt-2">
                                                            <span className="inline-block bg-white bg-opacity-60 border border-gray-400 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-gray-800">
                                                                {getAccountLabel(expandedNote.account)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => toggleNoteLock(expandedNote.id)}
                                            className={`shrink-0 p-2 rounded ${unlockedNotes[expandedNote.id] ? 'text-gray-800 bg-white bg-opacity-60' : 'text-gray-700 hover:text-gray-900'}`}
                                            title={unlockedNotes[expandedNote.id] ? 'Lock shares and account' : 'Unlock to edit shares and account'}
                                            aria-label={unlockedNotes[expandedNote.id] ? 'Lock shares and account' : 'Unlock to edit shares and account'}
                                            aria-pressed={!!unlockedNotes[expandedNote.id]}
                                        >
                                            {unlockedNotes[expandedNote.id] ? <Unlock size={20}/> : <Lock size={20}/>}
                                        </button>
                                    </div>
                                    {(Number(expandedNote.shares) || 0) > 0 && (
                                        <div className={`mb-4 rounded-lg border border-black/10 bg-white/50 px-4 py-3 text-gray-800 ${hidePortfolioValues ? 'blur-sm select-none' : ''}`}>
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="text-xs font-bold uppercase tracking-wider text-gray-600">Unrealized P&amp;L</span>
                                                {positionDetailsById[expandedNote.id]?.unrealizedPnL != null ? (
                                                    <strong className={`text-lg tabular-nums ${positionDetailsById[expandedNote.id].unrealizedPnL >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                                        {formatSignedUsd(positionDetailsById[expandedNote.id].unrealizedPnL)}
                                                        {positionDetailsById[expandedNote.id].unrealizedPnLPercent != null && ` · ${formatSignedPercent(positionDetailsById[expandedNote.id].unrealizedPnLPercent)}`}
                                                    </strong>
                                                ) : (
                                                    <strong className="text-gray-600">Unavailable</strong>
                                                )}
                                            </div>
                                            {positionDetailsById[expandedNote.id]?.costBasis != null && (
                                                <div className="mt-1 flex items-center justify-between text-xs text-gray-600">
                                                    <span>Cost basis</span>
                                                    <span className="tabular-nums">{formatUsd(positionDetailsById[expandedNote.id].costBasis)}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <textarea
                                        value={expandedNote.text}
                                        onChange={(e) => {
                                            const newText = sanitizeContent(e.target.value);
                                            if (!validateContent(newText)) {
                                                showBrandedNotice(`Note content cannot exceed ${MAX_CONTENT_LENGTH} characters.`);
                                                return;
                                            }
                                            setNotes(notes.map(n => n.id === expandedNote.id ? {...n, text: newText} : n));
                                            setExpandedNote({...expandedNote, text: newText});
                                        }}
                                        placeholder="Notes..."
                                        className="w-full h-full bg-transparent border-none outline-none resize-none text-gray-800 placeholder-gray-700 text-lg"
                                        maxLength={MAX_CONTENT_LENGTH}
                                    />
                                </div>
                                <div className={`w-1/2 overflow-auto p-6 ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
                                    {stockLoading ? (
                                        <div className="flex items-center justify-center h-full">
                                            <p className={`${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>Loading stock data...</p>
                                        </div>
                                    ) : stockError ? (
                                        <div className="flex items-center justify-center h-full">
                                            <p className="text-red-500">{stockError}</p>
                                        </div>
                                    ) : stockData ? (
                                        <div className="space-y-6">
                                            <div className={`${darkMode ? 'bg-gray-900 border border-gray-700 [&_p.text-gray-500]:text-gray-400 [&_p.text-gray-900]:text-gray-100 [&_span.text-gray-400]:text-gray-500' : 'bg-white'} rounded-lg p-6 shadow`}>
                                                <h3 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>{stockData.symbol}</h3>
                                                <div className="flex items-baseline gap-3">
                                                    <span className={`text-5xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                                        {stockData.currency === 'USD' ? '$' : ''}{stockData.currentPrice?.toFixed(2)}
                                                    </span>
                                                    <span className={`text-2xl font-semibold ${stockData.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {stockData.change >= 0 ? '+' : ''}{stockData.change?.toFixed(2)} ({stockData.changePercent?.toFixed(2)}%)
                                                    </span>
                                                </div>
                                            </div>

                                            <div className={`${darkMode ? 'bg-gray-900 border border-gray-700 [&_p.text-gray-500]:text-gray-400 [&_p.text-gray-900]:text-gray-100 [&_span.text-gray-400]:text-gray-500' : 'bg-white'} rounded-lg p-6 shadow`}>
                                                <h4 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-700'}`}>Market Data</h4>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-sm text-gray-500">Previous Close</p>
                                                        <p className="text-xl font-semibold text-gray-900">
                                                            {stockData.currency === 'USD' ? '$' : ''}{stockData.previousClose?.toFixed(2)}
                                                        </p>
                                                    </div>
                                                    {stockData.marketCap && (
                                                        <div>
                                                            <p className="text-sm text-gray-500">Market Cap</p>
                                                            <p className="text-xl font-semibold text-gray-900">
                                                                {stockData.currency === 'USD' ? '$' : ''}{(stockData.marketCap / 1e9).toFixed(2)}B
                                                            </p>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="text-sm text-gray-500">Day High</p>
                                                        <p className="text-xl font-semibold text-gray-900">
                                                            {stockData.currency === 'USD' ? '$' : ''}{stockData.dayHigh?.toFixed(2)}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-gray-500">Day Low</p>
                                                        <p className="text-xl font-semibold text-gray-900">
                                                            {stockData.currency === 'USD' ? '$' : ''}{stockData.dayLow?.toFixed(2)}
                                                        </p>
                                                    </div>
                                                    {stockData.week52High && (
                                                        <div>
                                                            <p className="text-sm text-gray-500">52W High</p>
                                                            <p className="text-xl font-semibold text-gray-900">
                                                                {stockData.currency === 'USD' ? '$' : ''}{stockData.week52High?.toFixed(2)}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {stockData.week52Low && (
                                                        <div>
                                                            <p className="text-sm text-gray-500">52W Low</p>
                                                            <p className="text-xl font-semibold text-gray-900">
                                                                {stockData.currency === 'USD' ? '$' : ''}{stockData.week52Low?.toFixed(2)}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {stockData.volume && (
                                                        <div>
                                                            <p className="text-sm text-gray-500">Volume</p>
                                                            <p className="text-xl font-semibold text-gray-900">
                                                                {stockData.volume?.toLocaleString()}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {stockData.nextEarningsDate && (
                                                        <div className="col-span-2">
                                                            <p className="text-sm text-gray-500">Next Earnings Date</p>
                                                            <p className="text-xl font-semibold text-gray-900">
                                                                {new Date(stockData.nextEarningsDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className={`${darkMode ? 'bg-gray-900 border border-gray-700 [&_p.text-gray-500]:text-gray-400 [&_p.text-gray-900]:text-gray-100 [&_span.text-gray-400]:text-gray-500' : 'bg-white'} rounded-lg p-6 shadow`}>
                                                <h4 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-700'}`}>Fundamentals</h4>
                                                <div className="grid grid-cols-2 gap-4">
                                                    {stockData.peTTM && (
                                                        <div>
                                                            <p className="text-sm text-gray-500">P/E (TTM)</p>
                                                            <p className="text-xl font-semibold text-gray-900">
                                                                {stockData.peTTM.toFixed(2)}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {stockData.peForward && (
                                                        <div>
                                                            <p className="text-sm text-gray-500">P/E (Forward)</p>
                                                            <p className="text-xl font-semibold text-gray-900">
                                                                {stockData.peForward.toFixed(2)}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {stockData.pbRatio && (
                                                        <div>
                                                            <p className="text-sm text-gray-500">P/B Ratio</p>
                                                            <p className="text-xl font-semibold text-gray-900">
                                                                {stockData.pbRatio.toFixed(2)}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {stockData.dividendYield && (
                                                        <div>
                                                            <p className="text-sm text-gray-500">Dividend Yield</p>
                                                            <p className="text-xl font-semibold text-gray-900">
                                                                {(stockData.dividendYield * 100).toFixed(2)}%
                                                            </p>
                                                        </div>
                                                    )}
                                                    {stockData.dividendRate && (
                                                        <div>
                                                            <p className="text-sm text-gray-500">Annual Dividend</p>
                                                            <p className="text-xl font-semibold text-gray-900">
                                                                {stockData.currency === 'USD' ? '$' : ''}{stockData.dividendRate.toFixed(2)}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {!stockData.peTTM && !stockData.peForward && !stockData.pbRatio && !stockData.dividendYield && !stockData.dividendRate && (
                                                        <div className="col-span-2 text-center text-gray-500">
                                                            <p className="text-sm">Fundamental data not available</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Today's News Section */}
                                            <div className={`${darkMode ? 'bg-gray-900 border border-gray-700 [&_span.text-gray-400]:text-gray-500 [&_span.text-gray-300]:text-gray-600' : 'bg-white'} rounded-lg p-6 shadow`}>
                                                <h4 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-700'}`}>Today's News</h4>
                                                {newsLoading ? (
                                                    <div className="flex items-center justify-center py-4">
                                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                                                        <span className={`ml-2 ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>Loading news...</span>
                                                    </div>
                                                ) : !marketauxApiKey ? (
                                                    <p className={`text-sm text-center py-4 ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                                        Add your MarketAux API key to see today's news with sentiment analysis.
                                                        <br/>
                                                        <a href="https://www.marketaux.com/register" target="_blank" rel="noopener noreferrer" className={`${darkMode ? 'text-blue-400' : 'text-blue-500'} hover:underline`}>
                                                            Get a free API key
                                                        </a>
                                                    </p>
                                                ) : newsData && newsData.length > 0 ? (
                                                    <div className="space-y-3 max-h-64 overflow-y-auto">
                                                        {newsData.map((article, index) => (
                                                            <div key={index} className={`border-b pb-3 last:border-0 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                                                                <div className="flex items-start gap-2">
                                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                                                        article.sentiment === 'bullish' ? 'bg-green-100 text-green-700' :
                                                                        article.sentiment === 'bearish' ? 'bg-red-100 text-red-700' :
                                                                        'bg-gray-100 text-gray-600'
                                                                    }`}>
                                                                        {article.sentiment === 'bullish' ? '↑ Bullish' :
                                                                         article.sentiment === 'bearish' ? '↓ Bearish' : '• Neutral'}
                                                                    </span>
                                                                    <a href={article.url} target="_blank" rel="noopener noreferrer"
                                                                       className={`text-sm font-medium line-clamp-2 ${darkMode ? 'text-gray-100 hover:text-blue-400' : 'text-gray-800 hover:text-blue-600'}`}>
                                                                        {article.title}
                                                                    </a>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-1 ml-0">
                                                                    <span className="text-xs text-gray-400">{article.source}</span>
                                                                    <span className="text-xs text-gray-300">•</span>
                                                                    <span className="text-xs text-gray-400">
                                                                        {new Date(article.publishedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className={`text-sm text-center py-4 ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                                        No news available for today
                                                    </p>
                                                )}
                                            </div>

                                        </div>
                                    ) : (
                                        <div className={`flex items-center justify-center h-full ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                            <p>Enter a ticker symbol to view stock data</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}


                {showCashSecuredPutModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className={`w-full max-w-md rounded-xl shadow-2xl ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} p-6`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold">{editingPutId ? 'Edit Cash Secured Put' : 'Add Cash Secured Put'}</h3>
                                <button onClick={() => { setShowCashSecuredPutModal(false); setEditingPutId(null); setNewPutTicker(''); setNewPutStrike(''); setNewPutQty(''); setNewPutExpiry(''); setNewPutAccount('roth'); }} className={`p-2 rounded ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}><X size={18} /></button>
                            </div>
                            <div className="space-y-3">
                                <input type="text" value={newPutTicker} onChange={(e) => setNewPutTicker(sanitizeTicker(e.target.value))} placeholder="Ticker" className={`w-full px-3 py-2 rounded border-2 ${darkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-800 border-gray-300'} focus:ring-2 focus:ring-blue-500 outline-none uppercase`} maxLength={12} />
                                <input type="text" value={newPutStrike} onChange={(e) => setNewPutStrike(e.target.value)} placeholder="Strike price" className={`w-full px-3 py-2 rounded border-2 ${darkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-800 border-gray-300'} focus:ring-2 focus:ring-blue-500 outline-none`} />
                                <input type="text" value={newPutQty} onChange={(e) => setNewPutQty(e.target.value)} placeholder="Qty" className={`w-full px-3 py-2 rounded border-2 ${darkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-800 border-gray-300'} focus:ring-2 focus:ring-blue-500 outline-none`} />
                                <input type="date" value={newPutExpiry} onChange={(e) => setNewPutExpiry(e.target.value)} className={`w-full px-3 py-2 rounded border-2 ${darkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-800 border-gray-300'} focus:ring-2 focus:ring-blue-500 outline-none`} />
                                <select value={newPutAccount} onChange={(e) => setNewPutAccount(e.target.value)} className={`w-full px-3 py-2 rounded border-2 ${darkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-800 border-gray-300'} focus:ring-2 focus:ring-blue-500 outline-none`} title="Account this put is written in">
                                    {ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 mt-5">
                                <button onClick={() => { setShowCashSecuredPutModal(false); setEditingPutId(null); setNewPutTicker(''); setNewPutStrike(''); setNewPutQty(''); setNewPutExpiry(''); setNewPutAccount('roth'); }} className={`px-4 py-2 rounded ${darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}>Cancel</button>
                                <button onClick={addCashSecuredPut} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow">{editingPutId ? 'Save' : 'Add'}</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Watch List Modal */}
                {watchListModalTicker && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white w-full h-full max-w-[95vw] max-h-[95vh] rounded-lg shadow-2xl overflow-hidden flex flex-col">
                            <div className="flex justify-between items-center p-4 border-b">
                                <h2 className="text-2xl font-bold text-gray-800">{watchListModalTicker}</h2>
                                <button onClick={() => setWatchListModalTicker(null)} className="text-gray-600 hover:text-gray-800">
                                    <X size={24}/>
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto p-6 bg-gray-50">
                                {stockLoading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <p className="text-gray-500">Loading stock data...</p>
                                    </div>
                                ) : stockError ? (
                                    <div className="flex items-center justify-center h-full">
                                        <p className="text-red-500">{stockError}</p>
                                    </div>
                                ) : stockData ? (
                                    <div className="space-y-6">
                                        {/* Price Overview */}
                                        <div className="bg-white rounded-lg p-6 shadow">
                                            <div className="flex items-baseline gap-4 mb-4">
                                                <span className="text-4xl font-bold text-gray-900">
                                                    ${stockData.currentPrice.toFixed(2)}
                                                </span>
                                                <span className={`text-xl font-semibold ${stockData.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {stockData.change >= 0 ? '+' : ''}{stockData.change.toFixed(2)} ({stockData.changePercent.toFixed(2)}%)
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                <div><span className="text-gray-500">Previous Close:</span> <span className="font-semibold">${stockData.previousClose.toFixed(2)}</span></div>
                                                <div><span className="text-gray-500">Day High:</span> <span className="font-semibold">${stockData.dayHigh?.toFixed(2) || 'N/A'}</span></div>
                                                <div><span className="text-gray-500">Day Low:</span> <span className="font-semibold">${stockData.dayLow?.toFixed(2) || 'N/A'}</span></div>
                                                {stockData.marketCap && <div><span className="text-gray-500">Market Cap:</span> <span className="font-semibold">${(stockData.marketCap / 1e9).toFixed(2)}B</span></div>}
                                            </div>
                                        </div>

                                        {/* 52 Week Range & Earnings */}
                                        <div className="bg-white rounded-lg p-6 shadow">
                                            <h4 className="text-lg font-semibold text-gray-700 mb-4">52 Week Range & Earnings</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                {stockData.week52High && (
                                                    <div>
                                                        <p className="text-sm text-gray-500">52W High</p>
                                                        <p className="text-xl font-semibold text-gray-900">${stockData.week52High.toFixed(2)}</p>
                                                    </div>
                                                )}
                                                {stockData.week52Low && (
                                                    <div>
                                                        <p className="text-sm text-gray-500">52W Low</p>
                                                        <p className="text-xl font-semibold text-gray-900">${stockData.week52Low.toFixed(2)}</p>
                                                    </div>
                                                )}
                                                {stockData.nextEarningsDate && (
                                                    <div className="col-span-2 md:col-span-1">
                                                        <p className="text-sm text-gray-500">Next Earnings Date</p>
                                                        <p className="text-xl font-semibold text-gray-900">
                                                            {new Date(stockData.nextEarningsDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Fundamentals */}
                                        <div className="bg-white rounded-lg p-6 shadow">
                                            <h4 className="text-lg font-semibold text-gray-700 mb-4">Fundamentals</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                {stockData.peTTM && (
                                                    <div>
                                                        <p className="text-sm text-gray-500">P/E (TTM)</p>
                                                        <p className="text-xl font-semibold text-gray-900">{stockData.peTTM.toFixed(2)}</p>
                                                    </div>
                                                )}
                                                {stockData.peForward && (
                                                    <div>
                                                        <p className="text-sm text-gray-500">P/E (Forward)</p>
                                                        <p className="text-xl font-semibold text-gray-900">{stockData.peForward.toFixed(2)}</p>
                                                    </div>
                                                )}
                                                {stockData.pbRatio && (
                                                    <div>
                                                        <p className="text-sm text-gray-500">P/B Ratio</p>
                                                        <p className="text-xl font-semibold text-gray-900">{stockData.pbRatio.toFixed(2)}</p>
                                                    </div>
                                                )}
                                                {stockData.dividendYield && (
                                                    <div>
                                                        <p className="text-sm text-gray-500">Dividend Yield</p>
                                                        <p className="text-xl font-semibold text-gray-900">{(stockData.dividendYield * 100).toFixed(2)}%</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Today's News */}
                                        <div className="bg-white rounded-lg p-6 shadow">
                                            <h4 className="text-lg font-semibold text-gray-700 mb-4">Today's News</h4>
                                            {newsLoading ? (
                                                <div className="flex items-center justify-center py-4">
                                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                                                    <span className="ml-2 text-gray-500">Loading news...</span>
                                                </div>
                                            ) : newsData && newsData.length > 0 ? (
                                                <div className="space-y-3 max-h-64 overflow-y-auto">
                                                    {newsData.map((article, index) => (
                                                        <div key={index} className="border-b border-gray-100 pb-3 last:border-0">
                                                            <div className="flex items-start gap-2">
                                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                                                    article.sentiment === 'bullish' ? 'bg-green-100 text-green-700' :
                                                                    article.sentiment === 'bearish' ? 'bg-red-100 text-red-700' :
                                                                    'bg-gray-100 text-gray-600'
                                                                }`}>
                                                                    {article.sentiment === 'bullish' ? '↑ Bullish' :
                                                                     article.sentiment === 'bearish' ? '↓ Bearish' : '• Neutral'}
                                                                </span>
                                                                <a href={article.url} target="_blank" rel="noopener noreferrer"
                                                                   className="text-sm font-medium text-gray-800 hover:text-blue-600 line-clamp-2">
                                                                    {article.title}
                                                                </a>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-xs text-gray-400">{article.source}</span>
                                                                <span className="text-xs text-gray-300">•</span>
                                                                <span className="text-xs text-gray-400">
                                                                    {new Date(article.publishedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-500 text-center py-4">No news available</p>
                                            )}
                                        </div>

                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-500">
                                        <p>No stock data available</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {backupModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                        <div className={`w-full max-w-2xl rounded-xl shadow-2xl border ${darkMode ? 'bg-gray-900 border-cyan-500/40' : 'bg-white border-cyan-200'}`}>
                            <div className={`flex justify-between items-center p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                                <h2 className={`text-xl font-black tracking-wide ${darkMode ? 'text-cyan-300' : 'text-cyan-700'}`}>Backups & Restore</h2>
                                <button onClick={() => setBackupModalOpen(false)} className={`${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'}`}><X size={24}/></button>
                            </div>
                            <div className="p-6">
                                <p className={`text-sm leading-relaxed mb-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>These are your most recent automatic StickyNotes backups. Restoring one will overwrite your current live data with that saved snapshot.</p>
                                <div className={`max-h-96 overflow-y-auto rounded-lg border ${darkMode ? 'border-gray-700 bg-gray-950' : 'border-gray-200 bg-gray-50'}`}>
                                    {backupsLoading ? (
                                        <div className={`p-4 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Loading backups…</div>
                                    ) : backupSnapshots.length === 0 ? (
                                        <div className={`p-4 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>No backups found yet.</div>
                                    ) : (
                                        backupSnapshots.map((backup) => {
                                            const when = backup.backupCreatedAtMs ? new Date(backup.backupCreatedAtMs).toLocaleString() : 'Unknown time';
                                            const notesCount = Array.isArray(backup.notes) ? backup.notes.length : 0;
                                            return (
                                                <div key={backup.id} className={`p-4 border-b last:border-b-0 ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div>
                                                            <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{when}</div>
                                                            <div className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Reason: {backup.backupReason || 'autosave'} • Notes: {notesCount}</div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            disabled={restoringBackupId === backup.id}
                                                            onClick={() => restoreBackupSnapshot(backup.id)}
                                                            className={`px-3 py-2 rounded-lg text-sm font-semibold text-white ${restoringBackupId === backup.id ? 'bg-gray-500 cursor-wait' : 'bg-gradient-to-r from-fuchsia-600 to-cyan-500 hover:from-fuchsia-500 hover:to-cyan-400'}`}
                                                        >
                                                            {restoringBackupId === backup.id ? 'Restoring…' : 'Restore'}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Branded Notice Modal */}
                {noticeModal.open && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                        <div className={`w-full max-w-md rounded-xl shadow-2xl border ${darkMode ? 'bg-gray-900 border-cyan-500/40' : 'bg-white border-cyan-200'}`}>
                            <div className={`flex justify-between items-center p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                                <h2 className={`text-xl font-black tracking-wide ${noticeModal.type === 'danger' ? 'text-red-400' : darkMode ? 'text-cyan-300' : 'text-cyan-700'}`}>{noticeModal.title}</h2>
                                <button onClick={() => setNoticeModal({ open: false, title: '', message: '', type: 'info', onConfirm: null })} className={`${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'}`}>
                                    <X size={24}/>
                                </button>
                            </div>
                            <div className="p-6">
                                <p className={`text-sm leading-relaxed mb-6 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{noticeModal.message}</p>
                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => setNoticeModal({ open: false, title: '', message: '', type: 'info', onConfirm: null })}
                                        className={`px-4 py-2 rounded-lg font-semibold ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                    >
                                        Cancel
                                    </button>
                                    {noticeModal.type === 'danger' && noticeModal.onConfirm && (
                                        <button
                                            onClick={() => {
                                                noticeModal.onConfirm();
                                                setNoticeModal({ open: false, title: '', message: '', type: 'info', onConfirm: null });
                                            }}
                                            className="px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400"
                                        >
                                            Delete Forever
                                        </button>
                                    )}
                                    {noticeModal.type !== 'danger' && (
                                        <button
                                            onClick={() => setNoticeModal({ open: false, title: '', message: '', type: 'info', onConfirm: null })}
                                            className="px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-fuchsia-600 to-cyan-500 hover:from-fuchsia-500 hover:to-cyan-400"
                                        >
                                            Got it
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Note Confirmation Modal */}
                {noteToDelete && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                        <div className={`w-full max-w-md rounded-xl shadow-2xl border ${darkMode ? 'bg-gray-900 border-fuchsia-500/40' : 'bg-white border-fuchsia-200'}`}>
                            <div className={`flex justify-between items-center p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                                <h2 className={`text-xl font-black tracking-wide ${darkMode ? 'text-fuchsia-300' : 'text-fuchsia-700'}`}>
                                    Confirm Delete
                                </h2>
                                <button onClick={() => setNoteToDelete(null)} className={`${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'}`}>
                                    <X size={24}/>
                                </button>
                            </div>
                            <div className="p-6">
                                <div className={`mb-5 p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-cyan-500/30' : 'bg-cyan-50 border-cyan-200'}`}>
                                    <p className={`text-sm leading-relaxed ${darkMode ? 'text-cyan-100' : 'text-cyan-900'}`}>
                                        This note will be permanently deleted from your stickies and portfolio view.
                                    </p>
                                </div>
                                <p className={`text-sm mb-6 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                    Are you sure you want to continue?
                                </p>
                                <div className="flex gap-3 justify-end">
                                    <button
                                        onClick={() => setNoteToDelete(null)}
                                        className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                    >
                                        Keep Note
                                    </button>
                                    <button
                                        onClick={confirmDeleteNote}
                                        className="px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-fuchsia-600 to-cyan-500 hover:from-fuchsia-500 hover:to-cyan-400"
                                    >
                                        Delete Note
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {putToDelete && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                        <div className={`w-full max-w-md rounded-xl shadow-2xl border ${darkMode ? 'bg-gray-900 border-fuchsia-500/40' : 'bg-white border-fuchsia-200'}`}>
                            <div className={`flex justify-between items-center p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                                <h2 className={`text-xl font-black tracking-wide ${darkMode ? 'text-fuchsia-300' : 'text-fuchsia-700'}`}>
                                    Confirm Delete
                                </h2>
                                <button onClick={() => setPutToDelete(null)} className={`${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'}`}>
                                    <X size={24}/>
                                </button>
                            </div>
                            <div className="p-6">
                                <div className={`mb-5 p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-cyan-500/30' : 'bg-cyan-50 border-cyan-200'}`}>
                                    <p className={`text-sm leading-relaxed ${darkMode ? 'text-cyan-100' : 'text-cyan-900'}`}>
                                        This cash secured put will be permanently removed.
                                    </p>
                                </div>
                                <p className={`text-sm mb-6 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                    Are you sure you want to continue?
                                </p>
                                <div className="flex gap-3 justify-end">
                                    <button
                                        onClick={() => setPutToDelete(null)}
                                        className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => { removeCashSecuredPut(putToDelete); setPutToDelete(null); }}
                                        className="px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-fuchsia-600 to-cyan-500 hover:from-fuchsia-500 hover:to-cyan-400"
                                    >
                                        Delete Put
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Add Category Modal */}
                {showAddCategoryModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                        <div className={`w-full max-w-md rounded-lg shadow-2xl ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                            <div className={`flex justify-between items-center p-4 border-b ${darkMode ? 'border-gray-700' : ''}`}>
                                <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Add New Category</h2>
                                <button onClick={() => { setShowAddCategoryModal(false); setNewCategoryLabel(''); setNewCategoryColor(null); }} className={`${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'}`}>
                                    <X size={24}/>
                                </button>
                            </div>
                            <div className="p-6">
                                <div className="mb-4">
                                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Category Name</label>
                                    <input
                                        type="text"
                                        value={newCategoryLabel}
                                        onChange={(e) => setNewCategoryLabel(e.target.value)}
                                        placeholder="Enter category name..."
                                        className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-800'}`}
                                        maxLength={30}
                                        autoFocus
                                    />
                                </div>
                                <div className="mb-6">
                                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Select Color</label>
                                    <div className="grid grid-cols-6 gap-2">
                                        {getAvailableColors().map(color => (
                                            <button
                                                key={color}
                                                onClick={() => setNewCategoryColor(color)}
                                                className={`w-8 h-8 ${color} rounded-lg border-2 ${newCategoryColor === color ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-300'} hover:scale-110 transition-transform`}
                                            />
                                        ))}
                                    </div>
                                    {getAvailableColors().length === 0 && (
                                        <p className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No colors available. Delete a category to free up colors.</p>
                                    )}
                                </div>
                                <div className="flex gap-3 justify-end">
                                    <button
                                        onClick={() => { setShowAddCategoryModal(false); setNewCategoryLabel(''); setNewCategoryColor(null); }}
                                        className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => newCategoryColor && addCategory(newCategoryColor, newCategoryLabel || 'New Category')}
                                        disabled={!newCategoryColor}
                                        className={`px-4 py-2 rounded-lg font-medium ${newCategoryColor ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                                    >
                                        Add Category
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Reassign Notes Modal (when deleting category with notes) */}
                {categoryToDelete && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                        <div className={`w-full max-w-md rounded-lg shadow-2xl ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                            <div className={`flex justify-between items-center p-4 border-b ${darkMode ? 'border-gray-700' : ''}`}>
                                <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Reassign Notes</h2>
                                <button onClick={() => { setCategoryToDelete(null); setReassignTarget(null); }} className={`${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'}`}>
                                    <X size={24}/>
                                </button>
                            </div>
                            <div className="p-6">
                                <div className={`mb-4 p-3 rounded-lg ${darkMode ? 'bg-yellow-900/30 border border-yellow-700' : 'bg-yellow-50 border border-yellow-200'}`}>
                                    <p className={`text-sm ${darkMode ? 'text-yellow-200' : 'text-yellow-800'}`}>
                                        The category "<strong>{colorLabels[categoryToDelete]}</strong>" contains <strong>{getNotesCountForCategory(categoryToDelete)}</strong> note(s).
                                        Please select a category to move them to before deletion.
                                    </p>
                                </div>
                                <div className="mb-6">
                                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Move notes to:</label>
                                    <select
                                        value={reassignTarget || ''}
                                        onChange={(e) => setReassignTarget(e.target.value)}
                                        className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                                    >
                                        {categories.filter(c => c !== categoryToDelete).map(c => (
                                            <option key={c} value={c}>{colorLabels[c]}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex gap-3 justify-end">
                                    <button
                                        onClick={() => { setCategoryToDelete(null); setReassignTarget(null); }}
                                        className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmDeleteCategory}
                                        disabled={!reassignTarget}
                                        className={`px-4 py-2 rounded-lg font-medium ${reassignTarget ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                                    >
                                        Move & Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className={`min-h-screen p-4 sm:p-6 lg:p-8 ${darkMode ? 'bg-gradient-to-br from-gray-900 to-gray-800' : 'bg-gradient-to-br from-gray-100 to-gray-200'}`}>
                    <div className="flex flex-col xl:flex-row gap-6 max-w-full mx-auto items-stretch xl:items-start">
                        <div className={`w-full min-w-0 xl:w-[77%]`}>
                        <div className="flex items-center justify-between gap-6 mb-4">
                            <div className="shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${darkMode ? '' : 'bg-gray-900/90 shadow-md'}`}>
                                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <rect x="2" y="2" width="44" height="44" rx="4" fill={darkMode ? '#1a1a2e' : '#0f0f23'} stroke={darkMode ? '#00ff9f' : '#ff006e'} strokeWidth="2"/>
                                            <path d="M8 32 L16 20 L22 26 L32 12 L40 18" stroke="#39ff14" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                            <circle cx="16" cy="20" r="3" fill="#39ff14"/>
                                            <circle cx="32" cy="12" r="3" fill="#39ff14"/>
                                            <rect x="6" y="36" width="8" height="6" fill="#39ff14" opacity="0.7"/>
                                            <rect x="16" y="33" width="8" height="9" fill="#39ff14" opacity="0.8"/>
                                            <rect x="26" y="30" width="8" height="12" fill="#39ff14" opacity="0.9"/>
                                            <rect x="36" y="34" width="6" height="8" fill="#39ff14" opacity="0.6"/>
                                        </svg>
                                        <div className="flex flex-col">
                                            <span className="text-3xl font-black tracking-tight" style={{fontFamily: 'monospace', color: '#00ff41'}}>
                                                STOCK
                                            </span>
                                            <span className="text-xl font-bold tracking-widest -mt-1" style={{fontFamily: 'monospace', color: '#ff2bd6'}}>
                                                STICKIES
                                            </span>
                                        </div>
                                    </div>
                                    {syncStatus === 'syncing' && <span className="text-sm text-blue-500 flex items-center gap-1"><Cloud size={16}/> Syncing...</span>}
                                    {syncStatus === 'synced' && <span className="text-sm text-green-500 flex items-center gap-1"><Cloud size={16}/> Synced</span>}
                                    {syncStatus === 'offline' && <span className="text-sm text-red-500 flex items-center gap-1"><CloudOff size={16}/> Offline</span>}
                                </div>
                                <p className={`text-sm mt-1 flex items-center gap-0 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                    <span className="inline-flex items-center gap-2">
                                        <input
                                            ref={profilePhotoInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleProfilePhotoSelected}
                                            className="hidden"
                                        />
                                        {profilePhoto ? (
                                            <div className="relative" ref={profilePhotoMenuRef}>
                                                <button
                                                    type="button"
                                                    onClick={() => setProfilePhotoMenuOpen(v => !v)}
                                                    title="Profile photo"
                                                    className="shrink-0"
                                                >
                                                    <img src={profilePhoto} alt="Profile" className="w-7 h-7 rounded-full object-cover border border-gray-500" />
                                                </button>

                                                {profilePhotoMenuOpen && (
                                                    <div className={`absolute left-0 mt-2 z-20 w-40 rounded-lg border shadow-xl p-2 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setProfilePhotoMenuOpen(false); handlePickProfilePhoto(); }}
                                                            className={`w-full text-left px-2 py-1 rounded text-xs font-semibold ${darkMode ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'}`}
                                                        >
                                                            Change photo
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setProfilePhotoMenuOpen(false); clearProfilePhoto(); }}
                                                            className={`w-full text-left px-2 py-1 rounded text-xs font-semibold ${darkMode ? 'text-red-300 hover:bg-gray-800' : 'text-red-600 hover:bg-gray-100'}`}
                                                        >
                                                            Remove
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={openBackupManager}
                                                            className={`w-full text-left px-2 py-1 rounded text-xs font-semibold ${darkMode ? 'text-cyan-300 hover:bg-gray-800' : 'text-cyan-700 hover:bg-gray-100'}`}
                                                        >
                                                            Backups & Restore
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={handlePickProfilePhoto}
                                                className={`text-xs font-semibold px-2 py-1 rounded border ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-400 text-gray-600 hover:bg-gray-100'}`}
                                                title="Add a profile photo"
                                            >
                                                Add profile photo
                                            </button>
                                        )}
                                    </span>
                                    <span className="ml-2">Welcome,&nbsp;</span>
                                    {editingNickname || !nickname ? (
                                        <input
                                            type="text"
                                            value={nickname}
                                            onChange={(e) => {
                                                const newNickname = e.target.value;
                                                if (newNickname.length > MAX_NICKNAME_LENGTH) {
                                                    showBrandedNotice(`Nickname cannot exceed ${MAX_NICKNAME_LENGTH} characters.`);
                                                    return;
                                                }
                                                setNickname(newNickname);
                                            }}
                                            onBlur={() => {
                                                const trimmed = nickname.trim();
                                                if (trimmed && !validateNickname(trimmed)) {
                                                    showBrandedNotice('Invalid nickname. Only letters, numbers, spaces, and basic punctuation are allowed.');
                                                    setNickname('');
                                                } else {
                                                    setNickname(trimmed);
                                                    if (trimmed) setEditingNickname(false);
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    const trimmed = nickname.trim();
                                                    if (trimmed && validateNickname(trimmed)) {
                                                        setNickname(trimmed);
                                                        setEditingNickname(false);
                                                    } else if (trimmed) {
                                                        showBrandedNotice('Invalid nickname. Only letters, numbers, spaces, and basic punctuation are allowed.');
                                                    }
                                                }
                                            }}
                                            placeholder="Enter nickname..."
                                            autoFocus={editingNickname}
                                            className={`px-2 py-1 text-sm rounded border ${darkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-800 border-gray-300'} focus:ring-1 focus:ring-blue-500 outline-none`}
                                            style={{width: '140px'}}
                                            maxLength={MAX_NICKNAME_LENGTH}
                                        />
                                    ) : (
                                        <button
                                            onClick={() => setEditingNickname(true)}
                                            className={`font-semibold hover:underline cursor-pointer ${darkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-blue-600 hover:text-blue-500'}`}
                                            title="Click to edit nickname"
                                        >
                                            {nickname}
                                        </button>
                                    )}
                                    <span>!</span>
                                    {!nickname && (
                                        <button onClick={() => setHideEmail(!hideEmail)} className="ml-1 opacity-60 hover:opacity-100">
                                            {hideEmail ? <Eye size={14}/> : <EyeOff size={14}/>} 
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setQuickStartOpen(true)}
                                        className={`ml-3 px-3 py-1 rounded-md text-xs font-extrabold tracking-wide border border-transparent bg-gradient-to-r from-fuchsia-500 via-purple-500 to-emerald-400 text-gray-900 shadow-lg hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/60 ${darkMode ? 'ring-1 ring-white/10 shadow-fuchsia-500/25' : 'ring-1 ring-black/5 shadow-fuchsia-500/15'}`}
                                        title="Open Quick Start Guide"
                                    >
                                        Quick Start Guide
                                    </button>
                                    {mainTab === 'notes' && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setHideLegendPanel(!hideLegendPanel)}
                                                className={`ml-2 px-2.5 py-1 rounded text-xs font-semibold ${darkMode ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-100'} border ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}
                                            >
                                                {hideLegendPanel ? 'Show Legend' : 'Hide Legend'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setHideToolbarPanel(!hideToolbarPanel)}
                                                className={`ml-2 px-2.5 py-1 rounded text-xs font-semibold ${darkMode ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-100'} border ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}
                                            >
                                                {hideToolbarPanel ? 'Show Toolbar' : 'Hide Toolbar'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSharesPrivacyMode(sharesPrivacyMode === 'hide' ? 'show' : 'hide')}
                                                className={`ml-2 px-2.5 py-1 rounded text-xs font-semibold border ${sharesPrivacyMode === 'hide' ? (darkMode ? 'bg-red-700 text-white border-red-500' : 'bg-red-600 text-white border-red-600') : (darkMode ? 'bg-gray-800 text-gray-200 hover:bg-gray-700 border-gray-700' : 'bg-white text-gray-700 hover:bg-gray-100 border-gray-300')}`}
                                                title="Hide share values on notes"
                                            >
                                                {sharesPrivacyMode === 'hide' ? 'Show Shares' : 'Hide Shares'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleRefreshPortfolioPrices}
                                                disabled={portfolioLoading}
                                                className={`ml-2 px-2.5 py-1 rounded text-xs font-semibold ${darkMode ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-100'} border ${darkMode ? 'border-gray-700' : 'border-gray-300'} ${portfolioLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                title="Refresh portfolio prices"
                                            >
                                                {portfolioLoading ? 'Refreshing...' : 'Refresh Prices'}
                                            </button>
                                        </>
                                    )}
                                </p>
                            </div>
                            <div className="flex min-w-0 flex-1 gap-3 items-center justify-end">
                                {!finnhubApiKey && (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={finnhubApiKey}
                                            onChange={(e) => {
                                                const newKey = e.target.value.trim();
                                                if (newKey.length > MAX_API_KEY_LENGTH) {
                                                    showBrandedNotice(`API key cannot exceed ${MAX_API_KEY_LENGTH} characters.`);
                                                    return;
                                                }
                                                setFinnhubApiKey(newKey);
                                                if (newKey && validateApiKey(newKey, 'finnhub')) {
                                                    setShowApiKeySuccess(true);
                                                    setTimeout(() => setShowApiKeySuccess(false), 3000);
                                                } else if (newKey && newKey.length >= 20) {
                                                    // Show success even if format validation is lenient
                                                    setShowApiKeySuccess(true);
                                                    setTimeout(() => setShowApiKeySuccess(false), 3000);
                                                }
                                            }}
                                            onBlur={(e) => {
                                                const key = e.target.value.trim();
                                                if (key && !validateApiKey(key, 'finnhub')) {
                                                    showBrandedNotice('Invalid Finnhub API key format. Please check your key.');
                                                }
                                            }}
                                            placeholder="Finnhub API Key"
                                            className={`px-3 py-2 rounded-lg border-2 ${darkMode ? 'bg-gray-800 text-white border-gray-600' : 'bg-white text-gray-800 border-gray-300'} focus:ring-2 focus:ring-blue-500 outline-none`}
                                            style={{width: '160px'}}
                                            maxLength={MAX_API_KEY_LENGTH}
                                        />
                                        <div className="relative" ref={finnhubHelpRef}>
                                            <button
                                                type="button"
                                                onClick={() => setOpenHelp(openHelp === 'finnhub' ? null : 'finnhub')}
                                                aria-expanded={openHelp === 'finnhub'}
                                                aria-controls="finnhub-help"
                                                className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${
                                                    darkMode ? 'border-gray-500 text-gray-300 hover:bg-gray-800' : 'border-gray-600 text-gray-700 hover:bg-gray-100'
                                                }`}
                                                title="How to get a Finnhub API key"
                                            >
                                                ?
                                            </button>
                                            {openHelp === 'finnhub' && (
                                                <div id="finnhub-help" className="absolute left-1/2 -translate-x-1/2 mt-3 w-72 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-xs p-3 shadow-xl z-20">
                                                    <p className="font-semibold text-white mb-2">How to get a Finnhub API key</p>
                                                    <ol className="list-decimal list-inside space-y-1">
                                                        <li>Create a free account at finnhub.io.</li>
                                                        <li>Verify your email and sign in.</li>
                                                        <li>Open your dashboard and copy the API key.</li>
                                                        <li>Paste it here.</li>
                                                    </ol>
                                                    <a href="https://finnhub.io/register" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-cyan-400 hover:text-cyan-300">Open Finnhub</a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {showApiKeySuccess && (
                                    <div className="bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                                        <Check size={20}/>
                                        <span>API Key added successfully!</span>
                                    </div>
                                )}
                                {!marketauxApiKey && (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={marketauxApiKey}
                                            onChange={(e) => {
                                                const newKey = e.target.value.trim();
                                                if (newKey.length > MAX_API_KEY_LENGTH) {
                                                    showBrandedNotice(`API key cannot exceed ${MAX_API_KEY_LENGTH} characters.`);
                                                    return;
                                                }
                                                setMarketauxApiKey(newKey);
                                            }}
                                            onBlur={(e) => {
                                                const key = e.target.value.trim();
                                                if (key && !validateApiKey(key, 'marketaux')) {
                                                    showBrandedNotice('Invalid MarketAux API key format. Please check your key.');
                                                }
                                            }}
                                            placeholder="MarketAux API Key"
                                            className={`px-3 py-2 rounded-lg border-2 ${darkMode ? 'bg-gray-800 text-white border-gray-600' : 'bg-white text-gray-800 border-gray-300'} focus:ring-2 focus:ring-blue-500 outline-none`}
                                            style={{width: '160px'}}
                                            maxLength={MAX_API_KEY_LENGTH}
                                        />
                                        <div className="relative" ref={marketauxHelpRef}>
                                            <button
                                                type="button"
                                                onClick={() => setOpenHelp(openHelp === 'marketaux' ? null : 'marketaux')}
                                                aria-expanded={openHelp === 'marketaux'}
                                                aria-controls="marketaux-help"
                                                className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${
                                                    darkMode ? 'border-gray-500 text-gray-300 hover:bg-gray-800' : 'border-gray-600 text-gray-700 hover:bg-gray-100'
                                                }`}
                                                title="How to get a MarketAux API key"
                                            >
                                                ?
                                            </button>
                                            {openHelp === 'marketaux' && (
                                                <div id="marketaux-help" className="absolute left-1/2 -translate-x-1/2 mt-3 w-72 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-xs p-3 shadow-xl z-20">
                                                    <p className="font-semibold text-white mb-2">How to get a MarketAux API key</p>
                                                    <ol className="list-decimal list-inside space-y-1">
                                                        <li>Create a free account at marketaux.com.</li>
                                                        <li>Verify your email and sign in.</li>
                                                        <li>Go to your API settings and copy the API token.</li>
                                                        <li>Paste it here.</li>
                                                    </ol>
                                                    <a href="https://www.marketaux.com/register" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-cyan-400 hover:text-cyan-300">Open MarketAux</a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {isOwnerPortfolioUser && (
                                    <TodayAgenda
                                        key={auth?.currentUser?.uid || 'signed-out'}
                                        authUser={auth?.currentUser || null}
                                    />
                                )}
                                <div className="fixed top-5 right-5 z-40 flex items-center gap-3">
                                    {isOwnerPortfolioUser && (
                                        <RobinhoodSync
                                            authUser={auth?.currentUser || null}
                                            notes={notes}
                                            ready={userDataReady}
                                            darkMode={darkMode}
                                            onApply={applyRobinhoodReconciliation}
                                            onPerformanceChange={setRobinhoodPerformance}
                                        />
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setDarkMode(!darkMode)}
                                        className="flex items-center justify-center bg-gray-700 hover:bg-gray-800 text-white p-3 rounded-lg shadow-lg"
                                        title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                                        aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                                    >
                                        {darkMode ? <Sun size={20}/> : <Moon size={20}/>}
                                    </button>
                                    <button onClick={handleLogout} className="flex items-center gap-2 bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg shadow-lg"><LogOut size={20}/>Logout</button>
                                </div>
                            </div>
                        </div>

                        {/* Main Tab Navigation */}
                        <div className={`flex gap-1 mb-6 p-0.5 rounded-lg w-full max-w-xl mx-auto ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>
                            <button
                                onClick={() => setMainTab('notes')}
                                className={`flex-1 py-2 px-6 rounded-lg font-semibold transition-all ${
                                    mainTab === 'notes'
                                        ? (darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-800 shadow')
                                        : (darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')
                                }`}
                            >
                                Notes
                            </button>
                            <button
                                onClick={() => setMainTab('portfolio')}
                                className={`flex-1 py-2 px-6 rounded-lg font-semibold transition-all ${
                                    mainTab === 'portfolio'
                                        ? (darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-800 shadow')
                                        : (darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')
                                }`}
                            >
                                Portfolio {portfolioData.length > 0 && `(${portfolioData.length})`}
                            </button>
                        </div>

                        {mainTab === 'notes' ? (
                        <>
                        {!hideLegendPanel && (
                        <div className={`rounded-lg shadow-md p-3 mb-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                            <div className="flex flex-wrap items-center gap-4">
                                <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-700'}`}>Legend:</span>
                                {categories.map((color, idx) => (
                                    <div
                                        key={color}
                                        className={`flex items-center gap-1.5 group relative transition-all ${draggingCategory === color ? (darkMode ? 'opacity-60' : 'opacity-70') : ''} ${dragOverCategory === color ? (darkMode ? 'ring-2 ring-blue-400 rounded bg-gray-700/40' : 'ring-2 ring-blue-500 rounded bg-blue-50') : ''}`}
                                        onDragOver={(e) => {
                                            if (!draggingCategory) return;
                                            e.preventDefault();
                                            setDragOverCategory(color);
                                        }}
                                        onDragLeave={() => {
                                            if (dragOverCategory === color) setDragOverCategory(null);
                                        }}
                                        onDrop={(e) => {
                                            if (!draggingCategory) return;
                                            e.preventDefault();
                                            reorderCategories(draggingCategory, color);
                                            setDraggingCategory(null);
                                            setDragOverCategory(null);
                                        }}
                                    >
                                        {/* Drag handle (desktop): drag to reorder categories */}
                                        <span
                                            draggable
                                            onDragStart={(e) => {
                                                setDraggingCategory(color);
                                                setDragOverCategory(null);
                                                // Some browsers require dataTransfer to be set for DnD to work
                                                try { e.dataTransfer.setData('text/plain', color); } catch (err) {}
                                                e.dataTransfer.effectAllowed = 'move';
                                            }}
                                            onDragEnd={() => {
                                                setDraggingCategory(null);
                                                setDragOverCategory(null);
                                            }}
                                            className={`cursor-grab active:cursor-grabbing select-none transition-transform ${draggingCategory === color ? 'scale-110' : ''} ${darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`}
                                            title="Drag to reorder"
                                        >
                                            <Grip size={14} />
                                        </span>

                                        {/* Color swatch - clickable to change color */}
                                        <button
                                            onClick={() => setEditingCategoryColor(editingCategoryColor === color ? null : color)}
                                            className={`w-5 h-5 ${color} rounded border-2 ${editingCategoryColor === color ? 'border-blue-500' : 'border-gray-300'} hover:border-blue-400 cursor-pointer transition-all`}
                                            title="Change color"
                                        />
                                        {/* Color picker dropdown */}
                                        {editingCategoryColor === color && (
                                            <div className={`absolute top-8 left-0 z-50 p-2 rounded-lg shadow-xl ${darkMode ? 'bg-gray-700' : 'bg-white'} border`}>
                                                <div className="grid grid-cols-6 gap-1" style={{width: '156px'}}>
                                                    {AVAILABLE_COLORS.filter(c => c === color || !categories.includes(c)).map(c => (
                                                        <button
                                                            key={c}
                                                            onClick={() => changeCategoryColor(color, c)}
                                                            className={`w-5 h-5 ${c} rounded border ${c === color ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-300'} hover:scale-110 transition-transform`}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {/* Label editing */}
                                        {editingLabel === color ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="text"
                                                    value={tempLabel}
                                                    onChange={(e) => setTempLabel(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && (setColorLabels({...colorLabels, [color]: tempLabel}), setEditingLabel(null))}
                                                    className={`border rounded px-1.5 py-0.5 text-xs w-20 ${darkMode ? 'bg-gray-800 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300'}`}
                                                    autoFocus
                                                />
                                                <button onClick={() => (setColorLabels({...colorLabels, [color]: tempLabel}), setEditingLabel(null))} className="text-green-600"><Check size={12}/></button>
                                                {/* Reorder via drag handle */}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1">
                                                <span className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{colorLabels[color]}</span>
                                                <button onClick={() => (setEditingLabel(color), setTempLabel(colorLabels[color] || ''))} className="text-gray-400 hover:text-gray-600"><Edit2 size={11}/></button>
                                                {/* Reorder via drag handle */}
                                            </div>
                                        )}
                                        {/* Delete button - only show if more than 1 category */}
                                        {categories.length > MIN_CATEGORIES && (
                                            <button
                                                onClick={() => handleDeleteCategory(color)}
                                                className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                title={`Delete ${colorLabels[color]} category`}
                                            >
                                                <X size={12}/>
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {/* Add category button - only show if less than max */}
                                {categories.length < MAX_CATEGORIES && (
                                    <button
                                        onClick={() => setShowAddCategoryModal(true)}
                                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        title="Add new category"
                                    >
                                        <Plus size={12}/> Add
                                    </button>
                                )}
                            </div>
                        </div>
                        )}

                        {/* Functionality Panel (below legend, above notes) */}
                        {!hideToolbarPanel && (
                        <div className={`rounded-lg shadow-md p-4 mb-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        onClick={() => {
                                            setNotes([{id: nextId, title: '', text: '', color: UNCLASSIFIED_COLOR, classified: false}, ...notes]);
                                            setNextId(nextId + 1);
                                        }}
                                        className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg shadow-lg font-semibold"
                                    >
                                        <Plus size={18}/> New Note
                                    </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Group By</span>
                                        <div className={`inline-flex rounded-lg p-1 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                                            <button
                                                type="button"
                                                onClick={() => setNotesGroupMode('account')}
                                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${notesGroupMode === 'account' ? (darkMode ? 'bg-gray-900 text-white shadow' : 'bg-white text-gray-900 shadow') : (darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900')}`}
                                                title="Group notes by brokerage account"
                                            >
                                                Portfolio
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNotesGroupMode('category')}
                                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${notesGroupMode === 'category' ? (darkMode ? 'bg-gray-900 text-white shadow' : 'bg-white text-gray-900 shadow') : (darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900')}`}
                                            >
                                                Category
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => finnhubApiKey && setNotesGroupMode('size')}
                                                disabled={!finnhubApiKey}
                                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${notesGroupMode === 'size' ? (darkMode ? 'bg-gray-900 text-white shadow' : 'bg-white text-gray-900 shadow') : (darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900')} ${!finnhubApiKey ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                title={!finnhubApiKey ? 'Add a Finnhub API key to group notes by position size' : 'Show all notes sorted by largest position (market value)'}
                                            >
                                                Size
                                            </button>
                                        </div>
                                    </div>

                                    {/* Only shown while something is actually unlocked — a
                                        no-op button would just be clutter the rest of the time. */}
                                    {unlockedNoteCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={lockAllNotes}
                                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${darkMode ? 'bg-gray-700 text-gray-100 border-gray-600 hover:bg-gray-600' : 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200'}`}
                                            title={`Re-lock shares and account on ${unlockedNoteCount} unlocked note${unlockedNoteCount !== 1 ? 's' : ''}`}
                                        >
                                            <Lock size={14}/> Lock All ({unlockedNoteCount})
                                        </button>
                                    )}
                                </div>
                            </div>
                            {!finnhubApiKey && (
                                <div className={`mt-2 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                    Add a <span className={darkMode ? 'text-cyan-300 font-semibold' : 'text-blue-600 font-semibold'}>Finnhub API key</span> above to enable market value sorting.
                                </div>
                            )}
                        </div>
                        )}

                        {unclassifiedNotes.length > 0 && (
                            <div className="mb-6">
                                <div className={`p-4 rounded-lg mb-3 ${darkMode ? 'bg-yellow-900 border-2 border-yellow-600' : 'bg-yellow-50 border-2 border-yellow-400'}`}>
                                    <h2 className={`font-bold text-lg ${darkMode ? 'text-yellow-200' : 'text-yellow-800'}`}>
                                        ⚠️ {unclassifiedNotes.some(note => note.plaidSecurityId)
                                            ? 'New Robinhood Positions — Choose Categories'
                                            : 'Unclassified Notes — Please Categorize First'}
                                    </h2>
                                    <p className={`text-sm mt-1 ${darkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>
                                        {unclassifiedNotes.some(note => note.plaidSecurityId)
                                            ? 'Imported positions are saved safely, but Stock Stickies needs you to choose where each one belongs.'
                                            : 'Select a category below before adding content to your note.'}
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {unclassifiedNotes.map(note => (
                                        <div key={note.id} className={`${UNCLASSIFIED_COLOR} p-5 rounded-lg shadow-lg relative border-2 border-yellow-500`} style={{minHeight: '200px'}}>
                                            <div className="absolute top-2 right-2">
                                                <button onClick={() => deleteNote(note.id)} className="text-gray-600 hover:text-gray-800"><X size={18}/></button>
                                            </div>
                                            {(note.title || note.plaidSecurityId) && (
                                                <div className="mb-4 pr-7">
                                                    {note.plaidSecurityId && (
                                                        <span className="inline-flex rounded-full border border-emerald-700/30 bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                                                            Imported from Robinhood
                                                        </span>
                                                    )}
                                                    <div className="mt-2 text-2xl font-black uppercase tracking-wide text-gray-900">
                                                        {note.title || 'Unknown ticker'}
                                                    </div>
                                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-700">
                                                        <span>
                                                            {sharesPrivacyMode === 'hide'
                                                                ? 'Shares hidden'
                                                                : `${Number(note.shares || 0).toLocaleString()} ${Number(note.shares) === 1 ? 'share' : 'shares'}`}
                                                        </span>
                                                        <span aria-hidden="true">·</span>
                                                        <span>{getAccountLabel(note.account)}</span>
                                                        {Number.isFinite(Number(note.plaidInstitutionValue)) && (
                                                            <>
                                                                <span aria-hidden="true">·</span>
                                                                <span className={hidePortfolioValues ? 'blur-sm select-none' : ''}>
                                                                    {Number(note.plaidInstitutionValue).toLocaleString(undefined, {
                                                                        style: 'currency',
                                                                        currency: 'USD',
                                                                    })}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            <div className="mb-4">
                                                <p className="text-sm font-bold text-gray-700 mb-2">Select Category:</p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {categories.map(color => (
                                                        <button
                                                            key={color}
                                                            onClick={() => classifyNote(note.id, color)}
                                                            className={`${color} px-3 py-2 rounded text-xs font-semibold hover:scale-105 transition-transform border-2 border-gray-400`}
                                                        >
                                                            {colorLabels[color]}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="text-center text-gray-500 text-sm mt-4">
                                                {note.title
                                                    ? `Choose where ${note.title} belongs`
                                                    : 'Choose a category to start editing'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {notesGroupMode === 'account' ? (<>
                            {allPortfolioData.length > 0 && (
                                <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${darkMode ? 'border-gray-700 bg-gray-800 text-white' : 'border-gray-200 bg-white text-gray-800'}`}>
                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-wider opacity-60">All accounts</div>
                                        <div className={`mt-1 text-lg font-bold tabular-nums ${hidePortfolioValues ? 'blur-sm select-none' : ''}`}>
                                            {formatUsd(grandPortfolioValue)}
                                        </div>
                                    </div>
                                    <div className={`text-right ${hidePortfolioValues ? 'blur-sm select-none' : ''}`}>
                                        <div className="text-xs font-bold uppercase tracking-wider opacity-60">
                                            {allPortfolioPnlTotals.missingCount > 0 ? 'Known unrealized P&L' : 'Unrealized P&L'}
                                        </div>
                                        {allPortfolioPnlTotals.coveredCount > 0 ? (
                                            <>
                                                <div className={`mt-1 text-lg font-bold tabular-nums ${allPortfolioPnlTotals.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {formatSignedUsd(allPortfolioPnlTotals.unrealizedPnL)}
                                                    {allPortfolioPnlTotals.unrealizedPnLPercent != null && ` · ${formatSignedPercent(allPortfolioPnlTotals.unrealizedPnLPercent)}`}
                                                </div>
                                                {allPortfolioPnlTotals.missingCount > 0 && (
                                                    <div className="text-[10px] opacity-60">{allPortfolioPnlTotals.coveredCount} of {allPortfolioData.length} positions have cost basis</div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="mt-1 text-sm font-semibold opacity-60">Unavailable</div>
                                        )}
                                        {robinhoodPerformance?.total?.status === 'ready' && (
                                            <div className={`mt-1 text-xs font-bold ${
                                                robinhoodPerformance.total.gain >= 0 ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                                {robinhoodPerformance.year} YTD {formatSignedUsd(robinhoodPerformance.total.gain)}
                                                {robinhoodPerformance.total.returnPercent != null &&
                                                    ` · ${formatSignedPercent(robinhoodPerformance.total.returnPercent)}`}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {accountSectionOrder.map(accountId => {
                            const accountNotes = groupedNotesByAccount[accountId];
                            // Real accounts always show a header (so an empty one can still be
                            // targeted); Unassigned only appears while something is in it.
                            if (!accountNotes.length && accountId === UNASSIGNED_ACCOUNT_ID) return null;
                            const accountValue = accountTotals[accountId]?.value || 0;
                            const isCollapsed = !!collapsedAccounts[accountId];
                            return (
                                <div key={accountId} className="mb-6">
                                    <button
                                        onClick={() => setCollapsedAccounts({...collapsedAccounts, [accountId]: !isCollapsed})}
                                        className={`flex items-center gap-2 w-full p-3 rounded-lg mb-3 ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}
                                        title={ACCOUNTS.find(a => a.id === accountId)?.strategy || 'Notes not assigned to an account'}
                                    >
                                        {isCollapsed ? <ChevronRight size={20}/> : <ChevronDown size={20}/>}
                                        <span className="font-semibold text-lg">{getAccountLabel(accountId)}</span>
                                        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>({accountNotes.length})</span>
                                        <span className={`ml-auto text-right ${hidePortfolioValues ? 'blur-sm select-none' : ''}`}>
                                            {accountValue > 0 && (
                                                <span className={`block text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                                    {formatUsd(accountValue)}
                                                </span>
                                            )}
                                            {(accountTotals[accountId]?.pnlPositionCount || 0) > 0 ? (
                                                <span className={`block text-xs font-semibold ${accountTotals[accountId].unrealizedPnL >= 0 ? (darkMode ? 'text-green-300' : 'text-green-700') : (darkMode ? 'text-red-300' : 'text-red-700')}`}>
                                                    {accountTotals[accountId].missingPnlCount > 0 ? 'Known unrealized P&L ' : 'Unrealized P&L '}
                                                    {formatSignedUsd(accountTotals[accountId].unrealizedPnL)}
                                                    {accountTotals[accountId].unrealizedPnLPercent != null && ` · ${formatSignedPercent(accountTotals[accountId].unrealizedPnLPercent)}`}
                                                </span>
                                            ) : accountValue > 0 ? (
                                                <span className={`block text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Unrealized P&amp;L unavailable</span>
                                            ) : null}
                                            {robinhoodPerformance?.accounts?.[accountId]?.status === 'ready' && (
                                                <span className={`block text-xs font-semibold ${
                                                    robinhoodPerformance.accounts[accountId].gain >= 0
                                                        ? (darkMode ? 'text-green-300' : 'text-green-700')
                                                        : (darkMode ? 'text-red-300' : 'text-red-700')
                                                }`}>
                                                    {robinhoodPerformance.year} YTD {formatSignedUsd(robinhoodPerformance.accounts[accountId].gain)}
                                                    {robinhoodPerformance.accounts[accountId].returnPercent != null &&
                                                        ` · ${formatSignedPercent(robinhoodPerformance.accounts[accountId].returnPercent)}`}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                    {!isCollapsed && (
                                        accountNotes.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                                {accountNotes.map(renderNoteCard)}
                                            </div>
                                        ) : (
                                            <div className={`rounded-lg p-6 text-center text-sm ${darkMode ? 'bg-gray-800/50 text-gray-400' : 'bg-white text-gray-500'}`}>
                                                No notes in this account yet. Set a note's account from its card or the expanded view.
                                            </div>
                                        )
                                    )}
                                </div>
                            );
                            })}
                        </>) : notesGroupMode === 'category' ? (categories.map(color => {
                            const categoryNotes = groupedNotes[color];
                            if (!categoryNotes.length) return null;
                            return (
                                <div key={color} className="mb-6">
                                    <button onClick={() => setCollapsedCategories({...collapsedCategories, [color]: !collapsedCategories[color]})} className={`flex items-center gap-2 w-full p-3 rounded-lg mb-3 ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}>
                                        {collapsedCategories[color] ? <ChevronRight size={20}/> : <ChevronDown size={20}/>}
                                        <div className={`w-6 h-6 ${color} rounded border-2 border-gray-300`}/>
                                        <span className="font-semibold text-lg">{colorLabels[color]}</span>
                                        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>({categoryNotes.length})</span>
                                    </button>
                                    {!collapsedCategories[color] && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {categoryNotes.map(renderNoteCard)}
                                        </div>
                                    )}
                                </div>
                            );
                        })) : (
                            <div className="mb-6">
                                <div className={`flex items-center gap-2 w-full p-3 rounded-lg mb-3 ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}>
                                    <span className="font-semibold text-lg">All Notes</span>
                                    <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>({sortedClassifiedNotes.length})</span>
                                    <span className={`text-xs font-semibold uppercase tracking-wider ml-auto ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Sorted by size</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {sortedClassifiedNotes.map(renderNoteCard)}
                                </div>
                            </div>
                        )}
                        {!notes.length && <div className="text-center py-20"><p className={`text-xl ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No notes yet. Click "New Note" to get started!</p></div>}
                        </>
                        ) : (
                        /* Portfolio View */
                        <div className="w-full pb-16">
                            {/* Portfolio Stats */}
                            <div className={`rounded-lg shadow-lg p-6 mb-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div>
                                            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {portfolioAccountFilter === 'all' ? 'Total Portfolio Value' : `${getAccountLabel(portfolioAccountFilter)} Value`}
                                            </p>
                                            <p className={`text-4xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} ${hidePortfolioValues ? 'blur-md select-none' : ''}`}>
                                                ${totalPortfolioValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                            </p>
                                            <div className={`mt-2 ${hidePortfolioValues ? 'blur-sm select-none' : ''}`}>
                                                <span className={`text-sm font-bold ${portfolioPnlTotals.coveredCount > 0
                                                    ? (portfolioPnlTotals.unrealizedPnL >= 0 ? (darkMode ? 'text-green-300' : 'text-green-700') : (darkMode ? 'text-red-300' : 'text-red-700'))
                                                    : (darkMode ? 'text-gray-500' : 'text-gray-400')}`}>
                                                    {portfolioPnlTotals.coveredCount > 0
                                                        ? `${portfolioPnlTotals.missingCount > 0 ? 'Known unrealized P&L' : 'Unrealized P&L'} ${formatSignedUsd(portfolioPnlTotals.unrealizedPnL)}${portfolioPnlTotals.unrealizedPnLPercent == null ? '' : ` · ${formatSignedPercent(portfolioPnlTotals.unrealizedPnLPercent)}`}`
                                                        : 'Unrealized P&L unavailable'}
                                                </span>
                                                {portfolioPnlTotals.missingCount > 0 && portfolioPnlTotals.coveredCount > 0 && (
                                                    <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                                        Cost basis available for {portfolioPnlTotals.coveredCount} of {portfolioData.length} positions
                                                    </p>
                                                )}
                                            </div>
                                            <div className={`mt-1 text-sm font-bold ${hidePortfolioValues ? 'blur-sm select-none' : ''} ${
                                                shownYtdPerformance?.status === 'ready'
                                                    ? (shownYtdPerformance.gain >= 0
                                                        ? (darkMode ? 'text-green-300' : 'text-green-700')
                                                        : (darkMode ? 'text-red-300' : 'text-red-700'))
                                                    : (darkMode ? 'text-gray-500' : 'text-gray-400')
                                            }`}>
                                                {shownYtdPerformance?.status === 'ready'
                                                    ? `${robinhoodPerformance.year} YTD ${formatSignedUsd(shownYtdPerformance.gain)}${shownYtdPerformance.returnPercent == null ? '' : ` · ${formatSignedPercent(shownYtdPerformance.returnPercent)}`}`
                                                    : shownYtdPerformance?.status === 'cash-flow-history-incomplete'
                                                        ? `${robinhoodPerformance.year} YTD needs cash-flow history`
                                                        : robinhoodPerformance
                                                            ? `${robinhoodPerformance.year} YTD needs opening values`
                                                            : 'YTD performance loading…'}
                                            </div>
                                            {portfolioAccountFilter !== 'all' && grandPortfolioValue > 0 && (
                                                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'} ${hidePortfolioValues ? 'blur-sm select-none' : ''}`}>
                                                    {((totalPortfolioValue / grandPortfolioValue) * 100).toFixed(1)}% of ${grandPortfolioValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} across all accounts
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => setHidePortfolioValues(!hidePortfolioValues)}
                                            className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}
                                            title={hidePortfolioValues ? 'Show values' : 'Hide values'}
                                        >
                                            {hidePortfolioValues ? <Eye size={20}/> : <EyeOff size={20}/>}
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleShareYtdPerformance}
                                            disabled={shownYtdPerformance?.status !== 'ready'}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border inline-flex items-center gap-2 ${
                                                shownYtdPerformance?.status !== 'ready'
                                                    ? (darkMode ? 'border-gray-700 text-gray-500 cursor-not-allowed' : 'border-gray-200 text-gray-400 cursor-not-allowed')
                                                    : (darkMode ? 'border-green-400/60 text-green-200 hover:text-green-100 hover:border-green-300 hover:bg-green-500/10' : 'border-green-500 text-green-700 hover:bg-green-50')
                                            }`}
                                            title="Create a social image of this YTD performance"
                                        >
                                            <Share size={16}/>
                                            Share YTD
                                        </button>
                                        <button
                                            onClick={handleRefreshPortfolioPrices}
                                            disabled={portfolioLoading}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border snapshot-hide inline-flex items-center gap-2 ${portfolioLoading ? (darkMode ? 'border-blue-400/40 text-blue-300/70 bg-blue-500/10 cursor-not-allowed' : 'border-blue-300 text-blue-400 bg-blue-50 cursor-not-allowed') : (darkMode ? 'border-blue-400/60 text-blue-200 hover:text-blue-100 hover:border-blue-300 hover:bg-blue-500/10' : 'border-blue-400 text-blue-600 hover:text-blue-700 hover:border-blue-500 hover:bg-blue-50')}`}
                                            title="Refresh portfolio prices"
                                        >
                                            {portfolioLoading && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>}
                                            {portfolioLoading ? 'Refreshing...' : 'Refresh Prices'}
                                        </button>
                                        <div className="flex flex-col items-end gap-1">
                                            <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {portfolioData.length} position{portfolioData.length !== 1 ? 's' : ''}
                                            </div>
                                            {missingPortfolioPriceCount > 0 && (
                                                <div className={`text-xs font-semibold px-2 py-1 rounded ${darkMode ? 'bg-amber-500/15 text-amber-300 border border-amber-400/30' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                    {missingPortfolioPriceCount} position{missingPortfolioPriceCount !== 1 ? 's' : ''} missing live price
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Account filter — composite by default, or one account at a time */}
                                {allPortfolioData.length > 0 && (
                                    <div className={`mt-5 pt-4 border-t flex flex-wrap gap-2 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                                        {['all', ...presentAccountIds].map(accountId => {
                                            const isActive = portfolioAccountFilter === accountId;
                                            const value = accountId === 'all' ? grandPortfolioValue : (accountTotals[accountId]?.value || 0);
                                            const count = accountId === 'all' ? allPortfolioData.length : (accountTotals[accountId]?.positionCount || 0);
                                            const pnl = accountId === 'all' ? allPortfolioPnlTotals : {
                                                unrealizedPnL: accountTotals[accountId]?.unrealizedPnL || 0,
                                                unrealizedPnLPercent: accountTotals[accountId]?.unrealizedPnLPercent ?? null,
                                                coveredCount: accountTotals[accountId]?.pnlPositionCount || 0,
                                                missingCount: accountTotals[accountId]?.missingPnlCount || 0,
                                            };
                                            const ytd = accountId === 'all'
                                                ? robinhoodPerformance?.total
                                                : robinhoodPerformance?.accounts?.[accountId];
                                            return (
                                                <button
                                                    key={accountId}
                                                    onClick={() => setPortfolioAccountFilter(accountId)}
                                                    className={`px-3 py-2 rounded-lg text-left border transition ${isActive
                                                        ? (darkMode ? 'bg-cyan-500 border-cyan-400 text-gray-950' : 'bg-blue-500 border-blue-500 text-white')
                                                        : (darkMode ? 'bg-gray-900/60 border-gray-700 text-gray-300 hover:bg-gray-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100')}`}
                                                    title={accountId === 'all' ? 'All accounts combined' : (ACCOUNTS.find(a => a.id === accountId)?.strategy || 'Positions not assigned to an account')}
                                                >
                                                    <div className="text-sm font-semibold">
                                                        {accountId === 'all' ? 'All Accounts' : getAccountLabel(accountId)}
                                                    </div>
                                                    <div className={`text-xs ${hidePortfolioValues ? 'blur-sm select-none' : ''}`}>
                                                        ${value.toLocaleString(undefined, {maximumFractionDigits: 0})} · {count} position{count !== 1 ? 's' : ''}
                                                    </div>
                                                    <div className={`mt-0.5 text-[10px] font-semibold ${hidePortfolioValues ? 'blur-sm select-none' : ''} ${pnl.coveredCount > 0
                                                        ? (pnl.unrealizedPnL >= 0
                                                            ? (isActive ? 'text-current' : (darkMode ? 'text-green-300' : 'text-green-700'))
                                                            : (isActive ? 'text-current' : (darkMode ? 'text-red-300' : 'text-red-700')))
                                                        : 'opacity-60'}`}>
                                                        {pnl.coveredCount > 0
                                                            ? `${pnl.missingCount > 0 ? 'Known unrealized P&L' : 'Unrealized P&L'} ${formatSignedUsd(pnl.unrealizedPnL)}`
                                                            : 'Unrealized P&L unavailable'}
                                                    </div>
                                                    {ytd?.status === 'ready' && (
                                                        <div className={`mt-0.5 text-[10px] font-semibold ${hidePortfolioValues ? 'blur-sm select-none' : ''} ${
                                                            ytd.gain >= 0
                                                                ? (isActive ? 'text-current' : (darkMode ? 'text-green-300' : 'text-green-700'))
                                                                : (isActive ? 'text-current' : (darkMode ? 'text-red-300' : 'text-red-700'))
                                                        }`}>
                                                            YTD {formatSignedUsd(ytd.gain)}
                                                            {ytd.returnPercent != null && ` · ${formatSignedPercent(ytd.returnPercent)}`}
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {portfolioData.length === 0 ? (
                                <div className={`rounded-lg shadow-lg p-12 text-center ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                                    <p className={`text-xl mb-4 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                        No positions in your portfolio yet
                                    </p>
                                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                        Add shares to your stock notes to see them here.<br/>
                                        Go to Notes tab, create or edit a note with a ticker symbol, and add the number of shares you own.
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {/* Pie Chart - Large */}
                                    <div ref={portfolioCardRef} className={`rounded-lg shadow-lg p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`} style={{height: '650px'}}>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <div className={`w-12 h-12 rounded-lg ${darkMode ? 'bg-gradient-to-br from-cyan-500 via-purple-600 to-pink-500' : 'bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500'} flex items-center justify-center shadow-lg`} style={{boxShadow: darkMode ? '0 0 15px rgba(6, 182, 212, 0.5), 0 0 30px rgba(168, 85, 247, 0.3)' : '0 4px 12px rgba(0,0,0,0.2)'}}>
                                                        <svg viewBox="0 0 24 24" className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                                            <path d="M2 17l10 5 10-5" />
                                                            <path d="M2 12l10 5 10-5" />
                                                            <circle cx="12" cy="12" r="2" fill="currentColor" />
                                                        </svg>
                                                    </div>
                                                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full ${darkMode ? 'bg-green-400' : 'bg-green-500'} border-2 ${darkMode ? 'border-gray-800' : 'border-white'}`} style={{boxShadow: darkMode ? '0 0 6px rgba(74, 222, 128, 0.6)' : 'none'}}></div>
                                                </div>
                                                <h3 className={`text-xl font-bold tracking-tight portfolio-title ${darkMode ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400' : 'text-gray-800'}`} style={darkMode ? {textShadow: '0 0 20px rgba(6, 182, 212, 0.4)'} : {}}>
                                                    {nickname || currentUser?.split('@')[0] || 'User'}'s Portfolio
                                                    {portfolioAccountFilter !== 'all' && ` — ${getAccountLabel(portfolioAccountFilter)}`}
                                                    <span className="snapshot-only snapshot-timestamp text-sm font-semibold ml-2"></span>
                                                </h3>
                                            </div>
                                            <div className="flex flex-wrap items-center justify-end gap-3">
                                                <div className={`inline-flex rounded-lg p-1 snapshot-hide ${darkMode ? 'bg-gray-900/70 border border-gray-700' : 'bg-gray-100 border border-gray-200'}`}>
                                                    <button
                                                        onClick={() => setPortfolioViewMode('donut')}
                                                        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${portfolioViewMode === 'donut' ? (darkMode ? 'bg-cyan-500 text-gray-950' : 'bg-blue-500 text-white') : (darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-white')}`}
                                                    >
                                                        Donut
                                                    </button>
                                                    <button
                                                        onClick={() => setPortfolioViewMode('map')}
                                                        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${portfolioViewMode === 'map' ? (darkMode ? 'bg-cyan-500 text-gray-950' : 'bg-blue-500 text-white') : (darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-white')}`}
                                                    >
                                                        Map
                                                    </button>
                                                </div>
                                                <div className={`flex flex-wrap items-center gap-1 rounded-lg p-1 snapshot-hide ${darkMode ? 'bg-gray-900/70 border border-gray-700' : 'bg-gray-100 border border-gray-200'}`}>
                                                    <span className={`px-2 text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                                        Display
                                                    </span>
                                                    <button
                                                        onClick={() => setPortfolioLegendVisible(!portfolioLegendVisible)}
                                                        aria-pressed={portfolioLegendVisible}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-semibold transition ${portfolioLegendVisible ? (darkMode ? 'bg-cyan-500 text-gray-950' : 'bg-blue-500 text-white') : (darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-white')}`}
                                                        title="Show ticker labels and percentages around the chart"
                                                    >
                                                        <span>Labels</span>
                                                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${portfolioLegendVisible ? 'bg-white/25' : (darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-500')}`}>
                                                            {portfolioLegendVisible ? 'On' : 'Off'}
                                                        </span>
                                                    </button>
                                                    <button
                                                        onClick={() => setPortfolioLegendDollarAmounts(!portfolioLegendDollarAmounts)}
                                                        aria-pressed={portfolioLegendDollarAmounts}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-semibold transition ${portfolioLegendDollarAmounts ? (darkMode ? 'bg-cyan-500 text-gray-950' : 'bg-blue-500 text-white') : (darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-white')}`}
                                                        title={hidePortfolioValues ? 'Dollar values remain private while portfolio privacy is enabled' : 'Show dollar values with chart labels'}
                                                    >
                                                        <span>Dollar values</span>
                                                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${portfolioLegendDollarAmounts ? 'bg-white/25' : (darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-500')}`}>
                                                            {hidePortfolioValues ? 'Private' : (portfolioLegendDollarAmounts ? 'On' : 'Off')}
                                                        </span>
                                                    </button>
                                                    {portfolioViewMode === 'donut' && cashPortfolioValue > 0 && (
                                                        <button
                                                            onClick={() => setPortfolioDonutIncludesCash(!portfolioDonutIncludesCash)}
                                                            aria-pressed={portfolioDonutIncludesCash}
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-semibold transition ${portfolioDonutIncludesCash ? (darkMode ? 'bg-cyan-500 text-gray-950' : 'bg-blue-500 text-white') : (darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-white')}`}
                                                            title="Choose whether cash appears as a donut slice or as text below the chart"
                                                        >
                                                            <span>Cash</span>
                                                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${portfolioDonutIncludesCash ? 'bg-white/25' : (darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-500')}`}>
                                                                {portfolioDonutIncludesCash ? 'Slice' : 'Text'}
                                                            </span>
                                                        </button>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={handleCopyPortfolio}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border snapshot-hide ${darkMode ? 'border-cyan-400/60 text-cyan-200 hover:text-cyan-100 hover:border-cyan-300 hover:bg-cyan-500/10' : 'border-blue-400 text-blue-600 hover:text-blue-700 hover:border-blue-500 hover:bg-blue-50'}`}
                                                    title="Copy this view as Markdown — paste into an LLM for analysis"
                                                >
                                                    <Clipboard size={16}/>
                                                    Copy
                                                </button>
                                                <button
                                                    onClick={handleDownloadPortfolioSnapshot}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border snapshot-hide ${darkMode ? 'border-cyan-400/60 text-cyan-200 hover:text-cyan-100 hover:border-cyan-300 hover:bg-cyan-500/10' : 'border-blue-400 text-blue-600 hover:text-blue-700 hover:border-blue-500 hover:bg-blue-50'}`}
                                                    title="Download portfolio snapshot"
                                                >
                                                    <Download size={16}/>
                                                    Snapshot
                                                </button>
                                            </div>
                                        </div>
                                        <div className="h-[520px]">
                                            {portfolioViewMode === 'donut' ? (
                                                <div className="flex min-h-0 h-full flex-col">
                                                    <div className="min-h-0 flex-1">
                                                        {!portfolioDonutIncludesCash && nonCashPortfolioValue <= 0 ? (
                                                            <div className={`flex h-full items-center justify-center text-sm font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                No non-cash positions to display
                                                            </div>
                                                        ) : (
                                                            <canvas ref={chartRef}></canvas>
                                                        )}
                                                    </div>
                                                    {!portfolioDonutIncludesCash && cashPortfolioValue > 0 && (
                                                        <div className={`mt-2 flex flex-wrap items-center justify-center gap-x-2 text-sm font-semibold ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
                                                            <span>Cash excluded from donut:</span>
                                                            <span className={hidePortfolioValues ? 'blur-sm select-none' : ''}>{formatUsd(cashPortfolioValue)}</span>
                                                            <span>· {cashPortfolioPercentage.toFixed(1)}% of total portfolio</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className={`relative h-full overflow-hidden rounded-md border ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
                                                    {portfolioMapTiles.map((tile) => {
                                                        const isCompact = tile.layout === 'compact';
                                                        const showDetail = !isCompact && tile.w >= 11 && tile.h >= 10;
                                                        const showPercent = isCompact || (tile.w >= 8 && tile.h >= 8);
                                                        const fontSize = isCompact
                                                            ? Math.max(14, Math.min(24, tile.h * 2.1))
                                                            : Math.max(18, Math.min(tile.layout === 'hero' ? 54 : 38, Math.min(tile.w, tile.h) * 1.65));
                                                        const inset = isCompact ? '3px' : '2px';
                                                        return (
                                                            <div
                                                                key={tile.ticker}
                                                                className={`absolute flex items-center justify-center overflow-hidden border border-black/25 ${isCompact ? 'rounded-sm' : ''}`}
                                                                style={{
                                                                    left: `calc(${tile.x}% + ${inset})`,
                                                                    top: `calc(${tile.y}% + ${inset})`,
                                                                    width: `calc(${tile.w}% - ${isCompact ? '6px' : '4px'})`,
                                                                    height: `calc(${tile.h}% - ${isCompact ? '6px' : '4px'})`,
                                                                    backgroundColor: tile.color
                                                                }}
                                                                title={`${tile.ticker}: ${tile.percentage.toFixed(1)}%${portfolioLegendDollarAmounts && !hidePortfolioValues ? ` | ${formatUsd(tile.value).replace(/\.00$/, '')}` : ''}`}
                                                            >
                                                                {portfolioLegendVisible && (
                                                                    <div className={`w-full text-center leading-tight text-white/95 ${isCompact ? 'px-1' : 'px-2'}`} style={{textShadow: '0 1px 2px rgba(0,0,0,0.55)'}}>
                                                                        <div className="truncate font-extrabold tracking-normal" style={{fontSize: `${fontSize}px`}}>
                                                                            {tile.ticker}
                                                                        </div>
                                                                        {showPercent && (
                                                                            <div className={`font-semibold ${isCompact ? 'mt-0.5 text-[11px]' : showDetail ? 'mt-1 text-base' : 'mt-0.5 text-xs'}`}>
                                                                                {tile.percentage.toFixed(1)}%
                                                                            </div>
                                                                        )}
                                                                        {(showDetail || (isCompact && tile.h >= 8)) && portfolioLegendDollarAmounts && !hidePortfolioValues && (
                                                                            <div className={`${isCompact ? 'mt-0 text-[10px]' : 'mt-0.5 text-xs'} font-semibold opacity-90 truncate`}>
                                                                                {formatUsd(tile.value).replace(/\.00$/, '')}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        {shownPutObligation > 0 && (
                                            <div className={`mt-2 text-xs leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                                <span className={`font-semibold ${darkMode ? 'text-green-300' : 'text-green-700'}`}>* Cash Secured Put obligation{portfolioAccountFilter !== 'all' ? ` (${getAccountLabel(portfolioAccountFilter)})` : ''}:</span>{' '}
                                                <span className={hidePortfolioValues ? 'blur-sm select-none' : ''}>{formatUsd(shownPutObligation)}</span>
                                                {' '}— held as separate collateral by the broker, not part of the cash position shown{cashPortfolioValue > 0 ? (
                                                    <>{' '}(<span className={hidePortfolioValues ? 'blur-sm select-none' : ''}>{formatUsd(cashPortfolioValue)}</span> free cash)</>
                                                ) : ''}.
                                            </div>
                                        )}
                                    </div>

                                    <div className={`overflow-hidden rounded-lg shadow-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                                        <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                                            <div>
                                                <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Portfolio positions</h3>
                                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Market value, cost basis, and unrealized P&amp;L for each holding</p>
                                            </div>
                                            <div className={`text-right ${hidePortfolioValues ? 'blur-sm select-none' : ''}`}>
                                                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    {portfolioPnlTotals.missingCount > 0 ? 'Known total unrealized P&L' : 'Total unrealized P&L'}
                                                </div>
                                                <div className={`font-bold tabular-nums ${portfolioPnlTotals.coveredCount > 0
                                                    ? (portfolioPnlTotals.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600')
                                                    : (darkMode ? 'text-gray-500' : 'text-gray-400')}`}>
                                                    {portfolioPnlTotals.coveredCount > 0
                                                        ? `${formatSignedUsd(portfolioPnlTotals.unrealizedPnL)}${portfolioPnlTotals.unrealizedPnLPercent == null ? '' : ` · ${formatSignedPercent(portfolioPnlTotals.unrealizedPnLPercent)}`}`
                                                        : 'Unavailable'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full min-w-[760px] border-collapse text-sm">
                                                <thead className={darkMode ? 'bg-gray-900/60 text-gray-400' : 'bg-gray-50 text-gray-500'}>
                                                    <tr className="text-left text-[10px] font-bold uppercase tracking-wider">
                                                        <th className="px-5 py-3">Position</th>
                                                        <th className="px-4 py-3">Account</th>
                                                        <th className="px-4 py-3 text-right">Market value</th>
                                                        <th className="px-4 py-3 text-right">Cost basis</th>
                                                        <th className="px-4 py-3 text-right">Unrealized P&amp;L</th>
                                                        <th className="px-5 py-3 text-right">% of shown</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={darkMode ? 'divide-y divide-gray-700' : 'divide-y divide-gray-100'}>
                                                    {portfolioData.map(h => (
                                                        <tr key={`${h.account}-${h.noteId}`} className={darkMode ? 'hover:bg-gray-700/40' : 'hover:bg-gray-50'}>
                                                            <td className="px-5 py-3">
                                                                <div className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{h.ticker}</div>
                                                                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                    {Number(h.shares).toLocaleString()} shares · {h.price > 0 ? formatUsd(h.price) : 'Price unavailable'}
                                                                </div>
                                                            </td>
                                                            <td className={`px-4 py-3 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{getAccountLabel(h.account)}</td>
                                                            <td className={`px-4 py-3 text-right font-semibold tabular-nums ${hidePortfolioValues ? 'blur-sm select-none' : ''}`}>{h.price > 0 ? formatUsd(h.value) : '—'}</td>
                                                            <td className={`px-4 py-3 text-right tabular-nums ${hidePortfolioValues ? 'blur-sm select-none' : ''} ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{h.costBasis == null ? 'Unavailable' : formatUsd(h.costBasis)}</td>
                                                            <td className={`px-4 py-3 text-right font-bold tabular-nums ${hidePortfolioValues ? 'blur-sm select-none' : ''} ${h.unrealizedPnL == null
                                                                ? (darkMode ? 'text-gray-500' : 'text-gray-400')
                                                                : (h.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600')}`}>
                                                                {h.unrealizedPnL == null
                                                                    ? 'Unavailable'
                                                                    : `${formatSignedUsd(h.unrealizedPnL)}${h.unrealizedPnLPercent == null ? '' : ` · ${formatSignedPercent(h.unrealizedPnLPercent)}`}`}
                                                            </td>
                                                            <td className={`px-5 py-3 text-right tabular-nums ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{h.percentage.toFixed(2)}%</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {portfolioPnlTotals.missingCount > 0 && (
                                            <div className={`border-t px-5 py-3 text-xs ${darkMode ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                                                {portfolioPnlTotals.coveredCount > 0
                                                    ? <>Total unrealized P&amp;L includes only the {portfolioPnlTotals.coveredCount} position{portfolioPnlTotals.coveredCount !== 1 ? 's' : ''} with brokerage-provided cost basis; {portfolioPnlTotals.missingCount} position{portfolioPnlTotals.missingCount !== 1 ? 's are' : ' is'} unavailable.</>
                                                    : <>Brokerage-provided cost basis is unavailable for these positions, so unrealized P&amp;L cannot be calculated yet.</>}
                                            </div>
                                        )}
                                    </div>

                                </div>
                            )}
                        </div>
                        )}
                        </div>

                        {(mainTab === 'notes') ? (
                            /* Watch List Panel */
                            <div className={`flex-shrink-0 w-full xl:w-[23%] mt-4 xl:mt-[198px] ${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg flex flex-col`}>

                                <div className="p-6 pb-2">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Cash Secured Puts</h3>
                                            <div className={`text-sm mt-1 ${darkMode ? 'text-green-300' : 'text-green-700'}`}>Total buying obligation: {formatUsd(totalPutObligation)}</div>
                                        </div>
                                        <button
                                            onClick={() => setShowCashSecuredPutModal(true)}
                                            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded shadow"
                                            title="Add cash secured put"
                                        >
                                            <Plus size={18}/>
                                        </button>
                                    </div>
                                    <div className={`inline-flex rounded-lg p-1 mb-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                        <button
                                            onClick={() => setCashSecuredPutsSortMode('alpha')}
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${cashSecuredPutsSortMode === 'alpha' ? (darkMode ? 'bg-blue-500 text-white' : 'bg-blue-500 text-white') : (darkMode ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-200')}`}
                                        >
                                            A–Z
                                        </button>
                                        <button
                                            onClick={() => setCashSecuredPutsSortMode('obligation_desc')}
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${cashSecuredPutsSortMode === 'obligation_desc' ? (darkMode ? 'bg-blue-500 text-white' : 'bg-blue-500 text-white') : (darkMode ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-200')}`}
                                        >
                                            High → Low
                                        </button>
                                        <button
                                            onClick={() => setCashSecuredPutsSortMode('obligation_asc')}
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${cashSecuredPutsSortMode === 'obligation_asc' ? (darkMode ? 'bg-blue-500 text-white' : 'bg-blue-500 text-white') : (darkMode ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-200')}`}
                                        >
                                            Low → High
                                        </button>
                                    </div>
                                    <div className="space-y-2 mb-4">
                                        {cashSecuredPuts.length === 0 ? (
                                            <p className={`text-sm text-center py-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No cash secured puts</p>
                                        ) : (
                                            sortedCashSecuredPuts.map((put) => (
                                                <div key={put.id} className={`flex items-center justify-between p-3 rounded cursor-pointer ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} hover:shadow-md transition-all`} onClick={() => startEditCashSecuredPut(put)}>
                                                    <div>
                                                        <div className={`font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{put.ticker}</div>
                                                        <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>${put.strike} · Qty {put.qty || '—'} · {put.expiry}</div>
                                                        <div className={`text-sm font-medium ${darkMode ? 'text-green-300' : 'text-green-700'}`}>Buying obligation: {formatUsd(getPutObligation(put))}</div>
                                                        <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'bg-gray-800 text-gray-300 border border-gray-600' : 'bg-white text-gray-700 border border-gray-300'}`}>{getAccountLabel(getPutAccount(put))}</span>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setPutToDelete(put.id); }}
                                                        className={`flex items-center justify-center w-8 h-8 rounded-full border ${darkMode ? 'border-red-400 text-red-300 hover:text-red-200 hover:border-red-300 hover:bg-red-900/20' : 'border-red-400 text-red-600 hover:text-red-700 hover:border-red-500 hover:bg-red-50'}`}
                                                        aria-label={`Remove ${put.ticker} put`}
                                                        title="Remove put"
                                                    >
                                                        <X size={18}/>
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                                <div className="p-6 pb-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Watch List</h3>
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newWatchTicker}
                                            onChange={(e) => {
                                                const sanitized = sanitizeTicker(e.target.value);
                                                setNewWatchTicker(sanitized);
                                            }}
                                            onKeyDown={(e) => e.key === 'Enter' && addToWatchList()}
                                            placeholder="Add ticker..."
                                            className={`flex-1 px-3 py-2 rounded border-2 ${darkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-800 border-gray-300'} focus:ring-2 focus:ring-blue-500 outline-none uppercase`}
                                            maxLength={MAX_TITLE_LENGTH}
                                        />
                                        <button
                                            onClick={addToWatchList}
                                            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow"
                                        >
                                            <Plus size={20}/>
                                        </button>
                                    </div>
                                </div>
                                <div className="px-6 pb-6">
                                    <div className="space-y-2">
                                        {watchList.length === 0 ? (
                                            <p className={`text-sm text-center py-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                No tickers in watch list
                                            </p>
                                        ) : (
                                            watchList.map((ticker) => (
                                                <div
                                                    key={ticker}
                                                    className={`flex items-center justify-between p-3 rounded cursor-pointer ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} hover:shadow-md transition-all`}
                                                    onClick={() => setWatchListModalTicker(ticker)}
                                                >
                                                    <span className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                                                        {ticker}
                                                    </span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); removeFromWatchList(ticker); }}
                                                        className={`flex items-center justify-center w-8 h-8 rounded-full border ${darkMode ? 'border-red-400 text-red-300 hover:text-red-200 hover:border-red-300 hover:bg-red-900/20' : 'border-red-400 text-red-600 hover:text-red-700 hover:border-red-500 hover:bg-red-50'}`}
                                                        aria-label={`Remove ${ticker} from watch list`}
                                                        title="Remove from watch list"
                                                    >
                                                        <X size={18}/>
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (mainTab === 'portfolio' ? (
                            /* Watch List Panel */
                            <div className={`flex-shrink-0 w-full xl:w-[23%] mt-4 xl:mt-[198px] ${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg flex flex-col`}>

                                <div className="p-6 pb-2">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Cash Secured Puts</h3>
                                            <div className={`text-sm mt-1 ${darkMode ? 'text-green-300' : 'text-green-700'}`}>Total buying obligation: {formatUsd(totalPutObligation)}</div>
                                        </div>
                                        <button
                                            onClick={() => setShowCashSecuredPutModal(true)}
                                            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded shadow"
                                            title="Add cash secured put"
                                        >
                                            <Plus size={18}/>
                                        </button>
                                    </div>
                                    <div className="space-y-2 mb-4">
                                        {cashSecuredPuts.length === 0 ? (
                                            <p className={`text-sm text-center py-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No cash secured puts</p>
                                        ) : (
                                            sortedCashSecuredPuts.map((put) => (
                                                <div key={put.id} className={`flex items-center justify-between p-3 rounded cursor-pointer ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} hover:shadow-md transition-all`} onClick={() => startEditCashSecuredPut(put)}>
                                                    <div>
                                                        <div className={`font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{put.ticker}</div>
                                                        <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>${put.strike} · Qty {put.qty || '—'} · {put.expiry}</div>
                                                        <div className={`text-sm font-medium ${darkMode ? 'text-green-300' : 'text-green-700'}`}>Buying obligation: {formatUsd(getPutObligation(put))}</div>
                                                        <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'bg-gray-800 text-gray-300 border border-gray-600' : 'bg-white text-gray-700 border border-gray-300'}`}>{getAccountLabel(getPutAccount(put))}</span>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setPutToDelete(put.id); }}
                                                        className={`flex items-center justify-center w-8 h-8 rounded-full border ${darkMode ? 'border-red-400 text-red-300 hover:text-red-200 hover:border-red-300 hover:bg-red-900/20' : 'border-red-400 text-red-600 hover:text-red-700 hover:border-red-500 hover:bg-red-50'}`}
                                                        aria-label={`Remove ${put.ticker} put`}
                                                        title="Remove put"
                                                    >
                                                        <X size={18}/>
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                                <div className="p-6 pb-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Watch List</h3>
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newWatchTicker}
                                            onChange={(e) => {
                                                const sanitized = sanitizeTicker(e.target.value);
                                                setNewWatchTicker(sanitized);
                                            }}
                                            onKeyDown={(e) => e.key === 'Enter' && addToWatchList()}
                                            placeholder="Add ticker..."
                                            className={`flex-1 px-3 py-2 rounded border-2 ${darkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-800 border-gray-300'} focus:ring-2 focus:ring-blue-500 outline-none uppercase`}
                                            maxLength={MAX_TITLE_LENGTH}
                                        />
                                        <button
                                            onClick={addToWatchList}
                                            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow"
                                        >
                                            <Plus size={20}/>
                                        </button>
                                    </div>
                                </div>
                                <div className="px-6 pb-6">
                                    <div className="space-y-2">
                                        {watchList.length === 0 ? (
                                            <p className={`text-sm text-center py-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                No tickers in watch list
                                            </p>
                                        ) : (
                                            watchList.map((ticker) => (
                                                <div
                                                    key={ticker}
                                                    className={`flex items-center justify-between p-3 rounded cursor-pointer ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} hover:shadow-md transition-all`}
                                                    onClick={() => setWatchListModalTicker(ticker)}
                                                >
                                                    <span className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                                                        {ticker}
                                                    </span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); removeFromWatchList(ticker); }}
                                                        className={`flex items-center justify-center w-8 h-8 rounded-full border ${darkMode ? 'border-red-400 text-red-300 hover:text-red-200 hover:border-red-300 hover:bg-red-900/20' : 'border-red-400 text-red-600 hover:text-red-700 hover:border-red-500 hover:bg-red-50'}`}
                                                        aria-label={`Remove ${ticker} from watch list`}
                                                        title="Remove from watch list"
                                                    >
                                                        <X size={18}/>
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : null)}
                    </div>
                </div>

                {/* Ask K — portfolio analysis assistant */}
                <AskK portfolio={askKPortfolio} darkMode={darkMode} />

                {ytdSharePreview && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="ytd-share-title">
                        <button className="absolute inset-0 bg-black/75 backdrop-blur-sm" type="button" onClick={closeYtdSharePreview} aria-label="Close YTD performance image" />
                        <section className={`relative w-full max-w-4xl overflow-hidden rounded-2xl border shadow-2xl ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                            <div className={`flex items-center justify-between border-b px-4 py-3 sm:px-5 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                                <div>
                                    <h2 id="ytd-share-title" className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>YTD performance image</h2>
                                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Ready to copy, share, or save.</p>
                                </div>
                                <button type="button" onClick={closeYtdSharePreview} className={`rounded-lg p-2 ${darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'}`} aria-label="Close">
                                    <X size={20}/>
                                </button>
                            </div>
                            {ytdSharePreview.cardData?.returnPercent != null && (
                                <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                                    <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Performance shown</span>
                                    <div className={`inline-flex rounded-lg p-1 ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                        <button type="button" disabled={ytdCardUpdating} onClick={() => handleYtdDisplayMode('full')} className={`rounded-md px-3 py-1.5 text-xs font-bold ${ytdSharePreview.displayMode === 'full' ? 'bg-green-500 text-gray-950' : (darkMode ? 'text-gray-300' : 'text-gray-600')}`}>$ + %</button>
                                        <button type="button" disabled={ytdCardUpdating} onClick={() => handleYtdDisplayMode('percent-only')} className={`rounded-md px-3 py-1.5 text-xs font-bold ${ytdSharePreview.displayMode === 'percent-only' ? 'bg-green-500 text-gray-950' : (darkMode ? 'text-gray-300' : 'text-gray-600')}`}>% only</button>
                                    </div>
                                </div>
                            )}
                            <div className={`p-3 sm:p-5 ${darkMode ? 'bg-gray-950' : 'bg-gray-100'}`}>
                                <img src={ytdSharePreview.url} alt="Preview of your Stock Stickies YTD performance image" className="block w-full rounded-xl shadow-lg" />
                            </div>
                            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                                <p className={`min-h-5 text-xs font-semibold ${ytdCopyStatus === 'Copied!' ? 'text-green-500' : (darkMode ? 'text-gray-400' : 'text-gray-500')}`} role="status">{ytdCopyStatus}</p>
                                <div className="flex gap-2">
                                    <button type="button" disabled={ytdCardUpdating} onClick={handleCopyYtdImage} className="flex-1 rounded-lg bg-green-500 px-4 py-2.5 text-sm font-bold text-gray-950 hover:bg-green-400 disabled:opacity-50 sm:flex-none">
                                        {ytdCopyStatus === 'Copied!' ? 'Copied!' : 'Copy image'}
                                    </button>
                                    <button type="button" disabled={ytdCardUpdating} onClick={handleShareOrDownloadYtdImage} className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-bold disabled:opacity-50 sm:flex-none ${darkMode ? 'border-gray-600 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}>
                                        Share / Download
                                    </button>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {/* Footer */}
                <footer className={`text-center pt-8 pb-4 px-4 text-xs sm:text-sm border-t ${darkMode ? 'bg-gray-900 text-white border-gray-700' : 'bg-white text-gray-800 border-gray-200'}`}>
                    <div className="mb-1">© {new Date().getFullYear()} Stock Stickies. All rights reserved.</div>
                    <div className="mb-1 space-x-2">
                        <button type="button" onClick={() => setLegalView('privacy')} className={`${darkMode ? 'text-red-400 hover:text-blue-300' : 'text-blue-700 hover:text-blue-900'}`}>Privacy Policy</button>
                        <span>·</span>
                        <button type="button" onClick={() => setLegalView('terms')} className={`${darkMode ? 'text-red-400 hover:text-blue-300' : 'text-blue-700 hover:text-blue-900'}`}>Terms of Use</button>
                    </div>
                    <div>
                        Website created and maintained by <a href="https://www.easternshore.ai" target="_blank" rel="noopener noreferrer" className={`${darkMode ? 'text-red-400 hover:text-blue-300' : 'text-blue-700 hover:text-blue-900'}`}>Eastern Shore AI, LLC</a>
                    </div>
                </footer>
                </>
            );
        }

export default StickyNotesApp
