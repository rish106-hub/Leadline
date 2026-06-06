// ---------------------------------------------------------------------------
// Column Mapping — Matches sheet headers to lead fields via alias table
// ---------------------------------------------------------------------------

const FIELD_ALIASES = {
  name:        ['name', 'full name', 'contact name', 'customer name', 'client name', 'person', 'lead name', 'contact'],
  phone:       ['phone', 'phone number', 'mobile', 'mobile number', 'cell', 'cell phone', 'whatsapp', 'whatsapp number', 'number', 'tel', 'telephone', 'contact number', 'ph', 'ph no', 'ph number'],
  email:       ['email', 'email address', 'e-mail', 'mail', 'email id', 'e mail'],
  company:     ['company', 'company name', 'organization', 'organisation', 'org', 'business', 'business name', 'account', 'employer', 'firm'],
  message:     ['message', 'last message', 'chat', 'note', 'description', 'details', 'content', 'text', 'inquiry', 'enquiry', 'query', 'msg'],
  messageTime: ['message time', 'msg time', 'time', 'chat time', 'whatsapp time'],
  messageDate: ['message date', 'msg date', 'chat date', 'whatsapp date'],
  capturedAt:  ['captured at', 'timestamp', 'created at', 'saved at', 'capture time', 'recorded at', 'date time', 'datetime', 'logged at', 'entry time'],
  source:      ['source', 'channel', 'origin', 'platform', 'from', 'lead source'],
  notes:       ['notes', 'additional notes', 'comments', 'remarks', 'extra', 'agent notes', 'internal notes'],
};

function matchHeaderToField(headerText) {
  const normalized = headerText.toLowerCase().trim()
    .replace(/[_\-]/g, ' ')   // treat _ and - as spaces
    .replace(/\s+/g, ' ');    // collapse whitespace

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(normalized)) return field;
  }
  return null;
}

function buildColumnMapping(headers) {
  const mapping = {};   // { fieldName: columnIndex }
  const unmapped = [];  // [{ header, index }]

  headers.forEach((header, index) => {
    if (!header || !header.trim()) return;
    const field = matchHeaderToField(header);
    if (field && !(field in mapping)) {
      mapping[field] = index;
    } else {
      unmapped.push({ header, index });
    }
  });

  return { mapping, unmapped, totalColumns: headers.length };
}

// Builds a row array aligned to the sheet's actual column order.
// If mapping is empty (no headers), falls back to default column order.
function buildRowFromMapping(fields, mapping, totalColumns) {
  const row = new Array(Math.max(totalColumns, 1)).fill('');

  // If notes field not mapped to its own column, append to message
  let messageValue = String(fields.message || '');
  if (fields.notes && !('notes' in mapping)) {
    messageValue = messageValue
      ? `${messageValue} | Note: ${fields.notes}`
      : fields.notes;
  }

  const values = {
    name:        String(fields.name || ''),
    phone:       String(fields.phone || ''),
    email:       String(fields.email || ''),
    company:     String(fields.company || ''),
    message:     messageValue,
    notes:       String(fields.notes || ''),
    messageTime: String(fields.messageTime || ''),
    messageDate: String(fields.messageDate || ''),
    capturedAt:  String(fields.capturedAt || new Date().toISOString()),
    source:      'WhatsApp Web',
  };

  for (const [field, colIndex] of Object.entries(mapping)) {
    if (colIndex < row.length && field in values) {
      row[colIndex] = sanitizeForSheet(values[field]);
    }
  }

  return row;
}

// Default column order when sheet has no headers yet
const DEFAULT_HEADERS = ['Name', 'Phone', 'Email', 'Company', 'Message', 'Message Time', 'Message Date', 'Captured At', 'Source'];
const DEFAULT_MAPPING  = { name: 0, phone: 1, email: 2, company: 3, message: 4, messageTime: 5, messageDate: 6, capturedAt: 7, source: 8 };

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function sanitizeForSheet(value) {
  if (typeof value !== 'string') return value;
  if (value.match(/^[=+\-@]/)) return `'${value}`;
  return value;
}

function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (token) {
        resolve(token);
      } else {
        reject(new Error('No token'));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Content Script Injection
// ---------------------------------------------------------------------------

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('web.whatsapp.com')) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js']
    }).catch(err => console.error('[Service Worker] Inject error:', err));
  }
});

// ---------------------------------------------------------------------------
// Sheets API
// ---------------------------------------------------------------------------

function sheetsRequest(token, method, url, body) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);

  return fetch(url, opts).then(res => {
    if (res.status === 401) {
      return new Promise(resolve => {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          resolve(Promise.reject(new Error('TOKEN_EXPIRED')));
        });
      });
    }
    if (!res.ok) {
      return res.json().then(b => {
        throw new Error(b?.error?.message || `HTTP ${res.status}`);
      }).catch(e => {
        if (e.message.startsWith('HTTP')) throw e;
        throw new Error(`HTTP ${res.status}`);
      });
    }
    return res.json();
  });
}

function appendToSheet(token, sheetId, sheetName, row) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  return sheetsRequest(token, 'POST', url, { values: [row] });
}

// ---------------------------------------------------------------------------
// Header Reading & Mapping
// ---------------------------------------------------------------------------

function readSheetHeaders(token, sheetId, sheetName) {
  // Read a wide range so we capture any column layout
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}!A1:Z1`;
  return sheetsRequest(token, 'GET', url).then(data => {
    const row = (data.values && data.values[0]) || [];
    return row.map(h => (typeof h === 'string' ? h : String(h)));
  });
}

// ---------------------------------------------------------------------------
// Sheet Validation (now also reads headers + builds mapping)
// ---------------------------------------------------------------------------

function validateSheet(token, sheetId, sheetName) {
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=spreadsheetId,properties,sheets`;

  return sheetsRequest(token, 'GET', metaUrl)
    .then(data => {
      const sheets = data.sheets || [];
      const sheetExists = sheets.some(s => s.properties.title === sheetName);

      if (!sheetExists) {
        const available = sheets.map(s => s.properties.title).join(', ');
        throw new Error(`WORKSHEET_NOT_FOUND: "${sheetName}" not found. Available: ${available}`);
      }
    })
    .then(() => readSheetHeaders(token, sheetId, sheetName))
    .then(headers => {
      if (!headers.length) {
        // Sheet is empty — we'll write default headers on first save
        return {
          valid: true,
          sheetId,
          sheetName,
          headers: [],
          mapping: {},
          unmapped: [],
          totalColumns: 0,
          hasHeaders: false
        };
      }

      const { mapping, unmapped, totalColumns } = buildColumnMapping(headers);
      return {
        valid: true,
        sheetId,
        sheetName,
        headers,
        mapping,
        unmapped,
        totalColumns,
        hasHeaders: true
      };
    });
}

// ---------------------------------------------------------------------------
// Ensure Headers Written (only when sheet is fresh/empty)
// ---------------------------------------------------------------------------

function ensureDefaultHeaders(token, sheetId, sheetName) {
  return readSheetHeaders(token, sheetId, sheetName).then(headers => {
    const hasData = headers.some(h => h.trim());
    if (!hasData) {
      return appendToSheet(token, sheetId, sheetName, DEFAULT_HEADERS);
    }
  });
}

// ---------------------------------------------------------------------------
// Message Handlers
// ---------------------------------------------------------------------------

function handleSaveRow(request, sendResponse) {
  const { sheetId, sheetName, fields } = request;

  if (!sheetId || !sheetName || !fields || typeof fields !== 'object') {
    sendResponse({ success: false, error: 'Invalid request: missing sheetId, sheetName, or fields' });
    return true;
  }

  getAuthToken(true)
    .then(token => {
      return new Promise(resolve => {
        chrome.storage.sync.get(['columnMapping', 'totalColumns'], data => {
          resolve({ token, storedMapping: data.columnMapping, storedTotal: data.totalColumns });
        });
      });
    })
    .then(async ({ token, storedMapping, storedTotal }) => {
      let mapping = storedMapping && Object.keys(storedMapping).length > 0 ? storedMapping : null;
      let totalColumns = storedTotal || 0;

      // No mapping cached (e.g. connected before this version, or first run).
      // Re-read headers from the actual sheet and build mapping on the fly.
      if (!mapping) {
        console.log('[SW] No mapping cached — reading headers from sheet');
        const headers = await readSheetHeaders(token, sheetId, sheetName);

        if (headers.length === 0) {
          // Truly empty sheet — write default headers then use default mapping
          console.log('[SW] Sheet empty — writing default headers');
          await appendToSheet(token, sheetId, sheetName, DEFAULT_HEADERS);
          mapping = DEFAULT_MAPPING;
          totalColumns = DEFAULT_HEADERS.length;
        } else {
          // Sheet already has headers — respect them
          const result = buildColumnMapping(headers);
          mapping = result.mapping;
          totalColumns = result.totalColumns;
          console.log('[SW] Built mapping from sheet headers:', mapping);
          // Cache so future saves don't need to re-read
          chrome.storage.sync.set({ columnMapping: mapping, totalColumns, hasHeaders: true, sheetHeaders: headers });
        }
      }

      const row = buildRowFromMapping(fields, mapping, totalColumns);
      console.log('[SW] Sending row to sheet:', row);

      return appendToSheet(token, sheetId, sheetName, row)
        .catch(err => {
          if (err.message === 'TOKEN_EXPIRED') {
            return getAuthToken(true).then(newToken =>
              appendToSheet(newToken, sheetId, sheetName, row)
            );
          }
          throw err;
        });
    })
    .then(() => sendResponse({ success: true }))
    .catch(err => {
      console.error('[SW] Save error:', err.message);
      sendResponse({ success: false, error: err.message });
    });

  return true;
}

function handleValidateSheet(request, sendResponse) {
  const { sheetId, sheetName } = request;

  if (!sheetId || !sheetName) {
    sendResponse({ success: false, error: 'Invalid request: missing sheetId or sheetName' });
    return true;
  }

  getAuthToken(true)
    .then(token => validateSheet(token, sheetId, sheetName))
    .then(result => sendResponse({ success: true, data: result }))
    .catch(err => sendResponse({ success: false, error: err.message }));

  return true;
}

function handleRefreshMapping(request, sendResponse) {
  const { sheetId, sheetName } = request;

  if (!sheetId || !sheetName) {
    sendResponse({ success: false, error: 'Invalid request: missing sheetId or sheetName' });
    return true;
  }

  getAuthToken(false) // non-interactive re-read
    .then(token => readSheetHeaders(token, sheetId, sheetName))
    .then(headers => {
      const { mapping, unmapped, totalColumns } = buildColumnMapping(headers);
      sendResponse({ success: true, data: { headers, mapping, unmapped, totalColumns, hasHeaders: headers.length > 0 } });
    })
    .catch(err => sendResponse({ success: false, error: err.message }));

  return true;
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'saveRow')         return handleSaveRow(request, sendResponse);
  if (request.action === 'validateSheet')   return handleValidateSheet(request, sendResponse);
  if (request.action === 'refreshMapping')  return handleRefreshMapping(request, sendResponse);
  return true;
});
