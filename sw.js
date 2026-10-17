/* Vạn Phát — service worker ở gốc site.
   Catalog phát hành (data/products.json, trang HTML) đã loại nhóm «Không đưa lên web».
   Không tải nguồn khác. Có mạng: giá và catalog là network-first, không trả bản cũ.
   Mất mạng: dùng đúng bản đã lưu. Bản SW mới tự kích hoạt, không cần khách bấm. */
const VERSION = "2026101725";
const SHELL = "vp-shell-" + VERSION;
const PAGES = "vp-pages-" + VERSION;
const IMAGES = "vp-img-" + VERSION;

const SHELL_URLS = [
  "/manifest.webmanifest",
  "/css/styles.css?v=" + VERSION,
  "/js/main.js?v=" + VERSION,
  "/js/cart.js",
  "/js/catalog-paths.js?v=" + VERSION,
  "/js/ia.js?v=2026101721",
  "/js/products.js?v=2026101721",
  "/js/product-lightbox.js?v=2026101721",
  "/js/chat-widget.js?v=2026101309",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/apple-touch-icon.png",
  "/assets/favicon.png?v=20260925",
  "/assets/logo-nav.png?v=20260925",
  "/assets/fonts/be-vietnam-pro-400.woff2",
  "/assets/fonts/be-vietnam-pro-500.woff2",
  "/assets/fonts/be-vietnam-pro-600.woff2",
  "/assets/fonts/be-vietnam-pro-700.woff2",
  "/assets/fonts/be-vietnam-pro-800.woff2",
];

const PAGE_URLS = [
  "/",
  "/index.html",
  "/offline.html",
  "/san-pham.html",
  "/lien-he.html",
  "/app/",
  "/app/index.html",
  "/data/products.json",
  "/linh-vuc/vpp.html",
  "/linh-vuc/nuoc-banh.html",
  "/linh-vuc/dien-gia-dung.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      const pages = await caches.open(PAGES);
      await shell.addAll(SHELL_URLS);
      await pages.addAll(PAGE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, PAGES, IMAGES]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

function isPriceDocument(url) {
  const path = url.pathname;
  if (path === "/data/products.json") return true;
  if (path === "/" || path.endsWith("/")) return true;
  return path.endsWith(".html");
}

async function putFresh(cache, request, response) {
  if (!response || !response.ok || response.redirected) return;
  try {
    await cache.put(request.url, response.clone());
  } catch (_) {
    /* phản hồi đổi hướng hoặc không thân không lưu được */
  }
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  const offline = self.navigator && self.navigator.onLine === false;
  if (!offline) {
    try {
      const fresh = await fetch(request.url, { method: "GET", cache: "no-store", redirect: "follow" });
      await putFresh(cache, request, fresh);
      return fresh;
    } catch (_) {
      /* mạng đứt giữa chừng — mới được dùng bản đã xem */
    }
  }
  const cached = (await cache.match(request)) || (await cache.match(request.url));
  if (cached) return cached;
  if (request.mode === "navigate") {
    const page = await cache.match("/offline.html");
    if (page) return page;
  }
  return new Response("offline", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function trimImages(cache) {
  const keys = await cache.keys();
  const extra = keys.length - 120;
  for (let i = 0; i < extra; i += 1) await cache.delete(keys[i]);
}

async function cacheFirst(request, cacheName, allowOpaque) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const pull = fetch(request)
    .then((res) => {
      const storable = res && (res.ok || (allowOpaque && res.type === "opaque"));
      if (storable && !res.redirected) {
        cache.put(request, res.clone()).then(() => {
          if (cacheName === IMAGES) return trimImages(cache);
          return null;
        }).catch(() => {});
      }
      return res;
    })
    .catch(() => null);
  if (hit) return hit;
  const fresh = await pull;
  if (fresh) return fresh;
  return new Response("", { status: 504, statusText: "Offline" });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }
  if (url.origin !== self.location.origin) {
    if (url.hostname === "lh3.googleusercontent.com") {
      event.respondWith(cacheFirst(request, IMAGES, true));
    }
    return;
  }
  if (request.mode === "navigate" || isPriceDocument(url)) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request, SHELL, false));
});
