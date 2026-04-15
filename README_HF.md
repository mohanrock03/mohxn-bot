# 🚀 How to Deploy your Wingo Bot 24/7 on Hugging Face (FREE)

Follow these simple steps to move your bot from your computer to the cloud!

### 1. Create a Hugging Face Space
1.  Go to [huggingface.co](https://huggingface.co/) and log in.
2.  Click **"New Space"**.
3.  Name it (e.g., `my-wingo-bot`).
4.  **SDK**: Choose **Docker**.
5.  **Template**: Choose **Blank**.
6.  **Visibility**: Choose **Public** (or Private if you have an account upgrade, but Public is fine as we will hide your token).

### 2. Upload the Code
1.  Go to the **Files** tab in your new Space.
2.  Click **"Add file"** -> **"Upload files"**.
3.  Drag and drop the entire `DEMO` folder contents into the browser.
    *   *Make sure `backend.py`, `Dockerfile`, `requirements.txt`, and the `static` folder are uploaded.*

### 3. Add your AR_TOKEN (Secret)
To keep your token safe so no one else can see it:
1.  Go to the **Settings** tab of your Space.
2.  Scroll down to **"Variables and secrets"**.
3.  Click **"New secret"**.
4.  **Name**: `AR_TOKEN`
5.  **Value**: Paste your `ar_token` (from your screenshot).
6.  Click **Save**.

### 4. Wait for Build
1.  Hugging Face will automatically see the `Dockerfile` and start building your bot.
2.  Wait for the status to change from **"Building"** to **"Running"** (this takes about 2-3 minutes).

### 5. Access your Bot
Once it is running:
1.  Click the **"App"** tab to see your dashboard!
2.  Your balance will automatically update, and the bot will begin betting in the background based on your 06:00 - 22:00 schedule.
3.  **No Browser Needed**: You can now close your laptop and the bot will continue working!

> [!TIP]
> **Keep Awake**: Open your Space once every 2 days to ensure Hugging Face doesn't put it to sleep!
