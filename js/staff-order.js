/* Vạn Phát — staff counter order (sell price only, never cost) */
(function () {
  const STORAGE_KEY = "vanphat_staff_cart";
  const ORDER_EMAIL = "congtytnhhvanphat999@gmail.com";
  const DATA_URL = "data/products.json";

  // Optional: set after deploying gas/StaffOrderInbox.gs as Web app (Anyone).
  // Example: "https://script.google.com/macros/s/XXXX/exec"
  const STAFF_INBOX_GAS_URL = "";

  // Optional PIN gate. Leave "" to disable.
  const STAFF_PIN = "";

  const PIN_SESSION_KEY = "vanphat_staff_pin_ok";

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

  function formatPrice(n) {
    if (window.VanPhat && window.VanPhat.formatPrice) {
      return window.VanPhat.formatPrice(n);
    }
    return (Number(n) || 0).toLocaleString("vi-VN") + " ₫";
  }

  function placeholder() {
    if (window.VanPhat && window.VanPhat.placeholderSvg) {
      return window.VanPhat.placeholderSvg();
    }
    return "";
  }

  function groupName(n) {
    if (n && typeof n === "object") return String(n.TenNhom || "");
    return String(n ?? "");
  }

  function groupList(data) {
    return (data.nhom || []).map(groupName).filter(Boolean);
  }

  /** Public catalog fields only — never expose cost/giá vốn. */
  function sanitizeProduct(p) {
    return {
      nhom: p.nhom || "",
      ma: String(p.ma || ""),
      ten: p.ten || "",
      dvt: p.dvt || "",
      gia: Number(p.gia) || 0,
      anh: p.anh || "",
      ton: Number(p.ton) || 0,
    };
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  let items = loadCart();
  let allProducts = [];
  let currentGroup = "";
  let currentQuery = "";

  function getTotal() {
    return items.reduce(
      (sum, it) => sum + (Number(it.gia) || 0) * (Number(it.qty) || 0),
      0
    );
  }

  function add(product, qty) {
    const q = Math.max(1, Math.min(9999, Number(qty) || 1));
    const ma = String(product.ma || "");
    if (!ma) return;
    const existing = items.find((it) => it.ma === ma);
    if (existing) {
      existing.qty = Math.min(9999, (Number(existing.qty) || 0) + q);
    } else {
      items.push({
        ma,
        ten: product.ten || "",
        gia: Number(product.gia) || 0,
        dvt: product.dvt || "",
        anh: product.anh || "",
        nhom: product.nhom || "",
        qty: q,
      });
    }
    saveCart();
    renderCart();
    showToast("Đã thêm vào đơn");
  }

  function remove(ma) {
    items = items.filter((it) => it.ma !== ma);
    saveCart();
    renderCart();
  }

  function setQty(ma, qty) {
    const it = items.find((x) => x.ma === ma);
    if (!it) return;
    const q = Math.max(0, Math.min(9999, Number(qty) || 0));
    if (q <= 0) {
      remove(ma);
      return;
    }
    it.qty = q;
    saveCart();
    renderCart();
  }

  function clearCart() {
    items = [];
    saveCart();
    renderCart();
  }

  function makeOrderId() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return (
      "NV" +
      d.getFullYear().toString().slice(-2) +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      "-" +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds())
    );
  }

  function buildOrderText(meta) {
    const lines = [
      "*Đơn NV Vạn Phát*",
      "Mã đơn: " + meta.orderId,
      "",
      "Nhân viên: " + meta.staff,
      "Cửa hàng: " + (meta.shop || "(không ghi)"),
      "Khách hàng: " + (meta.customer || "(không ghi)"),
      "SĐT: " + meta.phone,
    ];
    if (meta.note) lines.push("Ghi chú: " + meta.note);
    lines.push("", "— Chi tiết —");
    items.forEach((it, i) => {
      const lineTotal = (Number(it.gia) || 0) * (Number(it.qty) || 0);
      lines.push(
        i +
          1 +
          ". [" +
          (it.ma || "") +
          "] " +
          (it.ten || "") +
          " × " +
          it.qty +
          " " +
          (it.dvt || "") +
          " @ " +
          formatPrice(it.gia) +
          " = " +
          formatPrice(lineTotal)
      );
    });
    lines.push("", "*Tổng: " + formatPrice(getTotal()) + "*");
    return lines.join("\n");
  }

  function getMeta() {
    const staffEl = document.getElementById("staff-name");
    const shopEl = document.getElementById("staff-shop");
    const customerEl = document.getElementById("staff-customer");
    const phoneEl = document.getElementById("staff-phone");
    const noteEl = document.getElementById("staff-note");

    const staff = (staffEl && staffEl.value.trim()) || "";
    const phone = (phoneEl && phoneEl.value.trim()) || "";

    if (!staff) {
      if (staffEl) {
        staffEl.focus();
        staffEl.classList.add("is-invalid");
      }
      showToast("Vui lòng nhập tên nhân viên");
      return null;
    }
    if (staffEl) staffEl.classList.remove("is-invalid");

    if (!phone) {
      if (phoneEl) {
        phoneEl.focus();
        phoneEl.classList.add("is-invalid");
      }
      showToast("Vui lòng nhập số điện thoại");
      return null;
    }
    if (phoneEl) phoneEl.classList.remove("is-invalid");

    if (!items.length) {
      showToast("Đơn trống — thêm sản phẩm trước");
      return null;
    }

    return {
      staff,
      shop: shopEl ? shopEl.value.trim() : "",
      customer: customerEl ? customerEl.value.trim() : "",
      phone,
      note: noteEl ? noteEl.value.trim() : "",
      orderId: makeOrderId(),
      total: getTotal(),
    };
  }

  async function submitOrder(btn) {
    const meta = getMeta();
    if (!meta) return;

    const original = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Đang gửi…";
    }

    const orderText = buildOrderText(meta);
    const payload = {
      _subject: "[NV] Đơn " + meta.orderId + " — " + meta.staff + " / " + meta.phone,
      _template: "table",
      _captcha: "false",
      staff: meta.staff,
      shop: meta.shop || "",
      customer: meta.customer || "",
      phone: meta.phone,
      note: meta.note || "",
      order: orderText,
      total: formatPrice(meta.total),
      orderId: meta.orderId,
      source: "staff",
    };

    let emailOk = false;
    try {
      const res = await fetch("https://formsubmit.co/ajax/" + ORDER_EMAIL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) emailOk = true;
    } catch (_) {}

    // Secondary: Apps Script inbox (optional)
    if (STAFF_INBOX_GAS_URL) {
      const gasBody = {
        orderId: meta.orderId,
        staff: meta.staff,
        shop: meta.shop,
        customer: meta.customer,
        phone: meta.phone,
        note: meta.note,
        total: meta.total,
        source: "staff",
        items: items.map((it) => ({
          ma: it.ma,
          ten: it.ten,
          dvt: it.dvt,
          qty: Number(it.qty) || 0,
          gia: Number(it.gia) || 0,
          thanhTien: (Number(it.gia) || 0) * (Number(it.qty) || 0),
        })),
      };
      try {
        await fetch(STAFF_INBOX_GAS_URL, {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(gasBody),
        });
      } catch (_) {}
    }

    if (emailOk) {
      showToast("Đã gửi đơn NV về email công ty");
      clearCart();
      const noteEl = document.getElementById("staff-note");
      if (noteEl) noteEl.value = "";
    } else {
      const subject = encodeURIComponent(payload._subject);
      const body = encodeURIComponent(orderText);
      window.location.href =
        "mailto:" + ORDER_EMAIL + "?subject=" + subject + "&body=" + body;
      showToast("Mở email để gửi đơn cho công ty");
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = original || "Chốt đơn · Gửi email";
    }
  }

  function cardHTML(p) {
    const img = p.anh ? p.anh : placeholder();
    const price = formatPrice(p.gia);
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
          <div class="product-meta-row">
            <span class="product-dvt">ĐVT: ${escapeHtml(p.dvt || "—")}</span>
            <span class="product-ma">${escapeHtml(p.ma || "")}</span>
          </div>
          <div class="product-price"><span class="price-label">Giá bán</span> ${price}</div>
          <div class="product-actions">
            <div class="qty-control">
              <button type="button" class="qty-btn" data-staff-qty-minus aria-label="Giảm số lượng">−</button>
              <input type="number" class="qty-input" value="1" min="1" max="9999" data-staff-qty-input aria-label="Số lượng" />
              <button type="button" class="qty-btn" data-staff-qty-plus aria-label="Tăng số lượng">+</button>
            </div>
            <button type="button" class="btn btn-add-cart" data-staff-add>Thêm vào đơn</button>
          </div>
        </div>
      </article>`;
  }

  function renderCatalog() {
    const grid = document.getElementById("staff-product-grid");
    const countEl = document.getElementById("staff-result-count");
    if (!grid) return;

    let list = allProducts;
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
      countEl.innerHTML =
        `<strong>${list.length}</strong> / ${allProducts.length} sản phẩm`;
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

  function syncFilterUI() {
    const searchInput = document.getElementById("staff-search");
    const groupSelect = document.getElementById("staff-group");
    const chipRow = document.getElementById("staff-chip-row");
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
    syncFilterUI();
    renderCatalog();
  }

  function renderCart() {
    const body = document.getElementById("staff-cart-body");
    const totalEl = document.getElementById("staff-cart-total");
    const countEl = document.getElementById("staff-cart-count");
    const clearBtn = document.getElementById("staff-clear-cart");

    if (countEl) {
      countEl.textContent = items.length + " dòng";
    }
    if (clearBtn) {
      clearBtn.hidden = items.length === 0;
    }
    if (totalEl) totalEl.textContent = formatPrice(getTotal());

    if (!body) return;
    if (!items.length) {
      body.innerHTML =
        '<tr class="staff-cart-empty-row"><td colspan="8">Chưa có sản phẩm — chọn từ catalog bên trái.</td></tr>';
      return;
    }

    body.innerHTML = items
      .map((it, i) => {
        const line = (Number(it.gia) || 0) * (Number(it.qty) || 0);
        return `
        <tr data-ma="${escapeAttr(it.ma)}">
          <td>${i + 1}</td>
          <td><code>${escapeHtml(it.ma)}</code></td>
          <td class="staff-td-ten">${escapeHtml(it.ten)}</td>
          <td>${escapeHtml(it.dvt || "—")}</td>
          <td>
            <div class="qty-control qty-control-sm">
              <button type="button" class="qty-btn" data-cart-minus data-ma="${escapeAttr(it.ma)}" aria-label="Giảm">−</button>
              <input type="number" class="qty-input" data-cart-qty data-ma="${escapeAttr(it.ma)}" value="${Number(it.qty) || 1}" min="1" max="9999" />
              <button type="button" class="qty-btn" data-cart-plus data-ma="${escapeAttr(it.ma)}" aria-label="Tăng">+</button>
            </div>
          </td>
          <td class="staff-td-num">${formatPrice(it.gia)}</td>
          <td class="staff-td-num">${formatPrice(line)}</td>
          <td>
            <button type="button" class="cart-item-remove" data-cart-remove data-ma="${escapeAttr(it.ma)}" aria-label="Xóa">Xóa</button>
          </td>
        </tr>`;
      })
      .join("");
  }

  function showToast(msg) {
    let toast = document.getElementById("cart-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "cart-toast";
      toast.className = "cart-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function productFromCard(card) {
    return {
      ma: card.getAttribute("data-ma") || "",
      ten: card.getAttribute("data-ten") || "",
      gia: Number(card.getAttribute("data-gia")) || 0,
      dvt: card.getAttribute("data-dvt") || "",
      anh: card.getAttribute("data-anh") || "",
      nhom: card.getAttribute("data-nhom") || "",
    };
  }

  function bindUI() {
    document.addEventListener("click", (e) => {
      const card = e.target.closest(".product-card");
      if (card) {
        const minus = e.target.closest("[data-staff-qty-minus]");
        if (minus) {
          const input = card.querySelector("[data-staff-qty-input]");
          if (input) input.value = Math.max(1, (Number(input.value) || 1) - 1);
          return;
        }
        const plus = e.target.closest("[data-staff-qty-plus]");
        if (plus) {
          const input = card.querySelector("[data-staff-qty-input]");
          if (input)
            input.value = Math.min(9999, (Number(input.value) || 1) + 1);
          return;
        }
        const addBtn = e.target.closest("[data-staff-add]");
        if (addBtn) {
          e.preventDefault();
          const input = card.querySelector("[data-staff-qty-input]");
          const qty = input ? Number(input.value) || 1 : 1;
          add(productFromCard(card), qty);
          return;
        }
      }

      const minus = e.target.closest("[data-cart-minus]");
      if (minus) {
        const ma = minus.getAttribute("data-ma");
        const it = items.find((x) => x.ma === ma);
        if (it) setQty(ma, (Number(it.qty) || 1) - 1);
        return;
      }
      const plus = e.target.closest("[data-cart-plus]");
      if (plus) {
        const ma = plus.getAttribute("data-ma");
        const it = items.find((x) => x.ma === ma);
        if (it) setQty(ma, (Number(it.qty) || 0) + 1);
        return;
      }
      const rm = e.target.closest("[data-cart-remove]");
      if (rm) {
        remove(rm.getAttribute("data-ma"));
        return;
      }
    });

    const cartBody = document.getElementById("staff-cart-body");
    if (cartBody) {
      cartBody.addEventListener("change", (e) => {
        const input = e.target.closest("[data-cart-qty]");
        if (!input) return;
        setQty(input.getAttribute("data-ma"), input.value);
      });
    }

    const submitBtn = document.getElementById("staff-submit");
    if (submitBtn) {
      submitBtn.addEventListener("click", () => submitOrder(submitBtn));
    }

    const clearBtn = document.getElementById("staff-clear-cart");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (items.length && confirm("Xóa toàn bộ dòng trong đơn?")) {
          clearCart();
        }
      });
    }

    // Persist staff name lightly
    const staffEl = document.getElementById("staff-name");
    if (staffEl) {
      try {
        const saved = localStorage.getItem("vanphat_staff_name");
        if (saved) staffEl.value = saved;
      } catch (_) {}
      staffEl.addEventListener("change", () => {
        try {
          localStorage.setItem("vanphat_staff_name", staffEl.value.trim());
        } catch (_) {}
      });
    }
  }

  async function initCatalog() {
    const grid = document.getElementById("staff-product-grid");
    const searchInput = document.getElementById("staff-search");
    const groupSelect = document.getElementById("staff-group");
    const chipRow = document.getElementById("staff-chip-row");

    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error("Không tải được dữ liệu sản phẩm");
      const data = await res.json();
      allProducts = (data.sanpham || []).map(sanitizeProduct);
      const groups = groupList(data);

      if (groupSelect) {
        groupSelect.innerHTML = [`<option value="">Tất cả nhóm</option>`]
          .concat(
            groups.map(
              (n) =>
                `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`
            )
          )
          .join("");
        groupSelect.addEventListener("change", () =>
          setGroup(groupSelect.value)
        );
      }

      if (chipRow) {
        chipRow.innerHTML = [`<button type="button" class="chip" data-nhom="">Tất cả</button>`]
          .concat(
            groups.map(
              (n) =>
                `<button type="button" class="chip" data-nhom="${escapeAttr(n)}">${escapeHtml(n)}</button>`
            )
          )
          .join("");
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
            renderCatalog();
          }, 180);
        });
      }

      syncFilterUI();
      renderCatalog();
    } catch (e) {
      if (grid) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>Lỗi tải dữ liệu</h3><p>${escapeHtml(e.message)}</p></div>`;
      }
    }
  }

  function setupPinGate() {
    const gate = document.getElementById("staff-pin-gate");
    const main = document.getElementById("staff-main");
    if (!STAFF_PIN) {
      if (gate) gate.hidden = true;
      return true;
    }
    try {
      if (sessionStorage.getItem(PIN_SESSION_KEY) === "1") {
        if (gate) gate.hidden = true;
        return true;
      }
    } catch (_) {}

    if (gate) gate.hidden = false;
    if (main) main.setAttribute("aria-hidden", "true");
    document.body.classList.add("staff-pin-locked");

    const input = document.getElementById("staff-pin-input");
    const btn = document.getElementById("staff-pin-submit");
    const err = document.getElementById("staff-pin-error");

    function tryUnlock() {
      const val = (input && input.value) || "";
      if (val === STAFF_PIN) {
        try {
          sessionStorage.setItem(PIN_SESSION_KEY, "1");
        } catch (_) {}
        if (gate) gate.hidden = true;
        if (main) main.removeAttribute("aria-hidden");
        document.body.classList.remove("staff-pin-locked");
        if (err) err.hidden = true;
        return true;
      }
      if (err) err.hidden = false;
      if (input) {
        input.classList.add("is-invalid");
        input.focus();
      }
      return false;
    }

    if (btn) btn.addEventListener("click", tryUnlock);
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") tryUnlock();
      });
    }
    return false;
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupPinGate();
    bindUI();
    renderCart();
    initCatalog();
  });
})();
