/* Nhãn Hot và khối Bán chạy 4 tuần qua.
   Đọc /data/ban-chay.json (network-first). Không có dữ liệu thật thì ẩn khối
   và không gắn Hot. Trang chủ đã có HTML tĩnh; file này đồng bộ lại theo JSON. */
(function () {
  if (window.__vpBanChayStarted) return;
  window.__vpBanChayStarted = true;

  const DATA_URL = "/data/ban-chay.json";
  const CSS_URL = "/css/ban-chay.css";

  function ensureCss() {
    if (!document || typeof document.createElement !== "function") return Promise.resolve();
    const existing = document.querySelector('link[data-vp-ban-chay-css], link[href$="ban-chay.css"]');
    if (existing) {
      if (existing.sheet) return Promise.resolve();
      return new Promise((resolve) => {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => resolve(), { once: true });
      });
    }
    return new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = CSS_URL;
      link.setAttribute("data-vp-ban-chay-css", "1");
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener("error", () => resolve(), { once: true });
      const head = document.head || document.documentElement;
      if (head) head.appendChild(link);
      else resolve();
    });
  }

  function hotEl() {
    const span = document.createElement("span");
    span.className = "product-hot";
    span.setAttribute("aria-label", "Bán chạy");
    span.textContent = "Hot";
    return span;
  }

  function mark(root, set) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(".product-card[data-ma]").forEach((card) => {
      const ma = String(card.getAttribute("data-ma") || "").toUpperCase();
      const img = card.querySelector(".product-img");
      if (!img) return;
      const existing = img.querySelector(".product-hot");
      if (set.has(ma)) {
        card.setAttribute("data-hot", "1");
        if (!existing) img.insertBefore(hotEl(), img.firstChild);
      } else if (existing) {
        existing.remove();
        card.removeAttribute("data-hot");
      }
    });
  }

  function applySection(hasItems) {
    const section = document.getElementById("ban-chay");
    if (!section) return;
    if (hasItems) {
      section.hidden = false;
    } else {
      section.hidden = true;
    }
  }

  async function start() {
    await ensureCss();
    let data = null;
    try {
      const res = await fetch(DATA_URL);
      if (res.ok) data = await res.json();
    } catch (_) {
      data = null;
    }
    if (!data) return;
    const list = Array.isArray(data.items) ? data.items : [];
    const active = Boolean(data.coDuLieu) && list.length > 0;
    const set = new Set();
    if (active) {
      list.forEach((item) => set.add(String((item && item.ma) || "").toUpperCase()));
    }
    applySection(active);
    mark(document, set);
    window.VanPhatBanChay = {
      isHot(ma) {
        return set.has(String(ma || "").toUpperCase());
      },
      mark(root) {
        mark(root || document, set);
      },
    };
    if (!document.body || typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(() => mark(document, set));
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
