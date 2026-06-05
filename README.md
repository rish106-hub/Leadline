# WhatsApp Lead Capture — Chrome Extension

Capture leads from WhatsApp Web → save directly to Google Sheets. One click.

## Setup

### 1. Google Cloud (one-time)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project (e.g. "WA Lead Capture")
3. Enable **Google Sheets API** (APIs & Services → Library)
4. Go to APIs & Services → Credentials → Create Credentials → **OAuth 2.0 Client ID**
   - Application type: **Chrome Extension**
   - Application ID: your extension's ID from `chrome://extensions` (get this after loading the extension once)
5. Copy the **Client ID**
6. Paste into `manifest.json` → `oauth2.client_id`

### 2. Load Extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select this folder
4. Pin extension to toolbar

### 3. First Run

1. Open [web.whatsapp.com](https://web.whatsapp.com)
2. Click extension icon
3. Paste your **Google Sheet link** (full URL) or just the Sheet ID
4. Enter **Worksheet name** (tab at bottom of sheet, default: `Sheet1`)
5. Click **Connect Sheet**

### 4. Capture Leads

1. Open any chat in WhatsApp Web
2. Click extension icon
3. Review extracted data (Name, Phone, Message)
4. Add Email / Company if needed
5. Click **Save to Sheet**

Headers (`Name | Phone | Email | Company | Message | Timestamp | Source`) are written automatically on first save.

## Notes

- **Phone not showing?** WhatsApp only shows the number in the contact info panel. Click the contact name to open it, then click the extension again.
- **Auth prompt** appears on first save — grant Sheets permission.
- Sheet ID and worksheet are saved in `chrome.storage.sync` and persist across sessions.

## Files

```
manifest.json          — Extension config, OAuth scopes
background/
  service-worker.js    — OAuth token management, Sheets API calls
content/
  content.js           — WhatsApp DOM extraction
popup/
  popup.html           — UI
  popup.js             — Orchestration logic
  popup.css            — Styles
icons/
  icon.png             — Extension icon
```
