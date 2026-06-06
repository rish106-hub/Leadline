# WhatsApp Lead Capture

> **Seamlessly convert WhatsApp conversations into qualified leads in your Google Sheets.**

A lightweight Chrome extension that extracts customer contact information directly from WhatsApp Web chats and saves them to your CRM or lead tracking spreadsheet in one click.

---

## The Problem

Sales teams, customer support, and business development professionals spend hours manually transcribing lead information from WhatsApp conversations:
- Writing down customer names from chat headers
- Copying phone numbers from contact info panels
- Manually logging conversations into spreadsheets
- Context switching between WhatsApp and CRM tools

This friction creates data gaps, slows response times, and introduces transcription errors.

---

## The Solution

**WhatsApp Lead Capture** eliminates manual data entry by:
- **Auto-extracting** customer name, phone, and message context directly from WhatsApp Web
- **One-click saving** to Google Sheets with pre-formatted columns
- **Review before save** to catch extraction errors and add context (email, company, notes)
- **Zero setup friction** — works with any Google Sheet you own, validated on first connection

### Who It's For

- **Sales teams** capturing inbound leads from WhatsApp
- **Support specialists** documenting customer conversations
- **Business developers** tracking partner inquiries
- **Customer success** teams logging onboarding conversations
- **Freelancers & consultants** building client prospect lists

### Key Benefits

| Benefit | Impact |
|---------|--------|
| **Saves 5-10 min per lead** | Capture time reduced from manual transcription |
| **Zero context loss** | Original message preserved for follow-up |
| **Mobile-first customers** | Capture leads from users who don't email or use forms |
| **Integrates with existing workflows** | Outputs to Google Sheets — works with your existing CRM, Zapier, or BI tools |
| **No learning curve** | One-click operation, minimal configuration |
| **Privacy-focused** | Data stored in *your* Google Drive; no third-party sync |

---

## Product Status

**Current Version:** 1.1.0 (Stable with Enhanced Data Integrity)

### Latest Release Highlights

**Data Integrity Fixes**
- Formula injection prevention — all user-entered fields sanitized
- Message timestamps no longer fabricated — distinguish actual vs. captured time
- Phone field now editable — auto-extracted value can be corrected

**Validation & Error Handling**
- Sheet access verified during setup — catch permission/worksheet errors early
- Specific error messages — know exactly what went wrong
- Safe history rendering — no HTML injection from user names

**Improved UX**
- Manual phone correction workflow when extraction fails
- Visual feedback for auto-extracted vs. manually-entered data
- Loading states during save and validation

---

## Quick Start

### Prerequisites
- Google Chrome (or Chromium-based browser)
- Active Google account with Google Sheets access
- WhatsApp Web access ([web.whatsapp.com](https://web.whatsapp.com))

### Installation (Development Mode)

1. **Download this repository** or clone it:
   ```bash
   git clone <repo-url>
   cd Lead\ capture
   ```

2. **Set up Google OAuth** (one-time):
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project (e.g., "WhatsApp Lead Capture")
   - Enable **Google Sheets API** (APIs & Services → Library)
   - Create **OAuth 2.0 Client ID**:
     - Type: Chrome Extension
     - Get your extension ID from `chrome://extensions` after loading it once
   - Copy the Client ID and update `manifest.json`:
     ```json
     "oauth2": {
       "client_id": "YOUR_CLIENT_ID_HERE"
     }
     ```

3. **Load into Chrome**:
   - Open `chrome://extensions`
   - Enable **Developer mode** (toggle, top right)
   - Click **Load unpacked**
   - Select the `Lead capture` folder
   - Pin the extension to your toolbar

### Using the Extension

#### First Time Setup
1. Open [web.whatsapp.com](https://web.whatsapp.com) in Chrome
2. Click the extension icon
3. Paste your **Google Sheet link** (full URL from address bar) or just the **Sheet ID**
4. Enter the **worksheet name** (sheet tab name, default: `Sheet1`)
5. Click **Connect Account** — the extension validates sheet access and worksheet existence
6. On success: extension is ready to capture leads

#### Capturing a Lead
1. Open a WhatsApp conversation with a customer
2. Click the extension icon
3. Review extracted data:
   - **Name** (pre-filled if found, editable)
   - **Phone** (auto-extracted if visible, editable if not)
   - **Message** (last message in conversation, read-only)
   - **Message Time** (when message was sent, read-only)
4. Add optional info:
   - Email address
   - Company name
   - Internal notes
5. Click **Save Lead to Sheet**
6. Lead is appended to your Google Sheet with:
   - Name, Phone, Email, Company
   - Original message text
   - Message timestamp and capture timestamp
   - WhatsApp source indicator

#### Viewing History
- Click **History** tab to see your last 20 captured leads
- Timestamps show when each lead was captured
- Sheet destination shown for each lead

---

## How It Works

### Architecture Overview

```
WhatsApp Web (Chrome Tab)
         ↓
[Content Script] — Extracts name, phone, message from DOM
         ↓
[Popup UI] — User review & correction layer
         ↓
[Service Worker] — OAuth, validation, Sheets API
         ↓
Google Sheets API — Append lead row with auto-generated headers
         ↓
Your Google Sheet — Lead stored with full metadata
```

### Data Flow

1. **Extraction** (Content Script)
   - Parses WhatsApp Web DOM to find active chat
   - Extracts: contact name (header), phone (contact info panel), last message
   - Returns lead candidate with extraction metadata

2. **Review** (Popup UI)
   - User confirms/edits extracted data
   - Can manually enter phone if auto-extraction failed
   - Adds optional context (email, company, notes)

3. **Validation & Storage** (Service Worker)
   - Authenticates with Google OAuth
   - Validates sheet access and worksheet existence
   - Sanitizes all user fields to prevent formula injection
   - Appends row to Google Sheet using Sheets API
   - Maintains local history (last 20 leads)

### Data Model

| Field | Source | Editable | Purpose |
|-------|--------|----------|---------|
| **Name** | WhatsApp header or manual | Yes | Contact name |
| **Phone** | Contact info panel or manual | Yes | Primary contact method |
| **Email** | User entry | Yes | Secondary contact |
| **Company** | User entry | Yes | Organization context |
| **Message** | Last chat message | No | Conversation reference |
| **Message Time** | Message timestamp | No | When customer messaged |
| **Message Date** | Extracted or null | No | Calendar date (may be unknown) |
| **Captured At** | Current timestamp | No | When extension captured lead |
| **Source** | Hardcoded | No | Always "WhatsApp Web" |

---

## Security & Privacy

### What Data Is Collected?

**You control what is saved:**
- Only data you explicitly click "Save" on reaches your Google Sheet
- WhatsApp contact name and phone extracted locally in browser
- No data sent to external servers except Google Sheets API

**Not collected:**
- Full message history (only last message text saved)
- User identifiers or device info
- Extension usage analytics or tracking
- Passwords or authentication tokens (managed by Chrome)

### How Is Data Stored?

- **Configuration** (sheet ID, worksheet name): Stored in `chrome.storage.sync` — encrypted by Chrome, syncs across your devices
- **Local history** (last 20 leads): Stored in `chrome.storage.local` — device-only, not synced
- **Leads**: Stored exclusively in *your* Google Drive via Google Sheets API — you control access, retention, sharing

### Security Measures

- **Formula Injection Prevention**: All user-entered fields are sanitized to prevent `=`, `+`, `-`, `@` formula execution in Sheets
- **OAuth 2.0**: Uses standard Google OAuth flow — no passwords stored or transmitted
- **RAW Value Input**: Sheets API uses RAW mode (no formula evaluation) for lead rows
- **Safe DOM Parsing**: History rendering uses DOM APIs to prevent HTML injection
- **Scoped Permissions**: OAuth scope limited to `spreadsheets` API only

### Known Limitations

- **WhatsApp DOM extraction is fragile**: Selectors depend on WhatsApp Web DOM structure which can change. If extraction breaks, update is required.
- **Phone visibility**: Phone number only shown if WhatsApp contact info panel is open. Group chats may not have extractable phone numbers.
- **Message context**: Only captures last visible message. Long conversations require manual note-taking for fuller context.
- **No end-to-end encryption**: Messages are read from WhatsApp Web unencrypted browser DOM (WhatsApp Web security model).

---

## Technical Details

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Manifest** | Manifest v3 | Chrome extension configuration |
| **Content Script** | Vanilla JavaScript | WhatsApp DOM extraction |
| **Popup UI** | HTML5 + CSS3 | User interface |
| **Popup Logic** | Vanilla JavaScript | State management, event handling |
| **Service Worker** | JavaScript + Promises | OAuth, Sheets API integration |
| **OAuth** | Google Identity API | Authentication |
| **Data Storage** | Chrome Storage API | Config & history persistence |
| **Sheets Integration** | Google Sheets API v4 | Lead persistence |

### File Structure

```
Lead capture/
├── manifest.json                  # Extension metadata, permissions, OAuth config
├── README.md                      # This file
├── Description.md                 # Detailed architecture documentation
├── audit.md                       # Security & UX audit findings
│
├── background/
│   └── service-worker.js          # OAuth token management, Sheets API calls,
│                                  # payload validation, error handling
│
├── content/
│   └── content.js                 # WhatsApp DOM extraction, lead parsing,
│                                  # phone/name/message extraction logic
│
├── popup/
│   ├── popup.html                 # UI structure (setup, lead form, history)
│   ├── popup.js                   # Orchestration, state management, Chrome messaging
│   └── popup.css                  # Styling (340px width, mobile-first)
│
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
│
└── .repowise/                     # Project metadata
```

### Key Functions

**content.js** — Lead Extraction
```javascript
extractLeadData()
  └─ Queries WhatsApp DOM for:
     ├─ Contact name (from header span[title])
     ├─ Phone number (from contact info panel with fallback)
     ├─ Last message text (from msg-container)
     └─ Message timestamp (from msg-meta or metadata)
  └─ Returns typed lead candidate object or error
```

**service-worker.js** — Storage & Validation
```javascript
validateSheet(token, sheetId, sheetName)
  └─ Verifies spreadsheet exists and worksheet is accessible
  
checkAndWriteHeaders(token, sheetId, sheetName)
  └─ Ensures sheet has required column headers on first write

appendToSheet(token, sheetId, sheetName, row)
  └─ Appends sanitized row using Sheets API v4
  
sanitizeForSheet(value)
  └─ Escapes formula-dangerous prefixes (=, +, -, @)
```

**popup.js** — User Workflow
```javascript
init()
  └─ Loads config, checks WhatsApp tab, triggers extraction

populateLeadView(data)
  └─ Fills form with extracted values, shows extraction status

validateSaveButton()
  └─ Enables save only when name AND phone are non-empty

saveLead()
  └─ Builds row, calls service worker, handles auth/errors
```

---

## Common Issues & Solutions

### "Spreadsheet does not exist" Error
**Cause**: Sheet ID is invalid or sheet has been deleted.  
**Fix**: Verify the Google Sheet still exists and try copying the full URL from your browser address bar.

### Phone number not extracting
**Cause**: WhatsApp hides phone in contact info drawer until clicked.  
**Fix**: Click the contact name to open the full contact card, then try capturing again. For groups, phone may not be available — enter manually.

### "No write access to worksheet" Error
**Cause**: Your Google account doesn't have edit permission on the sheet.  
**Fix**: Share the Google Sheet with yourself or ensure you're the owner. Re-authenticate by connecting the sheet again.

### Extension icon shows but popup doesn't load
**Cause**: Content script not injected (may require tab refresh after installation).  
**Fix**: Reload the WhatsApp Web tab. The service worker will inject the content script on next page load.

### Message timestamp shows "Unknown"
**Cause**: WhatsApp Web didn't render the message timestamp in the DOM (virtualized content).  
**Fix**: Scroll up/down in the chat to ensure the message is fully visible, then try again.

---

## Development & Contributing

### Project Maturity

This extension is in **active development** with focus on:
1. **Data Integrity** — Ensure captured data is accurate and safe (P0)
2. **Reliability** — Handle WhatsApp DOM changes and edge cases (P0/P1)
3. **User Experience** — Clear feedback, error recovery, accessibility (P1)
4. **Scalability** — Support batch capture, custom mappings, offline queueing (P2/P3)

### Testing

**Manual Testing Checklist:**
- [ ] Fresh install on clean Chrome profile
- [ ] OAuth flow (first save prompt)
- [ ] Sheet validation (valid and invalid sheet IDs)
- [ ] Lead extraction (saved contact, unsaved contact, group chat)
- [ ] Manual phone correction (extraction fails, user enters manually)
- [ ] Error recovery (network error, token expiry, permission denied)
- [ ] History retention (last 20 leads, clear on uninstall)

**Future Additions (Planned):**
- Automated DOM fixture tests for extraction reliability
- Integration tests for Sheets API calls
- Accessibility testing (WCAG 2.2 AA)
- Multi-language support (currently assumes English/Indian locale)

### Known Technical Debt

- DOM selectors depend on WhatsApp Web internals (no stable public API)
- Content script injection fragile on page load (no manifiest-based injection yet)
- Phone number extraction uses regex (no E.164 normalization)
- Limited support for group chats and business profiles
- Local history stores PII without user opt-in (needs privacy control)

### Roadmap

**Phase 1: Stability** (Current)
- Formula injection prevention
- Separate message time from capture time
- Editable phone field
- Sheet validation on setup
- Error handling improvements

**Phase 2: Accessibility** (Next)
- Keyboard-only navigation
- Screen reader announcements
- High-contrast mode
- Zoom support (200%)
- WCAG 2.2 AA compliance

**Phase 3: Scale**
- Batch capture (multi-select leads)
- Custom column mapping
- Offline queue with retry
- Duplicate detection
- Multiple sheet profiles

---

## License

MIT — Use freely, modify, distribute, including for commercial purposes.

## Support

- **Questions?** Open an issue with "Question:" prefix
- **Found a bug?** Open an issue with reproduction steps
- **Security issue?** Do not post publicly — email maintainers
- **Feature request?** Open an issue tagged "enhancement"

---

## Changelog

### v1.1.0 (Current)
- **Fixed**: Formula injection via RAW writes and sanitization
- **Fixed**: Message timestamps no longer fabricated
- **Added**: Editable phone field with extraction status
- **Added**: Sheet validation during setup
- **Fixed**: HTML injection in history rendering
- **Improved**: Error messages now specific to root cause

### v1.0.0 (Initial Release)
- Core functionality: WhatsApp to Google Sheets lead capture
- Auto-extraction of name, phone, message
- One-click save with review workflow
- Local history tracking

---

**Made for sales teams who live in WhatsApp.**
