let liveCard;
let liveScoreEl;
let liveStatusEl;
let liveTrendEl;
let liveUrlEl;
let liveUpdatedEl;

document.addEventListener('DOMContentLoaded', () => {
    liveCard = document.getElementById('live-session');
    liveScoreEl = document.getElementById('live-score');
    liveStatusEl = document.getElementById('live-status');
    liveTrendEl = document.getElementById('live-trend');
    liveUrlEl = document.getElementById('live-url');
    liveUpdatedEl = document.getElementById('live-updated');
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
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (!message) return;
        if (message.type === 'focus-update') {
            updateLiveCard(message.payload);
        } else if (message.type === 'focus-stop') {
            hideLiveCard();
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

function loadStats() {
    chrome.storage.local.get(['sessions'], (result) => {
        const sessions = result.sessions || [];
        const container = document.getElementById('stats-container');
        const recentList = document.getElementById('recent-list');
        container.innerHTML = '';
        recentList.innerHTML = '';

        if (sessions.length === 0) {
            container.innerHTML =
                '<div class="empty-state">No browsing data yet. Start browsing!</div>';
            recentList.innerHTML =
                '<li class="recent-item"><span class="recent-host">—</span><span class="recent-meta">No history yet</span></li>';
            return;
        }

        // Aggregate data by hostname
        const siteStats = {};

        sessions.forEach((session) => {
            const host = session.hostname;
            if (!siteStats[host]) {
                siteStats[host] = {
                    hostname: host,
                    totalDuration: 0,
                    totalScore: 0,
                    visits: 0,
                };
            }
            siteStats[host].totalDuration += session.duration;
            siteStats[host].totalScore += session.focusScore;
            siteStats[host].visits += 1;
        });

        // Convert to array and sort by average focus score (descending)
        const sortedStats = Object.values(siteStats)
            .map((stat) => {
                return {
                    ...stat,
                    avgScore: Math.round(stat.totalScore / stat.visits),
                };
            })
            .sort((a, b) => b.avgScore - a.avgScore);

        // Render
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

        const recentSessions = sessions.slice(-7).reverse();
        recentSessions.forEach((session) => {
            const li = document.createElement('li');
            li.className = 'recent-item';
            li.innerHTML = `
                <span class="recent-host" title="${session.hostname}">${
                session.hostname
            }</span>
                <span class="recent-meta">${formatTimestamp(
                    session.endTime
                )} · ${Math.round(session.focusScore)} pts</span>
            `;
            recentList.appendChild(li);
        });
    });
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
