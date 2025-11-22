const STREAM_STORAGE_KEY = 'neurableStreamUrl';
const DEFAULT_STREAM_URL = 'wss://stream2.mindfulmakers.xyz';
const RECONNECT_DELAY_MS = 5000;
const MIN_ENGAGEMENT = 0.5;
const MAX_ENGAGEMENT = 3.0;

let socket = null;
let reconnectTimer = null;
let currentUrl = DEFAULT_STREAM_URL;
let storageReady = false;

function initStorage() {
    return new Promise((resolve) => {
        if (storageReady) {
            resolve();
            return;
        }
        if (chrome && chrome.storage && chrome.storage.local) {
            storageReady = true;
            resolve();
            return;
        }
        const checkInterval = setInterval(() => {
            if (chrome && chrome.storage && chrome.storage.local) {
                clearInterval(checkInterval);
                storageReady = true;
                resolve();
            }
        }, 250);
        setTimeout(() => {
            if (!storageReady) {
                clearInterval(checkInterval);
                console.warn(
                    '[offscreen] chrome.storage.local unavailable after waiting; continuing without persistence'
                );
                resolve();
            }
        }, 5000);
    });
}

async function init() {
    await initStorage();
    currentUrl = await readStoredStreamUrl();
    connect();
    chrome.runtime.sendMessage({ type: 'eeg-offscreen-ready' });
}

function connect() {
    clearReconnect();
    if (socket) {
        socket.close();
        socket = null;
    }
    if (!currentUrl) {
        console.warn('[offscreen] No stream URL configured.');
        return;
    }
    try {
        socket = new WebSocket(currentUrl);
    } catch (err) {
        console.error('[offscreen] Failed to construct WebSocket', err);
        scheduleReconnect();
        return;
    }
    socket.addEventListener('open', handleOpen);
    socket.addEventListener('message', handleMessage);
    socket.addEventListener('error', handleError);
    socket.addEventListener('close', handleClose);
}

function handleOpen() {
    chrome.runtime.sendMessage({
        type: 'eeg-connection-status',
        status: 'connected',
        url: currentUrl,
    });
}

function handleMessage(event) {
    let payload;
    try {
        payload = JSON.parse(event.data);
    } catch (err) {
        console.warn('[offscreen] Failed to parse EEG payload', err);
        return;
    }
    const focusSample = buildFocusSample(payload);
    if (focusSample) {
        chrome.runtime.sendMessage({
            type: 'eeg-focus-sample',
            payload: focusSample,
        });
    }
}

function handleError(event) {
    console.warn('[offscreen] WebSocket error', event);
    chrome.runtime.sendMessage({ type: 'eeg-connection-status', status: 'error' });
}

function handleClose() {
    chrome.runtime.sendMessage({
        type: 'eeg-connection-status',
        status: 'disconnected',
    });
    scheduleReconnect();
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, RECONNECT_DELAY_MS);
}

function clearReconnect() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

function readStoredStreamUrl() {
    return new Promise((resolve) => {
        const storage = chrome && chrome.storage && chrome.storage.local;
        if (!storage) {
            resolve(DEFAULT_STREAM_URL);
            return;
        }
        storage.get([STREAM_STORAGE_KEY], (result) => {
            const stored = result ? result[STREAM_STORAGE_KEY] : undefined;
            resolve(typeof stored === 'string' && stored.length ? stored : DEFAULT_STREAM_URL);
        });
    });
}

function persistStreamUrl(url) {
    return new Promise((resolve, reject) => {
        const storage = chrome && chrome.storage && chrome.storage.local;
        if (!storage) {
            reject(new Error('chrome.storage.local unavailable'));
            return;
        }
        storage.set({ [STREAM_STORAGE_KEY]: url }, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve();
        });
    });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;
    if (message.type === 'set-neurable-stream-url') {
        if (typeof message.url === 'string' && message.url.startsWith('ws')) {
            currentUrl = message.url;
            persistStreamUrl(message.url).then(() => {
                connect();
                sendResponse({ ok: true });
            });
            return true;
        }
        sendResponse({ ok: false, error: 'Invalid URL' });
    }
});

function buildFocusSample(sample) {
    if (!sample) {
        return null;
    }
    const left = computeHemisphere(sample, 'Left');
    const right = computeHemisphere(sample, 'Right');
    const weightedEngagement = computeWeightedEngagement(left, right);
    if (weightedEngagement == null) {
        return null;
    }
    const normalized = normalizeEngagement(weightedEngagement);
    const timestamp = typeof sample.time === 'number' ? sample.time * 1000 : Date.now();
    const pBad = Math.max(
        safeNumber(sample['Left__p_bad']),
        safeNumber(sample['Right__p_bad'])
    );
    return {
        timestamp,
        leftEngagement: left.engagement,
        rightEngagement: right.engagement,
        weightedEngagement,
        focusScore:
            typeof normalized === 'number'
                ? Math.round(normalized * 100)
                : null,
        quality: 1 - clamp01(pBad),
        totalPower: left.totalPower + right.totalPower,
    };
}

function computeHemisphere(sample, prefix) {
    const alpha = safeNumber(sample[`${prefix}__alpha`]);
    const theta = safeNumber(sample[`${prefix}__theta`]);
    const beta = safeNumber(sample[`${prefix}__beta`]);
    const gamma = safeNumber(sample[`${prefix}__gamma`]);
    const totalPower = safeNumber(sample[`${prefix}__total_power`]);
    const denominator = alpha + theta;
    const engagement = denominator > 0 ? (beta + gamma) / denominator : null;
    return { engagement, totalPower };
}

function computeWeightedEngagement(left, right) {
    const leftEng = left.engagement;
    const rightEng = right.engagement;
    if (leftEng == null && rightEng == null) {
        return null;
    }
    const totalPower = left.totalPower + right.totalPower;
    if (totalPower <= 0) {
        if (leftEng != null) return leftEng;
        if (rightEng != null) return rightEng;
        return null;
    }
    const leftWeight = left.totalPower / totalPower;
    const rightWeight = right.totalPower / totalPower;
    if (leftEng != null && rightEng != null) {
        return leftWeight * leftEng + rightWeight * rightEng;
    }
    if (leftEng != null) {
        return leftEng;
    }
    return rightEng;
}

function normalizeEngagement(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return null;
    }
    const clamped = Math.min(Math.max(value, MIN_ENGAGEMENT), MAX_ENGAGEMENT);
    return (clamped - MIN_ENGAGEMENT) / (MAX_ENGAGEMENT - MIN_ENGAGEMENT);
}

function safeNumber(value) {
    return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
}

function clamp01(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return 0;
    }
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

init();
