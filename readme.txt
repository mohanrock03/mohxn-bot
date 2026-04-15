Wingo Anti-Gambler Prediction Engine
====================================

Overview
--------
This is an automated prediction engine built for the Wingo game on jalwa.live.
The system features real-time pattern analysis, streak detection logic, and Martingale-based betting management (up to 5 levels) to generate high-probability betting signals.

Architecture
------------
- Frontend: HTML/CSS/JavaScript (Modern Glassmorphism UI)
- Backend: Python FastAPI (`backend.py`) for serving files and acting as a proxy if needed.
- Data Source: Direct API connection to jalwa.live Web API endpoints.

Authentication & Security Bypass
--------------------------------
Jalwa utilizes a custom encryption layer on their Webpack frontend. We successfully reverse-engineered this mechanism to allow standalone scraping. 
1. The engine builds a JSON parameter payload.
2. An MD5 hash of the payload is calculated natively exactly like the official app (`hash.toUpperCase()`).
3. The timestamp is uniquely appended *after* the hash calculation to bypass the WAF.
4. An active JWT Bearer Token is required for the requests to pass cleanly.

Timeframe Mappings
------------------
The API endpoints utilize specific integer mappings that differ from standard intervals:
- 30s Game : `typeId=30`
- 1m Game  : `typeId=1`
- 3m Game  : `typeId=2`
- 5m Game  : `typeId=3`

Usage Instructions
------------------
1. Run the server: `python backend.py`
2. Open your browser and navigate to `http://127.0.0.1:8000`
3. Log into `jalwa.live` on another tab, open Developer Tools (F12) -> Application -> Local Storage.
4. Copy your `token`.
5. Paste the token into the Jalwa API Authentication section of the tool and click "SET TOKEN".
6. Select your chosen Timeframe and click "GENERATE PREDICTION".
7. Follow the alerts, log wins/losses, and safely execute the martingale sequence!

Disclaimer
----------
This tool was built for educational and analytical purposes. Wingo results are mathematically distributed and probabilities are never guaranteed. Always manage your bankroll safely.
