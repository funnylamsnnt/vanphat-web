/* Vạn Phát — shopping cart (localStorage + drawer checkout) */
(function () {
  const STORAGE_KEY = "vanphat_cart";
  const WA_NUMBER = "84335652832";

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

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function save(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  let items = load();

  function getItems() {
    return items.map((it) => ({ ...it }));
  }

  function getCount() {
    return items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  }

  function getTotal() {
    return items.reduce(
      (sum, it) => sum + (Number(it.gia) || 0) * (Number(it.qty) || 0),
      0
    );
  }

  function add(product, qty) {
    const q = Math.max(1, Math.min(999, Number(qty) || 1));
    const ma = String(product.ma || "");
    if (!ma) return;
    const existing = items.find((it) => it.ma === ma);
    if (existing) {
      existing.qty = Math.min(999, (Number(existing.qty) || 0) + q);
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
    save(items);
    render();
    showToast("Đã thêm vào giỏ");
  }

  function remove(ma) {
    items = items.filter((it) => it.ma !== ma);
    save(items);
    render();
  }

  function setQty(ma, qty) {
    const it = items.find((x) => x.ma === ma);
    if (!it) return;
    const q = Math.max(0, Math.min(999, Number(qty) || 0));
    if (q <= 0) {
      remove(ma);
      return;
    }
    it.qty = q;
    save(items);
    render();
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

  function ensureDrawer() {
    if (document.getElementById("cart-drawer")) return;

    const overlay = document.createElement("div");
    overlay.id = "cart-overlay";
    overlay.className = "cart-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const drawer = document.createElement("aside");
    drawer.id = "cart-drawer";
    drawer.className = "cart-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-labelledby", "cart-drawer-title");
    drawer.setAttribute("aria-hidden", "true");
    drawer.innerHTML = `
      <div class="cart-drawer-header">
        <h2 id="cart-drawer-title">Giỏ hàng</h2>
        <button type="button" class="cart-drawer-close" data-cart-close aria-label="Đóng">×</button>
      </div>
      <div class="cart-drawer-body" data-cart-list></div>
      <div class="cart-drawer-footer">
        <div class="cart-total-row">
          <span>Tổng cộng</span>
          <strong data-cart-total>0 ₫</strong>
        </div>
        <div class="cart-checkout" data-cart-checkout hidden>
          <label class="cart-field">
            <span>Họ tên</span>
            <input type="text" name="hoten" data-cart-name placeholder="Nguyễn Văn A" autocomplete="name" />
          </label>
          <label class="cart-field">
            <span>Số điện thoại <em>*</em></span>
            <input type="tel" name="sdt" data-cart-phone placeholder="09xx xxx xxx" required autocomplete="tel" />
          </label>
          <label class="cart-field">
            <span>Ghi chú</span>
            <textarea name="ghichu" data-cart-note rows="2" placeholder="Địa chỉ giao, thời gian…"></textarea>
          </label>
          <button type="button" class="btn btn-gold cart-btn-wa" data-cart-wa>
            Gửi qua Zalo/WhatsApp
          </button>
          <a class="btn btn-outline-navy cart-btn-order" data-cart-order href="#" target="_blank" rel="noopener">
            Mở hệ thống đặt hàng online
          </a>
        </div>
        <button type="button" class="btn btn-primary cart-btn-checkout" data-cart-show-checkout>
          Gửi đơn / Đặt hàng
        </button>
        <p class="cart-empty-hint" data-cart-empty-hint>Giỏ hàng trống — chọn sản phẩm để đặt hàng.</p>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    overlay.addEventListener("click", close);
    drawer.addEventListener("click", (e) => {
      if (e.target.closest("[data-cart-close]")) {
        close();
        return;
      }
      const showChk = e.target.closest("[data-cart-show-checkout]");
      if (showChk) {
        const panel = drawer.querySelector("[data-cart-checkout]");
        if (panel) {
          panel.hidden = false;
          showChk.hidden = true;
          const phone = drawer.querySelector("[data-cart-phone]");
          if (phone) phone.focus();
        }
        return;
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
      const wa = e.target.closest("[data-cart-wa]");
      if (wa) {
        sendWhatsApp();
        return;
      }
    });

    drawer.addEventListener("change", (e) => {
      const input = e.target.closest("[data-cart-qty]");
      if (!input) return;
      setQty(input.getAttribute("data-ma"), input.value);
    });
  }

  function open() {
    ensureDrawer();
    const drawer = document.getElementById("cart-drawer");
    const overlay = document.getElementById("cart-overlay");
    if (!drawer || !overlay) return;
    drawer.classList.add("open");
    overlay.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("cart-open");
    render();
  }

  function close() {
    const drawer = document.getElementById("cart-drawer");
    const overlay = document.getElementById("cart-overlay");
    if (drawer) {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
    }
    if (overlay) {
      overlay.classList.remove("open");
      overlay.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("cart-open");
  }

  function buildOrderText(name, phone, note) {
    const lines = [
      "*Đơn hàng Vạn Phát*",
      "",
      "Khách: " + (name || "(chưa ghi)"),
      "SĐT: " + phone,
    ];
    if (note) lines.push("Ghi chú: " + note);
    lines.push("", "— Chi tiết —");
    items.forEach((it, i) => {
      const lineTotal = (Number(it.gia) || 0) * (Number(it.qty) || 0);
      lines.push(
        i +
          1 +
          ". " +
          (it.ten || it.ma) +
          " (" +
          (it.ma || "") +
          ") × " +
          it.qty +
          " " +
          (it.dvt || "") +
          " — " +
          formatPrice(lineTotal)
      );
    });
    lines.push("", "*Tổng: " + formatPrice(getTotal()) + "*");
    lines.push("", "Hotline: 033 5652 832");
    return lines.join("\n");
  }

  function sendWhatsApp() {
    const drawer = document.getElementById("cart-drawer");
    if (!drawer || !items.length) return;
    const phoneEl = drawer.querySelector("[data-cart-phone]");
    const nameEl = drawer.querySelector("[data-cart-name]");
    const noteEl = drawer.querySelector("[data-cart-note]");
    const phone = (phoneEl && phoneEl.value.trim()) || "";
    if (!phone) {
      if (phoneEl) {
        phoneEl.focus();
        phoneEl.classList.add("is-invalid");
      }
      showToast("Vui lòng nhập số điện thoại");
      return;
    }
    if (phoneEl) phoneEl.classList.remove("is-invalid");
    const text = buildOrderText(
      nameEl ? nameEl.value.trim() : "",
      phone,
      noteEl ? noteEl.value.trim() : ""
    );
    const url = "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(text);
    window.open(url, "_blank", "noopener");
  }

  function renderList() {
    const list = document.querySelector("[data-cart-list]");
    if (!list) return;
    if (!items.length) {
      list.innerHTML =
        '<div class="cart-empty"><p>Chưa có sản phẩm nào.</p><a href="san-pham.html" class="btn btn-outline-navy btn-sm">Xem sản phẩm</a></div>';
      return;
    }
    list.innerHTML = items
      .map((it) => {
        const img = it.anh || placeholder();
        return `
        <div class="cart-item" data-ma="${escapeAttr(it.ma)}">
          <div class="cart-item-img">
            <img src="${escapeAttr(img)}" alt="" loading="lazy"
                 onerror="this.onerror=null;this.src=VanPhat.placeholderSvg()" />
          </div>
          <div class="cart-item-info">
            <div class="cart-item-name">${escapeHtml(it.ten)}</div>
            <div class="cart-item-meta">ĐVT: ${escapeHtml(it.dvt || "—")} · ${formatPrice(it.gia)}</div>
            <div class="cart-item-row">
              <div class="qty-control qty-control-sm">
                <button type="button" class="qty-btn" data-cart-minus data-ma="${escapeAttr(it.ma)}" aria-label="Giảm">−</button>
                <input type="number" class="qty-input" data-cart-qty data-ma="${escapeAttr(it.ma)}" value="${Number(it.qty) || 1}" min="1" max="999" />
                <button type="button" class="qty-btn" data-cart-plus data-ma="${escapeAttr(it.ma)}" aria-label="Tăng">+</button>
              </div>
              <button type="button" class="cart-item-remove" data-cart-remove data-ma="${escapeAttr(it.ma)}" aria-label="Xóa">Xóa</button>
            </div>
          </div>
        </div>`;
      })
      .join("");
  }

  function updateBadges() {
    const count = getCount();
    document.querySelectorAll("[data-cart-badge]").forEach((el) => {
      el.textContent = String(count);
      if (count > 0) {
        el.hidden = false;
        el.removeAttribute("hidden");
      } else {
        el.hidden = true;
        el.setAttribute("hidden", "");
      }
    });
  }

  function updateFooter() {
    const totalEl = document.querySelector("[data-cart-total]");
    if (totalEl) totalEl.textContent = formatPrice(getTotal());

    const hasItems = items.length > 0;
    const checkoutBtn = document.querySelector("[data-cart-show-checkout]");
    const checkoutPanel = document.querySelector("[data-cart-checkout]");
    const emptyHint = document.querySelector("[data-cart-empty-hint]");
    const orderLink = document.querySelector("[data-cart-order]");

    if (emptyHint) emptyHint.hidden = hasItems;
    if (checkoutBtn) {
      checkoutBtn.hidden = !hasItems || (checkoutPanel && !checkoutPanel.hidden);
    }
    if (checkoutPanel && !hasItems) {
      checkoutPanel.hidden = true;
      if (checkoutBtn) checkoutBtn.hidden = true;
    }
    if (orderLink && window.VanPhat && window.VanPhat.ORDER_URL) {
      orderLink.href = window.VanPhat.ORDER_URL;
    }
  }

  function render() {
    ensureDrawer();
    renderList();
    updateBadges();
    updateFooter();
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
      const toggle = e.target.closest("[data-cart-open], .cart-toggle");
      if (toggle) {
        e.preventDefault();
        open();
        return;
      }

      const card = e.target.closest(".product-card");
      if (!card) return;

      const minus = e.target.closest("[data-qty-minus]");
      if (minus) {
        const input = card.querySelector("[data-qty-input]");
        if (input) {
          input.value = Math.max(1, (Number(input.value) || 1) - 1);
        }
        return;
      }
      const plus = e.target.closest("[data-qty-plus]");
      if (plus) {
        const input = card.querySelector("[data-qty-input]");
        if (input) {
          input.value = Math.min(999, (Number(input.value) || 1) + 1);
        }
        return;
      }
      const addBtn = e.target.closest("[data-add-cart]");
      if (addBtn) {
        e.preventDefault();
        const input = card.querySelector("[data-qty-input]");
        const qty = input ? Number(input.value) || 1 : 1;
        add(productFromCard(card), qty);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("cart-open")) {
        close();
      }
    });
  }

  window.VanPhatCart = {
    add,
    remove,
    setQty,
    getItems,
    getCount,
    getTotal,
    render,
    open,
    close,
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureDrawer();
    bindUI();
    render();
  });
})();
