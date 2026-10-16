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
    if (document.body.classList.contains("page-catalog")) return;
    if (document.querySelector(".catalog-group-links")) return;
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

  const CHIP_KEY = "vp-chip-rail-collapsed";
  const rails = [];
  let chipCollapsed = false;
  let chipScrollHidden = false;
  let chipLockUntil = 0;
  let chipLastY = 0;

  function readChipCollapsed() {
    try {
      return localStorage.getItem(CHIP_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function writeChipCollapsed(value) {
    try {
      localStorage.setItem(CHIP_KEY, value ? "1" : "0");
    } catch (e) {
      /* bộ nhớ riêng tư có thể chặn ghi */
    }
  }

  function chipIcon(dir) {
    const paths = {
      left: "M10 3L5 8l5 5",
      right: "M6 3l5 5-5 5",
      up: "M3 10l5-5 5 5",
      down: "M3 6l5 5 5-5",
    };
    return (
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
      '<path d="' +
      paths[dir] +
      '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    );
  }

  function chipButton(className, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("aria-label", label);
    return button;
  }

  function smoothScroll() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  }

  function updateChipEdges(rail, scroller) {
    const max = scroller.scrollWidth - scroller.clientWidth;
    const overflow = max > 6;
    rail.classList.toggle("is-overflow", overflow);
    rail.classList.toggle("is-fade-left", overflow && scroller.scrollLeft > 6);
    rail.classList.toggle("is-fade-right", overflow && scroller.scrollLeft < max - 6);
    const prev = rail.querySelector(".chip-rail-prev");
    const next = rail.querySelector(".chip-rail-next");
    if (prev) prev.disabled = !overflow || scroller.scrollLeft <= 6;
    if (next) next.disabled = !overflow || scroller.scrollLeft >= max - 6;
  }

  function revealChip(scroller) {
    const active = scroller.querySelector(".chip.active, .active, [aria-current='page']");
    if (!active) return;
    const box = scroller.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.left >= box.left + 4 && item.right <= box.right - 4) return;
    const delta = item.left - box.left - (box.width - item.width) / 2;
    scroller.scrollLeft += delta;
  }

  function bindChipScroller(rail, scroller) {
    scroller.addEventListener(
      "scroll",
      () => updateChipEdges(rail, scroller),
      { passive: true }
    );
    rails.push({ rail, scroller });
    requestAnimationFrame(() => {
      revealChip(scroller);
      updateChipEdges(rail, scroller);
    });
  }

  function scrollChip(scroller, dir) {
    scroller.scrollBy({ left: dir * Math.max(140, scroller.clientWidth * 0.72), behavior: smoothScroll() });
  }

  function applyChipRails() {
    rails.forEach(({ rail }) => {
      const sticky = rail.dataset.sticky === "1";
      rail.classList.toggle("is-collapsed", chipCollapsed);
      rail.classList.toggle("is-scroll-hidden", !chipCollapsed && sticky && chipScrollHidden);
      const toggle = rail.querySelector(".chip-rail-toggle");
      if (!toggle || toggle.classList.contains("chip-rail-toggle-lv")) return;
      toggle.setAttribute("aria-expanded", chipCollapsed ? "false" : "true");
      toggle.setAttribute("aria-label", chipCollapsed ? "Hiện nhóm hàng" : "Ẩn nhóm hàng");
      toggle.innerHTML = chipIcon(chipCollapsed ? "down" : "up");
    });
    document.body.classList.toggle("vp-chips-collapsed", chipCollapsed);
    document.body.classList.toggle("vp-chips-scrollhide", !chipCollapsed && chipScrollHidden);
    const lvToggle = document.querySelector(".chip-rail-toggle-lv");
    if (lvToggle) {
      const show = chipCollapsed || !chipScrollHidden;
      lvToggle.hidden = !show;
      lvToggle.setAttribute("aria-expanded", chipCollapsed ? "false" : "true");
      lvToggle.setAttribute("aria-label", chipCollapsed ? "Hiện nhóm hàng" : "Ẩn nhóm hàng");
      lvToggle.innerHTML = chipIcon(chipCollapsed ? "down" : "up");
    }
    rails.forEach(({ rail, scroller }) => updateChipEdges(rail, scroller));
    updateLvEdges();
  }

  function toggleChipCollapsed() {
    chipCollapsed = !chipCollapsed;
    writeChipCollapsed(chipCollapsed);
    applyChipRails();
  }

  function enhanceChipRow(row, sticky) {
    if (!row || row.closest(".chip-rail") || row.closest(".catalog-side") || row.closest(".filter-sheet")) return;
    if (row.id === "chip-row" || row.id === "lv-row" || row.id === "staff-chip-row" || row.id === "active-filters") return;
    const rail = document.createElement("div");
    rail.className = "chip-rail";
    if (sticky) rail.dataset.sticky = "1";
    const prev = chipButton("chip-rail-arrow chip-rail-prev", "Xem nhóm phía trước");
    const next = chipButton("chip-rail-arrow chip-rail-next", "Xem nhóm phía sau");
    const toggle = chipButton("chip-rail-toggle", "Ẩn nhóm hàng");
    prev.innerHTML = chipIcon("left");
    next.innerHTML = chipIcon("right");
    toggle.innerHTML = chipIcon("up");
    toggle.setAttribute("aria-expanded", "true");
    const scroller = document.createElement("div");
    scroller.className = "chip-rail-scroll";
    row.parentNode.insertBefore(rail, row);
    scroller.appendChild(row);
    rail.append(prev, scroller, next, toggle);
    row.classList.add("chip-rail-row");
    prev.addEventListener("click", () => scrollChip(scroller, -1));
    next.addEventListener("click", () => scrollChip(scroller, 1));
    toggle.addEventListener("click", toggleChipCollapsed);
    bindChipScroller(rail, scroller);
  }

  function enhanceCatRail(nav) {
    if (!nav || nav.classList.contains("chip-rail")) return;
    const track = nav.querySelector(".container");
    if (!track) return;
    nav.classList.add("chip-rail");
    nav.dataset.sticky = "1";
    const prev = chipButton("chip-rail-arrow chip-rail-prev", "Xem nhóm phía trước");
    const next = chipButton("chip-rail-arrow chip-rail-next", "Xem nhóm phía sau");
    const toggle = chipButton("chip-rail-toggle", "Ẩn nhóm hàng");
    prev.innerHTML = chipIcon("left");
    next.innerHTML = chipIcon("right");
    toggle.innerHTML = chipIcon("up");
    toggle.setAttribute("aria-expanded", "true");
    const scroller = document.createElement("div");
    scroller.className = "chip-rail-scroll";
    track.parentNode.insertBefore(scroller, track);
    scroller.appendChild(track);
    nav.insertBefore(prev, scroller);
    scroller.insertAdjacentElement("afterend", next);
    next.insertAdjacentElement("afterend", toggle);
    track.classList.add("chip-rail-row");
    prev.addEventListener("click", () => scrollChip(scroller, -1));
    next.addEventListener("click", () => scrollChip(scroller, 1));
    toggle.addEventListener("click", toggleChipCollapsed);
    bindChipScroller(nav, scroller);
  }

  function updateLvEdges() {
    const lv = document.getElementById("lv-row");
    if (!lv) return;
    const inToolbar = !!lv.closest(".toolbar");
    lv.classList.toggle("chip-scroll-row", inToolbar);
    if (!inToolbar) {
      lv.classList.remove("is-fade-left", "is-fade-right");
      return;
    }
    const max = lv.scrollWidth - lv.clientWidth;
    const overflow = max > 6;
    lv.classList.toggle("is-fade-left", overflow && lv.scrollLeft > 6);
    lv.classList.toggle("is-fade-right", overflow && lv.scrollLeft < max - 6);
  }

  function initCatalogLvRail() {
    if (!document.body.classList.contains("page-catalog")) return;
    const box = document.querySelector(".toolbar > .container");
    const lv = document.getElementById("lv-row");
    if (!box || !lv || box.querySelector(".chip-rail-toggle-lv")) return;
    const toggle = chipButton("chip-rail-toggle chip-rail-toggle-lv", "Ẩn nhóm hàng");
    toggle.innerHTML = chipIcon("up");
    toggle.setAttribute("aria-expanded", "true");
    box.appendChild(toggle);
    toggle.addEventListener("click", toggleChipCollapsed);
    lv.addEventListener("scroll", updateLvEdges, { passive: true });
    window.addEventListener("resize", updateLvEdges);
    const watch = new MutationObserver((records) => {
      if (!records.some((rec) => rec.target !== lv)) return;
      revealChip(lv);
      updateLvEdges();
    });
    watch.observe(lv, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    updateLvEdges();
    revealChip(lv);
  }

  function initChipRails() {
    if (/nhan-vien/.test(location.pathname)) return;
    chipCollapsed = readChipCollapsed();
    document.querySelectorAll(".toolbar .chip-row.catalog-group-links").forEach((row) => {
      enhanceChipRow(row, true);
    });
    document.querySelectorAll("main .catalog-section > .container > .chip-row").forEach((row) => {
      enhanceChipRow(row, false);
    });
    document.querySelectorAll(".hero-quick").forEach((row) => {
      enhanceChipRow(row, false);
    });
    document.querySelectorAll(".cat-rail").forEach((nav) => enhanceCatRail(nav));
    initCatalogLvRail();
    applyChipRails();
    chipLastY = window.scrollY || 0;
    window.addEventListener(
      "scroll",
      () => {
        const y = window.scrollY || 0;
        if (Date.now() < chipLockUntil) {
          chipLastY = y;
          return;
        }
        const delta = y - chipLastY;
        chipLastY = y;
        let next = chipScrollHidden;
        if (y < 48) next = false;
        else if (delta > 12) next = true;
        else if (delta < -12) next = false;
        if (next === chipScrollHidden) return;
        chipScrollHidden = next;
        chipLockUntil = Date.now() + 180;
        applyChipRails();
        chipLastY = window.scrollY || 0;
      },
      { passive: true }
    );
    window.addEventListener("resize", () => {
      setTimeout(() => {
        rails.forEach(({ rail, scroller }) => updateChipEdges(rail, scroller));
        updateLvEdges();
      }, 0);
    });
  }

  const INSTALL_KEY = "vp-pwa-install-dismissed";
  let deferredInstall = null;

  function isStaffPage() {
    return (
      (document.body && document.body.classList.contains("staff-page")) ||
      /\/nhan-vien(\/|\.html|$)/.test(location.pathname)
    );
  }

  function isStandaloneMode() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function isIosDevice() {
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }

  function isInstallPage() {
    return /\/app\/?$/.test(location.pathname) || /\/app\/index\.html$/.test(location.pathname);
  }

  function installHidden() {
    try {
      return localStorage.getItem(INSTALL_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function rememberInstallHide() {
    try {
      localStorage.setItem(INSTALL_KEY, "1");
    } catch (e) {
      /* bộ nhớ riêng tư */
    }
  }

  function hideInstallBanner() {
    const bar = document.getElementById("vp-install");
    if (bar) bar.hidden = true;
  }

  function showInstallBanner() {
    if (!document.body || isStaffPage() || isInstallPage() || installHidden() || isStandaloneMode()) {
      return;
    }
    const ios = isIosDevice() && !deferredInstall;
    if (!ios && !deferredInstall) return;
    let bar = document.getElementById("vp-install");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "vp-install";
      bar.className = "vp-install";
      bar.innerHTML =
        '<p data-install-text>Cài app Vạn Phát để đặt hàng nhanh trên điện thoại.</p>' +
        '<button type="button" class="btn btn-gold btn-sm" data-pwa-install>Cài</button>' +
        '<a class="vp-install-help" href="/app/">Cách cài</a>' +
        '<button type="button" class="vp-install-x" data-pwa-dismiss aria-label="Đóng">×</button>';
      document.body.insertBefore(bar, document.body.firstChild);
      bar.querySelector("[data-pwa-dismiss]").addEventListener("click", () => {
        rememberInstallHide();
        hideInstallBanner();
      });
      bar.querySelector("[data-pwa-install]").addEventListener("click", async () => {
        if (!deferredInstall) return;
        deferredInstall.prompt();
        try {
          await deferredInstall.userChoice;
        } catch (e) {
          /* khách đóng hộp thoại cài */
        }
        deferredInstall = null;
        hideInstallBanner();
      });
    }
    const text = bar.querySelector("[data-install-text]");
    const btn = bar.querySelector("[data-pwa-install]");
    if (ios) {
      if (text) text.textContent = "iPhone: bấm Chia sẻ, rồi Thêm vào Màn hình chính.";
      if (btn) btn.hidden = true;
    } else if (btn) {
      if (text) text.textContent = "Cài app Vạn Phát để đặt hàng nhanh trên điện thoại.";
      btn.hidden = false;
    }
    bar.hidden = false;
  }

  function tabIcon(path) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';
  }

  function initTabBar() {
    if (!document.body || isStaffPage() || document.querySelector(".vp-tabbar")) return;
    if (!isStandaloneMode()) return;
    document.documentElement.classList.add("vp-standalone");
    const path = location.pathname;
    const finding = location.hash === "#tim";
    const home = (path === "/" || /\/index\.html$/.test(path)) && !finding;
    const contact = /\/lien-he\.html$/.test(path);
    const catalog =
      !finding &&
      (/\/san-pham\.html$/.test(path) || path.indexOf("/san-pham/") !== -1 || path.indexOf("/linh-vuc/") !== -1);
    function link(href, label, icon, current) {
      return (
        '<a href="' +
        href +
        '"' +
        (current ? ' aria-current="page"' : "") +
        ">" +
        icon +
        "<span>" +
        label +
        "</span></a>"
      );
    }
    const nav = document.createElement("nav");
    nav.className = "vp-tabbar";
    nav.setAttribute("aria-label", "Điều hướng app");
    nav.innerHTML = [
      link("/index.html", "Trang chủ", tabIcon("M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"), home),
      link("/san-pham.html", "Danh mục", tabIcon("M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"), catalog),
      link("/san-pham.html#tim", "Tìm", tabIcon("M10.5 4a6.5 6.5 0 0 1 5.2 10.4l4 4-1.4 1.4-4-4A6.5 6.5 0 1 1 10.5 4zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"), finding),
      '<button type="button" data-cart-open>' +
        tabIcon("M6 6h15l-1.5 9h-12zM6 6 5 3H2m5 16a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z") +
        "<span>Giỏ</span>" +
        '<span class="vp-tab-badge" data-cart-badge hidden>0</span></button>',
      link("/lien-he.html", "Liên hệ", tabIcon("M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"), contact),
    ].join("");
    document.body.appendChild(nav);
    if (window.VanPhatCart && window.VanPhatCart.render) window.VanPhatCart.render();
  }

  function focusSiteSearch() {
    if (location.hash !== "#tim") return;
    const input = document.querySelector(".nav-search input");
    if (!input) return;
    const nav = document.querySelector(".nav");
    const toggle = document.querySelector(".nav-toggle");
    if (nav && toggle && window.getComputedStyle(toggle).display !== "none") {
      nav.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
    }
    input.focus();
  }

  function openCartFromShortcut() {
    const params = new URLSearchParams(location.search);
    if (params.get("gio") !== "1" || isStaffPage()) return;
    if (window.VanPhatCart && window.VanPhatCart.open) window.VanPhatCart.open();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const had = !!navigator.serviceWorker.controller;
    if (had) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (isStaffPage() || isIosDevice()) return;
    deferredInstall = event;
    showInstallBanner();
  });
  window.addEventListener("appinstalled", () => {
    rememberInstallHide();
    deferredInstall = null;
    hideInstallBanner();
  });

  document.addEventListener("DOMContentLoaded", () => {
    initNav();
    setActiveNav();
    initCategoryRail();
    initChipRails();
    rememberView();
    renderViewed();
    initScrollTop();
    syncChromeOffset();
    window.addEventListener("resize", syncChromeOffset);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncChromeOffset);
    initTabBar();
    showInstallBanner();
    focusSiteSearch();
    openCartFromShortcut();
  });

  registerServiceWorker();
})();
