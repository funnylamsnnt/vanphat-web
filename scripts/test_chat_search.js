#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const failures = [];

function fail(msg) {
  failures.push(msg);
}

function loadSearch() {
  const code = fs.readFileSync(path.join(root, "js/chat-widget.js"), "utf8");
  const sandbox = {
    window: {},
    document: { addEventListener() {} },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "js/chat-widget.js" });
  const api = sandbox.window.VanPhatChatFormat || {};
  if (typeof api.searchCatalogSmart !== "function") fail("searchCatalogSmart không gắn lên window.VanPhatChatFormat");
  return api;
}

function loadCatalog() {
  return JSON.parse(fs.readFileSync(path.join(root, "data/products.json"), "utf8"));
}

function mas(result) {
  return (result && result.items ? result.items : []).map((p) => p.ma);
}

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function isIron(ten) {
  const n = normName(ten);
  return n.includes("ban la") || n.includes("ban ui");
}

function assertNoZero(result, label) {
  (result.items || []).forEach((p) => {
    if (!(Number(p.gia) > 0)) fail(label + ": gợi ý giá 0 hoặc trống " + p.ma + " " + p.ten);
  });
}

function assertNoExcluded(result, label) {
  (result.items || []).forEach((p) => {
    if (/không đưa lên web/i.test(String(p.nhom || ""))) {
      fail(label + ": trả món nhóm Không đưa lên web " + p.ma);
    }
  });
}

function testPencils(search, catalog) {
  const result = search(catalog, "bút chì", 8);
  if (!result || result.mode !== "match") {
    fail("«bút chì»: muốn khớp đúng, được mode=" + (result && result.mode));
    return;
  }
  const banned = new Set(["VP111", "VP112", "VP113", "VP114"]);
  (result.items || []).forEach((p) => {
    if (banned.has(p.ma) || /^bút bi\b/i.test(p.ten)) {
      fail("«bút chì»: trả bút bi làm khớp đúng " + p.ma + " " + p.ten);
    }
  });
  if (!(result.items || []).some((p) => /bút chì/i.test(p.ten))) {
    fail("«bút chì»: không thấy bút chì trong khớp đúng");
  }
}

function testPhotoPaper(search, catalog) {
  const result = search(catalog, "giấy in ảnh", 8);
  if (!result || result.mode !== "match") {
    fail("«giấy in ảnh»: muốn khớp đúng, được mode=" + (result && result.mode));
    return;
  }
  const banned = new Set(["VP241", "VP242", "VP243"]);
  (result.items || []).forEach((p) => {
    if (banned.has(p.ma)) fail("«giấy in ảnh»: trả " + p.ma + " " + p.ten + " làm khớp đúng");
  });
  if (!(result.items || []).some((p) => /giấy in ảnh/i.test(p.ten))) {
    fail("«giấy in ảnh»: không thấy giấy in ảnh trong khớp đúng");
  }
}

function testIron(search, catalog, query) {
  const result = search(catalog, query, 8);
  const priced = (catalog.sanpham || []).filter(
    (p) =>
      p &&
      isIron(p.ten) &&
      p.linhVucId === "dien-gia-dung" &&
      Number(p.gia) > 0 &&
      !/không đưa lên web/i.test(String(p.nhom || ""))
  );
  if (priced.length) {
    const got = new Set(mas(result));
    const hit = priced.filter((p) => got.has(p.ma));
    if (!result || result.mode !== "match" || !hit.length) {
      fail(
        "«" +
          query +
          "»: catalog có " +
          priced.map((p) => p.ma).join(", ") +
          " nhưng mode=" +
          (result && result.mode) +
          " mã=" +
          mas(result).join(",")
      );
    }
  } else if (!result || result.mode !== "alt" || !(result.items && result.items.length)) {
    fail(
      "«" +
        query +
        "»: không có món điện phù hợp, muốn gợi ý thay thế, được mode=" +
        (result && result.mode) +
        " n=" +
        (result && result.items && result.items.length)
    );
  }
  if (result && result.mode === "alt") {
    assertNoZero(result, "«" + query + "»");
    (result.items || []).forEach((p) => {
      if (p.nhom !== "Điện") fail("«" + query + "»: gợi ý không thuộc Điện " + p.ma + " " + p.ten);
    });
  }
  assertNoExcluded(result, "«" + query + "»");
}

function testBinder(search, catalog) {
  const result = search(catalog, "giá bìa còng 7cm bao nhiêu", 8);
  if (!result || result.mode !== "match") {
    fail("«giá bìa còng 7cm bao nhiêu»: muốn khớp đúng, được mode=" + (result && result.mode));
    return;
  }
  const got = new Set(mas(result));
  ["VP076", "VP069"].forEach((ma) => {
    if (!got.has(ma)) fail("«giá bìa còng 7cm bao nhiêu»: thiếu " + ma + " (có " + mas(result).join(", ") + ")");
  });
}

function testQuestionOnly(search, catalog) {
  const result = search(catalog, "giá bao nhiêu chị ơi", 8);
  if (!result || result.mode !== "none" || (result.items && result.items.length)) {
    fail("câu chỉ có từ hỏi phải trống, được mode=" + (result && result.mode) + " mã=" + mas(result).join(","));
  }
}

function testIronWhenStocked(search) {
  const catalog = {
    linh_vuc: [{ id: "dien-gia-dung", visible: true }],
    nhom: [{ id: "dien", TenNhom: "Điện", visible: true, moTa: "bàn là và bàn ủi" }],
    sanpham: [
      {
        ma: "D01",
        ten: "Bàn là hơi nước",
        nhom: "Điện",
        nhomId: "dien",
        linhVucId: "dien-gia-dung",
        gia: 350000,
      },
      {
        ma: "D02",
        ten: "Bàn ủi khô Philips",
        nhom: "Điện",
        nhomId: "dien",
        linhVucId: "dien-gia-dung",
        gia: 250000,
      },
      {
        ma: "B01",
        ten: "Bút bi xanh",
        nhom: "Điện",
        nhomId: "dien",
        linhVucId: "dien-gia-dung",
        gia: 5000,
      },
    ],
  };
  const la = search(catalog, "bàn là", 8);
  const ui = search(catalog, "bàn ủi", 8);
  if (!la || la.mode !== "match" || mas(la).indexOf("D01") === -1) {
    fail("catalog có bàn là: muốn khớp D01, được " + (la && la.mode) + " " + mas(la).join(","));
  }
  if (la && mas(la).indexOf("B01") !== -1) fail("bàn là không được khớp bút bi");
  if (!ui || ui.mode !== "match" || mas(ui).indexOf("D02") === -1) {
    fail("catalog có bàn ủi: muốn khớp D02, được " + (ui && ui.mode) + " " + mas(ui).join(","));
  }
}

function testFallbackFilters(search) {
  const catalog = {
    linh_vuc: [
      { id: "dien-gia-dung", visible: true },
      { id: "an", visible: false },
    ],
    nhom: [
      { id: "dien", TenNhom: "Điện", visible: true, moTa: "quạt bàn và thiết bị điện" },
      { id: "cam", TenNhom: "Không đưa lên web", visible: true, moTa: "quạt nội bộ" },
      { id: "hidden", TenNhom: "Nhóm ẩn", visible: false, moTa: "quạt ẩn" },
    ],
    sanpham: [
      { ma: "Z0", ten: "Ổ cắm điện đỏ", nhom: "Điện", nhomId: "dien", linhVucId: "dien-gia-dung", gia: 0 },
      { ma: "Z1", ten: "Ổ cắm điện xanh", nhom: "Điện", nhomId: "dien", linhVucId: "dien-gia-dung", gia: 50000 },
      { ma: "Z2", ten: "Ổ cắm điện vàng", nhom: "Điện", nhomId: "dien", linhVucId: "dien-gia-dung", gia: 60000 },
      { ma: "Z3", ten: "Dây điện 2m", nhom: "Điện", nhomId: "dien", linhVucId: "dien-gia-dung", gia: 20000 },
      { ma: "H1", ten: "Quạt nội bộ", nhom: "Không đưa lên web", nhomId: "cam", linhVucId: "dien-gia-dung", gia: 99000 },
      { ma: "H2", ten: "Quạt ẩn", nhom: "Nhóm ẩn", nhomId: "hidden", linhVucId: "an", gia: 99000 },
    ],
  };
  const result = search(catalog, "quạt", 8);
  const got = new Set(mas(result));
  if (!result || result.mode !== "alt") {
    fail("gợi ý theo mô tả nhóm: muốn mode alt, được " + (result && result.mode));
    return;
  }
  if (!got.has("Z1") || !got.has("Z3")) fail("gợi ý theo mô tả nhóm thiếu món có giá " + mas(result).join(","));
  if (got.has("Z0")) fail("gợi ý theo mô tả nhóm trả món giá 0 Z0");
  if (got.has("Z2")) fail("gợi ý theo mô tả nhóm trả món gần trùng Z2");
  if (got.has("H1") || got.has("H2")) fail("gợi ý theo mô tả nhóm trả món nhóm ẩn " + mas(result).join(","));
  assertNoZero(result, "gợi ý theo mô tả nhóm");
}

function testFallbackDropsLeadingZeros(search) {
  const base = {
    linh_vuc: [{ id: "vpp", visible: true }],
    nhom: [{ id: "keo", TenNhom: "Băng keo", visible: true, moTa: "keo dan thung" }],
  };
  const leading = search(
    Object.assign({}, base, {
      sanpham: [
        { ma: "K0", ten: "Hop carton do", nhom: "Băng keo", nhomId: "keo", linhVucId: "vpp", gia: 0 },
        { ma: "K1", ten: "Hop carton vang", nhom: "Băng keo", nhomId: "keo", linhVucId: "vpp", gia: "" },
        { ma: "K2", ten: "Hop carton xanh", nhom: "Băng keo", nhomId: "keo", linhVucId: "vpp", gia: 15000 },
      ],
    }),
    "keo dan",
    8
  );
  const got = mas(leading);
  if (!leading || leading.mode !== "alt" || got.indexOf("K2") === -1) {
    fail("món đầu nhóm giá 0: muốn gợi ý K2, được " + (leading && leading.mode) + " " + got.join(","));
  }
  if (got.indexOf("K0") !== -1 || got.indexOf("K1") !== -1) {
    fail("món đầu nhóm giá 0 hoặc trống vẫn được gợi ý: " + got.join(","));
  }
  assertNoZero(leading, "món đầu nhóm");
  const none = search(
    Object.assign({}, base, {
      sanpham: [
        { ma: "K0", ten: "Hop carton do", nhom: "Băng keo", nhomId: "keo", linhVucId: "vpp", gia: 0 },
        { ma: "K1", ten: "Hop carton vang", nhom: "Băng keo", nhomId: "keo", linhVucId: "vpp", gia: null },
      ],
    }),
    "keo dan",
    8
  );
  if (!none || none.mode !== "none" || mas(none).length) {
    fail("cả nhóm giá 0 phải mode none, được " + (none && none.mode) + " " + mas(none).join(","));
  }
}

function testDecoratePlain(api) {
  const decorate = api && api.decoratePlain;
  if (typeof decorate !== "function") {
    fail("decoratePlain không gắn lên window.VanPhatChatFormat");
    return;
  }
  const samples = ["Giá 0đ", "0 đ", "0 ₫", "0 VNĐ", "0 vnđ", "0 đồng", "0 Đồng", "0 ĐỒNG", "còn 0₫."];
  samples.forEach((sample) => {
    const html = decorate(sample);
    if (!html.includes("Liên hệ báo giá")) fail("decoratePlain chưa đổi «" + sample + "»: " + html);
    if (zeroDong(html) || /0\s*₫/.test(html) || /0\s*vnđ/i.test(html) || /0\s*đồng/i.test(html)) {
      fail("decoratePlain còn giá 0 trong «" + sample + "»: " + html);
    }
  });
  ["từ 0 đến 5", "có 0 đơn", "0 đơn", "0 đơn hàng", "0 đầu", "20đ"].forEach((sample) => {
    const html = decorate(sample);
    if (html !== sample) fail("decoratePlain đổi nhầm «" + sample + "»: " + html);
  });
  const range = decorate("từ 15.000 đến 20.000đ");
  if (!range.includes("15.000 đến") || !range.includes("20.000đ") || range.includes("Liên hệ báo giá")) {
    fail("decoratePlain nuốt «đ» của «đến»: " + range);
  }
  const bareRange = decorate("từ 1.000 đến 5.000");
  if (bareRange !== "từ 1.000 đến 5.000") {
    fail("decoratePlain nuốt chữ đ trong «từ 1.000 đến 5.000»: " + bareRange);
  }
  const priced = decorate("10.000đ");
  if (!priced.includes("10.000đ") || priced.includes("Liên hệ báo giá")) {
    fail("decoratePlain đụng 10.000đ: " + priced);
  }
  const kept = decorate("Còn 10.000đ và 20đ, không phải 0đ.");
  if (!kept.includes("10.000đ") || !kept.includes("20đ")) {
    fail("decoratePlain đụng giá khác 0: " + kept);
  }
  if (!kept.includes("Liên hệ báo giá") || zeroDong(kept)) {
    fail("decoratePlain chưa gỡ 0đ đứng riêng khi cạnh giá khác: " + kept);
  }
  if (decorate("") !== "" || decorate(null) !== "") fail("decoratePlain chuỗi rỗng phải trả về rỗng");
}

function zeroDong(text) {
  return /(^|[^0-9.])0\s*đ/.test(String(text || ""));
}

function testPlainPencilQuestion(search, catalog) {
  const result = search(catalog, "gia bao nhieu but chi", 8);
  if (!result || result.mode !== "match") {
    fail("«gia bao nhieu but chi»: muốn khớp đúng, được mode=" + (result && result.mode));
    return;
  }
  const banned = new Set(["VP111", "VP112", "VP113", "VP114"]);
  (result.items || []).forEach((p) => {
    if (banned.has(p.ma) || /^bút bi\b/i.test(p.ten)) {
      fail("«gia bao nhieu but chi»: trả bút bi làm khớp đúng " + p.ma + " " + p.ten);
    }
  });
  if (!(result.items || []).some((p) => /bút chì/i.test(p.ten))) {
    fail("«gia bao nhieu but chi»: không thấy bút chì");
  }
  const lone = search(catalog, "chi", 8);
  if (!lone || !lone.items || !lone.items.length) {
    fail("từ đơn không dấu «chi» bị lọc mất, không còn kết quả");
  }
  const ask = search(catalog, "co ban khong", 8);
  if (!ask || ask.mode !== "none" || (ask.items && ask.items.length)) {
    fail("cụm «co ban khong» phải bị bỏ, được mode=" + (ask && ask.mode));
  }
  const ban = search(catalog, "ban", 8);
  if (!ban || !ban.items || !ban.items.length) {
    fail("từ đơn không dấu «ban» bị lọc như stopword");
  }
}

function testAppliancePhrases(search) {
  const catalog = {
    linh_vuc: [
      { id: "dien-gia-dung", visible: true },
      { id: "vpp", visible: true },
    ],
    nhom: [
      { id: "dien", TenNhom: "Điện", visible: true, moTa: "ổ cắm" },
      { id: "bia", TenNhom: "Bìa Hồ Sơ", visible: true, moTa: "bìa lá" },
    ],
    sanpham: [
      { ma: "E0", ten: "Ổ cắm điện đỏ", nhom: "Điện", nhomId: "dien", linhVucId: "dien-gia-dung", gia: 0 },
      { ma: "E1", ten: "Ổ cắm điện xanh", nhom: "Điện", nhomId: "dien", linhVucId: "dien-gia-dung", gia: 90000 },
      { ma: "E2", ten: "Dây điện 2m", nhom: "Điện", nhomId: "dien", linhVucId: "dien-gia-dung", gia: 20000 },
      { ma: "L1", ten: "Bìa lá A4", nhom: "Bìa Hồ Sơ", nhomId: "bia", linhVucId: "vpp", gia: 15000 },
      { ma: "H1", ten: "Hóa đơn bán lẻ", nhom: "Bìa Hồ Sơ", nhomId: "bia", linhVucId: "vpp", gia: 30000 },
      { ma: "Z9", ten: "Bàn ủi mini", nhom: "Điện", nhomId: "dien", linhVucId: "dien-gia-dung", gia: 0 },
    ],
  };
  ["bàn là", "nồi cơm", "bình đun", "ban la", "noi com", "binh dun"].forEach((query) => {
    const result = search(catalog, query, 8);
    const got = new Set(mas(result));
    if (!result || result.mode !== "alt") {
      fail("«" + query + "»: chưa có món, muốn gợi ý Điện, được " + (result && result.mode));
      return;
    }
    if (got.has("L1") || got.has("H1") || got.has("E0")) {
      fail("«" + query + "»: gợi ý sai " + mas(result).join(","));
    }
    if (!got.has("E1") || !got.has("E2")) fail("«" + query + "»: thiếu món Điện có giá " + mas(result).join(","));
    assertNoZero(result, "«" + query + "»");
  });
  const kept = search(catalog, "bàn ủi giá bao nhiêu", 8);
  if (!kept || kept.mode !== "match" || mas(kept).indexOf("Z9") === -1) {
    fail("khớp đúng «bàn ủi» giá 0 phải giữ Z9, được " + (kept && kept.mode) + " " + mas(kept).join(","));
  }
  if (kept && mas(kept).indexOf("H1") !== -1) fail("khớp đúng bàn ủi kéo theo hóa đơn bán lẻ");
}

function testSkuQuestion(search, catalog, api) {
  const cases = [
    ["cho xem VP117", "VP117"],
    ["vp117", "VP117"],
    ["thông tin mã VP123", "VP123"],
    ["thong tin VP117", "VP117"],
  ];
  cases.forEach((pair) => {
    const query = pair[0];
    const ma = pair[1];
    const result = search(catalog, query, 8);
    const got = mas(result);
    if (!result || result.mode !== "match" || got.length !== 1 || got[0] !== ma) {
      fail("«" + query + "»: muốn khớp đúng " + ma + ", được " + (result && result.mode) + " " + got.join(","));
      return;
    }
    if (Number(result.items[0].gia) > 0) fail("«" + query + "»: " + ma + " phải là món giá 0 trong catalog");
    const block = api.formatCatalogBlock(result.items, result.mode);
    if (!block.includes(ma) || !block.includes("Liên hệ báo giá") || zeroDong(block)) {
      fail("«" + query + "»: khối catalog chưa ghi Liên hệ báo giá cho " + ma + ": " + block);
    }
  });
  const hidden = {
    linh_vuc: [
      { id: "vpp", visible: true },
      { id: "an", visible: false },
    ],
    nhom: [
      { id: "but", TenNhom: "Bút & Mực", visible: true },
      { id: "cam", TenNhom: "Không đưa lên web", visible: true },
      { id: "hidden", TenNhom: "Nhóm ẩn", visible: false },
    ],
    sanpham: [
      { ma: "VP117", ten: "Bút ẩn", nhom: "Nhóm ẩn", nhomId: "hidden", linhVucId: "an", gia: 0 },
      { ma: "VP118", ten: "Bút nội bộ", nhom: "Không đưa lên web", nhomId: "cam", linhVucId: "vpp", gia: 0 },
      { ma: "VP204", ten: "Bút có giá", nhom: "Bút & Mực", nhomId: "but", linhVucId: "vpp", gia: 80000 },
    ],
  };
  ["cho xem VP117", "VP118", "vp118"].forEach((query) => {
    const result = search(hidden, query, 8);
    const got = mas(result);
    if (got.indexOf("VP117") !== -1 || got.indexOf("VP118") !== -1) {
      fail("«" + query + "»: mã nhóm ẩn vẫn lọt " + got.join(","));
    }
  });
  const shown = search(hidden, "vp204", 8);
  if (!shown || shown.mode !== "match" || mas(shown).join(",") !== "VP204") {
    fail("mã đang hiện phải khớp đúng VP204, được " + (shown && shown.mode) + " " + mas(shown).join(","));
  }
}

function testZeroPriceQuote(search, catalog, api) {
  const found = search(catalog, "giấy in ảnh", 8);
  if (!found || found.mode !== "match" || !(found.items || []).some((p) => !(Number(p.gia) > 0))) {
    fail("khớp đúng «giấy in ảnh» phải giữ món giá 0");
  }
  ["match", "alt"].forEach((mode) => {
    const block = api.formatCatalogBlock(found.items, mode);
    if (!block.includes("Liên hệ báo giá")) fail("khối " + mode + " giá 0 thiếu «Liên hệ báo giá»");
    if (zeroDong(block) || /giá web:\s*0(?!\d)/.test(block)) fail("khối " + mode + " còn báo 0đ");
  });
  const index = api.buildCatalogIndex(catalog);
  const html = api.renderBotHtml("[[SP:VP239]]", index);
  if (!html.includes("Liên hệ báo giá")) fail("thẻ chat VP239 thiếu «Liên hệ báo giá»");
  if (zeroDong(html)) fail("thẻ chat VP239 còn 0đ");
  const blank = api.formatCatalogBlock(
    [{ ma: "Z9", ten: "Món chưa giá", nhom: "Điện", dvt: "Cái", gia: "" }],
    "match"
  );
  if (!blank.includes("Liên hệ báo giá") || zeroDong(blank) || /giá web:\s*0(?!\d)/.test(blank)) {
    fail("giá trống chưa thành Liên hệ báo giá");
  }
}

function withoutSkuCards(html) {
  return String(html || "").replace(/<article class="vp-chat-sku">[\s\S]*?<\/article>/g, "");
}

function testQuotePriceSkuLine(api, catalog) {
  const byMa = {};
  (catalog.sanpham || []).forEach((p) => {
    if (p && p.ma) byMa[p.ma] = p;
  });
  const priced = ["VP111", "VP076"].map((ma) => byMa[ma]);
  const quote = byMa.VP123;
  if (priced.some((p) => !p || !p.ten) || !quote || !quote.ten) {
    fail("thiếu VP111, VP076 hoặc VP123 trong catalog để test dòng Liên hệ báo giá");
    return;
  }
  const index = api.buildCatalogIndex(catalog);
  ["Liên hệ báo giá", "lien he bao gia", "LIÊN HỆ BÁO GIÁ"].forEach((label) => {
    const lines = priced.map((p) => p.ten + " · " + p.ma + " · 12.000đ");
    lines.push(quote.ten + " · " + quote.ma + " · " + label);
    lines.push("[[SP:" + priced.map((p) => p.ma).concat(quote.ma).join(",") + "]]");
    const html = api.renderBotHtml(lines.join("\n"), index);
    const prose = withoutSkuCards(html);
    const cards = (html.match(/<article class="vp-chat-sku">/g) || []).length;
    if (cards !== 3) fail("«" + label + "»: muốn 3 thẻ, được " + cards);
    [quote.ten, quote.ma, priced[0].ten, priced[0].ma, priced[1].ten, priced[1].ma, "báo giá", "bao gia"].forEach((bit) => {
      if (bit && prose.toLowerCase().includes(String(bit).toLowerCase())) {
        fail("«" + label + "»: còn dòng món trong chữ («" + bit + "»)");
      }
    });
  });
  const kept = api.renderBotHtml(
    "Nhờ anh liên hệ báo giá giúp em.\n" + quote.ten + " · " + quote.ma + " · Liên hệ báo giá\n[[SP:" + quote.ma + "]]",
    index
  );
  const keptProse = withoutSkuCards(kept);
  if (!keptProse.toLowerCase().includes("nhờ anh liên hệ báo giá")) {
    fail("câu không có mã bị xóa: " + keptProse);
  }
  if (keptProse.includes(quote.ten) || keptProse.includes(quote.ma)) {
    fail("dòng VP123 Liên hệ báo giá còn trong chữ");
  }
  const outside = api.renderBotHtml(
    quote.ten + " · " + quote.ma + " · Liên hệ báo giá\n[[SP:VP111]]",
    index
  );
  const outsideProse = withoutSkuCards(outside);
  if (!outsideProse.includes(quote.ma)) {
    fail("mã không có trong [[SP:]] vẫn bị xóa khỏi chữ");
  }
}

function main() {
  const api = loadSearch();
  const search = api && api.searchCatalogSmart;
  if (!search) {
    console.error("KHÔNG ĐẠT: " + failures.join("\n"));
    process.exit(1);
  }
  const catalog = loadCatalog();
  testPencils(search, catalog);
  testPhotoPaper(search, catalog);
  testIron(search, catalog, "bàn là");
  testIron(search, catalog, "bàn ủi");
  testPlainPencilQuestion(search, catalog);
  testAppliancePhrases(search);
  testSkuQuestion(search, catalog, api);
  testBinder(search, catalog);
  testQuestionOnly(search, catalog);
  testZeroPriceQuote(search, catalog, api);
  testIronWhenStocked(search);
  testFallbackFilters(search);
  testFallbackDropsLeadingZeros(search);
  testDecoratePlain(api);
  testQuotePriceSkuLine(api, catalog);
  if (failures.length) {
    console.error("KHÔNG ĐẠT: " + failures.length + " lỗi");
    failures.forEach((item) => console.error("- " + item));
    process.exit(1);
  }
  console.log("OK: tìm chat trên data/products.json và catalog mẫu.");
}

main();
