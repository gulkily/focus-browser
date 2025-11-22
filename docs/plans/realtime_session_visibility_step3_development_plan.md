# Real-time Session Visibility — Step 3 Development Plan

## Stage 1 – Live session data plumbing
- **Goal**: Provide popup with un-ended session info alongside stored sessions.
- **Dependencies**: Step 2 description.
- **Changes**: Update `background.js` message response to include current hostname/url/duration and average score calculated from active `focusSamples`. Ensure `startSession` maintains hostname. No storage writes yet.
- **Verification**: With a tab active, run `chrome.runtime.sendMessage({type: 'get-current-focus'})` from popup DevTools and verify it contains `liveSession` fields even before tab switch.
- **Risks**: Miscomputed duration/score if timers reset unexpectedly.

## Stage 2 – Popup load/render logic
- **Goal**: Merge live session data into stats/recent list rendering.
- **Dependencies**: Stage 1 data exposed.
- **Changes**: Modify `popup.js` `loadStats` to request both stored sessions and live session data. Compose a derived list where the live session is treated as an in-memory session (flagged). Ensure aggregated stats and recent list include it. Add UI hint (e.g., “live” badge) to distinguish.
- **Verification**: Open popup mid-session and confirm immediate stats population, with live entry marked appropriately.
- **Risks**: Double-counting once the session ends and is persisted; need dedupe logic.

## Stage 3 – Live updates wiring
- **Goal**: Keep popup stats updating while open.
- **Dependencies**: Stage 2 rendering.
- **Changes**: Extend popup message listener to reuse same merge/render routine when receiving `focus-update` payloads. Possibly throttle to avoid flicker. Ensure cleanup on `focus-stop` to remove live entry until storage reloads.
- **Verification**: With popup open, observe stats updating without closing or switching tabs.
- **Risks**: Memory leak from repeated listeners; stale data if we don’t re-render on stop.
