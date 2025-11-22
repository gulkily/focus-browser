// Mock Neurable API interaction
// In a real app, this would connect to the Neurable SDK or API
function getNeurableFocusScore() {
    // Returns a random focus score between 0 and 100
    return Math.floor(Math.random() * 100);
}

const SESSION_MIN_DURATION_MS = 1000;
const MAX_STORED_SESSIONS = 500;
const FOCUS_SAMPLE_INTERVAL_MS = 5000;
const MAX_STREAM_SAMPLES = 60;

let currentTabId = null;
let currentUrl = null;
let currentHostname = null;
let startTime = null;
let focusSampleTimer = null;
let focusSamples = [];
let latestFocusScore = null;

function bootstrapSessionTracking() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            startSession(tabs[0]);
        }
    });
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['sessions'], (result) => {
        if (!Array.isArray(result.sessions)) {
            chrome.storage.local.set({ sessions: [] });
        }
    });
    bootstrapSessionTracking();
});

chrome.runtime.onStartup.addListener(() => {
    bootstrapSessionTracking();
});

// Kick things off when the service worker loads
bootstrapSessionTracking();

function getHostname(url) {
    try {
        const u = new URL(url);
        return u.hostname;
    } catch (e) {
        return null;
    }
}

function sendMessageToTab(tabId, message) {
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, message, () => {
        // Swallow errors when a tab has no listener (e.g., chrome:// pages)
        if (chrome.runtime.lastError) {
            console.debug(
                'Focus overlay message skipped:',
                chrome.runtime.lastError.message
            );
        }
    });
}

function getLiveSessionSnapshot() {
    if (!currentUrl || !startTime) {
        return null;
    }
    const hostname = currentHostname || getHostname(currentUrl);
    if (!hostname) {
        return null;
    }
    const now = Date.now();
    const durationMs = now - startTime;
    const averageScore =
        focusSamples.length > 0
            ? Math.round(
                  focusSamples.reduce(
                      (sum, sample) => sum + sample.focusScore,
                      0
                  ) / focusSamples.length
              )
            : latestFocusScore;

    return {
        hostname,
        url: currentUrl,
        startTime,
        endTime: now,
        duration: durationMs / 1000,
        focusScore:
            typeof averageScore === 'number' && !Number.isNaN(averageScore)
                ? averageScore
                : null,
        focusSamples: focusSamples.slice(),
        isLive: true,
    };
}

function broadcastFocusUpdate(tabId) {
    sendMessageToTab(tabId, {
        type: 'focus-update',
        payload: {
            latest: focusSamples[focusSamples.length - 1] || null,
            samples: focusSamples,
            url: currentUrl,
            hostname: currentHostname || (currentUrl ? getHostname(currentUrl) : null),
            session: getLiveSessionSnapshot(),
        },
    });
}

function emitFocusSample(tabId) {
    if (!tabId) return;
    const focusScore = getNeurableFocusScore();
    latestFocusScore = focusScore;
    const sample = { timestamp: Date.now(), focusScore };
    focusSamples.push(sample);
    if (focusSamples.length > MAX_STREAM_SAMPLES) {
        focusSamples.shift();
    }
    chrome.action.setBadgeBackgroundColor({ color: '#4a90e2', tabId });
    chrome.action.setBadgeText({ text: `${focusScore}`, tabId });
    broadcastFocusUpdate(tabId);
}

function startFocusStream(tabId) {
    stopFocusStream();
    focusSamples = [];
    emitFocusSample(tabId);
    focusSampleTimer = setInterval(
        () => emitFocusSample(tabId),
        FOCUS_SAMPLE_INTERVAL_MS
    );
}

function stopFocusStream() {
    if (focusSampleTimer) {
        clearInterval(focusSampleTimer);
        focusSampleTimer = null;
    }
    if (currentTabId) {
        chrome.action.setBadgeText({ text: '', tabId: currentTabId });
        sendMessageToTab(currentTabId, { type: 'focus-stop' });
    }
    focusSamples = [];
    latestFocusScore = null;
}

function recordSession(sessionData) {
    chrome.storage.local.get(['sessions'], (result) => {
        const sessions = Array.isArray(result.sessions) ? result.sessions : [];
        sessions.push(sessionData);
        if (sessions.length > MAX_STORED_SESSIONS) {
            sessions.splice(0, sessions.length - MAX_STORED_SESSIONS);
        }
        chrome.storage.local.set({ sessions });
    });
}

function endSession() {
    if (currentUrl && startTime) {
        const endTime = Date.now();
        const durationMs = endTime - startTime;
        const hostname = currentHostname || getHostname(currentUrl);

        if (hostname && durationMs >= SESSION_MIN_DURATION_MS) {
            const focusScore = focusSamples.length
                ? Math.round(
                      focusSamples.reduce(
                          (sum, sample) => sum + sample.focusScore,
                          0
                      ) / focusSamples.length
                  )
                : getNeurableFocusScore();

            const sessionData = {
                hostname,
                url: currentUrl,
                startTime,
                endTime,
                duration: durationMs / 1000,
                focusScore,
                focusSamples: focusSamples.slice(),
            };

            console.log('Ending session:', sessionData);
            recordSession(sessionData);
        }
    }
    stopFocusStream();
    currentUrl = null;
    startTime = null;
    currentTabId = null;
    currentHostname = null;
}

function startSession(tab) {
    if (tab && tab.id && tab.url && !tab.url.startsWith('chrome://')) {
        if (currentUrl && tab.url === currentUrl) {
            return; // already tracking this URL
        }
        endSession();
        currentTabId = tab.id;
        currentUrl = tab.url;
        currentHostname = getHostname(tab.url);
        startTime = Date.now();
        console.log('Starting session for:', currentUrl);
        startFocusStream(currentTabId);
    }
}

// Listen for tab switches
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        startSession(tab);
    });
});

// Listen for URL updates in the current tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const urlChanged = typeof changeInfo.url === 'string';
    const pageLoaded = changeInfo.status === 'complete';
    if (tabId === currentTabId && (urlChanged || pageLoaded)) {
        startSession(tab);
    }
});

// Handle tab closures
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === currentTabId) {
        endSession();
    }
});

// Listen for window focus changes (optional, but good for accuracy)
chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        endSession();
    } else {
        chrome.tabs.query({ active: true, windowId }, (tabs) => {
            if (tabs.length > 0) {
                startSession(tabs[0]);
            }
        });
    }
});

chrome.runtime.onSuspend.addListener(() => {
    endSession();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'get-current-focus') {
        sendResponse({
            currentUrl,
            currentTabId,
            samples: focusSamples,
            latestFocusScore,
            liveSession: getLiveSessionSnapshot(),
        });
    }
});
