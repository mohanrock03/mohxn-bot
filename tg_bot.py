import os
import time
import threading
import logging
import requests
import cloudscraper
from flask import Flask
from backend import post_api, predict_next, get_issue_num_int

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

# Environments
JALWA_TOKEN = os.environ.get("JALWA_TOKEN", "")
TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "")
TG_CHAT_ID = os.environ.get("TG_CHAT_ID", "")
TIMEFRAME = int(os.environ.get("TIMEFRAME", 1)) # Default 1 min

app = Flask(__name__)

# In-Memory State
engine_state = {
    "current_pattern": None,
    "start_period": 0
}

def send_telegram_alert(title, body):
    if not TG_BOT_TOKEN or not TG_CHAT_ID:
        logger.warning("Telegram credentials missing, skipping alert.")
        return
        
    url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TG_CHAT_ID,
        "text": f"*{title}*\n{body}",
        "parse_mode": "Markdown"
    }
    try:
        res = requests.post(url, json=payload, timeout=10)
        if res.status_code != 200:
            logger.error(f"TG Push Failed: {res.text}")
        else:
            logger.info("✅ Telegram Alert Sent")
    except Exception as e:
        logger.error(f"TG Request Error: {e}")

def run_loop():
    global engine_state
    
    if not JALWA_TOKEN:
        logger.error("❌ CRITICAL: JALWA_TOKEN is missing! Engine halting.")
        return

    logger.info(f"🚀 Background Engine Started | TG: {'ENABLED' if TG_BOT_TOKEN else 'DISABLED'} | TF: {TIMEFRAME}m")

    while True:
        try:
            # 1. Fetch History
            payload = {"typeId": TIMEFRAME, "pageSize": 50, "pageNo": 1}
            # Inject Authorization if backend supports it natively, or patch backend.py to use global token
            # We must pass the token to post_api. Wait, post_api in backend.py doesn't take auth!
            # Let's hit the original domain directly using requests for the background worker to ensure Auth works.
            
            headers = {
                "Authorization": f"Bearer {JALWA_TOKEN}",
                "Content-Type": "application/json;charset=UTF-8",
                "Origin": "https://jalwa.win",
                "Referer": "https://jalwa.win/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            
            scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'android', 'mobile': True})
            res = scraper.post("https://api.jalwaapi.com/api/webapi/GetNoaverageEmerdList", json=payload, headers=headers, timeout=15)
            
            if res.status_code == 401:
                logger.error("❌ Invalid JWT Auth Token! Please update it.")
                time.sleep(30)
                continue
                
            try:
                data = res.json()
            except Exception as json_err:
                logger.error(f"❌ JSON Decode Error (Status {res.status_code}):")
                logger.error(f"Response snippet: {res.text[:200]}")
                time.sleep(15)
                continue

            if data.get('code') != 0 or 'list' not in data.get('data', {}):
                logger.warning(f"⚠️ Bad Jalwa response: {data}")
                time.sleep(10)
                continue
                
            history = data['data']['list']
            
            # 2. Run Engine Prediction
            pred = predict_next(history, engine_state)
            
            if "error" in pred:
                time.sleep(10)
                continue
                
            # 3. Handle State Changes
            new_state = pred.get("state", {})
            if new_state.get('current_pattern') and new_state.get('start_period'):
                engine_state['current_pattern'] = new_state['current_pattern']
                engine_state['start_period'] = new_state['start_period']
                
            # 4. Check for New Strategy Alert
            if new_state.get("new_alert") is True:
                pattern_name = "Big→Small" if engine_state['current_pattern'] == "BS" else "Small→Big"
                period_short = str(pred['period'])[-5:]
                
                title = f"⚡ NEW PATTERN: {pattern_name}"
                body = f"Strong {pattern_name} detected. Next: {pred['move']} for {period_short}"
                
                logger.info(f"🔥 ALARM TRIGGERED: {title} | {body}")
                send_telegram_alert(title, body)

        except Exception as e:
            logger.error(f"Loop Exception: {e}")
            
        # Poll every 5 seconds reliably
        time.sleep(5)

@app.route('/')
def ping():
    return "MOHXN VIP 24/7 Engine is LIVE", 200

def start():
    t = threading.Thread(target=run_loop, daemon=True)
    t.start()
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, use_reloader=False)

if __name__ == "__main__":
    start()
