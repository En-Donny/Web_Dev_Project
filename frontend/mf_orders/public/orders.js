const root = document.getElementById('products-root');
const addToCartBtn = document.getElementById('add-to-cart-btn');
const selectAllBtn = document.getElementById('select-all-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');

const CART_KEY = 'cart_items';
let latestProducts = []; // массив объектов { id, product_id, title, description, price, status }

async function fetchProducts() {
  const resp = await fetch('/api/product_all_get', { method: 'GET' });
  if (!resp.ok) throw new Error('Не удалось получить товары: ' + resp.status);
  return resp.json();
}

function discountedPrice(price, discountPercent){
  const d = Number(discountPercent) || 0;
  if (d <= 0) return Number(price || 0);
  return Math.round((Number(price || 0) * (1 - d/100)) * 100) / 100;
}

function parseBackendData(obj) {
  // вход: { "4": { product_id: "...", product_info: "{...}" or object, product_status: "..." }, ... }
  const arr = [];
  for (const pk in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, pk)) continue;
    const rec = obj[pk];
    let info = rec.product_info;
    try {
      if (typeof info === 'string') info = JSON.parse(info);
    } catch (e) {
      console.warn('Не удалось распарсить product_info для', pk, e);
      info = info || {};
    }
    const prod = {
      id: pk,
      product_id: rec.product_id,
      status: rec.product_status,
      info: info,
      title: info.title || info.name || `Товар #${pk}`,
      description: info.description || info.desc || '',
      price: parseFloat(info.price ?? info.cost ?? 0) || 0,
      discount: parseFloat(info.product_discount ?? info.discount ?? 0) || 0
    };
    arr.push(prod);
  }
  arr.sort((a,b)=> Number(a.id) - Number(b.id));
  return arr;
}

// cart helpers
function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}
function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function updateAddToCartButton() {
  const anyChecked = !!root.querySelector('input.product-select:checked');
  addToCartBtn.disabled = !anyChecked;
}

function renderProducts(products) {
  latestProducts = products;
  if (!products.length) {
    root.innerHTML = '<p>Товары отсутствуют</p>';
    addToCartBtn.disabled = true;
    return;
  }

  const list = document.createElement('div');
  list.className = 'products-list';

  products.forEach(p => {
    const item = document.createElement('div');
    item.className = 'products-item';
    const orig = p.price || 0;
    const disc = p.discount || 0;
    const newPrice = discountedPrice(orig, disc);
    let priceHtml = '';
    if (disc > 0) {
      priceHtml = `
        <div class="price-old"><s>${orig.toFixed(2)} ₽</s></div>
        <div class="price-discount">-${disc}% → <strong>${newPrice.toFixed(2)} ₽</strong></div>
      `;
    } else {
      priceHtml = `<div class="price">${orig.toFixed(2)} ₽</div>`;
    }
    item.innerHTML = `
      <label class="item-checkbox">
        <input type="checkbox" class="product-select" data-id="${escapeHtml(p.id)}" />
      </label>
      <div class="meta">
        <h3>${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.description)}</p>
        <small>ID: ${escapeHtml(p.product_id)} • статус: ${escapeHtml(p.status)}</small>
      </div>
      <div class="price-block">
        ${priceHtml}
      </div>
    `;
    list.appendChild(item);
  });

  root.innerHTML = '';
  root.appendChild(list);

  // attach checkbox handlers
  root.querySelectorAll('input.product-select').forEach(ch => {
    ch.addEventListener('change', () => {
      updateAddToCartButton();
    });
  });
  updateAddToCartButton();
}

addToCartBtn.addEventListener('click', () => {
  const checked = Array.from(root.querySelectorAll('input.product-select:checked'));
  if (!checked.length) return;
  const cart = loadCart();
  const existingMap = Object.fromEntries(cart.map(c => [String(c.id), c]));
  for (const ch of checked) {
    const id = ch.dataset.id;
    const prod = latestProducts.find(x => String(x.id) === String(id));
    if (!prod) continue;
    // если уже есть — обновим selected = true, не увеличиваем количество
    if (existingMap[id]) {
      existingMap[id].selected = true;
    } else {
      const item = {
        id: prod.id,
        product_id: prod.product_id,
        title: prod.title,
        price: prod.price,
        discount: prod.discount || 0,
        qty: 1,
        selected: true   // ВАЖНО: помечаем как выбранный по умолчанию
      };
      cart.push(item);
    }
  }
  saveCart(cart);
  addToCartBtn.textContent = 'Добавлено ✓';
  setTimeout(()=> addToCartBtn.textContent = 'Добавить товары в корзину', 1200);
  // снять выделение в списке
  root.querySelectorAll('input.product-select:checked').forEach(i=> i.checked = false);
  updateAddToCartButton();
});

selectAllBtn.addEventListener('click', () => {
  root.querySelectorAll('input.product-select').forEach(i => i.checked = true);
  updateAddToCartButton();
});
deselectAllBtn.addEventListener('click', () => {
  root.querySelectorAll('input.product-select').forEach(i => i.checked = false);
  updateAddToCartButton();
});

function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

(async function init(){
  try {
    root.innerHTML = '<p>Загрузка...</p>';
    const raw = await fetchProducts();
    const products = parseBackendData(raw);
    renderProducts(products);
  } catch (err) {
    root.innerHTML = `<p class="error">Ошибка при загрузке товаров: ${escapeHtml(err.message || err)}</p>`;
    console.error(err);
  }
})();
