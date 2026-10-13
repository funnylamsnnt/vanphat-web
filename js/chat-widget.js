/* Vạn Phát — chat tư vấn theo catalog. Não trả lời là Grok qua Apps Script. */
(function () {
  const CONFIG_URL = "/data/chat-config.json?v=20261002";

  function absDataUrl(url) {
    const u = String(url || "");
    if (!u || /^https?:\/\//i.test(u) || u.charAt(0) === "/") return u;
    return "/" + u.replace(/^\.\//, "");
  }

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

  function parseGasResponse(res) {
    return res.text().then((text) => {
      const raw = String(text || "").trim();
      if (!raw) return { ok: false, error: "Empty response" };
      try {
        return JSON.parse(raw);
      } catch (e1) {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start !== -1 && end > start) {
          try {
            return JSON.parse(raw.slice(start, end + 1));
          } catch (e2) {}
        }
        return { ok: false, error: "Bad JSON from chat API" };
      }
    });
  }

  function postGas(apiUrl, payload) {
    return fetch(apiUrl, {
      method: "POST",
      redirect: "follow",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    }).then((res) => parseGasResponse(res));
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
          `- [${p.ma}] ${p.ten} | nhóm: ${p.nhom} | ĐVT: ${p.dvt} | giá web: ${p.gia}`
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

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function safeUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (/^mailto:/i.test(raw)) {
      return /^mailto:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(raw) ? raw : "";
    }
    if (/^tel:/i.test(raw)) {
      const digits = raw.replace(/^tel:/i, "").replace(/[^\d+]/g, "");
      return /^\+?\d{8,15}$/.test(digits) ? "tel:" + digits : "";
    }
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
        return parsed.href;
      } catch (e) {
        return "";
      }
    }
    if (raw.charAt(0) === "/" && raw.charAt(1) !== "/") return raw;
    return "";
  }

  function buildCatalogIndex(catalog) {
    const byMa = new Map();
    const names = [];
    const items = (catalog && catalog.sanpham) || [];
    items.forEach((p) => {
      const ma = String((p && p.ma) || "").trim().toUpperCase();
      if (!ma || !p) return;
      byMa.set(ma, p);
      const ten = String(p.ten || "").trim();
      if (ten.length >= 6) names.push({ lower: ten.toLowerCase(), ma: ma, len: ten.length });
    });
    names.sort((a, b) => b.len - a.len);
    const codes = Array.from(byMa.keys()).sort((a, b) => b.length - a.length);
    const codeRe = codes.length
      ? new RegExp("(?<![A-Za-z0-9])(" + codes.map(escapeRegExp).join("|") + ")(?![A-Za-z0-9])", "i")
      : null;
    return { byMa: byMa, names: names, codeRe: codeRe };
  }

  function extractSp(text) {
    const tagged = [];
    const clean = String(text || "").replace(/\[\[SP:\s*([^\]]*)\]\]/gi, (_, body) => {
      String(body || "")
        .split(/[,;|]+/)
        .forEach((part) => {
          const code = part.trim().toUpperCase();
          if (code) tagged.push(code);
        });
      return "";
    });
    return { clean: clean, tagged: tagged };
  }

  function mentionsIn(text, index) {
    const found = [];
    const occupied = [];
    function overlaps(start, end) {
      return occupied.some((range) => start < range.end && end > range.start);
    }
    function take(start, end, ma) {
      if (overlaps(start, end)) return;
      const product = index.byMa.get(String(ma || "").toUpperCase());
      if (!product) return;
      occupied.push({ start: start, end: end });
      found.push({ start: start, product: product });
    }
    if (index && index.codeRe && text) {
      const re = new RegExp(index.codeRe.source, "gi");
      let match;
      while ((match = re.exec(text))) take(match.index, match.index + match[0].length, match[1]);
    }
    const lower = String(text || "").toLowerCase();
    (index && index.names ? index.names : []).forEach((item) => {
      let from = 0;
      while (from < lower.length) {
        const at = lower.indexOf(item.lower, from);
        if (at < 0) break;
        take(at, at + item.lower.length, item.ma);
        from = at + item.lower.length;
      }
    });
    found.sort((a, b) => a.start - b.start);
    const seen = new Set();
    const products = [];
    found.forEach((item) => {
      const ma = String(item.product.ma || "").toUpperCase();
      if (!ma || seen.has(ma)) return;
      seen.add(ma);
      products.push(item.product);
    });
    return products;
  }

  function parseBotReply(text, index) {
    const sp = extractSp(text);
    const leadParsed = stripLeadMarkers(sp.clean);
    const ordered = [];
    const seen = new Set();
    function push(code) {
      const ma = String(code || "").trim().toUpperCase();
      if (!ma || seen.has(ma) || !index.byMa.has(ma)) return;
      seen.add(ma);
      ordered.push(index.byMa.get(ma));
    }
    sp.tagged.forEach(push);
    mentionsIn(leadParsed.clean, index).forEach((product) => push(product.ma));
    const clean = leadParsed.clean.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return { clean: clean, lead: leadParsed.lead, products: ordered.slice(0, 12) };
  }

  function priceLabel(raw) {
    const match = String(raw || "").match(/(\d{1,3}(?:\.\d{3})+)/);
    return (match ? match[1] : String(raw || "")) + "đ";
  }

  function decoratePlain(text) {
    if (!text) return "";
    const priceRe = /(\d{1,3}(?:\.\d{3})+)(\s*)(đồng|vnđ|vnd|đ|₫|d)(?![a-z0-9])/gi;
    let html = "";
    let cursor = 0;
    let priceMatch;
    while ((priceMatch = priceRe.exec(text))) {
      html += escapeHtml(text.slice(cursor, priceMatch.index));
      html += '<span class="vp-md-price">' + escapeHtml(priceLabel(priceMatch[0])) + "</span>";
      cursor = priceMatch.index + priceMatch[0].length;
    }
    html += escapeHtml(text.slice(cursor));
    return html;
  }

  function renderInline(text, index) {
    const re = /\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:|\/)[^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|(https?:\/\/[^\s<]+)/g;
    let html = "";
    let last = 0;
    let match;
    while ((match = re.exec(text))) {
      html += decoratePlain(text.slice(last, match.index), index);
      if (match[1] != null) {
        const href = safeUrl(match[2]);
        if (href) {
          const external = /^https?:/i.test(href);
          html +=
            '<a class="vp-md-link" href="' +
            escapeAttr(href) +
            '"' +
            (external ? ' target="_blank" rel="noopener noreferrer"' : "") +
            ">" +
            decoratePlain(match[1], index) +
            "</a>";
        } else {
          html += escapeHtml(match[0]);
        }
      } else if (match[5] != null) {
        let href = match[5];
        let tail = "";
        const cut = href.match(/^(.*?)([),.;:!?]+)$/);
        if (cut) {
          href = cut[1];
          tail = cut[2];
        }
        const safe = safeUrl(href);
        if (safe) {
          html +=
            '<a class="vp-md-link" href="' +
            escapeAttr(safe) +
            '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(href) +
            "</a>" +
            escapeHtml(tail);
        } else {
          html += escapeHtml(match[5]);
        }
      } else {
        const inner = match[3] != null ? match[3] : match[4];
        html += '<strong class="vp-md-strong">' + decoratePlain(inner, index) + "</strong>";
      }
      last = match.index + match[0].length;
    }
    html += decoratePlain(text.slice(last), index);
    return html;
  }

  function renderProse(text, index) {
    const src = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!src) return "";
    const lines = src.split("\n");
    const blocks = [];
    let list = null;
    let para = [];
    function flushPara() {
      if (!para.length) return;
      blocks.push('<p class="vp-md-p">' + para.join("<br>") + "</p>");
      para = [];
    }
    function flushList() {
      if (!list) return;
      const tag = list.ordered ? "ol" : "ul";
      blocks.push('<' + tag + ' class="vp-md-list">' + list.items.join("") + "</" + tag + ">");
      list = null;
    }
    lines.forEach((line) => {
      const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (item && line.trim()) {
        const ordered = /^\s*\d+[.)]\s+/.test(line);
        flushPara();
        if (!list || list.ordered !== ordered) {
          flushList();
          list = { ordered: ordered, items: [] };
        }
        list.items.push("<li>" + renderInline(item[1], index) + "</li>");
        return;
      }
      if (!line.trim()) {
        flushPara();
        flushList();
        return;
      }
      flushList();
      para.push(renderInline(line.trim(), index));
    });
    flushPara();
    flushList();
    return blocks.join("");
  }

  function chatPriceLabel(product) {
    const amount = Number(product && product.gia);
    if (!(amount > 0)) return "Liên hệ";
    const money = amount.toLocaleString("vi-VN") + "đ";
    const unit = String((product && product.dvt) || "").trim().toLowerCase();
    return unit ? money + "/" + unit : money;
  }

  function productThumb(product) {
    const raw = (product && product.anh) || "";
    const placeholder = window.VanPhat && window.VanPhat.placeholderSvg ? window.VanPhat.placeholderSvg() : "";
    const drive = window.VanPhat && window.VanPhat.driveImage;
    const source = raw || placeholder;
    const webp = drive ? drive(source, 160, true) : source;
    const jpeg = drive ? drive(source, 160, false) : source;
    return { shown: webp || jpeg || placeholder, jpeg: jpeg || placeholder };
  }

  function skuCardHtml(product) {
    const price = chatPriceLabel(product);
    const thumb = productThumb(product);
    const onerror =
      thumb.jpeg && thumb.shown !== thumb.jpeg
        ? "if(!this.dataset.fb){this.dataset.fb='1';this.src='" +
          String(thumb.jpeg).replace(/'/g, "") +
          "'}else if(window.VanPhat){VanPhat.onImgError(this)}"
        : "if(window.VanPhat){VanPhat.onImgError(this)}";
    const name = product.ten || product.ma || "Sản phẩm";
    return (
      '<article class="vp-chat-sku">' +
      '<button type="button" class="vp-chat-sku-open" data-vp-ma="' +
      escapeAttr(product.ma) +
      '" aria-label="' +
      escapeAttr("Xem " + name + ", mã " + (product.ma || "") + ", giá " + price) +
      '">' +
      '<img src="' +
      escapeAttr(thumb.shown) +
      '" alt="" width="64" height="64" loading="lazy" decoding="async" onerror="' +
      escapeAttr(onerror) +
      '" />' +
      '<span class="vp-chat-sku-copy">' +
      '<span class="vp-chat-sku-name">' +
      escapeHtml(name) +
      "</span>" +
      '<span class="vp-chat-sku-meta">' +
      '<span class="vp-chat-sku-code">' +
      escapeHtml(product.ma || "") +
      "</span>" +
      '<span class="vp-chat-sku-price">' +
      escapeHtml(price) +
      "</span></span></span></button>" +
      '<div class="vp-chat-sku-actions">' +
      '<div class="vp-chat-qty" role="group" aria-label="Số lượng">' +
      '<button type="button" class="vp-chat-qty-btn" data-vp-qty-minus aria-label="Giảm số lượng">−</button>' +
      '<input type="number" class="vp-chat-qty-input" data-vp-qty value="1" min="1" max="999" step="1" inputmode="numeric" autocomplete="off" aria-label="Số lượng" />' +
      '<button type="button" class="vp-chat-qty-btn" data-vp-qty-plus aria-label="Tăng số lượng">+</button>' +
      "</div>" +
      '<button type="button" class="vp-chat-sku-add" data-vp-add="' +
      escapeAttr(product.ma) +
      '" data-vp-add-label="Thêm vào giỏ" data-vp-add-aria="' +
      escapeAttr("Thêm " + name + " vào giỏ") +
      '" aria-label="' +
      escapeAttr("Thêm " + name + " vào giỏ") +
      '">Thêm vào giỏ</button></div></article>'
    );
  }

  function clampChatQty(input) {
    if (!input) return 1;
    let n = Math.round(Number(input.value));
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > 999) n = 999;
    input.value = String(n);
    return n;
  }

  function flashChatAdded(btn) {
    const label = btn.getAttribute("data-vp-add-label") || "Thêm vào giỏ";
    btn.textContent = "Đã thêm ✓";
    btn.classList.add("is-added");
    btn.setAttribute("aria-label", "Đã thêm vào giỏ");
    window.clearTimeout(btn._vpAddedTimer);
    btn._vpAddedTimer = window.setTimeout(() => {
      if (!btn.isConnected) return;
      btn.textContent = label;
      btn.classList.remove("is-added");
      btn.setAttribute("aria-label", btn.getAttribute("data-vp-add-aria") || label);
    }, 1600);
  }

  function isPriceOnlyLine(line) {
    if (!/\d/.test(line || "")) return false;
    let rest = String(line).replace(/(\d{1,3}(?:\.\d{3})+)(\s*)(đồng|vnđ|vnd|đ|₫|d)(?![a-z0-9])/gi, " ");
    rest = rest.replace(/\/[^\s,;:]{1,16}/g, " ");
    rest = rest.replace(/[0-9\s\-–—:.,;•*|/()[\]₫đĐd]+/g, " ");
    return !/[A-Za-zÀ-ỹ]/.test(rest);
  }

  function isSkuLine(line, products) {
    if (!products || !products.length) return false;
    let rest = String(line || "");
    products.forEach((product) => {
      rest = rest.replace(new RegExp(escapeRegExp(product.ma), "ig"), " ");
      if (product.ten) rest = rest.replace(new RegExp(escapeRegExp(product.ten), "ig"), " ");
      const unit = String(product.dvt || "").trim();
      if (unit) rest = rest.replace(new RegExp("\\/?\\s*" + escapeRegExp(unit), "ig"), " ");
    });
    rest = rest.replace(/(\d{1,3}(?:\.\d{3})+)(\s*)(đồng|vnđ|vnd|đ|₫|d)(?![a-z0-9])/gi, " ");
    rest = rest.replace(/\/[^\s,;:]{1,16}/g, " ");
    rest = rest.replace(/\b(mã|ma|giá|gia|đvt|dvt)\b/gi, " ");
    rest = rest.replace(/[0-9\s\-–—:.,;•*|/()[\]₫đĐd]+/g, " ");
    return !/[A-Za-zÀ-ỹ]/.test(rest);
  }

  function blocksToHtml(blocks) {
    let html = "";
    let i = 0;
    while (i < blocks.length) {
      if (blocks[i].type === "html") {
        html += '<div class="vp-bubble vp-bubble-bot vp-bubble-rich">' + blocks[i].html + "</div>";
        i += 1;
        continue;
      }
      let cards = "";
      while (i < blocks.length && blocks[i].type === "sku") {
        cards += skuCardHtml(blocks[i].product);
        i += 1;
      }
      if (cards) html += '<div class="vp-chat-skus">' + cards + "</div>";
    }
    if (!html) return "";
    return '<div class="vp-turn vp-turn-bot">' + html + "</div>";
  }

  function composeTurn(clean, products, index) {
    const allowed = new Map();
    (products || []).forEach((product) => {
      const ma = String((product && product.ma) || "").toUpperCase();
      if (ma) allowed.set(ma, product);
    });
    const lines = String(clean || "").replace(/\r\n/g, "\n").split("\n");
    const blocks = [];
    const emitted = new Set();
    let prose = [];
    let lastWasSku = false;

    function emit(product) {
      const ma = String((product && product.ma) || "").toUpperCase();
      if (!ma || emitted.has(ma)) return;
      if (allowed.size && !allowed.has(ma)) return;
      emitted.add(ma);
      blocks.push({ type: "sku", product: allowed.get(ma) || product });
    }

    function flushProse() {
      const text = prose.join("\n");
      prose = [];
      if (!text.trim()) return;
      text.split(/\n{2,}/).forEach((para) => {
        if (!para.trim()) return;
        const html = renderProse(para, index);
        if (html) blocks.push({ type: "html", html: html });
        mentionsIn(para, index).forEach(emit);
      });
    }

    lines.forEach((line) => {
      if (!String(line).trim()) {
        prose.push(line);
        return;
      }
      if (lastWasSku && isPriceOnlyLine(line)) return;
      const found = mentionsIn(line, index);
      if (found.length && isSkuLine(line, found)) {
        flushProse();
        found.forEach(emit);
        lastWasSku = true;
        return;
      }
      lastWasSku = false;
      prose.push(line);
    });
    flushProse();

    const pending = [];
    allowed.forEach((product, ma) => {
      if (!emitted.has(ma)) pending.push(product);
    });
    if (pending.length) {
      const nodes = pending.map((product) => ({ type: "sku", product: product }));
      const firstHtml = blocks.findIndex((block) => block.type === "html");
      if (firstHtml === -1) blocks.push.apply(blocks, nodes);
      else blocks.splice(firstHtml + 1, 0, ...nodes);
    }
    return blocksToHtml(blocks);
  }

  function renderBotHtml(text, index, products) {
    let clean = String(text || "");
    let list = products;
    if (!list) {
      const parsed = parseBotReply(clean, index);
      clean = parsed.clean;
      list = parsed.products;
    }
    return composeTurn(clean, list, index);
  }

  function pagePrefix() {
    return /\/(linh-vuc|san-pham|dia-phuong)\//.test(location.pathname) ? "../" : "";
  }

  function syncCardHTML(p) {
    const prefix = pagePrefix();
    const price = Number(p.gia) > 0 && window.VanPhat ? window.VanPhat.formatPrice(p.gia) : "Liên hệ";
    const pathMap = (window.VanPhatPaths && window.VanPhatPaths.product) || {};
    const href = prefix + (pathMap[p.ma] || "san-pham.html?q=" + encodeURIComponent(p.ma || ""));
    const catMap = (window.VanPhatPaths && window.VanPhatPaths.category) || {};
    const cat = catMap[p.nhom]
      ? prefix + catMap[p.nhom]
      : prefix + "san-pham.html?nhom=" + encodeURIComponent(p.nhom || "");
    const badge = [p.linhVucTen, p.nhom].filter(Boolean).join(" · ");
    const src = p.anh || (window.VanPhat ? window.VanPhat.placeholderSvg() : "");
    const webp = window.VanPhat && window.VanPhat.driveImage ? window.VanPhat.driveImage(src, 480, true) : src;
    const jpeg = window.VanPhat && window.VanPhat.driveImage ? window.VanPhat.driveImage(src, 480, false) : src;
    const shown = webp || jpeg;
    const onerror =
      webp && jpeg && webp !== jpeg
        ? "if(!this.dataset.fb){this.dataset.fb='1';this.src='" + String(jpeg).replace(/'/g, "") + "'}else{VanPhat.onImgError(this)}"
        : "VanPhat.onImgError(this)";
    return (
      '<article class="product-card vp-chat-hit" data-ma="' +
      escapeAttr(p.ma) +
      '" data-ten="' +
      escapeAttr(p.ten) +
      '" data-gia="' +
      escapeAttr(p.gia) +
      '" data-dvt="' +
      escapeAttr(p.dvt) +
      '" data-anh="' +
      escapeAttr(p.anh || "") +
      '" data-nhom="' +
      escapeAttr(p.nhom) +
      '">' +
      '<div class="product-img" data-product-zoom role="button" tabindex="0" aria-label="Xem ảnh lớn: ' +
      escapeAttr(p.ten) +
      '" title="Xem ảnh lớn">' +
      '<img src="' +
      escapeAttr(shown) +
      '" alt="' +
      escapeAttr(p.ten) +
      '" width="400" height="400" loading="lazy" decoding="async" onerror="' +
      escapeAttr(onerror) +
      '" />' +
      "</div>" +
      '<div class="product-body">' +
      '<div class="product-badge"><a href="' +
      escapeAttr(cat) +
      '">' +
      escapeHtml(badge) +
      "</a></div>" +
      '<h3 class="product-name"><a href="' +
      escapeAttr(href) +
      '">' +
      escapeHtml(p.ten) +
      "</a></h3>" +
      '<div class="product-meta-row"><span class="product-dvt">ĐVT: ' +
      escapeHtml(p.dvt || "—") +
      '</span><span class="product-ma">' +
      escapeHtml(p.ma || "") +
      "</span></div>" +
      '<div class="product-price"><span class="price-label">Giá</span> ' +
      price +
      "</div>" +
      '<div class="product-actions">' +
      '<div class="qty-control">' +
      '<button type="button" class="qty-btn" data-qty-minus aria-label="Giảm số lượng">−</button>' +
      '<input type="number" class="qty-input" value="1" min="1" max="999" data-qty-input aria-label="Số lượng" />' +
      '<button type="button" class="qty-btn" data-qty-plus aria-label="Tăng số lượng">+</button>' +
      "</div>" +
      '<button type="button" class="btn btn-add-cart" data-add-cart>Thêm vào giỏ</button>' +
      "</div></div></article>"
    );
  }

  function scrollPageTo(node) {
    if (!node || !node.scrollIntoView) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function highlightExisting(products) {
    const set = new Set(products.map((p) => String(p.ma || "").toUpperCase()));
    document.querySelectorAll(".product-card").forEach((card) => {
      const ma = (card.getAttribute("data-ma") || "").toUpperCase();
      if (set.has(ma)) card.classList.add("vp-chat-hit");
    });
  }

  function renderSyncPanel(products) {
    let section = document.getElementById("vp-chat-sync");
    if (!section) {
      section = document.createElement("section");
      section.id = "vp-chat-sync";
      section.className = "vp-chat-sync";
      section.setAttribute("aria-labelledby", "vp-chat-sync-title");
      const main = document.querySelector("main") || document.body;
      const hero = main.querySelector(".hero, .page-hero");
      if (hero && hero.parentNode === main) hero.insertAdjacentElement("afterend", section);
      else main.insertBefore(section, main.firstChild);
    }
    const prefix = pagePrefix();
    const query = products.map((p) => p.ma).join(" ");
    section.innerHTML =
      '<div class="container">' +
      '<div class="section-header">' +
      '<span class="eyebrow">Từ cuộc trò chuyện</span>' +
      '<h2 id="vp-chat-sync-title">Sản phẩm vừa trao đổi</h2>' +
      "<p>Các mã trong câu trả lời đang hiện trên trang này. Bấm ảnh để xem lớn, chỉnh số lượng rồi thêm vào giỏ. Khung chat vẫn mở.</p>" +
      "</div>" +
      '<div class="product-grid">' +
      products.map(syncCardHTML).join("") +
      "</div>" +
      '<div class="vp-chat-sync-more"><a class="btn btn-outline-navy btn-sm" href="' +
      escapeAttr(prefix + "san-pham.html?q=" + encodeURIComponent(query)) +
      '">Xem các mã này trong catalog</a></div>' +
      "</div>";
    section.classList.remove("is-hot");
    void section.offsetWidth;
    section.classList.add("is-hot");
    return section;
  }

  function syncPage(products) {
    if (!products || !products.length) return;
    const codes = products.map((p) => p.ma);
    const onCatalog = document.getElementById("product-grid") && document.getElementById("search-input");
    if (onCatalog) {
      window.VanPhatCatalog = window.VanPhatCatalog || {};
      if (typeof window.VanPhatCatalog.showCodes === "function") {
        window.VanPhatCatalog.showCodes(codes);
      } else {
        window.VanPhatCatalog._pendingCodes = codes;
      }
      scrollPageTo(document.getElementById("product-grid"));
      return;
    }
    const section = renderSyncPanel(products);
    highlightExisting(products);
    scrollPageTo(section);
  }

  function mount(cfg, catalog) {
    const catalogIndex = buildCatalogIndex(catalog);
    const hotlineTel = cfg.hotlineTel || "0335652832";
    const hotline = cfg.hotline || "033 5652 832";
    const welcome =
      cfg.welcome ||
      "Xin chào! Em là trợ lý AI Vạn Phát — tư vấn theo danh mục trên website.";
    const apiUrl = (cfg.apiUrl || "").trim();

    const history = [];
    let pendingLead = null;

    const fabZalo = el("a", {
      className: "vp-fab vp-fab-zalo",
      href: "https://zalo.me/" + String(hotlineTel || "").replace(/\s+/g, ""),
      target: "_blank",
      rel: "noopener",
      "aria-label": "Chat Zalo " + hotline,
      title: "Chat Zalo " + hotline,
      text: "Zalo",
    });

    const fabChat = el("button", {
      className: "vp-fab vp-fab-chat",
      type: "button",
      "aria-label": "Mở chat AI tư vấn",
      "aria-expanded": "false",
      title: "Chat AI tư vấn",
    });
    fabChat.innerHTML =
      '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5 5.5A3.5 3.5 0 0 1 8.5 2h7A3.5 3.5 0 0 1 19 5.5v6A3.5 3.5 0 0 1 15.5 15H12l-3.6 3.2c-.7.6-1.8.1-1.8-.8V15H8.5A3.5 3.5 0 0 1 5 11.5v-6z"/></svg>';

    const panel = el("div", {
      className: "vp-chat-panel",
      role: "dialog",
      "aria-label": "Chat AI tư vấn Vạn Phát",
      hidden: "true",
    });

    const header = el("div", { className: "vp-chat-header" }, [
      el("div", { className: "vp-chat-brand" }, [
        el("span", { className: "vp-chat-avatar", "aria-hidden": "true", text: "VP" }),
        el("div", { className: "vp-chat-heading" }, [
          el("div", { className: "vp-chat-title", text: "AI tư vấn Vạn Phát" }),
          el("div", { className: "vp-chat-sub", text: "Giá theo website" }),
        ]),
      ]),
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
      el("a", { href: "https://zalo.me/" + hotlineTel, target: "_blank", rel: "noopener", text: "Chat Zalo" }),
    ]);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(quick);
    panel.appendChild(leadBox);
    panel.appendChild(form);
    panel.appendChild(footer);

    const wrap = el("div", { className: "vp-chat-dock" }, [panel, fabZalo, fabChat]);
    document.body.appendChild(wrap);

    function scrollMessages() {
      messages.scrollTop = messages.scrollHeight;
    }

    function addBubble(role, text) {
      if (role === "user") {
        const b = document.createElement("div");
        b.className = "vp-bubble vp-bubble-user";
        b.textContent = text;
        messages.appendChild(b);
        scrollMessages();
        return null;
      }
      const parsed = parseBotReply(text, catalogIndex);
      const shown =
        parsed.clean ||
        (parsed.products.length
          ? "Em gắn các mã này lên trang để anh/chị xem và thêm vào giỏ."
          : String(text || ""));
      parsed.shown = shown;
      const html = renderBotHtml(shown, catalogIndex, parsed.products);
      const holder = document.createElement("div");
      holder.innerHTML = html;
      const node = holder.firstElementChild;
      if (node) messages.appendChild(node);
      else {
        const fallback = document.createElement("div");
        fallback.className = "vp-bubble vp-bubble-bot vp-bubble-rich";
        fallback.textContent = shown;
        messages.appendChild(fallback);
      }
      const root = node || messages.lastElementChild;
      if (root) {
        root.querySelectorAll("img").forEach((img) => {
          img.addEventListener("load", scrollMessages, { once: true });
        });
      }
      scrollMessages();
      if (parsed.products.length) syncPage(parsed.products);
      return parsed;
    }

    messages.addEventListener("click", (e) => {
      const qtyBtn = e.target.closest("[data-vp-qty-minus], [data-vp-qty-plus]");
      if (qtyBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = qtyBtn.closest(".vp-chat-sku");
        const input = card && card.querySelector("[data-vp-qty]");
        if (!input) return;
        const current = clampChatQty(input);
        const next = qtyBtn.hasAttribute("data-vp-qty-minus")
          ? Math.max(1, current - 1)
          : Math.min(999, current + 1);
        input.value = String(next);
        return;
      }
      if (e.target.closest(".vp-chat-qty")) {
        e.stopPropagation();
        return;
      }
      const addBtn = e.target.closest("[data-vp-add]");
      if (addBtn) {
        e.preventDefault();
        e.stopPropagation();
        const product = catalogIndex.byMa.get(String(addBtn.getAttribute("data-vp-add") || "").toUpperCase());
        const card = addBtn.closest(".vp-chat-sku");
        const input = card && card.querySelector("[data-vp-qty]");
        const qty = clampChatQty(input);
        if (product && window.VanPhatCart && window.VanPhatCart.add) {
          window.VanPhatCart.add(product, qty);
          flashChatAdded(addBtn);
        }
        return;
      }
      const btn = e.target.closest("[data-vp-ma]");
      if (!btn) return;
      const product = catalogIndex.byMa.get(String(btn.getAttribute("data-vp-ma") || "").toUpperCase());
      if (!product || !window.VanPhatLightbox || !window.VanPhatLightbox.openProduct) return;
      e.preventDefault();
      window.VanPhatLightbox.openProduct(product, btn);
    });

    messages.addEventListener("change", (e) => {
      const input = e.target && e.target.closest ? e.target.closest("[data-vp-qty]") : null;
      if (input) clampChatQty(input);
    });

    messages.addEventListener("keydown", (e) => {
      const input = e.target && e.target.closest ? e.target.closest("[data-vp-qty]") : null;
      if (!input) return;
      if (e.key === "." || e.key === "," || e.key === "e" || e.key === "E" || e.key === "+" || e.key === "-") {
        e.preventDefault();
      }
    });

    messages.addEventListener(
      "wheel",
      (e) => {
        const input = e.target && e.target.closest ? e.target.closest("[data-vp-qty]") : null;
        if (input && document.activeElement === input) input.blur();
      },
      { passive: true }
    );

    function setOpen(open) {
      document.body.classList.toggle("vp-chat-open", !!open);
      if (open) {
        panel.removeAttribute("hidden");
        panel.setAttribute("aria-modal", "true");
        fabChat.setAttribute("aria-expanded", "true");
        fabChat.classList.add("is-open");
        input.focus();
      } else {
        panel.setAttribute("hidden", "true");
        panel.setAttribute("aria-modal", "false");
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
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || panel.hasAttribute("hidden")) return;
      if (document.body.classList.contains("lightbox-open")) return;
      setOpen(false);
    });

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
            "\n\nEm chưa nối được AI. Anh/chị thêm vào giỏ, gọi hotline " +
            hotline +
            " hoặc Chat Zalo https://zalo.me/" +
            hotlineTel +
            " để được tư vấn nhé.";
        } else {
          fallback =
            "Em chưa khớp sản phẩm trong catalog web cho câu này. Anh/chị để lại SĐT bên dưới, gọi hotline " +
            hotline +
            " hoặc Chat Zalo https://zalo.me/" +
            hotlineTel +
            " để được tư vấn nhé.";
          showLeadForm({ nhu_cau: msg });
        }
        const localReply = addBubble("bot", fallback);
        history.push({ role: "model", text: (localReply && localReply.shown) || fallback });
        sendBtn.disabled = false;
        return;
      }

      const typing = el("div", {
        className: "vp-bubble vp-bubble-bot vp-typing",
        role: "status",
      });
      typing.innerHTML =
        '<span class="vp-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="vp-typing-label">Đang tra catalog…</span>';
      messages.appendChild(typing);
      messages.scrollTop = messages.scrollHeight;

      postGas(apiUrl, {
        action: "chat",
        message: msg,
        history: history.slice(0, -1),
        catalogContext: catalogContext,
        sessionId: chatSessionId(),
      })
        .then((data) => {
          typing.remove();
          const replyText =
            data && data.ok && data.reply
              ? data.reply
              : (data && data.error) ||
                "Em chưa trả lời được lúc này. Anh/chị gọi hotline " +
                  hotline +
                  " hoặc Chat Zalo https://zalo.me/" +
                  hotlineTel +
                  " để được tư vấn nhé.";
          const parsed = addBubble("bot", replyText);
          history.push({ role: "model", text: (parsed && parsed.shown) || "" });
          if (history.length > 16) history.splice(0, history.length - 16);
          if ((parsed && parsed.lead) || (data && data.needLead)) {
            showLeadForm((parsed && parsed.lead) || { nhu_cau: msg });
          }
        })
        .catch(() => {
          typing.remove();
          const err =
            "Mất kết nối chat. Anh/chị gọi hotline " +
            hotline +
            " hoặc Chat Zalo https://zalo.me/" +
            hotlineTel +
            " để được tư vấn nhé.";
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

      postGas(apiUrl, { action: "lead", bill: bill })
        .then((data) => {
          if (!data || data.ok === false) {
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

    function chatSessionId() {
      try {
        const key = "vp-chat-session";
        let id = sessionStorage.getItem(key);
        if (!id) {
          id = "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
          sessionStorage.setItem(key, id);
        }
        return id;
      } catch (e) {
        return "";
      }
    }

    quick.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-q]");
      if (!btn) return;
      sendMessage(btn.getAttribute("data-q"));
    });
  }

  window.VanPhatChatFormat = {
    buildCatalogIndex: buildCatalogIndex,
    parseBotReply: parseBotReply,
    renderBotHtml: renderBotHtml,
  };

  document.addEventListener("DOMContentLoaded", () => {
    loadJson(CONFIG_URL).then((cfg) => {
      const c = cfg || {};
      const productsUrl = absDataUrl(c.productsUrl || "/data/products.json");
      return loadJson(productsUrl).then((catalog) => mount(c, catalog || { sanpham: [] }));
    });
  });
})();
