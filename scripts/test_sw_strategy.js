#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const failures = [];

function fail(msg) {
  failures.push(msg);
}

function memCache() {
  const rows = [];
  return {
    rows,
    async match(request, options) {
      const url = typeof request === "string" ? request : request.url;
      const parsed = new URL(url);
      if (options && options.ignoreSearch) {
        const hit = rows.find((row) => new URL(row.url).pathname === parsed.pathname);
        return hit ? hit.body : undefined;
      }
      const exact = rows.find((row) => row.url === url);
      return exact ? exact.body : undefined;
    },
    async put(request, response) {
      const url = typeof request === "string" ? request : request.url;
      const item = { url, body: response };
      const idx = rows.findIndex((row) => row.url === url);
      if (idx >= 0) rows[idx] = item;
      else rows.push(item);
    },
  };
}

function loadSw(hooks) {
  const code = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const cache = memCache();
  const sandbox = {
    self: {
      addEventListener() {},
      location: { origin: "https://vanphatcompany.vn" },
      navigator: { onLine: true },
      skipWaiting() {},
      clients: { claim() { return Promise.resolve(); } },
    },
    caches: { open: async () => cache },
    fetch: hooks && hooks.fetch ? hooks.fetch : async () => new Response("fresh", { status: 200 }),
    Response,
    Request,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
  };
  sandbox.self.navigator = sandbox.self.navigator;
  sandbox.navigator = sandbox.self.navigator;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "sw.js" });
  const api = sandbox.self.VanPhatSW;
  if (!api || typeof api.chooseFetchStrategy !== "function") fail("chooseFetchStrategy không gắn lên self.VanPhatSW");
  return { api, cache, sandbox };
}

function strategyOf(api, input, options) {
  return api.chooseFetchStrategy(input, options);
}

function testChoose() {
  const { api } = loadSw();
  const samples = [
    ["https://vanphatcompany.vn/js/chat-widget.js", "chat-network-first"],
    ["https://vanphatcompany.vn/js/chat-widget.js?v=2026101727", "chat-network-first"],
    ["https://vanphatcompany.vn/js/chat-widget.js?v=khac", "chat-network-first"],
    ["/js/chat-widget.js?v=1", "chat-network-first"],
    ["https://vanphatcompany.vn/css/styles.css?v=2026101728", "shell-cache-first"],
    ["https://vanphatcompany.vn/js/main.js?v=2026101728", "shell-cache-first"],
    ["https://vanphatcompany.vn/js/cart.js", "shell-cache-first"],
    ["https://vanphatcompany.vn/js/product-lightbox.js?v=2026101721", "shell-cache-first"],
    ["https://vanphatcompany.vn/san-pham.html", "page-network-first"],
    ["https://vanphatcompany.vn/data/products.json", "page-network-first"],
    ["https://vanphatcompany.vn/", "page-network-first"],
    ["https://vanphatcompany.vn/linh-vuc/vpp.html", "page-network-first"],
    ["https://lh3.googleusercontent.com/a=s480", "image-cache-first"],
    ["https://example.com/js/chat-widget.js?v=1", "bypass"],
  ];
  samples.forEach((pair) => {
    const got = strategyOf(api, pair[0]);
    if (got !== pair[1]) fail(pair[0] + " muốn " + pair[1] + ", được " + got);
  });
  const nav = strategyOf(api, "https://vanphatcompany.vn/san-pham", { mode: "navigate" });
  if (nav !== "page-network-first") fail("điều hướng phải network-first trang, được " + nav);
  if (api.CHAT_NETWORK_TIMEOUT_MS !== 3000) fail("timeout chat phải 3000ms, được " + api.CHAT_NETWORK_TIMEOUT_MS);
  const paths = api.CHAT_NETWORK_FIRST_PATHS || [];
  if (paths.indexOf("/js/chat-widget.js") === -1) fail("thiếu pathname chat-widget.js");
  if (paths.some((item) => item.indexOf("styles.css") !== -1)) fail("không đưa styles.css dùng chung vào network-first");
  const queried = new URL("https://vanphatcompany.vn/js/chat-widget.js?v=cu");
  if (strategyOf(api, queried) !== "chat-network-first") fail("URL object có query vẫn phải network-first");
}

async function textOf(response) {
  if (!response || typeof response.text !== "function") return "";
  return response.text();
}

async function testOfflineUsesCache() {
  const { api, cache, sandbox } = loadSw({
    fetch() {
      throw new Error("không được gọi mạng khi offline");
    },
  });
  sandbox.self.navigator.onLine = false;
  sandbox.navigator.onLine = false;
  const oldUrl = "https://vanphatcompany.vn/js/chat-widget.js?v=2026101727";
  await cache.put(oldUrl, new Response("ban-cu", { status: 200 }));
  const response = await api.networkFirstChat(new Request("https://vanphatcompany.vn/js/chat-widget.js?v=moi"));
  const body = await textOf(response);
  if (body !== "ban-cu") fail("mất mạng không trả cache widget, được " + body);
  if (!response || response.status === 504) fail("mất mạng mà có cache vẫn trả 504");
}

async function testTimeoutFallsBack() {
  let fetches = 0;
  const { api, cache } = loadSw({
    fetch(_request) {
      fetches += 1;
      return new Promise(() => {});
    },
  });
  await cache.put(
    "https://vanphatcompany.vn/js/chat-widget.js?v=2026101727",
    new Response("ban-cache", { status: 200 })
  );
  const started = Date.now();
  const response = await api.networkFirstChat(
    new Request("https://vanphatcompany.vn/js/chat-widget.js?v=2026101727"),
    40
  );
  const elapsed = Date.now() - started;
  const body = await textOf(response);
  if (body !== "ban-cache") fail("quá timeout không rơi về cache, được " + body);
  if (elapsed > 500) fail("timeout test chờ quá lâu: " + elapsed + "ms");
  if (fetches !== 1) fail("timeout phải thử mạng một lần, được " + fetches);
}

async function testOnlineStoresFresh() {
  const { api, cache } = loadSw({
    fetch() {
      return Promise.resolve(new Response("ban-moi", { status: 200 }));
    },
  });
  await cache.put(
    "https://vanphatcompany.vn/js/chat-widget.js?v=2026101727",
    new Response("ban-cu", { status: 200 })
  );
  const response = await api.networkFirstChat(
    new Request("https://vanphatcompany.vn/js/chat-widget.js?v=2026101727"),
    40
  );
  const body = await textOf(response);
  if (body !== "ban-moi") fail("có mạng không trả bản mới, được " + body);
  const saved = cache.rows.find((row) => row.url === "https://vanphatcompany.vn/js/chat-widget.js");
  if (!saved) fail("bản mới không ghi vào cache theo pathname, bỏ query");
  if ((await textOf(saved.body)) !== "ban-moi") fail("cache pathname không phải bản mới");
}

async function main() {
  testChoose();
  if (!failures.length) {
    await testOfflineUsesCache();
    await testTimeoutFallsBack();
    await testOnlineStoresFresh();
  }
  if (failures.length) {
    console.error("KHÔNG ĐẠT: " + failures.length + " lỗi");
    failures.forEach((item) => console.error("- " + item));
    process.exit(1);
  }
  console.log("OK: chat-widget.js network-first theo pathname, timeout rồi về cache");
}

main();
