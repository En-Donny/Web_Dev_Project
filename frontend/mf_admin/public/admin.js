// admin.js (module)
const form = document.getElementById('order-form');
const msgEl = document.getElementById('msg');
const loadBtn = document.getElementById('load-btn');
const resetBtn = document.getElementById('reset-btn');
const submitBtn = document.getElementById('submit-btn');

const orderIdInput = document.getElementById('order_id');
const titleInput = document.getElementById('order_title');
const descInput = document.getElementById('order_description');
const costInput = document.getElementById('order_cost');

function showMessage(text, ok = true) {
  msgEl.textContent = text;
  msgEl.style.color = ok ? 'green' : 'crimson';
}

// Простой escape для сообщений (безопасный вывод)
function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Helper: fetch wrapper
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const body = await res.text().catch(()=>null);
    const errText = body ? `: ${body}` : '';
    throw new Error(`HTTP ${res.status}${errText}`);
  }
  // try parse json if exists
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return null;
}

// Load order info by order_id (ищем в массиве всех заказов)
async function loadOrderByOrderId(order_id) {
  if (!order_id) throw new Error('order_id пустой');
  // Получаем все заказы и ищем по order_id
  const all = await apiFetch('/api/order_all_get', { method: 'GET' });
  // all представляет объект { "pk": {...}, ... }
  for (const pk in all) {
    if (!Object.prototype.hasOwnProperty.call(all, pk)) continue;
    const rec = all[pk];
    if (rec.order_id === order_id) {
      // parse rec.order_info если это строка
      let info = rec.order_info;
      try {
        if (typeof info === 'string') info = JSON.parse(info);
      } catch (e) {
        console.warn('order_info parsing failed for', order_id, e);
      }
      return {
        pk,
        order_id: rec.order_id,
        order_status: rec.order_status,
        info: info || {}
      };
    }
  }
  return null;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  // HTML5 validation
  if (!form.reportValidity()) return;

  const order_id = orderIdInput.value.trim() || null;
  const title = titleInput.value.trim();
  const description = descInput.value.trim();
  const price = parseFloat(costInput.value);
  const infoObj = {
    title,
    description,
    price: isNaN(price) ? 0 : price
  };

  try {
    submitBtn.disabled = true;
    if (order_id) {
      // UPDATE: body must be { order_id: "...", order_info: { ... } }
      const body = { order_id, order_info: infoObj };
      await apiFetch('/api/order_update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      showMessage(`Заказ ${escapeHtml(order_id)} обновлён ✅`);
    } else {
      // CREATE: backend ожидает словарь с информацией о заказе (мы отправляем order_info прямо)
      const body = infoObj;
      await apiFetch('/api/order_create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      showMessage('Заказ создан ✅');
      form.reset();
    }
  } catch (err) {
    console.error(err);
    showMessage('Ошибка: ' + escapeHtml(err.message || err), false);
  } finally {
    submitBtn.disabled = false;
  }
});

// Load button: заполняет форму по order_id
loadBtn.addEventListener('click', async () => {
  const order_id = orderIdInput.value.trim();
  if (!order_id) { showMessage('Введите order_id в поле выше', false); return; }
  try {
    showMessage('Загрузка заказа...');
    const rec = await loadOrderByOrderId(order_id);
    if (!rec) { showMessage('Заказ не найден', false); return; }
    const info = rec.info || {};
    titleInput.value = info.title || '';
    descInput.value = info.description || '';
    costInput.value = (info.price !== undefined) ? String(info.price) : '';
    showMessage(`Заказ ${escapeHtml(order_id)} загружен`);
  } catch (err) {
    console.error(err);
    showMessage('Ошибка при загрузке: ' + escapeHtml(err.message || err), false);
  }
});

// Reset button: очищает форму
resetBtn.addEventListener('click', () => {
  form.reset();
  showMessage('');
});
