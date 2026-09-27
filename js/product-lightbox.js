/* Vạn Phát — product image lightbox (zoom preview + add to cart) */
(function () {
  let current = null;
  let lastFocus = null;

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

  function isOpen() {
    return document.body.classList.contains("lightbox-open");
  }

  function ensureModal() {
    if (document.getElementById("product-lightbox")) return;

    const overlay = document.createElement("div");
    overlay.id = "product-lightbox-overlay";
    overlay.className = "product-lightbox-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const dialog = document.createElement("div");
    dialog.id = "product-lightbox";
    dialog.className = "product-lightbox";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "product-lightbox-title");
    dialog.setAttribute("aria-hidden", "true");
    dialog.innerHTML = `
      <button type="button" class="product-lightbox-close" data-lb-close aria-label="Đóng">×</button>
      <div class="product-lightbox-scroll">
        <div class="product-lightbox-media">
          <img data-lb-img alt="" />
        </div>
        <div class="product-lightbox-body">
          <div class="product-nhom" data-lb-nhom></div>
          <h2 id="product-lightbox-title" class="product-lightbox-title"></h2>
          <div class="product-lightbox-meta">
            <span>Mã: <strong data-lb-ma></strong></span>
            <span>ĐVT: <strong data-lb-dvt></strong></span>
          </div>
          <div class="product-lightbox-price" data-lb-price></div>
          <div class="product-actions">
            <div class="qty-control">
              <button type="button" class="qty-btn" data-lb-minus aria-label="Giảm số lượng">−</button>
              <input type="number" class="qty-input" value="1" min="1" max="999" data-lb-qty aria-label="Số lượng" />
              <button type="button" class="qty-btn" data-lb-plus aria-label="Tăng số lượng">+</button>
            </div>
            <button type="button" class="btn btn-add-cart" data-lb-add>Thêm vào giỏ</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    overlay.addEventListener("click", close);

    dialog.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target.closest("[data-lb-close]")) {
        close();
        return;
      }
      const qty = dialog.querySelector("[data-lb-qty]");
      if (e.target.closest("[data-lb-minus]") && qty) {
        qty.value = Math.max(1, (Number(qty.value) || 1) - 1);
        return;
      }
      if (e.target.closest("[data-lb-plus]") && qty) {
        qty.value = Math.min(999, (Number(qty.value) || 1) + 1);
        return;
      }
      if (e.target.closest("[data-lb-add]")) {
        addCurrent();
      }
    });

    dialog.addEventListener("change", (e) => {
      const input = e.target.closest("[data-lb-qty]");
      if (!input) return;
      const q = Math.max(1, Math.min(999, Number(input.value) || 1));
      input.value = String(q);
    });
  }

  function imageSrc(card, product) {
    const img = card.querySelector(".product-img img");
    const live = img && img.getAttribute("src");
    if (live) return live;
    if (product.anh) return product.anh;
    return placeholder();
  }

  function open(card, trigger) {
    if (!card) return;
    const product = productFromCard(card);
    if (!product.ma && !product.ten) return;
    ensureModal();

    const dialog = document.getElementById("product-lightbox");
    const overlay = document.getElementById("product-lightbox-overlay");
    current = product;
    lastFocus = trigger || document.activeElement;

    const img = dialog.querySelector("[data-lb-img]");
    img.alt = product.ten || "Sản phẩm";
    img.onerror = function () {
      this.onerror = null;
      const fallback = placeholder();
      if (fallback) this.src = fallback;
    };
    img.src = imageSrc(card, product);

    const nhom = dialog.querySelector("[data-lb-nhom]");
    nhom.textContent = product.nhom || "";
    nhom.hidden = !product.nhom;
    dialog.querySelector("#product-lightbox-title").textContent =
      product.ten || product.ma || "Sản phẩm";
    dialog.querySelector("[data-lb-ma]").textContent = product.ma || "—";
    dialog.querySelector("[data-lb-dvt]").textContent = product.dvt || "—";
    dialog.querySelector("[data-lb-price]").textContent = formatPrice(product.gia);

    const qty = dialog.querySelector("[data-lb-qty]");
    if (qty) qty.value = "1";

    overlay.classList.add("open");
    dialog.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    dialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("lightbox-open");

    const closeBtn = dialog.querySelector("[data-lb-close]");
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    const dialog = document.getElementById("product-lightbox");
    const overlay = document.getElementById("product-lightbox-overlay");
    if (dialog) {
      dialog.classList.remove("open");
      dialog.setAttribute("aria-hidden", "true");
    }
    if (overlay) {
      overlay.classList.remove("open");
      overlay.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("lightbox-open");
    current = null;
    const back = lastFocus;
    lastFocus = null;
    if (back && typeof back.focus === "function" && document.contains(back)) {
      back.focus();
    }
  }

  function addCurrent() {
    if (!current || !window.VanPhatCart || !window.VanPhatCart.add) return;
    const dialog = document.getElementById("product-lightbox");
    const input = dialog && dialog.querySelector("[data-lb-qty]");
    let qty = input ? Number(input.value) || 1 : 1;
    qty = Math.max(1, Math.min(999, qty));
    if (input) input.value = String(qty);
    window.VanPhatCart.add(current, qty);
  }

  function focusables(dialog) {
    return Array.from(
      dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.disabled && el.offsetParent !== null);
  }

  function onKeydown(e) {
    if (e.key === "Escape" && isOpen()) {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }

    if (e.key === "Tab" && isOpen()) {
      const dialog = document.getElementById("product-lightbox");
      if (!dialog) return;
      const list = focusables(dialog);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }

    const zoom =
      e.target && e.target.closest ? e.target.closest("[data-product-zoom]") : null;
    if (!zoom) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = zoom.closest(".product-card");
    if (!card) return;
    e.preventDefault();
    e.stopPropagation();
    open(card, zoom);
  }

  function onClick(e) {
    const zoom = e.target.closest("[data-product-zoom]");
    if (!zoom) return;
    const card = zoom.closest(".product-card");
    if (!card) return;
    e.preventDefault();
    e.stopPropagation();
    open(card, zoom);
  }

  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeydown, true);

  document.addEventListener("DOMContentLoaded", ensureModal);
})();
