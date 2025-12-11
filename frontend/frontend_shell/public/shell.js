const root = document.getElementById('app');
const routes = {
  '/': { type: 'static', html: `<section class="container"><h2>Home</h2><p>Добро пожаловать</p></section>` },
  '/orders': { type: 'remote', url: '/mf/orders' }, // мы будем делать fetch к mf-orders
  '/admin': { type: 'remote', url: '/mf/admin' }
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

async function loadRoute(path){
  const route = routes[path] || routes['/'];
  if(route.type === 'static'){
    // если простая статическая страница — удалим предыдущие MF-ресурсы и просто вставим html
    removeInjectedMFResources();
    root.innerHTML = route.html;
    return;
  } else if(route.type === 'remote'){
    root.innerHTML = `<div class="container"><p>Загрузка...</p></div>`;
    try{
      const resp = await fetch(route.url);
      if(!resp.ok) throw new Error('Failed to load microfrontend: ' + resp.status);
      const htmlText = await resp.text();

      // Парсим HTML
      const parser = new DOMParser();
      const parsedDoc = parser.parseFromString(htmlText, 'text/html');

      // Определяем имя микрофронта (mf-orders / mf-admin) из route.url
      // ожидаем route.url вроде "/mf/orders" или "/mf/admin"
      let mfName = route.url.replace(/^\/+|\/+$/g, ''); // "mf/orders"
      mfName = mfName.replace(/\//g, '-'); // "mf-orders"

      // Вычисляем baseHref: <base> в microfrontend > route.url
      const baseEl = parsedDoc.querySelector('base');
      let baseHref = baseEl ? baseEl.getAttribute('href') : route.url;
      if(!baseHref.endsWith('/')) baseHref = baseHref + '/';
      // абсолютная база относительно текущего окна
      const absoluteBase = new URL(baseHref, window.location.origin).href;

      // --- Удаляем ресурсы предыдущих microfrontends (css, scripts, inline styles) ---
      // Оставляем любые теги без data-mf (например global shell css)
      removeInjectedMFResources();

      // --- Подключаем CSS: резолвим href и добавляем в head (с пометкой data-mf) ---
      const links = Array.from(parsedDoc.querySelectorAll('link[rel="stylesheet"]'));
      for(const l of links){
        const href = l.getAttribute('href') || '';
        const absHref = new URL(href, absoluteBase).href;
        // Если уже есть такой link с точно таким href и data-mf (редко, т.к. мы удаляем), можно пропустить.
        if(!document.head.querySelector(`link[rel="stylesheet"][href="${absHref}"]`)){
          const newLink = document.createElement('link');
          newLink.rel = 'stylesheet';
          newLink.href = absHref;
          newLink.setAttribute('data-mf', mfName);
          document.head.appendChild(newLink);
          // не ждём загрузку; CSS применяется автоматически
        }
        l.remove();
      }

      // --- Копируем inline <style> теги (помечаем data-mf) ---
      const styles = Array.from(parsedDoc.querySelectorAll('style'));
      for(const s of styles){
        const newStyle = s.cloneNode(true);
        newStyle.setAttribute('data-mf', mfName);
        document.head.appendChild(newStyle);
        s.remove();
      }

      // --- Вставляем остальной контент в root (без <script>) ---
      const scriptsInDoc = Array.from(parsedDoc.querySelectorAll('script'));
      scriptsInDoc.forEach(s => s.remove());
      // Вставляем body содержимое
      const bodyContent = parsedDoc.body ? parsedDoc.body.innerHTML : parsedDoc.documentElement.innerHTML;
      root.innerHTML = bodyContent;

      // --- Выполним скрипты в исходном порядке ---
      // Получаем скрипты заново из исходного html (для сохранения порядка и inline/src)
      const parsedForScripts = parser.parseFromString(htmlText, 'text/html');
      const scriptsOrdered = Array.from(parsedForScripts.querySelectorAll('script'));

      for(const s of scriptsOrdered){
        if(s.src){
          // резолвим src относительно absoluteBase
          const rawSrc = s.getAttribute('src');
          const absSrc = new URL(rawSrc, absoluteBase).href;
          const newScript = document.createElement('script');
          if(s.type) newScript.type = s.type;
          // помечаем, чтобы можно было удалить при следующем переходе
          newScript.setAttribute('data-mf', mfName);
          newScript.src = absSrc;
          // создаём промис ожидания загрузки — это сохраняет порядок выполнения
          await new Promise((resolve, reject) => {
            newScript.onload = () => resolve();
            newScript.onerror = (e) => {
              console.error('Failed to load script', absSrc, e);
              // всё же resolve, чтобы не блокировать навигацию; можно reject если нужен жесткий fail
              resolve();
            };
            document.body.appendChild(newScript);
          });
        } else {
          // inline script — создаём и выполняем
          const inline = document.createElement('script');
          if(s.type) inline.type = s.type;
          inline.textContent = s.textContent;
          inline.setAttribute('data-mf', mfName);
          document.body.appendChild(inline);
        }
      }

    }catch(err){
      root.innerHTML = `<div class="container"><p>Ошибка загрузки страницы: ${err.message}</p></div>`;
      console.error(err);
    }
  }
}

// Утилита: удаляет все ранее вставленные ресурсы, помеченные data-mf
function removeInjectedMFResources(){
  // Удаляем link rel=stylesheet, style и script с data-mf
  const injectedLinks = document.head.querySelectorAll('link[data-mf]');
  injectedLinks.forEach(el => el.remove());
  const injectedStyles = document.head.querySelectorAll('style[data-mf]');
  injectedStyles.forEach(el => el.remove());
  const injectedScripts = document.querySelectorAll('script[data-mf]');
  injectedScripts.forEach(el => el.remove());
  // Дополнительно — можно очищать root, но loadRoute делает root.innerHTML = ...
}
