# Leadline: WhatsApp Lead Capture to Google Sheets

## Problem & Solution

**The Problem:** Sales teams manually copy lead information from WhatsApp to spreadsheets. Copy a name. Copy a number. Copy a message. Repeat 50 times. Slow, error-prone, and you lose context in the process.

**The Solution:** One-click capture from WhatsApp Web. Leadline extracts the lead, you review it, and it's saved to your Google Sheet with a single tap. No manual data entry.

---

## Quick Navigation

- [Why This Matters](#why-this-matters)
- [Core Insight](#core-insight-what-i-learned)
- [How It Works](#how-it-works)
- [Setup](#setup)
- [Technical Architecture](#-technical-architecture)
- [FAQ](#faq)

---

## Why This Matters

Sales teams live in WhatsApp. Leads come through WhatsApp. But their data lives in Sheets.

The gap is friction. Every lead requires manual copying. That friction = lost context, slower follow-up, data entry errors.

Leadline eliminates the gap. Your lead flows from WhatsApp to your CRM sheet without your hands leaving the keyboard.

---

## How It Works

**On WhatsApp Web:**
1. Open any chat with a prospect or customer
2. Click the Leadline extension icon
3. Leadline extracts: name, phone number, last message, timestamp
4. You review the data (edit name/phone if needed)
5. One click: saved to your Google Sheet

**What gets saved:**
- Date captured (automatic)
- Name (pre-filled, editable)
- Phone (extracted from contact panel)
- Email (optional)
- Company (optional)
- Last message text
- Message time & date
- Timestamp
- Source (WhatsApp)

**Persistence:** Your sheet ID and sheet name are saved locally. No re-configuration on every use.

---

## Design Decisions

### Why Chrome Extension, Not Web App?

Web apps can't access WhatsApp's DOM without being served from whatsapp.com (which the company controls). A Chrome extension works because it runs in your browser with the permissions you grant it.

### Why OAuth, Not API Key?

API keys stored locally are a security liability. OAuth means: you grant permission once, Leadline gets a token, the token can be revoked anytime from your Google account. No credentials stored on your machine.

### Why Manual Phone Entry is "OK"

WhatsApp Web only shows the phone number in the contact info panel (not in the chat preview). So Leadline can't always extract it automatically. Instead of silently failing, it shows "Click contact info to reveal phone number" and lets you retry. You're in control.

---

## Core Insight: Friction is the Feature

The insight here isn't technical. It's that most data entry tools try to automate everything. But the real problem isn't automation—it's friction.

Leadline doesn't try to be a full CRM. It doesn't try to automatically categorize leads. It solves one job: "Get lead data from WhatsApp to Sheets without me copying it manually."

That single focus is what makes it useful. It integrates into an existing workflow instead of asking you to change your workflow.

---

## Setup

### Prerequisites

- Google account
- Chrome browser
- Google Sheet (already created)

### 1. Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g., "Leadline Sales")
3. Navigate to **APIs & Services** → **Library**
4. Search for **Google Sheets API** and enable it

### 2. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Choose application type: **Chrome Extension**
4. After creation, click into it and copy your **Client ID**

### 3. Get Your Chrome Extension ID

1. Open `chrome://extensions` in your browser
2. Enable **Developer mode** (top right)
3. Load this folder as unpacked: Click **Load unpacked**, select the `Leadline` folder
4. Copy the **ID** shown for the Leadline extension

### 4. Update manifest.json

1. Open `manifest.json` in this folder
2. Find `oauth2.client_id`
3. Replace with your Client ID from Step 2
4. Save and reload the extension

### 5. Use Leadline

1. Open [web.whatsapp.com](https://web.whatsapp.com) in Chrome
2. Click the Leadline extension icon
3. On first use, paste your **Google Sheet link** (or just the Sheet ID)
4. Enter the **worksheet name** (default: `Sheet1`)
5. Click **Connect Sheet**
6. Open any WhatsApp chat and click the extension icon to capture leads

---

---

# 🔧 Technical Architecture

Below is the complete implementation. This section is organized for developers building on or maintaining the extension.

---

## Architecture Overview

Leadline uses a 3-part Chrome extension architecture:

```
User (WhatsApp Web)
       │
       ▼
    Popup UI
  (popup.html, popup.js)
       │
       ├─── Query Config ──────► Chrome Storage
       │                        (sync storage)
       │
       ├─── Extract Data ──────► Content Script
       │                        (content.js)
       │
       └─── Send Row ──────────► Service Worker
                                (service-worker.js)
                                     │
                                     ▼
                              Get OAuth Token
                            (chrome.identity)
                                     │
                                     ▼
                              Google Sheets API
                            (append to sheet)
```

### Component Breakdown

| Component | Purpose | Key Responsibility |
|-----------|---------|-------------------|
| **Popup** | UI layer | Display lead data, accept user edits, trigger save |
| **Content Script** | DOM extraction | Query WhatsApp Web for name, phone, message |
| **Service Worker** | Backend | OAuth token management, Sheets API calls |
| **Storage** | Persistence | Sheet ID, worksheet name (sync across devices) |

---

## Data Flow

### 1. Extension Initialization

```
User clicks extension icon
    ▼
Popup loads (popup.js init())
    ▼
Query chrome.storage.sync for { sheetId, sheetName }
    ▼
If config exists → Go to "Lead Capture"
If no config → Show "Setup" screen
```

### 2. Lead Extraction

```
Popup sends message: { action: 'extractLead' }
    ▼
Content script receives (content.js)
    ▼
Query WhatsApp DOM:
  - Get contact name (from header)
  - Get phone (from contact panel)
  - Get last message (from chat)
  - Get timestamp
    ▼
Send back: { name, phone, message, messageTime, messageDate }
    ▼
Popup displays data for review/edit
```

### 3. Save to Sheet

```
User clicks "Save to Sheet"
    ▼
Popup constructs row:
  [date, name, phone, message]
    ▼
Sends message: { action: 'saveRow', sheetId, sheetName, row }
    ▼
Service Worker receives
    ▼
Get OAuth token (chrome.identity.getAuthToken)
    ▼
Check if sheet has headers
  If not → Write headers: [Name, Phone, Email, ...]
    ▼
Append row to sheet (Sheets API)
    ▼
Handle token expiry (remove cached token, retry with fresh token)
    ▼
Return success/error to popup
    ▼
Popup shows toast notification
```

---

## File Structure

```
manifest.json          — Extension config, OAuth setup, permissions
background/
  service-worker.js    — Handles OAuth, Sheets API calls, token refresh
content/
  content.js           — Extracts lead data from WhatsApp DOM
popup/
  popup.html           — UI markup (setup, lead capture, no-chat views)
  popup.js             — Orchestration (config management, UI state)
  popup.css            — Styling
icons/
  icon16.png           — Extension icon (16×16)
  icon32.png           — Extension icon (32×32)
  icon48.png           — Extension icon (48×48)
  icon128.png          — Extension icon (128×128)
```

---

## manifest.json Breakdown

```json
{
  "manifest_version": 3,
  "name": "WhatsApp Lead Capture",
  "version": "1.0.0",
  
  "permissions": [
    "identity",           // OAuth via chrome.identity
    "storage",           // chrome.storage.sync for config
    "activeTab",         // Access current tab
    "scripting"          // Inject content script
  ],
  
  "host_permissions": [
    "https://web.whatsapp.com/*",     // WhatsApp Web domain
    "https://sheets.googleapis.com/*"  // Google Sheets API
  ],
  
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/spreadsheets"]
  },
  
  "background": {
    "service_worker": "background/service-worker.js"
  },
  
  "action": {
    "default_popup": "popup/popup.html"
  }
}
```

---

## Key Functions

### Popup Logic (popup.js)

| Function | Purpose |
|----------|---------|
| `loadConfig()` | Fetch sheet ID + name from chrome.storage.sync |
| `saveConfig(sheetId, sheetName)` | Persist config locally |
| `populateLead(data, config)` | Display extracted lead in UI |
| `validateSaveButton()` | Enable/disable save based on name + phone |
| `saveRow()` | Send lead data to service worker |
| `init()` | Initialize popup (load config, extract lead) |

### Service Worker Logic (service-worker.js)

| Function | Purpose |
|----------|---------|
| `getAuthToken(interactive)` | Get OAuth token from chrome.identity |
| `appendToSheet(token, sheetId, sheetName, row)` | Call Sheets API to append a row |
| `checkAndWriteHeaders(token, sheetId, sheetName)` | Write column headers on first save |
| `handleSaveRow(request, sendResponse)` | Process save request, handle token expiry |

### Content Script Logic (content.js)

| Job | Approach |
|-----|----------|
| Extract name | Read WhatsApp header text |
| Extract phone | Query contact info panel (if visible) |
| Extract message | Get last message in chat |
| Extract timestamp | Parse message timestamp |

---

## Google Sheets API Integration

### Append a Row

```
POST https://sheets.googleapis.com/v4/spreadsheets/{sheetId}/values/{sheetName}!A1:append
Authorization: Bearer {token}
Content-Type: application/json

{
  "values": [["John", "+919876543210", "Hey, interested in demo"]]
}
```

### Token Refresh

When a save fails with a 401 (token expired):

1. `chrome.identity.removeCachedAuthToken({ token })` — invalidate old token
2. Call `getAuthToken(true)` again — user may see OAuth prompt
3. Retry the API call with the new token

---

## Permissions Explained

| Permission | Why | Risk |
|-----------|-----|------|
| `identity` | OAuth flow with Google | Allows extension to request Google auth |
| `storage` | Save sheet ID locally | Stores config in browser (encrypted by Chrome) |
| `activeTab` | Know which tab to inject content script | Can see current URL (read-only) |
| `scripting` | Inject content script into WhatsApp Web | Only executes on web.whatsapp.com |
| `https://web.whatsapp.com/*` | Query WhatsApp DOM | Can read chat contents (on user permission) |
| `https://sheets.googleapis.com/*` | Call Sheets API | Appends rows to user's sheets (OAuth-protected) |

---

## Edge Cases Handled

| Scenario | Solution |
|----------|----------|
| Phone number not visible | Show user hint: "Open contact info panel and retry" |
| No WhatsApp chat open | Show "Open a chat first" view |
| Not on web.whatsapp.com | Detect URL mismatch, show error |
| Token expired | Remove cached token, request fresh token on next save |
| Sheet doesn't exist | API returns 404; user sees "Invalid Sheet ID" error |
| First save to sheet | Automatically write headers before appending data |
| Name field empty | Disable save button (name + phone required) |
| Phone field empty | Show disabled state + reason |

---

## Local Development

### Load the Extension

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select this folder
5. Pin to toolbar

### Debug

- **Content script errors:** Right-click on any WhatsApp chat → **Inspect** → **Console**
- **Popup errors:** Right-click extension icon → **Inspect popup** → **Console**
- **Service worker errors:** Open `chrome://extensions` → Leadline → **Service worker**

### Testing

1. Use a test Google Sheet
2. Open [web.whatsapp.com](https://web.whatsapp.com)
3. Open a chat
4. Click extension, capture lead, save
5. Check the sheet for new row

---

## Security Considerations

### OAuth Over API Keys

Leadline uses OAuth 2.0 (chrome.identity) instead of storing API keys. This means:

- No credentials stored on disk
- User controls permissions via Google account
- Token can be revoked without code changes
- If browser is compromised, tokens are time-limited (not permanent API keys)

### No Server Backend

Leadline is 100% client-side:

- No Leadline servers (no data passes through our infrastructure)
- Sheet is stored in your Google Drive (Google's security, your control)
- OAuth tokens never leave your browser

### DOM Parsing Risk

Content script reads WhatsApp DOM. Possible risks:

- WhatsApp changes DOM structure → extraction breaks (fixable with updates)
- Malicious script could interfere (mitigated by content script sandbox + manifest permissions)

---

## Limitations & Known Issues

| Limitation | Why | Workaround |
|-----------|-----|-----------|
| Mobile WhatsApp unsupported | Extension only works on desktop Chrome | Use web.whatsapp.com on mobile browser |
| Phone may not auto-extract | WhatsApp only shows number in contact panel | Open contact info, retry capture |
| Google Sheets only | No Airtable/Notion support yet | Can add via Zapier (Sheets → Airtable) |
| Header row hardcoded | Headers always: Name, Phone, Email, ... | Modify `checkAndWriteHeaders()` if needed |
| No batch capture | Can't select multiple chats at once | Capture one lead at a time |

---

## Future Ideas

- Slack integration (save to Slack instead of Sheets)
- Airtable / Notion support (connect to other bases)
- Custom fields (let users define sheet columns)
- Lead deduplication (warn if phone already in sheet)
- Bulk capture (select multiple chats, save all at once)

---

## FAQ

**Q: Is my data shared with Leadline?**
No. Leadline doesn't have a server. Your data stays in your Google Sheet. OAuth tokens never leave your browser.

**Q: Can Leadline read my WhatsApp messages?**
Yes, the content script reads your chat to extract the last message and timestamp. This is necessary for the product to work. The data never leaves your device.

**Q: What if I revoke permission later?**
Go to [myaccount.google.com/permissions](https://myaccount.google.com/permissions), find "Leadline," and revoke. The extension can no longer access your sheets.

**Q: Can I use this on my phone?**
Not yet. Extensions only work on desktop Chrome. Mobile WhatsApp Web users can use the web version, but it's not optimized for small screens.

**Q: What if WhatsApp changes their website?**
The DOM extraction may break. We can update the content script to match new selectors. File an issue with your browser version and a screenshot.

**Q: Can I modify this extension for my team?**
Yes! This is open source. Fork it, customize the headers, change the UI. Just respect the OAuth credentials (use your own, not the bundled one for production).

**Q: Does this work with WhatsApp Business?**
WhatsApp Business Web has the same DOM structure, so yes. Just make sure you're using web.whatsapp.com or web.whatsapp-business.com.
