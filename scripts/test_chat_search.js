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
  if (result && result.mode === "alt") assertNoZero(result, "«" + query + "»");
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
  const samples = ["Giá 0đ", "0 đ", "0 ₫", "0 VNĐ", "0 đồng", "còn 0₫."];
  samples.forEach((sample) => {
    const html = decorate(sample);
    if (!html.includes("Liên hệ báo giá")) fail("decoratePlain chưa đổi «" + sample + "»: " + html);
    if (zeroDong(html) || /0\s*₫/.test(html) || /0\s*vnđ/i.test(html) || /0\s*đồng/i.test(html)) {
      fail("decoratePlain còn giá 0 trong «" + sample + "»: " + html);
    }
  });
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

function testZeroPriceQuote(search, catalog, api) {
  const found = search(catalog, "giấy in ảnh", 8);
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
  testBinder(search, catalog);
  testQuestionOnly(search, catalog);
  testZeroPriceQuote(search, catalog, api);
  testIronWhenStocked(search);
  testFallbackFilters(search);
  testFallbackDropsLeadingZeros(search);
  testDecoratePlain(api);
  if (failures.length) {
    console.error("KHÔNG ĐẠT: " + failures.length + " lỗi");
    failures.forEach((item) => console.error("- " + item));
    process.exit(1);
  }
  console.log("OK: tìm chat trên data/products.json và catalog mẫu.");
}

main();
