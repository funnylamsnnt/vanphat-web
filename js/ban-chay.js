/* Nhãn Hot và khối Bán chạy 4 tuần qua.
   Đọc /data/ban-chay.json (network-first). File đó chỉ có hạng, mã, tên, link, giá.
   Danh sách rỗng thì ẩn khối và không gắn Hot. */
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

  const HOT_LABEL = "Hot · Bán chạy";

  function hotEl() {
    const span = document.createElement("span");
    span.className = "product-hot";
    span.setAttribute("aria-label", HOT_LABEL);
    span.textContent = HOT_LABEL;
    return span;
  }

  let marking = false;

  function mark(root, set) {
    if (marking) return;
    marking = true;
    try {
      const scope = root && root.querySelectorAll ? root : document;
      scope.querySelectorAll(".product-card[data-ma]").forEach((card) => {
        const ma = String(card.getAttribute("data-ma") || "").toUpperCase();
        const img = card.querySelector(".product-img");
        if (!img) return;
        const existing = img.querySelector(".product-hot");
        if (set.has(ma)) {
          card.setAttribute("data-hot", "1");
          if (!existing) img.insertBefore(hotEl(), img.firstChild);
          else if (existing.textContent !== HOT_LABEL) {
            existing.textContent = HOT_LABEL;
            existing.setAttribute("aria-label", HOT_LABEL);
          }
        } else if (existing) {
          existing.remove();
          card.removeAttribute("data-hot");
        }
      });
    } finally {
      marking = false;
    }
  }

  function applySection(hasItems) {
    const section = document.getElementById("ban-chay");
    if (!section) return;
    section.hidden = !hasItems;
  }

  function writeList(items) {
    const node = document.getElementById("ban-chay-ld");
    if (!node) return;
    const list = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": "https://vanphatcompany.vn/#ban-chay",
      name: "Bán chạy 4 tuần qua",
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      numberOfItems: items.length,
      itemListElement: items.map((item) => ({
        "@type": "ListItem",
        position: item.hang,
        name: item.ten,
        url: "https://vanphatcompany.vn/" + String(item.href || "").replace(/^\//, ""),
      })),
    };
    node.textContent = JSON.stringify(list);
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
    if (!data || !Array.isArray(data.items)) return;
    const list = data.items;
    const active = list.length > 0;
    writeList(active ? list : []);
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
