/* Vạn Phát — product catalog & homepage featured */
(function () {
  const DATA_URL = "data/products.json";
  let DATA = null;

  async function loadData() {
    if (DATA) return DATA;
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error("Không tải được dữ liệu sản phẩm");
    DATA = await res.json();
    return DATA;
  }

  /** data.nhom may be string[] or {STT, TenNhom}[] */
  function groupName(n) {
    if (n && typeof n === "object") return String(n.TenNhom || "");
    return String(n ?? "");
  }

  function groupList(data) {
    return (data.nhom || []).map(groupName).filter(Boolean);
  }

  function cardHTML(p) {
    const img = p.anh ? p.anh : window.VanPhat.placeholderSvg();
    const price = window.VanPhat.formatPrice(p.gia);
    return `
      <article class="product-card"
        data-ma="${escapeAttr(p.ma)}"
        data-ten="${escapeAttr(p.ten)}"
        data-gia="${escapeAttr(p.gia)}"
        data-dvt="${escapeAttr(p.dvt)}"
        data-anh="${escapeAttr(p.anh || "")}"
        data-nhom="${escapeAttr(p.nhom)}">
        <div class="product-img">
          <img src="${escapeAttr(img)}" alt="${escapeAttr(p.ten)}" loading="lazy"
               onerror="VanPhat.onImgError(this)" />
        </div>
        <div class="product-body">
          <div class="product-nhom">${escapeHtml(p.nhom)}</div>
          <h3 class="product-name">${escapeHtml(p.ten)}</h3>
          <div class="product-dvt">ĐVT: ${escapeHtml(p.dvt || "—")}</div>
          <div class="product-price">${price}</div>
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

  /* ---- Homepage: featured products with real images ---- */
  async function initFeatured() {
    const grid = document.getElementById("featured-products");
    if (!grid) return;
    try {
      const data = await loadData();
      const withImg = data.sanpham.filter((p) => p.anh && p.anh.trim());
      // diversify by group
      const byGroup = {};
      withImg.forEach((p) => {
        if (!byGroup[p.nhom]) byGroup[p.nhom] = [];
        byGroup[p.nhom].push(p);
      });
      const picked = [];
      const groups = Object.keys(byGroup);
      let i = 0;
      while (picked.length < 8 && groups.some((g) => byGroup[g].length)) {
        const g = groups[i % groups.length];
        if (byGroup[g].length) picked.push(byGroup[g].shift());
        i++;
      }
      grid.innerHTML = picked.map(cardHTML).join("");
    } catch (e) {
      grid.innerHTML = `<div class="empty-state"><h3>Không tải được sản phẩm</h3><p>${escapeHtml(e.message)}</p></div>`;
    }
  }

  /* ---- Category counts on homepage ---- */
  async function initCategoryCounts() {
    const els = document.querySelectorAll("[data-nhom-count]");
    if (!els.length) return;
    try {
      const data = await loadData();
      const counts = {};
      data.sanpham.forEach((p) => {
        counts[p.nhom] = (counts[p.nhom] || 0) + 1;
      });
      els.forEach((el) => {
        const n = el.getAttribute("data-nhom-count");
        const c = counts[n] || 0;
        el.textContent = c + " sản phẩm";
      });
    } catch (_) {}
  }

  /* ---- Catalog page ---- */
  async function initCatalog() {
    const grid = document.getElementById("product-grid");
    if (!grid) return;

    const searchInput = document.getElementById("search-input");
    const groupSelect = document.getElementById("group-select");
    const chipRow = document.getElementById("chip-row");
    const countEl = document.getElementById("result-count");

    let all = [];
    let currentGroup = "";
    let currentQuery = "";

    // URL params
    const params = new URLSearchParams(location.search);
    if (params.get("nhom")) currentGroup = params.get("nhom");
    if (params.get("q")) currentQuery = params.get("q");

    function render() {
      let list = all;
      if (currentGroup) {
        list = list.filter((p) => p.nhom === currentGroup);
      }
      if (currentQuery) {
        const q = currentQuery.toLowerCase().trim();
        list = list.filter(
          (p) =>
            (p.ten || "").toLowerCase().includes(q) ||
            (p.ma || "").toLowerCase().includes(q) ||
            (p.nhom || "").toLowerCase().includes(q)
        );
      }
      if (countEl) {
        countEl.innerHTML = `<strong>${list.length}</strong> / ${all.length} sản phẩm`;
      }
      if (!list.length) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1">
            <h3>Không tìm thấy sản phẩm</h3>
            <p>Thử đổi từ khóa hoặc chọn nhóm khác.</p>
          </div>`;
        return;
      }
      grid.innerHTML = list.map(cardHTML).join("");
    }

    function syncUI() {
      if (searchInput) searchInput.value = currentQuery;
      if (groupSelect) groupSelect.value = currentGroup;
      if (chipRow) {
        chipRow.querySelectorAll(".chip").forEach((c) => {
          c.classList.toggle("active", c.dataset.nhom === currentGroup);
        });
      }
    }

    function setGroup(g) {
      currentGroup = g || "";
      syncUI();
      render();
      const url = new URL(location.href);
      if (currentGroup) url.searchParams.set("nhom", currentGroup);
      else url.searchParams.delete("nhom");
      history.replaceState(null, "", url);
    }

    try {
      const data = await loadData();
      all = data.sanpham || [];
      const groups = groupList(data);

      if (groupSelect) {
        const opts = [`<option value="">Tất cả nhóm</option>`]
          .concat(
            groups.map(
              (n) => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`
            )
          )
          .join("");
        groupSelect.innerHTML = opts;
        groupSelect.addEventListener("change", () => setGroup(groupSelect.value));
      }

      if (chipRow) {
        const chips = [`<button type="button" class="chip" data-nhom="">Tất cả</button>`]
          .concat(
            groups.map(
              (n) =>
                `<button type="button" class="chip" data-nhom="${escapeAttr(n)}">${escapeHtml(n)}</button>`
            )
          )
          .join("");
        chipRow.innerHTML = chips;
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
    initCategoryCounts();
    initCatalog();
  });
})();
