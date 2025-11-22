# Neurable EEG Integration — Step 3 Development Plan

## Stage 1 – Offscreen document socket plumbing
- **Goal**: Create an offscreen document (HTML + JS) that manages the websocket connection and relays EEG samples.
- **Dependencies**: Step 2 doc.
- **Changes**: Add `offscreen.html`/`offscreen.js` with logic to open the provided wss URL, send heartbeat/reconnect, and post messages (`chrome.runtime.sendMessage`) containing raw samples. Update `manifest.json` to request `offscreen` document permission and declare it. Add helper in `background.js` to ensure the offscreen doc exists at startup.
- **Verification**: With a test websocket endpoint (mock or ngrok) run, load the extension, check service worker logs confirming messages arriving from offscreen JS.
- **Risks**: TLS cert trust (cannot bypass invalid certs); offscreen doc lifecycle quirks (must only create when needed).

## Stage 2 – Engagement/focus computation
- **Goal**: Transform incoming EEG samples into numeric focus scores.
- **Dependencies**: Stage 1 messaging.
- **Changes**: In offscreen JS (or background worker), implement the provided engagement metric: per hemisphere `(beta+gamma)/(alpha+theta)` weighted by `total_power`. Normalize to 0–100 scale, clamp, and include `p_bad` quality. Emit structured focus sample messages to the background worker (`{focusScore, rawEngagement, quality, timestamp}`).
- **Verification**: Feed the example samples from README via a mock stream and confirm computed weighted engagement matches the provided calculation, producing reasonable focus scores.
- **Risks**: Division-by-zero; noisy spikes; need smoothing (maybe simple moving average) to avoid flicker (flag for potential Stage 4 if time).

## Stage 3 – Background integration & UI propagation
- **Goal**: Replace mock `getNeurableFocusScore` usage with real stream data, maintaining session storage/UI updates.
- **Dependencies**: Stage 2 focus messages.
- **Changes**: Update `background.js` to listen for `runtime.onMessage` from offscreen doc carrying focus samples, update `latestFocusScore`/`focusSamples`, and start/stop sessions based on stream availability. Remove `Math.random` generator, but keep fallback/timeout to handle no data. Ensure overlay/popup continue to receive updates. Optionally expose connection state to UI (status text) if simple.
- **Verification**: With live/mock stream, open overlay/popup and observe real-time updates while staying on one tab; disconnect stream and ensure graceful degradation.
- **Risks**: Race conditions if stream emits faster than session timer; need buffering/rate limiting; ensuring service worker stays awake when data flows slowly.
