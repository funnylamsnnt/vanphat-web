/**
 * Hàm thuần: lịch 15 phút, guard xuất, gộp 3 bên.
 * Không gọi Drive, SpreadsheetApp hay UrlFetch.
 */

function haiSo_(n) {
  return (n < 10 ? '0' : '') + n;
}

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

function trongKhungLoaiTru_(gio, phut) {
  if (phut < 5 || phut > 40) return false;
  return gio === 8 || gio === 14;
}

/** Trigger mỗi 15 phút. Chỉ dừng trong 8:05–8:40 và 14:05–14:40 (giờ Việt Nam). */
function quyetDinhLich15_(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return { chay: false, lyDo: 'mốc giờ không hợp lệ' };
  }
  var hm = gioPhutSaigon_(date);
  var chu = hm.gio + ':' + haiSo_(hm.phut);
  if (trongKhungLoaiTru_(hm.gio, hm.phut)) {
    var khung = hm.gio === 8 ? '8:05–8:40' : '14:05–14:40';
    return { chay: false, lyDo: 'bỏ qua khung đồng bộ ' + khung + ' (giờ Việt Nam ' + chu + ')', gio: hm.gio, phut: hm.phut };
  }
  return { chay: true, lyDo: 'chạy lúc ' + chu, gio: hm.gio, phut: hm.phut };
}

function chuanTieuDe_(s) {
  var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return t.replace(/đ/g, 'd');
}

function chuanSoChuoi_(n) {
  if (!isFinite(n)) return '';
  if (n === 0) return '0';
  var s = n.toFixed(6);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

function chuNgay_(nam, thang, ngay) {
  return nam + '-' + haiSo_(thang) + '-' + haiSo_(ngay);
}

function ngayHopLe_(nam, thang, ngay) {
  if (!isFinite(nam) || !isFinite(thang) || !isFinite(ngay)) return false;
  if (nam < 1900 || nam > 2100) return false;
  var t = new Date(Date.UTC(nam, thang - 1, ngay));
  return t.getUTCFullYear() === nam && t.getUTCMonth() === thang - 1 && t.getUTCDate() === ngay;
}

/**
 * Ngày lịch của ô. Không cộng thêm 7 giờ: serial Excel là giờ tường,
 * Date từ Sheet cũng mang giờ tường ở trường UTC. Cộng +7 đẩy 21:14 sang ngày sau.
 * gioPhutSaigon_ chỉ dùng cho lịch trigger.
 */
function ngayTuDate_(date) {
  var tp = thanhPhanMui_(date, MUI_GIO_SHEET);
  if (!tp || !ngayHopLe_(tp.nam, tp.thang, tp.ngay)) return '';
  return chuNgay_(tp.nam, tp.thang, tp.ngay);
}

function serialTuThanhPhan_(nam, thang, ngay, gio, phut, giay) {
  if (!ngayHopLe_(nam, thang, ngay)) return null;
  if (gio < 0 || gio > 23 || phut < 0 || phut > 59 || giay < 0 || giay > 59) return null;
  var ngaySo = Math.round((Date.UTC(nam, thang - 1, ngay) - Date.UTC(1899, 11, 30)) / 86400000);
  if (ngaySo < 61 || ngaySo > 80000) return null;
  return ngaySo + (gio * 3600 + phut * 60 + giay) / 86400;
}

/** Múi giờ của Google Sheet giá. Script có thể để múi khác; ô Date đọc theo múi này. */
var MUI_GIO_SHEET = 'Asia/Ho_Chi_Minh';

function datMuiGioSheet_(tz) {
  MUI_GIO_SHEET = tz && String(tz).trim() ? String(tz).trim() : 'Asia/Ho_Chi_Minh';
  return MUI_GIO_SHEET;
}

function formatIntlNgayGio_(date, timeZone) {
  var fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  var map = {};
  fmt.formatToParts(date).forEach(function (p) { map[p.type] = p.value; });
  var gio = map.hour === '24' ? '00' : map.hour;
  return map.year + '-' + map.month + '-' + map.day + ' ' + gio + ':' + map.minute + ':' + map.second;
}

/** Giờ tường của một instant. Ưu tiên Utilities.formatDate theo múi giờ bảng tính. */
function thanhPhanMui_(date, timeZone) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  var tz = timeZone || MUI_GIO_SHEET || 'Asia/Ho_Chi_Minh';
  var chu = '';
  if (typeof Utilities !== 'undefined' && Utilities && Utilities.formatDate) {
    chu = Utilities.formatDate(date, tz, 'yyyy-MM-dd HH:mm:ss');
  } else {
    chu = formatIntlNgayGio_(date, tz);
  }
  var m = String(chu).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  var gio = +m[4] === 24 ? 0 : +m[4];
  return { nam: +m[1], thang: +m[2], ngay: +m[3], gio: gio, phut: +m[5], giay: +m[6] };
}

function serialGhiTuDate_(date) {
  var tp = thanhPhanMui_(date, MUI_GIO_SHEET);
  if (!tp) return null;
  return serialTuThanhPhan_(tp.nam, tp.thang, tp.ngay, tp.gio, tp.phut, tp.giay);
}

/** Chữ giờ tường, không dịch múi. yyyy-mm-dd hh:mm:ss và m/d/yy hh:mm. */
function tachChuoiGioTuong_(t) {
  var m = String(t || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    return { nam: +m[1], thang: +m[2], ngay: +m[3], gio: +m[4], phut: +m[5], giay: +(m[6] || 0) };
  }
  m = String(t || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  var nam = +m[3];
  nam = nam >= 70 ? 1900 + nam : 2000 + nam;
  return { nam: nam, thang: +m[1], ngay: +m[2], gio: +(m[4] || 0), phut: +(m[5] || 0), giay: +(m[6] || 0) };
}

/**
 * Chuỗi ngày rõ: dd/mm/yyyy, yyyy-mm-dd, giờ tường, ISO có múi giờ, hoặc Date toString.
 * Không đổi số thường.
 */
function ngayTuChuoi_(s) {
  var t = String(s == null ? '' : s).trim();
  if (!t) return '';
  var m = t.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})$/);
  if (m) {
    if (!ngayHopLe_(+m[3], +m[2], +m[1])) return '';
    return chuNgay_(+m[3], +m[2], +m[1]);
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    if (!ngayHopLe_(+m[1], +m[2], +m[3])) return '';
    return chuNgay_(+m[1], +m[2], +m[3]);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t) && /(?:Z|[+-]\d{2}:?\d{2})$/.test(t)) {
    var iso = new Date(t);
    if (!isNaN(iso.getTime())) return ngayTuDate_(iso);
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    if (!ngayHopLe_(+m[1], +m[2], +m[3])) return '';
    return chuNgay_(+m[1], +m[2], +m[3]);
  }
  if (/^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s/.test(t) && /GMT[+-]\d{4}/.test(t)) {
    var js = new Date(t);
    if (!isNaN(js.getTime())) return ngayTuDate_(js);
  }
  var tuong = tachChuoiGioTuong_(t);
  if (tuong && ngayHopLe_(tuong.nam, tuong.thang, tuong.ngay)) return chuNgay_(tuong.nam, tuong.thang, tuong.ngay);
  return '';
}

function ngayRo_(v) {
  if (v instanceof Date) return ngayTuDate_(v);
  if (typeof v === 'string') return ngayTuChuoi_(v);
  return '';
}

function soThuan_(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v !== 'string') return null;
  var s = v.trim();
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s)) return null;
  if (/^-?0\d/.test(s)) return null;
  var nguyen = s.replace('-', '').split('.')[0];
  if (nguyen.length > 15) return null;
  return Number(s);
}

function laChuoiDateJs_(v) {
  return typeof v === 'string' && /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s/.test(v) && /GMT[+-]\d{4}/.test(v);
}

function themSerial_(out, n) {
  if (n != null && isFinite(n)) out.push(n);
}

/** Các cách đọc giờ tường. Số giữ nguyên, không làm tròn. */
function ungVienSerial_(v) {
  var out = [];
  if (v instanceof Date) {
    themSerial_(out, serialGhiTuDate_(v));
    return out;
  }
  if (typeof v === 'string') {
    var t = v.trim();
    if (laChuoiDateJs_(t) || /^\d{4}-\d{2}-\d{2}T/.test(t)) {
      var d = new Date(t);
      if (!isNaN(d.getTime())) return ungVienSerial_(d);
    }
    var tuong = tachChuoiGioTuong_(t);
    if (tuong) {
      themSerial_(out, serialTuThanhPhan_(tuong.nam, tuong.thang, tuong.ngay, tuong.gio, tuong.phut, tuong.giay));
      return out;
    }
    var m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      themSerial_(out, serialTuThanhPhan_(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)));
      return out;
    }
    m = t.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})$/);
    if (m) {
      themSerial_(out, serialTuThanhPhan_(+m[3], +m[2], +m[1], 0, 0, 0));
      return out;
    }
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      themSerial_(out, serialTuThanhPhan_(+m[1], +m[2], +m[3], 0, 0, 0));
      return out;
    }
  }
  var n = soThuan_(v);
  if (n != null && n >= 61 && n <= 80000) themSerial_(out, n);
  return out;
}

function laKieuNgay_(v) {
  if (v instanceof Date) return true;
  return typeof v === 'string' && !!ngayTuChuoi_(v);
}

function laSerialNguyen_(v) {
  var n = soThuan_(v);
  if (n == null) return false;
  return Math.abs(n - Math.round(n)) < 1e-4;
}

function ganSerial_(a, b) {
  return Math.abs(a - b) < (1 / 86400);
}

function cungNgaySerial_(a, b) {
  return Math.floor(a + 1e-9) === Math.floor(b + 1e-9);
}

/** Date hoặc chữ ngày thành serial có giờ. Số giữ nguyên, không bao giờ làm tròn sang ngày sau. */
function giaTriGhiExcel_(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    var n = soThuan_(v);
    if (n != null) return n;
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    var s = serialGhiTuDate_(v);
    return s == null ? v : s;
  }
  if (typeof v === 'string' && (laChuoiDateJs_(v) || /^\d{4}-\d{2}-\d{2}T/.test(v))) {
    var d = new Date(v);
    if (!isNaN(d.getTime())) {
      var s2 = serialGhiTuDate_(d);
      return s2 == null ? v : s2;
    }
  }
  if (typeof v === 'string') {
    var u = ungVienSerial_(v);
    if (u.length === 1) return u[0];
  }
  return v;
}

function chuoiHien_(v) {
  if (v instanceof Date || (typeof v === 'string' && ngayTuChuoi_(v))) {
    var g = giaTriGhiExcel_(v);
    if (typeof g === 'number' && isFinite(g)) return String(g);
  }
  return catChuoi_(v);
}

function chuanGiaTri_(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date) return ngayTuDate_(v);
  if (typeof v === 'number' && isFinite(v)) return chuanSoChuoi_(v);
  var s = chuanXuongDong_(String(v)).trim();
  var nc = ngayTuChuoi_(s);
  if (nc) return nc;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s)) {
    if (/^-?0\d/.test(s)) return s;
    var nguyen = s.replace('-', '').split('.')[0];
    if (nguyen.length > 15) return s;
    return chuanSoChuoi_(Number(s));
  }
  return s;
}

function cungGiaTri_(a, b) {
  var ua = ungVienSerial_(a);
  var ub = ungVienSerial_(b);
  if (ua.length && ub.length) {
    var i;
    var j;
    for (i = 0; i < ua.length; i++) {
      for (j = 0; j < ub.length; j++) {
        if (ganSerial_(ua[i], ub[j])) return true;
      }
    }
    // Ô ngày thuần (serial nguyên hoặc dd/mm/yyyy) với Date cùng ngày: bỏ giờ rác 14:00/15:00.
    // Serial có giờ thật (21:14) không bị làm tròn thành ngày hôm sau.
    if (laKieuNgay_(a) || laKieuNgay_(b)) {
      var aNguyen = laSerialNguyen_(a) || (typeof a === 'string' && ua.length === 1 && laSerialNguyen_(ua[0]));
      var bNguyen = laSerialNguyen_(b) || (typeof b === 'string' && ub.length === 1 && laSerialNguyen_(ub[0]));
      if (aNguyen || bNguyen) {
        for (i = 0; i < ua.length; i++) {
          for (j = 0; j < ub.length; j++) {
            if (cungNgaySerial_(ua[i], ub[j])) return true;
          }
        }
      }
      return false;
    }
  }
  return chuanGiaTri_(a) === chuanGiaTri_(b);
}

function chuanXuongDong_(s) {
  return String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function catChuoi_(v, n) {
  var s = v == null ? '' : String(v);
  n = n || 180;
  if (s.length > n) s = s.slice(0, n);
  return s;
}

function cungDanhSach_(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  var i;
  for (i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function soVp_(code) {
  return parseInt(String(code).slice(2), 10);
}

function soSanhVp_(a, b) {
  return soVp_(a) - soVp_(b);
}

/**
 * Ô chỉ một bên đổi thì lấy bên đó.
 * Cùng ô cả hai bên đổi khác nhau: Sheet thắng.
 * Hai bên đổi thành cùng một giá trị: giữ.
 */
function quyetDinhO_(base, excel, sheet) {
  var eDoi = !cungGiaTri_(excel, base);
  var sDoi = !cungGiaTri_(sheet, base);
  if (!eDoi && !sDoi) return 'giu';
  if (eDoi && !sDoi) return 'excel';
  if (sDoi && !eDoi) return 'sheet';
  if (cungGiaTri_(excel, sheet)) return 'giu';
  return 'xung-dot';
}

function giaO_(cell) {
  if (!cell) return '';
  return cell.v == null ? '' : cell.v;
}

/**
 * Giá bán. Dấu chấm nhóm 3 số là hàng nghìn (45.000 = 45000).
 * "45.000 đ", "45.000", "45,000", "45000đ" đều là 45000.
 * Trả về null khi trống, bằng 0, hoặc không đọc được thành số lớn hơn 0.
 */
function phanTichGia_(v) {
  if (typeof v === 'number') {
    if (!isFinite(v) || v <= 0) return null;
    return v;
  }
  if (v == null || v === '' || typeof v === 'boolean' || v instanceof Date) return null;
  var s = String(v).replace(/[\s\u00a0]+/g, '');
  if (!s) return null;
  s = s.replace(/đồng/ig, '').replace(/dong/ig, '').replace(/vnđ/ig, '').replace(/vnd/ig, '').replace(/đ/ig, '');
  if (/^d/i.test(s)) s = s.replace(/^d/i, '');
  if (/d$/i.test(s)) s = s.replace(/d$/i, '');
  if (!s) return null;
  if (s.charAt(0) === '+') s = s.slice(1);
  if (!s || s.charAt(0) === '-') return null;
  var n = null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) n = Number(s.replace(/,/g, ''));
  else if (/^\d+,\d+$/.test(s)) n = Number(s.replace(',', '.'));
  else if (/^\d+(\.\d+)?$/.test(s)) n = Number(s);
  if (n == null || !isFinite(n) || n <= 0) return null;
  return n;
}

function laGiaThat_(v) {
  return phanTichGia_(v) != null;
}

function chuanGiaCot_(v) {
  var n = phanTichGia_(v);
  return n == null ? v : n;
}

/** Giá trống/0/không đọc được không đè giá thật. Giữ số thật và ghi lại bên đang trống. */
function giuGiaNeuLech_(tui, o) {
  var eThat = laGiaThat_(o.ve);
  var sThat = laGiaThat_(o.vs);
  if (!(eThat && !sThat) && !(sThat && !eThat)) return false;
  var thangSheet = o.quyet === 'sheet' || o.quyet === 'xung-dot';
  if (eThat && !sThat && !thangSheet) return false;
  if (sThat && !eThat && thangSheet) return false;
  var giaGiu = eThat ? o.ve : o.vs;
  var giaBo = eThat ? o.vs : o.ve;
  var ma = String(o.khoa).split('#')[0];
  tui.giaGiu[ma] = giaGiu;
  tui.log.push({
    tab: o.tab, khoa: o.khoa, cot: o.cot, o: o.o, nguon: 'giu-gia',
    cu: catChuoi_(giaGiu), moi: catChuoi_(giaBo),
    ghiChu: 'giá 0/trống không đè giá thật, giữ giá thật và ghi lại bên trống'
  });
  if (eThat) {
    tui.ghiSheet.push({
      tab: o.tab, khoa: o.khoa, col: o.col, row: o.row,
      giaTri: giaGiu, nguon: 'giu-gia'
    });
  } else {
    tui.canXuat = true;
  }
  return true;
}

function laBoQuaO_(cell) {
  return !!(cell && (cell.f || cell.img));
}

function headerTuGrid_(grid) {
  var dong = [];
  var maxRow = 0;
  Object.keys(grid || {}).forEach(function (rk) {
    var r = +rk;
    if (r > maxRow) maxRow = r;
  });
  var gioi = Math.min(maxRow || 1, 30);
  var r;
  for (r = 1; r <= gioi; r++) dong.push(grid[r] || {});
  return dong;
}

function timHangTieuDe_(grid, tenCan) {
  var can = (tenCan || []).map(chuanTieuDe_);
  var rows = headerTuGrid_(grid);
  var best = null;
  var r;
  for (r = 0; r < rows.length; r++) {
    var col = {};
    var headers = [];
    var max = -1;
    Object.keys(rows[r]).forEach(function (ck) {
      var n = +ck;
      if (n > max) max = n;
    });
    var c;
    for (c = 0; c <= max; c++) {
      var raw = rows[r][c] && rows[r][c].v != null ? String(rows[r][c].v) : '';
      headers.push(raw.replace(/\s+/g, ' ').trim());
      var key = chuanTieuDe_(raw);
      if (key && col[key] == null) col[key] = c;
    }
    var du = 0;
    var i;
    for (i = 0; i < can.length; i++) if (col[can[i]] != null) du++;
    if (!best || du > best.du) best = { row: r + 1, headers: headers, col: col, du: du };
    if (du === can.length && can.length) return best;
  }
  return best || { row: 1, headers: [], col: {}, du: 0 };
}

function thieuTen_(colMap, ds) {
  var thieu = [];
  (ds || []).forEach(function (ten) {
    if (colMap[chuanTieuDe_(ten)] == null) thieu.push(ten);
  });
  return thieu;
}

function laTabKeThuaHoaDon_(cfg) {
  var khoa = (cfg && cfg.khoa) || [];
  if (!khoa.length) return false;
  return chuanTieuDe_(khoa[0]) === chuanTieuDe_('Số Hóa Đơn');
}

function laNhanTongCong_(v) {
  var t = chuanTieuDe_(v == null ? '' : v);
  if (!t) return false;
  return t === 'tong cong' || /^tong cong\s*(?:[:;]|\([^)]*\))?$/.test(t);
}

function dongTongCong_(grid) {
  var ds = Object.keys(grid || {}).map(function (rk) { return +rk; });
  ds.sort(function (a, b) { return a - b; });
  var i;
  var c;
  for (i = 0; i < ds.length; i++) {
    var row = grid[ds[i]] || {};
    var cols = Object.keys(row);
    for (c = 0; c < cols.length; c++) {
      var cell = row[cols[c]];
      var raw = cell && cell.v != null ? cell.v : '';
      if (raw instanceof Date) continue;
      if (laNhanTongCong_(raw)) return ds[i];
    }
  }
  return 0;
}

function catGridTruocTong_(grid) {
  var moc = dongTongCong_(grid);
  if (!moc) return grid || {};
  var out = {};
  Object.keys(grid || {}).forEach(function (rk) {
    if (+rk < moc) out[rk] = grid[rk];
  });
  return out;
}

/** Khóa rác từ lần ghi cả cụm: chỉ dấu |, bắt đầu bằng |, ||, hoặc có ⚠. */
function khoaHong_(khoa) {
  var goc = String(khoa == null ? '' : khoa).split('#')[0];
  if (!goc) return true;
  if (goc.indexOf('⚠') >= 0 || String(khoa).indexOf('⚠') >= 0) return true;
  if (/^[\|\s]+$/.test(goc)) return true;
  if (goc.charAt(0) === '|') return true;
  if (goc.indexOf('||') >= 0) return true;
  if (/\|$/.test(goc)) return true;
  return false;
}

function phanKhoa_(khoa, viTri) {
  var goc = String(khoa == null ? '' : khoa).split('#')[0];
  var phan = goc.split('|');
  if (viTri < 0 || viTri >= phan.length) return '';
  var rieng = phan[viTri];
  if (!rieng || rieng.indexOf('|') >= 0) return '';
  return rieng;
}

function khoaTuDong_(cells, cfg, colMap, keThua) {
  keThua = keThua || {};
  var tenKhoa = cfg.khoa || [];
  var parts = [];
  var i;
  var trong = true;
  for (i = 0; i < tenKhoa.length; i++) {
    var idx = colMap[chuanTieuDe_(tenKhoa[i])];
    var v = idx == null ? '' : chuanGiaTri_(giaO_(cells[idx]));
    if (!v && keThua[tenKhoa[i]]) v = keThua[tenKhoa[i]];
    if (v) trong = false;
    parts.push(v);
  }
  if (trong && cfg.khoaPhu && cfg.khoaPhu.length) {
    parts = [];
    trong = true;
    for (i = 0; i < cfg.khoaPhu.length; i++) {
      var idx2 = colMap[chuanTieuDe_(cfg.khoaPhu[i])];
      var v2 = idx2 == null ? '' : chuanGiaTri_(giaO_(cells[idx2]));
      if (v2) trong = false;
      parts.push(v2);
    }
  }
  if (trong) return '';
  return parts.join('|');
}

function hangCoKhoaCon_(cells, cfg, colMap) {
  var tenKhoa = (cfg && cfg.khoa) || [];
  var i;
  for (i = 1; i < tenKhoa.length; i++) {
    var idx = colMap[chuanTieuDe_(tenKhoa[i])];
    if (idx == null) continue;
    if (chuanGiaTri_(giaO_(cells[idx]))) return true;
  }
  return false;
}

function hangTheoKhoa_(grid, header, cfg) {
  if (laTabKeThuaHoaDon_(cfg)) grid = catGridTruocTong_(grid);
  var rows = {};
  var thuTu = {};
  var soCuoi = '';
  var keThuaHd = laTabKeThuaHoaDon_(cfg);
  var idxSo = keThuaHd ? header.col[chuanTieuDe_('Số Hóa Đơn')] : null;
  var ds = Object.keys(grid || {}).map(function (rk) { return +rk; });
  ds.sort(function (a, b) { return a - b; });
  var i;
  for (i = 0; i < ds.length; i++) {
    var r = ds[i];
    if (r <= header.row) continue;
    var cells = grid[r];
    var ke = {};
    if (keThuaHd && idxSo != null) {
      var so = chuanGiaTri_(giaO_(cells[idxSo]));
      if (so) soCuoi = so;
      else if (soCuoi && hangCoKhoaCon_(cells, cfg, header.col)) ke['Số Hóa Đơn'] = soCuoi;
    }
    var khoa = khoaTuDong_(cells, cfg, header.col, ke);
    if (!khoa || khoaHong_(khoa)) continue;
    thuTu[khoa] = (thuTu[khoa] || 0) + 1;
    var key = thuTu[khoa] === 1 ? khoa : khoa + '#' + thuTu[khoa];
    rows[key] = { row: r, cells: cells };
  }
  return rows;
}

function oTuGrid_(grid) {
  var o = {};
  Object.keys(grid || {}).forEach(function (rk) {
    var row = grid[rk];
    Object.keys(row).forEach(function (ck) {
      var cell = row[ck];
      if (!cell) return;
      o[cell.ref] = {
        v: cell.v,
        f: cell.f,
        img: cell.img,
        formula: cell.formula,
        row: +rk,
        col: +ck
      };
    });
  });
  return o;
}

function moHinhTuGrid_(sheetNames, grids, pathsIgnored) {
  var sheets = {};
  var loi = [];
  (sheetNames || []).forEach(function (ten) {
    var cfg = timCauHinh_(ten);
    if (!cfg || cfg.cheDo === 'cam') {
      sheets[ten] = { cheDo: 'cam' };
      return;
    }
    if (cfg.cheDo === 'cong-thuc') {
      sheets[ten] = { cheDo: 'cong-thuc' };
      return;
    }
    var grid = grids[ten] || {};
    if (laTabKeThuaHoaDon_(cfg)) grid = catGridTruocTong_(grid);
    if (cfg.cheDo === 'o') {
      sheets[ten] = { cheDo: 'o', o: oTuGrid_(grid) };
      return;
    }
    var can = (cfg.batBuocExcel || cfg.batBuocSheet || cfg.khoa || []).slice();
    var header = timHangTieuDe_(grid, can.length ? can : (cfg.tieuDe || []));
    var thieu = thieuTen_(header.col, can);
    sheets[ten] = {
      cheDo: 'khoa',
      headerRow: header.row,
      headers: header.headers,
      col: header.col,
      rows: hangTheoKhoa_(grid, header, cfg),
      loi: thieu.length ? 'thiếu tiêu đề ' + thieu.join(', ') : ''
    };
    if (thieu.length) loi.push(ten + ': thiếu tiêu đề ' + thieu.join(', '));
  });
  return { sheetNames: sheetNames.slice(), sheets: sheets, loi: loi };
}

function moHinhTuTep_(files) {
  if (!files) throw new Error('thiếu tệp xlsx');
  var ds = danhSachSheetTuTep_(files);
  var shared = docShared_(layTep_(files, 'xl/sharedStrings.xml') || '');
  var names = ds.map(function (s) { return s.name; });
  var grids = {};
  var i;
  for (i = 0; i < ds.length; i++) {
    var cfg = timCauHinh_(ds[i].name);
    if (!cfg || cfg.cheDo === 'cam' || cfg.cheDo === 'cong-thuc') continue;
    var xml = layTep_(files, ds[i].path);
    if (!xml) throw new Error('xlsx thiếu sheet ' + ds[i].name);
    grids[ds[i].name] = docGridDayDu_(xml, shared);
  }
  return moHinhTuGrid_(names, grids);
}

function moHinhTuBang_(ten, values, formulas, cfg) {
  var grid = {};
  var r;
  var c;
  values = values || [];
  formulas = formulas || [];
  for (r = 0; r < values.length; r++) {
    for (c = 0; c < (values[r] || []).length; c++) {
      var f = formulas[r] && formulas[r][c] ? String(formulas[r][c]) : '';
      if ((values[r][c] == null || values[r][c] === '') && !f) continue;
      if (!grid[r + 1]) grid[r + 1] = {};
      grid[r + 1][c] = {
        v: values[r][c],
        f: !!f,
        img: laCongThucAnh_(f),
        formula: f,
        ref: cotChu_(c) + (r + 1)
      };
    }
  }
  var names = [ten];
  var model = moHinhTuGrid_(names, {});
  model.sheets[ten] = moHinhTuGrid_([ten], (function () { var g = {}; g[ten] = grid; return g; })()).sheets[ten];
  return model.sheets[ten];
}

function kiemViTri_(headers, viTri) {
  var loi = [];
  Object.keys(viTri || {}).forEach(function (ten) {
    var idx = viTri[ten];
    var co = headers && headers.length > idx && chuanTieuDe_(headers[idx]) === chuanTieuDe_(ten);
    if (!co) loi.push(ten + ' không ở cột ' + cotChu_(idx));
  });
  return loi;
}

function cotDongBo_(cfg, colMap) {
  var bo = {};
  (cfg.cotCongThuc || []).forEach(function (ten) { bo[chuanTieuDe_(ten)] = true; });
  (cfg.cotChiExcel || []).forEach(function (ten) { bo[chuanTieuDe_(ten)] = true; });
  (cfg.khoa || []).forEach(function (ten) { bo[chuanTieuDe_(ten)] = true; });
  (cfg.khoaPhu || []).forEach(function (ten) { bo[chuanTieuDe_(ten)] = true; });
  var ds = [];
  Object.keys(colMap || {}).forEach(function (key) {
    if (bo[key]) return;
    ds.push(colMap[key]);
  });
  ds.sort(function (a, b) { return a - b; });
  return ds;
}

function tenCotTheoIndex_(headers, idx) {
  if (!headers || headers[idx] == null || headers[idx] === '') return cotChu_(idx);
  return String(headers[idx]).replace(/\s+/g, ' ').trim();
}

function thatBai_(lyDo) {
  return {
    ok: false,
    dung: true,
    lyDo: lyDo,
    errs: [lyDo],
    ghiSheet: [],
    themDong: [],
    xoaDong: [],
    xungDot: [],
    log: [{ tab: '', khoa: '', cot: '', o: '', nguon: 'dung', cu: '', moi: '', ghiChu: catChuoi_(lyDo, 500) }],
    canXuat: false,
    notes: []
  };
}

function kiemTraXuat_(moi, cu) {
  var errs = [];
  var notes = [];
  moi = moi || { sheetNames: [], header: [], items: {} };
  cu = cu || { sheetNames: [], header: [], items: {} };
  if (!cungDanhSach_(moi.sheetNames, SHEET_NAMES)) {
    errs.push('danh sách sheet lệch: ' + (moi.sheetNames || []).join(' | '));
  }
  var codes = Object.keys(moi.items || {}).sort(soSanhVp_);
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
    if (laGiaThat_(cuGia) && !laGiaThat_(moiGia)) zero.push(c);
  });
  zero.sort(soSanhVp_);
  if (zero.length) errs.push('giá 0/trống sẽ đè giá thật (' + zero.length + '): ' + zero.slice(0, 10).join(', '));
  [{ i: 18, ten: 'Thương Hiệu', cot: 'S' }, { i: 19, ten: 'Quy Cách', cot: 'T' }].forEach(function (c) {
    var co = moi.header && moi.header.length > c.i && chuanTieuDe_(moi.header[c.i]) === chuanTieuDe_(c.ten);
    if (!co) errs.push('Sheet thiếu cột ' + c.ten + ' (cột ' + c.cot + ', web đọc cột này) – chép bù Q–T trước');
  });
  notes.push('mã: bản ghi ' + codes.length + ' / Excel ' + Object.keys(cu.items || {}).length);
  return { ok: errs.length === 0, errs: errs, notes: notes };
}

function itemTuHang_(hang, colMap) {
  if (!hang) return null;
  var maIdx = colMap[chuanTieuDe_('Mã SP')];
  var tenIdx = colMap[chuanTieuDe_('Tên Sản Phẩm')];
  var giaIdx = colMap[chuanTieuDe_('Đơn Giá (Gồm VAT 8%)')];
  var ma = maIdx == null ? '' : chuanGiaTri_(giaO_(hang.cells[maIdx]));
  if (!/^VP\d{3,}$/.test(ma)) return null;
  var price = giaIdx == null ? null : giaO_(hang.cells[giaIdx]);
  var soGia = phanTichGia_(price);
  if (soGia != null) price = soGia;
  else if (price === '') price = null;
  return {
    ma: ma,
    name: tenIdx == null || giaO_(hang.cells[tenIdx]) === '' ? null : giaO_(hang.cells[tenIdx]),
    price: typeof price === 'number' ? price : (price == null || price === '' ? null : price),
    S: giaO_(hang.cells[18]) === '' ? null : giaO_(hang.cells[18]),
    T: giaO_(hang.cells[19]) === '' ? null : giaO_(hang.cells[19])
  };
}

function catalogTuExcel_(moHinh) {
  var tab = moHinh && moHinh.sheets ? moHinh.sheets[TEN_SHEET_DM] : null;
  var items = {};
  var header = (tab && tab.headers) ? tab.headers.slice() : [];
  if (tab && tab.rows) {
    Object.keys(tab.rows).forEach(function (k) {
      var it = itemTuHang_(tab.rows[k], tab.col || {});
      if (it) items[it.ma] = it;
    });
  }
  while (header.length <= 19) header.push('');
  if (!chuanTieuDe_(header[18])) header[18] = 'Thương Hiệu';
  if (!chuanTieuDe_(header[19])) header[19] = 'Quy Cách';
  return { sheetNames: (moHinh && moHinh.sheetNames) || [], header: header, items: items };
}

function lietKeXoa_(baseRows, excelRows, sheetRows) {
  var out = [];
  var seen = {};
  Object.keys(baseRows || {}).forEach(function (k) {
    var matE = !excelRows[k];
    var matS = !sheetRows[k];
    if (matE || matS) {
      seen[k] = true;
      out.push({ khoa: k, excel: matE, sheet: matS, row: excelRows[k] ? excelRows[k].row : (sheetRows[k] ? sheetRows[k].row : (baseRows[k] ? baseRows[k].row : 0)) });
    }
  });
  Object.keys(excelRows || {}).forEach(function (k) {
    if (seen[k] || !baseRows[k]) return;
  });
  Object.keys(sheetRows || {}).forEach(function (k) {
    if (seen[k] || baseRows[k] || excelRows[k]) return;
  });
  return out.filter(function (d) { return !khoaHong_(d.khoa); });
}

function gopKhoa_(ten, cfg, nenTab, excelTab, sheetTab, opts, tui) {
  var colE = excelTab.col || {};
  var cot = cotDongBo_(cfg, colE);
  var giaIdx = cfg.cotGia ? colE[chuanTieuDe_(cfg.cotGia)] : null;
  var eRows = excelTab.rows || {};
  var sRows = sheetTab.rows || {};
  var bRows = (nenTab && nenTab.rows) || {};
  var xoa = [];
  if (opts.dayExcel) {
    Object.keys(sRows).forEach(function (k) {
      if (khoaHong_(k) || eRows[k]) return;
      xoa.push({ khoa: k, excel: true, sheet: false, row: sRows[k].row });
    });
  } else {
    xoa = lietKeXoa_(bRows, eRows, sRows);
  }
  xoa.forEach(function (d) { d.tab = ten; tui.xoaUng.push(d); });

  Object.keys(eRows).forEach(function (k) {
    if (khoaHong_(k) || sRows[k]) return;
    var cells = {};
    cot.forEach(function (idx) {
      var cell = eRows[k].cells[idx];
      if (laBoQuaO_(cell)) return;
      cells[idx] = giaO_(cell);
    });
    tui.themDong.push({ tab: ten, khoa: k, cells: cells, nguon: 'excel' });
    tui.log.push({ tab: ten, khoa: k, cot: '', o: '', nguon: 'excel', cu: '', moi: k, ghiChu: 'thêm dòng từ Excel' });
    tui.canXuat = true;
  });

  if (!opts.dayExcel) {
    Object.keys(sRows).forEach(function (k) {
      if (khoaHong_(k) || eRows[k] || bRows[k]) return;
      tui.canXuat = true;
      tui.log.push({ tab: ten, khoa: k, cot: '', o: '', nguon: 'sheet', cu: '', moi: k, ghiChu: 'thêm dòng từ Sheet, sẽ có khi xuất Excel' });
    });
  }

  var chung = {};
  Object.keys(eRows).forEach(function (k) { if (sRows[k]) chung[k] = true; });
  Object.keys(chung).forEach(function (k) {
    if (khoaHong_(k)) return;
    cot.forEach(function (idx) {
      var ce = eRows[k].cells[idx];
      var cs = sRows[k].cells[idx];
      var cb = bRows[k] && bRows[k].cells ? bRows[k].cells[idx] : null;
      if (laBoQuaO_(ce) || laBoQuaO_(cs) || laBoQuaO_(cb)) return;
      var laCotGia = giaIdx != null && idx === giaIdx;
      var ve = laCotGia ? chuanGiaCot_(giaO_(ce)) : giaO_(ce);
      var vs = laCotGia ? chuanGiaCot_(giaO_(cs)) : giaO_(cs);
      var vb = laCotGia ? chuanGiaCot_(giaO_(cb)) : giaO_(cb);
      var quyet;
      if (opts.dayExcel) {
        if (cungGiaTri_(ve, vs)) return;
        quyet = 'excel';
      } else if (!bRows[k]) {
        if (cungGiaTri_(ve, vs)) return;
        quyet = 'xung-dot';
      } else {
        quyet = quyetDinhO_(vb, ve, vs);
      }
      if (quyet === 'giu') return;
      var tenCot = tenCotTheoIndex_(excelTab.headers, idx);
      var diaChi = cotChu_(idx) + sRows[k].row;
      if (laCotGia && giuGiaNeuLech_(tui, {
        tab: ten, khoa: k, cot: tenCot, o: diaChi, col: idx, row: sRows[k].row,
        quyet: quyet, ve: ve, vs: vs
      })) return;
      if (quyet === 'excel') {
        tui.ghiSheet.push({ tab: ten, khoa: k, col: idx, row: sRows[k].row, giaTri: ve, nguon: 'excel' });
        tui.log.push({ tab: ten, khoa: k, cot: tenCot, o: diaChi, nguon: 'excel', cu: chuoiHien_(vs), moi: chuoiHien_(ve), ghiChu: '' });
        tui.canXuat = true;
      } else if (quyet === 'sheet') {
        tui.canXuat = true;
        tui.log.push({ tab: ten, khoa: k, cot: tenCot, o: diaChi, nguon: 'sheet', cu: chuoiHien_(ve), moi: chuoiHien_(vs), ghiChu: '' });
      } else {
        tui.canXuat = true;
        tui.xungDot.push({
          tab: ten, khoa: k, cot: tenCot, o: diaChi,
          nen: chuoiHien_(vb), excel: chuoiHien_(ve), sheet: chuoiHien_(vs),
          ketLuan: 'Sheet thắng'
        });
        tui.log.push({ tab: ten, khoa: k, cot: tenCot, o: diaChi, nguon: 'xung-dot', cu: chuoiHien_(ve), moi: chuoiHien_(vs), ghiChu: 'Sheet thắng' });
      }
    });
  });

  if (cfg.lienTucVp) {
    Object.keys(eRows).forEach(function (k) {
      var it = itemTuHang_(eRows[k], colE);
      if (!it) return;
      tui.itemsExcel[it.ma] = it;
    });
    Object.keys(eRows).forEach(function (k) {
      if (!sRows[k] && !opts.dayExcel && bRows[k]) return;
      var goc = eRows[k];
      var it2 = itemTuHang_(goc, colE);
      if (!it2) return;
      var tenIdx = colE[chuanTieuDe_('Tên Sản Phẩm')];
      var gia = it2.price;
      var tenSp = it2.name;
      if (sRows[k] && giaIdx != null && !laBoQuaO_(eRows[k].cells[giaIdx]) && !laBoQuaO_(sRows[k].cells[giaIdx])) {
        var veG = chuanGiaCot_(giaO_(eRows[k].cells[giaIdx]));
        var vsG = chuanGiaCot_(giaO_(sRows[k].cells[giaIdx]));
        var vbG = bRows[k] ? chuanGiaCot_(giaO_(bRows[k].cells[giaIdx])) : '';
        var qs = opts.dayExcel ? 'excel' : (bRows[k] ? quyetDinhO_(vbG, veG, vsG) : (cungGiaTri_(veG, vsG) ? 'giu' : 'xung-dot'));
        if (qs === 'sheet' || qs === 'xung-dot') gia = vsG;
        else gia = veG;
        if (tui.giaGiu[it2.ma] != null) gia = tui.giaGiu[it2.ma];
      }
      if (sRows[k] && tenIdx != null && !laBoQuaO_(eRows[k].cells[tenIdx]) && !laBoQuaO_(sRows[k].cells[tenIdx]) && !laBoQuaO_(bRows[k] && bRows[k].cells[tenIdx])) {
        var qt = opts.dayExcel ? 'excel' : (bRows[k] ? quyetDinhO_(giaO_(bRows[k].cells[tenIdx]), giaO_(eRows[k].cells[tenIdx]), giaO_(sRows[k].cells[tenIdx])) : 'giu');
        if (qt === 'sheet' || qt === 'xung-dot') tenSp = giaO_(sRows[k].cells[tenIdx]);
      }
      if (gia === '') gia = null;
      tui.itemsMoi[it2.ma] = { name: tenSp, price: typeof gia === 'number' ? gia : (gia == null || gia === '' ? null : gia), S: it2.S, T: it2.T };
    });
  }
}

function gopO_(ten, nenTab, excelTab, sheetTab, opts, tui) {
  var eo = (excelTab && excelTab.o) || {};
  var so = (sheetTab && sheetTab.o) || {};
  var bo = (nenTab && nenTab.o) || {};
  var refs = {};
  Object.keys(eo).forEach(function (k) { refs[k] = true; });
  Object.keys(so).forEach(function (k) { refs[k] = true; });
  if (!opts.dayExcel) Object.keys(bo).forEach(function (k) { refs[k] = true; });
  var hangE = {};
  var hangS = {};
  var hangB = {};
  function danhDau_(map, cell) {
    if (!cell || laBoQuaO_(cell) || chuanGiaTri_(cell.v) === '') return;
    map[cell.row] = true;
  }
  Object.keys(eo).forEach(function (k) { danhDau_(hangE, eo[k]); });
  Object.keys(so).forEach(function (k) { danhDau_(hangS, so[k]); });
  Object.keys(bo).forEach(function (k) { danhDau_(hangB, bo[k]); });
  if (opts.dayExcel) {
    Object.keys(hangS).forEach(function (rk) {
      if (!hangE[rk]) tui.xoaUng.push({ tab: ten, khoa: 'dong-' + rk, excel: true, sheet: false, row: +rk });
    });
  } else {
    Object.keys(hangB).forEach(function (rk) {
      if (!hangE[rk] || !hangS[rk]) {
        tui.xoaUng.push({ tab: ten, khoa: 'dong-' + rk, excel: !hangE[rk], sheet: !hangS[rk], row: +rk });
      }
    });
  }
  Object.keys(refs).forEach(function (ref) {
    var ce = eo[ref];
    var cs = so[ref];
    var cb = bo[ref];
    if (laBoQuaO_(ce) || laBoQuaO_(cs) || laBoQuaO_(cb)) return;
    var ve = giaO_(ce);
    var vs = giaO_(cs);
    var vb = giaO_(cb);
    var quyet = opts.dayExcel ? (cungGiaTri_(ve, vs) ? 'giu' : 'excel') : quyetDinhO_(vb, ve, vs);
    if (quyet === 'giu') return;
    var row = (cs && cs.row) || (ce && ce.row) || (cb && cb.row);
    var col = (cs && cs.col) || (ce && ce.col) || (cb && cb.col);
    if (quyet === 'excel') {
      if (!cs && (ve === '' || ve == null)) return;
      tui.ghiSheet.push({ tab: ten, khoa: ref, col: col, row: row, giaTri: ve, nguon: 'excel' });
      tui.log.push({ tab: ten, khoa: ref, cot: cotChu_(col), o: ref, nguon: 'excel', cu: chuoiHien_(vs), moi: chuoiHien_(ve), ghiChu: '' });
      tui.canXuat = true;
    } else if (quyet === 'sheet') {
      tui.canXuat = true;
      tui.log.push({ tab: ten, khoa: ref, cot: cotChu_(col), o: ref, nguon: 'sheet', cu: chuoiHien_(ve), moi: chuoiHien_(vs), ghiChu: '' });
    } else {
      tui.canXuat = true;
      tui.xungDot.push({ tab: ten, khoa: ref, cot: cotChu_(col), o: ref, nen: chuoiHien_(vb), excel: chuoiHien_(ve), sheet: chuoiHien_(vs), ketLuan: 'Sheet thắng' });
      tui.log.push({ tab: ten, khoa: ref, cot: cotChu_(col), o: ref, nguon: 'xung-dot', cu: chuoiHien_(ve), moi: chuoiHien_(vs), ghiChu: 'Sheet thắng' });
    }
  });
}

function gopBaBen_(nen, excel, sheet, opts) {
  opts = opts || {};
  var nguong = opts.nguong == null ? NGUONG_XOA_DONG : opts.nguong;
  excel = excel || { sheetNames: [], sheets: {} };
  sheet = sheet || { sheetNames: [], sheets: {} };
  nen = nen || { sheetNames: SHEET_NAMES.slice(), sheets: {} };
  if (!cungDanhSach_(excel.sheetNames, SHEET_NAMES)) {
    return thatBai_('danh sách sheet lệch (Excel): ' + (excel.sheetNames || []).join(' | '));
  }
  if (!cungDanhSach_(sheet.sheetNames, SHEET_NAMES)) {
    return thatBai_('danh sách sheet lệch (Sheet): ' + (sheet.sheetNames || []).join(' | '));
  }
  if (!opts.dayExcel && !cungDanhSach_(nen.sheetNames, SHEET_NAMES)) {
    return thatBai_('danh sách sheet lệch (bản chụp): ' + (nen.sheetNames || []).join(' | '));
  }
  var loiTieuDe = [];
  SHEET_NAMES.forEach(function (ten) {
    var cfg = timCauHinh_(ten);
    if (!cfg || cfg.cheDo !== 'khoa') return;
    var e = excel.sheets[ten] || {};
    var s = sheet.sheets[ten] || {};
    if (e.loi) loiTieuDe.push('Excel ' + ten + ': ' + e.loi);
    if (s.loi) loiTieuDe.push('Sheet ' + ten + ': ' + s.loi);
    var ve = kiemViTri_(e.headers, cfg.viTriExcel);
    if (ve.length) loiTieuDe.push('Excel ' + ten + ': ' + ve.join(', '));
    var thieuE = thieuTen_(e.col || {}, cfg.batBuocExcel || cfg.khoa);
    var thieuS = thieuTen_(s.col || {}, cfg.batBuocSheet || cfg.khoa);
    if (thieuE.length) loiTieuDe.push('Excel ' + ten + ' thiếu tiêu đề ' + thieuE.join(', '));
    if (thieuS.length) loiTieuDe.push('Sheet ' + ten + ' thiếu tiêu đề ' + thieuS.join(', '));
  });
  if (loiTieuDe.length) return thatBai_(loiTieuDe.join(' || '));

  var tui = {
    ghiSheet: [], themDong: [], xoaUng: [], xungDot: [], log: [],
    canXuat: false, itemsExcel: {}, itemsMoi: {}, giaGiu: {}
  };
  var i;
  for (i = 0; i < SHEET_NAMES.length; i++) {
    var ten = SHEET_NAMES[i];
    var cfg = timCauHinh_(ten);
    if (!cfg || cfg.cheDo === 'cam' || cfg.cheDo === 'cong-thuc') continue;
    var eTab = excel.sheets[ten] || { cheDo: cfg.cheDo, rows: {}, o: {} };
    var sTab = sheet.sheets[ten] || { cheDo: cfg.cheDo, rows: {}, o: {} };
    var bTab = (nen.sheets && nen.sheets[ten]) || { cheDo: cfg.cheDo, rows: {}, o: {} };
    if (cfg.cheDo === 'o') gopO_(ten, bTab, eTab, sTab, opts, tui);
    else gopKhoa_(ten, cfg, bTab, eTab, sTab, opts, tui);
  }

  if (tui.xoaUng.length > nguong) {
    return thatBai_('xóa quá nhiều dòng (' + tui.xoaUng.length + ', ngưỡng ' + nguong + '): ' +
      tui.xoaUng.slice(0, 8).map(function (d) { return d.tab + ' ' + d.khoa; }).join(', '));
  }

  var xoaDong = [];
  tui.xoaUng.forEach(function (d) {
    if (d.tab === TEN_SHEET_DM && !d.excel && d.sheet) {
      tui.xungDot.push({
        tab: d.tab, khoa: d.khoa, cot: '', o: '', nen: d.khoa, excel: d.khoa, sheet: '',
        ketLuan: 'Sheet xóa mã, Excel còn, giữ mã'
      });
      tui.log.push({ tab: d.tab, khoa: d.khoa, cot: '', o: '', nguon: 'xung-dot', cu: d.khoa, moi: d.khoa, ghiChu: 'Sheet xóa mã, Excel còn, giữ mã' });
      return;
    }
    if (d.excel && !d.sheet) {
      xoaDong.push(d);
      tui.log.push({ tab: d.tab, khoa: d.khoa, cot: '', o: '', nguon: 'excel', cu: d.khoa, moi: '', ghiChu: 'xóa dòng theo Excel' });
      tui.canXuat = true;
    } else if (d.sheet && !d.excel) {
      tui.canXuat = true;
      tui.log.push({ tab: d.tab, khoa: d.khoa, cot: '', o: '', nguon: 'sheet', cu: d.khoa, moi: '', ghiChu: 'Excel đã không còn dòng, giữ vì không xóa mã đang có trên Excel' });
    } else if (d.excel && d.sheet) {
      tui.log.push({ tab: d.tab, khoa: d.khoa, cot: '', o: '', nguon: 'ca-hai', cu: d.khoa, moi: '', ghiChu: 'cả hai bên đã xóa' });
    }
  });

  var header = [];
  var tabDm = excel.sheets[TEN_SHEET_DM];
  if (tabDm && tabDm.headers) header = tabDm.headers.slice();
  while (header.length <= 19) header.push('');
  if (!chuanTieuDe_(header[18])) header[18] = 'Thương Hiệu';
  if (!chuanTieuDe_(header[19])) header[19] = 'Quy Cách';
  Object.keys(tui.itemsExcel).forEach(function (ma) {
    if (!tui.itemsMoi[ma]) tui.itemsMoi[ma] = { name: tui.itemsExcel[ma].name, price: tui.itemsExcel[ma].price, S: tui.itemsExcel[ma].S, T: tui.itemsExcel[ma].T };
  });
  xoaDong.forEach(function (d) {
    if (d.tab === TEN_SHEET_DM && /^VP\d{3,}/.test(d.khoa)) delete tui.itemsMoi[d.khoa.split('#')[0]];
  });
  var kiem = kiemTraXuat_(
    { sheetNames: SHEET_NAMES.slice(), header: header, items: tui.itemsMoi },
    { sheetNames: SHEET_NAMES.slice(), header: header, items: tui.itemsExcel }
  );
  if (!kiem.ok) return thatBai_(kiem.errs.join(' || '));

  var coViec = tui.canXuat || tui.ghiSheet.length || tui.themDong.length || xoaDong.length || tui.xungDot.length;
  return {
    ok: true,
    dung: false,
    lyDo: coViec ? '' : 'không có ô cần ghi',
    errs: [],
    ghiSheet: tui.ghiSheet,
    themDong: tui.themDong,
    xoaDong: xoaDong,
    xungDot: tui.xungDot,
    log: tui.log,
    canXuat: !!tui.canXuat,
    notes: kiem.notes,
    soGhiSheet: tui.ghiSheet.length,
    soThem: tui.themDong.length,
    soXoa: xoaDong.length,
    soXungDot: tui.xungDot.length
  };
}

function kiemXuatTuFiles_(files, catCu) {
  var ds = danhSachSheetTuTep_(files);
  var names = ds.map(function (s) { return s.name; });
  var dm = gridDanhMuc_(files);
  var cfg = timCauHinh_(TEN_SHEET_DM);
  var header = timHangTieuDe_(dm.grid, cfg.batBuocExcel || ['Mã SP']);
  var rows = hangTheoKhoa_(dm.grid, header, cfg);
  var items = {};
  Object.keys(rows).forEach(function (k) {
    var it = itemTuHang_(rows[k], header.col);
    if (it) items[it.ma] = { name: it.name, price: it.price, S: it.S, T: it.T };
  });
  var head = header.headers.slice();
  while (head.length <= 19) head.push('');
  return kiemTraXuat_({ sheetNames: names, header: head, items: items }, catCu || { sheetNames: names, header: head, items: {} });
}

function excelBiNguoiSua_(meta, lastMd5, lastMod) {
  if (!lastMd5 && !lastMod) return true;
  if (meta && meta.md5Checksum && lastMd5) return String(meta.md5Checksum) !== String(lastMd5);
  if (meta && meta.modifiedTime && lastMod) return String(meta.modifiedTime) !== String(lastMod);
  return true;
}

function sheetBiSua_(meta, lastMod) {
  if (!lastMod) return true;
  if (!meta || !meta.modifiedTime) return true;
  return String(meta.modifiedTime) !== String(lastMod);
}

function dieuChinhCongThuc_(formula, tuHang, denHang) {
  if (!formula) return '';
  var delta = denHang - tuHang;
  return String(formula).replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, function (m, cAbs, col, rAbs, row) {
    if (rAbs === '$') return m;
    var n = parseInt(row, 10) + delta;
    if (n < 1) n = 1;
    return cAbs + col + n;
  });
}

function tomTatKeHoach_(keHoach) {
  keHoach = keHoach || {};
  var mau = (keHoach.log || []).slice(0, 15).map(function (d) {
    return { tab: d.tab, khoa: d.khoa, cot: d.cot, nguon: d.nguon, cu: d.cu, moi: d.moi, ghiChu: d.ghiChu };
  });
  return {
    ok: !!keHoach.ok,
    dung: !!keHoach.dung,
    lyDo: keHoach.lyDo || '',
    errs: keHoach.errs || [],
    canXuat: !!keHoach.canXuat,
    soGhiSheet: (keHoach.ghiSheet || []).length,
    soThem: (keHoach.themDong || []).length,
    soXoa: (keHoach.xoaDong || []).length,
    soXungDot: (keHoach.xungDot || []).length,
    mau: mau,
    notes: keHoach.notes || []
  };
}
