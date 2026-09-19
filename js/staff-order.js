/* Vạn Phát — staff counter order (sell price only, never cost) */
(function () {
  const STORAGE_KEY = "vanphat_staff_cart";
  const ORDER_EMAIL = "congtytnhhvanphat999@gmail.com";
  const DATA_URL = "data/products.json";
  const HOTLINE = "033 5652 832";

  // Optional: set after deploying gas/StaffOrderInbox.gs as Web app (Anyone).
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

  function formatSlipDate(d) {
    const dt = d || new Date();
    return (
      "Ngày " +
      dt.getDate() +
      " tháng " +
      (dt.getMonth() + 1) +
      " năm " +
      dt.getFullYear()
    );
  }

  function formatSlipMoney(n) {
    const v = Number(n) || 0;
    if (!v) return "0";
    return v.toLocaleString("vi-VN");
  }

  function readFormFields() {
    const staffEl = document.getElementById("staff-name");
    const shopEl = document.getElementById("staff-shop");
    const customerEl = document.getElementById("staff-customer");
    const addressEl = document.getElementById("staff-address");
    const receiverEl = document.getElementById("staff-receiver");
    const phoneEl = document.getElementById("staff-phone");
    const partnerEl = document.getElementById("staff-partner");
    const noteEl = document.getElementById("staff-note");
    return {
      staff: (staffEl && staffEl.value.trim()) || "",
      shop: shopEl ? shopEl.value.trim() : "",
      customer: customerEl ? customerEl.value.trim() : "",
      address: addressEl ? addressEl.value.trim() : "",
      receiver: receiverEl ? receiverEl.value.trim() : "",
      phone: (phoneEl && phoneEl.value.trim()) || "",
      partner: partnerEl ? partnerEl.value.trim() : "",
      note: noteEl ? noteEl.value.trim() : "",
      staffEl,
      phoneEl,
    };
  }

  function getMeta() {
    const f = readFormFields();

    if (!f.staff) {
      if (f.staffEl) {
        f.staffEl.focus();
        f.staffEl.classList.add("is-invalid");
      }
      showToast("Vui lòng nhập tên nhân viên");
      return null;
    }
    if (f.staffEl) f.staffEl.classList.remove("is-invalid");

    if (!f.phone) {
      if (f.phoneEl) {
        f.phoneEl.focus();
        f.phoneEl.classList.add("is-invalid");
      }
      showToast("Vui lòng nhập số điện thoại");
      return null;
    }
    if (f.phoneEl) f.phoneEl.classList.remove("is-invalid");

    if (!items.length) {
      showToast("Đơn trống — thêm sản phẩm trước");
      return null;
    }

    return {
      staff: f.staff,
      shop: f.shop,
      customer: f.customer,
      address: f.address,
      receiver: f.receiver,
      phone: f.phone,
      partner: f.partner,
      note: f.note,
      orderId: makeOrderId(),
      total: getTotal(),
    };
  }

  /** Soft meta for PDF/print — cart required; customer fields optional. */
  function getPrintMeta(mode) {
    if (!items.length) {
      showToast("Đơn trống — thêm sản phẩm trước");
      return null;
    }
    const f = readFormFields();
    const title = mode === "quote" ? "PHIẾU BÁO GIÁ" : "PHIẾU GIAO HÀNG";
    return {
      mode: mode === "quote" ? "quote" : "delivery",
      title,
      staff: f.staff,
      shop: f.shop,
      customer: f.customer || "QUÝ KHÁCH HÀNG",
      address: f.address,
      receiver: f.receiver || f.customer || "",
      phone: f.phone,
      partner: f.partner,
      note: f.note,
      orderId: makeOrderId(),
      total: getTotal(),
      dateLabel: formatSlipDate(),
    };
  }

  function buildOrderText(meta) {
    const lines = [
      "=== BILL / PHIẾU GIAO HÀNG ===",
      "Mã đơn: " + meta.orderId,
      "Ngày: " + formatSlipDate(),
      "",
      "Nhân viên: " + meta.staff,
      "Cửa hàng: " + (meta.shop || "(không ghi)"),
      "Kính gửi: " + (meta.customer || "(không ghi)"),
      "Địa chỉ: " + (meta.address || "(không ghi)"),
      "Người nhận: " + (meta.receiver || meta.customer || "(không ghi)"),
      "SĐT: " + meta.phone,
    ];
    if (meta.partner) lines.push("Mã đối tác: " + meta.partner);
    if (meta.note) lines.push("Ghi chú: " + meta.note);
    lines.push("", "—— Chi tiết sản phẩm (giá bán) ——");
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
    lines.push("", "TỔNG CỘNG: " + formatPrice(meta.total));
    lines.push(
      "",
      "— Hotline Vạn Phát: " + HOTLINE,
      "— Phiếu PDF (layout Excel Đơn Đặt Hàng) là bản chính thức; email này chỉ là tóm tắt bill."
    );
    return lines.join("\n");
  }

  /** HTML-friendly bill — NOT a FormSubmit Name/Value table dump. */
  function buildBillHtmlSummary(meta) {
    const rows = items
      .map((it, i) => {
        const line = (Number(it.gia) || 0) * (Number(it.qty) || 0);
        return (
          "<tr>" +
          "<td style='border:1px solid #333;padding:4px;text-align:center'>" +
          (i + 1) +
          "</td>" +
          "<td style='border:1px solid #333;padding:4px'>" +
          escapeHtml(it.ma) +
          "</td>" +
          "<td style='border:1px solid #333;padding:4px'>" +
          escapeHtml(it.ten) +
          "</td>" +
          "<td style='border:1px solid #333;padding:4px;text-align:center'>" +
          escapeHtml(it.dvt || "") +
          "</td>" +
          "<td style='border:1px solid #333;padding:4px;text-align:center'>" +
          (Number(it.qty) || 0) +
          "</td>" +
          "<td style='border:1px solid #333;padding:4px;text-align:right'>" +
          formatPrice(it.gia) +
          "</td>" +
          "<td style='border:1px solid #333;padding:4px;text-align:right'>" +
          formatPrice(line) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    return (
      "<div style='font-family:Calibri,Arial,sans-serif;color:#000'>" +
      "<h2 style='color:#002060;margin:0 0 8px'>PHIẾU / BILL ĐƠN NV — Vạn Phát</h2>" +
      "<p style='margin:0 0 6px'><b>Mã đơn:</b> " +
      escapeHtml(meta.orderId) +
      " &nbsp;|&nbsp; <b>Ngày:</b> " +
      escapeHtml(formatSlipDate()) +
      "</p>" +
      "<p style='margin:0 0 6px'><b>NV:</b> " +
      escapeHtml(meta.staff) +
      (meta.shop ? " · " + escapeHtml(meta.shop) : "") +
      "<br/><b>Kính gửi:</b> <span style='color:#C00000'>" +
      escapeHtml(meta.customer || "QUÝ KHÁCH HÀNG") +
      "</span><br/><b>Địa chỉ:</b> " +
      escapeHtml(meta.address || "—") +
      "<br/><b>Người nhận:</b> " +
      escapeHtml(meta.receiver || meta.customer || "—") +
      " · <b>SĐT:</b> " +
      escapeHtml(meta.phone) +
      (meta.partner ? "<br/><b>Mã đối tác:</b> " + escapeHtml(meta.partner) : "") +
      (meta.note ? "<br/><b>Ghi chú:</b> " + escapeHtml(meta.note) : "") +
      "</p>" +
      "<table style='border-collapse:collapse;width:100%;font-size:13px;margin:8px 0'>" +
      "<thead><tr style='background:#0070C0;color:#fff'>" +
      "<th style='border:1px solid #333;padding:4px'>STT</th>" +
      "<th style='border:1px solid #333;padding:4px'>Mã</th>" +
      "<th style='border:1px solid #333;padding:4px'>Tên SP</th>" +
      "<th style='border:1px solid #333;padding:4px'>ĐVT</th>" +
      "<th style='border:1px solid #333;padding:4px'>SL</th>" +
      "<th style='border:1px solid #333;padding:4px'>Đơn giá</th>" +
      "<th style='border:1px solid #333;padding:4px'>Thành tiền</th>" +
      "</tr></thead><tbody>" +
      rows +
      "</tbody>" +
      "<tfoot><tr style='background:#0070C0;color:#fff'><td colspan='6' style='border:1px solid #333;padding:4px;text-align:right'><b>TỔNG CỘNG</b></td>" +
      "<td style='border:1px solid #333;padding:4px;text-align:right'><b>" +
      formatPrice(meta.total) +
      "</b></td></tr></tfoot></table>" +
      "<p style='font-size:12px;color:#333'><i>Phiếu PDF layout Excel «Đơn Đặt Hàng» là bản chính thức (nhân viên đã / sẽ Xuất PDF trên máy). Email này là tóm tắt bill — không kèm giá vốn.</i><br/>Hotline: " +
      HOTLINE +
      "</p>" +
      "</div>"
    );
  }

  function buildPrintSlipHTML(meta) {
    const addr =
      meta.address ||
      "…....................................., phường Nam Nha Trang, tỉnh Khánh Hòa";
    const receiver =
      meta.receiver || "…............................................";
    const phone = meta.phone || "….................";
    const partnerLine = meta.partner
      ? `<div class="slip-partner">Mã đối tác: <strong>${escapeHtml(meta.partner)}</strong></div>`
      : "";

    const rows = items
      .map((it, i) => {
        const line = (Number(it.gia) || 0) * (Number(it.qty) || 0);
        const img = it.anh
          ? `<img class="slip-thumb" src="${escapeAttr(it.anh)}" alt="" crossorigin="anonymous" onerror="this.style.display='none'" />`
          : `<span class="slip-thumb-empty">—</span>`;
        const giaLabel =
          Number(it.gia) === 0 ? "Chờ báo giá" : formatSlipMoney(it.gia);
        const lineLabel =
          Number(it.gia) === 0 ? "Chờ báo giá" : formatSlipMoney(line);
        return `<tr>
          <td class="c">${i + 1}</td>
          <td class="c"><code>${escapeHtml(it.ma || "")}</code></td>
          <td class="slip-ten">${escapeHtml(it.ten || "")}</td>
          <td class="c slip-img-cell">${img}</td>
          <td class="c">${escapeHtml(it.dvt || "—")}</td>
          <td class="c">${Number(it.qty) || 0}</td>
          <td class="r">${giaLabel}</td>
          <td class="r">${lineLabel}</td>
        </tr>`;
      })
      .join("");

    const noteExtra = meta.note
      ? `<div class="slip-extra-note">Ghi chú NV: ${escapeHtml(meta.note)}</div>`
      : "";
    const staffLine =
      meta.staff || meta.shop
        ? `<div class="slip-staff-meta">NV: ${escapeHtml(meta.staff || "—")}${
            meta.shop ? " · " + escapeHtml(meta.shop) : ""
          } · ${escapeHtml(meta.orderId || "")}</div>`
        : `<div class="slip-staff-meta">${escapeHtml(meta.orderId || "")}</div>`;

    return `
      <div class="slip-inner">
        <header class="slip-company">
          <img class="slip-logo" src="assets/logo-excel-slip.png" alt="Vạn Phát" width="72" height="72" />
          <div class="slip-company-text">
            <div class="slip-company-name">CÔNG TY TNHH TƯ VẤN ĐẦU TƯ THƯƠNG MẠI VẠN PHÁT</div>
            <div>Địa chỉ: LK 19-06 Đường số 20 KĐT Mỹ Gia, Vĩnh Thái, Phường Nam Nha Trang</div>
            <div>Website: http://vanphatcompany.vn &nbsp;|&nbsp; Email: congtytnhhvanphat999@gmail.com</div>
            <div>Hotline: ${HOTLINE} &nbsp;|&nbsp; STK Ngân hàng NN&PTNT (Agribank): 4703201014329</div>
          </div>
        </header>
        <h1 class="slip-title">${escapeHtml(meta.title)}</h1>
        <div class="slip-date">${escapeHtml(meta.dateLabel)}</div>
        <div class="slip-customer">
          <div class="slip-customer-name"><strong>Kính gửi:</strong> ${escapeHtml(meta.customer)}</div>
          <div>(Địa chỉ: ${escapeHtml(addr)})</div>
          <div class="slip-receiver-row">
            <span>Tên người nhận: ${escapeHtml(receiver)}</span>
            <span>Điện thoại: ${escapeHtml(phone)}</span>
          </div>
          ${partnerLine}
        </div>
        <p class="slip-intro">Công ty TNHH Tư vấn đầu tư thương mại Vạn Phát trân trọng gửi đến Quý khách Danh mục sản phẩm như sau:</p>
        <table class="slip-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Mã SP</th>
              <th>Tên Sản Phẩm</th>
              <th>Hình Ảnh</th>
              <th>ĐVT</th>
              <th>Số Lượng</th>
              <th>Đơn Giá</th>
              <th>Thành Tiền</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="7" class="slip-total-label">TỔNG CỘNG</td>
              <td class="r slip-total-value">${formatSlipMoney(meta.total)}</td>
            </tr>
          </tfoot>
        </table>
        <div class="slip-notes">
          * Ghi chú:&nbsp;&nbsp;1) Đơn giá đã bao gồm thuế VAT (8%).&nbsp;&nbsp;&nbsp;&nbsp;2) Thời gian giao: 24h (khi nhận được Đơn đặt hàng).<br />
          &nbsp;&nbsp;&nbsp;&nbsp;3) Chi phí vận chuyển: Miễn phí.&nbsp;&nbsp;&nbsp;&nbsp;4) Hóa đơn VAT: xin vui lòng liên hệ Công ty.<br />
          &nbsp;&nbsp;&nbsp;&nbsp;5) Sản phẩm giao nhận chưa đạt theo Đơn đặt hàng: Quý khách vui lòng phản hồi để được đổi trả (trong 24h).
        </div>
        ${noteExtra}
        ${staffLine}
        <div class="slip-signs">
          <div class="slip-sign">
            <div class="slip-sign-title">Người nhận</div>
            <div class="slip-sign-hint">(Ký, ghi rõ họ tên)</div>
          </div>
          <div class="slip-sign">
            <div class="slip-sign-title">Người giao</div>
            <div class="slip-sign-hint">(Ký, ghi rõ họ tên)</div>
          </div>
        </div>
      </div>`;
  }

  function waitForImages(root, timeoutMs) {
    const imgs = Array.from(root.querySelectorAll("img"));
    if (!imgs.length) return Promise.resolve();
    return Promise.race([
      Promise.all(
        imgs.map(
          (img) =>
            new Promise((resolve) => {
              if (img.complete) return resolve();
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
        )
      ),
      new Promise((resolve) => setTimeout(resolve, timeoutMs || 2500)),
    ]);
  }

  async function exportPdf(mode, opts) {
    const options = opts || {};
    const meta = options.meta || getPrintMeta(mode);
    if (!meta) return null;

    const el = document.getElementById("staff-print-slip");
    if (!el) {
      showToast("Thiếu khung phiếu PDF");
      return null;
    }
    if (typeof html2pdf === "undefined") {
      showToast("Chưa tải thư viện PDF — dùng «In phiếu»");
      printSlip(mode);
      return null;
    }

    el.innerHTML = buildPrintSlipHTML(meta);
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    el.classList.add("staff-pdf-exporting");

    await waitForImages(el, 2800);

    const prefix =
      meta.mode === "quote" ? "PHIẾU BÁO GIÁ" : "PHIẾU GIAO HÀNG";
    const filename = prefix + (meta.orderId || "NV") + ".pdf";

    const opt = {
      margin: [8, 8, 8, 8],
      filename,
      image: { type: "jpeg", quality: 0.96 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: "#ffffff",
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };

    try {
      const target = el.querySelector(".slip-inner") || el;
      await html2pdf().set(opt).from(target).save();
      if (!options.silent) {
        showToast("Đã tải " + filename);
      }
    } catch (err) {
      console.warn("exportPdf failed", err);
      if (!options.silent) {
        showToast("Lỗi xuất PDF — thử «In phiếu»");
      }
      throw err;
    } finally {
      el.classList.remove("staff-pdf-exporting");
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    }
    return meta;
  }

  function printSlip(mode) {
    const meta = getPrintMeta(mode);
    if (!meta) return;
    const el = document.getElementById("staff-print-slip");
    if (!el) {
      showToast("Thiếu khung in phiếu");
      return;
    }
    el.innerHTML = buildPrintSlipHTML(meta);
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    document.body.classList.add("staff-printing");

    const cleanup = () => {
      document.body.classList.remove("staff-printing");
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    setTimeout(() => {
      try {
        window.print();
      } catch (_) {
        cleanup();
      }
      setTimeout(() => {
        if (document.body.classList.contains("staff-printing")) cleanup();
      }, 1500);
    }, 120);
  }

  async function sendBill(btn, opts) {
    const options = opts || {};
    const meta = getMeta();
    if (!meta) return null;

    const original = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Đang gửi bill…";
    }

    if (options.alsoPdf !== false) {
      try {
        await exportPdf("delivery", { silent: true, meta });
      } catch (_) {}
    }

    const orderText = buildOrderText(meta);
    const billHtml = buildBillHtmlSummary(meta);
    // Structured bill — do NOT use FormSubmit table template (ugly Name/Value dump).
    const payload = {
      _subject: "[NV BILL] " + meta.orderId + " — " + meta.staff + " / " + meta.phone,
      _captcha: "false",
      _template: "box",
      Loai: "Bill đơn nhân viên Vạn Phát (bản tóm tắt)",
      "Ma don": meta.orderId,
      "Nhan vien": meta.staff,
      "SDT khach": meta.phone,
      Tong: formatPrice(meta.total),
      "Noi dung bill (text)": orderText,
      "Noi dung bill (HTML)": billHtml,
      "Ghi chu he thong":
        "Phieu PDF layout Excel la ban chinh thuc. Nhan vien da xuat PDF tren may (dinh kem thu cong neu can). Khong gom gia von / LN.",
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

    if (STAFF_INBOX_GAS_URL) {
      const gasBody = {
        orderId: meta.orderId,
        staff: meta.staff,
        shop: meta.shop,
        customer: meta.customer,
        address: meta.address,
        receiver: meta.receiver,
        partner: meta.partner,
        phone: meta.phone,
        note: meta.note,
        total: meta.total,
        source: "staff-bill",
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
      showToast("Đã gửi bill + đã tải PDF (nếu trình duyệt cho phép)");
      openBillShareSheet(meta, orderText);
    } else {
      const subject = encodeURIComponent(payload._subject);
      const body = encodeURIComponent(
        orderText +
          "\n\n---\nĐính kèm file PDF phiếu giao hàng đã tải trên máy (Phieu_Giao_Hang_" +
          meta.orderId +
          ".pdf)."
      );
      window.open(
        "mailto:" + ORDER_EMAIL + "?subject=" + subject + "&body=" + body,
        "_blank"
      );
      showToast("Mở email — hãy đính kèm file PDF vừa tải");
      openBillShareSheet(meta, orderText);
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = original || "Gửi bill";
    }
    return meta;
  }

  function openBillShareSheet(meta, orderText) {
    let sheet = document.getElementById("staff-bill-sheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.id = "staff-bill-sheet";
      sheet.className = "staff-bill-sheet";
      sheet.innerHTML =
        '<div class="staff-bill-sheet-card" role="dialog" aria-label="Chia sẻ bill">' +
        '<button type="button" class="staff-bill-sheet-close" aria-label="Đóng">×</button>' +
        "<h3>Bill đã sẵn sàng</h3>" +
        '<p class="staff-bill-sheet-msg"></p>' +
        '<div class="staff-bill-sheet-actions">' +
        '<button type="button" class="btn btn-gold" data-bill-wa>Mở WhatsApp</button>' +
        '<button type="button" class="btn btn-outline-navy" data-bill-copy>Sao chép bill</button>' +
        '<button type="button" class="btn btn-outline-navy" data-bill-clear>Xóa đơn &amp; đóng</button>' +
        "</div></div>";
      document.body.appendChild(sheet);
      sheet.addEventListener("click", (e) => {
        if (e.target === sheet || e.target.closest(".staff-bill-sheet-close")) {
          sheet.hidden = true;
        }
        if (e.target.closest("[data-bill-wa]")) {
          const text = sheet.dataset.orderText || "";
          const phone = (sheet.dataset.phone || "").replace(/\D/g, "");
          let wa = "https://wa.me/";
          if (phone) {
            const p = phone.startsWith("0") ? "84" + phone.slice(1) : phone;
            wa += p;
          }
          wa += "?text=" + encodeURIComponent(text);
          window.open(wa, "_blank");
        }
        if (e.target.closest("[data-bill-copy]")) {
          const text = sheet.dataset.orderText || "";
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
              () => showToast("Đã sao chép bill"),
              () => showToast("Không sao chép được")
            );
          }
        }
        if (e.target.closest("[data-bill-clear]")) {
          clearCart();
          const noteEl = document.getElementById("staff-note");
          if (noteEl) noteEl.value = "";
          sheet.hidden = true;
          showToast("Đã xóa đơn");
        }
      });
    }
    sheet.dataset.orderText = orderText || "";
    sheet.dataset.phone = meta.phone || "";
    const msg = sheet.querySelector(".staff-bill-sheet-msg");
    if (msg) {
      msg.innerHTML =
        "Mã <strong>" +
        escapeHtml(meta.orderId) +
        "</strong> · Tổng <strong>" +
        escapeHtml(formatPrice(meta.total)) +
        "</strong>.<br/>File PDF đã tải (nếu được phép). Email bill là bản tóm tắt — PDF mới là phiếu chính thức.";
    }
    sheet.hidden = false;
  }

  function sendWhatsAppBill() {
    const meta = getMeta();
    if (!meta) return;
    const text = buildOrderText(meta);
    const phone = (meta.phone || "").replace(/\D/g, "");
    let wa = "https://wa.me/";
    if (phone) {
      const p = phone.startsWith("0") ? "84" + phone.slice(1) : phone;
      wa += p;
    }
    wa += "?text=" + encodeURIComponent(text);
    window.open(wa, "_blank");
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

    const exportPdfBtn = document.getElementById("staff-export-pdf");
    if (exportPdfBtn) {
      exportPdfBtn.addEventListener("click", () => {
        exportPdfBtn.disabled = true;
        const label = exportPdfBtn.textContent;
        exportPdfBtn.textContent = "Đang xuất PDF…";
        exportPdf("delivery")
          .catch(() => {})
          .finally(() => {
            exportPdfBtn.disabled = false;
            exportPdfBtn.textContent = label || "Xuất PDF";
          });
      });
    }
    const exportQuoteBtn = document.getElementById("staff-export-pdf-quote");
    if (exportQuoteBtn) {
      exportQuoteBtn.addEventListener("click", () => {
        exportQuoteBtn.disabled = true;
        const label = exportQuoteBtn.textContent;
        exportQuoteBtn.textContent = "Đang xuất…";
        exportPdf("quote")
          .catch(() => {})
          .finally(() => {
            exportQuoteBtn.disabled = false;
            exportQuoteBtn.textContent = label || "PDF báo giá";
          });
      });
    }

    const sendBillBtn = document.getElementById("staff-send-bill");
    if (sendBillBtn) {
      sendBillBtn.addEventListener("click", () => sendBill(sendBillBtn));
    }
    const waBtn = document.getElementById("staff-send-whatsapp");
    if (waBtn) {
      waBtn.addEventListener("click", () => sendWhatsAppBill());
    }

    const printDelivery = document.getElementById("staff-print-delivery");
    if (printDelivery) {
      printDelivery.addEventListener("click", () => printSlip("delivery"));
    }

    const clearBtn = document.getElementById("staff-clear-cart");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (items.length && confirm("Xóa toàn bộ dòng trong đơn?")) {
          clearCart();
        }
      });
    }

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
        chipRow.innerHTML = [
          `<button type="button" class="chip" data-nhom="">Tất cả</button>`,
        ]
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
