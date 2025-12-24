import { logCartEvent } from '/shared/cart_log.js';

const CART_KEY = 'cart_items';

function loadCart(){ try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } }
function saveCart(items){ localStorage.setItem(CART_KEY, JSON.stringify(items)); }

function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatPrice(n){ return (Number(n) || 0).toFixed(2) + ' ₽'; }

function discountedPrice(price, discountPercent){
  const d = Number(discountPercent) || 0;
  if (d <= 0) return Number(price || 0);
  return Math.round((Number(price || 0) * (1 - d/100)) * 100) / 100;
}

function getNodes() {
  return {
    root: document.getElementById('cart-root'),
    summary: document.getElementById('cart-summary'),
    placeBtn: document.getElementById('place-order-btn')
  };
}

function renderCart(){
  const { root } = getNodes();
  if(!root) return;

  const items = loadCart();
  if(!items.length){
    root.innerHTML = '<p>Корзина пуста.</p>';
    const { summary } = getNodes();
    if(summary) summary.innerHTML = '';
    return;
  }

  const list = document.createElement('div');
  list.className = 'cart-list';

  items.forEach(it => {
    const orig = Number(it.price || 0);
    const disc = Number(it.discount || 0);
    const qty = Number(it.qty || 1);
    const origTotal = orig * qty;
    const unitDisc = discountedPrice(orig, disc);
    const discTotal = unitDisc * qty;

    const el = document.createElement('div');
    el.className = 'cart-item';
    el.dataset.id = String(it.id);

    el.innerHTML = `
      <label class="item-checkbox">
        <input type="checkbox" class="product-select" data-id="${escapeHtml(it.id)}" ${it.selected ? 'checked' : ''}>
      </label>

      <div class="cart-meta">
        <h3>${escapeHtml(it.title)}</h3>
        <small>ID: ${escapeHtml(it.product_id || '')}</small>
      </div>

      <div class="cart-controls">
        <div class="qty-controls" data-id="${escapeHtml(it.id)}" role="group" aria-label="Количество товара ${escapeHtml(it.title)}">
          <button class="qty-btn dec" data-action="dec" aria-label="Уменьшить количество">−</button>
          <span class="qty-value" aria-live="polite">${qty}</span>
          <button class="qty-btn inc" data-action="inc" aria-label="Увеличить количество">+</button>
        </div>

        <div class="cart-price">
          <div class="price-old"><s class="price-old-val">${formatPrice(origTotal)}</s></div>
          <div class="price-discount">-${disc}% → <span class="price-discount-val">${formatPrice(discTotal)}</span></div>
        </div>

        <button data-id="${escapeHtml(it.id)}" class="remove-btn" aria-label="Удалить">×</button>
      </div>
    `;
    list.appendChild(el);
  });

  root.innerHTML = '';
  root.appendChild(list);

  // handlers
  attachCartHandlers();
  updateSummary();
  updatePlaceButtonState();
}

function attachCartHandlers(){
  const { root } = getNodes();
  if(!root) return;

  // checkbox toggles (select/deselect product)
  root.querySelectorAll('input.product-select').forEach(ch => {
    ch.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      let items = loadCart();
      const idx = items.findIndex(x => String(x.id) === String(id));
      if(idx >= 0){
        items[idx].selected = !!e.target.checked;
        saveCart(items);
        updateSummary();
        updatePlaceButtonState();
      }
    });
  });

  // qty widgets
  root.querySelectorAll('.qty-controls').forEach(ctrl => {
    const id = ctrl.dataset.id;
    const btnInc = ctrl.querySelector('button[data-action="inc"]');
    const btnDec = ctrl.querySelector('button[data-action="dec"]');
    const valueNode = ctrl.querySelector('.qty-value');

    btnInc.addEventListener('click', () => changeQty(id, 1, valueNode, ctrl));
    btnDec.addEventListener('click', () => changeQty(id, -1, valueNode, ctrl));

    // поддержка клавиатуры: стрелки / +/- (опционально)
    ctrl.addEventListener('keydown', (e) => {
      if(e.key === 'ArrowUp' || e.key === '+') { e.preventDefault(); changeQty(id, 1, valueNode, ctrl); }
      if(e.key === 'ArrowDown' || e.key === '-') { e.preventDefault(); changeQty(id, -1, valueNode, ctrl); }
    });

    // делаем контрол фокусируемым
    ctrl.tabIndex = 0;
  });
  // remove buttons
  root.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prev = loadCart();
      const id = btn.dataset.id;
      let items = loadCart();
      items = items.filter(x => String(x.id) !== String(id));
      saveCart(items);
      logCartEvent('remove', prev, loadCart(), {page:'cart'});
      renderCart();
    });
  });
}

function changeQty(id, delta, valueNode, ctrlNode){
  const prev = loadCart();
  const items = loadCart();
  const idx = items.findIndex(x => String(x.id) === String(id));
  if(idx < 0) return;
  let newQty = (Number(items[idx].qty) || 1) + delta;
  if(newQty < 1) newQty = 1;
  items[idx].qty = newQty;
  saveCart(items);
  const curr = loadCart();
  logCartEvent('change_qty', prev, curr, {page:'cart'});

  // Обновляем UI: количество и цены в строке (сохранён формат: старая/скидочная)
  if(valueNode) valueNode.textContent = String(newQty);

  // Найдём родительский .cart-item для этого контроля
  const cartItemEl = ctrlNode.closest('.cart-item');
  if(cartItemEl){
    const priceOldNode = cartItemEl.querySelector('.price-old-val');
    const priceDiscNode = cartItemEl.querySelector('.price-discount-val');

    const unitOrig = Number(items[idx].price || 0);
    const unitDisc = discountedPrice(unitOrig, items[idx].discount || 0);

    const newOrigTotal = unitOrig * newQty;
    const newDiscTotal = unitDisc * newQty;

    if(priceOldNode) priceOldNode.textContent = formatPrice(newOrigTotal);
    if(priceDiscNode) priceDiscNode.textContent = formatPrice(newDiscTotal);
  }

  updateSummary();
}

function updateSummary(){
  const { summary } = getNodes();
  const items = loadCart();
  const total = items.reduce((s, it) => {
    if (!it.selected) return s;
    const unit = discountedPrice(it.price, it.discount || 0);
    return s + (unit * Number(it.qty || 0));
  }, 0);
  if(summary) summary.innerHTML = `<div class="summary-row"><strong>Итого: ${formatPrice(total)}</strong></div>`;
}

function updatePlaceButtonState(){
  const { placeBtn } = getNodes();
  const items = loadCart();
  // enable if at least one item exists (even if unchecked? usually needs 1 checked)
  const anyChecked = items.some(i => i.selected);
  if(placeBtn) placeBtn.disabled = !anyChecked;
}

// Build payload and POST to /api/statistics_update
async function placeOrder() {
  const items = loadCart();
  if(!items.length) return;
  const payload = {};
  // user specified: rejected_delta = 1 if added to cart but not checked at ordering; success_delta = qty if checked
  items.forEach(it => {
    const key = String(it.id);
    if(it.selected) {
      payload[key] = { rejected_delta: 0, success_delta: Number(it.qty || 0) };
    } else {
      payload[key] = { rejected_delta: 1, success_delta: 0 };
    }
  });

  try {
    const res = await fetch('/api/statistics_update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text().catch(()=>null);
      throw new Error(`HTTP ${res.status} ${text || ''}`);
    }
    // Успех — показать сообщение и (опционально) очищать те товары, которые были отмечены/или всё)
    alert('Заказ отправлен успешно ✅');
    // при желании: можно удалить из корзины отмеченные товары:
    // let remaining = items.filter(i => !i.selected); saveCart(remaining); renderCart();
  } catch (err) {
    console.error('placeOrder error', err);
    alert('Ошибка при отправке заказа: ' + (err.message || err));
  }
}

// init
function runWhenReady(fn) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    try { fn(); } catch(e) { console.error(e); }
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      try { fn(); } catch(e) { console.error(e); }
    });
  }
}

runWhenReady(() => {
  const attemptRender = (triesLeft = 5) => {
    const { root, placeBtn } = getNodes();
    if (root) {
      renderCart();
      if(placeBtn) {
        placeBtn.addEventListener('click', () => {
          placeBtn.disabled = true;
          placeOrder().finally(()=> {
            // обновим состояние и кнопку
            updatePlaceButtonState();
            placeBtn.disabled = false;
          });
        });
      }
      return;
    }
    if (triesLeft <= 0) {
      console.warn('cart: root not found after retries');
      return;
    }
    setTimeout(() => attemptRender(triesLeft - 1), 50);
  };
  attemptRender(5);
});
