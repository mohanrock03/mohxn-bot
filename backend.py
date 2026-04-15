import time
import os
import requests
import cloudscraper
import json
import logging
import hashlib
import random
import string
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Optional

# Basic Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MOHXN VIP PREDICTION ENGINE")

def get_rnd32():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=32))

def get_api_signature(params):
    excl = ['signature', 'track', 'xosoBettingData', 'timestamp']
    filtered = {k: params[k] for k in sorted(params.keys()) if k not in excl and params[k] is not None and params[k] != ''}
    json_str = json.dumps(filtered, separators=(',', ':'))
    return hashlib.md5(json_str.encode()).hexdigest().upper()

# API Configuration
API_DOMAINS = [
    "api.jalwaapi.com",
    "api.luckswin88.com",
    "api.ar-lottery06.com",
    "api.ar-lottery10.com",
    "api.ar-lottery01.com",
    "api.ar-lottery02.com",
    "api.luckswin.com",
    "api.ar-api01.com",
    "jalwa.win"
]
CURRENT_API_BASE = "api.jalwaapi.com"

def discover_api():
    global CURRENT_API_BASE
    import re
    logger.info("🔍 Auto-discovering API domain...")
    scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'mobile': False})
    try:
        res = scraper.get("https://jalwa.win", timeout=10)
        if res.status_code == 200:
            match = re.search(r'"VITE_API_URL"\s*:\s*"(https?://([^"]+))"', res.text)
            if match:
                discovered = match.group(2)
                try:
                    test = scraper.post(f"https://{discovered}/api/webapi/GetNoaverageEmerdList", json={"typeId": 1}, timeout=5)
                    if test.status_code in [200, 401]:
                        CURRENT_API_BASE = discovered
                        logger.info(f"✅ Auto-discovered from jalwa.win source: {discovered}")
                        return
                except:
                    logger.warning(f"⚠️ Discovered {discovered} but it's not responding, trying fallbacks...")
    except Exception as e:
        logger.warning(f"⚠️ jalwa.win scrape failed: {e}")
    
    for domain in API_DOMAINS:
        url = f"https://{domain}/api/webapi/GetNoaverageEmerdList"
        try:
            res = scraper.post(url, json={"typeId": 1}, timeout=5)
            if res.status_code in [200, 401]:
                CURRENT_API_BASE = domain
                logger.info(f"✅ Found active API via probe: {domain}")
                return
        except:
            continue
    logger.warning(f"⚠️ No active API found, using default: {CURRENT_API_BASE}")

discover_api()

def post_api(endpoint, payload):
    global CURRENT_API_BASE
    url = f"https://{CURRENT_API_BASE}/api/webapi/{endpoint}"
    payload['random'] = get_rnd32()
    payload['timestamp'] = int(time.time())
    payload['signature'] = get_api_signature(payload)
    headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'Content-Type': 'application/json;charset=UTF-8',
        'Origin': 'https://jalwa.win',
        'Referer': 'https://jalwa.win/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SD1A.210817.036; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/121.0.6167.178 Mobile Safari/537.36',
        'X-Requested-With': 'com.jalwa_win_lottery',
        'Platform': 'android'
    }
    try:
        scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'android', 'mobile': True})
        res = scraper.post(url, json=payload, headers=headers, timeout=15)
        if res.status_code != 200:
            return None
        return res.json()
    except Exception:
        return None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TF_MAPPING = {
    '30s': 30,
    '1m': 1,
    '3m': 2,
    '5m': 3
}

# ══════════════════════════════════════════════════════
#  STRONGER PATTERN ENGINE — STATEFUL CYCLE LOGIC
def analyze_strong_pattern(history, target_pattern=None):
    """Advanced multi-window pattern detection."""
    results = []
    issue_numbers = []
    seen = set()
    for h in history:
        iss = int(h.get("issueNumber", 0))
        if iss == 0 or iss in seen: continue
        try:
            num = int(h.get("result", h.get("number", 0)))
            results.append("Big" if num >= 5 else "Small")
            issue_numbers.append(iss)
            seen.add(iss)
        except: continue
    results.reverse()
    issue_numbers.reverse()
    n = len(results)
    if n < 10: return None
    w_bs = w_sb = r_bs = r_sb = 0
    recent_start = max(0, n - 16)
    for i in range(n - 1):
        if results[i] == "Big" and results[i+1] == "Small":
            w_bs += 1
            if i >= recent_start: r_bs += 1
        elif results[i] == "Small" and results[i+1] == "Big":
            w_sb += 1
            if i >= recent_start: r_sb += 1
    bs_best_run = sb_best_run = 0
    strong_pair_periods_bs = strong_pair_periods_sb = (0, 0)
    bs_run = sb_run = 0
    for i in range(n - 1):
        if results[i] == "Big" and results[i+1] == "Small":
            bs_run += 1; sb_run = 0
            if bs_run > bs_best_run:
                bs_best_run = bs_run; strong_pair_periods_bs = (issue_numbers[i], issue_numbers[i+1])
        elif results[i] == "Small" and results[i+1] == "Big":
            sb_run += 1; bs_run = 0
            if sb_run > sb_best_run:
                sb_best_run = sb_run; strong_pair_periods_sb = (issue_numbers[i], issue_numbers[i+1])
        else: bs_run = sb_run = 0
    bs_score = w_bs * 1.5 + r_bs * 2.0 + (bs_best_run * 10)
    sb_score = w_sb * 1.5 + r_sb * 2.0 + (sb_best_run * 10)
    if target_pattern: selected_pattern = target_pattern
    else:
        gap = abs(bs_score - sb_score)
        top = max(bs_score, sb_score)
        if gap >= 3 and top >= 5: selected_pattern = "BS" if bs_score > sb_score else "SB"
        elif top >= 10: selected_pattern = "BS" if bs_score >= sb_score else "SB"
        else: return None
    dominant_score = max(bs_score, sb_score)
    minor_score = min(bs_score, sb_score)
    strength_pct = (dominant_score / (dominant_score + minor_score)) * 100 if (dominant_score + minor_score) > 0 else 50
    confirmed_period = issue_numbers[-1]
    for i in range(n - 2, -1, -1):
        if selected_pattern == "BS" and results[i] == "Big" and results[i+1] == "Small":
            strong_pair = (issue_numbers[i], issue_numbers[i+1]); confirmed_period = issue_numbers[i+1]; break
        elif selected_pattern == "SB" and results[i] == "Small" and results[i+1] == "Big":
            strong_pair = (issue_numbers[i], issue_numbers[i+1]); confirmed_period = issue_numbers[i+1]; break
    strong_pair = strong_pair_periods_bs if selected_pattern == "BS" else strong_pair_periods_sb
    recent_8 = results[-8:]; streak = 1
    is_trap = False; reason = f"Strong {selected_pattern} ({strength_pct:.0f}% dominant)"
    for i in range(1, len(recent_8)):
        if recent_8[i] == recent_8[i-1]:
            streak += 1
            if streak >= 5: is_trap = True; reason = f"Trap: {streak}x {recent_8[i]} streak"; break
        else: streak = 1
    return {"pattern": selected_pattern, "is_trap": is_trap, "confirmed_at": confirmed_period, "strong_pair": strong_pair, "strength": round(strength_pct, 1), "reason": reason}
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
    state_msg = ""
    new_strategy_triggered = False

    if current_strat:
        pattern_info = analyze_strong_pattern(history, target_pattern=current_strat)
        top_pattern_info = analyze_strong_pattern(history)
        strong_pattern = top_pattern_info['pattern'] if top_pattern_info else None
    else:
        pattern_info = analyze_strong_pattern(history)
        strong_pattern = pattern_info['pattern'] if pattern_info else None

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
async def get_monitor_data(request: Request, tf: str = "1m"):
    client_state = {
        "current_pattern": request.query_params.get('pattern'),
        "start_period": request.query_params.get('start_period')
    }
    type_id = TF_MAPPING.get(tf, 2)
    res = post_api("GetNoaverageEmerdList", {"typeId": type_id, "pageSize": 50, "pageNo": 1})
    if res and res.get('code') == 0:
        history = res['data']['list']
        pred = predict_next(history, client_state)
        return {"history": history, "prediction": pred}
    return {"history": [], "prediction": None, "error": "API Error"}

if not os.path.exists("static"):
    os.makedirs("static")

app.mount("/", StaticFiles(directory="static", html=True), name="static")

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

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
