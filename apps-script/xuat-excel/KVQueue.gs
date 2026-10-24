/**
 * Khung hàng đợi KV_Queue trên sổ v7.
 * Chưa gọi API KiotViet: chưa có Client ID. fetchKiotViet ném lỗi rõ.
 * Hàm tạo tab và hàm upsert nhận bill đã chuẩn hóa, chạy được khi có dữ liệu.
 */

function moSoV7_() {
  return SpreadsheetApp.openById(V7_ID);
}

/** Tạo tab KV_Queue và hàng tiêu đề A:N nếu chưa có. Không xóa dòng đã ghi. */
function taoTabKVQueue_(ss) {
  var sh = ss.getSheetByName(TEN_KV);
  if (!sh) sh = ss.insertSheet(TEN_KV);
  var headerOk = false;
  if (sh.getLastRow() >= 1) {
    var h = sh.getRange(1, 1, 1, COT_KV.length).getValues()[0];
    headerOk = COT_KV.every(function (ten, i) { return String(h[i] || '') === ten; });
  }
  if (!headerOk) sh.getRange(1, 1, 1, COT_KV.length).setValues([COT_KV.slice()]);
  return sh;
}

function taoTabKVQueue() {
  var sh = taoTabKVQueue_(moSoV7_());
  return 'Đã có tab ' + TEN_KV + ' (' + COT_KV.length + ' cột) trên sổ ' + V7_ID;
}

function docBangKV_(sh) {
  var last = sh.getLastRow();
  if (last < 1) return [COT_KV.slice()];
  var values = sh.getRange(1, 1, last, COT_KV.length).getValues();
  return values.map(function (r) {
    var row = [];
    var c;
    for (c = 0; c < COT_KV.length; c++) row.push(r[c] == null ? '' : r[c]);
    return row;
  });
}

/**
 * bills: mảng bill đã chuẩn hóa (code, time, customer, kh_code_v7, status,
 * lines, customer_must_pay, customer_paid, debt, payment_method, ...).
 * now: Date, ghi lay_luc theo giờ Việt Nam.
 */
function upsertHangDoiKV_(ss, bills, now) {
  var ds = bills || [];
  if (!ds.length) return { ok: true, added: [], updated: [], skipped: [], dirty: [], ghi: false };
  ds.forEach(chuanBill_);
  var sh = taoTabKVQueue_(ss);
  var rows = docBangKV_(sh);
  var layLuc = dinhDangSaigon_(now || new Date());
  var kq = upsertKVRows_(rows, ds, layLuc);
  kq.dirty.forEach(function (i) {
    sh.getRange(i + 1, 1, 1, COT_KV.length).setValues([kq.rows[i]]);
  });
  kq.ok = true;
  kq.ghi = kq.added.length + kq.updated.length > 0;
  kq.lay_luc = layLuc;
  return kq;
}

function upsertBillKV(bills) {
  return upsertHangDoiKV_(moSoV7_(), bills, new Date());
}

/** Chưa có Client ID. Không đọc secret, không gọi mạng. */
function fetchKiotViet() {
  throw new Error('đang chờ API KiotViet');
}

function dongBoTuKiotViet() {
  var bills = fetchKiotViet();
  return upsertHangDoiKV_(moSoV7_(), bills, new Date());
}
