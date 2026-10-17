/* Vạn Phát — lĩnh vực menu, homepage tiles, global search suggest.
   Renders from data/products.json linh_vuc[] (any length, not a fixed 3). */
(function () {
  const ZALO = "https://zalo.me/0335652832";
  const HOTLINE_TEL = "0335652832";

  function load() {
    if (!window.VanPhatData) window.VanPhatData = {};
    if (!window.VanPhatData._promise) {
      window.VanPhatData._promise = fetch("/data/products.json").then((res) => {
        if (!res.ok) throw new Error("Không tải được dữ liệu sản phẩm");
        return res.json();
      });
    }
    return window.VanPhatData._promise;
  }
  window.VanPhatData = window.VanPhatData || {};
  window.VanPhatData.load = load;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fold(s) {
    if (window.VanPhat && window.VanPhat.fold) return window.VanPhat.fold(s);
    return String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "d")
      .toLowerCase();
  }

  function prefix() {
    const path = location.pathname;
    if (/\/san-pham\/|\/linh-vuc\//.test(path)) return "../";
    return "";
  }

  function visibleLinhVuc(data) {
    return (data.linh_vuc || [])
      .filter((lv) => lv && lv.visible !== false && lv.slug)
      .slice()
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }

  function nhomRecords(data) {
    return (data.nhom || [])
      .filter((n) => n && n.visible !== false && (n.TenNhom || n.ten))
      .slice()
      .sort((a, b) => (a.STT || 0) - (b.STT || 0));
  }

  function groupsFor(data, lv) {
    const all = nhomRecords(data);
    const byId = {};
    all.forEach((n) => {
      byId[n.id || n.slug] = n;
    });
    const ids = lv.nhomIds || [];
    const listed = ids.map((id) => byId[id]).filter(Boolean);
    if (listed.length) return listed;
    return all.filter((n) => n.linhVucId === lv.id);
  }

  function countsByNhomId(data) {
    const counts = {};
    (data.sanpham || []).forEach((p) => {
      const id = p.nhomId || "";
      if (!id) return;
      counts[id] = (counts[id] || 0) + 1;
    });
    return counts;
  }

  function groupName(n) {
    return n.TenNhom || n.ten || "";
  }

  function categoryHref(name) {
    const p = prefix();
    const map = (window.VanPhatPaths && window.VanPhatPaths.category) || {};
    if (name && map[name]) return p + map[name];
    return p + "san-pham.html?nhom=" + encodeURIComponent(name || "");
  }

  function linhHref(lv) {
    const p = prefix();
    const map = (window.VanPhatPaths && window.VanPhatPaths.linhVuc) || {};
    if (lv.id && map[lv.id]) return p + map[lv.id];
    return p + "linh-vuc/" + encodeURIComponent(lv.slug) + ".html";
  }

  function productHref(product) {
    const p = prefix();
    const map = (window.VanPhatPaths && window.VanPhatPaths.product) || {};
    if (product.ma && map[product.ma]) return p + map[product.ma];
    return p + "san-pham.html?q=" + encodeURIComponent(product.ma || product.ten || "");
  }

  function badge(product, lvById) {
    const lv = lvById[product.linhVucId] || null;
    const short = lv ? lv.tenNgan || lv.ten : product.linhVucTen || "";
    if (short && product.nhom) return short + " · " + product.nhom;
    return short || product.nhom || "";
  }

  function tileSubtitle(lv, groups, counts) {
    const sku = groups.reduce((sum, g) => sum + (counts[g.id] || 0), 0);
    const pending = groups.filter((g) => g.placeholder && !(counts[g.id] || 0));
    if (lv.subtitle) {
      return String(lv.subtitle)
        .replace(/\{sku\}/g, String(sku))
        .replace(/\{groups\}/g, String(groups.length));
    }
    if (lv.browseMode === "product-images") {
      let text = sku + " sản phẩm";
      if (pending.length) text += " · " + pending.map((g) => groupName(g) + " sắp có").join(" · ");
      return text;
    }
    return groups.length + " nhóm · " + sku + " sản phẩm";
  }

  function imagesFor(data, lv, groups, limit) {
    const picked = [];
    const products = data.sanpham || [];
    groups.forEach((g) => {
      if (picked.length >= limit) return;
      const hit = products.find((p) => (p.nhomId === g.id || p.nhom === groupName(g)) && p.anh);
      if (hit && picked.indexOf(hit.anh) === -1) picked.push(hit.anh);
    });
    products.forEach((p) => {
      if (picked.length >= limit) return;
      if (p.linhVucId === lv.id && p.anh && picked.indexOf(p.anh) === -1) picked.push(p.anh);
    });
    return picked.slice(0, limit);
  }

  function renderHome(data) {
    const grid = document.getElementById("linh-vuc-grid");
    if (!grid) return;
    const levels = visibleLinhVuc(data);
    const counts = countsByNhomId(data);
    if (!levels.length) {
      grid.innerHTML = '<p class="empty-state">Chưa có lĩnh vực.</p>';
      return;
    }
    grid.innerHTML = levels
      .map((lv) => {
        const groups = groupsFor(data, lv);
        const photos = imagesFor(data, lv, groups, lv.browseMode === "product-images" ? 2 : 4);
        const mediaClass =
          photos.length <= 1 ? "is-single" : lv.browseMode === "product-images" ? "is-duo" : "";
        const imgs = photos
          .map((src) => {
            const webp = window.VanPhat && window.VanPhat.driveImage ? window.VanPhat.driveImage(src, 480, true) : src;
            const jpeg = window.VanPhat && window.VanPhat.driveImage ? window.VanPhat.driveImage(src, 480, false) : src;
            const onerror =
              "if(!this.dataset.fb){this.dataset.fb='1';this.src=this.dataset.jpeg}else if(window.VanPhat){VanPhat.onImgError(this)}";
            return `<img src="${esc(webp)}" data-jpeg="${esc(jpeg)}" alt="" width="320" height="220" loading="lazy" decoding="async" onerror="${onerror}" />`;
          })
          .join("");
        const sub = tileSubtitle(lv, groups, counts);
        return `<a class="lv-tile" href="${esc(linhHref(lv))}">
          <div class="lv-tile-media ${mediaClass}">${imgs}</div>
          <div class="lv-tile-body">
            <p class="lv-kicker">${esc(lv.tenNgan || "Lĩnh vực")}</p>
            <h3>${esc(lv.ten)}</h3>
            <p class="lv-tile-sub">${esc(sub)}</p>
            <p class="lv-tile-desc">${esc(lv.moTa || "")}</p>
          </div>
        </a>`;
      })
      .join("");
    const skuEl = document.querySelector("[data-ia-stat='sku']");
    const lvEl = document.querySelector("[data-ia-stat='linh-vuc']");
    const nhomEl = document.querySelector("[data-ia-stat='nhom']");
    if (skuEl) skuEl.textContent = String((data.sanpham || []).length);
    if (lvEl) lvEl.textContent = String(levels.length);
    if (nhomEl) nhomEl.textContent = String(nhomRecords(data).length);
  }

  function isMobileNav() {
    return window.matchMedia("(max-width: 860px)").matches;
  }

  function renderNav(data) {
    const nav = document.querySelector(".nav-links");
    if (!nav) return;
    const link = Array.from(nav.querySelectorAll("a")).find((a) =>
      /san-pham\.html(?:$|\?)/.test(a.getAttribute("href") || "")
    );
    if (!link) return;
    let host = link.closest("[data-ia-nav]");
    if (!host) {
      host = document.createElement("div");
      host.className = "nav-item has-mega";
      host.setAttribute("data-ia-nav", "");
      link.parentNode.insertBefore(host, link);
      host.appendChild(link);
    }
    link.classList.add("nav-products");
    link.setAttribute("aria-haspopup", "true");
    link.setAttribute("aria-expanded", "false");

    const levels = visibleLinhVuc(data);
    let panel = host.querySelector(".mega-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "mega-panel";
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-label", "Lĩnh vực sản phẩm");
      host.appendChild(panel);
    }
    const cols = levels
      .map((lv) => {
        const groups = groupsFor(data, lv);
        const links = groups
          .map((g) => {
            const name = groupName(g);
            const suffix = g.placeholder ? " (sắp có)" : "";
            return `<a href="${esc(categoryHref(name))}">${esc(name + suffix)}</a>`;
          })
          .join("");
        return `<div class="mega-col">
          <a class="mega-l1" href="${esc(linhHref(lv))}">${esc(lv.ten)}</a>
          <div class="mega-l2">${links}</div>
        </div>`;
      })
      .join("");
    panel.innerHTML =
      cols +
      `<a class="mega-all" href="${esc(prefix())}san-pham.html">Xem tất cả sản phẩm</a>`;

    if (host.dataset.bound) return;
    host.dataset.bound = "1";
    link.addEventListener("click", (e) => {
      if (!isMobileNav()) return;
      e.preventDefault();
      const open = host.classList.toggle("is-open");
      link.setAttribute("aria-expanded", open ? "true" : "false");
    });
    panel.addEventListener("click", (e) => {
      const l1 = e.target.closest(".mega-l1");
      if (!l1 || !isMobileNav()) return;
      const col = l1.parentElement;
      if (!col.classList.contains("is-open")) {
        e.preventDefault();
        panel.querySelectorAll(".mega-col.is-open").forEach((el) => el.classList.remove("is-open"));
        col.classList.add("is-open");
        l1.setAttribute("aria-expanded", "true");
      }
    });
  }

  function scoreProduct(product, queryFold, queryRaw) {
    const ma = fold(product.ma);
    const ten = fold(product.ten);
    const rawTen = String(product.ten || "").toLowerCase();
    const rawQ = queryRaw.toLowerCase();
    if (ma && ma === queryFold) return 100;
    if (ma && (ma.startsWith(queryFold) || queryFold.startsWith(ma))) return 80;
    if (ten.startsWith(queryFold) || rawTen.startsWith(rawQ)) return 65;
    if (ten.includes(queryFold) || rawTen.includes(rawQ)) return 50;
    const extra = fold([product.thuongHieu, product.quyCach, product.nhom, product.linhVucTen].filter(Boolean).join(" "));
    if (extra.includes(queryFold)) return 30;
    return 0;
  }

  const RECENT_KEY = "vp-recent-search";

  function readRecent() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.filter((item) => typeof item === "string" && item.trim()).slice(0, 6);
    } catch (e) {
      return [];
    }
  }

  function saveRecent(query) {
    const text = String(query || "").trim();
    if (fold(text).length < 2) return;
    const next = [text].concat(readRecent().filter((item) => fold(item) !== fold(text))).slice(0, 6);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch (e) {
      /* bộ nhớ riêng tư có thể chặn ghi */
    }
  }
  window.VanPhatData.saveRecentSearch = saveRecent;

  function suggestThumb(product) {
    const drive = window.VanPhat && window.VanPhat.driveImage;
    const placeholder = window.VanPhat && window.VanPhat.placeholderSvg ? window.VanPhat.placeholderSvg() : "";
    const src = drive ? drive(product.anh, 96, true) : product.anh || "";
    return `<img class="sg-thumb" src="${esc(src || placeholder)}" alt="" width="48" height="48" loading="lazy" />`;
  }

  function suggestPrice(product) {
    const amount = Number(product.gia);
    if (!(amount > 0)) return "Liên hệ báo giá";
    if (window.VanPhat && window.VanPhat.formatPrice) return window.VanPhat.formatPrice(amount);
    return String(amount);
  }

  function renderSuggest(data) {
    const forms = document.querySelectorAll("form.nav-search");
    if (!forms.length) return;
    const lvById = {};
    visibleLinhVuc(data).forEach((lv) => {
      lvById[lv.id] = lv;
    });
    const products = data.sanpham || [];
    forms.forEach((form, index) => {
      const input = form.querySelector('input[type="search"], input[name="q"]');
      if (!input || form.dataset.suggestBound) return;
      form.dataset.suggestBound = "1";
      form.classList.add("has-suggest");
      const box = document.createElement("div");
      box.className = "search-suggest";
      box.id = "search-suggest-" + index;
      box.hidden = true;
      box.setAttribute("role", "listbox");
      form.appendChild(box);
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-controls", box.id);
      input.setAttribute("aria-expanded", "false");

      const params = new URLSearchParams(location.search);
      if (params.get("q") && !input.value) input.value = params.get("q");

      let timer = 0;
      let active = -1;

      function options() {
        return Array.from(box.querySelectorAll('[role="option"]'));
      }
      function hide() {
        box.hidden = true;
        box.innerHTML = "";
        active = -1;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
      }
      function markActive(next) {
        const rows = options();
        rows.forEach((row) => row.classList.remove("is-active"));
        if (!rows.length || next < 0) {
          active = -1;
          input.removeAttribute("aria-activedescendant");
          return;
        }
        active = next >= rows.length ? 0 : next;
        const row = rows[active];
        row.id = row.id || box.id + "-opt-" + active;
        row.classList.add("is-active");
        input.setAttribute("aria-activedescendant", row.id);
        row.scrollIntoView({ block: "nearest" });
      }
      function showRecent() {
        const recent = readRecent();
        if (!recent.length) {
          hide();
          return;
        }
        active = -1;
        box.innerHTML =
          '<div class="sg-label"><span>Tìm gần đây</span><button type="button" class="sg-clear" data-clear-recent>Xóa</button></div>' +
          recent
            .map((query) => {
              const href = prefix() + "san-pham.html?q=" + encodeURIComponent(query);
              return `<a role="option" class="sg-recent" data-recent="${esc(query)}" href="${esc(href)}">${esc(query)}</a>`;
            })
            .join("");
        box.hidden = false;
        input.setAttribute("aria-expanded", "true");
      }
      function show(query) {
        const q = query.trim();
        if (fold(q).length < 2) {
          showRecent();
          return;
        }
        const qFold = fold(q);
        const hits = products
          .map((p) => ({ p, s: scoreProduct(p, qFold, q) }))
          .filter((row) => row.s > 0)
          .sort((a, b) => b.s - a.s || String(a.p.ma).localeCompare(String(b.p.ma)))
          .slice(0, 8);
        const allHref = prefix() + "san-pham.html?q=" + encodeURIComponent(q);
        const rows = hits
          .map((row) => {
            const p = row.p;
            return `<a role="option" class="sg-row" href="${esc(productHref(p))}">
              ${suggestThumb(p)}
              <span class="sg-copy">
                <strong>${esc(p.ten)}</strong>
                <span class="sg-meta">${esc(p.ma)} · ${esc(badge(p, lvById))}</span>
              </span>
              <span class="sg-price">${esc(suggestPrice(p))}</span>
            </a>`;
          })
          .join("");
        const empty = hits.length
          ? ""
          : `<p class="sg-empty">Không thấy “${esc(q)}”? Gọi <a href="tel:${HOTLINE_TEL}">033 5652 832</a> hoặc <a href="${ZALO}" target="_blank" rel="noopener">chat Zalo</a>.</p>`;
        active = -1;
        box.innerHTML =
          rows +
          empty +
          `<a role="option" class="sg-all" href="${esc(allHref)}">Xem tất cả kết quả</a>`;
        box.hidden = false;
        input.setAttribute("aria-expanded", "true");
      }
      function openActive(row) {
        if (!row) return;
        if (row.dataset.clearRecent != null) {
          try {
            localStorage.removeItem(RECENT_KEY);
          } catch (e) {
            /* bỏ qua */
          }
          hide();
          return;
        }
        if (row.dataset.recent) saveRecent(row.dataset.recent);
        else if (row.classList.contains("sg-all")) saveRecent(input.value);
        const href = row.getAttribute("href");
        if (href) location.href = href;
      }
      input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => show(input.value), 140);
      });
      input.addEventListener("focus", () => show(input.value));
      input.addEventListener("change", () => saveRecent(input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          hide();
          return;
        }
        if (box.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          show(input.value);
        }
        if (box.hidden) return;
        const rows = options();
        if (e.key === "ArrowDown") {
          e.preventDefault();
          markActive(active + 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          markActive(active <= 0 ? rows.length - 1 : active - 1);
        } else if (e.key === "Enter" && active >= 0 && rows[active]) {
          e.preventDefault();
          openActive(rows[active]);
        }
      });
      form.addEventListener("submit", () => {
        if (active >= 0) return;
        saveRecent(input.value);
      });
      box.addEventListener("click", (e) => {
        const clear = e.target.closest("[data-clear-recent]");
        if (clear) {
          e.preventDefault();
          try {
            localStorage.removeItem(RECENT_KEY);
          } catch (err) {
            /* bỏ qua */
          }
          hide();
          return;
        }
        const recent = e.target.closest("[data-recent]");
        if (recent) saveRecent(recent.dataset.recent);
        if (e.target.closest(".sg-all")) saveRecent(input.value);
      });
      document.addEventListener("click", (e) => {
        if (!form.contains(e.target) && !box.contains(e.target)) hide();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    load()
      .then((data) => {
        renderNav(data);
        renderHome(data);
        renderSuggest(data);
      })
      .catch(() => {
        const grid = document.getElementById("linh-vuc-grid");
        if (grid) {
          grid.innerHTML =
            '<p class="empty-state">Không tải được danh mục. Gọi hotline 033 5652 832.</p>';
        }
      });
  });
})();
