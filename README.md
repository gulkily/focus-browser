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

Focus scores come directly from the Neurable engagement metric below (also implemented in `offscreen.js`). All symbols are taken verbatim from each stream sample (`Left__beta`, etc.).

1. Hemisphere engagement

    $$E_L = \frac{\beta_L + \gamma_L}{\alpha_L + \theta_L}, \qquad E_R = \frac{\beta_R + \gamma_R}{\alpha_R + \theta_R}$$

2. Power-weighted blend (fall back to whichever side is available if the denominator is zero)

    $$E = \frac{P_L E_L + P_R E_R}{P_L + P_R}$$

3. Normalize the operating band `[0.5, 3.0]` into a 0–1 focus fraction, then scale to `0–100` and round to match the UI expectation

    $$f = \frac{\min(\max(E, 0.5), 3.0) - 0.5}{3.0 - 0.5}, \qquad \text{focusScore} = \operatorname{round}(100 f)$$

4. Surface signal quality from the `p_bad` confidence flag

    $$\text{quality} = 1 - \min(1, \max(0, \max(p^{bad}_L, p^{bad}_R)))$$

These equations reproduce the exact values the extension records and display, so anyone reading the README can recreate the computation outside the codebase.

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
