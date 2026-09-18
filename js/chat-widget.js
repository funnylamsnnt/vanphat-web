/* Vạn Phát — floating Zalo + Gemini chat */
(function () {
  const CONFIG_URL = "data/chat-config.json";

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        if (k === "className") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (attrs[k] !== undefined && attrs[k] !== null) {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    (children || []).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function loadConfig() {
    return fetch(CONFIG_URL, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }

  function mount(cfg) {
    const zaloUrl = cfg.zaloUrl || "https://zalo.me/0335652832";
    const hotlineTel = cfg.hotlineTel || "0335652832";
    const hotline = cfg.hotline || "033 5652 832";
    const orderUrl = cfg.orderUrl || (window.VanPhat && window.VanPhat.ORDER_URL) || "#";
    const welcome =
      cfg.welcome ||
      "Xin chào! Em là trợ lý tư vấn Vạn Phát. Anh/chị cần giấy, dụng cụ VP hay photocopy ạ?";
    const apiUrl = (cfg.apiUrl || "").trim();

    const history = [];

    const fabZalo = el("a", {
      className: "vp-fab vp-fab-zalo",
      href: zaloUrl,
      target: "_blank",
      rel: "noopener noreferrer",
      "aria-label": "Chat Zalo Vạn Phát",
      title: "Chat Zalo",
    });
    fabZalo.innerHTML =
      '<svg viewBox="0 0 48 48" width="28" height="28" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#0068FF"/><path fill="#fff" d="M14 18.5c0-2.5 2.2-4.5 5-4.5h10c2.8 0 5 2 5 4.5v7c0 2.5-2.2 4.5-5 4.5h-3.2l-3.3 3.2c-.4.4-1 .1-1-.4V30H19c-2.8 0-5-2-5-4.5v-7zm4.2 2.2v1.6h3.4v-1.6h-3.4zm6.2 0v1.6h3.4v-1.6h-3.4zm-6.2 3.6v1.6h7.6v-1.6H18.2z"/></svg>';

    const fabChat = el("button", {
      className: "vp-fab vp-fab-chat",
      type: "button",
      "aria-label": "Mở chat tư vấn",
      "aria-expanded": "false",
      title: "Chat tư vấn",
    });
    fabChat.innerHTML = "💬";

    const panel = el("div", {
      className: "vp-chat-panel",
      role: "dialog",
      "aria-label": "Chat tư vấn Vạn Phát",
      hidden: "true",
    });

    const header = el("div", { className: "vp-chat-header" }, [
      el("div", { className: "vp-chat-title", text: "Tư vấn Vạn Phát" }),
      el("button", {
        className: "vp-chat-close",
        type: "button",
        "aria-label": "Đóng chat",
        text: "×",
      }),
    ]);

    const messages = el("div", {
      className: "vp-chat-messages",
      "aria-live": "polite",
    });

    const quick = el("div", { className: "vp-chat-quick" }, [
      el("button", { type: "button", className: "vp-chip", "data-q": "Shop còn giấy A4 không ạ?" }, ["Giấy A4"]),
      el("button", { type: "button", className: "vp-chip", "data-q": "Giá photocopy A4 bao nhiêu?" }, ["Photocopy"]),
      el("button", { type: "button", className: "vp-chip", "data-q": "Địa chỉ cửa hàng ở đâu?" }, ["Địa chỉ"]),
    ]);

    const form = el("form", { className: "vp-chat-form" });
    const input = el("input", {
      type: "text",
      className: "vp-chat-input",
      placeholder: "Nhập câu hỏi…",
      maxlength: "500",
      autocomplete: "off",
      "aria-label": "Tin nhắn",
    });
    const sendBtn = el("button", {
      type: "submit",
      className: "vp-chat-send",
      text: "Gửi",
    });
    form.appendChild(input);
    form.appendChild(sendBtn);

    const footer = el("div", { className: "vp-chat-footer" }, [
      el("a", { href: "tel:" + hotlineTel, text: "☎ " + hotline }),
      el("a", { href: zaloUrl, target: "_blank", rel: "noopener", text: "Zalo" }),
      el("a", { href: orderUrl, target: "_blank", rel: "noopener", text: "Đặt hàng" }),
    ]);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(quick);
    panel.appendChild(form);
    panel.appendChild(footer);

    const wrap = el("div", { className: "vp-chat-dock" }, [panel, fabChat, fabZalo]);
    document.body.appendChild(wrap);

    function addBubble(role, text) {
      const b = el("div", {
        className: "vp-bubble vp-bubble-" + (role === "user" ? "user" : "bot"),
        text: text,
      });
      messages.appendChild(b);
      messages.scrollTop = messages.scrollHeight;
    }

    function setOpen(open) {
      if (open) {
        panel.removeAttribute("hidden");
        fabChat.setAttribute("aria-expanded", "true");
        fabChat.classList.add("is-open");
        input.focus();
      } else {
        panel.setAttribute("hidden", "true");
        fabChat.setAttribute("aria-expanded", "false");
        fabChat.classList.remove("is-open");
      }
    }

    fabChat.addEventListener("click", () => {
      const open = panel.hasAttribute("hidden");
      setOpen(open);
    });
    header.querySelector(".vp-chat-close").addEventListener("click", () => setOpen(false));

    addBubble("bot", welcome);

    function sendMessage(text) {
      const msg = String(text || "").trim();
      if (!msg) return;
      addBubble("user", msg);
      history.push({ role: "user", text: msg });
      input.value = "";
      sendBtn.disabled = true;

      if (!apiUrl) {
        const fallback =
          "Chat AI đang được kích hoạt. Anh/chị gọi hotline " +
          hotline +
          " hoặc Zalo giúp em nhé — hoặc dùng form Đặt hàng trên website.";
        addBubble("bot", fallback);
        history.push({ role: "model", text: fallback });
        sendBtn.disabled = false;
        return;
      }

      const typing = el("div", {
        className: "vp-bubble vp-bubble-bot vp-typing",
        text: "Đang trả lời…",
      });
      messages.appendChild(typing);
      messages.scrollTop = messages.scrollHeight;

      fetch(apiUrl, {
        method: "POST",
        // Apps Script web app often needs text/plain to avoid preflight issues
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          message: msg,
          history: history.slice(0, -1),
        }),
      })
        .then((r) => r.json().catch(() => ({})))
        .then((data) => {
          typing.remove();
          const reply =
            (data && data.ok && data.reply) ||
            (data && data.error) ||
            "Em chưa trả lời được. Anh/chị gọi " + hotline + " giúp em nhé.";
          addBubble("bot", reply);
          history.push({ role: "model", text: reply });
          if (history.length > 16) history.splice(0, history.length - 16);
        })
        .catch(() => {
          typing.remove();
          const err =
            "Mất kết nối chat. Anh/chị gọi " + hotline + " hoặc Zalo giúp em.";
          addBubble("bot", err);
          history.push({ role: "model", text: err });
        })
        .finally(() => {
          sendBtn.disabled = false;
          input.focus();
        });
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      sendMessage(input.value);
    });

    quick.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-q]");
      if (!btn) return;
      sendMessage(btn.getAttribute("data-q"));
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadConfig().then(mount);
  });
})();
