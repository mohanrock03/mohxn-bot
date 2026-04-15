/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  MOHXN AUTONOMOUS PROFIT ENGINE – 2-YEAR BACKTEST (730 DAYS)    ║
 * ║  Base Bet: 10 Rs | Daily Target: 300 Rs | 1.95x Payout         ║
 * ║  Comparing 3 Strategies × 4 Timeframes × 5 Trials              ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 * 
 * Run: node backtest_2year.js
 */

// ==================== ENGINE (Mirror of app.js) ====================

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

// ==================== STRATEGY DEFINITIONS ====================

const PAYOUT = 1.95; // Platform payout multiplier

// 7-level martingale table for 10 Rs base (each level recovers ALL prior losses + profit)
function buildMartTable(baseBet, levels) {
    let table = [];
    let cumulative = 0;
    for (let i = 0; i < levels; i++) {
        let bet;
        if (i === 0) {
            bet = baseBet;
        } else {
            // Need to recover cumulative losses + make at least baseBet profit
            bet = Math.ceil((cumulative + baseBet) / (PAYOUT - 1));
        }
        cumulative += bet;
        let winPayout = Math.floor(bet * PAYOUT);
        let netProfit = winPayout - cumulative;
        table.push({ level: i + 1, bet, cumulative, winPayout, netProfit });
    }
    return table;
}

const STRATEGIES = {
    A: {
        name: "AGGRESSIVE (Current Engine)",
        levels: 5,
        threshold: 40,
        dailyTarget: 300,
        dailyStopLoss: -500,
        maxSessionsPerDay: 999, // no limit
        cooldownAfterRuin: 0,  // no cooldown
        baseBet: 10
    },
    B: {
        name: "BALANCED (Recommended)",
        levels: 7,
        threshold: 50,
        dailyTarget: 300,
        dailyStopLoss: -600,
        maxSessionsPerDay: 50,
        cooldownAfterRuin: 3,  // skip 3 rounds after ruin
        baseBet: 10
    },
    C: {
        name: "CONSERVATIVE (Safe)",
        levels: 7,
        threshold: 65,
        dailyTarget: 300,
        dailyStopLoss: -400,
        maxSessionsPerDay: 30,
        cooldownAfterRuin: 5,
        baseBet: 10
    }
};

// ==================== BACKTEST CORE ====================

function generateData(totalRounds) {
    let data = [];
    for (let i = 0; i < totalRounds; i++) {
        data.push(Math.floor(Math.random() * 10));
    }
    return data;
}

function runBacktest(data, roundsPerDay, strategy) {
    const WINDOW = 20;
    const martTable = buildMartTable(strategy.baseBet, strategy.levels);

    let martLevel = 0; // 0-indexed into martTable
    let dailyPnL = 0;
    let dailySessionCount = 0;
    let cooldownRemaining = 0;
    let dayIndex = 0;
    let roundInDay = 0;

    // Daily tracking
    let dailyResults = []; // array of { day, pnl, sessions, wins, losses, ruins }
    let currentDay = { day: 0, pnl: 0, sessions: 0, wins: 0, losses: 0, ruins: 0, bets: 0 };
    let dayPaused = false; // true when daily target or stop-loss hit

    // Global tracking
    let totalBets = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalSkips = 0;
    let totalRuins = 0;
    let totalPnL = 0;
    let maxDrawdown = 0;
    let peakPnL = 0;
    let levelWinCounts = {};
    for (let i = 1; i <= strategy.levels; i++) levelWinCounts[i] = 0;

    // Session tracking
    let inSession = false;

    for (let i = WINDOW; i < data.length; i++) {
        // Day boundary check
        roundInDay++;
        if (roundInDay > roundsPerDay) {
            // Save day
            dailyResults.push({ ...currentDay });
            dayIndex++;
            roundInDay = 1;
            currentDay = { day: dayIndex, pnl: 0, sessions: 0, wins: 0, losses: 0, ruins: 0, bets: 0 };
            dayPaused = false;
            dailySessionCount = 0;
            // Don't reset martingale level across days — continue session
        }

        // Check if day is paused (target reached or stop-loss hit)
        if (dayPaused) {
            totalSkips++;
            continue;
        }

        // Check daily session limit
        if (dailySessionCount >= strategy.maxSessionsPerDay) {
            totalSkips++;
            continue;
        }

        // Cooldown after ruin
        if (cooldownRemaining > 0) {
            cooldownRemaining--;
            totalSkips++;
            continue;
        }

        // Generate prediction
        let history = data.slice(i - WINDOW, i);
        let pred = predict(history);
        if (!pred) { totalSkips++; continue; }

        // Skip if below threshold
        if (pred.priority < strategy.threshold) {
            totalSkips++;
            continue;
        }

        // Place bet at current martingale level
        let betInfo = martTable[martLevel];
        let betAmount = betInfo.bet;
        totalBets++;
        currentDay.bets++;

        if (!inSession) {
            inSession = true;
            currentDay.sessions++;
            dailySessionCount++;
        }

        // Check actual result
        let actualResult = data[i];
        let actualSize = actualResult >= 5 ? "Big" : "Small";
        let actualColor = [0, 2, 4, 6, 8].includes(actualResult) ? "Red" : "Green";
        
        let isWin = false;
        if (pred.betType === "size") isWin = (pred.signal === actualSize);
        else isWin = (pred.signal === actualColor);

        if (isWin) {
            // WIN — collect payout, reset martingale
            let profit = betInfo.netProfit;
            totalPnL += profit;
            currentDay.pnl += profit;
            totalWins++;
            currentDay.wins++;
            levelWinCounts[martLevel + 1]++;

            martLevel = 0; // Reset to L1
            inSession = false;

            // Check daily target
            if (currentDay.pnl >= strategy.dailyTarget) {
                dayPaused = true;
            }
        } else {
            // LOSS — escalate martingale
            totalLosses++;
            currentDay.losses++;

            martLevel++;
            if (martLevel >= strategy.levels) {
                // RUIN — lost all levels
                let totalLost = martTable[strategy.levels - 1].cumulative;
                totalPnL -= totalLost;
                currentDay.pnl -= totalLost;
                currentDay.ruins++;
                totalRuins++;

                martLevel = 0; // Reset
                inSession = false;
                cooldownRemaining = strategy.cooldownAfterRuin;

                // Check daily stop-loss
                if (currentDay.pnl <= strategy.dailyStopLoss) {
                    dayPaused = true;
                }
            } else {
                // Don't subtract yet — money is "at risk" until session resolves
                // The cumulative is tracked in the martingale table
            }
        }

        // Track peak / drawdown
        if (totalPnL > peakPnL) peakPnL = totalPnL;
        let drawdown = peakPnL - totalPnL;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Save last day
    dailyResults.push({ ...currentDay });

    // Compute daily statistics
    let profitableDays = dailyResults.filter(d => d.pnl > 0).length;
    let lossDays = dailyResults.filter(d => d.pnl < 0).length;
    let breakEvenDays = dailyResults.filter(d => d.pnl === 0).length;
    let bestDay = Math.max(...dailyResults.map(d => d.pnl));
    let worstDay = Math.min(...dailyResults.map(d => d.pnl));
    let avgDailyPnl = totalPnL / dailyResults.length;

    // Target-hit days (hit the daily target)
    let targetHitDays = dailyResults.filter(d => d.pnl >= strategy.dailyTarget).length;

    // Longest losing day streak
    let maxLossDayStreak = 0;
    let currentLossDayStreak = 0;
    for (let d of dailyResults) {
        if (d.pnl < 0) { currentLossDayStreak++; if (currentLossDayStreak > maxLossDayStreak) maxLossDayStreak = currentLossDayStreak; }
        else currentLossDayStreak = 0;
    }

    return {
        totalDays: dailyResults.length,
        totalBets,
        totalWins,
        totalLosses,
        totalSkips,
        totalRuins,
        totalPnL: Math.round(totalPnL),
        profitableDays,
        lossDays,
        breakEvenDays,
        profitableDaysPct: ((profitableDays / dailyResults.length) * 100).toFixed(1),
        targetHitDays,
        targetHitPct: ((targetHitDays / dailyResults.length) * 100).toFixed(1),
        bestDay: Math.round(bestDay),
        worstDay: Math.round(worstDay),
        avgDailyPnl: Math.round(avgDailyPnl),
        maxDrawdown: Math.round(maxDrawdown),
        maxLossDayStreak,
        winRate: totalBets > 0 ? ((totalWins / totalBets) * 100).toFixed(1) : "0",
        levelWinCounts,
        dailyResults
    };
}

// ==================== RUNNER ====================

const TIMEFRAMES = {
    "30s": 2880,
    "1m":  1440,
    "3m":  480,
    "5m":  288
};

const TRIALS = 5;
const DAYS = 730; // 2 years

console.log("╔═══════════════════════════════════════════════════════════════════════╗");
console.log("║  MOHXN AUTONOMOUS ENGINE – 2-YEAR BACKTEST (730 DAYS × 5 TRIALS)    ║");
console.log("║  Base Bet: 10 Rs | Payout: 1.95x | Daily Target: 300 Rs             ║");
console.log("╚═══════════════════════════════════════════════════════════════════════╝\n");

// Print martingale tables
for (let [key, strat] of Object.entries(STRATEGIES)) {
    let table = buildMartTable(strat.baseBet, strat.levels);
    console.log(`\n📊 Strategy ${key}: ${strat.name}`);
    console.log(`   Threshold: ${strat.threshold} | Levels: ${strat.levels} | Daily Target: ${strat.dailyTarget} | Stop-Loss: ${strat.dailyStopLoss}`);
    console.log(`   Cooldown after ruin: ${strat.cooldownAfterRuin} rounds | Max sessions/day: ${strat.maxSessionsPerDay}`);
    console.log(`   Martingale Table:`);
    console.log(`   ${'Lvl'.padEnd(4)} ${'Bet'.padEnd(8)} ${'Cumul'.padEnd(8)} ${'WinPay'.padEnd(8)} ${'Profit'.padEnd(8)}`);
    for (let row of table) {
        console.log(`   L${String(row.level).padEnd(3)} ${String(row.bet + '₹').padEnd(8)} ${String(row.cumulative + '₹').padEnd(8)} ${String(row.winPayout + '₹').padEnd(8)} ${row.netProfit >= 0 ? '+' : ''}${row.netProfit}₹`);
    }
    console.log(`   💰 Max Capital Needed per Session: ${table[table.length-1].cumulative}₹`);
}

console.log("\n" + "═".repeat(75));
console.log("  RUNNING BACKTESTS... (This may take a minute)\n");

let summaryTable = [];

for (let [tf, rpd] of Object.entries(TIMEFRAMES)) {
    let totalRounds = rpd * DAYS;
    
    console.log(`\n┌─── TIMEFRAME: ${tf.toUpperCase()} (${rpd}/day × ${DAYS} days = ${totalRounds.toLocaleString()} rounds) ───┐`);

    for (let [stratKey, strategy] of Object.entries(STRATEGIES)) {
        let trialResults = [];

        for (let trial = 1; trial <= TRIALS; trial++) {
            let data = generateData(totalRounds);
            let result = runBacktest(data, rpd, strategy);
            trialResults.push(result);
        }

        // Average across trials
        let avg = (field) => trialResults.reduce((s, r) => s + (typeof r[field] === 'string' ? parseFloat(r[field]) : r[field]), 0) / TRIALS;

        let avgResult = {
            tf,
            strategy: stratKey,
            stratName: strategy.name,
            totalPnL: Math.round(avg('totalPnL')),
            avgDailyPnl: Math.round(avg('avgDailyPnl')),
            profitableDaysPct: avg('profitableDaysPct').toFixed(1),
            targetHitPct: avg('targetHitPct').toFixed(1),
            totalBets: Math.round(avg('totalBets')),
            winRate: avg('winRate').toFixed(1),
            totalRuins: Math.round(avg('totalRuins')),
            maxDrawdown: Math.round(avg('maxDrawdown')),
            bestDay: Math.round(Math.max(...trialResults.map(r => r.bestDay))),
            worstDay: Math.round(Math.min(...trialResults.map(r => r.worstDay))),
            maxLossDayStreak: Math.max(...trialResults.map(r => r.maxLossDayStreak))
        };

        console.log(`│`);
        console.log(`│  Strategy ${stratKey}: ${strategy.name}`);
        console.log(`│  ──────────────────────────────────────────────────`);
        console.log(`│  💰 Total 2-Year P&L:       ${avgResult.totalPnL >= 0 ? '+' : ''}${avgResult.totalPnL.toLocaleString()}₹`);
        console.log(`│  📈 Avg Daily P&L:          ${avgResult.avgDailyPnl >= 0 ? '+' : ''}${avgResult.avgDailyPnl}₹`);
        console.log(`│  ✅ Profitable Days:        ${avgResult.profitableDaysPct}%`);
        console.log(`│  🎯 Daily Target Hit:       ${avgResult.targetHitPct}%`);
        console.log(`│  📊 Single-Bet Win Rate:    ${avgResult.winRate}%`);
        console.log(`│  🎲 Total Bets:             ${avgResult.totalBets.toLocaleString()}`);
        console.log(`│  💀 Ruin Events (all lost):  ${avgResult.totalRuins}`);
        console.log(`│  📉 Max Drawdown:           -${avgResult.maxDrawdown}₹`);
        console.log(`│  🏆 Best Single Day:        +${avgResult.bestDay}₹`);
        console.log(`│  ⚠️  Worst Single Day:       ${avgResult.worstDay}₹`);
        console.log(`│  🔥 Max Losing Day Streak:  ${avgResult.maxLossDayStreak} days`);

        summaryTable.push(avgResult);
    }

    console.log(`└${"─".repeat(70)}┘`);
}

// ==================== FINAL SUMMARY ====================

console.log("\n\n" + "═".repeat(75));
console.log("  📊 FINAL COMPARISON TABLE (Avg of 5 trials, 730 days each)");
console.log("═".repeat(75));
console.log(`  ${'TF'.padEnd(4)} | ${'Strategy'.padEnd(12)} | ${'2Y P&L'.padEnd(10)} | ${'Daily'.padEnd(7)} | ${'Profit%'.padEnd(8)} | ${'Target%'.padEnd(8)} | ${'Ruins'.padEnd(6)} | ${'MaxDD'.padEnd(8)} | ${'LoseStrk'.padEnd(8)}`);
console.log("  " + "─".repeat(90));

for (let r of summaryTable) {
    let pnlStr = (r.totalPnL >= 0 ? '+' : '') + r.totalPnL.toLocaleString() + '₹';
    let dailyStr = (r.avgDailyPnl >= 0 ? '+' : '') + r.avgDailyPnl + '₹';
    console.log(`  ${r.tf.padEnd(4)} | ${r.strategy.padEnd(12)} | ${pnlStr.padEnd(10)} | ${dailyStr.padEnd(7)} | ${(r.profitableDaysPct + '%').padEnd(8)} | ${(r.targetHitPct + '%').padEnd(8)} | ${String(r.totalRuins).padEnd(6)} | ${('-' + r.maxDrawdown + '₹').padEnd(8)} | ${String(r.maxLossDayStreak).padEnd(8)}`);
}

// ==================== RECOMMENDATION ====================

// Find best strategy-timeframe combo for 1m and 3m
let candidates = summaryTable.filter(r => r.tf === "1m" || r.tf === "3m");
let bestCombo = candidates.sort((a, b) => {
    // Score = daily P&L × profitable days % × (1 / max loss streak)
    let scoreA = a.avgDailyPnl * parseFloat(a.profitableDaysPct) / (a.maxLossDayStreak || 1);
    let scoreB = b.avgDailyPnl * parseFloat(b.profitableDaysPct) / (b.maxLossDayStreak || 1);
    return scoreB - scoreA;
})[0];

console.log("\n" + "═".repeat(75));
console.log("  🏆 RECOMMENDATION FOR YOUR SETUP");
console.log("═".repeat(75));
console.log(`
  Based on 2-year simulation (730 days × 5 trials):
  
  ⭐ BEST COMBINATION: ${bestCombo.tf.toUpperCase()} + Strategy ${bestCombo.strategy}
     "${bestCombo.stratName}"
  
  📊 Expected Results:
     • Daily P&L:          ${bestCombo.avgDailyPnl >= 0 ? '+' : ''}${bestCombo.avgDailyPnl}₹ avg
     • 2-Year Total:       ${bestCombo.totalPnL >= 0 ? '+' : ''}${bestCombo.totalPnL.toLocaleString()}₹
     • Profitable Days:    ${bestCombo.profitableDaysPct}% of days
     • Daily Target Hit:   ${bestCombo.targetHitPct}% of days  
     • Ruin Events:        ${bestCombo.totalRuins} in 730 days
     • Max Drawdown:       -${bestCombo.maxDrawdown}₹
     • Max Bad Streak:     ${bestCombo.maxLossDayStreak} consecutive losing days
  
  💡 Key Settings for Autopilot:
     • Base Bet:     ${STRATEGIES[bestCombo.strategy].baseBet}₹
     • Levels:       ${STRATEGIES[bestCombo.strategy].levels}
     • Threshold:    ${STRATEGIES[bestCombo.strategy].threshold}
     • Daily Target: ${STRATEGIES[bestCombo.strategy].dailyTarget}₹
     • Stop-Loss:    ${STRATEGIES[bestCombo.strategy].dailyStopLoss}₹
     • Cooldown:     ${STRATEGIES[bestCombo.strategy].cooldownAfterRuin} rounds after ruin
  
  ⚠️  IMPORTANT NOTES:
  • This is on RANDOM data. Real platform may have patterns that help OR hurt.
  • Always start with MINIMUM bets to validate in live conditions.
  • The system auto-stops when daily target is hit = NO NEED TO WATCH.
  • Keep capital reserve of at least 3x max daily stop-loss = ${Math.abs(STRATEGIES[bestCombo.strategy].dailyStopLoss) * 3}₹
`);
