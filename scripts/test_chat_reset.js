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

function loadApi() {
  const code = fs.readFileSync(path.join(root, "js/chat-widget.js"), "utf8");
  const sandbox = {
    window: {},
    document: { addEventListener() {} },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "js/chat-widget.js" });
  const api = sandbox.window.VanPhatChatFormat || {};
  if (typeof api.resetChatState !== "function") fail("resetChatState không gắn lên window.VanPhatChatFormat");
  if (typeof api.requestChatReset !== "function") fail("requestChatReset không gắn lên window.VanPhatChatFormat");
  if (typeof api.chatSessionId !== "function") fail("chatSessionId không gắn lên window.VanPhatChatFormat");
  return api;
}

function memStore(initial) {
  const data = Object.assign({}, initial || {});
  return {
    get length() {
      return Object.keys(data).length;
    },
    key(index) {
      return Object.keys(data)[index] || null;
    },
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

function harness(api) {
  const history = [
    { role: "user", text: "bút chì" },
    { role: "model", text: "Bút chì bấm" },
  ];
  const session = memStore({ [api.CHAT_SESSION_KEY]: "old-session" });
  const local = memStore({
    "vp-chat-history": '[{"role":"user"}]',
    vp_chat_transcript: "bản chat cũ",
    "vp-chat-session": "old-session",
    vp_chat_bills: '[{"sdt":"0900000000"}]',
    vanphat_cart: '[{"ma":"VP124","qty":2}]',
    vanphat_staff_cart: "[]",
    vanphat_viewed: '["VP204"]',
  });
  const messages = { innerHTML: '<div class="vp-bubble">cũ</div>' };
  const leadAttrs = { hidden: null };
  const leadBox = {
    setAttribute(name, value) {
      leadAttrs[name] = value;
    },
    getAttribute(name) {
      return leadAttrs[name];
    },
  };
  const quickAttrs = { hidden: "true" };
  const quick = {
    removeAttribute(name) {
      delete quickAttrs[name];
    },
    getAttribute(name) {
      return quickAttrs[name];
    },
  };
  let removed = false;
  const hits = [{ classList: { classes: ["product-card", "vp-chat-hit"], remove(name) { this.classes = this.classes.filter((c) => c !== name); } } }];
  const sync = { remove() { removed = true; } };
  const catalogBridge = { _pendingCodes: ["VP123"] };
  let welcomed = 0;
  let invalidated = 0;
  const state = {
    history,
    sessionStorage: session,
    localStorage: local,
    messages,
    leadBox,
    quick,
    document: {
      getElementById(id) {
        return id === "vp-chat-sync" ? sync : null;
      },
      querySelectorAll(sel) {
        return sel === ".vp-chat-hit" ? hits : [];
      },
    },
    catalogBridge,
    invalidate() {
      invalidated += 1;
    },
    showWelcome() {
      welcomed += 1;
      messages.innerHTML = '<div class="vp-bubble">Xin chào</div>';
      quick.removeAttribute("hidden");
    },
  };
  return { history, session, local, messages, leadAttrs, quickAttrs, hits, catalogBridge, state, get removed() { return removed; }, get welcomed() { return welcomed; }, get invalidated() { return invalidated; } };
}

function testCancel(api) {
  const box = harness(api);
  const asked = [];
  const ok = api.requestChatReset(box.state, (message) => {
    asked.push(message);
    return false;
  });
  if (ok) fail("từ chối xác nhận vẫn xóa chat");
  if (asked[0] !== api.CHAT_RESET_CONFIRM) fail("câu xác nhận không đúng: " + asked[0]);
  if (box.history.length !== 2) fail("từ chối vẫn xóa history");
  if (box.session.getItem(api.CHAT_SESSION_KEY) !== "old-session") fail("từ chối vẫn xóa session");
  if (box.invalidated !== 0) fail("từ chối vẫn hủy phiên đang gửi");
  if (box.welcomed !== 0) fail("từ chối vẫn hiện lại câu chào");
}

function testReset(api) {
  const box = harness(api);
  const oldId = api.chatSessionId(box.session);
  if (oldId !== "old-session") fail("chatSessionId không đọc id đang có");
  const ok = api.requestChatReset(box.state, () => true);
  if (!ok) fail("xác nhận không chạy reset");
  if (box.invalidated !== 1) fail("chưa hủy request chat đang gửi");
  if (box.history.length !== 0) fail("history còn " + box.history.length + " tin");
  if (box.session.getItem(api.CHAT_SESSION_KEY) != null) fail("sessionId cũ còn trong sessionStorage");
  const nextId = api.chatSessionId(box.session);
  if (!nextId || nextId === "old-session") fail("chatSessionId không tạo id mới sau khi xóa");
  if (box.local.getItem("vp-chat-history") != null) fail("localStorage còn vp-chat-history");
  if (box.local.getItem("vp_chat_transcript") != null) fail("localStorage còn bản transcript");
  if (box.local.getItem("vp-chat-session") != null) fail("localStorage còn session chat");
  if (box.local.getItem("vp_chat_bills") !== '[{"sdt":"0900000000"}]') fail("reset xóa bill đã lưu");
  if (box.local.getItem("vanphat_cart") !== '[{"ma":"VP124","qty":2}]') fail("reset xóa giỏ hàng");
  if (box.local.getItem("vanphat_staff_cart") !== "[]") fail("reset xóa sổ đơn nhân viên");
  if (box.local.getItem("vanphat_viewed") !== '["VP204"]') fail("reset xóa sản phẩm đã xem");
  if (box.leadAttrs.hidden !== "true") fail("leadBox chưa ẩn");
  if (box.quickAttrs.hidden != null) fail("quick reply chưa hiện lại");
  if (!box.removed) fail("chưa gỡ khối Sản phẩm vừa trao đổi");
  if (box.hits[0].classList.classes.indexOf("vp-chat-hit") !== -1) fail("còn viền sản phẩm vừa trao đổi");
  if (box.catalogBridge._pendingCodes != null) fail("còn mã chờ hiện lên trang");
  if (box.welcomed !== 1) fail("chưa hiện lại câu chào");
  if (!String(box.messages.innerHTML).includes("Xin chào")) fail("khung chat không còn câu chào");
}

function testButtonMarkup() {
  const src = fs.readFileSync(path.join(root, "js/chat-widget.js"), "utf8");
  if (!src.includes('className: "vp-chat-clear"')) fail("thiếu nút vp-chat-clear");
  if (!src.includes('"aria-label": "Xóa nội dung chat"')) fail("nút xóa thiếu aria-label");
  const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
  const block = css.match(/\.vp-chat-clear\s*\{([^}]+)\}/);
  if (!block || !/min-height:\s*40px/.test(block[1]) || !/min-width:\s*40px/.test(block[1])) {
    fail("nút xóa chưa có vùng bấm 40px");
  }
}

function main() {
  const api = loadApi();
  if (!failures.length) {
    testCancel(api);
    testReset(api);
    testButtonMarkup();
  }
  if (failures.length) {
    console.error("KHÔNG ĐẠT: " + failures.length + " lỗi");
    failures.forEach((item) => console.error("- " + item));
    process.exit(1);
  }
  console.log("OK: reset chat xóa hội thoại, giữ giỏ và bill");
}

main();
