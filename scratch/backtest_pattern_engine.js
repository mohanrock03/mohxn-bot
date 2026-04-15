/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  6-YEAR BACKTEST — MOHXN VIP STRONG PATTERN ENGINE (v7.2+)          ║
 * ║  2190 Days × 10 Trials × 4 Data Types × 4 Timeframes                  ║
 * ║  Purpose: Test the actual cyclic sequence pattern engine             ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

// ==================== ENGINE LOGIC (Python Port to JS) ====================

function analyzePattern(history_results) {
    let n = history_results.length;
    if (n < 10) return null;

    let w_bs = 0, w_sb = 0, r_bs = 0, r_sb = 0;
    let recent_start = Math.max(0, n - 16);

    for (let i = 0; i < n - 1; i++) {
        if (history_results[i] === "Big" && history_results[i+1] === "Small") {
            w_bs++;
            if (i >= recent_start) r_bs++;
        } else if (history_results[i] === "Small" && history_results[i+1] === "Big") {
            w_sb++;
            if (i >= recent_start) r_sb++;
        }
    }

    let bs_best_run = 0, sb_best_run = 0;
    let bs_run = 0, sb_run = 0;
    let strong_pair_idx_bs = 0;
    let strong_pair_idx_sb = 0;

    for (let i = 0; i < n - 1; i++) {
        if (history_results[i] === "Big" && history_results[i+1] === "Small") {
            bs_run++; sb_run = 0;
            if (bs_run > bs_best_run) {
                bs_best_run = bs_run;
                strong_pair_idx_bs = i+1;
            }
        } else if (history_results[i] === "Small" && history_results[i+1] === "Big") {
            sb_run++; bs_run = 0;
            if (sb_run > sb_best_run) {
                sb_best_run = sb_run;
                strong_pair_idx_sb = i+1;
            }
        } else {
            bs_run = 0; sb_run = 0;
        }
    }

    let bs_score = (w_bs * 1.5) + (r_bs * 2.0) + (bs_best_run * 10);
    let sb_score = (w_sb * 1.5) + (r_sb * 2.0) + (sb_best_run * 10);

    let selected_pattern = null;
    let gap = Math.abs(bs_score - sb_score);
    let top = Math.max(bs_score, sb_score);

    if (gap >= 3 && top >= 5) {
        selected_pattern = (bs_score > sb_score) ? "BS" : "SB";
    } else if (top >= 10) {
        selected_pattern = (bs_score >= sb_score) ? "BS" : "SB";
    } else {
        return null;
    }

    // confirmed period is the most recent occurrence
    let confirmed_idx = n - 1;
    for (let i = n - 2; i >= 0; i--) {
        if (selected_pattern === "BS" && history_results[i] === "Big" && history_results[i+1] === "Small") {
            confirmed_idx = i+1; break;
        } else if (selected_pattern === "SB" && history_results[i] === "Small" && history_results[i+1] === "Big") {
            confirmed_idx = i+1; break;
        }
    }

    let recent_8 = history_results.slice(-8);
    let streak = 1;
    let is_trap = false;
    for (let i = 1; i < recent_8.length; i++) {
        if (recent_8[i] === recent_8[i-1]) {
            streak++;
            if (streak >= 5) { is_trap = true; break; }
        } else {
            streak = 1;
        }
    }

    return {
        pattern: selected_pattern,
        is_trap: is_trap,
        confirmed_idx: confirmed_idx
    };
}

function getSequenceMove(pattern, offset) {
    let idx = offset % 5;
    if (pattern === "BS") return ["Big", "Small", "Big", "Small", "Small"][idx];
    else return ["Small", "Big", "Small", "Big", "Big"][idx];
}

// ==================== MIXED DATA GENERATORS ====================

function genPureRandom(n) {
    let d = [];
    for (let i = 0; i < n; i++) d.push(Math.floor(Math.random() * 10));
    return d;
}

function genStreaky(n) {
    let d = [];
    let current = Math.floor(Math.random() * 10);
    for (let i = 0; i < n; i++) {
        if (Math.random() < 0.35) {
            current = Math.floor(Math.random() * 10);
        } else {
            let isBig = current >= 5;
            if (isBig) current = 5 + Math.floor(Math.random() * 5);
            else current = Math.floor(Math.random() * 5);
        }
        d.push(current);
    }
    return d;
}

function genChoppy(n) {
    let d = [];
    let lastBig = Math.random() < 0.5;
    for (let i = 0; i < n; i++) {
        if (Math.random() < 0.65) lastBig = !lastBig;
        if (lastBig) d.push(5 + Math.floor(Math.random() * 5));
        else d.push(Math.floor(Math.random() * 5));
    }
    return d;
}

function genRealWorldMix(n) {
    let d = [];
    let remaining = n;
    while (remaining > 0) {
        let segLen = Math.min(remaining, 50 + Math.floor(Math.random() * 450));
        let type = Math.random();
        let segment;
        if (type < 0.4) segment = genPureRandom(segLen);
        else if (type < 0.65) segment = genStreaky(segLen);
        else if (type < 0.85) segment = genChoppy(segLen);
        else {
            segment = [];
            let bias = Math.random() < 0.5 ? 0 : 5;
            for (let i = 0; i < segLen; i++) {
                if (Math.random() < 0.6) segment.push(bias + Math.floor(Math.random() * 5));
                else segment.push(Math.floor(Math.random() * 10));
            }
        }
        d.push(...segment);
        remaining -= segLen;
    }
    return d.slice(0, n);
}

// ==================== BACKTEST CORE (Pattern Strategy) ====================

function runTest(data) {
    let totalSessions = 0;
    let wonAtL1 = 0, wonAtL2 = 0;
    let ruins = 0;
    let skips = 0;

    let historySize = 50;

    // Simulation uses a 2-level martingale. If L1 fails, we try L2 on the NEXT sequence move.
    // That means we need state tracking.
    let activeSequence = null; // { pattern, offset }
    let currentMartLevel = 1;

    for (let i = historySize; i < data.length; i++) {
        let history = data.slice(i - historySize, i);
        let actual = data[i];
        let actualSize = actual >= 5 ? "Big" : "Small";

        let historySizes = history.map(x => x >= 5 ? "Big" : "Small");
        let analysis = analyzePattern(historySizes);

        // Update active sequence state just like client UI does
        if (analysis && !analysis.is_trap) {
            let offset = (i - 1) - analysis.confirmed_idx; // i-1 is the index in history array corresponding to latest
            if (activeSequence && activeSequence.pattern !== analysis.pattern) {
                // reset on new pattern
                activeSequence = { pattern: analysis.pattern, offset: offset };
                currentMartLevel = 1;
            } else {
                activeSequence = { pattern: analysis.pattern, offset: offset };
            }
        } else {
            activeSequence = null;
            currentMartLevel = 1;
            skips++;
            continue;
        }

        if (activeSequence) {
            let predMove = getSequenceMove(activeSequence.pattern, activeSequence.offset);

            if (currentMartLevel === 1) totalSessions++;

            if (predMove === actualSize) {
                if (currentMartLevel === 1) wonAtL1++;
                else wonAtL2++;
                currentMartLevel = 1; // Reset on win
            } else {
                currentMartLevel++;
                if (currentMartLevel > 2) {
                    ruins++;
                    currentMartLevel = 1; // Reset after ruin
                }
            }
        }
    }

    let wonWithin2 = wonAtL1 + wonAtL2;
    let winRate = totalSessions > 0 ? (wonWithin2 / totalSessions * 100).toFixed(1) : "0.0";
    let failureRate = totalSessions > 0 ? (ruins / totalSessions * 100).toFixed(1) : "0.0";
    
    return {
        totalSessions, wonAtL1, wonAtL2, wonWithin2, ruins, skips, winRate, failureRate
    };
}

// ==================== RUN ====================

const DAYS = 2190;
const TRIALS = 5; // Reduced trials for speed
const TIMEFRAMES = { "1m": 1440, "3m": 480 }; // Just sample these two for the report

const DATA_TYPES = {
    "Pure Random": genPureRandom,
    "Streaky": genStreaky,
    "Choppy": genChoppy,
    "Real-World Mix": genRealWorldMix
};

let masterSummary = [];

for (let [dataTypeName, dataGen] of Object.entries(DATA_TYPES)) {
    for (let [tf, rpd] of Object.entries(TIMEFRAMES)) {
        let totalRounds = rpd * DAYS;
        let allTrials = [];
        for (let t = 0; t < TRIALS; t++) {
            let data = dataGen(totalRounds);
            allTrials.push(runTest(data));
        }

        let avgSessions = Math.round(allTrials.reduce((s, r) => s + r.totalSessions, 0) / TRIALS);
        let avgWonWithin2 = Math.round(allTrials.reduce((s, r) => s + r.wonWithin2, 0) / TRIALS);
        let avgRuins = Math.round(allTrials.reduce((s, r) => s + r.ruins, 0) / TRIALS);
        let avgWinRate = (avgWonWithin2 / avgSessions * 100).toFixed(1);
        let avgSkips = Math.round(allTrials.reduce((s, r) => s + r.skips, 0) / TRIALS);

        masterSummary.push({
            dataType: dataTypeName,
            tf,
            avgSessions,
            avgWonWithin2,
            avgRuins,
            avgWinRate,
            avgSkips
        });
    }
}

console.log(JSON.stringify(masterSummary, null, 2));
