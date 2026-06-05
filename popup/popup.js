const $ = (id) => document.getElementById(id);

let leadData = null;
let config = null;

// --- Views ---
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(viewId).classList.add('active');
}

// --- Toast ---
function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.classList.remove('show'); }, 3000);
}

// --- Config ---
function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['sheetId', 'sheetName'], (data) => {
      resolve(data.sheetId ? data : null);
    });
  });
}

function saveConfig(sheetId, sheetName) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ sheetId, sheetName }, resolve);
  });
}

// --- Validation ---
function validateSaveButton() {
  const name = $('inputName')?.value?.trim();
  const phone = leadData?.phone;
  const canSave = !!(name && phone && phone.trim());
  $('btnSave').disabled = !canSave;
  $('btnSave').title = canSave ? '' : 'Name and Phone required';
}

// Re-validate when user types name
document.addEventListener('DOMContentLoaded', () => {
  $('inputName')?.addEventListener('input', validateSaveButton);
});

// --- Populate lead view ---
function populateLead(data, cfg) {
  // Pre-fill name if found, else leave blank for manual entry
  const nameInput = $('inputName');
  nameInput.value = (data.name && data.name !== 'Unknown') ? data.name : '';

  const phoneEl = $('displayPhone');
  if (data.phone) {
    phoneEl.textContent = data.phone;
    phoneEl.classList.remove('empty');
  } else {
    phoneEl.textContent = 'Not found — open contact info panel';
    phoneEl.classList.add('empty');
  }

  const msgEl = $('displayMessage');
  if (data.message) {
    msgEl.textContent = data.message;
    msgEl.classList.remove('empty');
  } else {
    msgEl.textContent = 'No message';
    msgEl.classList.add('empty');
  }

  const timeEl = $('displayMessageTime');
  if (data.messageTime) {
    timeEl.textContent = data.messageTime;
    timeEl.classList.remove('empty');
  } else {
    timeEl.textContent = '—';
    timeEl.classList.add('empty');
  }

  const dateEl = $('displayMessageDate');
  if (data.messageDate) {
    dateEl.textContent = data.messageDate;
    dateEl.classList.remove('empty');
  } else {
    dateEl.textContent = '—';
    dateEl.classList.add('empty');
  }

  $('sheetTarget').textContent = `→ ${cfg.sheetName}`;
  $('sheetBadge').textContent = cfg.sheetName;
}

// --- Save row ---
async function saveRow() {
  const btn = $('btnSave');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Saving…';

  const now = new Date();
  const capturedDate = now.toISOString().split('T')[0];
  const capturedTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  // Prefix phone with ' to prevent Google Sheets treating +91... as formula
  const phone = leadData.phone ? `'${leadData.phone}` : '';

  const row = [
    capturedDate,
    $('inputName').value.trim() || leadData.name || '',
    phone,
    leadData.message || ''
  ];

  chrome.runtime.sendMessage(
    { action: 'saveRow', sheetId: config.sheetId, sheetName: config.sheetName, row },
    (response) => {
      btn.innerHTML = 'Save to Sheet';
      validateSaveButton();

      if (chrome.runtime.lastError || !response) {
        showToast('Extension error — try again', 'error');
        return;
      }
      if (response.success) {
        showToast(`Lead saved to ${config.sheetName}`, 'success');
        // Clear editable fields
        $('inputEmail').value = '';
        $('inputCompany').value = '';
      } else {
        showToast(response.error || 'Save failed', 'error');
      }
    }
  );
}

// --- Init ---
async function init() {
  config = await loadConfig();

  if (!config) {
    showView('viewSetup');
    return;
  }

  $('sheetBadge').textContent = config.sheetName;

  // Query active WhatsApp tab for lead data
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    console.log('Tab:', tab?.url);
    if (!tab || !tab.url?.includes('web.whatsapp.com')) {
      console.log('Not on WhatsApp');
      showView('viewNoChat');
      return;
    }

    console.log('Sending message to content script...');
    chrome.tabs.sendMessage(tab.id, { action: 'extractLead' }, (response) => {
      console.log('Response from content script:', response);
      console.log('Runtime error:', chrome.runtime.lastError);

      if (chrome.runtime.lastError || !response) {
        console.log('No response or error');
        showView('viewNoChat');
        return;
      }

      if (response.error === 'NO_CHAT') {
        console.log('No chat open');
        showView('viewNoChat');
        return;
      }

      console.log('Lead data:', response);
      leadData = response;
      populateLead(leadData, config);
      validateSaveButton();
      showView('viewLead');
    });
  });
}

// --- Event listeners ---
$('btnSaveConfig').addEventListener('click', async () => {
  let sheetInput = $('inputSheetId').value.trim();
  const sheetName = $('inputSheetName').value.trim() || 'Sheet1';

  if (!sheetInput) {
    showToast('Paste a Sheet link or ID', 'error');
    return;
  }

  // Extract ID from full URL if pasted
  let sheetId = sheetInput;
  if (sheetInput.includes('docs.google.com')) {
    const match = sheetInput.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      sheetId = match[1];
    } else {
      showToast('Invalid Sheet link', 'error');
      return;
    }
  }

  await saveConfig(sheetId, sheetName);
  config = { sheetId, sheetName };
  $('sheetBadge').textContent = sheetName;
  showToast('Sheet connected!', 'success');

  // Re-init to load lead view
  setTimeout(init, 500);
});

$('btnSave').addEventListener('click', saveRow);

$('btnSettings').addEventListener('click', () => {
  $('inputSheetId').value = config?.sheetId || '';
  $('inputSheetName').value = config?.sheetName || 'Sheet1';
  showView('viewSetup');
});

$('btnSettingsFromNoChat').addEventListener('click', () => {
  $('inputSheetId').value = config?.sheetId || '';
  $('inputSheetName').value = config?.sheetName || 'Sheet1';
  showView('viewSetup');
});

init();
