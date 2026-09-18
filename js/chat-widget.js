/* Vạn Phát — AI Gemini chat (catalog-grounded, no Zalo) */
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

  function loadJson(url) {
    return fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d");
  }

  function searchCatalog(catalog, query, limit) {
    if (!catalog || !Array.isArray(catalog.sanpham)) return [];
    const q = norm(query);
    if (!q || q.length < 2) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored = [];
    for (let i = 0; i < catalog.sanpham.length; i++) {
      const p = catalog.sanpham[i];
      const hay = norm([p.ma, p.ten, p.nhom, p.dvt].join(" "));
      let score = 0;
      for (let t = 0; t < tokens.length; t++) {
        if (hay.indexOf(tokens[t]) !== -1) score += tokens[t].length;
      }
      if (score > 0) scored.push({ score, p });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit || 8).map((x) => ({
      ma: x.p.ma,
      ten: x.p.ten,
      nhom: x.p.nhom,
      dvt: x.p.dvt,
      gia: x.p.gia,
      ton: x.p.ton,
    }));
  }

  function formatCatalogBlock(items) {
    if (!items.length) return "(Không khớp sản phẩm trong catalog web cho câu hỏi này.)";
    return items
      .map(
        (p) =>
          `- [${p.ma}] ${p.ten} | nhóm: ${p.nhom} | ĐVT: ${p.dvt} | giá web: ${p.gia} | tồn: ${p.ton}`
      )
      .join("\n");
  }

  function stripLeadMarkers(text) {
    let clean = String(text || "");
    let lead = null;
    const leadIdx = clean.indexOf("[[LEAD]]");
    if (leadIdx !== -1) {
      const after = clean.slice(leadIdx + 8).trim();
      const jsonMatch = after.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          lead = JSON.parse(jsonMatch[0]);
        } catch (e) {
          lead = { nhu_cau: after.slice(0, 300), ten: "", sdt: "", san_pham_goi_y: [], ghi_chu: "" };
        }
      }
      clean = clean.slice(0, leadIdx).trim();
    }
    return { clean, lead };
  }

  function mount(cfg, catalog) {
    const hotlineTel = cfg.hotlineTel || "0335652832";
    const hotline = cfg.hotline || "033 5652 832";
    const orderUrl = cfg.orderUrl || (window.VanPhat && window.VanPhat.ORDER_URL) || "#";
    const welcome =
      cfg.welcome ||
      "Xin chào! Em là trợ lý AI Vạn Phát — tư vấn theo danh mục trên website.";
    const apiUrl = (cfg.apiUrl || "").trim();

    const history = [];
    let pendingLead = null;

    const fabChat = el("button", {
      className: "vp-fab vp-fab-chat",
      type: "button",
      "aria-label": "Mở chat AI tư vấn",
      "aria-expanded": "false",
      title: "Chat AI tư vấn",
    });
    fabChat.innerHTML = "💬";

    const panel = el("div", {
      className: "vp-chat-panel",
      role: "dialog",
      "aria-label": "Chat AI tư vấn Vạn Phát",
      hidden: "true",
    });

    const header = el("div", { className: "vp-chat-header" }, [
      el("div", { className: "vp-chat-title", text: "AI tư vấn Vạn Phát" }),
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
      el("button", { type: "button", className: "vp-chip", "data-q": "Gợi ý bìa hồ sơ phổ biến" }, ["Bìa hồ sơ"]),
      el("button", { type: "button", className: "vp-chip", "data-q": "Địa chỉ cửa hàng ở đâu?" }, ["Địa chỉ"]),
      el("button", { type: "button", className: "vp-chip", "data-q": "Em cần báo giá photocopy A4 số lượng lớn" }, ["Photocopy"]),
    ]);

    const form = el("form", { className: "vp-chat-form" });
    const input = el("input", {
      type: "text",
      className: "vp-chat-input",
      placeholder: "Hỏi theo sản phẩm trên web…",
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

    const leadBox = el("div", { className: "vp-lead-box", hidden: "true" });
    leadBox.innerHTML =
      '<p class="vp-lead-hint">Nhu cầu ngoài catalog / cần NV tư vấn thêm. Để lại liên hệ — em ghi vào bill để công ty gọi lại.</p>';
    const leadName = el("input", {
      type: "text",
      className: "vp-lead-input",
      placeholder: "Họ tên",
      autocomplete: "name",
      "aria-label": "Họ tên",
    });
    const leadPhone = el("input", {
      type: "tel",
      className: "vp-lead-input",
      placeholder: "Số điện thoại *",
      autocomplete: "tel",
      "aria-label": "Số điện thoại",
    });
    const leadNote = el("input", {
      type: "text",
      className: "vp-lead-input",
      placeholder: "Ghi chú thêm (tuỳ chọn)",
      "aria-label": "Ghi chú",
    });
    const leadSubmit = el("button", {
      type: "button",
      className: "vp-lead-submit",
      text: "Gửi bill cho NV",
    });
    leadBox.appendChild(leadName);
    leadBox.appendChild(leadPhone);
    leadBox.appendChild(leadNote);
    leadBox.appendChild(leadSubmit);

    const footer = el("div", { className: "vp-chat-footer" }, [
      el("a", { href: "tel:" + hotlineTel, text: "☎ " + hotline }),
      el("a", { href: orderUrl, target: "_blank", rel: "noopener", text: "Đặt hàng online" }),
    ]);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(quick);
    panel.appendChild(leadBox);
    panel.appendChild(form);
    panel.appendChild(footer);

    const wrap = el("div", { className: "vp-chat-dock" }, [panel, fabChat]);
    document.body.appendChild(wrap);

    function addBubble(role, text) {
      const b = el("div", {
        className: "vp-bubble vp-bubble-" + (role === "user" ? "user" : "bot"),
        text: text,
      });
      messages.appendChild(b);
      messages.scrollTop = messages.scrollHeight;
      return b;
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

    function showLeadForm(seed) {
      pendingLead = seed || {};
      if (seed && seed.ten) leadName.value = String(seed.ten);
      if (seed && seed.sdt) leadPhone.value = String(seed.sdt);
      if (seed && (seed.ghi_chu || seed.nhu_cau)) {
        leadNote.value = String(seed.ghi_chu || seed.nhu_cau).slice(0, 200);
      }
      leadBox.removeAttribute("hidden");
      leadPhone.focus();
    }

    fabChat.addEventListener("click", () => setOpen(panel.hasAttribute("hidden")));
    header.querySelector(".vp-chat-close").addEventListener("click", () => setOpen(false));

    addBubble("bot", welcome);

    function sendMessage(text) {
      const msg = String(text || "").trim();
      if (!msg) return;
      addBubble("user", msg);
      history.push({ role: "user", text: msg });
      input.value = "";
      sendBtn.disabled = true;

      const matches = searchCatalog(catalog, msg, 8);
      const catalogContext = formatCatalogBlock(matches);

      if (!apiUrl) {
        let fallback;
        if (matches.length) {
          fallback =
            "Em tìm thấy trên web:\n" +
            matches
              .slice(0, 5)
              .map((p) => "• " + p.ten + " (" + p.ma + ") — " + Number(p.gia).toLocaleString("vi-VN") + "₫")
              .join("\n") +
            "\n\nChat AI đang kích hoạt backend. Anh/chị gọi " +
            hotline +
            " hoặc dùng Đặt hàng online nếu cần NV chốt.";
        } else {
          fallback =
            "Em chưa khớp sản phẩm trong catalog web cho câu này. Anh/chị để lại SĐT bên dưới — em ghi bill để NV tư vấn thêm, hoặc gọi " +
            hotline +
            ".";
          showLeadForm({ nhu_cau: msg });
        }
        addBubble("bot", fallback);
        history.push({ role: "model", text: fallback });
        sendBtn.disabled = false;
        return;
      }

      const typing = el("div", {
        className: "vp-bubble vp-bubble-bot vp-typing",
        text: "Đang tra catalog…",
      });
      messages.appendChild(typing);
      messages.scrollTop = messages.scrollHeight;

      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "chat",
          message: msg,
          history: history.slice(0, -1),
          catalogContext: catalogContext,
        }),
      })
        .then((r) => r.json().catch(() => ({})))
        .then((data) => {
          typing.remove();
          const raw =
            (data && data.ok && data.reply) ||
            (data && data.error) ||
            "Em chưa trả lời được. Anh/chị gọi " + hotline + " giúp em nhé.";
          const parsed = stripLeadMarkers(raw);
          addBubble("bot", parsed.clean || raw);
          history.push({ role: "model", text: parsed.clean || raw });
          if (history.length > 16) history.splice(0, history.length - 16);
          if (parsed.lead || (data && data.needLead)) {
            showLeadForm(parsed.lead || { nhu_cau: msg });
          }
        })
        .catch(() => {
          typing.remove();
          const err = "Mất kết nối chat. Anh/chị gọi " + hotline + " giúp em.";
          addBubble("bot", err);
          history.push({ role: "model", text: err });
        })
        .finally(() => {
          sendBtn.disabled = false;
          input.focus();
        });
    }

    leadSubmit.addEventListener("click", () => {
      const sdt = String(leadPhone.value || "").trim();
      if (!/^0\d{8,10}$/.test(sdt.replace(/\s+/g, ""))) {
        addBubble("bot", "Anh/chị cho em số điện thoại Việt Nam hợp lệ (bắt đầu bằng 0) để ghi bill nhé.");
        return;
      }
      const bill = {
        ten: String(leadName.value || "").trim(),
        sdt: sdt.replace(/\s+/g, ""),
        nhu_cau: (pendingLead && pendingLead.nhu_cau) || "",
        san_pham_goi_y: (pendingLead && pendingLead.san_pham_goi_y) || [],
        ghi_chu: String(leadNote.value || "").trim() || (pendingLead && pendingLead.ghi_chu) || "",
        transcript: history.slice(-10),
      };

      leadSubmit.disabled = true;

      const finishLocal = () => {
        addBubble(
          "bot",
          "Đã ghi nhận bill liên hệ. Nhân viên Vạn Phát sẽ gọi " +
            bill.sdt +
            " để tư vấn thêm. Cảm ơn anh/chị!"
        );
        leadBox.setAttribute("hidden", "true");
        leadSubmit.disabled = false;
        pendingLead = null;
      };

      if (!apiUrl) {
        try {
          const key = "vp_chat_bills";
          const prev = JSON.parse(localStorage.getItem(key) || "[]");
          prev.push(Object.assign({ at: new Date().toISOString() }, bill));
          localStorage.setItem(key, JSON.stringify(prev.slice(-50)));
        } catch (e) {}
        finishLocal();
        return;
      }

      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "lead", bill: bill }),
      })
        .then((r) => r.json().catch(() => ({})))
        .then((data) => {
          if (data && data.ok === false) {
            addBubble("bot", "Ghi bill chưa thành công. Anh/chị gọi trực tiếp " + hotline + " giúp em.");
            leadSubmit.disabled = false;
            return;
          }
          finishLocal();
        })
        .catch(() => {
          addBubble("bot", "Ghi bill lỗi mạng. Anh/chị gọi " + hotline + " giúp em.");
          leadSubmit.disabled = false;
        });
    });

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
    loadJson(CONFIG_URL).then((cfg) => {
      const c = cfg || {};
      const productsUrl = c.productsUrl || "data/products.json";
      return loadJson(productsUrl).then((catalog) => mount(c, catalog || { sanpham: [] }));
    });
  });
})();
