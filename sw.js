// =====================================================================
//  sw.js — Service worker do Estoque SPM (o que torna o app "instalável")
// ---------------------------------------------------------------------
//  1. Dados do Supabase (*.supabase.co): NUNCA passam pelo cache.
//     Estoque tem que ser sempre o número atual do banco.
//  2. Arquivos do app (html, css, js, ícones): REDE PRIMEIRO.
//     Online, sempre pega a versão mais nova publicada no GitHub.
//     Sem internet, usa a cópia guardada: o app abre e avisa "sem
//     internet", em vez de mostrar a tela de erro do navegador.
//  3. Fontes do Google: CACHE PRIMEIRO (mudam raramente).
//
//  Ao mudar a lista de arquivos, aumente VERSION para limpar o cache.
// =====================================================================
const VERSION = 'estoque-spm-v3.0.0';

const SHELL = [
  './', './index.html', './manifest.json', './css/style.css',
  './js/app.js', './js/config.js', './js/api.js', './js/estado.js', './js/ui.js', './js/acoes.js', './js/pdf.js',
  './js/paginas/estoque.js', './js/paginas/historico.js', './js/paginas/relatorios.js', './js/paginas/atencao.js',
  './js/vendor/supabase.js', './js/vendor/jspdf.umd.min.js', './js/vendor/jspdf.plugin.autotable.min.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'
];
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname.endsWith('supabase.co')) return;   // 1

  if (CDN_HOSTS.includes(url.hostname)) {             // 3
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  if (url.origin === self.location.origin) {          // 2
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
    );
  }
});
