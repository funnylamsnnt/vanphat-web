/* Vạn Phát — shared UI */
(function () {
  const ORDER_URL =
    "https://script.google.com/macros/s/AKfycbzdcOxIbVAivc2fSCSk1v8go0Wxg_vULF7MDnsmpOcROoWDZ5luBF6uD7Wh-omRkjJB/exec";
  const HOTLINE = "033 5652 832";
  const HOTLINE_TEL = "0335652832";

  window.VanPhat = {
    ORDER_URL,
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
  };

  function initNav() {
    const nav = document.querySelector(".nav");
    const toggle = document.querySelector(".nav-toggle");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", (e) => {
      if (!nav.contains(e.target) && nav.classList.contains("open")) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  function setActiveNav() {
    const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll(".nav-links a").forEach((a) => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      if (href === path || (path === "" && href === "index.html")) {
        a.classList.add("active");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initNav();
    setActiveNav();
  });
})();
