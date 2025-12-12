const root = document.getElementById('orders-root');
const addToCartBtn = document.getElementById('add-to-cart-btn');
const selectAllBtn = document.getElementById('select-all-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');

const CART_KEY = 'cart_items';
const STORE_KEY = 'orders_cart_state'; // ранее для qty локально (если нужно)
let latestOrders = []; // массив объектов { id, order_id, title, description, price, status }

async function fetchOrders() {
  const resp = await fetch('/api/order_all_get', { method: 'GET' });
  if (!resp.ok) throw new Error('Не удалось получить заказы: ' + resp.status);
  return resp.json();
}

function parseBackendData(obj) {
  const arr = [];
  for (const pk in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, pk)) continue;
    const rec = obj[pk];
    let info = rec.order_info;
    try {
      if (typeof info === 'string') info = JSON.parse(info);
    } catch (e) {
      console.warn('Не удалось распарсить order_info для', pk, e);
      info = info || {};
    }
    const order = {
      id: pk,
      order_id: rec.order_id,
      status: rec.order_status,
      info: info,
      title: info.title || info.name || (`Товар #${pk}`),
      description: info.description || info.desc || '',
      price: parseFloat(info.price ?? info.cost ?? 0) || 0
    };
    arr.push(order);
  }
  arr.sort((a,b)=> Number(a.id)-Number(b.id));
  return arr;
}

// cart helpers
function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}
function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

// UI helpers
function updateAddToCartButton() {
  const anyChecked = !!root.querySelector('input.order-select:checked');
  addToCartBtn.disabled = !anyChecked;
}

function renderOrders(orders) {
  latestOrders = orders;
  if (!orders.length) {
    root.innerHTML = '<p>Товары отсутствуют</p>';
    addToCartBtn.disabled = true;
    return;
  }

  const list = document.createElement('div');
  list.className = 'orders-list';

  orders.forEach(o => {
    const item = document.createElement('div');
    item.className = 'order-item';
    item.innerHTML = `
      <label class="item-checkbox">
        <input type="checkbox" class="order-select" data-id="${escapeHtml(o.id)}" />
      </label>
      <div class="meta">
        <h3>${escapeHtml(o.title)}</h3>
        <p>${escapeHtml(o.description)}</p>
        <small>ID: ${escapeHtml(o.order_id)} • статус: ${escapeHtml(o.status)}</small>
      </div>
      <div class="price-block">
        <div class="price">${(o.price || 0).toFixed(2)} ₽</div>
      </div>
    `;
    list.appendChild(item);
  });

  root.innerHTML = '';
  root.appendChild(list);

  // attach checkbox handlers
  root.querySelectorAll('input.order-select').forEach(ch => {
    ch.addEventListener('change', () => {
      updateAddToCartButton();
    });
  });

  updateAddToCartButton();
}

// event handlers
addToCartBtn.addEventListener('click', () => {
  const checked = Array.from(root.querySelectorAll('input.order-select:checked'));
  if (!checked.length) return;
  const cart = loadCart();
  const existingMap = Object.fromEntries(cart.map(c => [String(c.id), c]));
  for (const ch of checked) {
    const id = ch.dataset.id;
    const order = latestOrders.find(x => String(x.id) === String(id));
    if (!order) continue;
    // если уже есть в корзине — увеличивать не будем (требование: добавить в количестве 1)
    if (existingMap[id]) continue;
    const item = {
      id: order.id,
      order_id: order.order_id,
      title: order.title,
      price: order.price,
      qty: 1
    };
    cart.push(item);
  }
  saveCart(cart);
  // даём пользователю фидбек и, при желании, можно перейти на cart автоматически
  addToCartBtn.textContent = 'Добавлено ✓';
  setTimeout(()=> addToCartBtn.textContent = 'Добавить товары в корзину', 1200);
  // возможно стоит выключить выбранные чекбоксы
  root.querySelectorAll('input.order-select:checked').forEach(i => i.checked = false);
  updateAddToCartButton();
  // уведомить shell (или можно просто оставить)
  // window.dispatchEvent(new CustomEvent('cart:updated'));
});

selectAllBtn.addEventListener('click', () => {
  root.querySelectorAll('input.order-select').forEach(i => i.checked = true);
  updateAddToCartButton();
});
deselectAllBtn.addEventListener('click', () => {
  root.querySelectorAll('input.order-select').forEach(i => i.checked = false);
  updateAddToCartButton();
});

function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

(async function init(){
  try {
    root.innerHTML = '<p>Загрузка...</p>';
    const raw = await fetchOrders();
    const orders = parseBackendData(raw);
    renderOrders(orders);
  } catch (err) {
    root.innerHTML = `<p class="error">Ошибка при загрузке товаров: ${escapeHtml(err.message || err)}</p>`;
    console.error(err);
  }
})();
