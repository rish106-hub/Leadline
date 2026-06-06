(() => {
  const CONTENT_SCRIPT_VERSION = '1.1.0';
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

  function extractLeadData() {
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
      const phone = extractPhone(mainPanel, header);
      const messageData = extractMessage(mainPanel);

      if (!name && !phone && !messageData.message) {
        return { error: 'EXTRACT_ERROR', message: 'WhatsApp chat data was not found' };
      }

      return {
        name: name || 'Unknown',
        phone,
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
    try {
      if (request.action === 'extractLead') {
        sendResponse(extractLeadData());
      } else {
        sendResponse({ error: 'UNKNOWN_ACTION' });
      }
    } catch (err) {
      console.error('[WA Lead] Listener error:', err);
      sendResponse({ error: 'ERROR', message: err.message });
    }
    return true;
  });
})();
