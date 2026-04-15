import time
import requests
import cloudscraper
import json
import logging
import hashlib
import random
import string
import os
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Optional
from mangum import Mangum

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MOHXN VIP Prediction Engine (Serverless)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API config
API_BASE = "api.jalwaapi.com"
TF_MAPPING = { '30s': 30, '1m': 1, '3m': 2, '5m': 3 }

def get_rnd32():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=32))

def get_api_signature(params):
    excl = ['signature', 'track', 'xosoBettingData', 'timestamp']
    filtered = {k: params[k] for k in sorted(params.keys()) if k not in excl and params[k] is not None and params[k] != ''}
    json_str = json.dumps(filtered, separators=(',', ':'))
    return hashlib.md5(json_str.encode()).hexdigest().upper()

def get_issue_num_int(issue_str):
    if not issue_str: return 0
    try:
        return int(issue_str)
    except:
        return 0

def analyze_strong_pattern(history: List[Dict], target_pattern: str = None) -> Optional[Dict]:
    """
    Advanced multi-window pattern detection for BS/SB dominance.
    Uses 3 scoring methods to identify stable patterns.
    If target_pattern is provided, forces evaluation and metric extraction for that pattern.
    """
    results = []
    issue_numbers = []
    seen = set()
    for h in history:
        iss = get_issue_num_int(h.get('issueNumber', 0))
        if iss == 0 or iss in seen: continue
        try:
            num = int(h.get('result', h.get('number', 0)))
            results.append("Big" if num >= 5 else "Small")
            issue_numbers.append(iss)
            seen.add(iss)
        except: continue
        
    results.reverse()  # Oldest to newest
    issue_numbers.reverse()

    n = len(results)
    if n < 10:
        return None

    w_bs = 0
    w_sb = 0
    r_bs = 0
    r_sb = 0
    recent_start = max(0, n - 16)
    for i in range(n - 1):
        if results[i] == "Big" and results[i+1] == "Small":
            w_bs += 1
            if i >= recent_start: r_bs += 1
        elif results[i] == "Small" and results[i+1] == "Big":
            w_sb += 1
            if i >= recent_start: r_sb += 1

    bs_best_run = 0
    sb_best_run = 0
    strong_pair_periods_bs = (0, 0)
    strong_pair_periods_sb = (0, 0)
    bs_run = 0
    sb_run = 0
    
    for i in range(n - 1):
        if results[i] == "Big" and results[i+1] == "Small":
            bs_run += 1
            sb_run = 0
            if bs_run > bs_best_run:
                bs_best_run = bs_run
                strong_pair_periods_bs = (issue_numbers[i], issue_numbers[i+1])
        elif results[i] == "Small" and results[i+1] == "Big":
            sb_run += 1
            bs_run = 0
            if sb_run > sb_best_run:
                sb_best_run = sb_run
                strong_pair_periods_sb = (issue_numbers[i], issue_numbers[i+1])
        else:
            bs_run = 0
            sb_run = 0

    bs_score = w_bs * 1.5 + r_bs * 2.0 + (bs_best_run * 10)
    sb_score = w_sb * 1.5 + r_sb * 2.0 + (sb_best_run * 10)

    # Determine dominant pattern
    if target_pattern:
        selected_pattern = target_pattern
    else:
        gap = abs(bs_score - sb_score)
        min_score = max(bs_score, sb_score)
        if gap >= 3 and min_score >= 5:
            selected_pattern = "BS" if bs_score > sb_score else "SB"
        elif min_score >= 10:
            # Fallback: pick the leader even with a tiny gap
            selected_pattern = "BS" if bs_score >= sb_score else "SB"
        else:
            return None  # Genuinely insufficient data

    strong_pair_periods = strong_pair_periods_bs if selected_pattern == "BS" else strong_pair_periods_sb
    dominant_score = max(bs_score, sb_score)
    minor_score = min(bs_score, sb_score)
    strength_pct = (dominant_score / (dominant_score + minor_score)) * 100 if (dominant_score + minor_score) > 0 else 50

    # confirmed_period = last period where the pattern occurred (for cycle offset)
    confirmed_period = issue_numbers[-1]
    for i in range(n - 2, -1, -1):
        if selected_pattern == "BS" and results[i] == "Big" and results[i+1] == "Small":
            strong_pair_periods = (issue_numbers[i], issue_numbers[i+1])
            confirmed_period = issue_numbers[i+1]
            break
        elif selected_pattern == "SB" and results[i] == "Small" and results[i+1] == "Big":
            strong_pair_periods = (issue_numbers[i], issue_numbers[i+1])
            confirmed_period = issue_numbers[i+1]
            break

    # Trap Check
    recent_8 = results[-8:]
    streak = 1
    for i in range(1, len(recent_8)):
        if recent_8[i] == recent_8[i-1]:
            streak += 1
            if streak >= 5:
                return {
                    "pattern": selected_pattern, "is_trap": True,
                    "confirmed_at": confirmed_period,
                    "strong_pair": strong_pair_periods,
                    "strength": round(strength_pct, 1),
                    "reason": f"Trap: {streak}x {recent_8[i]} streak detected"
                }
        else:
            streak = 1

    return {
        "pattern": selected_pattern,
        "is_trap": False,
        "confirmed_at": confirmed_period,
        "strong_pair": strong_pair_periods,
        "strength": round(strength_pct, 1),
        "reason": f"Strong {selected_pattern} ({strength_pct:.0f}% dominant)"
    }

def get_sequence_move(pattern: str, offset: int) -> str:
    idx = offset % 5
    if pattern == "BS":
        return ["Big", "Small", "Big", "Small", "Small"][idx]
    else:
        return ["Small", "Big", "Small", "Big", "Big"][idx]

def predict_next(history: List[Dict], client_state: Dict = None) -> Dict:
    if not history: return {"error": "No data"}
    latest_data = history[0]
    current_issue = get_issue_num_int(latest_data.get('issueNumber', 0))
    next_issue = current_issue + 1

    current_strat = client_state.get('current_pattern') if client_state else None
    strat_start = int(client_state.get('start_period', 0)) if client_state and client_state.get('start_period') else 0
    new_alert = False

    if current_strat:
        pattern_info = analyze_strong_pattern(history, target_pattern=current_strat)
        top_pattern_info = analyze_strong_pattern(history)
        strong_pattern = top_pattern_info['pattern'] if top_pattern_info else None
    else:
        pattern_info = analyze_strong_pattern(history)
        strong_pattern = pattern_info['pattern'] if pattern_info else None

    reason = pattern_info['reason'] if pattern_info else "Analyzing trends..."
    state_msg = ""
    new_strategy_triggered = False

    if not current_strat:
        if strong_pattern:
            current_strat = strong_pattern
            strat_start = pattern_info['confirmed_at'] + 1
            state_msg = f"Pattern {current_strat} Locked"
            new_strategy_triggered = True
    else:
        if strong_pattern and strong_pattern != current_strat:
            prev_offset = current_issue - strat_start
            if prev_offset >= 0:
                expected = get_sequence_move(current_strat, prev_offset)
                actual_num = int(latest_data.get('result', latest_data.get('number', 0)))
                actual = "Big" if actual_num >= 5 else "Small"
                if expected == actual:
                    current_strat = strong_pattern
                    strat_start = pattern_info['confirmed_at'] + 1
                    state_msg = f"New {current_strat} pattern locked (after win)"
                    new_strategy_triggered = True
                else:
                    state_msg = f"Waiting for win on {current_strat}..."
            else:
                current_strat = strong_pattern
                strat_start = pattern_info['confirmed_at'] + 1
                new_strategy_triggered = True
        else:
            state_msg = f"{current_strat} sequence active"

    if not current_strat:
        return {"period": str(next_issue), "move": "SKIP", "priority": 0, "psychology": reason, "state": {}}

    offset = next_issue - strat_start
    move = get_sequence_move(current_strat, offset)
    round_num = (offset % 5) + 1

    return {
        "period": str(next_issue),
        "move": move,
        "signal_type": "SIZE",
        "trap_type": "STABLE" if not (pattern_info and pattern_info['is_trap']) else "TRAP ALERT",
        "priority": 100 if not (pattern_info and pattern_info['is_trap']) else 10,
        "psychology": f"{state_msg} (R{round_num}/5)",
        "strength": pattern_info.get('strength', 0) if pattern_info else 0,
        "strong_pair": pattern_info.get('strong_pair', [0, 0]) if pattern_info else [0, 0],
        "state": {
            "current_pattern": current_strat,
            "start_period": strat_start,
            "new_alert": new_strategy_triggered
        }
    }

@app.get("/api/monitor")
def get_monitor_data(request: Request, tf: str = "1m"):
    client_state = {
        "current_pattern": request.query_params.get('pattern'),
        "start_period": request.query_params.get('start_period')
    }
    type_id = TF_MAPPING.get(tf, 2)
    payload = {"typeId": type_id, "pageSize": 50, "pageNo": 1}
    payload['random'] = get_rnd32()
    payload['timestamp'] = int(time.time())
    payload['signature'] = get_api_signature(payload)
    headers = {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=UTF-8',
        'Origin': 'https://jalwa.win',
        'Referer': 'https://jalwa.win/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 Chrome/121.0.6167.178 Mobile Safari/537.36',
    }
    try:
        scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'android', 'mobile': True})
        url = f"https://{API_BASE}/api/webapi/GetNoaverageEmerdList"
        res = scraper.post(url, json=payload, headers=headers, timeout=15)
        if res.status_code == 200:
            data = res.json()
            if data.get('code') == 0:
                history = data['data']['list']
                pred = predict_next(history, client_state)
                return {"history": history, "prediction": pred}
            else:
                return {"history": [], "prediction": None, "error": f"API returned code: {data.get('code')}"}
        else:
            return {"history": [], "prediction": None, "error": f"HTTP {res.status_code}"}
    except Exception as e:
        logger.error(f"API Error: {e}")
        return {"history": [], "prediction": None, "error": f"Exception: {str(e)}"}

@app.post("/api/analyze")
async def analyze_data(request: Request):
    try:
        data = await request.json()
        history = data.get('history', [])
        client_state = data.get('client_state', {})
        if not history:
            return {"prediction": None, "error": "No history provided"}
        pred = predict_next(history, client_state)
        return {"prediction": pred}
    except Exception as e:
        logger.error(f"Analyze Error: {e}")
        return {"prediction": None, "error": str(e)}

handler = Mangum(app)
