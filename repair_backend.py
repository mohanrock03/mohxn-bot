import os

file_path = "backend.py"

with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

new_content = []
skip = False
for line in lines:
    if "def analyze_strong_pattern" in line:
        skip = True
        # Insert the correct function here
        new_content.append("def analyze_strong_pattern(history, target_pattern=None):\n")
        new_content.append('    """Advanced multi-window pattern detection."""\n')
        new_content.append('    results = []\n')
        new_content.append('    issue_numbers = []\n')
        new_content.append('    seen = set()\n')
        new_content.append('    for h in history:\n')
        new_content.append('        iss = int(h.get("issueNumber", 0))\n')
        new_content.append('        if iss == 0 or iss in seen: continue\n')
        new_content.append('        try:\n')
        new_content.append('            num = int(h.get("result", h.get("number", 0)))\n')
        new_content.append('            results.append("Big" if num >= 5 else "Small")\n')
        new_content.append('            issue_numbers.append(iss)\n')
        new_content.append('            seen.add(iss)\n')
        new_content.append('        except: continue\n')
        new_content.append('    results.reverse()\n')
        new_content.append('    issue_numbers.reverse()\n')
        new_content.append('    n = len(results)\n')
        new_content.append('    if n < 10: return None\n')
        new_content.append('    w_bs = w_sb = r_bs = r_sb = 0\n')
        new_content.append('    recent_start = max(0, n - 16)\n')
        new_content.append('    for i in range(n - 1):\n')
        new_content.append('        if results[i] == "Big" and results[i+1] == "Small":\n')
        new_content.append('            w_bs += 1\n')
        new_content.append('            if i >= recent_start: r_bs += 1\n')
        new_content.append('        elif results[i] == "Small" and results[i+1] == "Big":\n')
        new_content.append('            w_sb += 1\n')
        new_content.append('            if i >= recent_start: r_sb += 1\n')
        new_content.append('    bs_best_run = sb_best_run = 0\n')
        new_content.append('    strong_pair_periods_bs = strong_pair_periods_sb = (0, 0)\n')
        new_content.append('    bs_run = sb_run = 0\n')
        new_content.append('    for i in range(n - 1):\n')
        new_content.append('        if results[i] == "Big" and results[i+1] == "Small":\n')
        new_content.append('            bs_run += 1; sb_run = 0\n')
        new_content.append('            if bs_run > bs_best_run:\n')
        new_content.append('                bs_best_run = bs_run; strong_pair_periods_bs = (issue_numbers[i], issue_numbers[i+1])\n')
        new_content.append('        elif results[i] == "Small" and results[i+1] == "Big":\n')
        new_content.append('            sb_run += 1; bs_run = 0\n')
        new_content.append('            if sb_run > sb_best_run:\n')
        new_content.append('                sb_best_run = sb_run; strong_pair_periods_sb = (issue_numbers[i], issue_numbers[i+1])\n')
        new_content.append('        else: bs_run = sb_run = 0\n')
        new_content.append('    bs_score = w_bs * 1.5 + r_bs * 2.0 + (bs_best_run * 10)\n')
        new_content.append('    sb_score = w_sb * 1.5 + r_sb * 2.0 + (sb_best_run * 10)\n')
        new_content.append('    if target_pattern: selected_pattern = target_pattern\n')
        new_content.append('    else:\n')
        new_content.append('        if bs_score > sb_score + 15: selected_pattern = "BS"\n')
        new_content.append('        elif sb_score > bs_score + 15: selected_pattern = "SB"\n')
        new_content.append('        else: return None\n')
        new_content.append('    dominant_score = max(bs_score, sb_score)\n')
        new_content.append('    minor_score = min(bs_score, sb_score)\n')
        new_content.append('    strength_pct = (dominant_score / (dominant_score + minor_score)) * 100 if (dominant_score + minor_score) > 0 else 50\n')
        new_content.append('    confirmed_period = issue_numbers[-1]\n')
        new_content.append('    for i in range(n - 2, -1, -1):\n')
        new_content.append('        if selected_pattern == "BS" and results[i] == "Big" and results[i+1] == "Small":\n')
        new_content.append('            confirmed_period = issue_numbers[i+1]; break\n')
        new_content.append('        elif selected_pattern == "SB" and results[i] == "Small" and results[i+1] == "Big":\n')
        new_content.append('            confirmed_period = issue_numbers[i+1]; break\n')
        new_content.append('    strong_pair = strong_pair_periods_bs if selected_pattern == "BS" else strong_pair_periods_sb\n')
        new_content.append('    recent_8 = results[-8:]; streak = 1\n')
        new_content.append('    is_trap = False; reason = f"Strong {selected_pattern} ({strength_pct:.0f}% dominant)"\n')
        new_content.append('    for i in range(1, len(recent_8)):\n')
        new_content.append('        if recent_8[i] == recent_8[i-1]:\n')
        new_content.append('            streak += 1\n')
        new_content.append('            if streak >= 5: is_trap = True; reason = f"Trap: {streak}x {recent_8[i]} streak"; break\n')
        new_content.append('        else: streak = 1\n')
        new_content.append('    return {"pattern": selected_pattern, "is_trap": is_trap, "confirmed_at": confirmed_period, "strong_pair": strong_pair, "strength": round(strength_pct, 1), "reason": reason}\n')
    elif skip and "def " in line and "analyze_strong_pattern" not in line:
        skip = False
        new_content.append(line)
    elif not skip:
        new_content.append(line)

with open(file_path, "w", encoding="utf-8") as f:
    f.writelines(new_content)

print("Repair completed.")
