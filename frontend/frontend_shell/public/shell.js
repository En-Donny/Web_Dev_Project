const root = document.getElementById('app');
const routes = {
  '/': { type: 'static', html: `<section class="container"><h2>Home</h2><p>Добро пожаловать</p></section>` },
  '/orders': { type: 'remote', url: '/mf/orders' }, // мы будем делать fetch к mf-orders
  '/admin': { type: 'remote', url: '/mf/admin' },
  '/cart': { type: 'remote', url: '/mf/cart' }
};

function setTheme(theme){
  document.body.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
  localStorage.setItem('theme', theme);
  document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}

document.addEventListener('DOMContentLoaded', () => {
  // restore theme
  const saved = localStorage.getItem('theme') || 'light';
  setTheme(saved);

  document.getElementById('theme-toggle').addEventListener('click', () => {
    setTheme(document.body.classList.contains('theme-dark') ? 'light' : 'dark');
  });

  // client-side routing (simple)
  document.body.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if(a){
      e.preventDefault();
      navigate(a.getAttribute('href'));
    }
  });

  window.addEventListener('popstate', () => loadRoute(location.pathname));
  loadRoute(location.pathname);
});

async function navigate(path){
  history.pushState({}, '', path);
  await loadRoute(path);
}


async function loadRoute(path) {
  const route = routes[path] || routes['/'];
  if (route.type === 'static') {
    console.log('[MF] route static, removing injected resources');
    removeInjectedMFResources();
    root.innerHTML = route.html;
    return;
  }

  console.log('[MF] route remote ->', route.url);
  root.innerHTML = `<div class="container"><p>Загрузка...</p></div>`;

  try {
    // принудительно без кэша (для отладки)
    const resp = await fetch(route.url, { cache: 'no-store' });
    console.log('[MF] fetch', route.url, 'status', resp.status, 'resp.url', resp.url, 'type', resp.type);

    if (!resp.ok) throw new Error('Failed to load microfrontend: ' + resp.status);

    const htmlText = await resp.text();
    console.log('[MF] html length', htmlText.length);

    const parser = new DOMParser();
    const parsedDoc = parser.parseFromString(htmlText, 'text/html');

    // mfName
    let mfName = route.url.replace(/^\/+|\/+$/g, '').replace(/\//g, '-'); // "mf-orders"

    // вычисляем абсолютную базу относительно resp.url или <base>
    const baseEl = parsedDoc.querySelector('base');
    let baseHref = baseEl ? baseEl.getAttribute('href') : null;
    let absoluteBase;
    if (baseHref) absoluteBase = new URL(baseHref, resp.url).href;
    else absoluteBase = resp.url.endsWith('/') ? resp.url : resp.url + '/';
    if (!absoluteBase.endsWith('/')) absoluteBase += '/';
    console.log('[MF] absoluteBase:', absoluteBase);

    // очистка предыдущих MF-ресурсов
    console.log('[MF] removing previous injected MF resources');
    removeInjectedMFResources();

    // --- Обработка preload (modulepreload / preload) ---
    const preloadLinks = Array.from(parsedDoc.querySelectorAll('link[rel="modulepreload"], link[rel="preload"], link[rel="prefetch"]'));
    for (const l of preloadLinks) {
      const rel = l.getAttribute('rel');
      const href = l.getAttribute('href') || '';
      const absHref = new URL(href, absoluteBase).href;
      console.log('[MF] add preload', rel, absHref);
      const newL = document.createElement('link');
      newL.rel = rel;
      if (l.getAttribute('as')) newL.as = l.getAttribute('as');
      if (l.getAttribute('crossorigin')) newL.setAttribute('crossorigin', l.getAttribute('crossorigin'));
      newL.href = absHref;
      newL.setAttribute('data-mf', mfName);
      document.head.appendChild(newL);
      l.remove();
    }

    // --- CSS ---
    const cssLinks = Array.from(parsedDoc.querySelectorAll('link[rel~="stylesheet"], link[rel="stylesheet"]'));
    for (const l of cssLinks) {
      const href = l.getAttribute('href') || '';
      const absHref = new URL(href, absoluteBase).href;
      console.log('[MF] add stylesheet', absHref);
      const newLink = document.createElement('link');
      newLink.rel = 'stylesheet';
      newLink.href = absHref;
      newLink.setAttribute('data-mf', mfName);
      document.head.appendChild(newLink);
      l.remove();
    }

    // --- inline styles ---
    const styles = Array.from(parsedDoc.querySelectorAll('style'));
    for (const s of styles) {
      const newStyle = s.cloneNode(true);
      newStyle.setAttribute('data-mf', mfName);
      document.head.appendChild(newStyle);
      s.remove();
    }

    // --- Удаляем все <script> из parsedDoc перед вставкой контента ---
    const scriptsInDoc = Array.from(parsedDoc.querySelectorAll('script'));
    scriptsInDoc.forEach(s => s.remove());

    // --- Вставляем тело ---
    const bodyContent = parsedDoc.body ? parsedDoc.body.innerHTML : parsedDoc.documentElement.innerHTML;
    root.innerHTML = bodyContent;
    console.log('[MF] content injected into root');

    // --- Теперь выполняем скрипты в исходном порядке ---
    const parsedForScripts = parser.parseFromString(htmlText, 'text/html');
    const scriptsOrdered = Array.from(parsedForScripts.querySelectorAll('script'));
    console.log('[MF] scripts to execute:', scriptsOrdered.length);

    for (const s of scriptsOrdered) {
      if (s.src) {
        const rawSrc = s.getAttribute('src');
        // Для отладки добавим временный query-param, чтобы гарантировать запрос:
        const absSrc = new URL(rawSrc, absoluteBase).href;
        const debugSrc = absSrc + (absSrc.includes('?') ? '&' : '?') + `mf=${mfName}&t=${Date.now()}`;
        console.log('[MF] creating external script', rawSrc, '->', debugSrc);

        const newScript = document.createElement('script');

        // копируем атрибуты
        if (s.getAttribute('type')) newScript.type = s.getAttribute('type');
        if (s.hasAttribute('nomodule')) newScript.setAttribute('nomodule', '');
        if (s.getAttribute('crossorigin')) newScript.setAttribute('crossorigin', s.getAttribute('crossorigin'));
        if (s.getAttribute('integrity')) newScript.setAttribute('integrity', s.getAttribute('integrity'));
        if (s.getAttribute('referrerpolicy')) newScript.setAttribute('referrerpolicy', s.getAttribute('referrerpolicy'));
        // порядок выполнения гарантуем:
        newScript.async = false;
        newScript.src = debugSrc;
        newScript.setAttribute('data-mf', mfName);

        // лог до вставки
        console.log('[MF] append script to head', debugSrc);
        await new Promise((resolve) => {
          newScript.onload = () => {
            console.log('[MF] script loaded', debugSrc);
            resolve();
          };
          newScript.onerror = (e) => {
            console.error('[MF] script error', debugSrc, e);
            resolve(); // не блокируем навигацию
          };
          // добавляем в head — большинство сборщиков ожидают скрипты в head
          (document.head || document.body).appendChild(newScript);
        });
      } else {
        // inline script
        console.log('[MF] creating inline script');
        const inline = document.createElement('script');
        if (s.getAttribute('type')) inline.type = s.getAttribute('type');
        inline.textContent = s.textContent;
        inline.setAttribute('data-mf', mfName);
        (document.body || document.head).appendChild(inline);
      }
    }

    console.log('[MF] loadRoute finished for', route.url);
  } catch (err) {
    root.innerHTML = `<div class="container"><p>Ошибка загрузки страницы: ${err.message}</p></div>`;
    console.error('[MF] loadRoute error', err);
  }
}

// --- Утилита: удаляет все ранее вставленные ресурсы, помеченные data-mf ---
function removeInjectedMFResources(){
  console.log('[MF] removeInjectedMFResources called');
  // link
  document.querySelectorAll('link[data-mf]').forEach(el => {
    console.log('[MF] removing link', el.href || el.getAttribute('href'));
    el.remove();
  });
  // styles
  document.querySelectorAll('style[data-mf]').forEach(el => {
    console.log('[MF] removing style');
    el.remove();
  });
  // scripts
  document.querySelectorAll('script[data-mf]').forEach(el => {
    console.log('[MF] removing script', el.src || '(inline)');
    el.remove();
  });
  // base
  document.querySelectorAll('base[data-mf]').forEach(el => {
    console.log('[MF] removing base', el.href || el.getAttribute('href'));
    el.remove();
  });
}
