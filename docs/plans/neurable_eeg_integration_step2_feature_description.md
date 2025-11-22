# Neurable EEG Integration — Step 2 Feature Description

## Problem
The extension currently fakes focus scores using `Math.random()`, so users must switch tabs to even see simulated sessions. We now have access to Neurable’s realtime EEG stream (`neurable-eeg-stream/` repo) plus a proposed engagement metric, and we need to integrate that data directly into the extension so focus scores reflect live headset readings.

## User Stories
- As a user wearing a Neurable headset, I want the extension to connect to the provided EEG websocket and compute a focus level that matches my brain activity so that the overlay/popup reflect reality.
- As a user monitoring my focus, I want the extension to keep streaming and updating scores even if I never switch tabs, enabling continuous feedback.
- As a tester, I want the setup to require only the extension (no extra terminals/scripts) so I can demo quickly at the event.

## Core Requirements
- Establish a secure WebSocket connection to the Neurable stream endpoint from inside the extension and keep it alive.
- Parse each EEG sample, compute the engagement/focus metric per the provided `(beta+gamma)/(alpha+theta)` hemisphere-weighted formula, and expose a normalized focus score (0–100) to the rest of the extension.
- Propagate those real scores through the existing session pipeline (background, overlay, popup) without breaking storage or UI expectations.
- Handle disconnects/reconnects gracefully without manual refresh.

## User Flow
1. User installs/opens the extension with the Neurable headset running the stream.
2. Background service worker spins up an offscreen document responsible for maintaining the WebSocket connection.
3. Offscreen document receives EEG samples, computes focus measures, and posts them to the service worker.
4. Service worker uses those samples to update live overlays, popup, and persisted session records exactly like the previous mock data flow.
5. If the stream drops, the offscreen document retries and the UI indicates loss of data until recovery.

## Success Criteria
- With the headset streaming, the overlay/popup show live-changing scores that match the computed engagement metric.
- No auxiliary Python script is needed during normal operation; everything runs via the extension.
- On disconnect, the system retries automatically, and UI gracefully indicates no data rather than hanging.
- Manual verification: observe live EEG data driving the overlay/popup in Chrome for at least several minutes without switching tabs.
