/**
 * Vạn Phát — logic thuần cho sổ công nợ v7.
 * File này không gọi SpreadsheetApp, Drive, Gmail, UrlFetch hay LLM.
 * Mọi hàm ghi sheet nằm ở Ghi.gs và chỉ được ghi CN_HangDoi, CN_SucKhoe, CONFIG.
 */

var SHEET_DUOC_GHI = ['CN_HangDoi', 'CN_SucKhoe', 'CONFIG'];

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
var KY_HIEU_HD_MAC_DINH = '1C26TNT';

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
  KY_HIEU_HD: '1C26TNT',
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
  KY_HIEU_HD: 'Ký hiệu HĐ GTGT. Không có ký hiệu thì loại là HĐ?',
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

function coKyHieuHd_(s, kyHieu) {
  var ky = chuanHoa_(kyHieu || KY_HIEU_HD_MAC_DINH);
  if (!ky) return false;
  return chuanHoa_(s).indexOf(ky) >= 0;
}

function loaiTuChuoi_(s, kyHieu) {
  if (!s) return '';
  var t = chuanHoa_(s);
  if (/phieu bao gia|\bbao gia\b|\bbg\b/.test(t)) return 'BG';
  if (/phieu giao|\bpg\b/.test(t)) return 'PG';
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

function nhanDienFile_(file, cfg) {
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
    var doan = doanKhach_(pathNames, cfg);
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

function nhanDienTuCay_(file, rootId, cfg, cache, layThuMuc) {
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
  }, cfg);
}

function khoaTrung_(fileId, modifiedTime) {
  return String(fileId) + '\n' + String(modifiedTime);
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

function congThucDemChoBot_() {
  return '=COUNTIF(F:F,"' + TRANG_THAI_CHO + '")+COUNTIF(F:F,"' + TRANG_THAI_SUA + '")';
}

function congThucDemLoi_() {
  return '=COUNTIF(C3:C,"LỖI")';
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
    rows.push(dongBaoCao_(
      'HH_THIEU_KEY',
      thieu.length ? 'LỖI' : 'OK',
      'HH_Data/HH_Nhap',
      thieu.length ? ('Thiếu ' + thieu.length + ' khóa: ' + thieu.slice(0, 20).join(', ')) : 'Đủ khóa cột A'
    ));
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
      var key = chuanSo_(so);
      if (key.length >= 4) dsSo.push({key: key, sheet: ten, so: so});
    }
  }
  dsSo.sort(function(a, b) { return b.key.length - a.key.length; });
  return {ids: ids, dsSo: dsSo};
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

function fileDaCoTrongSo_(item, chiMuc) {
  if (!item || !chiMuc) return null;
  var ids = idsCuaItem_(item);
  var i;
  for (i = 0; i < ids.length; i++) {
    if (chiMuc.ids[ids[i]]) {
      return {cach: 'fileId', sheet: chiMuc.ids[ids[i]].sheet, so: chiMuc.ids[ids[i]].so || ''};
    }
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

function xuLyDotQuet_(dongCu, items, chiMuc) {
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
    var khop = fileDaCoTrongSo_(it, chiMuc);
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

function deXuatHangChoFile_() {
  return {
    sheetCu: 'HangCho_File',
    sheetMoi: 'CN_HangDoi',
    trungViec: true,
    ghiSheetCu: false,
    deXuat: 'HangCho_File trên v7 vùng A1:K100 (Thời, File, Tên, Loại, Mã KH, Thư mục, Ngày, URL, Trạng thái và hai cột cuối) trùng việc với CN_HangDoi. Script này không ghi HangCho_File. Gộp sau khi bot Công Nợ đọc một hàng đợi: copy một lần từ HangCho_File sang CN_HangDoi rồi ngưng sheet cũ, hoặc để bot chỉ đọc CN_HangDoi.'
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
    name: '1C26TNT-0001234.pdf',
    mime: 'application/pdf',
    modifiedTime: '2026-10-22T04:10:00.000Z',
    parents: ['C2']
  }, 'R', cfg, cache, lay);
  kiem('hd ky hieu', hdKy.loai === 'HĐ', hdKy.loai);
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
  kiem('z1', congThucDemChoBot_() === '=COUNTIF(F:F,"Chờ bot")+COUNTIF(F:F,"Sửa file đã ghi")');

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
  kiem('loai gmail ky', loaiGmail_('HD 1C26TNT.pdf') === 'HĐ');
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
    assertGhiChoPhep_('CONFIG', {row: 2, column: 1, numRows: 1, numColumns: 3});
  } catch (e4) {
    choPhep = false;
  }
  kiem('ghi duoc 3 sheet', choPhep === true);

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
  var quy = quyTacGiaiDoanSau_().join(' ');
  kiem('quy sau', quy.indexOf('cùng tổng giá trị') >= 0 && quy.indexOf('Khách lẻ quen') >= 0 && quy.indexOf('KH007') >= 0);
  var deXuat = deXuatHangChoFile_();
  kiem('hang cho', deXuat.sheetCu === 'HangCho_File' && deXuat.ghiSheetCu === false && deXuat.trungViec === true && deXuat.deXuat.indexOf('A1:K100') >= 0);
  var nemHang = false;
  try {
    assertGhiChoPhep_('HangCho_File', {row: 2, column: 1, numRows: 1, numColumns: 1});
  } catch (eHang) {
    nemHang = true;
  }
  kiem('cam hang cho', nemHang === true);

  var text = fail.length ? ('FAIL ' + fail.length + '\n' + fail.join('\n')) : ('OK ' + 'logic mẫu chạy hết, không lỗi');
  return {ok: fail.length === 0, fail: fail, text: text};
}
