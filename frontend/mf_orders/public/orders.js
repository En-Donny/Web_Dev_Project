// frontend/mf-orders/public/orders.js
const root = document.getElementById('orders-root');
const STORE_KEY = 'orders_cart_state';

async function fetchOrders() {
  try {
    const resp = await fetch('/api/order_all_get', { method: 'GET' });
    if (!resp.ok) {
      const txt = await resp.text().catch(()=>null);
      throw new Error(`HTTP ${resp.status} ${txt || ''}`);
    }
    const data = await resp.json();
    return data;
  } catch (err) {
    console.error('fetchOrders error:', err);
    throw err;
  }
}

function parseBackendData(dataObj) {
  // dataObj — объект вида { "4": { order_id: "...", order_info: "{}", order_status: "..." }, ... }
  const arr = [];
  for (const pk in dataObj) {
    if (!Object.prototype.hasOwnProperty.call(dataObj, pk)) continue;
    const rec = dataObj[pk];
    let info = rec.order_info;
    try {
      // order_info может быть JSON-строкой -> распарсим
      if (typeof info === 'string') {
        info = JSON.parse(info);
      }
    } catch (e) {
      // если парсинг упал — оставим как строку
      console.warn('Не удалось распарсить order_info для id', pk, e);
    }

    // Формируем единый объект заказа
    const order = {
      id: pk,
      order_id: rec.order_id,
      status: rec.order_status,
      info: info || {},
    };

    // Если внутри info есть title/description/price, удобно их вынести:
    order.title = order.info.title || order.info.name || (`Заказ #${rec.order_id || pk}`);
    order.description = order.info.description || order.info.desc || '';
    order.price = parseFloat(order.info.price ?? order.info.cost ?? 0) || 0;

    arr.push(order);
  }
  // можно отсортировать по id
  arr.sort((a,b) => Number(a.id) - Number(b.id));
  return arr;
}

function loadState(){
  try{ return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveState(state){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function render(orders) {
  const state = loadState();

  if (!orders.length) {
    root.innerHTML = '<p>Заказов нет</p>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'orders-list';
  let total = 0;

  orders.forEach(o => {
    const qty = state[o.id]?.qty ?? 1;
    const price = o.price ?? 0;
    total += qty * price;

    const item = document.createElement('div');
    item.className = 'order-item';
    item.innerHTML = `
      <div class="meta">
        <h3>${escapeHtml(o.title)}</h3>
        <p>${escapeHtml(o.description)}</p>
        <small>ID: ${escapeHtml(o.order_id)} • статус: ${escapeHtml(o.status)}</small>
      </div>
      <div class="controls">
        <label>Кол-во: <input type="number" min="1" data-id="${o.id}" class="qty" value="${qty}"></label>
        <div class="price">${(price * qty).toFixed(2)} ₽</div>
      </div>
    `;
    list.appendChild(item);
  });

  const footer = document.createElement('div');
  footer.className = 'orders-footer';
  footer.innerHTML = `<strong>Итого: ${total.toFixed(2)} ₽</strong>`;

  root.innerHTML = '';
  root.appendChild(list);
  root.appendChild(footer);

  // attach handlers
  root.querySelectorAll('.qty').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const id = e.target.dataset.id;
      const val = Math.max(1, parseInt(e.target.value || 1));
      const st = loadState();
      st[id] = { qty: val };
      saveState(st);

      // update price in place
      const order = orders.find(x => String(x.id) === String(id));
      e.target.closest('.order-item').querySelector('.price').textContent = (order.price * val).toFixed(2) + ' ₽';

      // recompute total
      const sum = orders.reduce((s, o) => s + ((loadState()[o.id]?.qty ?? 1) * (o.price || 0)), 0);
      footer.innerHTML = `<strong>Итого: ${sum.toFixed(2)} ₽</strong>`;
    });
  });
}

(async function init(){
  try{
    root.innerHTML = '<p>Загрузка...</p>';
    const raw = await fetchOrders();
    const orders = parseBackendData(raw);
    render(orders);
  }catch(err){
    root.innerHTML = `<p class="error">Ошибка при загрузке заказов: ${escapeHtml(err.message || err)}</p>`;
    console.error(err);
  }
})();
