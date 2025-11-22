# Focus Browser – Neurable MVP

A bare-bones Chrome extension that keeps track of the site you're focused on, syncs each visit with a mocked Neurable focus score, and visualizes how attentive you were on every domain you visited.

## Features

-   ✅ **Live tab tracking** – automatically starts and stops a session whenever you switch tabs, navigate, or lose window focus.
-   💡 **Real-time overlay** – a tiny in-page widget streams your current focus score + sparkline while you stay on the site.
-   🔔 **Action badge feedback** – the extension icon shows the latest score at a glance.
-   🧠 **Mocked Neurable data** – each session gets a placeholder focus score (0–100). Swap the mock for the actual Neurable SDK/API when it's available.
-   📊 **Per-site focus chart** – popup shows a ranked card view with mini-bars plus aggregate metrics per hostname.
-   🕒 **Recent history** – quick list of the latest sessions with timestamps and focus points.
-   💾 **Local persistence** – sessions are stored in `chrome.storage.local` (capped at the most recent 500 entries).

## How it works

1. The background service worker (`background.js`) listens for tab/window events and records sessions longer than one second.
2. While a tab is active, the worker samples a mock Neurable score every 5 seconds, streams it to the page overlay + popup, and stores the samples for the session.
3. Each session is stamped with its URL, hostname, duration, focus samples, and an averaged focus score.
4. The popup (`popup.html` + `popup.js`) aggregates stored sessions into per-domain averages, shows the live session card, and lists your recent history.

## Getting started

1. Clone or download this folder.
2. In Chrome, open **chrome://extensions** and enable **Developer mode**.
3. Click **Load unpacked** and select the `focus-browser` directory.
4. Pin the extension and start browsing—open the popup to see focus charts, the current session card, and the recent session log.
5. Keep browsing in any tab to see the floating “Focus stream” overlay update in place (you can close it by disabling the extension or navigating away).

## Hooking up real Neurable data

Replace the `getNeurableFocusScore()` function in `background.js` with the actual Neurable SDK call (e.g., fetch or WebSocket data). Ensure that:

-   Focus values are normalized to `0–100` so the UI stays consistent.
-   The data fetch is non-blocking; cache the latest value and read it synchronously when a session ends.

## Focus calculation

Focus scores in the extension come from the per-hemisphere engagement metric Neurable provided:

1. For each hemisphere, compute `engagement = (beta + gamma) / (alpha + theta)`. These components are taken straight from the EEG payload (`Left__beta`, etc.).
2. Blend the left/right engagement values using their relative `total_power` so stronger signals have more influence: `weighted = (leftEng * leftPower + rightEng * rightPower) / (leftPower + rightPower)`.
3. Clamp that weighted engagement to the `[0.5, 3.0]` operating band, normalize it to a 0–1 range, and then scale to a `0–100` focus score (rounded to the nearest integer).
4. Track stream quality alongside the score using `quality = 1 - max(Left__p_bad, Right__p_bad)`, clamped to `[0, 1]`, so UIs can flag noisy samples.

This mirrors the implementation in `offscreen.js`, ensuring anyone reading the README can recreate the same values Neurable expects.

## Roadmap ideas

-   Sync data to a backend or Google Sheets for long-term analytics.
-   Add time filters (today, week, custom ranges) to the popup.
-   Display richer charts (e.g., sparkline per site, timeline scatter plot).
-   Surface productivity alerts when focus consistently drops on specific domains.

## Tech stack

-   Manifest V3 Chrome Extension
-   Plain JavaScript + HTML/CSS (no frameworks)
-   `chrome.tabs`, `chrome.windows`, and `chrome.storage`

> ⚠️ **Privacy note:** All data stays in the browser via `chrome.storage.local`. No remote sync is performed in this MVP.
