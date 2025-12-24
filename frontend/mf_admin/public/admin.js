// admin.js (module)
// ========== форма создания/обновления продукта ==========
const form = document.getElementById('product-form');
const msgEl = document.getElementById('msg');
const loadBtn = document.getElementById('load-btn');
const resetBtn = document.getElementById('reset-btn');
const submitBtn = document.getElementById('submit-btn');

const productIdInput = document.getElementById('product_id');
const titleInput = document.getElementById('product_title');
const descInput = document.getElementById('product_description');
const costInput = document.getElementById('product_cost');

function showMessage(text, ok = true) {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.style.color = ok ? 'green' : 'crimson';
}

// Простой escape для сообщений (безопасный вывод)
function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const body = await res.text().catch(()=>null);
    const errText = body ? `: ${body}` : '';
    throw new Error(`HTTP ${res.status}${errText}`);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return null;
}

// Load product info by product_id (ищем в массиве всех продуктов)
async function loadProductByProductId(product_id) {
  if (!product_id) throw new Error('product_id пустой');
  // Получаем все продукты и ищем по product_id
  const all = await apiFetch('/api/product_all_get', { method: 'GET' });
  // all представляет объект { "pk": {...}, ... }
  for (const pk in all) {
    if (!Object.prototype.hasOwnProperty.call(all, pk)) continue;
    const rec = all[pk];
    if (rec.product_id === product_id) {
      // parse rec.product_info если это строка
      let info = rec.product_info;
      try {
        if (typeof info === 'string') info = JSON.parse(info);
      } catch (e) {
        console.warn('product_info parsing failed for', product_id, e);
      }
      return {
        pk,
        product_id: rec.product_id,
        product_status: rec.product_status,
        info: info || {}
      };
    }
  }
  return null;
}

// Обработка формы submit (create / update)
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // HTML5 validation
    if (!form.reportValidity()) return;

    const product_id = productIdInput.value.trim() || null;
    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    const price = parseFloat(costInput.value);
    const discount = parseFloat(document.getElementById('product_discount').value);
    const infoObj = {
      title,
      description,
      price: isNaN(price) ? 0 : price,
      product_discount: isNaN(discount) ? 0 : discount  // процент
    };

    try {
      submitBtn.disabled = true;
      if (product_id) {
        // UPDATE: body must be { product_id: "...", product_info: { ... } }
        const body = { product_id, product_info: infoObj };
        await apiFetch('/api/product_update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        showMessage(`Товар ${escapeHtml(product_id)} обновлён ✅`);
      } else {
        // CREATE: backend ожидает словарь с информацией о продукте (мы отправляем product_info прямо)
        const body = infoObj;
        await apiFetch('/api/product_create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        showMessage('Товар создан ✅');
        form.reset();
      }
    } catch (err) {
      console.error(err);
      showMessage('Ошибка: ' + escapeHtml(err.message || err), false);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// Load button: заполняет форму по product_id
if (loadBtn) {
  loadBtn.addEventListener('click', async () => {
    const product_id = productIdInput.value.trim();
    if (!product_id) { showMessage('Введите product_id в поле выше', false); return; }
    try {
      showMessage('Загрузка товара...');
      const rec = await loadProductByProductId(product_id);
      if (!rec) { showMessage('Товар не найден', false); return; }
      const info = rec.info || {};
      titleInput.value = info.title || '';
      descInput.value = info.description || '';
      costInput.value = (info.price !== undefined) ? String(info.price) : '';
      document.getElementById('product_discount').value = (info.product_discount !== undefined) ? String(info.product_discount) : '0';
      showMessage(`Товар ${escapeHtml(product_id)} загружен`);
    } catch (err) {
      console.error(err);
      showMessage('Ошибка при загрузке: ' + escapeHtml(err.message || err), false);
    }
  });
}

// Reset button: очищает форму
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    form.reset();
    showMessage('');
  });
}


/* ---- Статистика: fetch + render two bar charts ---- */

// helper: безопасный парсер product_info
function parseProductInfo(raw) {
  if (!raw) return {};
  try {
    if (typeof raw === 'string') return JSON.parse(raw);
    if (typeof raw === 'object') return raw;
  } catch (e) {
    console.warn('parseProductInfo failed', e);
    return {};
  }
  return {};
}

// fetch statistics and draw charts
async function loadAndRenderStatistics() {
  const statsArea = document.getElementById('stats-area');
  if(!statsArea) return;
  statsArea.innerHTML = '<div class="stat-loading">Загрузка статистики…</div>';

  try {
    const res = await fetch('/api/statistics_all_get', { method: 'GET' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json(); // object with keys -> { product_id, product_info, rejected_orders, success_orders }
    // convert to array
    const arr = Object.keys(data).map(pk => {
      const rec = data[pk];
      const info = parseProductInfo(rec.product_info);
      return {
        pk: pk,
        product_id: rec.product_id,
        title: info.title || info.name || ('Товар ' + pk),
        description: info.description || '',
        price: parseFloat(info.price ?? 0) || 0,
        rejected: Number(rec.rejected_orders || 0),
        success: Number(rec.success_orders || 0)
      };
    });

    // top 5 by success and by rejected
    const topSuccess = arr.slice().sort((a,b)=> b.success - a.success).slice(0,5);
    const topRejected = arr.slice().sort((a,b)=> b.rejected - a.rejected).slice(0,5);

    // render two charts
    statsArea.innerHTML = `
      <div class="stats-panel">
        <div class="stat-card" id="chart-success-card">
          <h3 class="stat-title">Топ-5 товаров — успешные заказы</h3>
          <svg class="chart-svg" id="chart-success" role="img" aria-label="Top success orders chart"></svg>
          <div class="chart-legend" id="legend-success"></div>
        </div>
        <div class="stat-card" id="chart-rejected-card">
          <h3 class="stat-title">Топ-5 товаров — незаказанные</h3>
          <svg class="chart-svg" id="chart-rejected" role="img" aria-label="Top rejected orders chart"></svg>
          <div class="chart-legend" id="legend-rejected"></div>
        </div>
      </div>
    `;

    drawBarChart('#chart-success', topSuccess, 'success');
    drawBarChart('#chart-rejected', topRejected, 'rejected');

  } catch (err) {
    console.error('loadAndRenderStatistics error', err);
    statsArea.innerHTML = `<div class="stat-error">Ошибка загрузки статистики: ${escapeHtml(err.message || err)}</div>`;
  }
}

// draw simple horizontal bar chart into SVG selector
function drawBarChart(svgSelector, data, kind) {
  const svg = document.querySelector(svgSelector);
  if(!svg) return;
  // dimensions
  const padding = { top: 8, right: 16, bottom: 28, left: 140 };
  const width = svg.clientWidth || svg.getBoundingClientRect().width || 600;
  const height = svg.clientHeight || 260;
  const innerW = Math.max(200, width - padding.left - padding.right);
  const innerH = Math.max(80, height - padding.top - padding.bottom);

  // clear previous
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const maxVal = data.reduce((mx, d) => Math.max(mx, (kind === 'success' ? d.success : d.rejected)), 0) || 1;
  const barGap = 10;
  const barHeight = Math.max(18, (innerH - (data.length - 1) * barGap) / data.length);

  // create group
  const xmlns = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(xmlns, 'g');
  g.setAttribute('transform', `translate(${padding.left},${padding.top})`);
  svg.appendChild(g);

  // Tooltip element (HTML overlay)
  let tooltip = document.querySelector('.chart-tooltip');
  if(!tooltip){
    tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
  }

  data.forEach((d, i) => {
    const value = (kind === 'success' ? d.success : d.rejected);
    const y = i * (barHeight + barGap);

    // background label (product title)
    const label = document.createElementNS(xmlns, 'text');
    label.setAttribute('x', -12);
    label.setAttribute('y', y + barHeight/2);
    label.setAttribute('dominant-baseline','middle');
    label.setAttribute('text-anchor','end');
    label.setAttribute('fill', 'var(--card-fg)');
    label.setAttribute('font-size','13');
    label.textContent = d.title.length > 36 ? d.title.slice(0,33) + '…' : d.title;
    g.appendChild(label);

    // bar
    const barW = Math.round((value / maxVal) * innerW);
    const bar = document.createElementNS(xmlns, 'rect');
    bar.setAttribute('x', 0);
    bar.setAttribute('y', y);
    bar.setAttribute('width', barW);
    bar.setAttribute('height', barHeight);
    // color: success -> accent, rejected -> grey/red
    if (kind === 'success') {
      bar.setAttribute('fill', 'var(--accent)');
    } else {
      bar.setAttribute('fill', '#e05656'); // red-ish for rejected
    }
    bar.setAttribute('rx', Math.min(6, barHeight/2));
    bar.setAttribute('data-pk', d.pk);
    g.appendChild(bar);

    // value text on bar (if space) or at end
    const valText = document.createElementNS(xmlns, 'text');
    const textX = barW > 40 ? Math.min(barW - 6, innerW - 6) : (barW + 6);
    valText.setAttribute('x', textX);
    valText.setAttribute('y', y + barHeight/2);
    valText.setAttribute('dominant-baseline','middle');
    valText.setAttribute('font-size','12');
    valText.setAttribute('fill', barW > 40 ? '#fff' : 'var(--card-fg)');
    valText.setAttribute('text-anchor', barW > 40 ? 'end' : 'start');
    valText.textContent = String(value);
    g.appendChild(valText);

    // mouse events for tooltip
    bar.addEventListener('mousemove', (ev) => {
      tooltip.style.display = 'block';
      tooltip.textContent = `${d.title} — ${value}`;
      const rect = svg.getBoundingClientRect();
      tooltip.style.left = `${ev.clientX}px`;
      tooltip.style.top = `${rect.top + window.scrollY + y}px`;
    });
    bar.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });

  // axis: draw baseline
  const axis = document.createElementNS(xmlns, 'line');
  axis.setAttribute('x1', 0);
  axis.setAttribute('y1', data.length * (barHeight + barGap) - barGap);
  axis.setAttribute('x2', innerW);
  axis.setAttribute('y2', data.length * (barHeight + barGap) - barGap);
  axis.setAttribute('stroke', 'rgba(0,0,0,0.08)');
  svg.appendChild(axis);
}


// ====== Привязка обработчика к кнопке "Статистика" (надежная, учитывает динамическую вставку MF) ======
function attachStatsHandler() {
  const statsBtn = document.getElementById('stats-btn');
  if (!statsBtn) return false;
  statsBtn.addEventListener('click', async () => {
    try {
      statsBtn.disabled = true;
      await loadAndRenderStatistics();
    } catch (e) {
      console.error('stats click error', e);
    } finally {
      statsBtn.disabled = false;
    }
  });
  return true;
}

function runWhenReady(fn) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    try { fn(); } catch(e) { console.error(e); }
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      try { fn(); } catch(e) { console.error(e); }
    });
  }
}

// Попытка привязать обработчик несколько раз с небольшими паузами (защита от гонки)
runWhenReady(() => {
  const tryAttach = (triesLeft = 8) => {
    if (attachStatsHandler()) return;
    if (triesLeft <= 0) {
      console.warn('stats-btn not found to attach handler');
      return;
    }
    setTimeout(() => tryAttach(triesLeft - 1), 120);
  };
  tryAttach(8);
});
