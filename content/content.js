
function extractLeadData() {
  try {
    if (!document.body) {
      return { error: 'NO_CHAT', message: 'Page not ready' };
    }

    // The main chat panel — scope all queries here to avoid picking up sidebar contacts
    const mainPanel = document.querySelector('#main') ||
                      document.querySelector('[data-testid="conversation"]') ||
                      document.querySelector('div[role="main"]');

    if (!mainPanel) {
      return { error: 'NO_CHAT', message: 'Open a WhatsApp conversation first' };
    }

    // Name: from chat header title attribute (always the contact/group name)
    let name = null;

    // Primary: header span[title] inside #main — most reliable
    const headerTitleSpans = mainPanel.querySelectorAll('header span[title]');
    for (let span of headerTitleSpans) {
      const title = span.getAttribute('title');
      if (title && title.length > 0 && title.length < 100) {
        name = title;
        break;
      }
    }

    // Fallback: any span[title] in header that isn't a generic label
    if (!name) {
      const header = mainPanel.querySelector('header');
      if (header) {
        const spans = header.querySelectorAll('span');
        for (let span of spans) {
          const text = span.textContent?.trim();
          if (text && text.length > 0 && text.length < 100 &&
              text !== 'Contact info' && !/^\d{2}:\d{2}$/.test(text)) {
            name = text;
            break;
          }
        }
      }
    }

    // Phone: check contact info panel first (right panel when open), then header
    let phone = null;

    // Right panel: contact info drawer
    const contactPanel = document.querySelector('[data-testid="contact-info"]') ||
                         document.querySelector('[data-testid="drawer-right"]') ||
                         document.querySelector('div[style*="right"] [data-testid="contact-info-subtitle"]')?.closest('section') ||
                         document.querySelector('section[tabindex="-1"]');

    const phoneSearchAreas = [];
    if (contactPanel) phoneSearchAreas.push(contactPanel);
    const header = mainPanel.querySelector('header');
    if (header) phoneSearchAreas.push(header);

    for (const area of phoneSearchAreas) {
      const spans = area.querySelectorAll('span');
      for (let span of spans) {
        const text = span.textContent?.trim() || '';
        // Match phone: starts with + or digit, contains mostly digits/spaces/dashes
        if (/^\+?[\d][\d\s\-()]{8,}$/.test(text) && text.length < 25) {
          phone = text;
          break;
        }
      }
      if (phone) break;
    }

    // Fallback: search entire document for phone in contact info elements
    if (!phone) {
      const allPhoneEl = document.querySelectorAll('[data-testid="contact-info-subtitle"], [aria-label*="phone"], [aria-label*="Phone"]');
      for (let el of allPhoneEl) {
        const text = el.textContent?.trim() || '';
        if (text.length > 5) { phone = text; break; }
      }
    }

    // Message: get text node only, exclude the timestamp element
    let message = null;
    let messageTime = null;
    const msgContainers = mainPanel.querySelectorAll('[data-testid="msg-container"]');

    if (msgContainers.length > 0) {
      const lastMsg = msgContainers[msgContainers.length - 1];

      // Timestamp is in [data-testid="msg-meta"] — get it separately
      const metaEl = lastMsg.querySelector('[data-testid="msg-meta"]');
      if (metaEl) {
        // Time is usually the first text in meta
        const timeMatch = metaEl.textContent?.match(/\d{1,2}:\d{2}/);
        if (timeMatch) messageTime = timeMatch[0];
      }

      // Message text is in selectable-text span, NOT the whole container
      const textEl = lastMsg.querySelector('[data-testid="msg-text"]') ||
                     lastMsg.querySelector('span.selectable-text') ||
                     lastMsg.querySelector('.copyable-text span');

      if (textEl) {
        message = textEl.textContent?.trim().substring(0, 100) || null;
      } else {
        // Fallback: strip timestamps from full text
        let raw = lastMsg.textContent?.trim() || '';
        raw = raw.replace(/\d{1,2}:\d{2}(\s*[AP]M)?/g, '').trim();
        message = raw.substring(0, 100) || null;
      }
    }

    if (!name && !message) {
      return { error: 'NO_CHAT', message: 'Open a WhatsApp conversation first' };
    }

    const now = new Date();
    return {
      name: name || 'Unknown',
      phone: phone,
      email: null,
      company: null,
      message: message || 'No message',
      messageTime: messageTime || now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      messageDate: now.toISOString().split('T')[0],
      timestamp: now.toISOString(),
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
      const data = extractLeadData();
      sendResponse(data);
    } else {
      sendResponse({ error: 'UNKNOWN_ACTION' });
    }
  } catch (err) {
    console.error('[WA Lead] Listener error:', err);
    sendResponse({ error: 'ERROR', message: err.message });
  }
  return true;
});
