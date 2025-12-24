// Настройки
const CART_LOG_ENDPOINT = '/api/cart_log';
const DEBOUNCE_MS = 500;

// Простая debounce-реализация
function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      try { fn(...args); } catch(e) { console.error('debounced fn error', e); }
      t = null;
    }, wait);
  };
}

// Низкоуровневая отправка (без debounce)
async function _doSendCartLog(payload) {
  try {
    await fetch(CART_LOG_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
      // credentials: 'include' // раскомментируй если нужна аутентификация по куки
    });
  } catch (e) {
    // Не ломаем UX — только логируем ошибку в консоль
    console.warn('cart log send failed', e);
  }
}

// Debounced wrapper
const sendCartLog = debounce((payload) => _doSendCartLog(payload), DEBOUNCE_MS);

// Helper для формирования и отправки события
function logCartEvent(eventType, prevCart, currCart, extraMeta = {}) {
  const payload = {
    event: eventType,
    prev: prevCart || [],
    curr: currCart || [],
    meta: Object.assign({page: (extraMeta.page || 'unknown'), userAgent: navigator.userAgent}, extraMeta),
    client_ts: (new Date()).toISOString()
  };
  // Отправляем debounced
  sendCartLog(payload);
}

// Экспорт для ES modules
export { sendCartLog, logCartEvent, _doSendCartLog };

// Также делаем доступным на window (для inline-скриптов и старых модулей)
if (typeof window !== 'undefined') {
  window.__cartLog__ = window.__cartLog__ || {};
  window.__cartLog__.sendCartLog = sendCartLog;
  window.__cartLog__.logCartEvent = logCartEvent;
  window.logCartEvent = logCartEvent; // удобный прямой доступ
}
