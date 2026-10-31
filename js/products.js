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

  function pictureHTML(url, alt) {
    const src = url || window.VanPhat.placeholderSvg();
    const webp = window.VanPhat.driveImage(src, 480, true);
    const jpeg = window.VanPhat.driveImage(src, 480, false);
    const shown = webp || jpeg;
    const onerror =
      webp && webp !== jpeg
        ? "if(!this.dataset.fb){this.dataset.fb='1';this.src='" + jpeg.replace(/'/g, "") + "'}else{VanPhat.onImgError(this)}"
        : "VanPhat.onImgError(this)";
    return `<img src="${escapeAttr(shown)}" alt="${escapeAttr(alt)}" width="400" height="400" loading="lazy" decoding="async" onerror="${escapeAttr(onerror)}" />`;
  }

  function factAttrs(p) {
    const brand = String((p && p.thuongHieu) || "").trim();
    const spec = String((p && p.quyCach) || "").trim();
    return (
      (brand ? ` data-thuong-hieu="${escapeAttr(brand)}"` : "") +
      (spec ? ` data-quy-cach="${escapeAttr(spec)}"` : "")
    );
  }

  function cardHTML(p, lvMap) {
    const priced = Number(p.gia) > 0;
    const price = priced ? window.VanPhat.formatPrice(p.gia) : "Liên hệ báo giá";
    const zalo = "https://zalo.me/" + String(window.VanPhat.HOTLINE_TEL || "0335652832").replace(/\s+/g, "");
    const cartBtn = priced
      ? `<button type="button" class="btn btn-add-cart" data-add-cart>Thêm vào giỏ</button>`
      : `<a class="btn btn-add-cart" data-add-cart href="${escapeAttr(zalo)}" target="_blank" rel="noopener">Chat Zalo</a>`;
    const href = productHref(p);
    const badge = badgeLabel(p, lvMap);
    const hot = window.VanPhatBanChay && window.VanPhatBanChay.isHot && window.VanPhatBanChay.isHot(p.ma);
    const hotAttr = hot ? ' data-hot="1"' : "";
    const hotHtml = hot
      ? '<span class="product-hot" aria-label="Hot · Bán chạy"><span class="product-hot-short">Hot</span><span class="product-hot-full">Hot · Bán chạy</span></span>'
      : "";
    return `
      <article class="product-card"${hotAttr}
        data-ma="${escapeAttr(p.ma)}"
        data-ten="${escapeAttr(p.ten)}"
        data-gia="${escapeAttr(p.gia)}"
        data-dvt="${escapeAttr(p.dvt)}"
        data-anh="${escapeAttr(p.anh || "")}"
        data-nhom="${escapeAttr(p.nhom)}"
        data-linh-vuc-id="${escapeAttr(p.linhVucId || "")}"${factAttrs(p)}>
        <div class="product-img" data-product-zoom role="button" tabindex="0"
             aria-label="Xem ảnh lớn: ${escapeAttr(p.ten)}" title="Xem ảnh lớn">
          ${hotHtml}
          ${pictureHTML(p.anh, p.ten)}
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
            ${cartBtn}
          </div>
        </div>
      </article>`;
  }

  function matchesQuery(p, qRaw) {
    const q = String(qRaw || "").trim();
    if (!q) return true;
    const f = fold(q);
    const hay = fold([p.ma, p.ten, p.thuongHieu, p.quyCach, p.nhom, p.linhVucTen].filter(Boolean).join(" "));
    const raw = [p.ma, p.ten, p.thuongHieu, p.quyCach, p.nhom, p.linhVucTen].filter(Boolean).join(" ").toLowerCase();
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
    const sortSelect = document.getElementById("sort-select");
    const chipRow = document.getElementById("chip-row");
    const lvRow = document.getElementById("lv-row");
    const activeFilters = document.getElementById("active-filters");
    const countEl = document.getElementById("result-count");
    const crumb = document.getElementById("catalog-crumb");
    const navForm = document.querySelector("header form.nav-search");
    const navInput = navForm ? navForm.querySelector('input[type="search"], input[name="q"]') : null;
    const filterOpen = document.getElementById("filter-open");
    const filterSheet = document.getElementById("filter-sheet");
    const filterBody = document.getElementById("filter-sheet-body");
    const groupLabel = document.querySelector('label[for="group-select"]');
    const sortLabel = document.querySelector('label[for="sort-select"]');
    const mobileQuery = window.matchMedia("(max-width: 768px)");
    const filterSlots = [
      { node: chipRow, parent: chipRow && chipRow.parentNode, before: groupLabel },
      { node: groupLabel, parent: groupLabel && groupLabel.parentNode, before: null },
      { node: sortLabel, parent: sortLabel && sortLabel.parentNode, before: null },
    ];
    const SORTS = {
      "price-asc": "Giá thấp đến cao",
      "price-desc": "Giá cao đến thấp",
      name: "Tên A → Z",
    };

    let data = null;
    let all = [];
    let lvMap = {};
    let currentGroup = "";
    let currentLv = "";
    let currentQuery = "";
    let currentSort = "";
    let codeFilter = null;

    const params = new URLSearchParams(location.search);
    if (params.get("nhom")) currentGroup = params.get("nhom");
    if (params.get("lv")) currentLv = params.get("lv");
    if (params.get("q")) currentQuery = params.get("q");
    if (params.get("sort") && SORTS[params.get("sort")]) currentSort = params.get("sort");

    function currentGroups() {
      return groupsForLv(data, currentLv);
    }

    function countMatching(lvId, group) {
      let count = 0;
      all.forEach((p) => {
        if (lvId && p.linhVucId !== lvId) return;
        if (group && p.nhom !== group) return;
        if (currentQuery && !matchesQuery(p, currentQuery)) return;
        count += 1;
      });
      return count;
    }

    function countInGroup(name) {
      return countMatching(currentLv, name);
    }

    function chipFace(name, countText) {
      const count = countText
        ? `<span class="chip-count">${escapeHtml(countText)}</span>`
        : "";
      return `<span class="chip-name">${escapeHtml(name)}</span>${count}`;
    }

    function applySort(list) {
      const items = list.slice();
      const byName = (a, b) => String(a.ten || "").localeCompare(String(b.ten || ""), "vi");
      if (currentSort === "name") {
        items.sort(byName);
        return items;
      }
      if (currentSort === "price-asc" || currentSort === "price-desc") {
        const dir = currentSort === "price-asc" ? 1 : -1;
        items.sort((a, b) => {
          const pa = Number(a.gia) > 0 ? Number(a.gia) : null;
          const pb = Number(b.gia) > 0 ? Number(b.gia) : null;
          if (pa == null && pb == null) return byName(a, b);
          if (pa == null) return 1;
          if (pb == null) return -1;
          if (pa !== pb) return (pa - pb) * dir;
          return byName(a, b);
        });
        return items;
      }
      if (currentQuery) {
        items.sort(
          (a, b) => rank(b, currentQuery) - rank(a, currentQuery) || String(a.ma).localeCompare(String(b.ma))
        );
      }
      return items;
    }

    function knownCodeList(codes) {
      const seen = new Set();
      const list = [];
      (codes || []).forEach((code) => {
        const ma = String(code || "").trim().toUpperCase();
        if (!ma || seen.has(ma)) return;
        if (!all.some((p) => String(p.ma || "").toUpperCase() === ma)) return;
        seen.add(ma);
        list.push(ma);
      });
      return list;
    }

    function filtered() {
      if (codeFilter && codeFilter.length) {
        const order = new Map(codeFilter.map((ma, i) => [ma, i]));
        return all
          .filter((p) => order.has(String(p.ma || "").toUpperCase()))
          .sort(
            (a, b) =>
              order.get(String(a.ma).toUpperCase()) - order.get(String(b.ma).toUpperCase())
          );
      }
      let list = all;
      if (currentLv) list = list.filter((p) => p.linhVucId === currentLv);
      if (currentGroup) list = list.filter((p) => p.nhom === currentGroup);
      if (currentQuery) list = list.filter((p) => matchesQuery(p, currentQuery));
      return applySort(list);
    }

    function paintChip(chip, name, countText) {
      const nameEl = chip.querySelector(".chip-name");
      const countElChip = chip.querySelector(".chip-count");
      if (!nameEl) {
        chip.innerHTML = chipFace(name, countText);
        return;
      }
      nameEl.textContent = name;
      if (countText) {
        if (countElChip) countElChip.textContent = countText;
        else nameEl.insertAdjacentHTML("afterend", `<span class="chip-count">${escapeHtml(countText)}</span>`);
      } else if (countElChip) countElChip.remove();
    }

    function updateChipCounts() {
      if (!chipRow) return;
      chipRow.querySelectorAll(".chip").forEach((chip) => {
        const name = chip.dataset.nhom || "";
        if (!name) {
          paintChip(chip, "Tất cả", String(countMatching(currentLv, "")));
          return;
        }
        const group = currentGroups().find((item) => groupName(item) === name);
        const count = countInGroup(name);
        const countText = group && group.placeholder && !count ? "sắp có" : String(count);
        paintChip(chip, name, countText);
      });
    }

    function updateLvCounts() {
      if (!lvRow) return;
      lvRow.querySelectorAll("[data-lv]").forEach((chip) => {
        const id = chip.getAttribute("data-lv") || "";
        const lv = id ? visibleLinhVuc(data).find((item) => item.id === id) : null;
        const name = lv ? lv.tenNgan || lv.ten : "Tất cả";
        paintChip(chip, name, String(countMatching(id, "")));
      });
    }

    function renderActive() {
      if (!activeFilters || !data) return;
      const chips = [];
      if (currentQuery) chips.push({ key: "q", label: "Từ khóa: " + currentQuery });
      if (currentLv) {
        const lv = visibleLinhVuc(data).find((item) => item.id === currentLv);
        chips.push({ key: "lv", label: lv ? lv.ten : currentLv });
      }
      if (currentGroup) chips.push({ key: "nhom", label: currentGroup });
      if (currentSort) chips.push({ key: "sort", label: SORTS[currentSort] });
      if (!chips.length) {
        activeFilters.hidden = true;
        activeFilters.innerHTML = "";
        return;
      }
      activeFilters.hidden = false;
      activeFilters.innerHTML =
        chips
          .map(
            (chip) =>
              `<button type="button" class="chip active" data-clear="${escapeAttr(chip.key)}" aria-label="Bỏ ${escapeAttr(chip.label)}">${escapeHtml(chip.label)} <span aria-hidden="true">×</span></button>`
          )
          .join("") +
        '<button type="button" class="chip" data-clear="all">Xóa lọc</button>';
    }

    function render() {
      const list = filtered();
      renderActive();
      updateChipCounts();
      updateLvCounts();
      if (countEl) {
        const q = currentQuery ? ` cho “${escapeHtml(currentQuery)}”` : "";
        if (mobileQuery.matches) {
          countEl.innerHTML = `<strong>${list.length}</strong>/${all.length}`;
        } else if (currentQuery) {
          countEl.innerHTML = `<strong>${list.length}</strong> kết quả cho “${escapeHtml(currentQuery)}”`;
        } else {
          countEl.innerHTML = `<strong>${list.length}</strong> sản phẩm`;
        }
        countEl.setAttribute(
          "aria-label",
          `${list.length} trên ${all.length} sản phẩm${currentQuery ? ` cho ${currentQuery}` : ""}`
        );
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
      if (codeFilter && codeFilter.length) {
        const set = new Set(codeFilter);
        grid.querySelectorAll(".product-card").forEach((card) => {
          if (set.has((card.getAttribute("data-ma") || "").toUpperCase())) card.classList.add("vp-chat-hit");
        });
      }
    }

    function writeUrl() {
      const url = new URL(location.href);
      if (currentLv) url.searchParams.set("lv", currentLv);
      else url.searchParams.delete("lv");
      if (currentGroup) url.searchParams.set("nhom", currentGroup);
      else url.searchParams.delete("nhom");
      if (currentQuery) url.searchParams.set("q", currentQuery);
      else url.searchParams.delete("q");
      if (currentSort) url.searchParams.set("sort", currentSort);
      else url.searchParams.delete("sort");
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

    function sheetIsOpen() {
      return !!(filterSheet && !filterSheet.hidden);
    }

    function restoreFilterSlots() {
      filterSlots.forEach((slot) => {
        if (!slot.node || !slot.parent) return;
        if (slot.before && slot.before.parentNode === slot.parent) slot.parent.insertBefore(slot.node, slot.before);
        else slot.parent.appendChild(slot.node);
      });
    }

    function updateFilterButton() {
      if (!filterOpen) return;
      const n = (currentGroup ? 1 : 0) + (currentSort ? 1 : 0);
      filterOpen.classList.toggle("is-on", n > 0);
      filterOpen.setAttribute("aria-expanded", sheetIsOpen() ? "true" : "false");
      filterOpen.setAttribute("aria-label", n ? `Lọc, ${n} mục đang bật` : "Lọc nhóm và sắp xếp");
      filterOpen.replaceChildren(document.createTextNode("Lọc"));
      if (n) {
        const badge = document.createElement("span");
        badge.className = "filter-open-count";
        badge.textContent = String(n);
        filterOpen.append(" ", badge);
      }
    }

    function suggestBox() {
      return document.querySelector("header form.nav-search .search-suggest, .search-suggest.catalog-suggest-floating");
    }

    function placeSuggest() {
      const box = suggestBox();
      if (!box || !navForm) return;
      const catalogMobile = document.body.classList.contains("page-catalog") && mobileQuery.matches;
      if (catalogMobile) {
        box.classList.add("catalog-suggest-floating");
        if (box.parentElement !== document.body) document.body.appendChild(box);
        syncCatalogStack();
      } else if (box.classList.contains("catalog-suggest-floating")) {
        box.classList.remove("catalog-suggest-floating");
        navForm.appendChild(box);
      }
    }

    function syncCatalogStack() {
      const bar = document.querySelector(".toolbar");
      if (!bar) return;
      const bottom = Math.ceil(bar.getBoundingClientRect().bottom);
      if (bottom > 0) document.documentElement.style.setProperty("--catalog-stack-b", bottom + "px");
    }

    function openFilterSheet() {
      if (!filterSheet || !filterBody || !mobileQuery.matches) return;
      const box = suggestBox();
      if (box) box.hidden = true;
      filterSlots.forEach((slot) => {
        if (slot.node) filterBody.appendChild(slot.node);
      });
      filterSheet.hidden = false;
      document.body.classList.add("filter-sheet-open");
      updateFilterButton();
      const closeBtn = filterSheet.querySelector(".filter-sheet-close");
      if (closeBtn) closeBtn.focus();
    }

    function closeFilterSheet() {
      if (!sheetIsOpen()) return;
      restoreFilterSlots();
      filterSheet.hidden = true;
      document.body.classList.remove("filter-sheet-open");
      updateFilterButton();
      placeCatalogChrome();
      if (filterOpen) filterOpen.focus();
    }

    function syncUI() {
      if (searchInput) searchInput.value = currentQuery;
      if (navInput && document.activeElement !== navInput) navInput.value = currentQuery;
      const groups = currentGroups();
      const names = groups.map(groupName);
      if (groupSelect) {
        const opts = ['<option value="">Tất cả nhóm</option>']
          .concat(names.map((n) => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`))
          .join("");
        groupSelect.innerHTML = opts;
        groupSelect.value = names.indexOf(currentGroup) >= 0 ? currentGroup : "";
      }
      if (sortSelect) sortSelect.value = currentSort;
      if (chipRow) {
        const chips = [
          `<button type="button" class="chip" data-nhom="">${chipFace("Tất cả", String(countMatching(currentLv, "")))}</button>`,
        ]
          .concat(
            groups.map((n) => {
              const name = groupName(n);
              const count = countInGroup(name);
              const countText = n.placeholder && !count ? "sắp có" : String(count);
              return `<button type="button" class="chip" data-nhom="${escapeAttr(name)}">${chipFace(name, countText)}</button>`;
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
      updateFilterButton();
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

    function setSort(value) {
      currentSort = SORTS[value] ? value : "";
      syncUI();
      render();
      writeUrl();
    }

    function applyChatCodes(codes) {
      const list = knownCodeList(codes);
      if (!list.length) return;
      codeFilter = list;
      currentLv = "";
      currentGroup = "";
      currentQuery = list.join(" ");
      syncUI();
      render();
      writeUrl();
    }

    function clearFilter(key) {
      if (key === "all" || key === "q") {
        currentQuery = "";
        codeFilter = null;
      }
      if (key === "all" || key === "lv") currentLv = "";
      if (key === "all" || key === "nhom") currentGroup = "";
      if (key === "all" || key === "sort") currentSort = "";
      if ((key === "all" || key === "lv") && currentGroup) {
        const names = new Set(currentGroups().map(groupName));
        if (!names.has(currentGroup)) currentGroup = "";
      }
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
        const chips = [
          `<button type="button" class="chip" data-lv="" role="tab">${chipFace("Tất cả", String(countMatching("", "")))}</button>`,
        ]
          .concat(
            visibleLinhVuc(data).map((lv) => {
              const name = lv.tenNgan || lv.ten;
              return `<button type="button" class="chip" role="tab" data-lv="${escapeAttr(lv.id)}" title="${escapeAttr(lv.ten)}">${chipFace(name, String(countMatching(lv.id, "")))}</button>`;
            })
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
      if (sortSelect) {
        sortSelect.addEventListener("change", () => setSort(sortSelect.value));
      }
      if (activeFilters) {
        activeFilters.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-clear]");
          if (!btn) return;
          clearFilter(btn.dataset.clear || "");
        });
      }
      if (chipRow) {
        chipRow.addEventListener("click", (e) => {
          const btn = e.target.closest(".chip");
          if (!btn) return;
          setGroup(btn.dataset.nhom || "");
        });
      }
      let queryTimer;
      function commitQuery(value) {
        codeFilter = null;
        currentQuery = value;
        if (searchInput && document.activeElement !== searchInput) searchInput.value = value;
        if (navInput && document.activeElement !== navInput) navInput.value = value;
        render();
        syncCrumb();
        writeUrl();
      }
      function scheduleQuery(value) {
        clearTimeout(queryTimer);
        queryTimer = setTimeout(() => commitQuery(value), 180);
      }
      if (searchInput) {
        searchInput.addEventListener("input", () => scheduleQuery(searchInput.value));
        searchInput.addEventListener("change", () => {
          if (window.VanPhatData && window.VanPhatData.saveRecentSearch) {
            window.VanPhatData.saveRecentSearch(searchInput.value);
          }
        });
      }
      if (navInput) {
        navInput.addEventListener("input", () => scheduleQuery(navInput.value));
      }
      if (navForm) {
        navForm.addEventListener("submit", (event) => {
          if (!document.getElementById("product-grid")) return;
          event.preventDefault();
          clearTimeout(queryTimer);
          commitQuery(navInput ? navInput.value : currentQuery);
          if (window.VanPhatData && window.VanPhatData.saveRecentSearch && navInput) {
            window.VanPhatData.saveRecentSearch(navInput.value);
          }
        });
      }
      if (filterOpen && filterSheet) {
        filterOpen.addEventListener("click", () => {
          if (sheetIsOpen()) closeFilterSheet();
          else openFilterSheet();
        });
        filterSheet.addEventListener("click", (event) => {
          if (event.target.closest("[data-filter-close]")) closeFilterSheet();
        });
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && sheetIsOpen()) {
            event.preventDefault();
            closeFilterSheet();
          }
        });
        window.addEventListener("resize", () => {
          if (sheetIsOpen() && !mobileQuery.matches) closeFilterSheet();
          placeCatalogChrome();
          placeSuggest();
        });
      }
      if (navForm) {
        const suggestWatch = new MutationObserver(() => placeSuggest());
        suggestWatch.observe(navForm, { childList: true });
        placeSuggest();
      }
      window.addEventListener("scroll", syncCatalogStack, { passive: true });
      syncCatalogStack();

      const queryParts = String(currentQuery || "").trim().split(/[\s,]+/).filter(Boolean);
      const fromQuery = knownCodeList(queryParts);
      if (queryParts.length > 1 && fromQuery.length === queryParts.length) codeFilter = fromQuery;

      window.VanPhatCatalog = window.VanPhatCatalog || {};
      window.VanPhatCatalog.showCodes = applyChatCodes;
      if (window.VanPhatCatalog._pendingCodes) {
        applyChatCodes(window.VanPhatCatalog._pendingCodes);
        window.VanPhatCatalog._pendingCodes = null;
      }

      syncUI();
      render();
    } catch (e) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>Lỗi tải dữ liệu</h3><p>${escapeHtml(e.message)}</p></div>`;
    }
  }

  function fitCatalogSide() {
    const side = document.querySelector("body.page-catalog .catalog-side");
    if (!side) return;
    if (window.matchMedia("(max-width: 768px)").matches) {
      side.style.maxHeight = "";
      return;
    }
    const top = side.getBoundingClientRect().top;
    const avail = Math.max(160, Math.floor(window.innerHeight - Math.max(top, 0) - 12));
    side.style.maxHeight = avail + "px";
  }

  function placeCatalogChrome() {
    if (!document.body || !document.body.classList.contains("page-catalog")) return;
    const row = document.getElementById("lv-row");
    const box = document.querySelector(".toolbar > .container");
    const inner = document.querySelector(".toolbar-inner");
    const lvHome = document.getElementById("side-lv-home");
    if (!row || !box || !lvHome) return;
    const mobile = window.matchMedia("(max-width: 768px)").matches;
    if (mobile) {
      if (row.parentElement !== box) box.insertBefore(row, inner || null);
    } else if (row.parentElement !== lvHome) {
      lvHome.appendChild(row);
    }
    fitCatalogSide();
  }

  if (!window.__vpSideFit) {
    window.__vpSideFit = true;
    window.addEventListener("scroll", fitCatalogSide, { passive: true });
    window.addEventListener("resize", fitCatalogSide);
  }

  placeCatalogChrome();

  document.addEventListener("DOMContentLoaded", () => {
    initFeatured();
    initCatalog();
  });
})();
