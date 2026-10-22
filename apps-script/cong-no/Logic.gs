/**
 * Vạn Phát — logic thuần cho sổ công nợ v7.
 * File này không gọi SpreadsheetApp, Drive, Gmail, UrlFetch hay LLM.
 * Mọi hàm ghi sheet nằm ở Ghi.gs và chỉ được ghi CN_HangDoi, CN_SucKhoe, CONFIG.
 */

var SHEET_DUOC_GHI = ['CN_HangDoi', 'CN_SucKhoe', 'CONFIG', 'CN_DoiSoat'];

var VUNG_CAM_AD = {
  sheet: 'DM_KhachHang',
  cot: 30,
  dongDau: 2,
  dongCuoi: 501
};

var SHEET_CAN_DOC = [
  'PhieuGiao',
  'HoaDon',
  'ChiTiet_LN',
  'BaoGia',
  'HH_Data',
  'HH_Nhap',
  'Log_CapNhat',
  'DM_KhachHang',
  'LoiNhuan_Data',
  'LoiNhuan',
  'Bill_KiotViet',
  'Dashboard'
];

var VUNG_LOI_CHK = [
  {sheet: 'LoiNhuan_Data', c1: 15, c2: 20},
  {sheet: 'LoiNhuan', c1: 22, c2: 33},
  {sheet: 'DM_KhachHang', c1: 22, c2: 29}
];

var TIEN_TO_LOI = ['#REF', '#N/A', '#VAL', '#DIV', '#NAM', '#ERR'];

var COT_HANG_DOI = [
  'Thời gian',
  'Nguồn',
  'FileId',
  'Tên',
  'Khách hàng',
  'Trạng thái',
  'ModifiedTime',
  'Loại chứng từ',
  'Thư mục',
  'URL',
  'Ghép/Mộc đỏ',
  'Mã KH'
];

var TRANG_THAI_CHO = 'Chờ bot';
var TRANG_THAI_DA_CO = 'Đã có trong sổ';
var TRANG_THAI_SUA = 'Sửa file đã ghi';
var GHEP_CHUA_PDF = 'chưa có PDF mộc đỏ';
var GHEP_DA_PDF = 'đã ghép PDF mộc đỏ';
var KY_HIEU_HD_MAC_DINH = '1?C26TNT_\\d+';

var CONFIG_MAC_DINH = {
  DRIVE_FOLDER_ID: '1KAyFZVJJCqu92Swk5JgX15YY0fZDpdrl',
  V7_SPREADSHEET_ID: '1jkmfMIJsoZrDlOxmkqbj44GOsNb1eh3UNk3Tyn0MaJs',
  GMAIL_BAT: false,
  GMAIL_FROM: 'congtytnhhvanphat999@gmail.com',
  GIA_VON_SHEET_ID: '1Hwslun92TLrhXAMgiVDdd6wyvVXP6sqOQbuTKiLKRrM',
  GIA_VON_SHEET_NAME: 'Danh Mục Vật Tư',
  BO_QUA_THU_MUC: '1. VAO',
  TEN_KHACH: '2. DANH SACH KHACH HANG',
  TEN_HOA_DON: '9. HOA DON',
  TEN_RA: '2. RA',
  TEN_BG: '8. PHIẾU BÁO GIÁ',
  HEADER_PHIEU_GIAO: 'Mã PG (khóa)|Mã PG|Mã Phiếu|Mã phiếu',
  LOAI_TRU_FILE_ID: '1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR,1W3h5ZMzZYReAyZT2Jp39tg-O4U8dZs81',
  LOAI_TRU_TEN: 'backup|bản sao|Copy of|(v6)|_old',
  KY_HIEU_HD: '1?C26TNT_\\d+',
  TZ: 'Asia/Ho_Chi_Minh',
  LOG_STALE_GIO: 26,
  GIO_BAT_DAU: 7,
  GIO_KET_THUC: 18,
  PHUT_TRE_KET: 10
};

var GHI_CHU_CONFIG = {
  DRIVE_FOLDER_ID: 'Thư mục gốc chứng từ, quét đệ quy',
  V7_SPREADSHEET_ID: 'Sổ v7. Trên bản sao, đổi thành id của bản sao trước khi chạy quét',
  GMAIL_BAT: 'FALSE mặc định. TRUE mới lấy email hóa đơn điện tử',
  GMAIL_FROM: 'Chỉ thư gửi TỪ địa chỉ này. Bỏ qua thư nhà cung cấp gửi đến',
  GIA_VON_SHEET_ID: 'Google Sheet danh mục, chỉ đọc',
  GIA_VON_SHEET_NAME: 'Tên sheet trong file danh mục',
  BO_QUA_THU_MUC: 'Bỏ qua cả cây con. Luôn bỏ qua thêm tên 1. VAO',
  TEN_KHACH: 'STT2 — danh sách khách, thư mục từng KH chứa BG/PG',
  TEN_HOA_DON: 'STT9 — thư mục hóa đơn',
  TEN_RA: 'Thư mục HĐ đầu ra. Không mặc định mọi file là HĐ. Có ký hiệu mới là HĐ, không có thì HĐ?',
  TEN_BG: 'Thư mục phiếu báo giá dùng chung',
  HEADER_PHIEU_GIAO: 'PhieuGiao!A1 hợp lệ nếu chứa một cụm. Header đang dùng: Mã PG (khóa)',
  LOAI_TRU_FILE_ID: 'Id file loại trừ, cách nhau bởi dấu phẩy',
  LOAI_TRU_TEN: 'Tên chứa một cụm thì bỏ qua. Cách nhau bởi |',
  KY_HIEU_HD: 'Regex HĐ GTGT. Khớp C26TNT_00000021.pdf và 1C26TNT_00000021.pdf. Không khớp thì HĐ?',
  TZ: 'Múi giờ trigger',
  LOG_STALE_GIO: 'Cảnh báo nếu Log_CapNhat lâu hơn số giờ này',
  GIO_BAT_DAU: 'Giờ bắt đầu quét 15 phút',
  GIO_KET_THUC: 'Giờ kết thúc, gồm mốc 18:00',
  PHUT_TRE_KET: 'Cho phép trigger 18:00 trễ tối đa số phút này'
};

function chuanHoa_(s) {
  var t = String(s == null ? '' : s).replace(/đ/g, 'd').replace(/Đ/g, 'D');
  t = t.toLowerCase();
  if (t.normalize) {
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return t.replace(/\s+/g, ' ').trim();
}

function epGiaTriConfig_(khoa, giaTri) {
  if (khoa === 'GMAIL_BAT') {
    if (giaTri === true) return true;
    var s = chuanHoa_(giaTri);
    return s === 'true' || s === '1' || s === 'bat' || s === 'yes';
  }
  if (khoa === 'LOG_STALE_GIO' || khoa === 'GIO_BAT_DAU' || khoa === 'GIO_KET_THUC' || khoa === 'PHUT_TRE_KET') {
    var n = Number(giaTri);
    return isFinite(n) ? n : CONFIG_MAC_DINH[khoa];
  }
  if (giaTri == null || giaTri === '') return CONFIG_MAC_DINH[khoa];
  return giaTri;
}

function hopNhatConfig_(cap) {
  var out = {};
  var k;
  for (k in CONFIG_MAC_DINH) {
    if (CONFIG_MAC_DINH.hasOwnProperty(k)) out[k] = CONFIG_MAC_DINH[k];
  }
  if (!cap) return out;
  for (k in cap) {
    if (!cap.hasOwnProperty(k)) continue;
    if (!CONFIG_MAC_DINH.hasOwnProperty(k)) continue;
    out[k] = epGiaTriConfig_(k, cap[k]);
  }
  return out;
}

function trongGioQuet_(gio, phut, cfg) {
  cfg = cfg || CONFIG_MAC_DINH;
  var p = Number(gio) * 60 + Number(phut);
  var bat = Number(cfg.GIO_BAT_DAU) * 60;
  var ket = Number(cfg.GIO_KET_THUC) * 60 + Number(cfg.PHUT_TRE_KET);
  return p >= bat && p <= ket;
}

function nenQuetGmail_(cfg) {
  return !!(cfg && cfg.GMAIL_BAT === true);
}

function quyetDinhMoc_(mocCu, bayGioIso) {
  if (!mocCu) return {khoiTao: true, mocQuery: null, mocLuu: bayGioIso};
  return {khoiTao: false, mocQuery: mocCu, mocLuu: bayGioIso};
}

function mocLuc_(file) {
  var m = String((file && file.modifiedTime) || '');
  var c = String((file && file.createdTime) || '');
  return c > m ? c : m;
}

function mocKeTiep_(scanStartIso, daXet, biCat) {
  if (!biCat || !daXet || !daXet.length) return scanStartIso;
  var luc = mocLuc_(daXet[daXet.length - 1]);
  return luc || scanStartIso;
}

function catLuotQuet_(files, gioiHan) {
  var ds = (files || []).slice();
  ds.sort(function(a, b) { return mocLuc_(a).localeCompare(mocLuc_(b)); });
  var gioi = gioiHan || 400;
  if (ds.length <= gioi) return {giu: ds, biCat: false, daXet: ds, tong: ds.length};
  var mocCat = mocLuc_(ds[gioi - 1]);
  var end = gioi;
  while (end < ds.length && mocLuc_(ds[end]) === mocCat) end++;
  var giu = ds.slice(0, end);
  return {giu: giu, biCat: end < ds.length, daXet: giu, tong: ds.length};
}

function dongLoiCatQuet_(soDaXuLy, tong, mocMoi) {
  return dongBaoCao_(
    'QUET_CAT',
    'LỖI',
    'Drive',
    'Quá ' + soDaXuLy + ' file/lượt. Đã xử lý phần cũ nhất, mốc dời tới ' + mocMoi + '. Tổng thấy ' + tong + ' file.'
  );
}

var HAN_CAT_LUOT_MS_ = 7 * 24 * 60 * 60 * 1000;

function lucTuChuoiVn_(s) {
  var m = String(s == null ? '' : s).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  var ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])) - 7 * 60 * 60 * 1000;
  return isFinite(ms) ? ms : null;
}

function lucTuO_(v) {
  if (v instanceof Date) {
    var ms = v.getTime();
    return isFinite(ms) ? ms : null;
  }
  return lucTuChuoiVn_(v);
}

function giuDongCatLuot_(rows, bayGio) {
  var bay = bayGio instanceof Date ? bayGio.getTime() : Number(bayGio);
  var out = [];
  var i;
  if (!isFinite(bay)) return out;
  for (i = 0; i < (rows || []).length; i++) {
    var row = rows[i];
    if (!row || String(row[1] || '') !== 'QUET_CAT') continue;
    var luc = lucTuO_(row[0]);
    if (luc == null) continue;
    if (bay - luc <= HAN_CAT_LUOT_MS_) out.push(row);
  }
  return out;
}

function demLoiMuc_(vals) {
  var n = 0;
  var i;
  for (i = 0; i < (vals || []).length; i++) {
    var o = vals[i];
    var muc = o && typeof o === 'object' && typeof o.length === 'number' ? o[0] : o;
    if (String(muc) === 'LỖI') n++;
  }
  return n;
}

function camGhiSheet_(ten) {
  if (SHEET_DUOC_GHI.indexOf(ten) === -1) {
    throw new Error('Cấm ghi sheet «' + ten + '». Chỉ được ghi: ' + SHEET_DUOC_GHI.join(', '));
  }
}

function chamVungCam_(tenSheet, vung) {
  if (tenSheet !== VUNG_CAM_AD.sheet) return false;
  if (!vung) return false;
  var c1 = vung.column;
  var c2 = c1 + vung.numColumns - 1;
  var r1 = vung.row;
  var r2 = r1 + vung.numRows - 1;
  return c1 <= VUNG_CAM_AD.cot && c2 >= VUNG_CAM_AD.cot &&
    r1 <= VUNG_CAM_AD.dongCuoi && r2 >= VUNG_CAM_AD.dongDau;
}

function assertGhiChoPhep_(tenSheet, vung) {
  if (chamVungCam_(tenSheet, vung)) {
    throw new Error('Cấm ghi DM_KhachHang!AD2:AD501');
  }
  camGhiSheet_(tenSheet);
}

function laLoiCongThuc_(v) {
  if (typeof v !== 'string') return false;
  if (v.charAt(0) !== '#') return false;
  var p = v.substring(0, 4);
  var i;
  for (i = 0; i < TIEN_TO_LOI.length; i++) {
    if (p === TIEN_TO_LOI[i]) return true;
  }
  return false;
}

function cotRaChu_(n) {
  var s = '';
  var so = n;
  while (so > 0) {
    var m = (so - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    so = Math.floor((so - 1) / 26);
  }
  return s;
}

function toA1_(row, col) {
  return cotRaChu_(col) + String(row);
}

function laThuMucBoQua_(name, cfg) {
  cfg = cfg || CONFIG_MAC_DINH;
  var n = chuanHoa_(name);
  if (n === '1. vao' || n === '1.vao') return true;
  var mau = chuanHoa_(cfg.BO_QUA_THU_MUC);
  return !!mau && n === mau;
}

function laThuMucKhach_(name, cfg) {
  var n = chuanHoa_(name);
  return n === chuanHoa_(cfg.TEN_KHACH) || n === 'stt2';
}

function laThuMucHoaDon_(name, cfg) {
  var n = chuanHoa_(name);
  return n === chuanHoa_(cfg.TEN_HOA_DON) || n === 'stt9';
}

function laThuMucRa_(name, cfg) {
  var n = chuanHoa_(name);
  return n === '2. ra' || n === '2.ra' || n === chuanHoa_(cfg.TEN_RA);
}

function laThuMucBg_(name, cfg) {
  return chuanHoa_(name) === chuanHoa_(cfg.TEN_BG);
}

function laThuMucCauTruc_(name, cfg) {
  if (laThuMucBoQua_(name, cfg)) return true;
  if (laThuMucKhach_(name, cfg) || laThuMucHoaDon_(name, cfg) || laThuMucRa_(name, cfg) || laThuMucBg_(name, cfg)) return true;
  var n = chuanHoa_(name);
  if (/^thang\s+\d+/.test(n)) return true;
  return false;
}

function lamSachTenKh_(name) {
  return String(name || '').replace(/^\d+\.\s*/, '').trim();
}

function mauKyHieuHd_(kyHieu) {
  var mau = String(kyHieu == null || kyHieu === '' ? KY_HIEU_HD_MAC_DINH : kyHieu);
  try {
    return new RegExp(mau, 'i');
  } catch (e) {
    return null;
  }
}

function coKyHieuHd_(s, kyHieu) {
  var re = mauKyHieuHd_(kyHieu);
  if (!re) return false;
  return re.test(String(s || ''));
}

function boSo0Dau_(s) {
  var d = String(s == null ? '' : s).replace(/[^\d]/g, '');
  return d.replace(/^0+/, '');
}

function soHdTuTen_(ten, kyHieu) {
  var re = mauKyHieuHd_(kyHieu);
  if (!re) return '';
  var m = String(ten || '').match(re);
  if (!m) return '';
  var so = m[0].match(/(\d+)$/);
  if (!so) return '';
  return boSo0Dau_(so[1]);
}

function loaiTuChuoi_(s, kyHieu) {
  if (!s) return '';
  var t = chuanHoa_(s);
  if (/phieu bao gia|\bbao gia\b|\bbg\d{2}-\d+\b|\bbg\b/.test(t)) return 'BG';
  if (/phieu giao|\bpg\d{2}-\d+\b|\bpg\b/.test(t)) return 'PG';
  if (coKyHieuHd_(t, kyHieu)) return 'HĐ';
  if (/hoa don|\bhddt\b|\bgtgt\b|\bhd\b/.test(t)) return 'HĐ?';
  return '';
}

function nenDiSau_(pathNames, cfg) {
  cfg = cfg || CONFIG_MAC_DINH;
  if (!pathNames || !pathNames.length) return true;
  var i;
  for (i = 0; i < pathNames.length; i++) {
    if (laThuMucBoQua_(pathNames[i], cfg)) return false;
  }
  if (vungChungTu_(pathNames, cfg)) return true;
  var cuoi = pathNames[pathNames.length - 1];
  if (laThuMucHoaDon_(cuoi, cfg) || laThuMucKhach_(cuoi, cfg) || laThuMucRa_(cuoi, cfg) || laThuMucBg_(cuoi, cfg)) return true;
  return false;
}

function idTrongQuery_(id) {
  return String(id || '').replace(/'/g, '\\\'');
}

function vungChungTu_(pathNames, cfg) {
  cfg = cfg || CONFIG_MAC_DINH;
  var i;
  for (i = 0; i < pathNames.length; i++) {
    if (laThuMucBoQua_(pathNames[i], cfg)) return '';
  }
  var ra = false;
  var khach = false;
  var bg = false;
  for (i = 0; i < pathNames.length; i++) {
    if (laThuMucRa_(pathNames[i], cfg)) ra = true;
    if (laThuMucKhach_(pathNames[i], cfg)) khach = true;
    if (laThuMucBg_(pathNames[i], cfg)) bg = true;
  }
  if (ra) return 'RA';
  if (khach) return 'KHACH';
  if (bg) return 'BG_CHUNG';
  return '';
}

function timMaKhach_(ten, dmRows) {
  var tenChuan = chuanHoa_(ten);
  var best = {ma: '', leQuen: false, vangLai: false, dai: 0};
  if (!tenChuan || !dmRows) return best;
  var r;
  for (r = 1; r < dmRows.length; r++) {
    var row = dmRows[r] || [];
    var ma = String(row[0] == null ? '' : row[0]).trim();
    if (!ma) continue;
    var ung = [row[1], row[2]];
    var u;
    var khop = '';
    for (u = 0; u < ung.length; u++) {
      var tenDm = chuanHoa_(ung[u]);
      if (!tenDm) continue;
      if (tenChuan.indexOf(tenDm) < 0 && tenDm.indexOf(tenChuan) < 0) continue;
      if (tenDm.length > khop.length) khop = tenDm;
    }
    if (!khop || khop.length < best.dai) continue;
    var maChuan = chuanHoa_(ma);
    best = {
      ma: ma,
      leQuen: maChuan.indexOf('kl') === 0,
      vangLai: maChuan === 'kh007',
      dai: khop.length
    };
  }
  return best;
}

function doanKhach_(pathNames, cfg, dmRows) {
  cfg = cfg || CONFIG_MAC_DINH;
  var khach = '';
  var i;
  for (i = 0; i < (pathNames || []).length; i++) {
    if (laThuMucKhach_(pathNames[i], cfg) || laThuMucRa_(pathNames[i], cfg)) {
      var next = pathNames[i + 1];
      if (next && !laThuMucCauTruc_(next, cfg)) khach = lamSachTenKh_(next);
    }
  }
  var dm = dmRows || (cfg && cfg.dmKhachHang);
  if (!dm) return khach;
  var tim = timMaKhach_(khach, dm);
  return {ten: khach, ma: tim.ma, leQuen: tim.leQuen, vangLai: tim.vangLai};
}

function doanLoai_(pathNames, fileName, vung, cfg) {
  cfg = cfg || CONFIG_MAC_DINH;
  var ky = cfg.KY_HIEU_HD;
  var theoFile = loaiTuChuoi_(fileName, ky);
  if (theoFile) return theoFile;
  var theoPath = loaiTuChuoi_((pathNames || []).join(' / '), ky);
  if (theoPath) return theoPath;
  if (vung === 'RA') return 'HĐ?';
  if (vung === 'BG_CHUNG') return 'BG';
  return '';
}

function laMimeBoQua_(mime) {
  var m = String(mime || '');
  if (!m) return false;
  if (m === 'application/vnd.google-apps.folder') return true;
  if (m === 'application/vnd.google-apps.shortcut') return true;
  if (m.indexOf('video/') === 0) return true;
  if (m.indexOf('audio/') === 0) return true;
  return false;
}

function laMimeChungTu_(mime, name) {
  var m = String(mime || '');
  if (m === 'application/pdf') return true;
  if (m.indexOf('image/') === 0) return true;
  if (m.indexOf('spreadsheet') >= 0 || m.indexOf('excel') >= 0 || m.indexOf('officedocument.spreadsheet') >= 0) return true;
  if (m.indexOf('word') >= 0 || m.indexOf('document') >= 0 || m.indexOf('pdf') >= 0) return true;
  var n = chuanHoa_(name);
  return /\.(pdf|xlsx|xls|csv|jpg|jpeg|png|webp|heic|tif|tiff|doc|docx)$/.test(n);
}

function tachDanhSach_(s, sep) {
  var raw = String(s == null ? '' : s).split(sep);
  var out = [];
  var i;
  for (i = 0; i < raw.length; i++) {
    var t = String(raw[i] || '').trim();
    if (t) out.push(t);
  }
  return out;
}

function biLoaiTru_(item, cfg) {
  cfg = cfg || CONFIG_MAC_DINH;
  if (!item) return false;
  var id = String(item.fileId || item.id || '');
  if (id && (id === cfg.V7_SPREADSHEET_ID || id === cfg.GIA_VON_SHEET_ID)) return true;
  var ids = tachDanhSach_(cfg.LOAI_TRU_FILE_ID, ',');
  var i;
  for (i = 0; i < ids.length; i++) {
    if (id && id === ids[i]) return true;
  }
  var chuoi = chuanHoa_([item.ten, item.name, item.thuMuc, (item.pathNames || []).join(' ')].join(' '));
  var maus = tachDanhSach_(cfg.LOAI_TRU_TEN, '|');
  for (i = 0; i < maus.length; i++) {
    var m = chuanHoa_(maus[i]);
    if (m && chuoi.indexOf(m) >= 0) return true;
  }
  return false;
}

function nenDuaVaoHangDoi_(item, cfg) {
  cfg = cfg || CONFIG_MAC_DINH;
  if (!item || item.boQua || !item.trongCay) return false;
  if (biLoaiTru_(item, cfg)) return false;
  if (laMimeBoQua_(item.mime)) return false;
  var vung = item.vung || vungChungTu_(item.pathNames || [], cfg);
  if (!vung) return false;
  if (vung === 'BG_CHUNG') return item.loai === 'BG';
  return laMimeChungTu_(item.mime, item.ten);
}

function cayCuaFile_(file, rootId, cfg, cache, layThuMuc) {
  var names = [];
  var parents = (file && file.parents) ? file.parents.slice() : [];
  var seen = {};
  var guard = 0;
  while (parents.length && guard < 30) {
    var id = parents[0];
    if (id === rootId) {
      names.reverse();
      return {trongCay: true, boQua: false, pathNames: names};
    }
    if (seen[id]) break;
    seen[id] = true;
    var info = cache[id];
    if (!info) {
      info = layThuMuc(id);
      cache[id] = info;
    }
    if (!info) break;
    if (laThuMucBoQua_(info.name, cfg)) {
      return {trongCay: false, boQua: true, pathNames: []};
    }
    names.push(info.name);
    parents = info.parents || [];
    guard++;
  }
  return {trongCay: false, boQua: false, pathNames: []};
}

function nhanDienFile_(file, cfg, dmKhachHang) {
  cfg = cfg || CONFIG_MAC_DINH;
  var pathNames = file.pathNames || [];
  var trongCay = !!file.trongCay;
  var boQua = !!file.boQua;
  var vung = '';
  var loai = '';
  var khach = '';
  var maKh = '';
  var leQuen = false;
  var vangLai = false;
  if (trongCay && !boQua) {
    vung = vungChungTu_(pathNames, cfg);
    loai = doanLoai_(pathNames, file.name, vung, cfg);
    var doan = doanKhach_(pathNames, cfg, dmKhachHang || (cfg && cfg.dmKhachHang));
    if (doan && typeof doan === 'object') {
      khach = doan.ten || '';
      maKh = doan.ma || '';
      leQuen = !!doan.leQuen;
      vangLai = !!doan.vangLai;
    } else {
      khach = doan || '';
    }
  }
  var item = {
    nguon: 'Drive',
    fileId: file.id,
    ten: file.name,
    mime: file.mime,
    pathNames: pathNames,
    trongCay: trongCay,
    boQua: boQua,
    vung: vung,
    loai: loai,
    khach: khach,
    maKh: maKh,
    leQuen: leQuen,
    vangLai: vangLai,
    modifiedTime: file.modifiedTime || '',
    createdTime: file.createdTime || '',
    thuMuc: pathNames.join(' / '),
    url: 'https://drive.google.com/file/d/' + file.id + '/view'
  };
  item.duaVao = nenDuaVaoHangDoi_(item, cfg);
  return item;
}

function nhanDienTuCay_(file, rootId, cfg, cache, layThuMuc, dmKhachHang) {
  var cay = cayCuaFile_(file, rootId, cfg, cache, layThuMuc);
  return nhanDienFile_({
    id: file.id,
    name: file.name,
    mime: file.mime,
    modifiedTime: file.modifiedTime,
    createdTime: file.createdTime,
    pathNames: cay.pathNames,
    trongCay: cay.trongCay,
    boQua: cay.boQua
  }, cfg, dmKhachHang);
}

function khoaTrung_(fileId, modifiedTime) {
  return String(fileId) + '\n' + String(modifiedTime);
}

function tachChuaCo_(files, dongCu) {
  var co = {};
  var i;
  for (i = 0; i < (dongCu || []).length; i++) {
    co[khoaTrung_(dongCu[i].fileId, dongCu[i].modifiedTime)] = true;
    if (dongCu[i].fileIdPhu) co[khoaTrung_(dongCu[i].fileIdPhu, dongCu[i].modifiedTime)] = true;
  }
  var chua = [];
  var da = [];
  for (i = 0; i < (files || []).length; i++) {
    if (co[khoaTrung_(files[i].fileId, files[i].modifiedTime)]) da.push(files[i]);
    else chua.push(files[i]);
  }
  return {chua: chua, da: da};
}

function locTrung_(daCo, moi) {
  var set = {};
  var giu = [];
  var bo = 0;
  var i;
  for (i = 0; i < daCo.length; i++) {
    set[khoaTrung_(daCo[i].fileId, daCo[i].modifiedTime)] = true;
  }
  for (i = 0; i < moi.length; i++) {
    var k = khoaTrung_(moi[i].fileId, moi[i].modifiedTime);
    if (set[k]) {
      bo++;
      continue;
    }
    set[k] = true;
    giu.push(moi[i]);
  }
  return {giu: giu, bo: bo};
}

function dongHangDoi_(thoiGian, item) {
  var ghep = item.ghep || '';
  if (!ghep && laXlsx_(item)) ghep = GHEP_CHUA_PDF;
  else if (!ghep && laPdf_(item)) ghep = 'chỉ có PDF mộc đỏ';
  return [
    thoiGian,
    item.nguon,
    item.fileId,
    item.ten,
    item.khach || '',
    item.trangThai || TRANG_THAI_CHO,
    item.modifiedTime,
    item.loai || '',
    item.thuMuc || '',
    item.url || '',
    ghep,
    item.maKh || ''
  ];
}

function laTrangThaiCanBot_(trang) {
  return trang === TRANG_THAI_CHO || trang === TRANG_THAI_SUA;
}

function demCanBot_(trangThai) {
  var n = 0;
  var i;
  for (i = 0; i < (trangThai || []).length; i++) {
    if (laTrangThaiCanBot_(trangThai[i])) n++;
  }
  return n;
}

function dauNgayVnIso_(bayGio) {
  var d = bayGio instanceof Date ? bayGio : new Date(bayGio);
  var ms = d.getTime();
  if (isNaN(ms)) return '';
  var vn = new Date(ms + 7 * 3600000);
  var startVn = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate());
  return new Date(startVn - 7 * 3600000).toISOString();
}

function mocQuetDrive_(mocCu, bayGioIso) {
  var dau = dauNgayVnIso_(bayGioIso);
  var cu = String(mocCu || '');
  if (!cu) return {khoiTao: true, mocQuery: dau, mocLuu: bayGioIso};
  return {khoiTao: false, mocQuery: cu < dau ? cu : dau, mocLuu: bayGioIso};
}

function truyVanGmail_(from, afterEpochSec) {
  var q = 'from:' + from + ' has:attachment -in:spam -in:trash';
  if (afterEpochSec) q += ' after:' + String(afterEpochSec);
  return q;
}

function thuGuiTu_(fromHeader, diaChi) {
  if (!diaChi) return false;
  return String(fromHeader || '').toLowerCase().indexOf(String(diaChi).toLowerCase()) >= 0;
}

function loaiGmail_(tenFile, cfg) {
  cfg = cfg || CONFIG_MAC_DINH;
  var loai = loaiTuChuoi_(tenFile, cfg.KY_HIEU_HD);
  return loai || 'HĐ?';
}

function headerPhieuGiaoHopLe_(a1, cauHinh) {
  if (a1 == null) return false;
  var text = String(a1);
  if (!text || laLoiCongThuc_(text)) return false;
  var h = chuanHoa_(text);
  var tokens = String(cauHinh || CONFIG_MAC_DINH.HEADER_PHIEU_GIAO).split('|');
  var i;
  for (i = 0; i < tokens.length; i++) {
    var t = chuanHoa_(tokens[i]);
    if (t && h.indexOf(t) >= 0) return true;
  }
  return false;
}

var AN_HAN_HH_MS = 60 * 60 * 1000;

function phanLoaiThieuKey_(thieu, truoc, bayGioMs) {
  truoc = truoc || {daKhoiTao: false, moc: {}};
  var daKhoiTao = !!truoc.daKhoiTao;
  var cu = truoc.moc || {};
  var moc = {};
  var canhBao = [];
  var loi = [];
  var i;
  for (i = 0; i < (thieu || []).length; i++) {
    var key = thieu[i];
    var lanDau = cu[key];
    if (!daKhoiTao) {
      lanDau = new Date(bayGioMs - AN_HAN_HH_MS).toISOString();
      loi.push(key);
    } else if (!lanDau) {
      lanDau = new Date(bayGioMs).toISOString();
      canhBao.push(key);
    } else {
      var tuoi = bayGioMs - new Date(lanDau).getTime();
      if (tuoi >= AN_HAN_HH_MS) loi.push(key);
      else canhBao.push(key);
    }
    moc[key] = lanDau;
  }
  return {daKhoiTao: true, moc: moc, canhBao: canhBao, loi: loi};
}

function khoaThieu_(dataRows, nhapRows) {
  var nhap = {};
  var thieu = [];
  var daThay = {};
  var i;
  var key;
  for (i = 1; i < (nhapRows || []).length; i++) {
    key = nhapRows[i] && nhapRows[i][0];
    if (key == null || key === '') continue;
    nhap[String(key)] = true;
  }
  for (i = 1; i < (dataRows || []).length; i++) {
    key = dataRows[i] && dataRows[i][0];
    if (key == null || key === '') continue;
    var s = String(key);
    if (nhap[s] || daThay[s]) continue;
    daThay[s] = true;
    thieu.push(s);
  }
  return thieu;
}

function quetLoiTrenLuoi_(grid, ten, gioiHan, locCot) {
  var tong = 0;
  var mau = [];
  var r;
  var c;
  if (!grid) return {tong: 0, mau: mau};
  for (r = 0; r < grid.length; r++) {
    var row = grid[r] || [];
    var cStart = 0;
    var cEnd = row.length - 1;
    if (locCot) {
      cStart = locCot.c1;
      cEnd = locCot.c2;
    }
    for (c = cStart; c <= cEnd && c < row.length; c++) {
      if (!laLoiCongThuc_(row[c])) continue;
      tong++;
      if (mau.length < gioiHan) mau.push(ten + '!' + toA1_(r + 1, c + 1) + '=' + row[c]);
    }
  }
  return {tong: tong, mau: mau};
}

function quetLoiCongThuc_(sheets) {
  var tong = 0;
  var mau = [];
  var ten;
  for (ten in sheets) {
    if (!sheets.hasOwnProperty(ten) || !sheets[ten]) continue;
    var mot = quetLoiTrenLuoi_(sheets[ten], ten, 30 - mau.length, null);
    tong += mot.tong;
    var i;
    for (i = 0; i < mot.mau.length && mau.length < 30; i++) mau.push(mot.mau[i]);
  }
  return {tong: tong, mau: mau};
}

function quetLoiVung_(sheets) {
  var tong = 0;
  var mau = [];
  var i;
  for (i = 0; i < VUNG_LOI_CHK.length; i++) {
    var v = VUNG_LOI_CHK[i];
    var grid = sheets[v.sheet];
    if (!grid) continue;
    var mot = quetLoiTrenLuoi_(grid, v.sheet, 15 - mau.length, v);
    tong += mot.tong;
    var j;
    for (j = 0; j < mot.mau.length && mau.length < 15; j++) mau.push(mot.mau[j]);
  }
  return {tong: tong, mau: mau};
}

function quetAdKhach_(grid) {
  var dat = 0;
  var datMau = [];
  var thangSo = 0;
  var thang = [];
  var max = Math.min(grid.length, 501);
  var r;
  for (r = 1; r < max; r++) {
    var cell = grid[r] && grid[r].length > 29 ? grid[r][29] : '';
    if (cell == null || cell === '') continue;
    var s = String(cell);
    if (s.indexOf('#') >= 0) {
      thangSo++;
      if (thang.length < 10) thang.push(toA1_(r + 1, 30) + '=' + s);
      continue;
    }
    if (s.indexOf('Đạt') >= 0) {
      dat++;
      if (datMau.length < 10) datMau.push(toA1_(r + 1, 30));
    }
  }
  return {dat: dat, datMau: datMau, thangSo: thangSo, thang: thang};
}

function docNgay_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'string' && v) {
    var d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function dongBaoCao_(ma, muc, doiTuong, chiTiet) {
  return {ma: ma, muc: muc, doiTuong: doiTuong, chiTiet: String(chiTiet == null ? '' : chiTiet)};
}

function danhGiaLog_(inp) {
  if (!inp.coLog) return dongBaoCao_('LOG_CAP_NHAT', 'LỖI', 'Log_CapNhat', 'Không có sheet');
  var header = inp.logHeader == null ? '' : String(inp.logHeader);
  if (!header || chuanHoa_(header).indexOf('thoi') !== 0) {
    return dongBaoCao_('LOG_CAP_NHAT', 'LỖI', 'Log_CapNhat!A1', 'Header lạ: ' + header);
  }
  var tail = inp.logTail || [];
  if (!tail.length) return dongBaoCao_('LOG_CAP_NHAT', 'LỖI', 'Log_CapNhat', 'Không có dòng dữ liệu');
  var tomTat = [];
  var i;
  for (i = 0; i < tail.length; i++) {
    var r = tail[i] || [];
    tomTat.push(String(r[0] == null ? '' : r[0]) + ' | ' + String(r[1] == null ? '' : r[1]) + ' | ' + String(r[2] == null ? '' : r[2]));
  }
  var chuoi = tomTat.join(' || ');
  var last = tail[tail.length - 1] || [];
  var ngay = docNgay_(inp.logLucCuoi);
  if (!ngay) ngay = docNgay_(last[0]);
  var gio = inp.staleGio || CONFIG_MAC_DINH.LOG_STALE_GIO;
  if (ngay && inp.bayGio) {
    var bay = inp.bayGio instanceof Date ? inp.bayGio : new Date(inp.bayGio);
    if (!isNaN(bay.getTime())) {
      var lech = (bay.getTime() - ngay.getTime()) / 36e5;
      if (lech > gio) {
        return dongBaoCao_('LOG_CAP_NHAT', 'CẢNH BÁO', 'Log_CapNhat', 'Lần cuối cách ' + lech.toFixed(1) + ' giờ. ' + chuoi);
      }
    }
  }
  return dongBaoCao_('LOG_CAP_NHAT', 'OK', 'Log_CapNhat', chuoi);
}

function lapBaoCaoSucKhoe_(inp) {
  inp = inp || {};
  var sheets = inp.sheets || {};
  var rows = [];
  var can = inp.sheetCan || SHEET_CAN_DOC;
  var i;
  for (i = 0; i < can.length; i++) {
    if (!sheets[can[i]]) rows.push(dongBaoCao_('THIEU_SHEET', 'LỖI', can[i], 'Không có sheet'));
  }
  var loi = quetLoiCongThuc_(sheets);
  rows.push(dongBaoCao_(
    'LOI_CONG_THUC',
    loi.tong ? 'LỖI' : 'OK',
    'Toàn sổ',
    'Số ô #REF/#N/A/#VALUE!/#DIV/0!/#NAME?/#ERROR!: ' + loi.tong
  ));
  for (i = 0; i < loi.mau.length; i++) rows.push(dongBaoCao_('LOI_CONG_THUC', 'LỖI', 'Ô', loi.mau[i]));
  var vung = quetLoiVung_(sheets);
  rows.push(dongBaoCao_(
    'LOI_VUNG',
    vung.tong ? 'LỖI' : 'OK',
    'LoiNhuan_Data P-U / LoiNhuan W-AH / DM_KhachHang W-AD',
    'Số ô lỗi trong vùng chk.py: ' + vung.tong
  ));
  for (i = 0; i < vung.mau.length; i++) rows.push(dongBaoCao_('LOI_VUNG', 'LỖI', 'Ô', vung.mau[i]));
  var hop = headerPhieuGiaoHopLe_(inp.phieuGiaoA1, inp.headerChapNhan || CONFIG_MAC_DINH.HEADER_PHIEU_GIAO);
  rows.push(dongBaoCao_(
    'HEADER_PHIEU_GIAO',
    hop ? 'OK' : 'LỖI',
    'PhieuGiao!A1',
    'Giá trị: ' + (inp.phieuGiaoA1 == null ? '' : inp.phieuGiaoA1)
  ));
  if (sheets.HH_Data && sheets.HH_Nhap) {
    var thieu = khoaThieu_(sheets.HH_Data, sheets.HH_Nhap);
    var bayMs = inp.bayGio ? new Date(inp.bayGio).getTime() : 0;
    var phan = phanLoaiThieuKey_(thieu, inp.hhThieu, bayMs);
    inp.hhThieuSau = phan;
    if (!thieu.length) {
      rows.push(dongBaoCao_('HH_THIEU_KEY', 'OK', 'HH_Data/HH_Nhap', 'Đủ khóa cột A'));
    }
    if (phan.canhBao.length) {
      rows.push(dongBaoCao_(
        'HH_THIEU_KEY',
        'CẢNH BÁO',
        'HH_Data/HH_Nhap',
        'Key mới chưa tới 60 phút: ' + phan.canhBao.slice(0, 20).join(', ')
      ));
    }
    if (phan.loi.length) {
      rows.push(dongBaoCao_(
        'HH_THIEU_KEY',
        'LỖI',
        'HH_Data/HH_Nhap',
        'Thiếu quá 60 phút, ' + phan.loi.length + ' khóa: ' + phan.loi.slice(0, 20).join(', ')
      ));
    }
  }
  rows.push(danhGiaLog_(inp));
  if (sheets.DM_KhachHang) {
    var ad = quetAdKhach_(sheets.DM_KhachHang);
    rows.push(dongBaoCao_(
      'DM_AD_DAT',
      'THÔNG TIN',
      'DM_KhachHang!AD2:AD501',
      'Số ô chứa Đạt: ' + ad.dat + (ad.datMau.length ? ' | ' + ad.datMau.join(', ') : '') + '. Chỉ đọc, không ghi.'
    ));
    rows.push(dongBaoCao_(
      'DM_AD_LOI',
      ad.thangSo ? 'LỖI' : 'OK',
      'DM_KhachHang!AD2:AD501',
      ad.thangSo ? ('Số ô chứa #: ' + ad.thangSo + ' | ' + ad.thang.join(', ')) : 'Không có # trên AD2:AD501'
    ));
  }
  var dem = ['PhieuGiao', 'HoaDon', 'BaoGia', 'ChiTiet_LN', 'Bill_KiotViet', 'Dashboard', 'Log_CapNhat'];
  for (i = 0; i < dem.length; i++) {
    if (!sheets[dem[i]]) continue;
    rows.push(dongBaoCao_('SO_DONG', 'OK', dem[i], 'Số dòng đọc được, kể cả header: ' + sheets[dem[i]].length));
  }
  return rows;
}

function demMuc_(rows, muc) {
  var n = 0;
  var i;
  for (i = 0; i < rows.length; i++) if (rows[i].muc === muc) n++;
  return n;
}

function timCotHeader_(headers, mauRegex) {
  var i;
  for (i = 0; i < (headers || []).length; i++) {
    var ten = chuanHoa_(headers[i]);
    if (ten && mauRegex.test(ten)) return i;
  }
  return -1;
}

function tomTatDanhMuc_(headers) {
  return {
    cotMa: timCotHeader_(headers, /^ma(\s|$)/),
    cotTen: timCotHeader_(headers, /^ten(\s|$)/),
    cotDonGia: timCotHeader_(headers, /^don gia/),
    cotGiaVon: timCotHeader_(headers, /gia von/)
  };
}

function laXlsx_(item) {
  if (!item) return false;
  var m = String(item.mime || '');
  var n = chuanHoa_(item.ten || item.name || '');
  if (m.indexOf('spreadsheet') >= 0 || m.indexOf('excel') >= 0 || m.indexOf('officedocument.spreadsheet') >= 0) return true;
  return /\.xlsx$|\.xls$/.test(n);
}

function laPdf_(item) {
  if (!item) return false;
  var m = String(item.mime || '');
  var n = chuanHoa_(item.ten || item.name || '');
  if (m === 'application/pdf' || m.indexOf('/pdf') >= 0) return true;
  return /\.pdf$/.test(n);
}

function gocTen_(ten) {
  return String(ten || '').replace(/\.(xlsx|xls|pdf)$/i, '');
}

function khoaGhep_(item) {
  if (!item || !(laXlsx_(item) || laPdf_(item))) return '';
  return chuanHoa_(item.thuMuc || '') + '\n' + chuanHoa_(gocTen_(item.ten || item.name || ''));
}

function banSaoItem_(item) {
  return {
    nguon: item.nguon || 'Drive',
    fileId: item.fileId || '',
    fileIdPhu: item.fileIdPhu || '',
    ten: item.ten || '',
    mime: item.mime || '',
    khach: item.khach || '',
    maKh: item.maKh || '',
    loai: item.loai || '',
    trangThai: item.trangThai || '',
    modifiedTime: item.modifiedTime || '',
    createdTime: item.createdTime || '',
    thuMuc: item.thuMuc || '',
    url: item.url || '',
    ghep: item.ghep || '',
    pathNames: item.pathNames || [],
    leQuen: !!item.leQuen,
    vangLai: !!item.vangLai
  };
}

function ganNhanGhep_(item) {
  var o = banSaoItem_(item);
  if (!o.ghep && laXlsx_(o)) o.ghep = GHEP_CHUA_PDF;
  else if (!o.ghep && laPdf_(o)) o.ghep = 'chỉ có PDF mộc đỏ';
  return o;
}

function noiUrl_(a, b) {
  var ds = [];
  function them(s) {
    var p = String(s || '').split('|');
    var i;
    for (i = 0; i < p.length; i++) {
      var u = p[i].trim();
      if (u && ds.indexOf(u) < 0) ds.push(u);
    }
  }
  them(a);
  them(b);
  return ds.join(' | ');
}

function gopMotNhom_(ds) {
  var xlsx = null;
  var pdf = null;
  var i;
  for (i = 0; i < ds.length; i++) {
    if (laXlsx_(ds[i]) && (!xlsx || mocLuc_(ds[i]) >= mocLuc_(xlsx))) xlsx = ds[i];
    else if (laPdf_(ds[i]) && (!pdf || mocLuc_(ds[i]) >= mocLuc_(pdf))) pdf = ds[i];
  }
  if (xlsx && pdf) {
    var o = banSaoItem_(xlsx);
    o.fileId = xlsx.fileId;
    o.fileIdPhu = pdf.fileId;
    o.url = noiUrl_(xlsx.url, pdf.url);
    var mx = String(xlsx.modifiedTime || '');
    var mp = String(pdf.modifiedTime || '');
    o.modifiedTime = mx >= mp ? xlsx.modifiedTime : pdf.modifiedTime;
    var cx = String(xlsx.createdTime || '');
    var cp = String(pdf.createdTime || '');
    o.createdTime = cx >= cp ? xlsx.createdTime : pdf.createdTime;
    o.ghep = GHEP_DA_PDF;
    o.loai = xlsx.loai || pdf.loai;
    o.khach = xlsx.khach || pdf.khach;
    o.maKh = xlsx.maKh || pdf.maKh;
    return o;
  }
  if (xlsx) return ganNhanGhep_(xlsx);
  if (pdf) return ganNhanGhep_(pdf);
  return ganNhanGhep_(ds[0]);
}

function gopItemCungDot_(items) {
  var nhom = {};
  var thuTu = [];
  var le = [];
  var i;
  for (i = 0; i < (items || []).length; i++) {
    var it = items[i];
    var k = khoaGhep_(it);
    if (!k) {
      le.push(ganNhanGhep_(it));
      continue;
    }
    if (!nhom[k]) {
      nhom[k] = [];
      thuTu.push(k);
    }
    nhom[k].push(it);
  }
  var out = [];
  for (i = 0; i < thuTu.length; i++) out.push(gopMotNhom_(nhom[thuTu[i]]));
  for (i = 0; i < le.length; i++) out.push(le[i]);
  return out;
}

function idTuUrl_(url) {
  var s = String(url || '');
  var m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

function chuanSo_(s) {
  return chuanHoa_(s).replace(/[^a-z0-9]/g, '');
}

var COT_SO_CHUNG_TU = {
  BaoGia: {so: 3, url: 8},
  PhieuGiao: {so: 3, url: 10},
  HoaDon: {so: 0, url: 10}
};

function chiMucSo_(sheets) {
  var ids = {};
  var dsSo = [];
  var soHd = {};
  var ten;
  for (ten in COT_SO_CHUNG_TU) {
    if (!COT_SO_CHUNG_TU.hasOwnProperty(ten)) continue;
    var grid = sheets && sheets[ten];
    if (!grid) continue;
    var cot = COT_SO_CHUNG_TU[ten];
    var r;
    for (r = 1; r < grid.length; r++) {
      var row = grid[r] || [];
      var so = String(row[cot.so] == null ? '' : row[cot.so]).trim();
      var url = String(row[cot.url] == null ? '' : row[cot.url]);
      var id = idTuUrl_(url);
      if (id && !ids[id]) ids[id] = {sheet: ten, so: so};
      if (ten === 'HoaDon') {
        var soChuan = boSo0Dau_(so);
        if (soChuan && !soHd[soChuan]) soHd[soChuan] = {sheet: 'HoaDon', so: soChuan, soGoc: so};
      }
      var key = chuanSo_(so);
      if (key.length >= 4) dsSo.push({key: key, sheet: ten, so: so});
    }
  }
  dsSo.sort(function(a, b) { return b.key.length - a.key.length; });
  return {ids: ids, dsSo: dsSo, soHd: soHd};
}

function idsCuaItem_(item) {
  var ids = [];
  function them(s) {
    var raw = String(s || '').trim();
    if (!raw) return;
    if (raw.indexOf('|') >= 0) {
      var p = raw.split('|');
      var i;
      for (i = 0; i < p.length; i++) them(p[i]);
      return;
    }
    var id = raw;
    if (id.indexOf('http') >= 0 || id.indexOf('/d/') >= 0 || id.indexOf('id=') >= 0) {
      var u = idTuUrl_(id);
      if (u) id = u;
    }
    if (id && ids.indexOf(id) < 0) ids.push(id);
  }
  if (!item) return ids;
  them(item.fileId);
  them(item.fileIdPhu);
  them(item.url);
  return ids;
}

function fileDaCoTrongSo_(item, chiMuc, cfg) {
  if (!item || !chiMuc) return null;
  cfg = cfg || CONFIG_MAC_DINH;
  var ids = idsCuaItem_(item);
  var i;
  for (i = 0; i < ids.length; i++) {
    if (chiMuc.ids[ids[i]]) {
      return {cach: 'fileId', sheet: chiMuc.ids[ids[i]].sheet, so: chiMuc.ids[ids[i]].so || ''};
    }
  }
  var soTen = soHdTuTen_(item.ten, cfg.KY_HIEU_HD);
  if (soTen && chiMuc.soHd && chiMuc.soHd[soTen]) {
    return {cach: 'soHd', sheet: 'HoaDon', so: chiMuc.soHd[soTen].so};
  }
  var ten = chuanSo_(item.ten || '');
  var ds = chiMuc.dsSo || [];
  for (i = 0; i < ds.length; i++) {
    if (ds[i].key.length < 4) continue;
    if (ten.indexOf(ds[i].key) >= 0) return {cach: 'so', sheet: ds[i].sheet, so: ds[i].so};
  }
  return null;
}

function trangThaiVoiSo_(modifiedMoi, dongCu, khopSo) {
  var cu = dongCu ? String(dongCu.modifiedTime || '') : '';
  var moi = String(modifiedMoi || '');
  if (khopSo && cu && moi > cu) return TRANG_THAI_SUA;
  if (khopSo) return TRANG_THAI_DA_CO;
  return TRANG_THAI_CHO;
}

function hopVoiDongCu_(cu, it) {
  if (!cu) return it;
  var hop = gopMotNhom_([cu, it]);
  if (cu.fileIdPhu && !hop.fileIdPhu) hop.fileIdPhu = cu.fileIdPhu;
  if ((cu.ghep === GHEP_DA_PDF || cu.fileIdPhu) && hop.ghep !== GHEP_DA_PDF && !laPdf_(hop)) hop.ghep = cu.ghep || GHEP_DA_PDF;
  hop.url = noiUrl_(cu.url, hop.url);
  if (!hop.khach) hop.khach = cu.khach || '';
  if (!hop.maKh) hop.maKh = cu.maKh || '';
  if (!hop.loai) hop.loai = cu.loai || '';
  return hop;
}

function cungBan_(cu, it) {
  if (!cu || !it) return false;
  if (String(cu.modifiedTime || '') !== String(it.modifiedTime || '')) return false;
  if (String(cu.ghep || '') !== String(it.ghep || '')) return false;
  var a = idsCuaItem_(cu).slice().sort().join('|');
  var b = idsCuaItem_(it).slice().sort().join('|');
  return a === b;
}

function xuLyDotQuet_(dongCu, items, chiMuc, cfg) {
  var theoId = {};
  var theoGhep = {};
  var i;
  var k;
  for (i = 0; i < (dongCu || []).length; i++) {
    var d = dongCu[i];
    var ids = idsCuaItem_(d);
    for (k = 0; k < ids.length; k++) theoId[ids[k]] = d;
    var kg = khoaGhep_(d);
    if (kg) theoGhep[kg] = d;
  }
  var donVi = gopItemCungDot_(items);
  var them = [];
  var sua = [];
  for (i = 0; i < donVi.length; i++) {
    var it = donVi[i];
    var cu = null;
    var idsIt = idsCuaItem_(it);
    for (k = 0; k < idsIt.length; k++) {
      if (theoId[idsIt[k]]) cu = theoId[idsIt[k]];
    }
    if (!cu) {
      var khoa = khoaGhep_(it);
      if (khoa && theoGhep[khoa]) cu = theoGhep[khoa];
    }
    if (cu) it = hopVoiDongCu_(cu, it);
    var khop = fileDaCoTrongSo_(it, chiMuc, cfg);
    if (cu && cungBan_(cu, it)) {
      if (khop && cu.trangThai === TRANG_THAI_CHO) {
        var cap = banSaoItem_(it);
        cap.trangThai = TRANG_THAI_DA_CO;
        cap.khach = cap.khach || cu.khach;
        cap.maKh = cap.maKh || cu.maKh;
        sua.push({row: cu.row, item: cap});
        cu.trangThai = TRANG_THAI_DA_CO;
      }
      continue;
    }
    it.trangThai = trangThaiVoiSo_(it.modifiedTime, cu, !!khop);
    if (!it.khach && cu) it.khach = cu.khach;
    if (!it.maKh && cu) it.maKh = cu.maKh;
    if (cu) {
      sua.push({row: cu.row, item: it});
      var gan = idsCuaItem_(it);
      for (k = 0; k < gan.length; k++) theoId[gan[k]] = cu;
      var khoaMoi = khoaGhep_(it);
      if (khoaMoi) theoGhep[khoaMoi] = cu;
    } else {
      them.push(it);
      var moiIds = idsCuaItem_(it);
      var ao = {row: 0, fileId: it.fileId, fileIdPhu: it.fileIdPhu, url: it.url, modifiedTime: it.modifiedTime, ghep: it.ghep, ten: it.ten, thuMuc: it.thuMuc, trangThai: it.trangThai};
      for (k = 0; k < moiIds.length; k++) theoId[moiIds[k]] = ao;
      var khoaThem = khoaGhep_(it);
      if (khoaThem) theoGhep[khoaThem] = ao;
    }
  }
  return {them: them, sua: sua};
}

function truyVanFileMoi_(folderId, mocIso) {
  var goc = "'" + idTrongQuery_(folderId) + "' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'";
  var moc = String(mocIso || '').replace(/'/g, '');
  if (!moc) return goc;
  return goc + " and (modifiedTime > '" + moc + "' or createdTime > '" + moc + "')";
}

function oChiTiet_(row, cot, khoa) {
  if (row && typeof row === 'object' && !Array.isArray(row)) {
    if (row[khoa] != null && row[khoa] !== '') return String(row[khoa]);
    return '';
  }
  var v = row && row.length > cot ? row[cot] : '';
  if (v == null || v === '') return '';
  return String(v);
}

function nguonGiaVonChiTiet_(row) {
  var nhapTay = oChiTiet_(row, 13, 'N');
  var tenGhep = oChiTiet_(row, 12, 'M');
  var maSp = oChiTiet_(row, 2, 'C');
  var chon = '';
  var khoa = '';
  if (nhapTay !== '') {
    chon = 'N';
    khoa = nhapTay;
  } else if (tenGhep !== '') {
    chon = 'M';
    khoa = tenGhep;
  } else if (maSp !== '') {
    chon = 'C';
    khoa = maSp;
  }
  return {
    thuTu: ['N', 'M', 'C'],
    chon: chon,
    khoa: khoa,
    cotGiaVon: 'D',
    tenCotGiaVon: 'Giá vốn BQ có VAT',
    donGiaLaGiaBan: true,
    khongGhiJ: true,
    khongGhiD: true
  };
}

function giaTriDocChoDMGiaVon_(headers, row) {
  var cot = tomTatDanhMuc_(headers);
  return {
    ma: cot.cotMa >= 0 && row ? row[cot.cotMa] : '',
    ten: cot.cotTen >= 0 && row ? row[cot.cotTen] : '',
    donGia: cot.cotDonGia >= 0 && row ? row[cot.cotDonGia] : '',
    ghiCot: 'C',
    khongGhiCotD: true
  };
}

function giaiThichGiaVon_() {
  return {
    donGia: 'Đơn Giá là giá bán, chỉ cấp Mã/Tên/Đơn giá cho DM_GiaVon!C.',
    giaVon: 'Giá vốn = DM_GiaVon!D «Giá vốn BQ có VAT», do script Cập nhật giá vốn cập nhật mỗi giờ.',
    thuTuJ: 'ChiTiet_LN!J tra theo cột N nhập tay, rồi cột M tên ghép, rồi mã SP cột C.',
    khongGhiD: true,
    khongGhiJ: true
  };
}

function quyTacGiaiDoanSau_() {
  return [
    'HĐ khác sản phẩm nhưng cùng tổng giá trị là hợp lệ, chỉ lệch giá trị mới báo.',
    'Nhóm Khách lẻ quen (mã KL) có theo dõi nợ.',
    'KH007 là khách vãng lai, không vào công nợ.'
  ];
}

var COT_DOI_SOAT = ['Mục', 'Nhóm', 'Đối tượng', 'Giá trị', 'Ghi chú'];

function lichDoiSoat_() {
  return {gio: 19, phut: 45, tz: 'Asia/Ho_Chi_Minh', ham: 'doiSoatCuoiNgay'};
}

function cotGhiDanhMuc_() {
  return {
    docBang: 'SpreadsheetApp',
    sheetId: CONFIG_MAC_DINH.GIA_VON_SHEET_ID,
    ghiCot: 'C',
    khongGhiCot: 'D',
    cotDGiuNguyen: true,
    khongDocExcel: true
  };
}

function ngayVnTuIso_(iso) {
  var d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return '';
  var local = new Date(d.getTime() + 7 * 3600000);
  return local.toISOString().slice(0, 10);
}

function homNayVn_(date) {
  var d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return ngayVnTuIso_(d.toISOString());
}

function laChungTuTrongNgay_(dong, homNay) {
  if (!dong || !homNay) return false;
  var tg = String(dong.thoiGian || '');
  if (tg.indexOf(homNay) === 0) return true;
  return ngayVnTuIso_(dong.modifiedTime) === homNay;
}

function trangThaiVaoSo_(trang) {
  if (trang === TRANG_THAI_CHO) return 'Chưa vào sổ';
  if (trang === TRANG_THAI_DA_CO) return 'Đã vào sổ';
  if (trang === TRANG_THAI_SUA) return 'Đã vào sổ, file bị sửa';
  return String(trang || '');
}

function soTuHienThi_(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  var s = String(v == null ? '' : v).replace(/[\s\u00a0\u202f]/g, '').replace(/[₫đ]/gi, '');
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d+(,\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

function cungSoTien_(a, b) {
  var x = soTuHienThi_(a);
  var y = soTuHienThi_(b);
  if (x == null || y == null) return false;
  return Math.abs(x - y) < 0.5;
}

function laKhongHienThiDashboard_(v) {
  if (typeof v === 'number' && isFinite(v)) return false;
  var tho = String(v == null ? '' : v).replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (tho === '' || tho === '-' || tho === '–' || tho === '—') return true;
  var gon = tho.replace(/\s+/g, '').toLowerCase();
  return gon === '0đ' || gon === '0₫';
}

function soODashboard_(v) {
  if (laKhongHienThiDashboard_(v)) return 0;
  return soTuHienThi_(v);
}

function chuSoDashboard_(raw) {
  if (laKhongHienThiDashboard_(raw)) return '0';
  return String(raw == null ? '' : raw);
}

function chuanLuoiDashboard_(grid) {
  var out = [];
  var r;
  for (r = 0; r < (grid || []).length; r++) out.push((grid[r] || []).slice());
  var i;
  for (i = 0; i < COT_TONG_DASHBOARD_.length; i++) {
    var c = COT_TONG_DASHBOARD_[i];
    var dongSo = c.dong + 1;
    if (dongSo >= out.length || !out[dongSo] || c.cot >= out[dongSo].length) continue;
    if (laKhongHienThiDashboard_(out[dongSo][c.cot])) out[dongSo][c.cot] = '0';
  }
  return out;
}

function oTrongLuoi_(grid, dong, cot) {
  if (!grid || dong < 0 || cot < 0 || dong >= grid.length) return '';
  var row = grid[dong] || [];
  if (cot >= row.length || row[cot] == null) return '';
  return row[cot];
}

var COT_TONG_DASHBOARD_ = [
  {ten: 'Tổng nợ', oNhan: 'E29', oSo: 'E30', dong: 28, cot: 4, khop: function (t) { return t.indexOf('tong') >= 0 && t.indexOf('no') >= 0 && t.indexOf('qua han') < 0; }},
  {ten: 'Quá hạn', oNhan: 'H29', oSo: 'H30', dong: 28, cot: 7, khop: function (t) { return t.indexOf('qua han') >= 0; }},
  {ten: 'Chờ xuất HĐ', oNhan: 'K29', oSo: 'K30', dong: 28, cot: 10, khop: function (t) { return t.indexOf('cho xuat') >= 0; }},
  {ten: 'Doanh thu', oNhan: 'B8', oSo: 'B9', dong: 7, cot: 1, khop: function (t) { return t.indexOf('doanh thu') >= 0; }}
];

function tongDashboard_(grid) {
  var out = [];
  var i;
  for (i = 0; i < COT_TONG_DASHBOARD_.length; i++) {
    var c = COT_TONG_DASHBOARD_[i];
    var nhan = oTrongLuoi_(grid, c.dong, c.cot);
    var so = oTrongLuoi_(grid, c.dong + 1, c.cot);
    if (!c.khop(chuanHoa_(nhan))) {
      out.push({
        muc: 'LỖI',
        nhom: 'Dashboard',
        doiTuong: c.ten,
        giaTri: '',
        ghiChu: 'Nhãn ' + c.oNhan + ' không khớp «' + c.ten + '». Ô đang ghi: ' + String(nhan) + '. Không lấy số ' + c.oSo + '.'
      });
      continue;
    }
    out.push({
      muc: 'TONG',
      nhom: 'Dashboard',
      doiTuong: c.ten,
      giaTri: chuSoDashboard_(so),
      ghiChu: c.oNhan + ' | ' + c.oSo
    });
  }
  return out;
}

function chuanTieuDe_(v) {
  return String(v == null ? '' : v).replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function timCotDungChuoi_(headers, ten) {
  var muc = chuanTieuDe_(ten);
  if (!muc) return -1;
  var i;
  for (i = 0; i < (headers || []).length; i++) {
    if (chuanTieuDe_(headers[i]) === muc) return i;
  }
  return -1;
}

var TIEU_DE_VIEW_NO_ = ['Mã KH', 'Khách hàng', 'Còn nợ', 'Ngày đến hạn', 'Số ngày quá hạn'];

function dongTieuDeNo_(grid) {
  var r;
  var c;
  var k;
  var best = -1;
  var bestDiem = 0;
  for (r = 0; r < Math.min((grid || []).length, 8); r++) {
    var diem = 0;
    for (c = 0; c < (grid[r] || []).length; c++) {
      var chu = chuanTieuDe_(grid[r][c]);
      for (k = 0; k < TIEU_DE_VIEW_NO_.length; k++) {
        if (chu === chuanTieuDe_(TIEU_DE_VIEW_NO_[k])) diem++;
      }
    }
    if (diem > bestDiem) {
      bestDiem = diem;
      best = r;
    }
  }
  return bestDiem >= 2 ? best : -1;
}

function docViewNo_(nhom, grid, loai, gioiHan) {
  var out = [];
  if (!grid || !grid.length) {
    out.push({muc: 'KHONG_CO', nhom: nhom, doiTuong: '', giaTri: '', ghiChu: 'Không có sheet hoặc không có dòng'});
    return {dong: out, tong: null};
  }
  var hr = dongTieuDeNo_(grid);
  if (hr < 0) {
    out.push({muc: 'LỖI', nhom: nhom, doiTuong: 'Tiêu đề', giaTri: '', ghiChu: 'Không thấy tên cột. Không đọc cột F hay Loại CT.'});
    return {dong: out, tong: null};
  }
  var headers = grid[hr];
  var cotMa = timCotDungChuoi_(headers, 'Mã KH');
  var cotKhach = timCotDungChuoi_(headers, 'Khách hàng');
  var cotTien = timCotDungChuoi_(headers, 'Còn nợ');
  var cotDen = timCotDungChuoi_(headers, 'Ngày đến hạn');
  var cotQua = timCotDungChuoi_(headers, 'Số ngày quá hạn');
  var thieu = [];
  if (cotMa < 0) thieu.push('Mã KH');
  if (cotKhach < 0) thieu.push('Khách hàng');
  if (cotTien < 0) thieu.push('Còn nợ');
  if (loai === 'conNo') {
    if (cotDen < 0) thieu.push('Ngày đến hạn');
    if (cotQua < 0) thieu.push('Số ngày quá hạn');
  }
  if (thieu.length) {
    out.push({muc: 'LỖI', nhom: nhom, doiTuong: 'Tiêu đề', giaTri: '', ghiChu: 'Thiếu cột: ' + thieu.join(', ') + '. Không đọc cột F hay Loại CT.'});
    return {dong: out, tong: null};
  }
  var theoMa = {};
  var thuTu = [];
  var r;
  for (r = hr + 1; r < grid.length; r++) {
    var row = grid[r] || [];
    var ma = String(row[cotMa] == null ? '' : row[cotMa]).trim();
    var ten = String(row[cotKhach] == null ? '' : row[cotKhach]).trim();
    if (!ma && !ten && (row[cotTien] == null || row[cotTien] === '')) continue;
    var tien = soTuHienThi_(row[cotTien]);
    if (tien == null) {
      out.push({muc: 'LỖI', nhom: nhom, doiTuong: ma || ten, giaTri: '', ghiChu: 'Ô Còn nợ không phải số: ' + String(row[cotTien] == null ? '' : row[cotTien])});
      continue;
    }
    if (!theoMa[ma]) {
      theoMa[ma] = {ma: ma, ten: ten, tien: 0, den: [], qua: 0};
      thuTu.push(ma);
    }
    if (ten && !theoMa[ma].ten) theoMa[ma].ten = ten;
    theoMa[ma].tien += tien;
    if (cotDen >= 0) {
      var denChuoi = String(row[cotDen] == null ? '' : row[cotDen]).trim();
      if (denChuoi && theoMa[ma].den.indexOf(denChuoi) < 0 && theoMa[ma].den.length < 5) theoMa[ma].den.push(denChuoi);
    }
    if (cotQua >= 0) {
      var qua = soTuHienThi_(row[cotQua]);
      if (qua != null) theoMa[ma].qua += qua;
    }
  }
  var tong = 0;
  var i;
  for (i = 0; i < thuTu.length; i++) tong += theoMa[thuTu[i]].tien;
  var gioi = gioiHan || 40;
  for (i = 0; i < thuTu.length; i++) {
    if (i === gioi) {
      out.push({muc: 'CAT', nhom: nhom, doiTuong: '', giaTri: '', ghiChu: 'Còn mã KH chưa đưa vào báo cáo'});
      break;
    }
    var g = theoMa[thuTu[i]];
    var chu = '';
    if (loai === 'conNo') chu = 'Ngày đến hạn: ' + g.den.join(', ') + '. Số ngày quá hạn: ' + g.qua + '.';
    else if (loai === 'quaHan' && cotQua >= 0) chu = 'Số ngày quá hạn: ' + g.qua + '.';
    out.push({
      muc: 'DONG',
      nhom: nhom,
      doiTuong: (g.ma || '(trống)') + (g.ten ? ' | ' + g.ten : ''),
      giaTri: String(g.tien),
      ghiChu: chu
    });
  }
  if (!thuTu.length && !out.length) {
    out.push({muc: 'KHONG_CO', nhom: nhom, doiTuong: '', giaTri: '', ghiChu: 'Không có dòng dữ liệu'});
  }
  return {dong: out, tong: tong};
}

function doiChieuTong_(tong, dongDash, nhom, ten, oSo) {
  var nhan = oSo === 'H30' ? 'H29' : (oSo === 'K30' ? 'K29' : 'E29');
  if (tong == null) {
    return {muc: 'LỖI', nhom: nhom, doiTuong: ten, giaTri: '', ghiChu: 'Không cộng được vì thiếu cột.'};
  }
  if (!dongDash || dongDash.muc !== 'TONG') {
    return {muc: 'LỖI', nhom: nhom, doiTuong: ten, giaTri: String(tong), ghiChu: 'Không đối chiếu Dashboard!' + oSo + ' vì nhãn ' + nhan + ' không khớp.'};
  }
  var soDash = soODashboard_(dongDash.giaTri);
  if (soDash != null && cungSoTien_(tong, soDash)) {
    return {muc: 'TONG', nhom: nhom, doiTuong: ten, giaTri: String(tong), ghiChu: 'Khớp Dashboard!' + oSo};
  }
  return {
    muc: 'LỖI',
    nhom: nhom,
    doiTuong: ten,
    giaTri: String(tong),
    ghiChu: 'Lệch Dashboard!' + oSo + '. Tổng mã KH = ' + tong + '. ' + oSo + ' = ' + dongDash.giaTri + '.'
  };
}

function doiChieuConNo_(tong, dongTongNo) {
  return doiChieuTong_(tong, dongTongNo, 'Nợ theo khách', 'Tổng còn nợ', 'E30');
}

function lapBaoCaoDoiSoat_(inp) {
  inp = inp || {};
  var homNay = String(inp.homNay || '');
  var rows = [];
  var hang = inp.hangDoi || [];
  var moi = 0;
  var chua = 0;
  var da = 0;
  var i;
  for (i = 0; i < hang.length; i++) {
    var dong = hang[i];
    if (!laChungTuTrongNgay_(dong, homNay)) continue;
    var vao = trangThaiVaoSo_(dong.trangThai);
    moi++;
    if (dong.trangThai === TRANG_THAI_CHO) chua++;
    else da++;
    rows.push({
      muc: 'CHUNG_TU',
      nhom: 'Trong ngày',
      doiTuong: (dong.ten || '') + (dong.khach ? ' | ' + dong.khach : ''),
      giaTri: dong.loai || '',
      ghiChu: vao + (dong.thoiGian ? ' | ' + dong.thoiGian : '')
    });
  }
  rows.unshift({
    muc: 'CHUNG_TU_DEM',
    nhom: 'Trong ngày',
    doiTuong: homNay,
    giaTri: String(moi),
    ghiChu: 'Chưa vào sổ: ' + chua + '. Đã vào sổ: ' + da + '.'
  });
  var no = docViewNo_('Nợ theo khách', inp.vConNo, 'conNo', 40);
  var han = docViewNo_('Nợ quá hạn', inp.vQuaHan, 'quaHan', 40);
  var cho = docViewNo_('Chờ xuất HĐ', inp.vChoXuatHd, 'choXuat', 40);
  var tong = tongDashboard_(inp.dashboard);
  var dongTongNo = null;
  var dongQuaHan = null;
  var dongChoXuat = null;
  var j;
  for (j = 0; j < tong.length; j++) {
    if (tong[j].doiTuong === 'Tổng nợ') dongTongNo = tong[j];
    if (tong[j].doiTuong === 'Quá hạn') dongQuaHan = tong[j];
    if (tong[j].doiTuong === 'Chờ xuất HĐ') dongChoXuat = tong[j];
  }
  for (j = 0; j < no.dong.length; j++) rows.push(no.dong[j]);
  rows.push(doiChieuConNo_(no.tong, dongTongNo));
  for (j = 0; j < han.dong.length; j++) rows.push(han.dong[j]);
  rows.push(doiChieuTong_(han.tong, dongQuaHan, 'Nợ quá hạn', 'Tổng quá hạn', 'H30'));
  for (j = 0; j < cho.dong.length; j++) rows.push(cho.dong[j]);
  rows.push(doiChieuTong_(cho.tong, dongChoXuat, 'Chờ xuất HĐ', 'Tổng chờ xuất', 'K30'));
  for (j = 0; j < tong.length; j++) rows.push(tong[j]);
  rows.push({
    muc: 'SO_LOI',
    nhom: 'CN_SucKhoe',
    doiTuong: 'D1',
    giaTri: String(inp.soLoi == null ? 0 : inp.soLoi),
    ghiChu: 'Số lỗi trên CN_SucKhoe!D1'
  });
  return rows;
}

function deXuatHangChoFile_() {
  return {
    sheetCu: 'HangCho_File',
    sheetMoi: 'CN_HangDoi',
    trungViec: true,
    ghiSheetCu: false,
    gop: false,
    chep: false,
    xoa: false,
    songSong: false,
    deXuat: 'Giữ nguyên HangCho_File vùng A1:K100. Không gộp, không chép, không xóa. Gỡ 4 trigger capNhatTuDrive bằng tatTriggerV6Drive_. Không xoá code v6.'
  };
}

function tuChayMau_() {
  var fail = [];
  function kiem(ten, dieu, chiTiet) {
    if (!dieu) fail.push(ten + (chiTiet ? ' — ' + chiTiet : ''));
  }
  var cfg = hopNhatConfig_(null);
  kiem('id drive', cfg.DRIVE_FOLDER_ID === '1KAyFZVJJCqu92Swk5JgX15YY0fZDpdrl');
  kiem('id v7', cfg.V7_SPREADSHEET_ID === '1jkmfMIJsoZrDlOxmkqbj44GOsNb1eh3UNk3Tyn0MaJs');
  kiem('id gia', cfg.GIA_VON_SHEET_ID === '1Hwslun92TLrhXAMgiVDdd6wyvVXP6sqOQbuTKiLKRrM');
  kiem('gmail tat', cfg.GMAIL_BAT === false && nenQuetGmail_(cfg) === false);
  kiem('gmail bat', nenQuetGmail_(hopNhatConfig_({GMAIL_BAT: 'TRUE'})) === true);
  kiem('gmail chu FALSE', hopNhatConfig_({GMAIL_BAT: 'FALSE'}).GMAIL_BAT === false);
  kiem('gio 6:59', trongGioQuet_(6, 59, cfg) === false);
  kiem('gio 7:00', trongGioQuet_(7, 0, cfg) === true);
  kiem('gio 18:00', trongGioQuet_(18, 0, cfg) === true);
  kiem('gio 18:10', trongGioQuet_(18, 10, cfg) === true);
  kiem('gio 18:15', trongGioQuet_(18, 15, cfg) === false);
  kiem('gio 23', trongGioQuet_(23, 0, cfg) === false);

  var folders = {
    K: {name: '2. DANH SACH KHACH HANG', parents: ['R']},
    C: {name: '4. CTY MAU', parents: ['K']},
    T: {name: 'Tháng 10-2026', parents: ['C']},
    H: {name: '9. HOA DON', parents: ['R']},
    V: {name: '1. VAO', parents: ['H']},
    RA: {name: '2. RA', parents: ['H']},
    C2: {name: '3. CTY MAU', parents: ['RA']},
    BG: {name: '8. PHIẾU BÁO GIÁ', parents: ['R']},
    L: {name: 'LƯƠNG', parents: ['R']},
    STT: {name: 'STT2', parents: ['R']}
  };
  function lay(id) { return folders[id] ? {name: folders[id].name, parents: folders[id].parents} : null; }
  var cache = {};
  var pg = nhanDienTuCay_({
    id: 'f-pg',
    name: 'PHIEU GIAO VPP 07-10 (VAN PHAT-MAU).xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    modifiedTime: '2026-10-22T01:00:00.000Z',
    parents: ['T']
  }, 'R', cfg, cache, lay);
  kiem('pg loai', pg.loai === 'PG', pg.loai);
  kiem('pg khach', pg.khach === 'CTY MAU', pg.khach);
  kiem('pg vao', pg.duaVao === true);
  kiem('pg khong phai bg', pg.loai !== 'BG');

  var bg = nhanDienTuCay_({
    id: 'f-bg',
    name: 'PHIEU BAO GIA 02-10 (VAN PHAT-MAU).xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    modifiedTime: '2026-10-22T02:00:00.000Z',
    parents: ['C']
  }, 'R', cfg, cache, lay);
  kiem('bg loai', bg.loai === 'BG', bg.loai);
  kiem('bg khach', bg.khach === 'CTY MAU', bg.khach);

  var pdf = nhanDienTuCay_({
    id: 'f-pdf',
    name: 'scan-moc.pdf',
    mime: 'application/pdf',
    modifiedTime: '2026-10-22T03:00:00.000Z',
    parents: ['C']
  }, 'R', cfg, cache, lay);
  kiem('pdf khach vao', pdf.duaVao === true && pdf.khach === 'CTY MAU');

  var hd = nhanDienTuCay_({
    id: 'f-hd',
    name: '0001234.pdf',
    mime: 'application/pdf',
    modifiedTime: '2026-10-22T04:00:00.000Z',
    parents: ['C2']
  }, 'R', cfg, cache, lay);
  kiem('hd loai', hd.loai === 'HĐ?', hd.loai);
  var hdKy = nhanDienTuCay_({
    id: 'f-hdky',
    name: 'C26TNT_00000021.pdf',
    mime: 'application/pdf',
    modifiedTime: '2026-10-22T04:10:00.000Z',
    parents: ['C2']
  }, 'R', cfg, cache, lay);
  kiem('hd ky hieu', hdKy.loai === 'HĐ', hdKy.loai);
  var hdKy1 = nhanDienTuCay_({
    id: 'f-hdky1',
    name: '1C26TNT_00000021.pdf',
    mime: 'application/pdf',
    modifiedTime: '2026-10-22T04:12:00.000Z',
    parents: ['C2']
  }, 'R', cfg, cache, lay);
  kiem('hd ky hieu co 1', hdKy1.loai === 'HĐ', hdKy1.loai);
  kiem('regex config', cfg.KY_HIEU_HD === '1?C26TNT_\\d+' && mauKyHieuHd_(cfg.KY_HIEU_HD).test('C26TNT_00000021.pdf') === true);
  kiem('hd khach', hd.khach === 'CTY MAU', hd.khach);
  kiem('hd vao', hd.duaVao === true);

  var vao = nhanDienTuCay_({
    id: 'f-vao',
    name: 'HOA DON NCC.pdf',
    mime: 'application/pdf',
    modifiedTime: '2026-10-22T05:00:00.000Z',
    parents: ['V']
  }, 'R', cfg, cache, lay);
  kiem('vao bo', vao.boQua === true && vao.duaVao === false);

  var luong = nhanDienTuCay_({
    id: 'f-luong',
    name: 'bang luong.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    modifiedTime: '2026-10-22T06:00:00.000Z',
    parents: ['L']
  }, 'R', cfg, cache, lay);
  kiem('luong ngoai', luong.duaVao === false);

  var gia = nhanDienTuCay_({
    id: cfg.GIA_VON_SHEET_ID,
    name: 'PHIEU BAO GIA VAN PHAT - 2026',
    mime: 'application/vnd.google-apps.spreadsheet',
    modifiedTime: '2026-10-22T07:00:00.000Z',
    parents: ['BG']
  }, 'R', cfg, cache, lay);
  kiem('bo gia von', gia.duaVao === false);

  var so = nhanDienTuCay_({
    id: cfg.V7_SPREADSHEET_ID,
    name: 'PHIEU GIAO noi bo',
    mime: 'application/vnd.google-apps.spreadsheet',
    modifiedTime: '2026-10-22T08:00:00.000Z',
    parents: ['K']
  }, 'R', cfg, cache, lay);
  kiem('bo v7', so.duaVao === false);

  var stt = nhanDienTuCay_({
    id: 'f-stt',
    name: 'PHIEU GIAO alias.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    modifiedTime: '2026-10-22T09:00:00.000Z',
    parents: ['STT']
  }, 'R', cfg, cache, lay);
  kiem('stt2', stt.vung === 'KHACH' && stt.loai === 'PG' && stt.duaVao === true);
  kiem('di sau goc', nenDiSau_([], cfg) === true);
  kiem('di sau luong', nenDiSau_(['LƯƠNG'], cfg) === false);
  kiem('di sau vao', nenDiSau_(['9. HOA DON', '1. VAO'], cfg) === false);
  kiem('di sau ra', nenDiSau_(['9. HOA DON', '2. RA', '3. CTY MAU'], cfg) === true);
  kiem('di sau khach', nenDiSau_(['2. DANH SACH KHACH HANG', '4. CTY MAU', 'Tháng 10-2026'], cfg) === true);
  kiem('escape id', idTrongQuery_("a'b") === "a\\'b");

  var trung = locTrung_(
    [{fileId: 'f-pg', modifiedTime: '2026-10-22T01:00:00.000Z'}],
    [pg, {fileId: 'f-pg', modifiedTime: '2026-10-22T11:00:00.000Z', nguon: 'Drive'}]
  );
  kiem('dedup', trung.bo === 1 && trung.giu.length === 1 && trung.giu[0].modifiedTime === '2026-10-22T11:00:00.000Z');

  var dong = dongHangDoi_('2026-10-22 08:00:00', pg);
  kiem('dong dai', dong.length === COT_HANG_DOI.length, String(dong.length));
  kiem('trang thai', dong[5] === 'Chờ bot');
  kiem('ghep xlsx', dong[10] === 'chưa có PDF mộc đỏ');
  kiem('z1', demCanBot_(['Chờ bot', 'Đã có trong sổ', 'Sửa file đã ghi', 'Chờ bot']) === 3);
  kiem('pg ma', loaiTuChuoi_('PG26-029.xlsx') === 'PG' && loaiTuChuoi_('PG26-030.pdf') === 'PG');
  kiem('bg ma', loaiTuChuoi_('BG26-001.xlsx') === 'BG');
  kiem('dau ngay', dauNgayVnIso_('2026-10-22T16:12:00.000Z') === '2026-10-21T17:00:00.000Z');
  var mocDrive = mocQuetDrive_('2026-10-22T16:12:00.000Z', '2026-10-22T16:12:00.000Z');
  kiem('moc cung ngay', mocDrive.khoiTao === false && mocDrive.mocQuery === '2026-10-21T17:00:00.000Z' && '2026-10-22T04:33:35.835Z' > mocDrive.mocQuery);
  var mocDau = mocQuetDrive_('', '2026-10-22T16:12:00.000Z');
  kiem('moc drive dau', mocDau.khoiTao === true && mocDau.mocQuery === '2026-10-21T17:00:00.000Z');
  var mocHomQua = mocQuetDrive_('2026-10-21T16:00:00.000Z', '2026-10-22T01:00:00.000Z');
  kiem('moc giu hom qua', mocHomQua.mocQuery === '2026-10-21T16:00:00.000Z');
  var tach = tachChuaCo_(
    [{fileId: 'a', modifiedTime: '1'}, {fileId: 'b', modifiedTime: '2'}],
    [{fileId: 'a', modifiedTime: '1'}]
  );
  kiem('tach chua', tach.chua.length === 1 && tach.chua[0].fileId === 'b' && tach.da.length === 1);

  var moc1 = quyetDinhMoc_('', '2026-10-22T08:00:00.000Z');
  kiem('moc dau', moc1.khoiTao === true && moc1.mocQuery === null);
  var moc2 = mocKeTiep_('2026-10-22T08:00:00.000Z', [{modifiedTime: '2026-10-22T07:00:00.000Z'}], true);
  kiem('moc cat', moc2 === '2026-10-22T07:00:00.000Z');
  kiem('moc het', mocKeTiep_('2026-10-22T08:00:00.000Z', [], false) === '2026-10-22T08:00:00.000Z');

  kiem('loi ref', laLoiCongThuc_('#REF!') === true);
  kiem('loi na', laLoiCongThuc_('#N/A') === true);
  kiem('loi val', laLoiCongThuc_('#VALUE!') === true);
  kiem('loi div', laLoiCongThuc_('#DIV/0!') === true);
  kiem('loi name', laLoiCongThuc_('#NAME?') === true);
  kiem('loi err', laLoiCongThuc_('#ERROR!') === true);
  kiem('khong num', laLoiCongThuc_('#NUM!') === false);
  kiem('khong chu', laLoiCongThuc_('Mã PG') === false);

  kiem('header khoa', headerPhieuGiaoHopLe_('Mã PG (khóa)', cfg.HEADER_PHIEU_GIAO) === true);
  kiem('header pg', headerPhieuGiaoHopLe_('Mã PG', cfg.HEADER_PHIEU_GIAO) === true);
  kiem('header phieu', headerPhieuGiaoHopLe_('Mã phiếu giao', cfg.HEADER_PHIEU_GIAO) === true);
  kiem('header ref', headerPhieuGiaoHopLe_('#REF!', cfg.HEADER_PHIEU_GIAO) === false);
  kiem('header khac', headerPhieuGiaoHopLe_('Mã KH', cfg.HEADER_PHIEU_GIAO) === false);

  var hhD = [['Key'], ['A'], ['B'], ['C']];
  var hhN = [['Key'], ['A'], ['C']];
  function baoInpHh(daKhoiTao, moc, bay) {
    var inpHh = {
      phieuGiaoA1: 'Mã PG',
      bayGio: bay || '2026-10-22T08:00:00.000Z',
      hhThieu: {daKhoiTao: daKhoiTao, moc: moc || {}},
      sheets: {HH_Data: hhD, HH_Nhap: hhN}
    };
    var rowsHh = lapBaoCaoSucKhoe_(inpHh);
    var mucLoi = '';
    var mucCanh = '';
    var h;
    for (h = 0; h < rowsHh.length; h++) {
      if (rowsHh[h].ma !== 'HH_THIEU_KEY') continue;
      if (rowsHh[h].muc === 'LỖI') mucLoi = 'LỖI';
      if (rowsHh[h].muc === 'CẢNH BÁO') mucCanh = 'CẢNH BÁO';
    }
    return {mucLoi: mucLoi, mucCanh: mucCanh, canhBao: mucCanh ? 1 : 0, sau: inpHh.hhThieuSau};
  }
  var thieu = khoaThieu_(hhD, hhN);
  kiem('hh thieu', thieu.length === 1 && thieu[0] === 'B', thieu.join(','));

  var adGrid = [];
  adGrid[0] = [];
  adGrid[1] = [];
  adGrid[1][29] = 'Đạt';
  adGrid[2] = [];
  adGrid[2][29] = '#N/A';
  var ad = quetAdKhach_(adGrid);
  kiem('ad dat', ad.dat === 1 && ad.thangSo === 1);

  var bao = lapBaoCaoSucKhoe_({
    phieuGiaoA1: 'Mã PG',
    headerChapNhan: cfg.HEADER_PHIEU_GIAO,
    coLog: true,
    logHeader: 'Thời gian',
    logTail: [['2026-10-21T00:00:00.000Z', '1', 'Giá vốn']],
    logLucCuoi: '2026-10-21T00:00:00.000Z',
    bayGio: '2026-10-22T08:00:00.000Z',
    staleGio: 26,
    sheets: {
      PhieuGiao: [['Mã PG', 'Mã KH'], ['PG1', '#REF!']],
      HoaDon: [['Số HĐ']],
      ChiTiet_LN: [['Mã PG']],
      BaoGia: [['Mã BG']],
      HH_Data: hhD,
      HH_Nhap: hhN,
      Log_CapNhat: [['Thời gian', 'Đợt', 'Loại'], ['2026-10-21T00:00:00.000Z', '1', 'Giá vốn']],
      DM_KhachHang: adGrid,
      LoiNhuan_Data: [[]],
      LoiNhuan: [[]],
      Bill_KiotViet: [['Mã HĐ']],
      Dashboard: [['']]
    }
  });
  function timMa(ma, muc) {
    var i;
    for (i = 0; i < bao.length; i++) if (bao[i].ma === ma && (!muc || bao[i].muc === muc)) return bao[i];
    return null;
  }
  kiem('bao header', timMa('HEADER_PHIEU_GIAO', 'OK'));
  kiem('bao hh', timMa('HH_THIEU_KEY', 'LỖI'));
  kiem('hh lan dau loi', baoInpHh(false, {}).mucLoi === 'LỖI' && baoInpHh(false, {}).canhBao === 0);
  var moi = baoInpHh(true, {});
  kiem('hh an han', moi.mucCanh === 'CẢNH BÁO' && moi.mucLoi === '' && moi.sau.daKhoiTao === true);
  var sauMotGio = baoInpHh(true, moi.sau.moc, '2026-10-22T09:01:00.000Z');
  kiem('hh qua 60', sauMotGio.mucLoi === 'LỖI' && sauMotGio.mucCanh === '');
  kiem('d1 khong dem canh bao', demMuc_([{muc: 'CẢNH BÁO'}, {muc: 'LỖI'}, {muc: 'OK'}], 'LỖI') === 1);
  kiem('bao log', timMa('LOG_CAP_NHAT', 'CẢNH BÁO'));
  kiem('bao loi', timMa('LOI_CONG_THUC', 'LỖI'));
  kiem('bao ad dat', timMa('DM_AD_DAT', 'THÔNG TIN'));
  kiem('bao ad loi', timMa('DM_AD_LOI', 'LỖI'));
  kiem('khong ghi ad trong bao', JSON.stringify(bao).indexOf('setValue') < 0);

  var q = truyVanGmail_(cfg.GMAIL_FROM, 1700000000);
  kiem('gmail from', q.indexOf('from:congtytnhhvanphat999@gmail.com') >= 0);
  kiem('gmail after', q.indexOf('after:1700000000') >= 0);
  kiem('gmail khong to ncc', q.indexOf('to:') < 0);
  kiem('thu cong ty', thuGuiTu_('Van Phat <congtytnhhvanphat999@gmail.com>', cfg.GMAIL_FROM) === true);
  kiem('thu ncc', thuGuiTu_('NCC <ncc@supplier.example>', cfg.GMAIL_FROM) === false);
  kiem('loai gmail', loaiGmail_('hoa-don-dien-tu.pdf') === 'HĐ?', loaiGmail_('hoa-don-dien-tu.pdf'));
  kiem('loai gmail ky', loaiGmail_('C26TNT_00000021.pdf') === 'HĐ');
  kiem('loai gmail pg', loaiGmail_('phieu giao.pdf') === 'PG');

  var sheetsCam = ['PhieuGiao', 'HoaDon', 'ChiTiet_LN', 'DM_KhachHang', 'BaoGia', 'HH_Data', 'Log_CapNhat'];
  var s;
  for (s = 0; s < sheetsCam.length; s++) {
    var nem = false;
    try {
      assertGhiChoPhep_(sheetsCam[s], {row: 2, column: 1, numRows: 1, numColumns: 1});
    } catch (e1) {
      nem = true;
    }
    kiem('cam ' + sheetsCam[s], nem === true);
  }
  var nemAd = '';
  try {
    assertGhiChoPhep_('DM_KhachHang', {row: 2, column: 30, numRows: 500, numColumns: 1});
  } catch (e2) {
    nemAd = String(e2.message || e2);
  }
  kiem('cam AD', nemAd.indexOf('AD2:AD501') >= 0, nemAd);
  var nemCa = '';
  try {
    assertGhiChoPhep_('DM_KhachHang', {row: 1, column: 1, numRows: 501, numColumns: 30});
  } catch (e3) {
    nemCa = String(e3.message || e3);
  }
  kiem('cam ca vung AD', nemCa.indexOf('AD2:AD501') >= 0, nemCa);
  var choPhep = true;
  try {
    assertGhiChoPhep_('CN_HangDoi', {row: 2, column: 1, numRows: 1, numColumns: 10});
    assertGhiChoPhep_('CN_SucKhoe', {row: 3, column: 1, numRows: 1, numColumns: 5});
    assertGhiChoPhep_('CN_SucKhoe', {row: 1, column: 4, numRows: 1, numColumns: 1});
    assertGhiChoPhep_('CONFIG', {row: 2, column: 1, numRows: 1, numColumns: 3});
    assertGhiChoPhep_('CN_DoiSoat', {row: 3, column: 1, numRows: 1, numColumns: 5});
  } catch (e4) {
    choPhep = false;
  }
  kiem('ghi duoc 4 sheet', choPhep === true);

  var headerDm = ['Nhóm Hàng', 'Mã SP', 'Tên Sản Phẩm', 'ĐVT', 'Đơn Giá'];
  var cot = tomTatDanhMuc_(headerDm);
  kiem('cot ma', cot.cotMa === 1);
  kiem('cot gia ban', cot.cotDonGia === 4);
  kiem('khong co cot gia von', cot.cotGiaVon === -1);
  var capC = giaTriDocChoDMGiaVon_(headerDm, ['Giấy', 'VP01', 'Bút bi', 'Cây', 12000]);
  kiem('cap cot C', capC.ghiCot === 'C' && capC.khongGhiCotD === true && capC.ma === 'VP01' && capC.donGia === 12000);
  var giaN = nguonGiaVonChiTiet_({N: 15000, M: 'But bi', C: 'SP01'});
  var giaM = nguonGiaVonChiTiet_({N: '', M: 'But bi', C: 'SP01'});
  var giaC = nguonGiaVonChiTiet_({N: '', M: '', C: 'SP01'});
  kiem('gia von N', giaN.chon === 'N' && giaN.cotGiaVon === 'D' && giaN.donGiaLaGiaBan === true && giaN.khongGhiJ && giaN.khongGhiD);
  kiem('gia von M', giaM.chon === 'M');
  kiem('gia von C', giaC.chon === 'C');
  kiem('gia von ten', giaiThichGiaVon_().giaVon.indexOf('Giá vốn BQ có VAT') >= 0);

  var tenLoai = [
    ['PHIEU GIAO backup.xlsx', 'backup'],
    ['PHIEU GIAO (Bản sao).xlsx', 'ban sao'],
    ['Copy of PHIEU GIAO.xlsx', 'copy of'],
    ['PHIEU GIAO (v6).xlsx', 'v6'],
    ['PHIEU GIAO_old.xlsx', 'old']
  ];
  var t;
  for (t = 0; t < tenLoai.length; t++) {
    var boTen = nhanDienTuCay_({
      id: 'f-bo-' + t,
      name: tenLoai[t][0],
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      modifiedTime: '2026-10-22T10:00:00.000Z',
      parents: ['T']
    }, 'R', cfg, cache, lay);
    kiem('loai tru ' + tenLoai[t][1], boTen.duaVao === false, boTen.ten);
  }
  var idBo = ['1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR', '1W3h5ZMzZYReAyZT2Jp39tg-O4U8dZs81'];
  for (t = 0; t < idBo.length; t++) {
    var boId = nhanDienTuCay_({
      id: idBo[t],
      name: 'PHIEU GIAO noi bo.xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      modifiedTime: '2026-10-22T10:00:00.000Z',
      parents: ['T']
    }, 'R', cfg, cache, lay);
    kiem('loai tru id ' + t, boId.duaVao === false);
  }

  var qMoi = truyVanFileMoi_('folderA', '2026-10-22T00:00:00.000Z');
  kiem('query or', qMoi.indexOf("modifiedTime > '2026-10-22T00:00:00.000Z'") >= 0 && qMoi.indexOf("createdTime > '2026-10-22T00:00:00.000Z'") >= 0 && qMoi.indexOf(' or ') >= 0);
  kiem('moc luc created', mocLuc_({modifiedTime: '2026-10-01T00:00:00.000Z', createdTime: '2026-10-02T00:00:00.000Z'}) === '2026-10-02T00:00:00.000Z');
  var cat = catLuotQuet_([
    {modifiedTime: '2026-10-03T00:00:00.000Z', createdTime: '2026-10-03T00:00:00.000Z', fileId: 'c'},
    {modifiedTime: '2026-10-01T00:00:00.000Z', createdTime: '2026-10-01T00:00:00.000Z', fileId: 'a'},
    {modifiedTime: '2026-10-02T00:00:00.000Z', createdTime: '2026-10-02T00:00:00.000Z', fileId: 'b'}
  ], 2);
  kiem('cat 400', cat.biCat === true && cat.giu.length === 2 && cat.giu[0].fileId === 'a' && cat.giu[1].fileId === 'b' && cat.tong === 3);
  var mocCat = mocKeTiep_('2026-10-22T08:00:00.000Z', cat.daXet, cat.biCat);
  kiem('moc ke', mocCat === '2026-10-02T00:00:00.000Z');
  var loiCat = dongLoiCatQuet_(2, 3, mocCat);
  kiem('loi cat', loiCat.muc === 'LỖI' && loiCat.ma === 'QUET_CAT');

  var soMau = chiMucSo_({
    BaoGia: [
      ['A', 'B', 'C', 'Số phiếu', 'E', 'F', 'G', 'H', 'URL'],
      ['', '', '', 'BG-2210', '', '', '', '', 'https://drive.google.com/file/d/abcFILE123/view']
    ],
    PhieuGiao: [
      ['A', 'B', 'C', 'Số phiếu', 'E', 'F', 'G', 'H', 'I', 'J', 'URL'],
      ['', '', '', 'PG0710', '', '', '', '', '', '', 'https://drive.google.com/file/d/pgFILE999/view'],
      ['', '', '', '10', '', '', '', '', '', '', '']
    ],
    HoaDon: [
      ['Số HĐ', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'Link'],
      ['1C26TNT00099', '', '', '', '', '', '', '', '', '', 'https://drive.google.com/file/d/hdFILE777/view']
    ]
  });
  var khopId = fileDaCoTrongSo_({fileId: 'abcFILE123', ten: 'khac.xlsx', url: 'https://drive.google.com/file/d/abcFILE123/view'}, soMau);
  kiem('so theo id', khopId && khopId.cach === 'fileId' && khopId.sheet === 'BaoGia');
  var khopSo = fileDaCoTrongSo_({fileId: 'moi', ten: 'PHIEU GIAO PG0710.xlsx'}, soMau);
  kiem('so theo so', khopSo && khopSo.cach === 'so' && khopSo.sheet === 'PhieuGiao');
  var khopHd = fileDaCoTrongSo_({fileId: 'hdFILE777', ten: '1C26TNT00099.pdf', url: 'https://drive.google.com/file/d/hdFILE777/view'}, soMau);
  kiem('so hoa don', khopHd && khopHd.sheet === 'HoaDon');
  var khopNgan = fileDaCoTrongSo_({fileId: 'moi10', ten: 'phieu 10.xlsx'}, soMau);
  kiem('so ngan', khopNgan === null);
  var soHdNgan = chiMucSo_({
    HoaDon: [
      ['Số HĐ', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'Link'],
      ['21', '', '', '', '', '', '', '', '', '', ''],
      ['00000022', '', '', '', '', '', '', '', '', '', '']
    ]
  });
  kiem('chi muc 21', soHdNgan.soHd['21'] && soHdNgan.soHd['21'].so === '21' && soHdNgan.soHd['22'].so === '22');
  var coKhoa21 = false;
  var ix;
  for (ix = 0; ix < soHdNgan.dsSo.length; ix++) if (soHdNgan.dsSo[ix].key === '21') coKhoa21 = true;
  kiem('so 2 ky tu khong vao ds dai', coKhoa21 === false);
  var khop21 = fileDaCoTrongSo_({fileId: 'moi21', ten: 'C26TNT_00000021.pdf'}, soHdNgan, cfg);
  kiem('hd so 21', khop21 && khop21.cach === 'soHd' && khop21.so === '21' && khop21.sheet === 'HoaDon');
  var khop21a = fileDaCoTrongSo_({fileId: 'moi21a', ten: '1C26TNT_00000021.pdf'}, soHdNgan, cfg);
  kiem('hd so co 1', khop21a && khop21a.so === '21');
  var khop22 = fileDaCoTrongSo_({fileId: 'moi22', ten: 'C26TNT_00000022.pdf'}, soHdNgan, cfg);
  kiem('hd so 22', khop22 && khop22.so === '22');
  var khong21 = fileDaCoTrongSo_({fileId: 'khac21', ten: 'phieu 21.xlsx'}, soHdNgan, cfg);
  kiem('hd khong nham 21', khong21 === null);
  var dotHd = xuLyDotQuet_([], [{
    nguon: 'Drive', fileId: 'hd21', ten: 'C26TNT_00000021.pdf', mime: 'application/pdf',
    thuMuc: '9. HOA DON / 2. RA / 3. CTY MAU', url: 'https://drive.google.com/file/d/hd21/view',
    modifiedTime: '2026-10-22T04:00:00.000Z', loai: 'HĐ'
  }], soHdNgan, cfg);
  kiem('hd da co theo so', dotHd.them.length === 1 && dotHd.them[0].trangThai === 'Đã có trong sổ');

  var thu = '2. DANH SACH KHACH HANG / 4. CTY MAU';
  var xlsx = {
    nguon: 'Drive', fileId: 'x1', ten: 'PHIEU GIAO PG0710.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    thuMuc: thu, url: 'https://drive.google.com/file/d/x1/view',
    modifiedTime: '2026-10-22T01:00:00.000Z', createdTime: '2026-10-22T01:00:00.000Z',
    loai: 'PG', khach: 'CTY MAU'
  };
  var pdfMoi = {
    nguon: 'Drive', fileId: 'p1', ten: 'PHIEU GIAO PG0710.pdf', mime: 'application/pdf',
    thuMuc: thu, url: 'https://drive.google.com/file/d/p1/view',
    modifiedTime: '2026-10-22T03:00:00.000Z', createdTime: '2026-10-22T03:00:00.000Z',
    loai: 'PG', khach: 'CTY MAU'
  };
  var dotX = xuLyDotQuet_([], [xlsx], null);
  kiem('xlsx chua pdf', dotX.them.length === 1 && dotX.them[0].ghep === 'chưa có PDF mộc đỏ' && dotX.them[0].trangThai === 'Chờ bot');
  var dongX = [{
    row: 2, fileId: 'x1', ten: xlsx.ten, thuMuc: thu, url: xlsx.url,
    modifiedTime: xlsx.modifiedTime, ghep: 'chưa có PDF mộc đỏ', trangThai: 'Chờ bot', mime: xlsx.mime
  }];
  var dotP = xuLyDotQuet_(dongX, [pdfMoi], null);
  kiem('pdf sau', dotP.them.length === 0 && dotP.sua.length === 1 && dotP.sua[0].row === 2 && dotP.sua[0].item.ghep === 'đã ghép PDF mộc đỏ' && dotP.sua[0].item.fileId === 'x1' && dotP.sua[0].item.url.indexOf(' | ') >= 0);
  var dotCa = xuLyDotQuet_([], [xlsx, pdfMoi], null);
  kiem('ghep cung luot', dotCa.them.length === 1 && dotCa.sua.length === 0 && dotCa.them[0].ghep === 'đã ghép PDF mộc đỏ');
  var dotDa = xuLyDotQuet_([], [xlsx], soMau);
  kiem('da co so', dotDa.them.length === 1 && dotDa.them[0].trangThai === 'Đã có trong sổ');
  var dongDa = [{
    row: 5, fileId: 'x1', ten: xlsx.ten, thuMuc: thu, url: xlsx.url,
    modifiedTime: '2026-10-22T01:00:00.000Z', ghep: 'chưa có PDF mộc đỏ', trangThai: 'Đã có trong sổ', mime: xlsx.mime
  }];
  var xlsxSua = {
    nguon: 'Drive', fileId: 'x1', ten: xlsx.ten, mime: xlsx.mime, thuMuc: thu, url: xlsx.url,
    modifiedTime: '2026-10-23T01:00:00.000Z', createdTime: '2026-10-22T01:00:00.000Z', loai: 'PG', khach: 'CTY MAU'
  };
  var dotSua = xuLyDotQuet_(dongDa, [xlsxSua], soMau);
  kiem('sua file', dotSua.them.length === 0 && dotSua.sua.length === 1 && dotSua.sua[0].item.trangThai === 'Sửa file đã ghi');

  var dm = [
    ['Mã KH', 'Tên', 'Tên khác'],
    ['KL12', 'Cty Mau', ''],
    ['KH007', 'Khach le', 'Khách vãng lai'],
    ['KH020', 'Cong ty ABC', '']
  ];
  kiem('doan chuoi', doanKhach_(['2. DANH SACH KHACH HANG', '4. CTY MAU'], cfg) === 'CTY MAU');
  var maKl = doanKhach_(['2. DANH SACH KHACH HANG', '4. CTY MAU'], cfg, dm);
  kiem('ma kl', maKl.ma === 'KL12' && maKl.leQuen === true && maKl.vangLai === false);
  var maVang = doanKhach_(['2. DANH SACH KHACH HANG', 'Khách vãng lai'], cfg, dm);
  kiem('ma kh007', maVang.ma === 'KH007' && maVang.vangLai === true && maVang.leQuen === false);
  var quetDm = nhanDienTuCay_({
    id: 'f-dm',
    name: 'PHIEU GIAO dm.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    modifiedTime: '2026-10-22T12:00:00.000Z',
    parents: ['T']
  }, 'R', cfg, cache, lay, dm);
  kiem('quet truyen dm', quetDm.maKh === 'KL12' && quetDm.khach === 'CTY MAU' && quetDm.leQuen === true);
  var quy = quyTacGiaiDoanSau_().join(' ');
  kiem('quy sau', quy.indexOf('cùng tổng giá trị') >= 0 && quy.indexOf('Khách lẻ quen') >= 0 && quy.indexOf('KH007') >= 0);
  var deXuat = deXuatHangChoFile_();
  kiem('hang cho', deXuat.sheetCu === 'HangCho_File' && deXuat.ghiSheetCu === false && deXuat.gop === false && deXuat.chep === false && deXuat.xoa === false && deXuat.songSong === false && deXuat.deXuat.indexOf('Không gộp') >= 0 && deXuat.deXuat.indexOf('tatTriggerV6Drive_') >= 0);
  var nemHang = false;
  try {
    assertGhiChoPhep_('HangCho_File', {row: 2, column: 1, numRows: 1, numColumns: 1});
  } catch (eHang) {
    nemHang = true;
  }
  kiem('cam hang cho', nemHang === true);
  var lich = lichDoiSoat_();
  kiem('lich 1945', lich.gio === 19 && lich.phut === 45 && lich.ham === 'doiSoatCuoiNgay' && lich.tz === 'Asia/Ho_Chi_Minh');
  var cotGv = cotGhiDanhMuc_();
  kiem('gia von cot C', cotGv.ghiCot === 'C' && cotGv.khongGhiCot === 'D' && cotGv.cotDGiuNguyen === true && cotGv.docBang === 'SpreadsheetApp' && cotGv.khongDocExcel === true && cotGv.sheetId === '1Hwslun92TLrhXAMgiVDdd6wyvVXP6sqOQbuTKiLKRrM');
  kiem('ngay vn', ngayVnTuIso_('2026-10-21T17:30:00.000Z') === '2026-10-22');
  kiem('ngay vn truoc', ngayVnTuIso_('2026-10-21T16:30:00.000Z') === '2026-10-21');
  function luoiTrong_(n) {
    var a = [];
    var u;
    for (u = 0; u < n; u++) a.push([]);
    return a;
  }
  var dashV7 = luoiTrong_(30);
  dashV7[0][0] = 'Chờ xuất HĐ';
  dashV7[0][1] = 3;
  dashV7[7][1] = 'Doanh thu';
  dashV7[8][1] = '9.000.000';
  dashV7[28][4] = 'Tổng nợ';
  dashV7[28][7] = 'Quá hạn';
  dashV7[28][10] = 'Chờ xuất HĐ';
  dashV7[29][4] = '30.000.000';
  dashV7[29][7] = '8.000.000';
  dashV7[29][10] = '25.139.500';
  var headNo = [];
  headNo[2] = 'Mã KH';
  headNo[3] = 'Khách hàng';
  headNo[5] = 'Loại CT';
  headNo[7] = '  CÒN NỢ ';
  headNo[8] = 'Đến hạn';
  headNo[9] = 'Quá hạn';
  headNo[10] = 'Ngày  đến hạn';
  headNo[11] = 'SỐ NGÀY QUÁ HẠN';
  var dongNo1 = [];
  dongNo1[2] = 'KH01';
  dongNo1[3] = 'CTY A';
  dongNo1[5] = 3;
  dongNo1[7] = '20.000.000';
  dongNo1[8] = '1.000.000';
  dongNo1[9] = '500.000';
  dongNo1[10] = '22/10/2026';
  dongNo1[11] = 5;
  var dongNo2 = [];
  dongNo2[2] = 'KH01';
  dongNo2[3] = 'CTY A';
  dongNo2[5] = 'PG';
  dongNo2[7] = '5.000.000';
  dongNo2[8] = '999999';
  dongNo2[9] = '888888';
  dongNo2[10] = '01/11/2026';
  dongNo2[11] = 0;
  var dongNo3 = [];
  dongNo3[2] = 'KH02';
  dongNo3[3] = 'CTY B';
  dongNo3[5] = 9;
  dongNo3[7] = '5.000.000';
  dongNo3[8] = '0';
  dongNo3[9] = '0';
  dongNo3[10] = '15/11/2026';
  dongNo3[11] = 2;
  var headHan = [];
  headHan[2] = 'Mã KH';
  headHan[3] = 'Khách hàng';
  headHan[5] = 'Loại CT';
  headHan[7] = 'Còn nợ';
  headHan[9] = 'Số ngày quá hạn';
  headHan[10] = 'Quá hạn';
  var dongHan1 = [];
  dongHan1[2] = 'KH01';
  dongHan1[3] = 'CTY A';
  dongHan1[5] = 3;
  dongHan1[7] = '5.000.000';
  dongHan1[9] = 12;
  dongHan1[10] = 999999;
  var dongHan2 = [];
  dongHan2[2] = 'KH01';
  dongHan2[3] = 'CTY A';
  dongHan2[5] = 3;
  dongHan2[7] = '3.000.000';
  dongHan2[9] = 3;
  dongHan2[10] = 1;
  var headCho = [];
  headCho[2] = 'Mã KH';
  headCho[3] = 'Khách hàng';
  headCho[5] = 'Loại CT';
  headCho[6] = 'Số tiền';
  headCho[7] = 'Chờ xuất HĐ';
  headCho[8] = 'Còn nợ';
  var dongCho = [];
  dongCho[2] = 'KH01';
  dongCho[3] = 'CTY A';
  dongCho[5] = 3;
  dongCho[6] = 3;
  dongCho[7] = 9;
  dongCho[8] = '25.139.500';
  kiem('so 25139500', soTuHienThi_('25.139.500') === 25139500);
  kiem('tieu de dung chuoi', chuanTieuDe_('  Ngày   đến hạn ') === 'ngày đến hạn' && chuanTieuDe_('Đến hạn') !== chuanTieuDe_('Ngày đến hạn') && chuanTieuDe_('Ngay den han') !== chuanTieuDe_('Ngày đến hạn') && chuanTieuDe_('Khách') !== chuanTieuDe_('Khách hàng'));
  kiem('dem loi d1', demLoiMuc_([['OK'], ['LỖI'], ['CẢNH BÁO'], ['LỖI']]) === 2 && demLoiMuc_(['CẢNH BÁO', 'OK']) === 0);
  var bayCat = new Date('2026-10-22T16:00:00.000Z');
  var catGiu = giuDongCatLuot_([
    ['2026-10-22 10:00:00', 'QUET_CAT', 'LỖI', 'Drive', 'moi'],
    ['2026-10-15 23:00:00', 'QUET_CAT', 'LỖI', 'Drive', 'sat 7 ngay'],
    ['2026-10-15 22:59:59', 'QUET_CAT', 'LỖI', 'Drive', 'cu hon 7 ngay'],
    ['2026-10-22 10:00:00', 'HH_THIEU_KEY', 'LỖI', 'x', 'y'],
    ['khong-phai-ngay', 'QUET_CAT', 'LỖI', 'Drive', 'hong']
  ], bayCat);
  kiem('giu cat 7 ngay', catGiu.length === 2 && catGiu[0][4] === 'moi' && catGiu[1][4] === 'sat 7 ngay');
  kiem('giu cat thieu gio', giuDongCatLuot_([['t', 'QUET_CAT', 'LỖI', 'Drive', 'cắt']], null).length === 0);
  var catDate = giuDongCatLuot_([
    [new Date(bayCat.getTime() - 2 * 24 * 60 * 60 * 1000), 'QUET_CAT', 'LỖI', 'Drive', 'date trong'],
    [new Date(bayCat.getTime() - HAN_CAT_LUOT_MS_), 'QUET_CAT', 'LỖI', 'Drive', 'date sat'],
    [new Date(bayCat.getTime() - HAN_CAT_LUOT_MS_ - 1000), 'QUET_CAT', 'LỖI', 'Drive', 'date cu'],
    [new Date(NaN), 'QUET_CAT', 'LỖI', 'Drive', 'date hong']
  ], bayCat);
  kiem('giu cat kieu date', catDate.length === 2 && catDate[0][0] instanceof Date && catDate[0][4] === 'date trong' && catDate[1][4] === 'date sat');
  var doi = lapBaoCaoDoiSoat_({
    homNay: '2026-10-22',
    hangDoi: [
      {thoiGian: '2026-10-22 10:00:00', ten: 'A.xlsx', khach: 'CTY MAU', trangThai: 'Chờ bot', loai: 'PG', modifiedTime: '2026-10-22T03:00:00.000Z'},
      {thoiGian: '2026-10-21 10:00:00', ten: 'Cu.xlsx', trangThai: 'Đã có trong sổ', modifiedTime: '2026-10-21T03:00:00.000Z'},
      {thoiGian: '2026-10-22 11:00:00', ten: 'B.pdf', khach: 'CTY MAU', trangThai: 'Đã có trong sổ', loai: 'HĐ'},
      {thoiGian: '', ten: 'Dem.pdf', trangThai: 'Sửa file đã ghi', loai: 'HĐ', modifiedTime: '2026-10-21T17:30:00.000Z'}
    ],
    vConNo: [headNo, dongNo1, dongNo2, dongNo3],
    vQuaHan: [headHan, dongHan1, dongHan2],
    vChoXuatHd: [headCho, dongCho],
    dashboard: dashV7,
    soLoi: 2
  });
  var chuoiDoi = JSON.stringify(doi);
  function coMuc(muc, doiTuong) {
    var n;
    for (n = 0; n < doi.length; n++) {
      if (doi[n].muc === muc && (!doiTuong || String(doi[n].doiTuong).indexOf(doiTuong) >= 0 || String(doi[n].ghiChu).indexOf(doiTuong) >= 0)) return doi[n];
    }
    return null;
  }
  kiem('doi dem', coMuc('CHUNG_TU_DEM') && coMuc('CHUNG_TU_DEM').giaTri === '3');
  kiem('doi chua', coMuc('CHUNG_TU', 'A.xlsx') && coMuc('CHUNG_TU', 'A.xlsx').ghiChu.indexOf('Chưa vào sổ') >= 0);
  kiem('doi da', coMuc('CHUNG_TU', 'B.pdf') && coMuc('CHUNG_TU', 'B.pdf').ghiChu.indexOf('Đã vào sổ') >= 0);
  kiem('doi sua', coMuc('CHUNG_TU', 'Dem.pdf') && coMuc('CHUNG_TU', 'Dem.pdf').ghiChu.indexOf('file bị sửa') >= 0);
  kiem('doi cu', chuoiDoi.indexOf('Cu.xlsx') < 0);
  var dongNoKh = coMuc('DONG', 'KH01');
  kiem('doi no', dongNoKh && dongNoKh.giaTri === '25000000' && dongNoKh.ghiChu.indexOf('Loại CT') < 0 && dongNoKh.ghiChu.indexOf('Ngày đến hạn') >= 0 && dongNoKh.ghiChu.indexOf('22/10/2026') >= 0 && dongNoKh.ghiChu.indexOf('Số ngày quá hạn: 5') >= 0 && dongNoKh.giaTri !== '1500000' && dongNoKh.giaTri !== '888888');
  kiem('doi han', coMuc('DONG', 'Nợ quá hạn') === null && chuoiDoi.indexOf('Nợ quá hạn') >= 0 && coMuc('DONG', 'KH01 | CTY A') && String(coMuc('DONG', 'KH01 | CTY A').giaTri) !== '3');
  var dongQua = null;
  var dongChoHd = null;
  var ix;
  for (ix = 0; ix < doi.length; ix++) {
    if (doi[ix].muc === 'DONG' && doi[ix].nhom === 'Nợ quá hạn') dongQua = doi[ix];
    if (doi[ix].muc === 'DONG' && doi[ix].nhom === 'Chờ xuất HĐ') dongChoHd = doi[ix];
  }
  kiem('doi qua cot', dongQua && dongQua.giaTri === '8000000' && dongQua.giaTri !== '12' && dongQua.giaTri !== '15' && dongQua.giaTri !== '999999' && dongQua.ghiChu.indexOf('Số ngày quá hạn: 15') >= 0);
  kiem('doi cho cot', dongChoHd && dongChoHd.giaTri === '25139500' && dongChoHd.giaTri !== '3' && dongChoHd.giaTri !== '9' && String(dongChoHd.ghiChu).indexOf('Loại CT') < 0);
  kiem('doi e30', coMuc('TONG', 'Tổng nợ') && coMuc('TONG', 'Tổng nợ').giaTri === '30.000.000');
  var dongH30 = null;
  for (ix = 0; ix < doi.length; ix++) {
    if (doi[ix].muc === 'TONG' && doi[ix].nhom === 'Dashboard' && doi[ix].doiTuong === 'Quá hạn') dongH30 = doi[ix];
  }
  kiem('doi h30', dongH30 && dongH30.giaTri === '8.000.000');
  kiem('doi k30', coMuc('TONG', 'Chờ xuất HĐ') && coMuc('TONG', 'Chờ xuất HĐ').giaTri === '25.139.500');
  kiem('doi b9', coMuc('TONG', 'Doanh thu') && coMuc('TONG', 'Doanh thu').giaTri === '9.000.000');
  kiem('doi khop e30', coMuc('TONG', 'Tổng còn nợ') && coMuc('TONG', 'Tổng còn nợ').ghiChu.indexOf('Khớp Dashboard!E30') >= 0);
  kiem('doi khop h30', coMuc('TONG', 'Tổng quá hạn') && coMuc('TONG', 'Tổng quá hạn').giaTri === '8000000' && coMuc('TONG', 'Tổng quá hạn').ghiChu.indexOf('Khớp Dashboard!H30') >= 0);
  kiem('doi khop k30', coMuc('TONG', 'Tổng chờ xuất') && coMuc('TONG', 'Tổng chờ xuất').giaTri === '25139500' && coMuc('TONG', 'Tổng chờ xuất').ghiChu.indexOf('Khớp Dashboard!K30') >= 0);
  kiem('doi loi', coMuc('SO_LOI', 'D1') && coMuc('SO_LOI', 'D1').giaTri === '2');
  var dashLech = luoiTrong_(30);
  var p;
  for (p = 0; p < 30; p++) dashLech[p] = dashV7[p].slice();
  dashLech[29][4] = '1';
  var lech = tongDashboard_(dashLech);
  var doiLech = doiChieuConNo_(30000000, lech[0]);
  kiem('doi lech e30', doiLech.muc === 'LỖI' && doiLech.ghiChu.indexOf('Lệch Dashboard!E30') >= 0);
  var dashLechHK = luoiTrong_(30);
  for (p = 0; p < 30; p++) dashLechHK[p] = dashV7[p].slice();
  dashLechHK[29][7] = '1';
  dashLechHK[29][10] = '1';
  var doiLechHK = lapBaoCaoDoiSoat_({
    homNay: '2026-10-22',
    hangDoi: [],
    vConNo: [headNo, dongNo1, dongNo2, dongNo3],
    vQuaHan: [headHan, dongHan1, dongHan2],
    vChoXuatHd: [headCho, dongCho],
    dashboard: dashLechHK,
    soLoi: 0
  });
  function timLech(ds, cum) {
    var n;
    for (n = 0; n < ds.length; n++) {
      if (ds[n].muc === 'LỖI' && String(ds[n].ghiChu).indexOf(cum) >= 0) return ds[n];
    }
    return null;
  }
  kiem('lech h30', timLech(doiLechHK, 'Lệch Dashboard!H30') && timLech(doiLechHK, 'Lệch Dashboard!H30').giaTri === '8000000');
  kiem('lech k30', timLech(doiLechHK, 'Lệch Dashboard!K30') && timLech(doiLechHK, 'Lệch Dashboard!K30').giaTri === '25139500');
  var dashSai = luoiTrong_(30);
  dashSai[28][4] = 'Ghi chú';
  dashSai[29][4] = '30.000.000';
  var saiNhan = tongDashboard_(dashSai);
  kiem('nhan e29', saiNhan[0].muc === 'LỖI' && saiNhan[0].giaTri === '' && saiNhan[0].ghiChu.indexOf('E29') >= 0);
  var headNgan = [];
  headNgan[2] = 'Mã KH';
  headNgan[3] = 'Khách hàng';
  headNgan[7] = 'Còn nợ';
  headNgan[8] = 'Đến hạn';
  headNgan[9] = 'Quá hạn';
  headNgan[10] = 'Ngay den han';
  headNgan[11] = 'So ngay qua han';
  var dongNgan = [];
  dongNgan[2] = 'KH01';
  dongNgan[3] = 'CTY A';
  dongNgan[7] = '20.000.000';
  dongNgan[8] = '1.000.000';
  dongNgan[9] = '200000';
  dongNgan[10] = '22/10/2026';
  dongNgan[11] = 12;
  var saiNgan = docViewNo_('Nợ theo khách', [headNgan, dongNgan], 'conNo', 40);
  kiem('tieu de ngan', saiNgan.tong === null && saiNgan.dong[0].muc === 'LỖI' && saiNgan.dong[0].ghiChu.indexOf('Ngày đến hạn') >= 0 && saiNgan.dong[0].ghiChu.indexOf('Số ngày quá hạn') >= 0 && JSON.stringify(saiNgan).indexOf('20000000') < 0);
  var headTienSai = [];
  headTienSai[2] = 'Mã KH';
  headTienSai[3] = 'Khách hàng';
  headTienSai[6] = 'Số tiền';
  headTienSai[7] = 'Chờ xuất HĐ';
  var dongTienSai = [];
  dongTienSai[2] = 'KH01';
  dongTienSai[3] = 'CTY A';
  dongTienSai[6] = '25.139.500';
  dongTienSai[7] = 9;
  var saiCho = docViewNo_('Chờ xuất HĐ', [headTienSai, dongTienSai], 'choXuat', 40);
  kiem('cho khong so tien', saiCho.tong === null && saiCho.dong[0].muc === 'LỖI' && saiCho.dong[0].ghiChu.indexOf('Còn nợ') >= 0 && JSON.stringify(saiCho).indexOf('25139500') < 0);
  var headNgaySai = [];
  headNgaySai[2] = 'Mã KH';
  headNgaySai[3] = 'Khách hàng';
  headNgaySai[9] = 'Số ngày quá hạn';
  var dongNgaySai = [];
  dongNgaySai[2] = 'KH01';
  dongNgaySai[3] = 'CTY A';
  dongNgaySai[9] = 12;
  var saiHan = docViewNo_('Nợ quá hạn', [headNgaySai, dongNgaySai], 'quaHan', 40);
  kiem('qua han khong cong ngay', saiHan.tong === null && saiHan.dong[0].muc === 'LỖI' && saiHan.dong[0].ghiChu.indexOf('Còn nợ') >= 0);
  var headKhachNgan = [];
  headKhachNgan[2] = 'Mã KH';
  headKhachNgan[3] = 'Khách';
  headKhachNgan[7] = 'Còn nợ';
  headKhachNgan[10] = 'Ngày đến hạn';
  headKhachNgan[11] = 'Số ngày quá hạn';
  var dongKhachNgan = [];
  dongKhachNgan[2] = 'KH01';
  dongKhachNgan[3] = 'CTY A';
  dongKhachNgan[7] = '48.964.500';
  dongKhachNgan[10] = '22/10/2026';
  dongKhachNgan[11] = 0;
  var saiKhach = docViewNo_('Nợ theo khách', [headKhachNgan, dongKhachNgan], 'conNo', 40);
  kiem('khong nhan khach ngan', saiKhach.tong === null && saiKhach.dong[0].muc === 'LỖI' && saiKhach.dong[0].ghiChu.indexOf('Khách hàng') >= 0 && JSON.stringify(saiKhach).indexOf('48964500') < 0);

  var text = fail.length ? ('FAIL ' + fail.length + '\n' + fail.join('\n')) : ('OK ' + 'logic mẫu chạy hết, không lỗi');
  return {ok: fail.length === 0, fail: fail, text: text};
}
