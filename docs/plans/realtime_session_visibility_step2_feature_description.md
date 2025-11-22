# Real-time Session Visibility — Step 2 Feature Description

## Problem
The popup’s session list only refreshes after a browsing session ends (e.g., when the user switches tabs). While staying on the same tab, no sessions appear, making it impossible to review current progress or verify that tracking works.

## User Stories
- As a focused browser user, I want to see my current session counted in the stats without leaving the tab so that I can make sure tracking is happening.
- As a user monitoring recent sessions, I want the “Recent sessions” list populated with the session I am currently in so that my browsing history looks continuous.
- As someone evaluating site-level focus averages, I want the aggregated stats to reflect the active session’s data so I don’t have to juggle tabs to refresh.

## Core Requirements
- Detect the active session’s hostname, duration, and focus stats without ending it.
- Blend the active session into both the aggregated stats cards and the recent sessions list shown in the popup.
- Ensure the popup refreshes immediately when opened and keeps updating while the session is active.
- Preserve existing behavior for historical sessions stored in `chrome.storage.local`.

## User Flow
1. User opens the popup while browsing an active tab.
2. Popup requests current focus session data plus stored sessions.
3. Popup immediately displays the live session in stats/recent lists alongside stored history.
4. As focus samples stream in, the live session entry updates automatically.
5. When the user switches tabs (session ends), the entry seamlessly transitions to the stored-session list.

## Success Criteria
- Opening the popup on an active tab shows at least one session (the current one) without requiring a tab change.
- Aggregated metrics change in real time while staying on the same tab.
- No regression in how ended sessions are persisted or displayed.
- Behavior verified manually by keeping a tab active and observing popup updates.
