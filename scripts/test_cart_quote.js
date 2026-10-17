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

function standaloneZero(text) {
  return /(^|[^\d.])0\s*₫/.test(String(text || ""));
}

function formatPrice(n) {
  return (Number(n) || 0).toLocaleString("vi-VN") + " ₫";
}

function memoryStorage(seed) {
  const data = Object.assign({}, seed || {});
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

function element() {
  return {
    innerHTML: "",
    textContent: "",
    hidden: false,
    value: "",
    className: "",
    dataset: {},
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      },
    },
    setAttribute() {},
    getAttribute() {
      return "";
    },
    addEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    appendChild() {},
    focus() {},
    closest() {
      return null;
    },
  };
}

function loadScript(file, storage, extra) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  const elements = {};
  const sandbox = {
    window: {
      VanPhat: {
        formatPrice,
        placeholderSvg() {
          return "";
        },
        onImgError() {},
        HOTLINE_TEL: "0335652832",
      },
      addEventListener() {},
      open() {
        sandbox.opened = (sandbox.opened || 0) + 1;
      },
    },
    document: {
      addEventListener() {},
      getElementById(id) {
        if (!elements[id]) elements[id] = element();
        return elements[id];
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      createElement() {
        return element();
      },
      body: element(),
    },
    localStorage: storage,
    sessionStorage: memoryStorage(),
    navigator: { onLine: true },
    fetch() {
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve({ sanpham: [], nhom: [] });
        },
      });
    },
    console,
    setTimeout,
    clearTimeout,
  };
  Object.assign(sandbox, extra || {});
  sandbox.window.document = sandbox.document;
  sandbox.window.localStorage = storage;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  sandbox.elements = elements;
  return sandbox;
}

function testCustomerCart() {
  const mixed = loadScript(
    "js/cart.js",
    memoryStorage({
      vanphat_cart: JSON.stringify([
        { ma: "VP035", ten: "Giấy chưa giá", gia: 0, dvt: "Ram", qty: 1 },
        { ma: "VP204", ten: "Bút có giá", gia: 80000, dvt: "Cây", qty: 2 },
      ]),
    })
  );
  const cart = mixed.window.VanPhatCart;
  if (!cart || typeof cart.buildOrderText !== "function" || typeof cart.totalLabel !== "function") {
    fail("VanPhatCart thiếu buildOrderText hoặc totalLabel");
    return;
  }
  const text = cart.buildOrderText("Lan", "0901234567", "");
  const total = cart.totalLabel();
  if (!text.includes("Liên hệ báo giá") || !total.includes("chưa gồm các món liên hệ báo giá")) {
    fail("giỏ khách chưa ghi liên hệ báo giá hoặc chú thích tổng:\n" + text + "\n" + total);
  }
  if (!text.includes(formatPrice(160000)) || !total.includes(formatPrice(160000))) {
    fail("giỏ khách làm mất giá món đã niêm yết: " + text + " / " + total);
  }
  if (standaloneZero(text) || standaloneZero(total) || text.includes("0đ")) {
    fail("tin đặt hàng còn 0 ₫: " + text);
  }

  const quoteOnly = loadScript(
    "js/cart.js",
    memoryStorage({
      vanphat_cart: JSON.stringify([{ ma: "VP035", ten: "Giấy chưa giá", gia: 0, dvt: "Ram", qty: 3 }]),
    })
  );
  const only = quoteOnly.window.VanPhatCart;
  const onlyText = only.buildOrderText("Lan", "090", "");
  const onlyTotal = only.totalLabel();
  if (onlyTotal !== "Chưa gồm các món liên hệ báo giá" || !onlyText.includes("Liên hệ báo giá")) {
    fail("giỏ chỉ món liên hệ vẫn hiện số 0: " + onlyTotal + " / " + onlyText);
  }
  if (standaloneZero(onlyText) || standaloneZero(onlyTotal)) fail("giỏ chỉ món liên hệ còn 0 ₫");

  const empty = loadScript("js/cart.js", memoryStorage());
  if (empty.window.VanPhatCart.totalLabel() !== formatPrice(0)) {
    fail("giỏ trống phải giữ " + formatPrice(0) + ", được " + empty.window.VanPhatCart.totalLabel());
  }
  const before = empty.window.VanPhatCart.getCount();
  empty.window.VanPhatCart.add({ ma: "VP035", ten: "Giấy chưa giá", gia: 0, dvt: "Ram" }, 1);
  if (empty.window.VanPhatCart.getCount() !== before || !empty.opened) {
    fail("thêm món giá 0 vào giỏ khách phải mở Zalo và không tăng số lượng");
  }
  empty.window.VanPhatCart.add({ ma: "VP204", ten: "Bút có giá", gia: 80000, dvt: "Cây" }, 1);
  if (empty.window.VanPhatCart.getCount() !== 1 || empty.window.VanPhatCart.totalLabel() !== formatPrice(80000)) {
    fail("thêm món có giá vào giỏ khách bị hỏng");
  }
}

function testStaffOrder() {
  const mixed = loadScript(
    "js/staff-order.js",
    memoryStorage({
      vanphat_staff_cart: JSON.stringify([
        { ma: "VP035", ten: "Giấy chưa giá", gia: 0, dvt: "Ram", qty: 1 },
        { ma: "VP204", ten: "Bút có giá", gia: 80000, dvt: "Cây", qty: 1 },
      ]),
    })
  );
  const staff = mixed.window.VanPhatStaffOrder;
  if (!staff || typeof staff.cardHTML !== "function" || typeof staff.buildOrderText !== "function") {
    fail("VanPhatStaffOrder thiếu cardHTML hoặc buildOrderText");
    return;
  }
  const card = staff.cardHTML({
    ma: "VP035",
    ten: "Giấy chưa giá",
    gia: 0,
    dvt: "Ram",
    anh: "",
    nhom: "Giấy",
  });
  if (!card.includes("Liên hệ báo giá") || !card.includes("Thêm vào đơn")) {
    fail("thẻ sổ nhân viên mất giá liên hệ hoặc nút Thêm vào đơn");
  }
  if (standaloneZero(card)) fail("thẻ sổ nhân viên còn 0 ₫: " + card);
  const pricedCard = staff.cardHTML({
    ma: "VP204",
    ten: "Bút có giá",
    gia: 80000,
    dvt: "Cây",
    anh: "",
    nhom: "Bút",
  });
  if (!pricedCard.includes(formatPrice(80000)) || !pricedCard.includes("Thêm vào đơn")) {
    fail("thẻ sổ nhân viên món có giá bị đổi nhầm");
  }

  const bill = staff.buildOrderText({
    orderId: "T1",
    staff: "Hà",
    shop: "",
    customer: "A",
    address: "",
    receiver: "",
    phone: "090",
    partner: "",
    note: "",
    total: 80000,
  });
  if (!bill.includes("Liên hệ báo giá") || !bill.includes("chưa gồm các món liên hệ báo giá")) {
    fail("bill nhân viên thiếu liên hệ báo giá:\n" + bill);
  }
  if (!bill.includes(formatPrice(80000)) || standaloneZero(bill)) {
    fail("bill nhân viên sai giá hoặc còn 0 ₫:\n" + bill);
  }

  staff.renderCart();
  const totalEl = mixed.elements["staff-cart-total"];
  const body = mixed.elements["staff-cart-body"];
  if (!totalEl || !body || !String(totalEl.textContent).includes("chưa gồm các món liên hệ báo giá")) {
    fail("bảng sổ đơn chưa chú thích tổng");
  }
  if (!String(body.innerHTML).includes("Liên hệ báo giá") || standaloneZero(body.innerHTML)) {
    fail("dòng sổ đơn còn 0 ₫ hoặc thiếu liên hệ báo giá");
  }

  const empty = loadScript("js/staff-order.js", memoryStorage());
  empty.window.VanPhatStaffOrder.add({ ma: "VP035", ten: "Giấy chưa giá", gia: 0, dvt: "Ram" }, 2);
  empty.window.VanPhatStaffOrder.renderCart();
  const added = empty.elements["staff-cart-body"];
  const addedTotal = empty.elements["staff-cart-total"];
  if (!added || !String(added.innerHTML).includes("VP035") || !String(added.innerHTML).includes("Liên hệ báo giá")) {
    fail("sổ nhân viên không nhận món giá 0");
  }
  if (!addedTotal || addedTotal.textContent !== "Chưa gồm các món liên hệ báo giá" || standaloneZero(added.innerHTML)) {
    fail("sổ nhân viên món giá 0 vẫn hiện 0 ₫: " + (addedTotal && addedTotal.textContent));
  }
  if (empty.opened) fail("sổ nhân viên không được đẩy món giá 0 sang Zalo");

  const blank = loadScript("js/staff-order.js", memoryStorage());
  blank.window.VanPhatStaffOrder.renderCart();
  if (blank.elements["staff-cart-total"].textContent !== formatPrice(0)) {
    fail("sổ trống phải giữ " + formatPrice(0));
  }
}

function main() {
  testCustomerCart();
  testStaffOrder();
  if (failures.length) {
    console.error("KHÔNG ĐẠT: " + failures.length + " lỗi");
    failures.forEach((item) => console.error("- " + item));
    process.exit(1);
  }
  console.log("OK: giỏ khách và sổ nhân viên với món giá 0.");
}

main();
