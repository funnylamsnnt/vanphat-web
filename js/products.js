/* Vạn Phát — product catalog & homepage featured */
(function () {
  let DATA = null;

  async function loadData() {
    if (DATA) return DATA;
    if (window.VanPhatData && window.VanPhatData.load) {
      DATA = await window.VanPhatData.load();
      return DATA;
    }
    const res = await fetch("/data/products.json");
    if (!res.ok) throw new Error("Không tải được dữ liệu sản phẩm");
    DATA = await res.json();
    return DATA;
  }

  function groupName(n) {
    if (n && typeof n === "object") return String(n.TenNhom || n.ten || "");
    return String(n ?? "");
  }

  function visibleNhom(data) {
    return (data.nhom || [])
      .filter((n) => n && n.visible !== false && groupName(n))
      .slice()
      .sort((a, b) => (a.STT || 0) - (b.STT || 0));
  }

  function visibleLinhVuc(data) {
    return (data.linh_vuc || [])
      .filter((lv) => lv && lv.visible !== false)
      .slice()
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }

  function lvById(data) {
    const map = {};
    visibleLinhVuc(data).forEach((lv) => {
      map[lv.id] = lv;
    });
    return map;
  }

  function groupsForLv(data, lvId) {
    const all = visibleNhom(data);
    if (!lvId) return all;
    const lv = visibleLinhVuc(data).find((x) => x.id === lvId || x.slug === lvId);
    if (!lv) return all.filter((n) => n.linhVucId === lvId);
    const byId = {};
    all.forEach((n) => {
      byId[n.id || n.slug] = n;
    });
    const listed = (lv.nhomIds || []).map((id) => byId[id]).filter(Boolean);
    return listed.length ? listed : all.filter((n) => n.linhVucId === lv.id);
  }

  function productHref(p) {
    const map = (window.VanPhatPaths && window.VanPhatPaths.product) || {};
    return (p && map[p.ma]) || "san-pham.html?q=" + encodeURIComponent((p && p.ma) || "");
  }

  function categoryHref(name) {
    const map = (window.VanPhatPaths && window.VanPhatPaths.category) || {};
    if (name && map[name]) return map[name];
    return "san-pham.html?nhom=" + encodeURIComponent(name || "");
  }

  function badgeLabel(p, lvMap) {
    const lv = lvMap[p.linhVucId];
    const short = lv ? lv.tenNgan || lv.ten : p.linhVucTen || "";
    if (short && p.nhom) return short + " · " + p.nhom;
    return p.nhom || short || "";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
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

  function cardHTML(p, lvMap) {
    const img = p.anh ? p.anh : window.VanPhat.placeholderSvg();
    const price = Number(p.gia) > 0 ? window.VanPhat.formatPrice(p.gia) : "Liên hệ";
    const href = productHref(p);
    const badge = badgeLabel(p, lvMap);
    return `
      <article class="product-card"
        data-ma="${escapeAttr(p.ma)}"
        data-ten="${escapeAttr(p.ten)}"
        data-gia="${escapeAttr(p.gia)}"
        data-dvt="${escapeAttr(p.dvt)}"
        data-anh="${escapeAttr(p.anh || "")}"
        data-nhom="${escapeAttr(p.nhom)}"
        data-linh-vuc-id="${escapeAttr(p.linhVucId || "")}">
        <div class="product-img" data-product-zoom role="button" tabindex="0"
             aria-label="Xem ảnh lớn: ${escapeAttr(p.ten)}" title="Xem ảnh lớn">
          <img src="${escapeAttr(img)}" alt="${escapeAttr(p.ten)}" width="400" height="400" loading="lazy" decoding="async"
               onerror="VanPhat.onImgError(this)" />
        </div>
        <div class="product-body">
          <div class="product-badge"><a href="${escapeAttr(categoryHref(p.nhom))}">${escapeHtml(badge)}</a></div>
          <h3 class="product-name"><a href="${escapeAttr(href)}">${escapeHtml(p.ten)}</a></h3>
          <div class="product-meta-row">
            <span class="product-dvt">ĐVT: ${escapeHtml(p.dvt || "—")}</span>
            <span class="product-ma">${escapeHtml(p.ma || "")}</span>
          </div>
          <div class="product-price"><span class="price-label">Giá</span> ${price}</div>
          <div class="product-actions">
            <div class="qty-control">
              <button type="button" class="qty-btn" data-qty-minus aria-label="Giảm số lượng">−</button>
              <input type="number" class="qty-input" value="1" min="1" max="999" data-qty-input aria-label="Số lượng" />
              <button type="button" class="qty-btn" data-qty-plus aria-label="Tăng số lượng">+</button>
            </div>
            <button type="button" class="btn btn-add-cart" data-add-cart>Thêm vào giỏ</button>
          </div>
        </div>
      </article>`;
  }

  function matchesQuery(p, qRaw) {
    const q = String(qRaw || "").trim();
    if (!q) return true;
    const f = fold(q);
    const hay = fold([p.ma, p.ten, p.nhom, p.linhVucTen].filter(Boolean).join(" "));
    const raw = [p.ma, p.ten, p.nhom, p.linhVucTen].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(f) || raw.includes(q.toLowerCase());
  }

  function rank(p, qRaw) {
    const f = fold(qRaw);
    const ma = fold(p.ma);
    if (ma && ma === f) return 3;
    if (ma && ma.startsWith(f)) return 2;
    return 1;
  }

  async function initFeatured() {
    const grid = document.getElementById("featured-products");
    if (!grid) return;
    try {
      const data = await loadData();
      const lvMap = lvById(data);
      const withImg = data.sanpham.filter((p) => p.anh && String(p.anh).trim());
      const byLv = {};
      withImg.forEach((p) => {
        const key = p.linhVucId || p.nhom || "khac";
        if (!byLv[key]) byLv[key] = [];
        byLv[key].push(p);
      });
      const keys = Object.keys(byLv);
      const picked = [];
      let i = 0;
      while (picked.length < 8 && keys.some((k) => byLv[k].length)) {
        const key = keys[i % keys.length];
        if (byLv[key].length) picked.push(byLv[key].shift());
        i++;
      }
      grid.innerHTML = picked.map((p) => cardHTML(p, lvMap)).join("");
    } catch (e) {
      grid.innerHTML = `<div class="empty-state"><h3>Không tải được sản phẩm</h3><p>${escapeHtml(e.message)}</p></div>`;
    }
  }

  async function initCatalog() {
    const grid = document.getElementById("product-grid");
    if (!grid) return;

    const searchInput = document.getElementById("search-input");
    const groupSelect = document.getElementById("group-select");
    const chipRow = document.getElementById("chip-row");
    const lvRow = document.getElementById("lv-row");
    const countEl = document.getElementById("result-count");
    const crumb = document.getElementById("catalog-crumb");

    let data = null;
    let all = [];
    let lvMap = {};
    let currentGroup = "";
    let currentLv = "";
    let currentQuery = "";

    const params = new URLSearchParams(location.search);
    if (params.get("nhom")) currentGroup = params.get("nhom");
    if (params.get("lv")) currentLv = params.get("lv");
    if (params.get("q")) currentQuery = params.get("q");

    function currentGroups() {
      return groupsForLv(data, currentLv);
    }

    function filtered() {
      let list = all;
      if (currentLv) list = list.filter((p) => p.linhVucId === currentLv);
      if (currentGroup) list = list.filter((p) => p.nhom === currentGroup);
      if (currentQuery) {
        list = list.filter((p) => matchesQuery(p, currentQuery));
        list = list.slice().sort((a, b) => rank(b, currentQuery) - rank(a, currentQuery));
      }
      return list;
    }

    function render() {
      const list = filtered();
      if (countEl) {
        const q = currentQuery ? ` cho “${escapeHtml(currentQuery)}”` : "";
        countEl.innerHTML = `<strong>${list.length}</strong> / ${all.length} sản phẩm${q}`;
      }
      if (!list.length) {
        const q = currentQuery ? escapeHtml(currentQuery) : "sản phẩm này";
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1">
            <h3>Không thấy “${q}”?</h3>
            <p>Thử mã hoặc tên khác (có dấu hoặc không dấu). Gọi <a href="tel:0335652832">033 5652 832</a> hoặc <a href="https://zalo.me/0335652832" target="_blank" rel="noopener">chat Zalo</a>.</p>
          </div>`;
        return;
      }
      grid.innerHTML = list.map((p) => cardHTML(p, lvMap)).join("");
    }

    function writeUrl() {
      const url = new URL(location.href);
      if (currentLv) url.searchParams.set("lv", currentLv);
      else url.searchParams.delete("lv");
      if (currentGroup) url.searchParams.set("nhom", currentGroup);
      else url.searchParams.delete("nhom");
      if (currentQuery) url.searchParams.set("q", currentQuery);
      else url.searchParams.delete("q");
      history.replaceState(null, "", url);
    }

    function syncCrumb() {
      if (!crumb) return;
      const lv = visibleLinhVuc(data).find((x) => x.id === currentLv);
      const parts = ['<a href="index.html">Trang chủ</a>', '<span aria-hidden="true">/</span>'];
      const tail = [];
      if (lv) tail.push(escapeHtml(lv.ten));
      if (currentGroup) tail.push(escapeHtml(currentGroup));
      else if (currentQuery && !lv) tail.push("Tìm kiếm");
      if (!tail.length) {
        parts.push('<span aria-current="page">Sản phẩm</span>');
      } else {
        parts.push('<a href="san-pham.html">Sản phẩm</a>');
        tail.forEach((label, i) => {
          parts.push('<span aria-hidden="true">/</span>');
          if (i === tail.length - 1) parts.push(`<span aria-current="page">${label}</span>`);
          else if (lv && i === 0) parts.push(`<a href="linh-vuc/${escapeAttr(lv.slug)}.html">${label}</a>`);
          else parts.push(`<span>${label}</span>`);
        });
      }
      crumb.innerHTML = parts.join("");
    }

    function syncUI() {
      if (searchInput) searchInput.value = currentQuery;
      const groups = currentGroups();
      const names = groups.map(groupName);
      if (groupSelect) {
        const opts = ['<option value="">Tất cả nhóm</option>']
          .concat(names.map((n) => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`))
          .join("");
        groupSelect.innerHTML = opts;
        groupSelect.value = names.indexOf(currentGroup) >= 0 ? currentGroup : "";
      }
      if (chipRow) {
        const chips = ['<button type="button" class="chip" data-nhom="">Tất cả</button>']
          .concat(
            groups.map((n) => {
              const name = groupName(n);
              const suffix = n.placeholder ? " (sắp có)" : "";
              return `<button type="button" class="chip" data-nhom="${escapeAttr(name)}">${escapeHtml(name + suffix)}</button>`;
            })
          )
          .join("");
        chipRow.innerHTML = chips;
        chipRow.querySelectorAll(".chip").forEach((c) => {
          c.classList.toggle("active", (c.dataset.nhom || "") === currentGroup);
        });
      }
      if (lvRow) {
        lvRow.querySelectorAll("[data-lv]").forEach((el) => {
          el.classList.toggle("active", (el.getAttribute("data-lv") || "") === currentLv);
          if (el.getAttribute("role") === "tab") {
            el.setAttribute("aria-selected", (el.getAttribute("data-lv") || "") === currentLv ? "true" : "false");
          }
        });
      }
      syncCrumb();
    }

    function setLv(id) {
      currentLv = id || "";
      const names = new Set(currentGroups().map(groupName));
      if (currentGroup && !names.has(currentGroup)) currentGroup = "";
      syncUI();
      render();
      writeUrl();
    }

    function setGroup(g) {
      currentGroup = g || "";
      syncUI();
      render();
      writeUrl();
    }

    try {
      data = await loadData();
      all = data.sanpham || [];
      lvMap = lvById(data);
      const knownLv = new Set(visibleLinhVuc(data).map((lv) => lv.id));
      if (currentLv && !knownLv.has(currentLv)) currentLv = "";

      if (lvRow) {
        const chips = ['<button type="button" class="chip" data-lv="" role="tab">Tất cả</button>']
          .concat(
            visibleLinhVuc(data).map(
              (lv) =>
                `<button type="button" class="chip" role="tab" data-lv="${escapeAttr(lv.id)}" title="${escapeAttr(lv.ten)}">${escapeHtml(lv.tenNgan || lv.ten)}</button>`
            )
          )
          .join("");
        lvRow.innerHTML = chips;
        lvRow.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-lv]");
          if (!btn) return;
          setLv(btn.getAttribute("data-lv") || "");
        });
      }

      if (groupSelect) {
        groupSelect.addEventListener("change", () => setGroup(groupSelect.value));
      }
      if (chipRow) {
        chipRow.addEventListener("click", (e) => {
          const btn = e.target.closest(".chip");
          if (!btn) return;
          setGroup(btn.dataset.nhom || "");
        });
      }
      if (searchInput) {
        let t;
        searchInput.addEventListener("input", () => {
          clearTimeout(t);
          t = setTimeout(() => {
            currentQuery = searchInput.value;
            render();
            syncCrumb();
            writeUrl();
          }, 180);
        });
      }

      syncUI();
      render();
    } catch (e) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>Lỗi tải dữ liệu</h3><p>${escapeHtml(e.message)}</p></div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initFeatured();
    initCatalog();
  });
})();
