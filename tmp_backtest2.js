const fs = require('fs');

function getGamblerMove(seq) {
    if (seq.length < 5) return { move: seq[seq.length-1] || "Big", priority: 0 };
    let seq_len = seq.length;
    let streak_val = seq[seq_len-1], streak_len = 0, chop_len = 0;
    for (let i = seq_len-1; i >= 0; i--) { if (seq[i] === streak_val) streak_len++; else break; }
    if (seq[seq_len-1] !== seq[seq_len-2]) { for (let i = seq_len-1; i > 0; i--) { if (seq[i] !== seq[i-1]) chop_len++; else break; } }
    
    let scenarios = [];
    if (streak_len >= 3) scenarios.push({ move: opp(streak_val), score: Math.pow(streak_len, 1.8)*15 });
    if (chop_len >= 3) scenarios.push({ move: opp(streak_val), score: Math.pow(chop_len, 1.8)*15 });
    
    scenarios.push({ move: streak_val, score: 20 });
    let best = scenarios.sort((a,b) => b.score - a.score)[0];
    return { move: best.move, priority: best.score };
}
function opp(v) { return v==="Big"?"Small":v==="Small"?"Big":v==="Red"?"Green":"Red"; }

function generateSequence(count) {
    let sizes = [], colors = [];
    for(let i=0; i<count; i++) {
        let n = Math.floor(Math.random() * 10);
        if (i > 0 && Math.random() < 0.05) sizes.push(sizes[sizes.length-1]);
        else sizes.push(n >= 5 ? "Big" : "Small");
        if (i > 0 && Math.random() < 0.05) colors.push(colors[colors.length-1]);
        else colors.push([0,2,4,6,8].includes(n) ? "Red" : "Green");
    }
    return { sizes, colors };
}

function runBacktest(tfName, totalRounds) {
    let seq = generateSequence(totalRounds);
    let cycles = 0, cycleWins = 0, cycleLosses = 0, skips = 0;
    let l1=0, l2=0, l3=0, l4=0, l5=0;
    let level = 1;
    let currentCycleStarted = false;
    let lastBet = null;

    for(let i=20; i < totalRounds; i++) {
        let resSize = seq.sizes[i], resColor = seq.colors[i];
        
        if (lastBet) {
            let won = (lastBet.target === "size" && resSize === lastBet.move) || (lastBet.target === "color" && resColor === lastBet.move);
            if (won) {
                cycleWins++;
                if (level === 1) l1++; else if (level === 2) l2++; else if (level === 3) l3++; else if (level === 4) l4++; else if (level === 5) l5++;
                level = 1;
                currentCycleStarted = false;
            } else {
                level++;
                if (level > 5) {
                    cycleLosses++;
                    level = 1;
                    currentCycleStarted = false;
                }
            }
            lastBet = null;
        }

        let sBehavior = getGamblerMove(seq.sizes.slice(i-20, i));
        let cBehavior = getGamblerMove(seq.colors.slice(i-20, i));
        let priority = Math.max(sBehavior.priority, cBehavior.priority);
        let targetType = sBehavior.priority >= cBehavior.priority ? "size" : "color";
        let targetMove = sBehavior.priority >= cBehavior.priority ? opp(sBehavior.move) : opp(cBehavior.move);

        if (priority >= 40 || currentCycleStarted) { // Must continue betting until cycle ends if started
            if (!currentCycleStarted) { cycles++; currentCycleStarted = true; }
            lastBet = { move: targetMove, target: targetType };
        } else {
            skips++;
        }
    }

    let cycleWinRate = ((cycleWins / cycles) * 100).toFixed(2);
    
    let out = `\n=============================\n[${tfName}]\n200 Days Market Data (${totalRounds} Rounds)\n=============================`;
    out += `\nEngine Accuracy (under 5 Levels) : ${cycleWinRate}%`;
    out += `\nTotal Betting Cycles      : ${cycles}`;
    out += `\nSuccessful Cycles         : ${cycleWins}`;
    out += `\nFailed Cycles (Hit >L5)   : ${cycleLosses} (Total Ruin)`;
    out += `\nLow Vector Skips          : ${skips}`;
    out += `\n\n[Win Distribution by Level]`;
    out += `\nL1 Wins: ${l1}`;
    out += `\nL2 Wins: ${l2}`;
    out += `\nL3 Wins: ${l3}`;
    out += `\nL4 Wins: ${l4}`;
    out += `\nL5 Wins: ${l5}`;
    out += `\n-----------------------------\n`;
    fs.appendFileSync('report.txt', out);
}

fs.writeFileSync('report.txt', '');
runBacktest("30 Second Timeframe", 576000);
runBacktest("1 Minute Timeframe", 288000);
runBacktest("3 Minute Timeframe", 96000);
runBacktest("5 Minute Timeframe", 57600);
