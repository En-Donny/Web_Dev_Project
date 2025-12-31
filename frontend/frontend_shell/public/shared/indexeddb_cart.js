// Простая uuid v4 (не крипто-важная)
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getOrCreateTabId() {
  let tabId = sessionStorage.getItem('tabId');
  if (!tabId) {
    tabId = uuidv4();
    sessionStorage.setItem('tabId', tabId);
    // Опционально: если есть cart в localStorage, мигрируем его в IndexedDB:
    const existing = localStorage.getItem('cart_items');
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        // сохраняем в DB под новым tabId, но не удаляем localStorage автоматически
        setCartToDB(tabId, parsed).catch(e => console.warn('migrate->DB failed', e));
      } catch (e) { /* ignore */ }
    }
  }
  return tabId;
}

const TAB_ID = getOrCreateTabId();

// Открыть DB (промисы)
function openCartDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('app_cart_db', 1);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains('carts')) {
        // keyPath: tabId, value: { tabId, cart, modified }
        db.createObjectStore('carts', { keyPath: 'tabId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Получить запись cart по tabId
async function getCartFromDB(tabId) {
  const db = await openCartDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('carts', 'readonly');
    const store = tx.objectStore('carts');
    const r = store.get(tabId);
    r.onsuccess = () => resolve(r.result ? r.result.cart : null);
    r.onerror = () => reject(r.error);
  });
}

// Сохранить cart по tabId (перезапись)
async function setCartToDB(tabId, cart) {
  const db = await openCartDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('carts', 'readwrite');
    const store = tx.objectStore('carts');
    const obj = { tabId, cart, modified: new Date().toISOString() };
    const req = store.put(obj);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// Удалить cart по tabId
async function deleteCartFromDB(tabId) {
  const db = await openCartDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('carts', 'readwrite');
    const store = tx.objectStore('carts');
    const req = store.delete(tabId);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// Список tabId-ов (полезно для админа/очистки)
async function listCartKeys() {
  const db = await openCartDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('carts', 'readonly');
    const store = tx.objectStore('carts');
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Асинхронная загрузка корзины (используется при инициализации)
async function loadCartFromStorage() {
  // попытаемся из IndexedDB по TAB_ID
  try {
    const cart = await getCartFromDB(TAB_ID);
    if (cart) return cart;
  } catch (e) {
    console.warn('IndexedDB read failed, falling back to localStorage', e);
  }
  // fallback (чтобы поддержать старые записи)
  try {
    const raw = localStorage.getItem('cart_items');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return []; // default empty cart
}

// Обёртки, которые используем в коде (синхронный API для UI — но хранение асинхронно)
function loadCartSyncForUI(initialEmpty = []) {
  // В UI мы хотим синхронно получить (но DB read async) — тогда при загрузке страницы
  // вызови await loadCartFromStorage() и затем render.
  return initialEmpty;
}

// Запись — дебаунсим чтобы не делать слишком много операций на диске
const saveCartDebounced = (function () {
  let t = null;
  const WAIT = 200; // ms
  return function(cart) {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      setCartToDB(TAB_ID, cart).catch(e => console.warn('setCartToDB failed', e));
      // также можем держать локальный localStorage для совместимости (опционально)
      try { localStorage.setItem('cart_items', JSON.stringify(cart)); } catch (e) {}
      t = null;
    }, WAIT);
  };
})();


export { loadCartFromStorage, loadCartSyncForUI, saveCartDebounced };
