/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  MOHXN VIP — STRONG PATTERN ENGINE v7.0                         ║
 * ║  Big-Small / Small-Big Pattern Detection + Cycle-of-5 Sequence  ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// ==================== STATE ====================

let activeTimeframe = '1m';
let monitorInterval = null;
let isMonitoring = false;
let lastPrediction = null;
let lastSeenPeriod = null;
let lastAlertedPeriod = null;
let keepAliveAudio = null;

// Local session tracking
let session = JSON.parse(localStorage.getItem('mohxn_session') || '{"wins":0,"losses":0,"streak":0,"streakType":"","feed":[]}');
let stratState = JSON.parse(localStorage.getItem('mohxn_strat') || '{"pattern":null,"start":0}');

// ==================== DOM REFS ====================

const ui = {
    statusBadge: document.getElementById('statusBadge'),
    statusDot: document.getElementById('statusDot'),
    statusLabel: document.getElementById('statusLabel'),
    oracleTargetPeriod: document.getElementById('oracleTargetPeriod'),
    oracleActivePattern: document.getElementById('oracleActivePattern'),
    oracleCycleRound: document.getElementById('oracleCycleRound'),
    oracleSignal: document.getElementById('oracleSignal'),
    oracleTrapType: document.getElementById('oracleTrapType'),
    oracleSentiment: document.getElementById('oracleSentiment'),
    oracleStatusBadge: document.getElementById('oracleStatusBadge'),
    oracleDetectionRange: document.getElementById('oracleDetectionRange'),
    oracleConfidence: document.getElementById('oracleConfidence'),
    priorityValue: document.getElementById('priorityValue'),
    priorityBarFill: document.getElementById('priorityBarFill'),
    statWins: document.getElementById('statWins'),
    statLosses: document.getElementById('statLosses'),
    statWinRate: document.getElementById('statWinRate'),
    statStreak: document.getElementById('statStreak'),
    trackerFeed: document.getElementById('trackerFeed'),
    resetTrackerBtn: document.getElementById('resetTrackerBtn'),
    historyGrid: document.getElementById('historyGrid'),
    monitorBtn: document.getElementById('monitorBtn'),
    oracleCard: document.getElementById('oracleCard'),
    jwtTokenInput: document.getElementById('jwtTokenInput'),
    setTokenBtn: document.getElementById('setTokenBtn'),
    tgChatIdInput: document.getElementById('tgChatIdInput'),
    tgTokenInput: document.getElementById('tgTokenInput'),
    setTgBtn: document.getElementById('setTgBtn'),
    monitorStatusRow: document.getElementById('monitorStatusRow'),
    notifyToggleBtn: document.getElementById('notifyToggleBtn')
};

// ==================== TOKEN AUTH ====================

let jalwaToken = localStorage.getItem('mohxn_token') || '';
ui.jwtTokenInput.value = jalwaToken;

if (jalwaToken) {
    ui.monitorStatusRow.style.display = 'flex';
}

ui.setTokenBtn.addEventListener('click', () => {
    jalwaToken = ui.jwtTokenInput.value.trim();
    localStorage.setItem('mohxn_token', jalwaToken);
    if (jalwaToken) {
        ui.monitorStatusRow.style.display = 'flex';
        ui.setTokenBtn.innerText = "SAVED";
        setTimeout(() => ui.setTokenBtn.innerText = "SET", 2000);
        // Auto-start monitoring if not already running
        if (!isMonitoring) toggleMonitoring();
    } else {
        ui.monitorStatusRow.style.display = 'none';
        if (isMonitoring) toggleMonitoring();
    }
});

let tgChatId = localStorage.getItem('mohxn_tg_chat') || '';
let tgToken = localStorage.getItem('mohxn_tg_token') || '';
if (ui.tgChatIdInput) ui.tgChatIdInput.value = tgChatId;
if (ui.tgTokenInput) ui.tgTokenInput.value = tgToken;

if (ui.setTgBtn) {
    ui.setTgBtn.addEventListener('click', () => {
        tgChatId = ui.tgChatIdInput.value.trim();
        tgToken = ui.tgTokenInput.value.trim();
        localStorage.setItem('mohxn_tg_chat', tgChatId);
        localStorage.setItem('mohxn_tg_token', tgToken);
        ui.setTgBtn.innerText = "SAVED";
        setTimeout(() => ui.setTgBtn.innerText = "SET", 2000);
    });
}

// ==================== NOTIFICATION TOGGLE ====================

let notificationsEnabled = localStorage.getItem('mohxn_notify') === 'true';

function updateNotifyBtn() {
    if (notificationsEnabled && Notification.permission === 'granted') {
        ui.notifyToggleBtn.textContent = '🔔 NOTIFICATIONS ON';
        ui.notifyToggleBtn.classList.add('enabled');
    } else {
        ui.notifyToggleBtn.textContent = '🔕 ENABLE NOTIFICATIONS';
        ui.notifyToggleBtn.classList.remove('enabled');
    }
}

ui.notifyToggleBtn.addEventListener('click', async () => {
    if (!('Notification' in window)) {
        alert('Notifications are not supported in this browser.');
        return;
    }
    if (Notification.permission === 'granted') {
        // Toggle on/off
        notificationsEnabled = !notificationsEnabled;
        localStorage.setItem('mohxn_notify', notificationsEnabled);
        updateNotifyBtn();
        if (notificationsEnabled) {
            sendServiceWorkerNotification('🔔 MOHXN VIP', { body: 'Prediction alerts are now ON', icon: '/logo.png' });
        }
    } else if (Notification.permission === 'denied') {
        alert('Notifications are blocked. Please enable them in your browser settings.');
    } else {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
            notificationsEnabled = true;
            localStorage.setItem('mohxn_notify', 'true');
            updateNotifyBtn();
            sendServiceWorkerNotification('🔔 MOHXN VIP', { body: 'Prediction alerts are now ON', icon: '/logo.png' });
        }
    }
});

// SERVICE WORKER REGISTRATION (Essential for Mobile/Desktop Push)
if ('serviceWorker' in navigator && 'Notification' in window) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('Service Worker registered with scope: ', reg.scope);
        }).catch(err => {
            console.warn('Service Worker registration failed: ', err);
        });
    });
}

function sendServiceWorkerNotification(title, options) {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, options);
        }).catch(err => {
            // Fallback to standard if SW fails
            new Notification(title, options);
        });
    } else {
        new Notification(title, options);
    }
}

if ('Notification' in window) updateNotifyBtn();

// ==================== FETCH & PREDICT ====================

const TF_MAPPING = { '30s': 30, '1m': 1, '3m': 2, '5m': 3 };

function getApiSignature(params) {
    const excl = ['signature', 'track', 'xosoBettingData', 'timestamp'];
    const filtered = {};
    Object.keys(params).sort().forEach(k => {
        if (!excl.includes(k) && params[k] !== null && params[k] !== '') {
            filtered[k] = params[k];
        }
    });
    // Ensure no spaces in JSON string for signature match
    return CryptoJS.MD5(JSON.stringify(filtered)).toString().toUpperCase();
}

function generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function fetchMonitorData() {
    if (!jalwaToken) return;

    try {
        const typeId = TF_MAPPING[activeTimeframe] || 1;
        const payload = {
            "typeId": typeId,
            "pageSize": 50,
            "pageNo": 1,
            "random": generateRandomString(32),
            "timestamp": Math.floor(Date.now() / 1000)
        };
        payload.signature = getApiSignature(payload);

        // NATIVE CLIENT-SIDE SCRAPING — Bypasses Cloudflare block on Vercel Backend
        const jalwaRes = await fetch("https://api.jalwaapi.com/api/webapi/GetNoaverageEmerdList", {
            method: "POST",
            headers: {
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json;charset=UTF-8",
                "Authorization": "Bearer " + jalwaToken,
                "X-Requested-With": "com.jalwa_win_lottery",
                "Platform": "android",
                "Origin": "https://jalwa.win",
                "Referer": "https://jalwa.win/"
            },
            body: JSON.stringify(payload)
        });

        if (!jalwaRes.ok) {
            throw new Error(`API: ${jalwaRes.status}`);
        }

        const jalwaData = await jalwaRes.json();

        if (jalwaData.code !== 0 || !jalwaData.data || !jalwaData.data.list) {
            ui.monitorBtn.innerHTML = `<span class="mon-btn-icon">❌</span><span class="mon-btn-text">AUTH ERR (${jalwaData.code || '?'}) / RE-SET TOKEN</span>`;
            ui.monitorBtn.style.background = "var(--loss)";
            return;
        }

        const history = jalwaData.data.list;

        // OFF-LOAD ANALYSIS TO OUR VERCEL BACKEND
        const analyzeRes = await fetch("api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                history: history,
                client_state: stratState
            })
        });
        
        const analyzeData = await analyzeRes.json();

        if (analyzeData.error) {
            ui.monitorBtn.innerHTML = '<span class="mon-btn-icon">❌</span><span class="mon-btn-text">ANALYZER ERROR</span>';
            ui.monitorBtn.style.background = "var(--loss)";
            return;
        }

        const data = { history: history, prediction: analyzeData.prediction };

        if (data && data.history && data.history.length > 0) {
            renderHistory(data.history);

            // Track win/loss if prediction period has resolved
            if (lastPrediction && lastPrediction.period) {
                const resolvedResult = data.history.find(h =>
                    String(h.issueNumber) === String(lastPrediction.period)
                );
                if (resolvedResult && lastSeenPeriod !== lastPrediction.period) {
                    evaluateResult(resolvedResult, lastPrediction);
                    lastSeenPeriod = lastPrediction.period;
                }
            }

            updateOracleUI(data.prediction);
            lastPrediction = data.prediction;

            if (isMonitoring) {
                ui.monitorBtn.innerHTML = '<span class="mon-btn-icon">■</span><span class="mon-btn-text">STOP MONITORING</span>';
                ui.monitorBtn.style.background = "var(--loss)";
                ui.monitorBtn.classList.add('running');
            }
        }
    } catch (e) {
        console.error("Monitor fetch failed", e);
        ui.monitorBtn.innerHTML = '<span class="mon-btn-icon">📡</span><span class="mon-btn-text">CONNECTION ERROR</span>';
    }
}

// ==================== RESULT EVALUATION ====================

function evaluateResult(result, prediction) {
    if (!prediction || !prediction.move || prediction.move === "SKIP") return;

    const num = parseInt(result.number || result.result);
    const actualSize = num >= 5 ? "Big" : "Small";

    const move = prediction.move;
    let isWin = (move === actualSize);

    if (isWin) {
        session.wins++;
        session.streak = session.streakType === 'W' ? session.streak + 1 : 1;
        session.streakType = 'W';
        session.feed.push('W');
        flashCard('win');
    } else {
        session.losses++;
        session.streak = session.streakType === 'L' ? session.streak + 1 : 1;
        session.streakType = 'L';
        session.feed.push('L');
        flashCard('loss');
    }

    // Keep feed to last 30
    if (session.feed.length > 30) session.feed = session.feed.slice(-30);
    saveSession();
    updateTrackerUI();
}

function flashCard(type) {
    ui.oracleCard.classList.add('flash-' + type);
    setTimeout(() => ui.oracleCard.classList.remove('flash-' + type), 1200);
}

// ==================== UI UPDATES ====================

function updateOracleUI(pred) {
    if (!pred) return;

    // Target Period
    ui.oracleTargetPeriod.innerText = pred.period ? pred.period.slice(-5) : "---";

    // Active Pattern
    const patternDisplay = pred.state?.current_pattern || "NONE";
    const patternLabel = patternDisplay === "BS" ? "BIG→SMALL" : patternDisplay === "SB" ? "SMALL→BIG" : "NONE";
    ui.oracleActivePattern.innerText = patternLabel;
    ui.oracleActivePattern.className = 'opv pattern-label' + (patternDisplay === "BS" ? ' pattern-bs' : patternDisplay === "SB" ? ' pattern-sb' : '');

    // Cycle Round — extract R#/5 from psychology string
    const roundMatch = pred.psychology?.match(/R(\d)\/5/);
    ui.oracleCycleRound.innerText = roundMatch ? `${roundMatch[1]}/5` : "--";

    // Update Local Strat State if backend changed it
    if (pred.state?.current_pattern && pred.state?.start_period) {
        if (stratState.pattern !== pred.state.current_pattern || stratState.start !== pred.state.start_period) {
            stratState.pattern = pred.state.current_pattern;
            stratState.start = pred.state.start_period;
            localStorage.setItem('mohxn_strat', JSON.stringify(stratState));
        }
    }

    // Determine signal states
    const isActive = pred.priority >= 80;
    const isWaiting = pred.priority > 0 && pred.priority < 80;
    const isNewStrat = pred.state?.new_alert === true;

    // Play sound alert for NEW STRATEGY or Active prediction
    if ((isActive || isNewStrat) && lastAlertedPeriod !== pred.period) {
        lastAlertedPeriod = pred.period;
        playL1Alert(pred.move, isNewStrat, pred.period);
    }

    // Main Signal Display
    if (isActive && pred.move && pred.move !== "SKIP") {
        ui.oracleSignal.innerText = pred.move;
        ui.oracleSignal.className = 'oracle-signal-value active pulse';
        if (pred.move === 'Big') ui.oracleSignal.classList.add('signal-big');
        else if (pred.move === 'Small') ui.oracleSignal.classList.add('signal-small');
        setTimeout(() => ui.oracleSignal.classList.remove('pulse'), 600);
    } else if (isWaiting && pred.move && pred.move !== "SKIP") {
        ui.oracleSignal.innerText = '[' + pred.move + ']';
        ui.oracleSignal.className = 'oracle-signal-value skip virtual-tracking';
    } else {
        ui.oracleSignal.innerText = "SKIP";
        ui.oracleSignal.className = 'oracle-signal-value skip';
    }

    // Detection Range & Confidence
    const range = pred.strong_pair;
    if (range && range[0] > 0) {
        ui.oracleDetectionRange.innerText = String(range[0]).slice(-5) + '–' + String(range[1]).slice(-5);
    } else {
        ui.oracleDetectionRange.innerText = "---";
    }
    ui.oracleConfidence.innerText = (pred.strength || 0) + '%';

    // Trap Type
    ui.oracleTrapType.innerText = pred.trap_type || "No trap detected";

    // Psychology / Status
    ui.oracleSentiment.innerText = pred.psychology || "Calculating...";

    // Oracle Badge
    if (isActive) {
        ui.oracleStatusBadge.innerText = "ACTIVE";
        ui.oracleStatusBadge.className = 'oracle-badge active-bet';
    } else if (isWaiting) {
        ui.oracleStatusBadge.innerText = "TRAP";
        ui.oracleStatusBadge.className = 'oracle-badge';
    } else {
        ui.oracleStatusBadge.innerText = "IDLE";
        ui.oracleStatusBadge.className = 'oracle-badge';
    }

    // Priority Bar
    ui.priorityValue.innerText = isActive ? "STRONG" : (isWaiting ? "HOLD" : "LOW");
    ui.priorityBarFill.style.width = isActive ? '100%' : (isWaiting ? '50%' : '15%');

    if (isActive) ui.priorityBarFill.className = 'priority-bar-fill high';
    else if (isWaiting) ui.priorityBarFill.className = 'priority-bar-fill medium';
    else ui.priorityBarFill.className = 'priority-bar-fill low';
}

function renderHistory(list) {
    if (!list || list.length === 0) return;
    let html = '';
    list.slice(0, 15).forEach(h => {
        let n = parseInt(h.number || h.result);
        let size = n >= 5 ? 'Big' : 'Small';
        let color = [0, 2, 4, 6, 8].includes(n) ? 'Red' : 'Green';
        html += `<div class="history-item">
            <span class="hi-period">${String(h.issueNumber).slice(-4)}</span>
            <span class="hi-number num-${color.toLowerCase()}">${n}</span>
            <span class="hi-size">${size}</span>
            <span class="hi-color hi-color-${color.toLowerCase()}">${color}</span>
        </div>`;
    });
    ui.historyGrid.innerHTML = html;
}

function updateTrackerUI() {
    ui.statWins.innerText = session.wins;
    ui.statLosses.innerText = session.losses;
    const total = session.wins + session.losses;
    ui.statWinRate.innerText = total > 0 ? ((session.wins / total) * 100).toFixed(0) + '%' : '--';
    ui.statStreak.innerText = (session.streakType === 'W' ? '+' : session.streakType === 'L' ? '-' : '') + session.streak;

    // Feed dots
    let feedHTML = '';
    session.feed.forEach(r => {
        feedHTML += `<div class="feed-dot ${r === 'W' ? 'feed-win' : 'feed-loss'}"></div>`;
    });
    ui.trackerFeed.innerHTML = feedHTML;
}

// ==================== BACKGROUND WAKE-LOCK ====================
function startBackgroundKeepAlive() {
    if (!keepAliveAudio) {
        keepAliveAudio = new Audio("data:audio/mpeg;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq");
        keepAliveAudio.loop = true;
        keepAliveAudio.volume = 1;
    }
    keepAliveAudio.play().catch(e => console.log("Keep alive blocked", e));

    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}

// ==================== MONITOR TOGGLE ====================

function toggleMonitoring() {
    isMonitoring = !isMonitoring;
    if (isMonitoring) {
        ui.monitorBtn.innerHTML = '<span class="mon-btn-icon">🔍</span><span class="mon-btn-text">SCANNING...</span>';
        ui.monitorBtn.style.background = "var(--loss)";
        ui.monitorBtn.classList.add('running');

        ui.statusBadge.className = 'status-badge running';
        ui.statusLabel.innerText = "LIVE";

        fetchMonitorData();
        monitorInterval = setInterval(fetchMonitorData, 5000);
        startBackgroundKeepAlive();
    } else {
        clearInterval(monitorInterval);
        ui.monitorBtn.innerHTML = '<span class="mon-btn-icon">▶</span><span class="mon-btn-text">START MONITORING</span>';
        ui.monitorBtn.style.background = "";
        ui.monitorBtn.classList.remove('running');

        ui.statusBadge.className = 'status-badge';
        ui.statusLabel.innerText = "OFFLINE";
        if (keepAliveAudio) keepAliveAudio.pause();
    }
}

ui.monitorBtn.addEventListener('click', toggleMonitoring);

// ==================== SESSION PERSISTENCE ====================

function saveSession() {
    localStorage.setItem('mohxn_session', JSON.stringify(session));
}

ui.resetTrackerBtn.addEventListener('click', () => {
    session = { wins: 0, losses: 0, streak: 0, streakType: '', feed: [] };
    stratState = { pattern: null, start: 0 };
    localStorage.setItem('mohxn_strat', JSON.stringify(stratState));
    saveSession();
    updateTrackerUI();
});

// ==================== TIMEFRAME SELECTOR ====================

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeTimeframe = e.target.getAttribute('data-tf');
        // Reset strategy on TF change since patterns are TF-specific
        stratState = { pattern: null, start: 0 };
        localStorage.setItem('mohxn_strat', JSON.stringify(stratState));
        if (isMonitoring) fetchMonitorData();
    });
});

// ==================== INIT ====================

updateTrackerUI();
console.log("MOHXN VIP Strong Pattern Engine v7.0 Active");

// ==================== AUDIO ALERT ====================
function playL1Alert(predMove, isNewStrat, predPeriod) {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
            const audioCtx = new Ctx();

            const playBeep = (freq, time, duration, type = 'square') => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = type;
                osc.frequency.value = freq;
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                gain.gain.setValueAtTime(0.05, time);
                gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
                osc.start(time);
                osc.stop(time + duration);
            };

            const now = audioCtx.currentTime;
            if (isNewStrat) {
                playBeep(440, now, 0.1, 'sine');
                playBeep(660, now + 0.15, 0.1, 'sine');
                playBeep(880, now + 0.3, 0.2, 'sine');
            } else {
                playBeep(880, now, 0.15);
                playBeep(1046.5, now + 0.2, 0.3);
            }
        }

        // Send Push Notification (only if user enabled)
        if (notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
            const periodShort = predPeriod ? String(predPeriod).slice(-5) : '';
            const patternName = stratState.pattern === "BS" ? "Big→Small" : "Small→Big";
            
            const title = isNewStrat ? `⚡ NEW PATTERN: ${patternName}` : `🎯 MOHXN: ${predMove}`;
            const body = isNewStrat
                ? `Strong ${patternName} detected. Next: ${predMove} for ${periodShort}`
                : `Next prediction: ${predMove} for period ${periodShort}`;

            sendServiceWorkerNotification(title, {
                body: body,
                icon: "/logo.png",
                vibrate: [200, 100, 200, 100, 500]
            });
            // Send Telegram Push Alert (ONLY on new strong patterns to avoid spam)
            if (isNewStrat && tgChatId && tgToken) {
                const tgUrl = `https://api.telegram.org/bot${tgToken}/sendMessage`;
                fetch(tgUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: tgChatId,
                        text: `*${title}*\n${body}`,
                        parse_mode: "Markdown"
                    })
                }).catch(e => console.error("TG Push Failed", e));
            }
        }
    } catch (e) {
        console.error("Alert failed", e);
    }
}
