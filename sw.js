/* Vạn Phát — service worker ở gốc site.
   Catalog phát hành (data/products.json, trang HTML) đã loại nhóm «Không đưa lên web».
   Không tải nguồn khác. Có mạng: giá và catalog là network-first, không trả bản cũ.
   Mất mạng: dùng đúng bản đã lưu. Bản SW mới tự kích hoạt, không cần khách bấm.
   chat-widget.js và css/chat-widget.css khớp theo pathname, bỏ qua ?v,
   network-first (timeout 3 giây). Sửa hai file đó không cần tăng ?v trên HTML.
   css/styles.css dùng chung vẫn cache-first. */
const VERSION = "2026101728";
const SHELL = "vp-shell-" + VERSION;
const PAGES = "vp-pages-" + VERSION;
const IMAGES = "vp-img-" + VERSION;
const CHAT_NETWORK_TIMEOUT_MS = 3000;
const CHAT_NETWORK_FIRST_PATHS = ["/js/chat-widget.js", "/css/chat-widget.css"];
const SITE_ORIGIN = "https://vanphatcompany.vn";

const SHELL_URLS = [
  "/manifest.webmanifest",
  "/css/styles.css?v=" + VERSION,
  "/css/chat-widget.css",
  "/js/main.js?v=" + VERSION,
  "/js/cart.js",
  "/js/catalog-paths.js?v=" + VERSION,
  "/js/ia.js?v=2026101721",
  "/js/products.js?v=2026101721",
  "/js/product-lightbox.js?v=2026101721",
  "/js/chat-widget.js?v=2026101727",
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

function chooseFetchStrategy(input, options) {
  let url;
  try {
    if (typeof input === "string") {
      url = new URL(input, (options && options.origin) || SITE_ORIGIN);
    } else {
      url = new URL(input.href);
    }
  } catch (_) {
    return "bypass";
  }
  const site = (options && options.origin) || SITE_ORIGIN;
  if (url.origin !== site) {
    if (url.hostname === "lh3.googleusercontent.com") return "image-cache-first";
    return "bypass";
  }
  const path = url.pathname;
  for (let i = 0; i < CHAT_NETWORK_FIRST_PATHS.length; i += 1) {
    if (path === CHAT_NETWORK_FIRST_PATHS[i]) return "chat-network-first";
  }
  const mode = (options && options.mode) || "";
  if (mode === "navigate" || isPriceDocument(url)) return "page-network-first";
  return "shell-cache-first";
}

function assetPathname(request) {
  try {
    return new URL(request.url).pathname;
  } catch (_) {
    return "";
  }
}

function canonicalAssetRequest(pathname) {
  return new Request(new URL(pathname, self.location.origin).href);
}

async function readChatCache(cache, request) {
  const path = assetPathname(request);
  if (path) {
    const canonical = await cache.match(canonicalAssetRequest(path));
    if (canonical) return canonical;
  }
  return cache.match(request, { ignoreSearch: true });
}

async function writeChatCache(cache, request, response) {
  const path = assetPathname(request);
  if (!path) return;
  try {
    await cache.put(canonicalAssetRequest(path), response.clone());
  } catch (_) {
    /* phản hồi đổi hướng hoặc không thân không lưu được */
  }
}

async function networkFirstChat(request, timeoutMs) {
  const cache = await caches.open(SHELL);
  const limit = Number(timeoutMs) > 0 ? Number(timeoutMs) : CHAT_NETWORK_TIMEOUT_MS;
  const offline = self.navigator && self.navigator.onLine === false;
  if (!offline) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer = 0;
    try {
      const fresh = await new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          if (controller) {
            try {
              controller.abort();
            } catch (_) {}
          }
          reject(new Error("timeout"));
        }, limit);
        const next = new Request(request, {
          cache: "no-store",
          signal: controller ? controller.signal : undefined,
        });
        fetch(next).then(resolve, reject);
      });
      if (fresh && fresh.ok && !fresh.redirected) {
        await writeChatCache(cache, request, fresh);
        return fresh;
      }
      const stale = await readChatCache(cache, request);
      if (stale) return stale;
      if (fresh) return fresh;
    } catch (_) {
      /* quá 3 giây hoặc mạng đứt — dùng bản đã lưu */
    } finally {
      clearTimeout(timer);
    }
  }
  const hit = await readChatCache(cache, request);
  if (hit) return hit;
  return new Response("", { status: 504, statusText: "Offline" });
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
  const strategy = chooseFetchStrategy(url, {
    mode: request.mode,
    origin: self.location.origin,
  });
  if (strategy === "image-cache-first") {
    event.respondWith(cacheFirst(request, IMAGES, true));
    return;
  }
  if (strategy === "bypass") return;
  if (strategy === "chat-network-first") {
    event.respondWith(networkFirstChat(request));
    return;
  }
  if (strategy === "page-network-first") {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request, SHELL, false));
});

self.VanPhatSW = {
  chooseFetchStrategy: chooseFetchStrategy,
  networkFirstChat: networkFirstChat,
  CHAT_NETWORK_TIMEOUT_MS: CHAT_NETWORK_TIMEOUT_MS,
  CHAT_NETWORK_FIRST_PATHS: CHAT_NETWORK_FIRST_PATHS,
};
