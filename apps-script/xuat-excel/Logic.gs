/**
 * Hàm thuần cho xuất Excel và hàng đợi KV.
 * Không gọi Drive, SpreadsheetApp hay UrlFetch. Test Node nạp file này trực tiếp.
 *
 * File giá chính (Google Sheet): GSHEET_ID.
 * Bản Excel chỉ-đọc, ghi revision mới cùng id: EXCEL_ID.
 * Sổ v7 (tab KV_Queue): V7_ID.
 * Không có token, Client ID hay mật khẩu trong file này.
 */

var GSHEET_ID = '1Hwslun92TLrhXAMgiVDdd6wyvVXP6sqOQbuTKiLKRrM';
var EXCEL_ID = '1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR';
var EXPECTED_TITLE = 'PHIEU BAO GIA VAN PHAT - 2026.xlsx';
var V7_ID = '1jkmfMIJsoZrDlOxmkqbj44GOsNb1eh3UNk3Tyn0MaJs';
var TEN_SHEET_DM = 'Danh Mục Vật Tư';
var TEN_KV = 'KV_Queue';
var HANDLER_XUAT = 'xuatBaoGiaTheoGio';
var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
var MIN_XLSX_BYTES = 1000000;
var GIO_DAU = 7;
var GIO_CUOI = 21;
var PHUT_SOM = 26;
var PHUT_MUON = 45;

var SHEET_NAMES = [
  'Đơn Đặt Hàng',
  'Danh Mục Vật Tư',
  'Hóa Đơn Đầu Vào',
  'Hóa Đơn Đầu Ra',
  'Quản Lý Nhóm',
  'LIST KHACH HANG',
  'Chính Sách Đối Tác',
  'Lịch Sử Xuất Kho',
  'Chi Tiết Đơn Hàng',
  'Sổ Kho - Nhập Xuất Tồn',
  'Báo Cáo Lợi Nhuận SP',
  'Báo Cáo LN Khách Hàng',
  'Cấu Hình API Gemini'
];

/** A..N trên tab KV_Queue. Khóa upsert là ma_hd (cột A). */
var COT_KV = [
  'ma_hd',
  'thoi_gian',
  'ma_kh',
  'ten_kh',
  'trang_thai',
  'tong_tien',
  'khach_da_tra',
  'no',
  'phuong_thuc_tt',
  'so_dong',
  'json_chi_tiet',
  'fingerprint',
  'lay_luc',
  'bot_da_xu_ly'
];

function haiSo_(n) {
  return (n < 10 ? '0' : '') + n;
}

/** Giờ Việt Nam (Asia/Saigon, UTC+7, không giờ mùa). */
function gioPhutSaigon_(date) {
  var t = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return {
    nam: t.getUTCFullYear(),
    thang: t.getUTCMonth() + 1,
    ngay: t.getUTCDate(),
    gio: t.getUTCHours(),
    phut: t.getUTCMinutes(),
    giay: t.getUTCSeconds()
  };
}

function dinhDangSaigon_(date) {
  var hm = gioPhutSaigon_(date);
  return hm.nam + '-' + haiSo_(hm.thang) + '-' + haiSo_(hm.ngay) + ' ' +
    haiSo_(hm.gio) + ':' + haiSo_(hm.phut) + ':' + haiSo_(hm.giay);
}

/** 8:05–8:25 và 14:05–14:25, tính cả hai mốc. Routine đồng bộ đang tự xuất trong hai khung này. */
function trongKhungLoaiTru_(gio, phut) {
  if (phut < 5 || phut > 25) return false;
  return gio === 8 || gio === 14;
}

/**
 * Trigger nearMinute(33) có thể lệch. Cửa sổ nhận là phút :26–:45, giờ 7–21.
 * Khung loại trừ được xét trước, kể cả khi phút không rơi vào :33.
 */
function quyetDinhLich_(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return { chay: false, lyDo: 'mốc giờ không hợp lệ' };
  }
  var hm = gioPhutSaigon_(date);
  var chu = hm.gio + ':' + haiSo_(hm.phut);
  if (trongKhungLoaiTru_(hm.gio, hm.phut)) {
    var khung = hm.gio === 8 ? '8:05–8:25' : '14:05–14:25';
    return { chay: false, lyDo: 'bỏ qua khung đồng bộ ' + khung + ' (giờ Việt Nam ' + chu + ')', gio: hm.gio, phut: hm.phut };
  }
  if (hm.gio < GIO_DAU || hm.gio > GIO_CUOI) {
    return { chay: false, lyDo: 'ngoài giờ 7h–21h (giờ Việt Nam ' + chu + ')', gio: hm.gio, phut: hm.phut };
  }
  if (hm.phut < PHUT_SOM || hm.phut > PHUT_MUON) {
    return { chay: false, lyDo: 'ngoài phút :33 (cửa sổ :26–:45, hiện ' + chu + ')', gio: hm.gio, phut: hm.phut };
  }
  return { chay: true, lyDo: 'đúng mốc ' + chu, gio: hm.gio, phut: hm.phut };
}

/** 15 mốc: 7:33 … 21:33. Apps Script gắn mỗi mốc một trigger ngày, nearMinute(33). */
function keHoachTrigger_() {
  var ds = [];
  var h;
  for (h = GIO_DAU; h <= GIO_CUOI; h++) ds.push({ ham: HANDLER_XUAT, gio: h, phut: 33 });
  return ds;
}

function utf8Bytes_(s) {
  var out = [];
  var i, c, c2, u;
  s = String(s);
  for (i = 0; i < s.length; i++) {
    c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
    else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
      c2 = s.charCodeAt(++i);
      u = ((c - 0xD800) << 10) + (c2 - 0xDC00) + 0x10000;
      out.push(0xF0 | (u >> 18), 0x80 | ((u >> 12) & 0x3F), 0x80 | ((u >> 6) & 0x3F), 0x80 | (u & 0x3F));
    } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
  }
  return out;
}

function rotr_(x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function sha256Hex_(str) {
  var msg = utf8Bytes_(str);
  var bitLen = msg.length * 8;
  var k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  msg.push(0x80);
  while ((msg.length % 64) !== 56) msg.push(0);
  var hi = Math.floor(bitLen / 4294967296);
  var lo = bitLen >>> 0;
  msg.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
  msg.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  var w = new Array(64);
  var off, t, j, s0, s1, a, b, c, d, e, f, g, hh, S0, S1, ch, maj, t1, t2;
  for (off = 0; off < msg.length; off += 64) {
    for (t = 0; t < 16; t++) {
      j = off + t * 4;
      w[t] = ((msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3]) >>> 0;
    }
    for (t = 16; t < 64; t++) {
      s0 = (rotr_(w[t - 15], 7) ^ rotr_(w[t - 15], 18) ^ (w[t - 15] >>> 3)) >>> 0;
      s1 = (rotr_(w[t - 2], 17) ^ rotr_(w[t - 2], 19) ^ (w[t - 2] >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    a = h[0]; b = h[1]; c = h[2]; d = h[3]; e = h[4]; f = h[5]; g = h[6]; hh = h[7];
    for (t = 0; t < 64; t++) {
      S1 = (rotr_(e, 6) ^ rotr_(e, 11) ^ rotr_(e, 25)) >>> 0;
      ch = ((e & f) ^ ((~e) & g)) >>> 0;
      t1 = (hh + S1 + ch + k[t] + w[t]) >>> 0;
      S0 = (rotr_(a, 2) ^ rotr_(a, 13) ^ rotr_(a, 22)) >>> 0;
      maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
  return h.map(function (n) {
    var s = (n >>> 0).toString(16);
    while (s.length < 8) s = '0' + s;
    return s;
  }).join('');
}

function chuanSoChuoi_(n) {
  if (!isFinite(n)) return '';
  if (n === 0) return '0';
  var s = n.toFixed(6);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

function chuanTien_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && isFinite(v)) return chuanSoChuoi_(v);
  var s = String(v).trim().replace(/\s/g, '');
  if (/^-?\d+(\.\d+)?$/.test(s)) return chuanSoChuoi_(Number(s));
  return String(v).trim();
}

/** Hash của tổng, đã trả, trạng thái, số dòng. Đổi nội dung dòng mà bốn field này giữ nguyên thì fingerprint không đổi. */
function fingerprintKV_(tong, daTra, trangThai, soDong) {
  var n = parseInt(soDong, 10);
  if (!isFinite(n) || n < 0) n = 0;
  var raw = [chuanTien_(tong), chuanTien_(daTra), trangThai == null ? '' : String(trangThai).trim(), String(n)].join('|');
  return sha256Hex_(raw);
}

function soVp_(code) {
  return parseInt(String(code).slice(2), 10);
}

function soSanhVp_(a, b) {
  return soVp_(a) - soVp_(b);
}

function maVpSap_(items) {
  return Object.keys(items || {}).sort(soSanhVp_);
}

function cungDanhSach_(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  var i;
  for (i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function kiemCotST_(headerMoi, errs) {
  var can = [{ i: 18, ten: 'Thương Hiệu', cot: 'S' }, { i: 19, ten: 'Quy Cách', cot: 'T' }];
  can.forEach(function (c) {
    var co = headerMoi && headerMoi.length > c.i && String(headerMoi[c.i]).trim() === c.ten;
    if (!co) errs.push('Sheet thiếu cột ' + c.ten + ' (cột ' + c.cot + ', web đọc cột này) – chép bù Q–T trước');
  });
}

/**
 * Guard chặn ghi. Khớp script Python export_sheet_to_excel.py:
 * đủ đúng 13 sheet (đúng thứ tự), VP001..VPn liên tục, không mất mã,
 * giá 0/trống không đè giá > 0, còn cột S Thương Hiệu và T Quy Cách.
 */
function kiemTraXuat_(moi, cu) {
  var errs = [];
  var notes = [];
  moi = moi || { sheetNames: [], header: [], items: {} };
  cu = cu || { sheetNames: [], header: [], items: {} };
  if (!cungDanhSach_(moi.sheetNames, SHEET_NAMES)) {
    errs.push('danh sách sheet lệch: ' + (moi.sheetNames || []).join(' | '));
  }
  var codes = maVpSap_(moi.items);
  var cuoi = codes.length ? codes[codes.length - 1] : 'không có';
  if (!codes.length || codes[0] !== 'VP001' || soVp_(codes[codes.length - 1]) !== codes.length) {
    errs.push('mã VP không liên tục: ' + codes.length + ' mã, cuối ' + cuoi);
  }
  var lost = [];
  Object.keys(cu.items || {}).forEach(function (c) {
    if (!moi.items || !moi.items[c]) lost.push(c);
  });
  lost.sort(soSanhVp_);
  if (lost.length) errs.push('mất mã so với Excel hiện tại (' + lost.length + '): ' + lost.slice(0, 10).join(', '));
  var zero = [];
  Object.keys(moi.items || {}).forEach(function (c) {
    if (!cu.items || !cu.items[c]) return;
    var cuGia = cu.items[c].price;
    var moiGia = moi.items[c].price;
    var cuThat = typeof cuGia === 'number' && isFinite(cuGia) && cuGia > 0;
    var moiThat = typeof moiGia === 'number' && isFinite(moiGia) && moiGia > 0;
    if (cuThat && !moiThat) zero.push(c);
  });
  zero.sort(soSanhVp_);
  if (zero.length) errs.push('giá 0/trống sẽ đè giá thật (' + zero.length + '): ' + zero.slice(0, 10).join(', '));
  kiemCotST_(moi.header, errs);
  var diffs = { name: 0, price: 0, S: 0, T: 0 };
  var soCu = Object.keys(cu.items || {}).length;
  Object.keys(moi.items || {}).forEach(function (c) {
    if (!cu.items || !cu.items[c]) return;
    ['name', 'price', 'S', 'T'].forEach(function (k) {
      if (moi.items[c][k] !== cu.items[c][k]) diffs[k]++;
    });
  });
  notes.push('mã: Sheet ' + codes.length + ' / Excel ' + soCu + '; khác tên ' + diffs.name + ', giá ' + diffs.price + ', S ' + diffs.S + ', T ' + diffs.T);
  return { ok: errs.length === 0, errs: errs, notes: notes };
}

function byteAt_(bytes, i) {
  var b = bytes[i];
  if (typeof b !== 'number') return -1;
  return b < 0 ? b + 256 : b;
}

function laXlsxBlob_(blob, min) {
  var bytes = blob && typeof blob.getBytes === 'function' ? blob.getBytes() : blob;
  var n = min == null ? MIN_XLSX_BYTES : min;
  if (!bytes || bytes.length < n) return false;
  return byteAt_(bytes, 0) === 0x50 && byteAt_(bytes, 1) === 0x4B;
}

function doDaiBlob_(blob) {
  if (blob && typeof blob.getBytes === 'function') return blob.getBytes().length;
  return blob && blob.length ? blob.length : 0;
}

function giaiXml_(s) {
  return String(s)
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function thuocTinh_(attr, ten) {
  var an = String(ten).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var m = String(attr).match(new RegExp('(?:^|\\s)' + an + '="([^"]*)"'));
  return m ? giaiXml_(m[1]) : '';
}

function chuanKey_(k) {
  return String(k || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function layTep_(files, path) {
  var want = chuanKey_(path);
  var keys = Object.keys(files || {});
  var i;
  for (i = 0; i < keys.length; i++) if (chuanKey_(keys[i]) === want) return files[keys[i]];
  return null;
}

function chuanTarget_(target) {
  var t = chuanKey_(target);
  if (!t) return '';
  if (t.indexOf('xl/') === 0) return t;
  return 'xl/' + t;
}

function docSheets_(xml) {
  var out = [];
  var re = /<sheet\b([^>]*)\/?>/g;
  var m;
  while ((m = re.exec(xml))) {
    out.push({ name: thuocTinh_(m[1], 'name'), rid: thuocTinh_(m[1], 'r:id') });
  }
  return out;
}

function docRels_(xml) {
  var map = {};
  var re = /<Relationship\b([^>]*)\/?>/g;
  var m;
  while ((m = re.exec(xml || ''))) {
    var id = thuocTinh_(m[1], 'Id');
    if (id) map[id] = thuocTinh_(m[1], 'Target');
  }
  return map;
}

function noiText_(xml) {
  var s = '';
  var re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  var m;
  while ((m = re.exec(xml || ''))) s += giaiXml_(m[1]);
  return s;
}

function docShared_(xml) {
  if (!xml) return [];
  var out = [];
  var re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  var m;
  while ((m = re.exec(xml))) {
    var block = m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<phoneticPr\b[^>]*\/>/g, '');
    out.push(noiText_(block));
  }
  return out;
}

function viTriO_(ref) {
  var m = String(ref || '').match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  var col = 0;
  var i;
  for (i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
  return { col: col - 1, row: parseInt(m[2], 10) };
}

function theV_(inner) {
  var m = String(inner || '').match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  return m ? m[1] : null;
}

function docGiaTri_(inner, t, shared) {
  if (t === 'inlineStr') return noiText_(inner);
  var raw = theV_(inner);
  if (t === 's') {
    if (raw == null || raw === '') return '';
    var idx = parseInt(raw, 10);
    return shared[idx] != null ? shared[idx] : '';
  }
  if (raw == null || raw === '') return null;
  if (t === 'str') return giaiXml_(raw);
  if (t === 'b') return raw === '1';
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw)) return Number(raw);
  return giaiXml_(raw);
}

function docGrid_(xml, shared) {
  var grid = {};
  var re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  var m;
  while ((m = re.exec(xml || ''))) {
    var pos = viTriO_(thuocTinh_(m[1], 'r'));
    if (!pos) continue;
    if (!grid[pos.row]) grid[pos.row] = {};
    grid[pos.row][pos.col] = docGiaTri_(m[2] || '', thuocTinh_(m[1], 't'), shared);
  }
  return grid;
}

function headerTuGrid_(grid) {
  var row = (grid && grid[1]) || {};
  var max = 19;
  Object.keys(row).forEach(function (k) {
    var n = +k;
    if (n > max) max = n;
  });
  var h = [];
  var c;
  for (c = 0; c <= max; c++) h.push(row[c] == null ? '' : String(row[c]).trim());
  return h;
}

function itemsTuGrid_(grid) {
  var items = {};
  Object.keys(grid || {}).forEach(function (rk) {
    var r = +rk;
    if (r < 2) return;
    var row = grid[r];
    var code = row[1];
    if (code == null) return;
    code = String(code).trim();
    if (!/^VP\d{3,}$/.test(code)) return;
    var price = row[4];
    items[code] = {
      name: row[2] == null ? null : row[2],
      price: typeof price === 'number' ? price : (price == null || price === '' ? null : price),
      S: row[18] == null ? null : row[18],
      T: row[19] == null ? null : row[19]
    };
  });
  return items;
}

function docCatalogTuTep_(files) {
  if (!files) throw new Error('thiếu tệp xlsx');
  var wb = layTep_(files, 'xl/workbook.xml');
  if (!wb) throw new Error('xlsx thiếu xl/workbook.xml');
  var sheets = docSheets_(wb);
  var rels = docRels_(layTep_(files, 'xl/_rels/workbook.xml.rels') || '');
  var names = sheets.map(function (s) { return s.name; });
  var shared = docShared_(layTep_(files, 'xl/sharedStrings.xml') || '');
  var dm = null;
  var i;
  for (i = 0; i < sheets.length; i++) if (sheets[i].name === TEN_SHEET_DM) dm = sheets[i];
  var header = [];
  var items = {};
  if (dm) {
    var path = chuanTarget_(rels[dm.rid] || '');
    var xml = layTep_(files, path);
    if (!xml) throw new Error('xlsx thiếu sheet ' + TEN_SHEET_DM);
    var grid = docGrid_(xml, shared);
    header = headerTuGrid_(grid);
    items = itemsTuGrid_(grid);
  }
  return { sheetNames: names, header: header, items: items };
}

function docCatalogTuBlob_(blob, unzip) {
  return docCatalogTuTep_(unzip(blob));
}

function chuanDongHang_(d) {
  d = d || {};
  return {
    ma: d.ma != null ? String(d.ma) : (d.code != null ? String(d.code) : ''),
    ten: d.ten != null ? String(d.ten) : (d.name != null ? String(d.name) : ''),
    sl: d.sl != null ? d.sl : (d.quantity != null ? d.quantity : ''),
    don_gia: d.don_gia != null ? d.don_gia : (d.price != null ? d.price : ''),
    giam: d.giam != null ? d.giam : (d.discount != null ? d.discount : ''),
    thanh_tien: d.thanh_tien != null ? d.thanh_tien : (d.total != null ? d.total : '')
  };
}

function giaTriGhiTien_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && isFinite(v)) return v;
  var s = String(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function chuanBill_(raw) {
  if (!raw || String(raw.code == null ? '' : raw.code).trim() === '') throw new Error('thiếu mã hóa đơn');
  if (raw.lines != null && !Array.isArray(raw.lines)) throw new Error('lines phải là mảng');
  var lines = (raw.lines || []).map(chuanDongHang_);
  var timeRaw = raw.time != null ? raw.time : raw.thoi_gian;
  var timeText = '';
  if (timeRaw instanceof Date) timeText = dinhDangSaigon_(timeRaw);
  else if (timeRaw != null) timeText = String(timeRaw);
  var status = raw.status == null ? '' : String(raw.status).trim();
  var json = {
    code: String(raw.code).trim(),
    time: timeText,
    customer: raw.customer == null ? '' : String(raw.customer),
    kh_code_v7: raw.kh_code_v7 == null ? '' : String(raw.kh_code_v7),
    creator: raw.creator == null ? '' : String(raw.creator),
    seller: raw.seller == null ? '' : String(raw.seller),
    channel: raw.channel == null ? '' : String(raw.channel),
    price_list: raw.price_list == null ? '' : String(raw.price_list),
    branch: raw.branch == null ? '' : String(raw.branch),
    status: status,
    lines: lines,
    total_goods: raw.total_goods == null ? '' : raw.total_goods,
    discount: raw.discount == null ? '' : raw.discount,
    customer_must_pay: raw.customer_must_pay == null ? '' : raw.customer_must_pay,
    customer_paid: raw.customer_paid == null ? '' : raw.customer_paid,
    debt: raw.debt == null ? '' : raw.debt,
    payment_method: raw.payment_method == null ? '' : String(raw.payment_method),
    payment_note: raw.payment_note == null ? '' : String(raw.payment_note)
  };
  return {
    code: json.code,
    timeText: timeText,
    kh_code_v7: json.kh_code_v7,
    customer: json.customer,
    status: status,
    customer_must_pay: raw.customer_must_pay,
    customer_paid: raw.customer_paid,
    lines: lines,
    payment_method: json.payment_method,
    customer_must_pay_out: giaTriGhiTien_(raw.customer_must_pay),
    customer_paid_out: giaTriGhiTien_(raw.customer_paid),
    debt_out: giaTriGhiTien_(raw.debt),
    json: json
  };
}

function dongTuChuan_(ch, fp, layLuc, bot) {
  return [
    ch.code,
    ch.timeText,
    ch.kh_code_v7,
    ch.customer,
    ch.status,
    ch.customer_must_pay_out,
    ch.customer_paid_out,
    ch.debt_out,
    ch.payment_method,
    ch.lines.length,
    JSON.stringify(ch.json),
    fp,
    layLuc,
    bot == null ? '' : bot
  ];
}

/**
 * Upsert theo mã hóa đơn. Mã mới thì thêm một dòng ở cuối.
 * Fingerprint đổi thì sửa đúng dòng đó và xóa bot_da_xu_ly.
 * Fingerprint giữ nguyên thì không ghi.
 */
function upsertKVRows_(rows, bills, layLuc) {
  var data = (rows || []).map(function (r) { return r.slice(); });
  if (!data.length) data.push(COT_KV.slice());
  var index = {};
  var trung = [];
  var i;
  for (i = 1; i < data.length; i++) {
    var ma = String(data[i][0] || '').trim();
    if (!ma) continue;
    if (index[ma] != null) trung.push(ma);
    else index[ma] = i;
  }
  var added = [];
  var updated = [];
  var skipped = [];
  var dirty = [];
  (bills || []).forEach(function (bill) {
    var ch = chuanBill_(bill);
    var fp = fingerprintKV_(ch.customer_must_pay, ch.customer_paid, ch.status, ch.lines.length);
    var at = index[ch.code];
    if (at == null) {
      data.push(dongTuChuan_(ch, fp, layLuc, ''));
      at = data.length - 1;
      index[ch.code] = at;
      added.push(ch.code);
      dirty.push(at);
      return;
    }
    if (String(data[at][11]) === fp) {
      skipped.push(ch.code);
      return;
    }
    data[at] = dongTuChuan_(ch, fp, layLuc, '');
    updated.push(ch.code);
    dirty.push(at);
  });
  return { rows: data, added: added, updated: updated, skipped: skipped, dirty: dirty, trung_san: trung };
}
