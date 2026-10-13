/* Vạn Phát — shared UI */
(function () {
  const HOTLINE = "033 5652 832";
  const HOTLINE_TEL = "0335652832";

  window.VanPhat = {
    HOTLINE,
    HOTLINE_TEL,
    formatPrice(n) {
      const num = Number(n) || 0;
      return num.toLocaleString("vi-VN") + " ₫";
    },
    placeholderSvg() {
      return (
        "data:image/svg+xml," +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
            <rect fill="#EFE9DE" width="400" height="400"/>
            <g fill="#1F4E78" opacity="0.35">
              <rect x="150" y="130" width="100" height="80" rx="8" fill="none" stroke="#1F4E78" stroke-width="4"/>
              <circle cx="180" cy="160" r="12"/>
              <path d="M160 190 L190 165 L215 185 L240 155 L240 200 L160 200 Z"/>
            </g>
            <text x="200" y="250" text-anchor="middle" fill="#5A6577" font-family="sans-serif" font-size="16">Vạn Phát</text>
          </svg>`
        )
      );
    },
    onImgError(img) {
      img.onerror = null;
      img.src = window.VanPhat.placeholderSvg();
      img.alt = "Ảnh đang cập nhật";
      const wrap = img.closest(".product-img");
      if (wrap) wrap.classList.add("is-fallback");
    },
    fold(s) {
      return String(s ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .toLowerCase();
    },
    driveImage(url, width, webp) {
      const match = String(url || "").match(/^(https:\/\/lh3\.googleusercontent\.com\/d\/[A-Za-z0-9_-]+)/);
      if (!match) return String(url || "");
      return match[1] + "=w" + width + (webp ? "-rw" : "");
    },
  };

  function syncChromeOffset() {
    const header = document.querySelector(".site-header");
    if (!header) return;
    const height = Math.ceil(header.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty("--header-h", height + "px");
  }

  function initNav() {
    const nav = document.querySelector(".nav");
    const toggle = document.querySelector(".nav-toggle");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      syncChromeOffset();
    });
    document.addEventListener("click", (e) => {
      if (!nav.contains(e.target) && nav.classList.contains("open")) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  const VIEWED_KEY = "vp-recent-viewed";

  function readViewed() {
    try {
      const raw = JSON.parse(localStorage.getItem(VIEWED_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.filter((item) => item && item.ma && item.ten && item.href).slice(0, 8);
    } catch (e) {
      return [];
    }
  }

  function writeViewed(items) {
    try {
      localStorage.setItem(VIEWED_KEY, JSON.stringify(items.slice(0, 8)));
    } catch (e) {
      /* bộ nhớ riêng tư có thể chặn ghi */
    }
  }

  function rememberView() {
    const article = document.querySelector("article.product-detail[data-ma]");
    if (!article) return;
    const ma = article.dataset.ma || "";
    const ten = article.dataset.ten || "";
    if (!ma || !ten) return;
    const item = {
      ma,
      ten,
      gia: article.dataset.gia || "",
      anh: article.dataset.anh || "",
      nhom: article.dataset.nhom || "",
      href: location.pathname + location.search,
    };
    writeViewed([item].concat(readViewed().filter((row) => row.ma !== ma)));
  }

  function escText(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderViewed() {
    const footer = document.querySelector(".site-footer");
    if (!footer || document.querySelector(".recent-strip")) return;
    const current = document.querySelector("article.product-detail[data-ma]");
    const currentMa = current ? current.dataset.ma : "";
    const items = readViewed().filter((item) => item.ma !== currentMa);
    if (!items.length) return;
    const section = document.createElement("section");
    section.className = "recent-strip";
    section.setAttribute("aria-label", "Đã xem gần đây");
    const cards = items
      .map((item) => {
        const amount = Number(item.gia);
        const price = amount > 0 ? window.VanPhat.formatPrice(amount) : "Liên hệ";
        const src = window.VanPhat.driveImage(item.anh, 240, true) || window.VanPhat.placeholderSvg();
        return `<a class="recent-card" href="${escText(item.href)}">
          <img src="${escText(src)}" alt="" width="148" height="110" loading="lazy" />
          <span class="recent-name">${escText(item.ten)}</span>
          <span class="recent-price">${escText(price)}</span>
        </a>`;
      })
      .join("");
    section.innerHTML = `<div class="container"><h2>Đã xem gần đây</h2><div class="recent-row">${cards}</div></div>`;
    footer.parentNode.insertBefore(section, footer);
  }

  function initScrollTop() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scroll-top";
    button.hidden = true;
    button.setAttribute("aria-label", "Lên đầu trang");
    button.textContent = "↑";
    document.body.appendChild(button);
    const onScroll = () => {
      button.hidden = window.scrollY < 480;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    onScroll();
  }

  function setActiveNav() {
    const path = location.pathname.toLowerCase();
    const file = path.split("/").pop() || "index.html";
    const onCatalog =
      file === "san-pham.html" ||
      path.indexOf("/san-pham/") !== -1 ||
      path.indexOf("/linh-vuc/") !== -1;
    document.querySelectorAll(".nav-links a").forEach((a) => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      const target = href.split("/").pop();
      const home = target === "index.html" && (file === "index.html" || file === "");
      const catalog = target === "san-pham.html" && onCatalog;
      const exact = target && target === file && !onCatalog;
      if (home || catalog || exact) a.classList.add("active");
    });
  }

  function initCategoryRail() {
    if (document.querySelector(".cat-rail")) return;
    const header = document.querySelector(".site-header");
    if (!header) return;
    const prefix = /\/san-pham\/|\/linh-vuc\/|\/dia-phuong\/|\/nhan-vien\//.test(location.pathname) ? "../" : "";
    const groups = [
      ["Giấy", "san-pham/nhom-giay.html"],
      ["Bìa hồ sơ", "san-pham/nhom-bia-ho-so.html"],
      ["Bút &amp; mực", "san-pham/nhom-but-muc.html"],
      ["Băng keo", "san-pham/nhom-bang-keo.html"],
      ["Dụng cụ VP", "san-pham/nhom-dung-cu-vp.html"],
      ["Nước uống", "san-pham/nhom-nuoc-uong.html"],
      ["Bánh", "san-pham/nhom-banh.html"],
      ["Điện", "san-pham/nhom-dien.html"],
    ];
    const rail = document.createElement("nav");
    rail.className = "cat-rail";
    rail.setAttribute("aria-label", "Nhóm hàng");
    const path = location.pathname;
    rail.innerHTML =
      '<div class="container">' +
      groups
        .map(([label, href]) => {
          const current = path.endsWith("/" + href) || path.endsWith(href) ? ' aria-current="page"' : "";
          return `<a href="${prefix}${href}"${current}>${label}</a>`;
        })
        .join("") +
      "</div>";
    header.insertAdjacentElement("afterend", rail);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initNav();
    setActiveNav();
    initCategoryRail();
    rememberView();
    renderViewed();
    initScrollTop();
    syncChromeOffset();
    window.addEventListener("resize", syncChromeOffset);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncChromeOffset);
  });
})();
