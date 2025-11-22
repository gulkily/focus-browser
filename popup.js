let liveCard;
let liveScoreEl;
let liveStatusEl;
let liveTrendEl;
let liveUrlEl;
let liveUpdatedEl;
let streamStatusEl;
let streamUrlEl;
let storedSessions = [];
let liveSessionEntry = null;

document.addEventListener('DOMContentLoaded', () => {
    liveCard = document.getElementById('live-session');
    liveScoreEl = document.getElementById('live-score');
    liveStatusEl = document.getElementById('live-status');
    liveTrendEl = document.getElementById('live-trend');
    liveUrlEl = document.getElementById('live-url');
    liveUpdatedEl = document.getElementById('live-updated');
    streamStatusEl = document.getElementById('stream-status');
    streamUrlEl = document.getElementById('stream-url');
    initLiveSession();
    loadStats();
    document.getElementById('clear-btn').addEventListener('click', clearData);
});

function initLiveSession() {
    chrome.runtime.sendMessage({ type: 'get-current-focus' }, (response) => {
        if (chrome.runtime.lastError) {
            return;
        }
        updateLiveCard(response);
        updateConnectionStatus(response && response.eegStatus, response && response.eegUrl);
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (!message) return;
        if (message.type === 'focus-update') {
            updateLiveCard(message.payload);
            liveSessionEntry = normalizeLiveSession(
                message.payload ? message.payload.session : null
            );
            renderStats();
        } else if (message.type === 'focus-stop') {
            hideLiveCard();
            liveSessionEntry = null;
            loadStats();
        } else if (
            message.type === 'eeg-connection-status-update' ||
            message.type === 'eeg-connection-status'
        ) {
            updateConnectionStatus(message.status, message.url);
        }
    });
}

function updateLiveCard(data) {
    if (!liveCard) return;
    if (!data || !data.samples || !data.samples.length) {
        hideLiveCard();
        return;
    }
    const latest = data.latest || data.samples[data.samples.length - 1];
    liveCard.hidden = false;
    liveScoreEl.textContent = latest.focusScore.toString().padStart(2, '0');
    liveStatusEl.textContent =
        latest.focusScore >= 60
            ? 'On fire'
            : latest.focusScore >= 35
            ? 'Steady'
            : 'Unfocused';
    liveUrlEl.textContent = truncateUrl(data.url || '');
    liveUpdatedEl.textContent = formatTimestamp(latest.timestamp);

    const recent = data.samples.slice(-12);
    liveTrendEl.innerHTML = '';
    recent.forEach((sample) => {
        const bar = document.createElement('span');
        bar.style.height = `${Math.max(
            6,
            Math.round((sample.focusScore / 100) * 32)
        )}px`;
        bar.style.background = sample.focusScore >= 40 ? '#a5b4fc' : '#fca5a5';
        liveTrendEl.appendChild(bar);
    });
}

function hideLiveCard() {
    if (liveCard) {
        liveCard.hidden = true;
    }
}

async function loadStats() {
    const [sessions, focusState] = await Promise.all([
        fetchStoredSessions(),
        fetchFocusState(),
    ]);
    storedSessions = sessions;
    liveSessionEntry = normalizeLiveSession(focusState.liveSession);
    updateConnectionStatus(focusState.eegStatus, focusState.eegUrl);
    renderStats();
}

function fetchStoredSessions() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['sessions'], (result) => {
            resolve(result.sessions || []);
        });
    });
}

function fetchFocusState() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'get-current-focus' }, (response) => {
            if (chrome.runtime.lastError) {
                resolve({});
                return;
            }
            resolve(response || {});
        });
    });
}

function normalizeLiveSession(snapshot) {
    if (!snapshot || !snapshot.hostname) {
        return null;
    }
    const avgFromSamples = snapshot.focusSamples && snapshot.focusSamples.length
        ? Math.round(
              snapshot.focusSamples.reduce(
                  (sum, sample) => sum + sample.focusScore,
                  0
              ) / snapshot.focusSamples.length
          )
        : null;
    const focusScore =
        typeof snapshot.focusScore === 'number'
            ? snapshot.focusScore
            : avgFromSamples;
    return {
        ...snapshot,
        focusScore:
            typeof focusScore === 'number' && !Number.isNaN(focusScore)
                ? focusScore
                : 0,
        endTime: snapshot.endTime || Date.now(),
        isLive: true,
    };
}

function getCombinedSessions() {
    const combined = storedSessions.slice();
    if (liveSessionEntry) {
        combined.push(liveSessionEntry);
    }
    return combined;
}

function renderStats() {
    const container = document.getElementById('stats-container');
    const recentList = document.getElementById('recent-list');
    if (!container || !recentList) {
        return;
    }
    container.innerHTML = '';
    recentList.innerHTML = '';

    const combinedSessions = getCombinedSessions();
    if (combinedSessions.length === 0) {
        container.innerHTML =
            '<div class="empty-state">No browsing data yet. Start browsing!</div>';
        recentList.innerHTML =
            '<li class="recent-item"><span class="recent-host">—</span><span class="recent-meta">No history yet</span></li>';
        return;
    }

    const siteStats = {};
    combinedSessions.forEach((session) => {
        const host = session.hostname;
        if (!host) {
            return;
        }
        if (!siteStats[host]) {
            siteStats[host] = {
                hostname: host,
                totalDuration: 0,
                totalScore: 0,
                visits: 0,
            };
        }
        const duration = typeof session.duration === 'number' ? session.duration : 0;
        const score =
            typeof session.focusScore === 'number' && !Number.isNaN(session.focusScore)
                ? session.focusScore
                : 0;
        siteStats[host].totalDuration += duration;
        siteStats[host].totalScore += score;
        siteStats[host].visits += 1;
    });

    const sortedStats = Object.values(siteStats)
        .map((stat) => ({
            ...stat,
            avgScore: stat.visits ? Math.round(stat.totalScore / stat.visits) : 0,
        }))
        .sort((a, b) => b.avgScore - a.avgScore);

    sortedStats.forEach((stat) => {
        const card = document.createElement('div');
        card.className = 'stat-card';

        let scoreClass = 'score-low';
        let barColor = '#e74c3c';
        if (stat.avgScore >= 70) {
            scoreClass = 'score-high';
            barColor = '#2ecc71';
        } else if (stat.avgScore >= 40) {
            scoreClass = 'score-med';
            barColor = '#f39c12';
        }

        const durationStr = formatDuration(stat.totalDuration);

        card.innerHTML = `
                <div class="site-header">
                    <div class="hostname" title="${stat.hostname}">${stat.hostname}</div>
                    <div class="score ${scoreClass}">${stat.avgScore} Focus</div>
                </div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: ${stat.avgScore}%; background-color: ${barColor};"></div>
                </div>
                <div class="meta">
                    <span>${stat.visits} visits</span>
                    <span>${durationStr}</span>
                </div>
            `;
        container.appendChild(card);
    });

    const recentSessions = combinedSessions.slice(-7).reverse();
    recentSessions.forEach((session) => {
        const li = document.createElement('li');
        li.className = 'recent-item' + (session.isLive ? ' recent-item-live' : '');
        const timestampLabel = session.isLive
            ? 'Live now'
            : formatTimestamp(session.endTime);
        const scoreLabel = Math.round(
            typeof session.focusScore === 'number' ? session.focusScore : 0
        );
        const liveBadge = session.isLive
            ? '<span class="live-pill">Live</span>'
            : '';
        li.innerHTML = `
                <span class="recent-host" title="${session.hostname}">${
                session.hostname
            } ${liveBadge}</span>
                <span class="recent-meta">${timestampLabel} · ${scoreLabel} pts</span>
            `;
        recentList.appendChild(li);
    });
}

function updateConnectionStatus(status, url) {
    if (!streamStatusEl || !streamUrlEl) {
        return;
    }
    const normalized = typeof status === 'string' ? status.toLowerCase() : 'unknown';
    let label = 'Stream: unknown';
    let classSuffix = 'idle';
    switch (normalized) {
        case 'connected':
            label = 'Stream: Live EEG data';
            classSuffix = 'connected';
            break;
        case 'error':
            label = 'Stream: Error';
            classSuffix = 'error';
            break;
        case 'disconnected':
            label = 'Stream: Disconnected';
            classSuffix = 'disconnected';
            break;
        case 'idle':
        case 'connecting':
            label = 'Stream: Connecting…';
            classSuffix = 'idle';
            break;
        default:
            label = `Stream: ${normalized}`;
            classSuffix = 'idle';
            break;
    }
    streamStatusEl.textContent = label;
    streamStatusEl.className = `status-pill status-${classSuffix}`;
    const displayUrl =
        typeof url === 'string' && url.length
            ? url.replace(/^(wss?:\/\/)/i, '')
            : 'not set';
    streamUrlEl.textContent = `URL: ${displayUrl}`;
}

function formatDuration(seconds) {
    if (seconds < 60) return Math.round(seconds) + 's';
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return mins + 'm';
    const hrs = Math.floor(mins / 60);
    return hrs + 'h ' + (mins % 60) + 'm';
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function clearData() {
    chrome.storage.local.set({ sessions: [] }, () => {
        loadStats();
    });
}

function truncateUrl(url) {
    if (!url) return '--';
    try {
        const u = new URL(url);
        return u.hostname;
    } catch (e) {
        return url.slice(0, 24) + (url.length > 24 ? '…' : '');
    }
}
