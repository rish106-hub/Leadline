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

// Inject content script on tab update
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('web.whatsapp.com')) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js']
    }).catch(err => console.error('[Service Worker] Inject error:', err));
  }
});

function appendToSheet(token, sheetId, sheetName, row) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [row] })
  }).then(res => {
    if (res.status === 401) {
      return new Promise(resolve => {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          resolve(Promise.reject(new Error('TOKEN_EXPIRED')));
        });
      });
    }
    if (!res.ok) {
      return res.json().then(body => {
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }).catch(() => {
        throw new Error(`HTTP ${res.status}`);
      });
    }
    return res.json();
  });
}

function validateSheet(token, sheetId, sheetName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=spreadsheetId,properties,sheets`;

  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(res => {
    if (res.status === 401) {
      throw new Error('UNAUTHORIZED: Invalid OAuth token');
    }
    if (res.status === 403) {
      throw new Error('FORBIDDEN: No access to this spreadsheet');
    }
    if (res.status === 404) {
      throw new Error('NOT_FOUND: Spreadsheet does not exist');
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed to fetch spreadsheet`);
    }
    return res.json();
  }).then(data => {
    // Check if worksheet exists
    const sheets = data.sheets || [];
    const sheetExists = sheets.some(s => s.properties.title === sheetName);

    if (!sheetExists) {
      throw new Error(`WORKSHEET_NOT_FOUND: "${sheetName}" worksheet does not exist. Available sheets: ${sheets.map(s => s.properties.title).join(', ')}`);
    }

    return { valid: true, sheetName, sheetId };
  });
}

function checkAndWriteHeaders(token, sheetId, sheetName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}!A1:I1`;

  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(res => {
    if (res.status === 401) {
      throw new Error('UNAUTHORIZED: OAuth token expired');
    }
    if (res.status === 403) {
      throw new Error('FORBIDDEN: No write access to worksheet');
    }
    if (res.status === 404) {
      throw new Error('NOT_FOUND: Worksheet does not exist');
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed to read worksheet headers`);
    }
    return res.json();
  }).then(data => {
    const hasData = data && data.values && data.values.length > 0 && data.values[0].some(Boolean);
    if (!hasData) {
      return appendToSheet(token, sheetId, sheetName, [
        'Name', 'Phone', 'Email', 'Company', 'Message', 'Message Time', 'Message Date', 'Timestamp', 'Source'
      ]);
    }
  });
}

function handleSaveRow(request, sendResponse) {
  const { sheetId, sheetName, row } = request;

  if (!sheetId || !sheetName || !Array.isArray(row)) {
    sendResponse({ success: false, error: 'Invalid request: missing sheetId, sheetName, or row' });
    return true;
  }

  if (row.length > 20) {
    sendResponse({ success: false, error: 'Row exceeds maximum column count' });
    return true;
  }

  const sanitizedRow = row.map(sanitizeForSheet);

  getAuthToken(true)
    .then(async token => {
      // Ensure headers exist before appending
      await checkAndWriteHeaders(token, sheetId, sheetName);

      return appendToSheet(token, sheetId, sheetName, sanitizedRow)
        .catch(err => {
          if (err.message === 'TOKEN_EXPIRED') {
            return getAuthToken(true).then(newToken =>
              appendToSheet(newToken, sheetId, sheetName, sanitizedRow)
            );
          }
          throw err;
        });
    })
    .then(() => {
      sendResponse({ success: true });
    })
    .catch(err => {
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
    .then(result => {
      sendResponse({ success: true, data: result });
    })
    .catch(err => {
      sendResponse({ success: false, error: err.message });
    });

  return true;
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'saveRow') {
    handleSaveRow(request, sendResponse);
  } else if (request.action === 'validateSheet') {
    handleValidateSheet(request, sendResponse);
  }
  return true;
});
