(() => {
  const CONTENT_SCRIPT_VERSION = '1.2.0';
  if (globalThis.__waLeadCaptureInstalledVersion === CONTENT_SCRIPT_VERSION) return;
  globalThis.__waLeadCaptureInstalledVersion = CONTENT_SCRIPT_VERSION;

  const GENERIC_HEADER_TEXT = new Set([
    'click here for contact info',
    'contact info',
    'online',
    'offline',
    'search',
    'typing…',
    'typing...'
  ]);

  function cleanText(value) {
    return value?.replace(/\s+/g, ' ').trim() || '';
  }

  function isPhoneNumber(value) {
    const text = cleanText(value);
    if (!/^\+?[\d][\d\s().-]+$/.test(text)) return false;
    const digitCount = text.replace(/\D/g, '').length;
    return digitCount >= 8 && digitCount <= 15;
  }

  function findPhoneInText(value) {
    const matches = cleanText(value).match(/\+?[\d][\d\s().-]{6,}\d/g) || [];
    return matches.map(cleanText).find(isPhoneNumber) || null;
  }

  function findMainPanel() {
    return document.querySelector('#main') ||
      document.querySelector('[data-testid="conversation"]') ||
      document.querySelector('div[role="main"]');
  }

  function findHeader(mainPanel) {
    return mainPanel.querySelector('header') ||
      document.querySelector('#main header');
  }

  function extractName(header) {
    if (!header) return null;

    const candidates = [
      ...header.querySelectorAll('span[title], [dir="auto"][title], [dir="auto"]')
    ];

    for (const element of candidates) {
      const text = cleanText(element.getAttribute('title') || element.textContent);
      const normalized = text.toLowerCase();

      if (
        text &&
        text.length < 100 &&
        !GENERIC_HEADER_TEXT.has(normalized) &&
        !isPhoneNumber(text) &&
        !/^\d{1,2}:\d{2}(\s*[ap]m)?$/i.test(text)
      ) {
        return text;
      }
    }

    return null;
  }

  function extractPhone(mainPanel, header) {
    const phoneSelectors = [
      '[data-testid="contact-info-subtitle"]',
      '[aria-label*="phone" i]',
      'a[href^="tel:"]',
      'span[title^="+"]',
      '[dir="auto"]'
    ];

    const contactInfoLabel = [...document.querySelectorAll('h1, h2, h3, [role="heading"], span, div')]
      .find(element => cleanText(element.textContent).toLowerCase() === 'contact info');
    let contactPanel = contactInfoLabel;

    while (contactPanel && contactPanel !== document.body) {
      if (findPhoneInText(contactPanel.textContent)) break;
      contactPanel = contactPanel.parentElement;
    }
    if (contactPanel === document.body) contactPanel = null;

    const searchAreas = [contactPanel, header].filter(Boolean);
    const candidates = [];
    const seen = new Set();

    for (const area of searchAreas) {
      for (const element of area.querySelectorAll(phoneSelectors.join(','))) {
        if (seen.has(element)) continue;
        seen.add(element);

        const text = findPhoneInText(
          element.getAttribute('href')?.replace(/^tel:/, '') ||
          element.getAttribute('title') ||
          element.textContent
        );

        if (!text) continue;

        let score = 0;
        if (contactPanel?.contains(element)) score += 5;
        if (header?.contains(element)) score += 2;
        if (text.startsWith('+')) score += 2;
        if (element.children.length === 0) score += 1;

        candidates.push({ text, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.text || null;
  }

  function findMessageContainers(mainPanel) {
    const selectors = [
      '[data-testid="msg-container"]',
      '.message-in',
      '.message-out',
      '[data-pre-plain-text]'
    ];

    const containers = [];
    const seen = new Set();

    for (const element of mainPanel.querySelectorAll(selectors.join(','))) {
      const container = element.closest('[data-testid="msg-container"], .message-in, .message-out') || element;
      if (!seen.has(container)) {
        seen.add(container);
        containers.push(container);
      }
    }

    return containers;
  }

  function extractMessage(mainPanel) {
    const containers = findMessageContainers(mainPanel);
    const lastMessage = containers[containers.length - 1];
    if (!lastMessage) return { message: null, messageTime: null };

    const metadataElement = lastMessage.querySelector('[data-pre-plain-text]') ||
      lastMessage.querySelector('[data-testid="msg-meta"]');
    const metadata = cleanText(
      metadataElement?.getAttribute('data-pre-plain-text') ||
      metadataElement?.textContent
    );
    const timeMatch = metadata.match(/\b\d{1,2}:\d{2}(?:\s*[ap]m)?\b/i) ||
      cleanText(lastMessage.textContent).match(/\b\d{1,2}:\d{2}(?:\s*[ap]m)?\b/i);

    const textElement = lastMessage.querySelector(
      '[data-testid="msg-text"], .selectable-text, .copyable-text [dir="ltr"], .copyable-text [dir="auto"]'
    );

    let message = cleanText(textElement?.textContent);
    if (!message) {
      message = cleanText(lastMessage.textContent)
        .replace(/\b\d{1,2}:\d{2}(?:\s*[ap]m)?\b/gi, '')
        .replace(/Edited$/i, '')
        .trim();
    }

    return {
      message: message ? message.substring(0, 500) : null,
      messageTime: timeMatch?.[0] || null
    };
  }

  // --- Smart Contact Info Auto-Open ---

  // WhatsApp Web is a React app — plain .click() misses React's synthetic event handler.
  // Dispatching the full native mouse event sequence (with bubbles) lets React's root
  // event delegation pick it up.
  function simulateClick(element) {
    ['mousedown', 'mouseup', 'click'].forEach(type => {
      element.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 1
      }));
    });
  }

  function isContactPanelOpen() {
    // Avoid false positives — check for specific contact-info panel content
    if (document.querySelector('[data-testid="contact-info"]')) return true;
    if (document.querySelector('[data-testid="rightSidebar"]')) return true;
    // Look for a heading that says "Contact info" (language-agnostic fallback)
    const headings = document.querySelectorAll('h1, h2, [role="heading"], span');
    for (const el of headings) {
      if (el.textContent.trim().toLowerCase() === 'contact info') return true;
    }
    return false;
  }

  function findContactInfoTrigger(header) {
    if (!header) return null;

    // Ordered by specificity — first match wins
    const selectors = [
      '[data-testid="conversation-info-header"]',
      '[data-testid="conversation-header-user"]',
      '[aria-label*="contact info" i]',
      '[aria-label*="profile" i]',
      '[aria-label*="open contact" i]',
      'div[role="button"]',
      '[role="button"]',
    ];

    for (const sel of selectors) {
      const el = header.querySelector(sel) || document.querySelector(`#main ${sel}`);
      if (el) {
        console.log('[WA Lead] Contact trigger found via:', sel, el);
        return el;
      }
    }

    // Last resort: first child div of header (the name+avatar row)
    const fallback = header.firstElementChild;
    console.log('[WA Lead] Contact trigger fallback: header.firstElementChild', fallback);
    return fallback || header;
  }

  function waitForContactPanel(timeoutMs = 2200) {
    if (isContactPanelOpen()) return Promise.resolve(true);

    return new Promise(resolve => {
      const timer = setTimeout(() => {
        observer.disconnect();
        console.log('[WA Lead] Contact panel wait timed out after', timeoutMs, 'ms');
        resolve(false);
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        if (isContactPanelOpen()) {
          clearTimeout(timer);
          observer.disconnect();
          console.log('[WA Lead] Contact panel detected');
          resolve(true);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function tryAutoOpenContactInfo(header) {
    if (isContactPanelOpen()) {
      console.log('[WA Lead] Contact panel already open');
      return true;
    }

    const trigger = findContactInfoTrigger(header);
    if (!trigger) {
      console.log('[WA Lead] No contact trigger found');
      return false;
    }

    console.log('[WA Lead] Simulating click on:', trigger.tagName, trigger.getAttribute('data-testid') || trigger.getAttribute('role') || '');
    simulateClick(trigger);

    const opened = await waitForContactPanel(2200);
    if (opened) await sleep(300); // Let panel content fully paint
    return opened;
  }

  // --- Main Extraction (Smart, Async) ---

  async function extractLeadDataSmart() {
    try {
      if (!document.body) {
        return { error: 'NO_CHAT', message: 'Page not ready' };
      }

      const mainPanel = findMainPanel();
      if (!mainPanel) {
        return { error: 'NO_CHAT', message: 'Open a WhatsApp conversation first' };
      }

      const header = findHeader(mainPanel);
      const name = extractName(header);
      const messageData = extractMessage(mainPanel);

      if (!name && !messageData.message) {
        return { error: 'NO_CHAT', message: 'Open a WhatsApp conversation first' };
      }

      // First attempt — panel may already be open
      let phone = extractPhone(mainPanel, header);
      let phoneSource = phone ? 'extracted' : null;

      // Auto-open contact info panel if phone missing
      if (!phone) {
        const panelOpened = await tryAutoOpenContactInfo(header);
        if (panelOpened) {
          phone = extractPhone(mainPanel, header);
          phoneSource = phone ? 'auto-opened' : null;
        }
      }

      return {
        name: name || 'Unknown',
        phone,
        phoneSource,
        email: null,
        company: null,
        message: messageData.message || 'No message',
        messageTime: messageData.messageTime,
        messageDate: null,
        capturedAt: new Date().toISOString(),
        source: 'WhatsApp Web'
      };
    } catch (err) {
      console.error('[WA Lead] Extract error:', err);
      return { error: 'EXTRACT_ERROR', message: err.message };
    }
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'extractLead') {
      extractLeadDataSmart()
        .then(sendResponse)
        .catch(err => {
          console.error('[WA Lead] Listener error:', err);
          sendResponse({ error: 'ERROR', message: err.message });
        });
      return true; // Keep message port open for async response
    }

    sendResponse({ error: 'UNKNOWN_ACTION' });
    return true;
  });
})();
