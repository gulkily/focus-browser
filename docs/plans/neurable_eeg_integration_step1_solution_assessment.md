# Neurable EEG Integration — Step 1 Solution Assessment

## Problem
We currently fake focus scores in `background.js`. We now have a real-time EEG websocket stream (see `neurable-eeg-stream/main.py`) and a proposed engagement formula. We must get those samples into the MV3 extension, compute focus metrics, and surface them in real time.

## Option 1 – Direct MV3 service worker WebSocket
- **Pros**: Pure JavaScript solution; no external helper process; minimal moving parts; background worker already orchestrates sessions.
- **Cons**: MV3 service workers suspend after inactivity, so a long-lived WebSocket can be dropped unless we keep the worker alive (requires alarms/heartbeat); TLS quirks (self-signed certs) cannot be bypassed like the Python script does; reconnect logic must handle worker restarts.

## Option 2 – Offscreen document streaming
- **Pros**: Chrome’s `offscreen` document can host a DOM `WebSocket` that stays alive while hidden, letting us handle UI-friendly APIs and even reuse browser JS libs; background worker only coordinates messages/storage; can prompt user for permissions (optional audio) if ever needed.
- **Cons**: Still subject to Chrome policies (no ignoring invalid cert); adds new lifecycle management (create/destroy offscreen doc, message passing); slightly more complex than Option 1.

## Option 3 – Native companion bridge (Python script + native messaging)
- **Pros**: Reuses the provided `main.py` verbatim; Python can disable SSL checks (as README suggests) and handle reconnect reliability; Chrome extension receives processed data via native messaging/localhost HTTP without worrying about MV3 lifetime limits.
- **Cons**: Requires users to install/run a local binary/script plus register native messaging host; higher friction at hackathon; packaging/deployment overhead; cross-platform support becomes our burden.

## Recommendation
Go with **Option 2 (Offscreen document streaming)**. It keeps everything inside the extension while avoiding the MV3 service worker suspension issues that plague Option 1. It also lets us rely on the browser’s WebSocket implementation without forcing participants to install a separate Python process (Option 3). We will still need to manage TLS expectations (ensure the ngrok host presents a valid cert), but that constraint exists for any pure-extension solution. We can structure it so the background worker requests the offscreen doc when the extension starts, the offscreen page connects to the EEG endpoint, computes the engagement metric per sample (using the provided formula), and streams normalized focus scores back to the service worker, which continues to handle session bookkeeping and UI updates.
