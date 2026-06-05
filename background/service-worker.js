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
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

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

function checkAndWriteHeaders(token, sheetId, sheetName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}!A1:I1`;

  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(res => {
    if (!res.ok) return null;
    return res.json();
  }).then(data => {
    const hasData = data && data.values && data.values.length > 0 && data.values[0].some(Boolean);
    if (!hasData) {
      return appendToSheet(token, sheetId, sheetName, [
        'Name', 'Phone', 'Email', 'Company', 'Message', 'Message Time', 'Message Date', 'Timestamp', 'Source'
      ]);
    }
  }).catch(() => null);
}

function handleSaveRow(request, sendResponse) {
  const { sheetId, sheetName, row } = request;

  getAuthToken(true)
    .then(token => {
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
    .then(() => {
      sendResponse({ success: true });
    })
    .catch(err => {
      sendResponse({ success: false, error: err.message });
    });

  return true;
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'saveRow') {
    handleSaveRow(request, sendResponse);
  }
  return true;
});
