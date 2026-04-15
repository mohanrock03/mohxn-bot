/**
 * MOHXN VIP ENGINE – FULL 1-YEAR BACKTEST
 * Simulates the GamblerMindsetEngine across all 4 timeframes
 * with 5-Level Martingale tracking.
 * 
 * Run: node backtest_full.js
 */

// ==================== ENGINE COPY (Same as app.js) ====================

function opp(v) {
    if (v === "Big") return "Small"; if (v === "Small") return "Big";
    if (v === "Red") return "Green"; if (v === "Green") return "Red";
    return v;
}

function getGamblerMove(seq) {
    if (seq.length < 5) return { move: seq[seq.length - 1] || "Big", priority: 0, logic: "Init" };
    let seq_len = seq.length;
    let recent_10 = seq_len >= 10 ? seq.slice(-10) : seq;

    let streak_val = seq[seq_len - 1];
    let streak_len = 0, chop_len = 0, panic_pivot = 0, prev_streak_len = 0;

    for (let i = seq_len - 1; i >= 0; i--) { if (seq[i] === streak_val) streak_len++; else break; }
    if (seq_len >= 2 && seq[seq_len - 1] !== seq[seq_len - 2]) {
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

function predictFromHistory(results) {
    // results = array of integers 0-9, oldest first
    if (results.length < 5) return null;

    let sizes = results.map(n => n >= 5 ? "Big" : "Small");
    let colors = results.map(n => [0, 2, 4, 6, 8].includes(n) ? "Red" : "Green");

    let sB = getGamblerMove(sizes);
    let cB = getGamblerMove(colors);

    let priority = Math.max(sB.priority, cB.priority);
    let signal = sB.priority >= cB.priority ? opp(sB.move) : opp(cB.move);

    return { signal, priority };
}

// ==================== DATA GENERATION ====================

function generateYear(roundsPerDay) {
    // 365 days of random 0-9 results
    let total = roundsPerDay * 365;
    let data = [];
    for (let i = 0; i < total; i++) {
        data.push(Math.floor(Math.random() * 10));
    }
    return data;
}

// ==================== BACKTEST CORE ====================

function runBacktest(data, label) {
    const WINDOW = 20; // Look-back window (same as live engine)
    const MART_LEVELS = 5;
    const BET_THRESHOLD = 40; // priority >= 40 means BET

    let totalBets = 0;
    let totalSkips = 0;
    let wins = 0;
    let losses = 0;
    let martLevel = 1;
    let maxLevel = 1;
    let ruinCount = 0; // L5 losses (full ruin cycles)
    let levelWins = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let levelBets = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    // Martingale session tracking
    let sessionWins = 0; // A "session" = from L1 start to either win-back-to-L1 or L5 ruin
    let sessionLosses = 0;
    let withinFiveLevelWins = 0; // Won at least once within 5 levels
    let withinFiveLevelAttempts = 0;
    let currentSessionStarted = false;

    // Streak tracking
    let currentStreak = 0; // positive = win streak, negative = loss streak
    let maxWinStreak = 0;
    let maxLossStreak = 0;

    for (let i = WINDOW; i < data.length; i++) {
        let history = data.slice(i - WINDOW, i); // last 20 results
        let actualResult = data[i]; // the result we're predicting

        let pred = predictFromHistory(history);
        if (!pred) continue;

        if (pred.priority < BET_THRESHOLD) {
            // SKIP - level stays, don't count
            totalSkips++;
            continue;
        }

        // BET placed
        totalBets++;
        levelBets[martLevel]++;

        let actualSize = actualResult >= 5 ? "Big" : "Small";
        let actualColor = [0, 2, 4, 6, 8].includes(actualResult) ? "Red" : "Green";
        let isWin = (pred.signal === actualSize || pred.signal === actualColor);

        if (!currentSessionStarted) {
            currentSessionStarted = true;
            withinFiveLevelAttempts++;
        }

        if (isWin) {
            wins++;
            levelWins[martLevel]++;

            // Win streak
            if (currentStreak >= 0) currentStreak++;
            else currentStreak = 1;
            if (currentStreak > maxWinStreak) maxWinStreak = currentStreak;

            // Session win
            withinFiveLevelWins++;
            currentSessionStarted = false;
            martLevel = 1; // Reset
        } else {
            losses++;

            // Loss streak
            if (currentStreak <= 0) currentStreak--;
            else currentStreak = -1;
            if (Math.abs(currentStreak) > maxLossStreak) maxLossStreak = Math.abs(currentStreak);

            martLevel++;
            if (martLevel > MART_LEVELS) {
                ruinCount++;
                martLevel = 1; // Ruin reset
                currentSessionStarted = false;
            }
        }
    }

    let accuracy = totalBets > 0 ? ((wins / totalBets) * 100).toFixed(2) : 0;
    let fiveLevelWinRate = withinFiveLevelAttempts > 0
        ? ((withinFiveLevelWins / withinFiveLevelAttempts) * 100).toFixed(2)
        : 0;

    return {
        label,
        totalRounds: data.length,
        totalBets,
        totalSkips,
        wins,
        losses,
        accuracy: parseFloat(accuracy),
        fiveLevelWinRate: parseFloat(fiveLevelWinRate),
        ruinCount,
        maxWinStreak,
        maxLossStreak,
        levelBets,
        levelWins,
        maxLevel
    };
}

// ==================== RUN ALL TIMEFRAMES ====================

const TIMEFRAMES = {
    "30s": 2880,  // 24h * 60min * 2 per min = 2880/day
    "1m":  1440,  // 24h * 60 = 1440/day
    "3m":  480,   // 24h * 20 = 480/day
    "5m":  288    // 24h * 12 = 288/day
};

console.log("═══════════════════════════════════════════════════════════════");
console.log("  MOHXN VIP ENGINE – FULL 1-YEAR BACKTEST REPORT");
console.log("  Engine: GamblerMindsetEngine v2.6");
console.log("  Martingale: 5-Level Cap");
console.log("  BET Threshold: Priority >= 40");
console.log("  Data: 365 days × Random(0-9) per timeframe");
console.log("═══════════════════════════════════════════════════════════════\n");

let allResults = [];

for (let [tf, rpd] of Object.entries(TIMEFRAMES)) {
    // Run 3 trials per timeframe for statistical confidence
    let trialResults = [];
    for (let trial = 1; trial <= 3; trial++) {
        let data = generateYear(rpd);
        let result = runBacktest(data, `${tf} (Trial ${trial})`);
        trialResults.push(result);
    }

    // Average the trials
    let avgAccuracy = (trialResults.reduce((s, r) => s + r.accuracy, 0) / 3).toFixed(2);
    let avgFiveLevel = (trialResults.reduce((s, r) => s + r.fiveLevelWinRate, 0) / 3).toFixed(2);
    let avgRuin = Math.round(trialResults.reduce((s, r) => s + r.ruinCount, 0) / 3);
    let avgBets = Math.round(trialResults.reduce((s, r) => s + r.totalBets, 0) / 3);
    let avgSkips = Math.round(trialResults.reduce((s, r) => s + r.totalSkips, 0) / 3);
    let avgWins = Math.round(trialResults.reduce((s, r) => s + r.wins, 0) / 3);
    let avgLosses = Math.round(trialResults.reduce((s, r) => s + r.losses, 0) / 3);
    let maxLossStrk = Math.max(...trialResults.map(r => r.maxLossStreak));

    console.log(`┌─── TIMEFRAME: ${tf.toUpperCase()} ──────────────────────────────────┐`);
    console.log(`│  Total Rounds/Year:    ${(rpd * 365).toLocaleString()}`);
    console.log(`│  Avg Bets Placed:      ${avgBets.toLocaleString()}`);
    console.log(`│  Avg Skipped:          ${avgSkips.toLocaleString()}`);
    console.log(`│  Avg Wins:             ${avgWins.toLocaleString()}`);
    console.log(`│  Avg Losses:           ${avgLosses.toLocaleString()}`);
    console.log(`│`);
    console.log(`│  ★ SINGLE-BET ACCURACY:        ${avgAccuracy}%`);
    console.log(`│  ★ 5-LEVEL MART WIN RATE:       ${avgFiveLevel}%`);
    console.log(`│  ★ AVG RUIN EVENTS (L5 LOSS):   ${avgRuin}`);
    console.log(`│  ★ WORST LOSS STREAK:           ${maxLossStrk}`);
    console.log(`│`);

    // Per-level breakdown from first trial
    let t1 = trialResults[0];
    console.log(`│  Level Breakdown (Trial 1):`);
    for (let l = 1; l <= 5; l++) {
        let lb = t1.levelBets[l] || 0;
        let lw = t1.levelWins[l] || 0;
        let pct = lb > 0 ? ((lw / lb) * 100).toFixed(1) : "N/A";
        console.log(`│    L${l}: ${lw}/${lb} wins (${pct}%)`);
    }
    console.log(`└──────────────────────────────────────────────────────┘\n`);

    allResults.push({ tf, avgAccuracy, avgFiveLevel, avgRuin, maxLossStrk });
}

// ==================== SUMMARY ====================
console.log("═══════════════════════════════════════════════════════════════");
console.log("  SUMMARY TABLE");
console.log("═══════════════════════════════════════════════════════════════");
console.log("  TF    | Accuracy | 5-Lvl Win% | Ruins/Yr | Worst Streak");
console.log("  ------+----------+------------+----------+-------------");
for (let r of allResults) {
    console.log(`  ${r.tf.padEnd(5)} | ${String(r.avgAccuracy).padEnd(8)}%| ${String(r.avgFiveLevel).padEnd(10)}%| ${String(r.avgRuin).padEnd(8)} | ${r.maxLossStrk}`);
}

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  ANALYSIS & UPGRADE RECOMMENDATIONS");
console.log("═══════════════════════════════════════════════════════════════");
console.log(`
  CURRENT ENGINE REALITY:
  The GamblerMindsetEngine is a behavioral heuristic. On truly random 
  data (which Wingo results approximate), NO prediction engine can 
  exceed ~50% single-bet accuracy consistently, because each round is 
  an independent random event (0-9).

  The engine's VALUE comes from the 5-Level Martingale system:
  Even at ~50% accuracy, winning at least once in 5 consecutive 
  attempts has a probability of: 1 - (0.5)^5 = 96.875%

  UPGRADE PATH TO MAXIMIZE WIN RATE:

  1. INCREASE MARTINGALE DEPTH (5 → 7 or 8 levels)
     - 7 levels: 1-(0.5)^7 = 99.22% session win rate
     - 8 levels: 1-(0.5)^8 = 99.61% session win rate
     - Trade-off: Requires more capital reserve per session.

  2. STRICTER BET THRESHOLD (40 → 60 or 80)
     - Only bet when the engine detects EXTREME behavioral patterns.
     - Fewer bets, but each bet has slightly higher edge.
     - More SKIP rounds = more patience required.

  3. MULTI-TIMEFRAME CONFIRMATION
     - Only bet on 30s if 1m and 3m also agree on the same direction.
     - Cross-timeframe consensus can filter out noise.

  4. PATTERN MEMORY (Anti-Repeat Filter)
     - Track last N predictions and results.
     - If the engine is on a 3+ loss streak, auto-SKIP until patterns
       re-stabilize. This prevents compounding during chaotic phases.

  5. DYNAMIC LEVEL ENTRY
     - Don't always start at L1. If the engine's confidence is >80,
       start at L1. If confidence is 40-60, start at L3 (skip the 
       first 2 weaker levels entirely).

  ⚠️  100% WIN RATE IS MATHEMATICALLY IMPOSSIBLE on truly random data.
  The realistic ceiling with optimizations is ~98-99% SESSION win rate
  using a 7-8 level martingale with strict filtering.
`);
