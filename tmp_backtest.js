const fs = require('fs');

// Exact Wingo Engine Logic implementation
function getGamblerMove(seq) {
    if (seq.length < 5) return { move: seq[seq.length-1] || "Big", type: "Initializing", psych: "Gathering data", priority: 0 };
    
    let seq_len = seq.length;
    let recent_10 = seq_len >= 10 ? seq.slice(-10) : seq;
    
    let streak_val = seq[seq_len-1];
    let streak_len = 0;
    for (let i = seq_len-1; i >= 0; i--) {
        if (seq[i] === streak_val) streak_len++;
        else break;
    }
    
    let chop_len = 0;
    if (seq[seq_len-1] !== seq[seq_len-2]) {
        for (let i = seq_len-1; i > 0; i--) {
            if (seq[i] !== seq[i-1]) chop_len++;
            else break;
        }
    }
    
    let panic_pivot = 0;
    let prev_streak_len = 0;
    if (streak_len === 1 && seq_len >= 3) {
        let prev_streak_val = seq[seq_len-2];
        for (let i = seq_len-2; i >= 0; i--) {
            if (seq[i] === prev_streak_val) prev_streak_len++;
            else break;
        }
        if (prev_streak_len >= 3) {
            panic_pivot = prev_streak_len * 20;
        }
    }

    let exhaustion_score = Math.pow(streak_len, 1.8) * 15;
    let volatility_score = Math.pow(chop_len, 1.8) * 15;
    
    let scenarios = [];
    
    if (streak_len >= 3) scenarios.push({ move: opp(streak_val), score: exhaustion_score });
    if (chop_len >= 3) scenarios.push({ move: opp(streak_val), score: volatility_score });
    if (panic_pivot > 0) scenarios.push({ move: streak_val, score: panic_pivot });
    
    let val_counts = {};
    for (let val of recent_10) val_counts[val] = (val_counts[val] || 0) + 1;
    let dominant_val = Object.keys(val_counts).reduce((a, b) => val_counts[a] > val_counts[b] ? a : b);
    let bias_score = (val_counts[dominant_val] / recent_10.length) * 40;
    scenarios.push({ move: dominant_val, score: bias_score });
    
    let best = scenarios.sort((a,b) => b.score - a.score)[0];
    return { move: best.move, priority: best.score };
}

function opp(v) {
    if(v==="Big") return "Small"; if(v==="Small") return "Big";
    if(v==="Red") return "Green"; if(v==="Green") return "Red";
    return v;
}

function generateSequence(count) {
    let sizes = [], colors = [];
    // Generating pseudo-random sequence with slight human-biased streak clustering (realistic market)
    for(let i=0; i<count; i++) {
        // pure random 0-9
        let n = Math.floor(Math.random() * 10);
        
        // Let's introduce a 5% chance the market deliberately forms a streak (bots/manipulation simulation)
        if (i > 0 && Math.random() < 0.05) {
            sizes.push(sizes[sizes.length-1]);
        } else {
            sizes.push(n >= 5 ? "Big" : "Small");
        }

        if (i > 0 && Math.random() < 0.05) {
            colors.push(colors[colors.length-1]);
        } else {
            colors.push([0,2,4,6,8].includes(n) ? "Red" : "Green");
        }
    }
    return { sizes, colors };
}

function runBacktest(tfName, totalRounds) {
    console.log(`\n=============================\nBacktesting ${tfName} (200 Days | ${totalRounds} Rounds)\n=============================`);
    
    let seq = generateSequence(totalRounds);
    
    let metrics = {
        totalSignals: 0,
        skips: 0,
        betsMade: 0,
        totalWins: 0, // wins within L5
        totalLosses: 0,
        levelBreakdowns: 0, // Times it hit > L5
        l1_wins: 0,
        l2_wins: 0,
        l3_wins: 0,
        l4_wins: 0,
        l5_wins: 0
    };

    let pSizeHistory = [];
    let pColorHistory = [];

    // Martingale State
    let level = 1;
    let lastBet = null; // { move: "Big", target: "size" | "color" }
    
    // Process Data Linearly
    for(let i=20; i < totalRounds; i++) {
        // The game draw
        let resSize = seq.sizes[i];
        let resColor = seq.colors[i];

        // Did we win or lose the last bet?
        if (lastBet) {
            let won = false;
            if (lastBet.target === "size" && resSize === lastBet.move) won = true;
            if (lastBet.target === "color" && resColor === lastBet.move) won = true;

            if (won) {
                metrics.totalWins++;
                if (level === 1) metrics.l1_wins++;
                else if (level === 2) metrics.l2_wins++;
                else if (level === 3) metrics.l3_wins++;
                else if (level === 4) metrics.l4_wins++;
                else if (level === 5) metrics.l5_wins++;
                
                level = 1; // Reset Martingale on Win
            } else {
                metrics.totalLosses++;
                level++;
                if (level > 5) {
                    metrics.levelBreakdowns++;
                    level = 1; // Ruin reached, forced reset
                }
            }
            lastBet = null; // Resolved
        }

        // Generate prediction using sliding window
        let windowSizes = seq.sizes.slice(i-20, i);
        let windowColors = seq.colors.slice(i-20, i);

        let sBehavior = getGamblerMove(windowSizes);
        let cBehavior = getGamblerMove(windowColors);

        let priority = Math.max(sBehavior.priority, cBehavior.priority);
        let targetType = sBehavior.priority >= cBehavior.priority ? "size" : "color";
        let targetMove = sBehavior.priority >= cBehavior.priority ? opp(sBehavior.move) : opp(cBehavior.move);

        metrics.totalSignals++;
        
        if (priority >= 40) {
            // ACTION: BET
            metrics.betsMade++;
            lastBet = { move: targetMove, target: targetType };
        } else {
            metrics.skips++;
        }
    }

    let winRate = ((metrics.totalWins / metrics.betsMade) * 100).toFixed(2);
    let safetyRate = (100 - ((metrics.levelBreakdowns / metrics.betsMade) * 100)).toFixed(2);

    console.log(`- Base Win Rate (under 5 levels): ${winRate}%`);
    console.log(`- Safety Rate (Evaded >L5 Breakdown): ${safetyRate}%`);
    console.log(`- Skips (Low Vector): ${metrics.skips}`);
    console.log(`- Bets Placed: ${metrics.betsMade}`);
    console.log(`- Absolute Ruin Events (>L5): ${metrics.levelBreakdowns}`);
    
    console.log(`\nWin Distribution:`);
    console.log(` Level 1 Wins: ${metrics.l1_wins}`);
    console.log(` Level 2 Wins: ${metrics.l2_wins}`);
    console.log(` Level 3 Wins: ${metrics.l3_wins}`);
    console.log(` Level 4 Wins: ${metrics.l4_wins}`);
    console.log(` Level 5 Wins: ${metrics.l5_wins}`);
    
    return metrics;
}

// 200 Days Math
// 30s = 2 per min * 60 = 120/hr * 24 = 2880/day * 200 = 576,000
// 1m = 1 per min = 1440/day * 200 = 288,000
// 3m = 20/hr = 480/day * 200 = 96,000
// 5m = 12/hr = 288/day * 200 = 57,600

runBacktest("30 Second Timeframe", 576000);
runBacktest("1 Minute Timeframe", 288000);
runBacktest("3 Minute Timeframe", 96000);
runBacktest("5 Minute Timeframe", 57600);
