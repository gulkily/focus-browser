const SESSION_MIN_DURATION_MS = 1000;
const MAX_STORED_SESSIONS = 500;
const MAX_STREAM_SAMPLES = 60;
const FALLBACK_FOCUS_SCORE = 50;

let currentTabId = null;
let currentUrl = null;
let currentHostname = null;
let startTime = null;
let focusSamples = [];
let latestFocusScore = null;
let eegConnectionStatus = 'idle';

function bootstrapSessionTracking() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            startSession(tabs[0]);
        }
    });
    ensureOffscreenDocument();
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

async function ensureOffscreenDocument() {
    if (!chrome.offscreen) {
        return;
    }
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) {
        return;
    }
    await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.DOM_PARSER],
        justification: 'Maintain persistent Neurable EEG stream connection.',
    });
}

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

function safeSetBadgeText(tabId, text) {
    if (!tabId) return;
    chrome.action.setBadgeText({ text, tabId }, () => {
        if (chrome.runtime.lastError) {
            console.debug(
                'Badge text update skipped:',
                chrome.runtime.lastError.message
            );
        }
    });
}

function safeSetBadgeColor(tabId, color) {
    if (!tabId) return;
    chrome.action.setBadgeBackgroundColor({ color, tabId }, () => {
        if (chrome.runtime.lastError) {
            console.debug(
                'Badge color update skipped:',
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

function handleFocusSample(sample) {
    if (!sample) {
        return;
    }
    const normalizedScore = clampFocusScore(sample.focusScore);
    if (normalizedScore == null) {
        return;
    }
    latestFocusScore = normalizedScore;
    if (!currentTabId || !startTime) {
        return;
    }
    const entry = {
        timestamp:
            typeof sample.timestamp === 'number' && !Number.isNaN(sample.timestamp)
                ? sample.timestamp
                : Date.now(),
        focusScore: normalizedScore,
        weightedEngagement:
            typeof sample.weightedEngagement === 'number'
                ? sample.weightedEngagement
                : null,
        quality:
            typeof sample.quality === 'number' ? sample.quality : null,
    };
    focusSamples.push(entry);
    if (focusSamples.length > MAX_STREAM_SAMPLES) {
        focusSamples.shift();
    }
    safeSetBadgeColor(currentTabId, '#4a90e2');
    safeSetBadgeText(currentTabId, normalizedScore.toString().padStart(2, '0'));
    broadcastFocusUpdate(currentTabId);
}

function clampFocusScore(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return null;
    }
    if (value < 0) value = 0;
    if (value > 100) value = 100;
    return Math.round(value);
}

function startFocusStream(tabId) {
    stopFocusStream();
    focusSamples = [];
    latestFocusScore = null;
    if (tabId) {
        safeSetBadgeColor(tabId, '#4a90e2');
        safeSetBadgeText(tabId, '');
    }
}

function stopFocusStream() {
    if (currentTabId) {
        safeSetBadgeText(currentTabId, '');
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
                : typeof latestFocusScore === 'number'
                ? latestFocusScore
                : FALLBACK_FOCUS_SCORE;

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
    if (!message) {
        return;
    }
    if (message.type === 'get-current-focus') {
        sendResponse({
            currentUrl,
            currentTabId,
            samples: focusSamples,
            latestFocusScore,
            liveSession: getLiveSessionSnapshot(),
            eegStatus: eegConnectionStatus,
        });
        return;
    }
    if (message.type === 'eeg-connection-status') {
        eegConnectionStatus = message.status || 'unknown';
        console.log('EEG stream status:', eegConnectionStatus, message.url || '');
        return;
    }
    if (message.type === 'eeg-focus-sample') {
        handleFocusSample(message.payload || null);
        return;
    }
});
