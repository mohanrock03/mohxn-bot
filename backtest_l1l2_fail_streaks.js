/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  BACKTEST: CONSECUTIVE L1+L2 FAILURES IN 5-LEVEL MARTINGALE     ║
 * ║  2-Year Data (730 Days) × 5 Trials × 4 Timeframes              ║
 * ║                                                                   ║
 * ║  Question: How many times IN A ROW do both L1 and L2 fail       ║
 * ║  (i.e., session needs L3 or deeper)?                             ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 *
 * Run: node backtest_l1l2_fail_streaks.js
 */

// ==================== ENGINE (Same as app.js) ====================

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

// ==================== BACKTEST CORE ====================

const WINDOW = 20;
const THRESHOLD = 40;
const MART_LEVELS = 5;

function runL1L2FailStreakTest(totalRounds) {
    // Generate random data
    let data = [];
    for (let i = 0; i < totalRounds; i++) data.push(Math.floor(Math.random() * 10));

    let martLevel = 1;
    let totalSessions = 0;      // Total martingale sessions
    let wonAtL1 = 0;
    let wonAtL2 = 0;
    let l1l2Failures = 0;       // Sessions where both L1 AND L2 lost (went to L3+)
    let totalRuins = 0;         // Full 5-level busts

    // STREAK TRACKING: consecutive sessions where L1+L2 both failed
    let currentL1L2FailStreak = 0;
    let maxL1L2FailStreak = 0;
    let failStreakDistribution = {}; // { streakLength: count }
    let allFailStreaks = [];         // Every streak occurrence

    // Also track: consecutive sessions where we WON within L1 or L2
    let currentL1L2WinStreak = 0;
    let maxL1L2WinStreak = 0;

    // Level win tracking
    let levelWins = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let levelBets = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (let i = WINDOW; i < data.length; i++) {
        let history = data.slice(i - WINDOW, i);
        let actual = data[i];

        let pred = predict(history);
        if (!pred) continue;
        if (pred.priority < THRESHOLD) continue;

        // Bet placed at current level
        levelBets[martLevel]++;

        let aSize = actual >= 5 ? "Big" : "Small";
        let aColor = [0, 2, 4, 6, 8].includes(actual) ? "Red" : "Green";
        let isWin = false;
        if (pred.betType === "size") isWin = (pred.signal === aSize);
        else isWin = (pred.signal === aColor);

        if (martLevel === 1) totalSessions++;  // New session

        if (isWin) {
            levelWins[martLevel]++;

            if (martLevel === 1) {
                wonAtL1++;
                // Session WON within first 2 levels
                currentL1L2WinStreak++;
                if (currentL1L2WinStreak > maxL1L2WinStreak) maxL1L2WinStreak = currentL1L2WinStreak;
                // End any fail streak
                if (currentL1L2FailStreak > 0) {
                    allFailStreaks.push(currentL1L2FailStreak);
                    failStreakDistribution[currentL1L2FailStreak] = (failStreakDistribution[currentL1L2FailStreak] || 0) + 1;
                    currentL1L2FailStreak = 0;
                }
            } else if (martLevel === 2) {
                wonAtL2++;
                // Session WON within first 2 levels
                currentL1L2WinStreak++;
                if (currentL1L2WinStreak > maxL1L2WinStreak) maxL1L2WinStreak = currentL1L2WinStreak;
                // End any fail streak
                if (currentL1L2FailStreak > 0) {
                    allFailStreaks.push(currentL1L2FailStreak);
                    failStreakDistribution[currentL1L2FailStreak] = (failStreakDistribution[currentL1L2FailStreak] || 0) + 1;
                    currentL1L2FailStreak = 0;
                }
            } else {
                // Won at L3, L4, or L5 — this means L1+L2 had already failed
                // The fail was already counted when we hit L3
                // Win streak resets
                currentL1L2WinStreak = 0;
            }

            martLevel = 1; // Reset after win
        } else {
            // LOSS
            martLevel++;

            if (martLevel === 3) {
                // Just failed L2 → L1+L2 both failed this session
                l1l2Failures++;
                currentL1L2FailStreak++;
                currentL1L2WinStreak = 0;
                if (currentL1L2FailStreak > maxL1L2FailStreak) maxL1L2FailStreak = currentL1L2FailStreak;
            }

            if (martLevel > MART_LEVELS) {
                // Full ruin
                totalRuins++;
                martLevel = 1;
            }
        }
    }

    // Close any trailing fail streak
    if (currentL1L2FailStreak > 0) {
        allFailStreaks.push(currentL1L2FailStreak);
        failStreakDistribution[currentL1L2FailStreak] = (failStreakDistribution[currentL1L2FailStreak] || 0) + 1;
    }

    return {
        totalSessions,
        wonAtL1,
        wonAtL2,
        wonWithin2: wonAtL1 + wonAtL2,
        l1l2Failures,
        totalRuins,
        maxL1L2FailStreak,
        maxL1L2WinStreak,
        failStreakDistribution,
        allFailStreaks,
        levelWins,
        levelBets,
        l1l2FailRate: totalSessions > 0 ? ((l1l2Failures / totalSessions) * 100) : 0,
        l1l2WinRate: totalSessions > 0 ? (((wonAtL1 + wonAtL2) / totalSessions) * 100) : 0
    };
}

// ==================== RUN ====================

const TIMEFRAMES = { "30s": 2880, "1m": 1440, "3m": 480, "5m": 288 };
const DAYS = 730;
const TRIALS = 5;

console.log("╔═══════════════════════════════════════════════════════════════════════╗");
console.log("║  CONSECUTIVE L1+L2 FAILURE STREAKS IN 5-LEVEL MARTINGALE            ║");
console.log("║  2-Year Backtest (730 Days × 5 Trials × 4 Timeframes)              ║");
console.log("║  Question: How many times IN A ROW do L1 & L2 both fail?            ║");
console.log("╚═══════════════════════════════════════════════════════════════════════╝\n");

console.log("  A 'L1+L2 failure' = one session where both Level 1 AND Level 2 lost,");
console.log("  meaning the session had to escalate to Level 3 or deeper.\n");
console.log("  A 'consecutive streak' = multiple sessions in a row where this happens.\n");

for (let [tf, rpd] of Object.entries(TIMEFRAMES)) {
    let totalRounds = rpd * DAYS;

    console.log(`\n${"═".repeat(75)}`);
    console.log(`  TIMEFRAME: ${tf.toUpperCase()} (${rpd}/day × ${DAYS} days = ${totalRounds.toLocaleString()} rounds)`);
    console.log(`${"═".repeat(75)}\n`);

    let allTrials = [];

    for (let trial = 1; trial <= TRIALS; trial++) {
        let result = runL1L2FailStreakTest(totalRounds);
        allTrials.push(result);

        console.log(`  Trial ${trial}:`);
        console.log(`    Total Sessions:              ${result.totalSessions.toLocaleString()}`);
        console.log(`    Won at L1:                   ${result.wonAtL1.toLocaleString()} (${(result.wonAtL1 / result.totalSessions * 100).toFixed(1)}%)`);
        console.log(`    Won at L2:                   ${result.wonAtL2.toLocaleString()} (${(result.wonAtL2 / result.totalSessions * 100).toFixed(1)}%)`);
        console.log(`    ★ Won within L1 or L2:       ${result.wonWithin2.toLocaleString()} (${result.l1l2WinRate.toFixed(1)}%)`);
        console.log(`    ✗ L1+L2 both failed:         ${result.l1l2Failures.toLocaleString()} (${result.l1l2FailRate.toFixed(1)}%)`);
        console.log(`    💀 Full Ruins (all 5 lost):   ${result.totalRuins}`);
        console.log(`    🔥 Max CONSECUTIVE L1+L2 fails: ${result.maxL1L2FailStreak}`);
        console.log(`    ✅ Max CONSECUTIVE L1/L2 wins:  ${result.maxL1L2WinStreak}`);

        // Show fail streak distribution
        let sortedStreaks = Object.entries(result.failStreakDistribution)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

        if (sortedStreaks.length > 0) {
            console.log(`    📊 Fail Streak Distribution:`);
            for (let [streakLen, count] of sortedStreaks) {
                let bar = '█'.repeat(Math.min(count, 40));
                console.log(`       ${streakLen}× in a row: ${String(count).padEnd(5)} times ${bar}`);
            }
        }
        console.log();
    }

    // AGGREGATE across 5 trials
    let avgSessions = Math.round(allTrials.reduce((s, r) => s + r.totalSessions, 0) / TRIALS);
    let avgL1Wins = Math.round(allTrials.reduce((s, r) => s + r.wonAtL1, 0) / TRIALS);
    let avgL2Wins = Math.round(allTrials.reduce((s, r) => s + r.wonAtL2, 0) / TRIALS);
    let avgL1L2Failures = Math.round(allTrials.reduce((s, r) => s + r.l1l2Failures, 0) / TRIALS);
    let avgRuins = Math.round(allTrials.reduce((s, r) => s + r.totalRuins, 0) / TRIALS);
    let worstStreak = Math.max(...allTrials.map(r => r.maxL1L2FailStreak));
    let bestWinStreak = Math.max(...allTrials.map(r => r.maxL1L2WinStreak));
    let avgWinRate = allTrials.reduce((s, r) => s + r.l1l2WinRate, 0) / TRIALS;
    let avgFailRate = allTrials.reduce((s, r) => s + r.l1l2FailRate, 0) / TRIALS;

    // Merged distribution across all trials
    let mergedDist = {};
    for (let trial of allTrials) {
        for (let [k, v] of Object.entries(trial.failStreakDistribution)) {
            mergedDist[k] = (mergedDist[k] || 0) + v;
        }
    }

    console.log(`  ┌─── ${tf.toUpperCase()} AGGREGATE (Avg of ${TRIALS} Trials) ──────────────────────┐`);
    console.log(`  │  Avg Sessions/2yr:            ${avgSessions.toLocaleString()}`);
    console.log(`  │  Avg Won at L1:               ${avgL1Wins.toLocaleString()}`);
    console.log(`  │  Avg Won at L2:               ${avgL2Wins.toLocaleString()}`);
    console.log(`  │  ★ L1+L2 Win Rate:            ${avgWinRate.toFixed(1)}%`);
    console.log(`  │  ✗ L1+L2 Fail Rate:           ${avgFailRate.toFixed(1)}%`);
    console.log(`  │  Avg L1+L2 Failures/2yr:      ${avgL1L2Failures.toLocaleString()}`);
    console.log(`  │  Avg Ruins/2yr:               ${avgRuins}`);
    console.log(`  │`);
    console.log(`  │  🔥 WORST CONSECUTIVE L1+L2 FAIL STREAK: ${worstStreak}`);
    console.log(`  │  ✅ BEST CONSECUTIVE L1/L2 WIN STREAK:   ${bestWinStreak}`);
    console.log(`  │`);

    // Merged distribution
    let sortedMerged = Object.entries(mergedDist).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    console.log(`  │  📊 Combined Fail Streak Distribution (all ${TRIALS} trials):`);
    for (let [streakLen, count] of sortedMerged) {
        let bar = '█'.repeat(Math.min(Math.round(count / TRIALS), 40));
        let avgCount = (count / TRIALS).toFixed(1);
        console.log(`  │     ${String(streakLen).padEnd(3)}× in a row: ${String(count).padEnd(5)} total (avg ${avgCount}/trial) ${bar}`);
    }

    console.log(`  └${"─".repeat(65)}┘`);
}

// ==================== FINAL SUMMARY ====================

console.log("\n\n" + "═".repeat(75));
console.log("  📊 FINAL SUMMARY: CONSECUTIVE L1+L2 FAILURE ANALYSIS");
console.log("═".repeat(75));

console.log(`\n  WHAT THIS MEANS:\n`);
console.log(`  In a 5-level martingale, each "session" starts at Level 1.`);
console.log(`  If L1 loses, it goes to L2. If L2 also loses, that's a "L1+L2 failure".`);
console.log(`  The session then needs L3, L4, or L5 to recover.\n`);
console.log(`  This test tracks how many sessions IN A ROW had L1+L2 both fail.`);
console.log(`  Higher consecutive failures = more capital at risk, as each`);
console.log(`  session is escalating to deeper martingale levels.\n`);

console.log(`  MATH EXPECTATION (with ~50% single-bet accuracy):`);
console.log(`  - P(L1 fails) ≈ 50%`);
console.log(`  - P(L1+L2 both fail) ≈ 25% (0.5 × 0.5)`);
console.log(`  - P(2 consecutive sessions L1+L2 fail) ≈ 6.25%`);
console.log(`  - P(3 consecutive) ≈ 1.56%`);
console.log(`  - P(4 consecutive) ≈ 0.39%`);
console.log(`  - P(5 consecutive) ≈ 0.10%\n`);
console.log(`  With thousands of sessions over 2 years, long streaks`);
console.log(`  WILL happen eventually — this test shows exactly how often.\n`);
