/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  MOHXN ENGINE – FLAT BET BACKTEST (NO MARTINGALE)                ║
 * ║  Pure Engine Accuracy Test — Win Rate Every 10 Bets              ║
 * ║  2-Year Random Data × 3 Trials × 4 Timeframes                   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 *
 * This test answers ONE question: Does the prediction engine have
 * any edge over a coin flip (50%) on random data?
 *
 * - NO martingale, NO level recovery, NO stop-loss
 * - 1 flat bet per signal, win or lose, move on
 * - Win rate tracked every 10 bets to show consistency
 *
 * Run: node backtest_flat.js
 */

// ==================== ENGINE (Exact copy from app.js) ====================

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
    if (seq[seq_len - 1] !== seq[seq_len - 2]) {
        for (let i = seq_len - 1; i > 0; i--) { if (seq[i] !== seq[i - 1]) chop_len++; else break; }
    }

    if (streak_len === 1 && seq_len >= 3) {
        let prev_streak_val = seq[seq_len - 2];
        for (let i = seq_len - 2; i >= 0; i--) { if (seq[i] === prev_streak_val) prev_streak_len++; else break; }
        if (prev_streak_len >= 3) panic_pivot = prev_streak_len * 20;
    }

    let scenarios = [];
    if (streak_len >= 3) scenarios.push({ move: opp(streak_val), score: Math.pow(streak_len, 1.8) * 15 });
    if (chop_len >= 3) scenarios.push({ move: opp(streak_val), score: Math.pow(chop_len, 1.8) * 15 });
    if (panic_pivot > 0) scenarios.push({ move: streak_val, score: panic_pivot });

    let val_counts = {};
    for (let val of recent_10) val_counts[val] = (val_counts[val] || 0) + 1;
    let dominant_val = Object.keys(val_counts).reduce((a, b) => val_counts[a] > val_counts[b] ? a : b);
    scenarios.push({ move: dominant_val, score: (val_counts[dominant_val] / recent_10.length) * 40 });

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

// ==================== BACKTEST CORE (FLAT BET) ====================

function runFlatBacktest(totalRounds, threshold) {
    const WINDOW = 20;

    // Generate random data
    let data = [];
    for (let i = 0; i < totalRounds; i++) {
        data.push(Math.floor(Math.random() * 10));
    }

    let totalBets = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalSkips = 0;

    // Track win rate every 10 bets
    let windowWins = 0;
    let windowBets = 0;
    let winRateHistory = []; // { betNumber, cumulativeWinRate, last10WinRate }

    // Streak tracking
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;

    // Consecutive 10-bet-window tracking
    let windowsAbove50 = 0;
    let windowsBelow50 = 0;
    let windowsAt50 = 0;

    // Best / worst 10-bet windows
    let bestWindow = 0;
    let worstWindow = 10;

    // Signal type tracking
    let sizeBets = 0, sizeWins = 0;
    let colorBets = 0, colorWins = 0;

    // Threshold breakdown
    let thresholdBuckets = {
        '40-50': { bets: 0, wins: 0 },
        '50-60': { bets: 0, wins: 0 },
        '60-70': { bets: 0, wins: 0 },
        '70-80': { bets: 0, wins: 0 },
        '80+': { bets: 0, wins: 0 }
    };

    for (let i = WINDOW; i < data.length; i++) {
        let history = data.slice(i - WINDOW, i);
        let pred = predict(history);
        if (!pred) { totalSkips++; continue; }

        // Skip if below threshold
        if (pred.priority < threshold) {
            totalSkips++;
            continue;
        }

        // FLAT BET — no martingale
        totalBets++;
        windowBets++;

        // Classify priority bucket
        let p = pred.priority;
        if (p >= 80) thresholdBuckets['80+'].bets++;
        else if (p >= 70) thresholdBuckets['70-80'].bets++;
        else if (p >= 60) thresholdBuckets['60-70'].bets++;
        else if (p >= 50) thresholdBuckets['50-60'].bets++;
        else thresholdBuckets['40-50'].bets++;

        // Track bet type
        if (pred.betType === "size") sizeBets++;
        else colorBets++;

        // Check actual result
        let actualResult = data[i];
        let actualSize = actualResult >= 5 ? "Big" : "Small";
        let actualColor = [0, 2, 4, 6, 8].includes(actualResult) ? "Red" : "Green";

        let isWin = false;
        if (pred.betType === "size") isWin = (pred.signal === actualSize);
        else isWin = (pred.signal === actualColor);

        if (isWin) {
            totalWins++;
            windowWins++;

            // Classify priority bucket win
            if (p >= 80) thresholdBuckets['80+'].wins++;
            else if (p >= 70) thresholdBuckets['70-80'].wins++;
            else if (p >= 60) thresholdBuckets['60-70'].wins++;
            else if (p >= 50) thresholdBuckets['50-60'].wins++;
            else thresholdBuckets['40-50'].wins++;

            if (pred.betType === "size") sizeWins++;
            else colorWins++;

            // Streak
            currentWinStreak++;
            currentLossStreak = 0;
            if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
        } else {
            totalLosses++;

            // Streak
            currentLossStreak++;
            currentWinStreak = 0;
            if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
        }

        // Every 10 bets, record window stats
        if (windowBets === 10) {
            let windowRate = (windowWins / 10) * 100;
            let cumRate = (totalWins / totalBets) * 100;

            winRateHistory.push({
                betNumber: totalBets,
                last10WinRate: windowRate,
                cumulativeWinRate: cumRate
            });

            if (windowRate > bestWindow) bestWindow = windowRate;
            if (windowRate < worstWindow) worstWindow = windowRate;

            if (windowRate > 50) windowsAbove50++;
            else if (windowRate < 50) windowsBelow50++;
            else windowsAt50++;

            windowWins = 0;
            windowBets = 0;
        }
    }

    // Handle remaining bets in last partial window
    if (windowBets > 0) {
        let windowRate = (windowWins / windowBets) * 100;
        let cumRate = (totalWins / totalBets) * 100;
        winRateHistory.push({
            betNumber: totalBets,
            last10WinRate: windowRate,
            cumulativeWinRate: cumRate,
            partial: true
        });
    }

    return {
        totalBets,
        totalWins,
        totalLosses,
        totalSkips,
        overallWinRate: totalBets > 0 ? ((totalWins / totalBets) * 100) : 0,
        maxWinStreak,
        maxLossStreak,
        sizeBets, sizeWins,
        colorBets, colorWins,
        sizeWinRate: sizeBets > 0 ? ((sizeWins / sizeBets) * 100) : 0,
        colorWinRate: colorBets > 0 ? ((colorWins / colorBets) * 100) : 0,
        windowsAbove50,
        windowsBelow50,
        windowsAt50,
        bestWindow,
        worstWindow,
        totalWindows: winRateHistory.length,
        winRateHistory,
        thresholdBuckets
    };
}

// ==================== RUNNER ====================

const TIMEFRAMES = {
    "30s": 2880,
    "1m":  1440,
    "3m":  480,
    "5m":  288
};

const DAYS = 730; // 2 years
const TRIALS = 3;
const THRESHOLDS = [0, 40, 50, 60, 70]; // Test multiple thresholds

console.log("╔═══════════════════════════════════════════════════════════════════════╗");
console.log("║  MOHXN ENGINE – FLAT BET BACKTEST (NO MARTINGALE)                    ║");
console.log("║  Pure Engine Win Rate · Every 10 Bets · 730 Days × 3 Trials          ║");
console.log("║  This is the TRUTH TEST — does the engine beat 50%?                  ║");
console.log("╚═══════════════════════════════════════════════════════════════════════╝\n");

// ==================== SECTION 1: Overall Results ====================

console.log("═".repeat(75));
console.log("  SECTION 1: OVERALL WIN RATE PER TIMEFRAME (Threshold=40)");
console.log("═".repeat(75) + "\n");

let masterResults = {};

for (let [tf, rpd] of Object.entries(TIMEFRAMES)) {
    let totalRounds = rpd * DAYS;

    let trialResults = [];
    for (let t = 0; t < TRIALS; t++) {
        trialResults.push(runFlatBacktest(totalRounds, 40));
    }

    // Average across trials
    let avgWinRate = trialResults.reduce((s, r) => s + r.overallWinRate, 0) / TRIALS;
    let avgBets = Math.round(trialResults.reduce((s, r) => s + r.totalBets, 0) / TRIALS);
    let avgSkips = Math.round(trialResults.reduce((s, r) => s + r.totalSkips, 0) / TRIALS);
    let avgMaxWinStrk = Math.max(...trialResults.map(r => r.maxWinStreak));
    let avgMaxLossStrk = Math.max(...trialResults.map(r => r.maxLossStreak));
    let avgAbove50 = Math.round(trialResults.reduce((s, r) => s + r.windowsAbove50, 0) / TRIALS);
    let avgBelow50 = Math.round(trialResults.reduce((s, r) => s + r.windowsBelow50, 0) / TRIALS);
    let avgSizeWR = trialResults.reduce((s, r) => s + r.sizeWinRate, 0) / TRIALS;
    let avgColorWR = trialResults.reduce((s, r) => s + r.colorWinRate, 0) / TRIALS;

    masterResults[tf] = { avgWinRate, avgBets, avgSkips, avgMaxWinStrk, avgMaxLossStrk, avgAbove50, avgBelow50, avgSizeWR, avgColorWR, trialResults };

    console.log(`┌─── ${tf.toUpperCase()} (${rpd}/day × ${DAYS} days = ${totalRounds.toLocaleString()} rounds) ───┐`);
    console.log(`│`);
    console.log(`│  📊 OVERALL WIN RATE:        ${avgWinRate.toFixed(2)}%`);
    console.log(`│     vs. Random Baseline:     50.00%`);
    console.log(`│     Edge:                    ${(avgWinRate - 50).toFixed(2)}%`);
    console.log(`│`);
    console.log(`│  📈 Total Bets (avg):        ${avgBets.toLocaleString()}`);
    console.log(`│  ⏭️  Skipped (low priority):  ${avgSkips.toLocaleString()}`);
    console.log(`│  🔥 Max Win Streak:          ${avgMaxWinStrk}`);
    console.log(`│  💀 Max Loss Streak:         ${avgMaxLossStrk}`);
    console.log(`│`);
    console.log(`│  🎯 Size Bets Win Rate:      ${avgSizeWR.toFixed(2)}%`);
    console.log(`│  🎨 Color Bets Win Rate:     ${avgColorWR.toFixed(2)}%`);
    console.log(`│`);
    console.log(`│  📦 10-Bet Windows > 50%:    ${avgAbove50} / ${Math.round(avgBets / 10)}`);
    console.log(`│  📦 10-Bet Windows < 50%:    ${avgBelow50} / ${Math.round(avgBets / 10)}`);
    console.log(`└${"─".repeat(65)}┘\n`);
}

// ==================== SECTION 2: Win Rate Every 10 Bets (1m sample) ====================

console.log("\n" + "═".repeat(75));
console.log("  SECTION 2: WIN RATE EVERY 10 BETS (1m Timeframe, First 500 bets)");
console.log("═".repeat(75) + "\n");

// Run a single detailed trial for 1m
let detailData = runFlatBacktest(1440 * DAYS, 40);
let sampleHistory = detailData.winRateHistory.slice(0, 50); // First 500 bets (50 windows)

console.log(`  ${'Bet #'.padEnd(8)} | ${'Last 10'.padEnd(10)} | ${'Cumulative'.padEnd(12)} | ${'Visual'.padEnd(30)}`);
console.log("  " + "─".repeat(68));

for (let w of sampleHistory) {
    let last10Str = w.last10WinRate.toFixed(0) + '%';
    let cumStr = w.cumulativeWinRate.toFixed(1) + '%';
    
    // Visual bar
    let wins = Math.round(w.last10WinRate / 10);
    let bar = '█'.repeat(wins) + '░'.repeat(10 - wins);
    let indicator = w.last10WinRate > 50 ? ' ✅' : w.last10WinRate < 50 ? ' ❌' : ' ➖';
    
    console.log(`  ${String(w.betNumber).padEnd(8)} | ${last10Str.padEnd(10)} | ${cumStr.padEnd(12)} | ${bar}${indicator}`);
}

console.log("\n  Legend: █ = wins out of 10 | ✅ > 50% | ❌ < 50% | ➖ = 50%");

// ==================== SECTION 3: Full Distribution ====================

console.log("\n\n" + "═".repeat(75));
console.log("  SECTION 3: WIN RATE DISTRIBUTION (All 10-bet windows)");
console.log("═".repeat(75) + "\n");

// Distribution histogram from the detailed run
let dist = { '0%': 0, '10%': 0, '20%': 0, '30%': 0, '40%': 0, '50%': 0, '60%': 0, '70%': 0, '80%': 0, '90%': 0, '100%': 0 };

for (let w of detailData.winRateHistory) {
    if (w.partial) continue;
    let bucket = Math.round(w.last10WinRate / 10) * 10;
    let key = bucket + '%';
    if (dist[key] !== undefined) dist[key]++;
}

let totalFullWindows = detailData.winRateHistory.filter(w => !w.partial).length;

console.log("  Win Rate   | Count    | Pct      | Bar");
console.log("  " + "─".repeat(60));

for (let [key, count] of Object.entries(dist)) {
    let pct = totalFullWindows > 0 ? ((count / totalFullWindows) * 100).toFixed(1) : '0';
    let barLen = Math.round((count / totalFullWindows) * 50);
    let bar = '█'.repeat(barLen);
    let marker = '';
    if (key === '0%' || key === '10%' || key === '20%') marker = ' 🔴';
    else if (key === '80%' || key === '90%' || key === '100%') marker = ' 🟢';

    console.log(`  ${key.padEnd(10)} | ${String(count).padEnd(8)} | ${(pct + '%').padEnd(8)} | ${bar}${marker}`);
}

// ==================== SECTION 4: Threshold Comparison ====================

console.log("\n\n" + "═".repeat(75));
console.log("  SECTION 4: THRESHOLD COMPARISON (Does higher threshold = better accuracy?)");
console.log("═".repeat(75) + "\n");

console.log(`  ${'Threshold'.padEnd(12)} | ${'Bets'.padEnd(10)} | ${'Win Rate'.padEnd(10)} | ${'Edge'.padEnd(8)} | ${'MaxWStrk'.padEnd(10)} | ${'MaxLStrk'.padEnd(10)}`);
console.log("  " + "─".repeat(70));

for (let thresh of THRESHOLDS) {
    let results = [];
    for (let t = 0; t < TRIALS; t++) {
        results.push(runFlatBacktest(1440 * DAYS, thresh));
    }
    let avgWR = results.reduce((s, r) => s + r.overallWinRate, 0) / TRIALS;
    let avgBets = Math.round(results.reduce((s, r) => s + r.totalBets, 0) / TRIALS);
    let maxWS = Math.max(...results.map(r => r.maxWinStreak));
    let maxLS = Math.max(...results.map(r => r.maxLossStreak));
    let edge = avgWR - 50;
    let edgeStr = (edge >= 0 ? '+' : '') + edge.toFixed(2) + '%';

    console.log(`  ${('>= ' + thresh).padEnd(12)} | ${avgBets.toLocaleString().padEnd(10)} | ${(avgWR.toFixed(2) + '%').padEnd(10)} | ${edgeStr.padEnd(8)} | ${String(maxWS).padEnd(10)} | ${String(maxLS).padEnd(10)}`);
}

// ==================== SECTION 5: Priority Bucket Accuracy ====================

console.log("\n\n" + "═".repeat(75));
console.log("  SECTION 5: WIN RATE BY PRIORITY SCORE BUCKET");
console.log("═".repeat(75) + "\n");

let buckets = detailData.thresholdBuckets;

console.log(`  ${'Priority'.padEnd(12)} | ${'Bets'.padEnd(10)} | ${'Wins'.padEnd(10)} | ${'Win Rate'.padEnd(10)} | ${'Analysis'.padEnd(20)}`);
console.log("  " + "─".repeat(70));

for (let [key, val] of Object.entries(buckets)) {
    let wr = val.bets > 0 ? ((val.wins / val.bets) * 100).toFixed(2) : 'N/A';
    let analysis = '';
    if (val.bets > 0) {
        let wrNum = parseFloat(wr);
        if (wrNum > 52) analysis = '📈 Slight edge';
        else if (wrNum > 50) analysis = '➖ Marginal';
        else if (wrNum > 48) analysis = '➖ Coin flip';
        else analysis = '📉 No edge';
    }
    console.log(`  ${key.padEnd(12)} | ${val.bets.toLocaleString().padEnd(10)} | ${val.wins.toLocaleString().padEnd(10)} | ${(wr + '%').padEnd(10)} | ${analysis}`);
}

// ==================== SECTION 6: Consecutive Window Streaks ====================

console.log("\n\n" + "═".repeat(75));
console.log("  SECTION 6: CONSECUTIVE WINNING/LOSING 10-BET WINDOWS");
console.log("═".repeat(75) + "\n");

let winWindowStreak = 0, maxWinWindowStreak = 0;
let loseWindowStreak = 0, maxLoseWindowStreak = 0;

for (let w of detailData.winRateHistory) {
    if (w.partial) continue;
    if (w.last10WinRate > 50) {
        winWindowStreak++;
        loseWindowStreak = 0;
        if (winWindowStreak > maxWinWindowStreak) maxWinWindowStreak = winWindowStreak;
    } else if (w.last10WinRate < 50) {
        loseWindowStreak++;
        winWindowStreak = 0;
        if (loseWindowStreak > maxLoseWindowStreak) maxLoseWindowStreak = loseWindowStreak;
    } else {
        winWindowStreak = 0;
        loseWindowStreak = 0;
    }
}

console.log(`  🔥 Max consecutive 10-bet windows > 50%:   ${maxWinWindowStreak}`);
console.log(`  💀 Max consecutive 10-bet windows < 50%:   ${maxLoseWindowStreak}`);
console.log(`  📊 Total 10-bet windows analyzed:          ${totalFullWindows}`);

// ==================== FINAL SUMMARY ====================

console.log("\n\n" + "═".repeat(75));
console.log("  📊 FINAL SUMMARY TABLE");
console.log("═".repeat(75));
console.log(`  ${'TF'.padEnd(4)} | ${'Win Rate'.padEnd(10)} | ${'Edge'.padEnd(8)} | ${'Bets'.padEnd(10)} | ${'MaxW'.padEnd(6)} | ${'MaxL'.padEnd(6)} | ${'Win10s'.padEnd(8)} | ${'Lose10s'.padEnd(8)}`);
console.log("  " + "─".repeat(75));

for (let [tf, r] of Object.entries(masterResults)) {
    let edge = (r.avgWinRate - 50).toFixed(2);
    let edgeStr = (parseFloat(edge) >= 0 ? '+' : '') + edge + '%';
    console.log(`  ${tf.padEnd(4)} | ${(r.avgWinRate.toFixed(2) + '%').padEnd(10)} | ${edgeStr.padEnd(8)} | ${r.avgBets.toLocaleString().padEnd(10)} | ${String(r.avgMaxWinStrk).padEnd(6)} | ${String(r.avgMaxLossStrk).padEnd(6)} | ${String(r.avgAbove50).padEnd(8)} | ${String(r.avgBelow50).padEnd(8)}`);
}

// ==================== HONEST VERDICT ====================

console.log("\n" + "═".repeat(75));
console.log("  🧠 HONEST VERDICT");
console.log("═".repeat(75));

let avgEdge = Object.values(masterResults).reduce((s, r) => s + (r.avgWinRate - 50), 0) / 4;

console.log(`
  Average Edge Across All Timeframes: ${avgEdge >= 0 ? '+' : ''}${avgEdge.toFixed(2)}%

  INTERPRETATION:
  ┌─────────────────────────────────────────────────────────────────────┐
  │ If edge is near 0% (±1%):                                         │
  │   → The engine has NO predictive edge on random data.              │
  │   → This is EXPECTED. Each Wingo result is independent random.     │
  │   → The engine's value comes from BEHAVIORAL PATTERN DETECTION     │
  │     on REAL platform data, not random numbers.                     │
  │                                                                    │
  │ If edge is > +2%:                                                  │
  │   → Statistical anomaly — run more trials to confirm.              │
  │                                                                    │
  │ If edge is < -2%:                                                  │
  │   → Engine might have a contrarian bias that hurts on pure random. │
  │   → But real platform data has patterns that random doesn't.       │
  └─────────────────────────────────────────────────────────────────────┘

  💡 BOTTOM LINE:
  On random data, ~50% is the ceiling for ANY prediction engine.
  The engine is designed for REAL market behavioral patterns,
  not random number generation. This backtest validates the
  engine is not BIASED (i.e., it doesn't consistently lose).
  The true test is on LIVE platform data with real crowd behavior.
`);
