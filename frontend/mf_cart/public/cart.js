const CART_KEY = 'cart_items';

function loadCart(){ try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } }
function saveCart(items){ localStorage.setItem(CART_KEY, JSON.stringify(items)); }

function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatPrice(n){ return (Number(n) || 0).toFixed(2) + ' ₽'; }

function getNodes() {
  return {
    root: document.getElementById('cart-root'),
    summary: document.getElementById('cart-summary')
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
    const el = document.createElement('div');
    el.className = 'cart-item';
    // Вставляем кнопки "-" и "+" и span с количеством между ними
    el.innerHTML = `
      <div class="cart-meta">
        <h3>${escapeHtml(it.title)}</h3>
        <small>ID: ${escapeHtml(it.order_id)}</small>
      </div>

      <div class="cart-controls">
        <div class="qty-controls" data-id="${escapeHtml(it.id)}" role="group" aria-label="Количество товара ${escapeHtml(it.title)}">
          <button class="qty-btn dec" data-action="dec" aria-label="Уменьшить количество">−</button>
          <span class="qty-value" aria-live="polite">${Number(it.qty)}</span>
          <button class="qty-btn inc" data-action="inc" aria-label="Увеличить количество">+</button>
        </div>

        <div class="cart-price">${formatPrice(it.price * it.qty)}</div>
        <button data-id="${escapeHtml(it.id)}" class="remove-btn" aria-label="Удалить">×</button>
      </div>
    `;
    list.appendChild(el);
  });

  root.innerHTML = '';
  root.appendChild(list);

  // Навешиваем обработчики (делегирование или по кнопкам)
  attachCartHandlers();
  updateSummary();
}

function attachCartHandlers(){
  const { root } = getNodes();
  if(!root) return;

  // обработка + / - кнопок (делегируем клики на контейнер)
  root.querySelectorAll('.qty-controls').forEach(ctrl => {
    const id = ctrl.dataset.id;
    const btnInc = ctrl.querySelector('button[data-action="inc"]');
    const btnDec = ctrl.querySelector('button[data-action="dec"]');
    const valueNode = ctrl.querySelector('.qty-value');

    btnInc.addEventListener('click', () => {
      changeQty(id, 1, valueNode, ctrl);
    });
    btnDec.addEventListener('click', () => {
      changeQty(id, -1, valueNode, ctrl);
    });

    // поддержка клавиатуры: стрелки / +/- (опционально)
    ctrl.addEventListener('keydown', (e) => {
      if(e.key === 'ArrowUp' || e.key === '+') { e.preventDefault(); changeQty(id, 1, valueNode, ctrl); }
      if(e.key === 'ArrowDown' || e.key === '-') { e.preventDefault(); changeQty(id, -1, valueNode, ctrl); }
    });

    // делаем контрол фокусируемым
    ctrl.tabIndex = 0;
  });

  // удаление товара
  root.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      let items = loadCart();
      items = items.filter(x => String(x.id) !== String(id));
      saveCart(items);
      renderCart();
    });
  });
}

function changeQty(id, delta, valueNode, ctrlNode){
  const items = loadCart();
  const idx = items.findIndex(x => String(x.id) === String(id));
  if(idx < 0) return;
  let newQty = (Number(items[idx].qty) || 1) + delta;
  if(newQty < 1) newQty = 1;
  items[idx].qty = newQty;
  saveCart(items);

  // обновим UI: количество и цену в строке
  if(valueNode) valueNode.textContent = String(newQty);
  // обновим цену рядом с контролом
  const priceNode = ctrlNode.closest('.cart-controls').querySelector('.cart-price');
  if(priceNode) priceNode.textContent = formatPrice(items[idx].price * items[idx].qty);

  updateSummary();
}

function updateSummary(){
  const { summary } = getNodes();
  const items = loadCart();
  const total = items.reduce((s, it) => s + (Number(it.price || 0) * Number(it.qty || 0)), 0);
  if(summary) summary.innerHTML = `<div class="summary-row"><strong>Итого: ${formatPrice(total)}</strong></div>`;
}

// Инициализация: запускаем при готовности документа.
// Сохраняем поведение, как у предыдущей версии (защита от гонки).
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
    const { root } = getNodes();
    if (root) { renderCart(); return; }
    if (triesLeft <= 0) { console.warn('cart: root not found after retries'); return; }
    setTimeout(() => attemptRender(triesLeft - 1), 50);
  };
  attemptRender(5);
});
