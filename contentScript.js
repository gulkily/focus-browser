(() => {
    if (window.top !== window) {
        return; // avoid injecting into iframes
    }
    if (window.__focusOverlayInjected) {
        return;
    }
    window.__focusOverlayInjected = true;

    const style = document.createElement('style');
    style.textContent = `
        #focus-browser-overlay {
            position: fixed;
            top: 14px;
            right: 14px;
            width: 180px;
            padding: 12px;
            background: rgba(15, 15, 35, 0.9);
            color: #fff;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 12px;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
            z-index: 2147483647;
            opacity: 0;
            transform: translateY(-8px);
            transition: opacity 0.2s ease, transform 0.2s ease;
            pointer-events: none;
        }
        #focus-browser-overlay.visible {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
        }
        #focus-browser-overlay header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            opacity: 0.8;
        }
        #focus-browser-overlay .current-score {
            font-size: 32px;
            font-weight: 700;
            margin-top: 8px;
        }
        #focus-browser-overlay .trend {
            display: flex;
            align-items: flex-end;
            gap: 4px;
            height: 40px;
            margin-top: 8px;
        }
        #focus-browser-overlay .trend-bar {
            flex: 1;
            min-width: 6px;
            background: linear-gradient(180deg, #7bdcb5 0%, #3b82f6 100%);
            border-radius: 3px 3px 0 0;
            opacity: 0.85;
        }
        #focus-browser-overlay .trend-bar.low {
            background: linear-gradient(180deg, #f87171 0%, #f97316 100%);
        }
        #focus-browser-overlay .meta {
            margin-top: 6px;
            font-size: 11px;
            display: flex;
            justify-content: space-between;
            opacity: 0.8;
        }
    `;
    document.documentElement.appendChild(style);

    const overlay = document.createElement('section');
    overlay.id = 'focus-browser-overlay';
    overlay.innerHTML = `
        <header>
            <span>Focus stream</span>
            <span id="focus-browser-status">…</span>
        </header>
        <div class="current-score" id="focus-browser-score">--</div>
        <div class="trend" id="focus-browser-trend"></div>
        <div class="meta">
            <span id="focus-browser-average">avg --</span>
            <span id="focus-browser-last-updated">--</span>
        </div>
    `;
    document.documentElement.appendChild(overlay);

    const scoreEl = overlay.querySelector('#focus-browser-score');
    const trendEl = overlay.querySelector('#focus-browser-trend');
    const avgEl = overlay.querySelector('#focus-browser-average');
    const statusEl = overlay.querySelector('#focus-browser-status');
    const updatedEl = overlay.querySelector('#focus-browser-last-updated');

    function setVisible(visible) {
        overlay.classList.toggle('visible', visible);
    }

    function formatTime(ts) {
        if (!ts) return '--';
        const date = new Date(ts);
        if (Number.isNaN(date.getTime())) return '--';
        return date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    }

    function updateOverlay(payload) {
        if (!payload || !payload.latest) {
            setVisible(false);
            return;
        }
        const { latest, samples } = payload;
        const recentSamples = samples.slice(-10);
        scoreEl.textContent = latest.focusScore.toString().padStart(2, '0');
        statusEl.textContent =
            latest.focusScore >= 60
                ? 'in the zone'
                : latest.focusScore >= 35
                ? 'neutral'
                : 'distracted';
        avgEl.textContent = `avg ${Math.round(
            recentSamples.reduce((sum, s) => sum + s.focusScore, 0) /
                (recentSamples.length || 1)
        )}`;
        updatedEl.textContent = formatTime(latest.timestamp);

        trendEl.innerHTML = '';
        recentSamples.forEach((sample) => {
            const bar = document.createElement('span');
            bar.className =
                'trend-bar' + (sample.focusScore < 40 ? ' low' : '');
            bar.style.height = `${Math.max(
                6,
                Math.round((sample.focusScore / 100) * 40)
            )}px`;
            trendEl.appendChild(bar);
        });

        setVisible(true);
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (!message) return;
        if (message.type === 'focus-update') {
            updateOverlay(message.payload);
        } else if (message.type === 'focus-stop') {
            setVisible(false);
        }
    });

    chrome.runtime.sendMessage({ type: 'get-current-focus' }, (response) => {
        if (chrome.runtime.lastError) {
            return;
        }
        if (response && response.samples && response.samples.length) {
            updateOverlay({
                latest: response.samples[response.samples.length - 1],
                samples: response.samples,
            });
        }
    });
})();
