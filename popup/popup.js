const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);

let leadData = null;
let config = null;
let history = [];

// --- Tab Management ---
function initTabs() {
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.getAttribute('data-view');
      showView(viewId);
      
      // Update active tab UI
      $$('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function showView(viewId) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $(viewId).classList.add('active');
  
  // If switching to history, refresh it
  if (viewId === 'viewHistory') renderHistory();
}

// --- Toast ---
function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.classList.remove('show'); }, 3000);
}

// --- Storage & Config ---
async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['sheetId', 'sheetName'], (data) => {
      resolve(data.sheetId ? data : null);
    });
  });
}

async function loadHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['leadHistory'], (data) => {
      history = data.leadHistory || [];
      resolve(history);
    });
  });
}

async function addToHistory(lead) {
  history.unshift(lead);
  if (history.length > 20) history.pop(); // Keep last 20
  return new Promise((resolve) => {
    chrome.storage.local.set({ leadHistory: history }, resolve);
  });
}

// --- UI Updates ---
function updateStatus(isConnected) {
  const dot = $('statusDot');
  const text = $('statusText');
  if (isConnected) {
    dot.classList.add('active');
    text.textContent = 'Connected';
  } else {
    dot.classList.remove('active');
    text.textContent = 'Disconnected';
  }
}

function renderHistory() {
  const list = $('historyList');
  const count = $('historyCount');
  count.textContent = history.length;

  // Clear list
  list.innerHTML = '';

  if (history.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-history';
    emptyDiv.textContent = 'No leads saved yet.';
    list.appendChild(emptyDiv);
    return;
  }

  history.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'history-item';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'history-item-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'history-item-name';
    nameSpan.textContent = item.name || 'Unknown';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'history-item-time';
    timeSpan.textContent = new Date(item.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(timeSpan);

    const badgeDiv = document.createElement('div');
    badgeDiv.className = 'badge';
    badgeDiv.textContent = item.sheetName || 'Sheet';

    itemDiv.appendChild(infoDiv);
    itemDiv.appendChild(badgeDiv);
    list.appendChild(itemDiv);
  });
}

// --- Lead Extraction & Population ---
function populateLeadView(data) {
  $('displayPhone').textContent = data.phone || 'Unknown';
  $('displayMessage').textContent = data.message || 'No message';

  const messageTimeEl = $('displayMessageTime');
  const messageTimeText = data.messageTime || '(Unknown)';
  if (messageTimeEl) {
    messageTimeEl.textContent = messageTimeText;
    if (!data.messageTime) messageTimeEl.classList.add('empty');
  }

  const messageDateEl = $('displayMessageDate');
  const messageDateText = data.messageDate || '(Unknown)';
  if (messageDateEl) {
    messageDateEl.textContent = messageDateText;
    if (!data.messageDate) messageDateEl.classList.add('empty');
  }

  // Pre-fill name if found
  const nameInput = $('inputName');
  if (data.name && data.name !== 'Unknown') {
    nameInput.value = data.name;
  } else {
    nameInput.value = '';
  }

  // Pre-fill phone if found, mark status
  const phoneInput = $('inputPhone');
  const phoneStatus = $('phoneStatus');
  if (phoneInput && data.phone) {
    phoneInput.value = data.phone;
    if (phoneStatus) {
      const label = data.phoneSource === 'auto-opened'
        ? '✓ Auto-extracted (contact info opened automatically)'
        : '✓ Auto-extracted from chat';
      phoneStatus.textContent = label;
      phoneStatus.className = 'helper-text success';
    }
  } else if (phoneInput && !data.phone) {
    phoneInput.value = '';
    if (phoneStatus) {
      phoneStatus.textContent = 'Phone not found — enter manually';
      phoneStatus.className = 'helper-text error';
    }
  }

  validateSaveButton();
}

function validateSaveButton() {
  const name = $('inputName').value.trim();
  const phone = $('inputPhone')?.value?.trim() || '';
  const canSave = !!(name && phone);
  $('btnSave').disabled = !canSave;
}

// --- Save Action ---
async function saveLead() {
  const btn = $('btnSave');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Saving...';

  const name = $('inputName').value.trim();
  const email = $('inputEmail').value.trim();
  const company = $('inputCompany').value.trim();
  const notes = $('inputNotes').value.trim();

  // Columns: Name, Phone, Email, Company, Message, Message Time, Message Date, Timestamp, Source
  // Service worker will sanitize to prevent formula injection
  // Use actual captured timestamp and keep message time/date as-is (can be null/empty)
  const phone = $('inputPhone').value.trim();
  const row = [
    name,
    phone,
    email,
    company,
    `${leadData.message}${notes ? ' | Note: ' + notes : ''}`,
    leadData.messageTime || '',
    leadData.messageDate || '',
    leadData.capturedAt || new Date().toISOString(),
    'WhatsApp Web'
  ];

  chrome.runtime.sendMessage(
    { action: 'saveRow', sheetId: config.sheetId, sheetName: config.sheetName, row },
    async (response) => {
      btn.innerHTML = originalHtml;
      
      if (chrome.runtime.lastError || !response) {
        showToast('Connection error', 'error');
        btn.disabled = false;
        return;
      }

      if (response.success) {
        showToast('Lead saved successfully!');
        
        // Add to local history
        await addToHistory({
          name,
          timestamp: leadData.capturedAt || new Date().toISOString(),
          sheetName: config.sheetName
        });
        
        // Clear inputs
        $('inputName').value = '';
        $('inputPhone').value = '';
        $('inputEmail').value = '';
        $('inputCompany').value = '';
        $('inputNotes').value = '';

        const phoneStatus = $('phoneStatus');
        if (phoneStatus) phoneStatus.textContent = '';

        validateSaveButton();
      } else {
        showToast(response.error || 'Failed to save', 'error');
        btn.disabled = false;
      }
    }
  );
}

// --- Initialization ---
async function init() {
  config = await loadConfig();
  await loadHistory();
  initTabs();
  
  updateStatus(!!config);

  if (!config) {
    showView('viewSetup');
    // Hide nav if not setup
    $('viewLead').classList.remove('active');
    return;
  }

  // Auto-refresh lead data
  refreshLeadData();
}

function queryActiveTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0]));
  });
}

function requestLeadData(tabId) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { action: 'extractLead' }, response => {
      const error = chrome.runtime.lastError;
      resolve(error ? null : response);
    });
  });
}

async function refreshLeadData() {
  const tab = await queryActiveTab();
  if (!tab || !tab.url?.includes('web.whatsapp.com')) {
    showView('viewNoChat');
    return;
  }

  // Show loading state — auto-open contact info can take up to ~2s
  $('loadingMessage').textContent = 'Opening contact details…';
  showView('viewLoading');

  let response = await requestLeadData(tab.id);

  // Existing WhatsApp tabs may not have a listener after an extension reload.
  if (!response) {
    $('loadingMessage').textContent = 'Injecting script…';
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content.js']
      });
      response = await requestLeadData(tab.id);
    } catch (error) {
      console.error('[WA Lead] Could not inject content script:', error);
    }
  }

  if (!response || response.error) {
    showView('viewNoChat');
    return;
  }

  leadData = response;
  populateLeadView(leadData);
  showView('viewLead');

  // Update nav state
  $$('.nav-item').forEach(b => b.classList.remove('active'));
  $$('.nav-item')[0].classList.add('active');
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  $('btnSaveConfig').addEventListener('click', async () => {
    const btn = $('btnSaveConfig');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Validating...';

    let sheetInput = $('inputSheetId').value.trim();
    const sheetName = $('inputSheetName').value.trim() || 'Sheet1';

    if (!sheetInput) {
      showToast('Please enter a Sheet link or ID', 'error');
      btn.textContent = originalText;
      btn.disabled = false;
      return;
    }

    let sheetId = sheetInput;
    if (sheetInput.includes('docs.google.com')) {
      const match = sheetInput.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        sheetId = match[1];
      } else {
        showToast('Invalid Sheet URL', 'error');
        btn.textContent = originalText;
        btn.disabled = false;
        return;
      }
    }

    // Validate sheet access and worksheet existence
    chrome.runtime.sendMessage(
      { action: 'validateSheet', sheetId, sheetName },
      (response) => {
        btn.textContent = originalText;

        if (chrome.runtime.lastError || !response) {
          showToast('Connection error', 'error');
          btn.disabled = false;
          return;
        }

        if (response.success) {
          chrome.storage.sync.set({ sheetId, sheetName }, () => {
            config = { sheetId, sheetName };
            updateStatus(true);
            showToast(`Connected to "${sheetName}"!`);
            setTimeout(init, 1000);
          });
        } else {
          showToast(response.error || 'Failed to validate sheet', 'error');
          btn.disabled = false;
        }
      }
    );
  });

  $('btnSave').addEventListener('click', saveLead);
  $('inputName').addEventListener('input', validateSaveButton);
  $('inputPhone').addEventListener('input', validateSaveButton);
  $('btnRefresh').addEventListener('click', refreshLeadData);

  // Copy buttons
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.btn-copy');
    if (copyBtn) {
      const targetId = copyBtn.getAttribute('data-copy');
      const text = $(targetId).textContent;
      navigator.clipboard.writeText(text).then(() => {
        const originalSvg = copyBtn.innerHTML;
        copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => { copyBtn.innerHTML = originalSvg; }, 2000);
      });
    }
  });
});

init();
