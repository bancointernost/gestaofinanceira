/* Service worker do Minhas Finanças (PFP)
   - Página do app: rede primeiro (pega sempre a versão nova), cache se estiver sem internet.
   - Bibliotecas (Chart.js, XLSX, Firebase, fontes): cache primeiro, atualizando em segundo plano.
   - Firebase (dados/login) e Claude (IA): nunca passam pelo cache.
   Ao publicar uma versão nova, troque VERSAO para o app oferecer "Atualizar". */
const VERSAO = 'pfp-047b';
const CACHE_APP = VERSAO + '-app';
const CACHE_LIB = 'pfp-libs';            // bibliotecas versionadas na URL: pode sobreviver entre versões
const ARQUIVOS_APP = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
];
const HOSTS_LIB = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_APP).then(c => c.addAll(ARQUIVOS_APP)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n !== CACHE_APP && n !== CACHE_LIB).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

function ehLib(url) {
  if (HOSTS_LIB.includes(url.hostname)) return true;
  // só os módulos JS do Firebase (versão na URL); APIs do Firebase ficam de fora
  return url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navegação (abrir o app): rede primeiro, cache como reserva
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    e.respondWith((async () => {
      try {
        const resp = await fetch(req, { cache: 'no-cache' });
        if (resp && resp.ok) {
          const c = await caches.open(CACHE_APP);
          c.put('./index.html', resp.clone());
        }
        return resp;
      } catch (err) {
        const c = await caches.open(CACHE_APP);
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Arquivos do próprio app (manifesto, ícones)
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
    return;
  }

  // Bibliotecas de CDN: cache primeiro, atualiza em segundo plano
  if (ehLib(url)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE_LIB);
      const emCache = await c.match(req);
      const daRede = fetch(req).then(resp => {
        if (resp && (resp.ok || resp.type === 'opaque')) c.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      if (emCache) { e.waitUntil(daRede); return emCache; }
      return (await daRede) || Response.error();
    })());
  }
  // Todo o resto (Firestore, login, api.anthropic.com…) vai direto para a rede
});
