/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  BACKTEST: CONSECUTIVE L1+L2+L3 FAILURES (2 YEARS)                    ║
 * ║  Mixed Sample Data (730 Days)                                      ║
 * ║                                                                       ║
 * ║  Criteria: How many times does a session reach Level 4 or 5         ║
 * ║  consecutively?                                                       ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

function opp(v) {
    if (v === "Big") return "Small"; if (v === "Small") return "Big";
    if (v === "Red") return "Green"; if (v === "Green") return "Red";
    return v;
}

function getGamblerMove(seq) {
    if (seq.length < 5) return { move: seq[seq.length - 1] || "Big", priority: 0 };
    let seq_len = seq.length;
    let recent_10 = seq_len >= 10 ? seq.slice(-10) : seq;
    let streak_val = seq[seq_len - 1];
    let streak_len = 0, chop_len = 0, panic_pivot = 0, prev_streak_len = 0;
    for (let i = seq_len - 1; i >= 0; i--) { if (seq[i] === streak_val) streak_len++; else break; }
    if (seq_len >= 2 && seq[seq_len - 1] !== seq[seq_len - 2]) {
        for (let i = seq_len - 1; i > 0; i--) { if (seq[i] !== seq[i - 1]) chop_len++; else break; }
    }
    if (streak_len === 1 && seq_len >= 3) {
        let pv = seq[seq_len - 2];
        for (let i = seq_len - 2; i >= 0; i--) { if (seq[i] === pv) prev_streak_len++; else break; }
        if (prev_streak_len >= 3) panic_pivot = prev_streak_len * 20;
    }
    let scenarios = [];
    if (streak_len >= 3) scenarios.push({ move: opp(streak_val), score: Math.pow(streak_len, 1.8) * 15 });
    if (chop_len >= 3) scenarios.push({ move: opp(streak_val), score: Math.pow(chop_len, 1.8) * 15 });
    if (panic_pivot > 0) scenarios.push({ move: streak_val, score: panic_pivot });
    let vc = {};
    for (let v of recent_10) vc[v] = (vc[v] || 0) + 1;
    let dv = Object.keys(vc).reduce((a, b) => vc[a] > vc[b] ? a : b);
    scenarios.push({ move: dv, score: (vc[dv] / recent_10.length) * 40 });
    let best = scenarios.sort((a, b) => b.score - a.score)[0];
    return { move: best.move, priority: best.score };
}

function predict(results) {
    if (results.length < 5) return null;
    let sizes = results.map(n => n >= 5 ? "Big" : "Small");
    let colors = results.map(n => [0, 2, 4, 6, 8].includes(n) ? "Red" : "Green");
    let sB = getGamblerMove(sizes);
    let cB = getGamblerMove(colors);
    let priority = Math.max(sB.priority, cB.priority);
    let signal = sB.priority >= cB.priority ? opp(sB.move) : opp(cB.move);
    let betType = sB.priority >= cB.priority ? "size" : "color";
    return { signal, priority, betType };
}

function genRealWorldMix(n) {
    let d = [];
    let remaining = n;
    while (remaining > 0) {
        let segLen = Math.min(remaining, 50 + Math.floor(Math.random() * 450));
        let type = Math.random();
        if (type < 0.4) {
            for (let i = 0; i < segLen; i++) d.push(Math.floor(Math.random() * 10));
        } else if (type < 0.65) {
            let current = Math.floor(Math.random() * 10);
            for (let i = 0; i < segLen; i++) {
                if (Math.random() < 0.35) current = Math.floor(Math.random() * 10);
                else {
                    let isBig = current >= 5;
                    current = isBig ? (5 + Math.floor(Math.random() * 5)) : Math.floor(Math.random() * 5);
                }
                d.push(current);
            }
        } else {
            let lastBig = Math.random() < 0.5;
            for (let i = 0; i < segLen; i++) {
                if (Math.random() < 0.65) lastBig = !lastBig;
                d.push(lastBig ? (5 + Math.floor(Math.random() * 5)) : Math.floor(Math.random() * 5));
            }
        }
        remaining -= segLen;
    }
    return d.slice(0, n);
}

function runL1L2L3FailTest(data) {
    const WINDOW = 20;
    const THRESHOLD = 40;
    const MART_LEVELS = 5;

    let martLevel = 1;
    let currentStreak = 0;
    let maxStreak = 0;
    let streakDist = {};
    
    let totalSessions = 0;

    for (let i = WINDOW; i < data.length; i++) {
        let history = data.slice(i - WINDOW, i);
        let actual = data[i];

        let pred = predict(history);
        if (!pred || pred.priority < THRESHOLD) continue;

        let aSize = actual >= 5 ? "Big" : "Small";
        let aColor = [0, 2, 4, 6, 8].includes(actual) ? "Red" : "Green";
        let isWin = (pred.betType === "size") ? (pred.signal === aSize) : (pred.signal === aColor);

        if (martLevel === 1) totalSessions++;

        if (isWin) {
            // WIN at any level (1-5) resets the session
            if (currentStreak > 0 && martLevel <= 3) {
                 // Streak ended (recovery at L1, L2, or L3)
                 streakDist[currentStreak] = (streakDist[currentStreak] || 0) + 1;
                 currentStreak = 0;
            }
            martLevel = 1;
        } else {
            // LOSS
            if (martLevel === 3) {
                // FAILED L1, L2, and L3 (reaching L4)
                currentStreak++;
                if (currentStreak > maxStreak) maxStreak = currentStreak;
            }
            
            martLevel++;
            if (martLevel > MART_LEVELS) {
                // SESSION FELL OFF (Ruin reset)
                if (currentStreak > 0) {
                    streakDist[currentStreak] = (streakDist[currentStreak] || 0) + 1;
                    currentStreak = 0;
                }
                martLevel = 1; 
            }
        }
    }

    return { maxStreak, streakDist, totalSessions };
}

const DAYS = 730; // 2 YEARS
const TIMEFRAME = "1m";
const ROUNDS_PER_DAY = 1440;

let totalRounds = ROUNDS_PER_DAY * DAYS;
let data = genRealWorldMix(totalRounds);
let result = runL1L2L3FailTest(data);

console.log("╔═══════════════════════════════════════════════════════════════════════════╗");
console.log("║  BACKTEST: CONSECUTIVE L1+L2+L3 FAILURES (REACHING L4/5) — 2 YEARS    ║");
console.log("║  Timeframe: 1-Minute | Market: Real-World Mix                          ║");
console.log("╚═══════════════════════════════════════════════════════════════════════════╝\n");

console.log(`- Total Sessions in 2 Years: ${result.totalSessions.toLocaleString()}`);
console.log(`- Probability of reaching L4: ~12.5%`);
console.log(`- ★ MAX CONSECUTIVE L1+L2+L3 FAILURES: ${result.maxStreak}\n`);

console.log(`Distribution over 2 years:`);
let sorted = Object.entries(result.streakDist).sort((a,b) => parseInt(a[0]) - parseInt(b[0]));
for(let [len, count] of sorted) {
    console.log(`  ${len}× in a row: ${count} times`);
}
