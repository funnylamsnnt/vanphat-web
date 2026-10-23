/**
 * Chạy logic mẫu không cần Google.
 *   node apps-script/cong-no/test/chay_thu.js
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var logic = fs.readFileSync(path.join(root, 'Logic.gs'), 'utf8');
var context = {
  console: console,
  Date: Date,
  Number: Number,
  String: String,
  Object: Object,
  Array: Array,
  RegExp: RegExp,
  Error: Error,
  Math: Math,
  isFinite: isFinite,
  isNaN: isNaN,
  JSON: JSON
};
vm.createContext(context);
vm.runInContext(logic, context);
var kq = context.tuChayMau_();
console.log(kq.text);

function luoiDash_(e30, h30, k30, b9) {
  var g = [];
  var u;
  for (u = 0; u < 30; u++) g.push([]);
  g[7][1] = 'Doanh thu';
  g[8][1] = b9;
  g[28][4] = 'Tổng nợ';
  g[28][7] = 'Quá hạn';
  g[28][10] = 'Chờ xuất HĐ';
  g[29][4] = e30;
  g[29][7] = h30;
  g[29][10] = k30;
  return g;
}
function headTien_() {
  var h = [];
  h[2] = 'Mã KH';
  h[3] = 'Khách hàng';
  h[7] = 'Còn nợ';
  return h;
}
function headCon_() {
  var h = headTien_();
  h[10] = 'Ngày đến hạn';
  h[11] = 'Số ngày quá hạn';
  return h;
}
function timDong_(ds, muc, cum) {
  var n;
  for (n = 0; n < ds.length; n++) {
    if (ds[n].muc === muc && (String(ds[n].doiTuong).indexOf(cum) >= 0 || String(ds[n].ghiChu).indexOf(cum) >= 0)) return ds[n];
  }
  return null;
}
var loiSoKhong = [];
['-', '–', '—', '', '0đ', '0 đ', '0₫'].forEach(function (mau) {
  if (context.soODashboard_(mau) !== 0) loiSoKhong.push('soODashboard không ra 0 với «' + mau + '»');
  var bao = context.lapBaoCaoDoiSoat_({
    homNay: '2026-10-22',
    hangDoi: [],
    vConNo: [headCon_()],
    vQuaHan: [headTien_()],
    vChoXuatHd: [headTien_()],
    dashboard: luoiDash_(mau, mau, mau, mau),
    soLoi: 0
  });
  ['E30', 'H30', 'K30'].forEach(function (o) {
    var khop = timDong_(bao, 'TONG', 'Khớp Dashboard!' + o);
    if (!khop) loiSoKhong.push('không khớp ' + o + ' khi ô là «' + mau + '»');
    if (JSON.stringify(bao).indexOf(o + ' = -') >= 0) loiSoKhong.push('vẫn ghi lệch ' + o + ' = -');
  });
  var tong = context.tongDashboard_(luoiDash_(mau, mau, mau, mau));
  ['Tổng nợ', 'Quá hạn', 'Chờ xuất HĐ', 'Doanh thu'].forEach(function (ten) {
    var d = null;
    var i;
    for (i = 0; i < tong.length; i++) if (tong[i].doiTuong === ten) d = tong[i];
    if (!d || d.muc !== 'TONG' || d.giaTri !== '0') loiSoKhong.push(ten + ' không thành 0 với «' + mau + '»');
  });
});
if (context.soODashboard_('-1') !== -1) loiSoKhong.push('số âm bị nuốt thành 0');
if (context.soODashboard_('48.964.500') !== 48964500) loiSoKhong.push('số Dashboard thật bị đổi');
var dongLech = [];
dongLech[2] = 'KH01';
dongLech[3] = 'CTY A';
dongLech[7] = 100;
var baoLech = context.lapBaoCaoDoiSoat_({
  homNay: '2026-10-22',
  hangDoi: [],
  vConNo: [headCon_()],
  vQuaHan: [headTien_(), dongLech],
  vChoXuatHd: [headTien_()],
  dashboard: luoiDash_('0', '-', '0', '0'),
  soLoi: 0
});
var lechH = timDong_(baoLech, 'LỖI', 'Lệch Dashboard!H30');
if (!lechH || String(lechH.ghiChu).indexOf('H30 = 0') < 0 || String(lechH.ghiChu).indexOf('H30 = -') >= 0) {
  loiSoKhong.push('lệch thật của H30 không ghi H30 = 0');
}
var luoiGach = luoiDash_('-', '-', '—', '');
var luoiChuan = context.chuanLuoiDashboard_(luoiGach);
if (luoiChuan[29][4] !== '0' || luoiChuan[29][7] !== '0' || luoiChuan[29][10] !== '0' || luoiChuan[8][1] !== '0') {
  loiSoKhong.push('chuanLuoiDashboard_ không đổi bốn ô về 0');
}
if (luoiGach[29][7] !== '-') loiSoKhong.push('chuanLuoiDashboard_ sửa nhầm lưới gốc');
var dongView = [];
dongView[2] = 'KH01';
dongView[3] = 'CTY A';
dongView[7] = '-';
var viewGach = context.docViewNo_('Nợ quá hạn', [headTien_(), dongView], 'quaHan', 40);
if (!viewGach.dong[0] || viewGach.dong[0].muc !== 'LỖI' || String(viewGach.dong[0].ghiChu).indexOf('không phải số') < 0) {
  loiSoKhong.push('cột Còn nợ vẫn nhận dấu gạch');
}
if (loiSoKhong.length) {
  console.log('FAIL số 0 trên Dashboard\n' + loiSoKhong.join('\n'));
  process.exit(1);
}
console.log('OK Dashboard: dấu gạch, ô trống và 0đ là 0');

var writeRe = /\.(setValues|setValue|setFormula|setFormulas|appendRow|clearContent|insertSheet|deleteRows|insertRow)\s*\(/;
var camLlm = /UrlFetchApp|openai|generativelanguage|chat\.completions/i;
var files = fs.readdirSync(root).filter(function (name) { return name.endsWith('.gs'); });
var leak = [];
files.forEach(function (name) {
  var text = fs.readFileSync(path.join(root, name), 'utf8');
  if (camLlm.test(text)) leak.push(name + ' có lời gọi mạng hoặc LLM');
  if (name === 'Ghi.gs') return;
  if (writeRe.test(text)) leak.push(name + ' ghi sheet ngoài Ghi.gs');
  if (text.indexOf('COUNTIF') >= 0) leak.push(name + ' còn công thức COUNTIF');
  if (name !== 'Ghi.gs' && text.indexOf('ghiCongThuc_') >= 0) leak.push(name + ' còn ghi công thức');
});
if (!writeRe.test(fs.readFileSync(path.join(root, 'Ghi.gs'), 'utf8'))) {
  leak.push('Ghi.gs không còn cổng ghi');
}
var camSheet = ['PhieuGiao', 'HoaDon', 'ChiTiet_LN'];
files.forEach(function (name) {
  if (name === 'Ghi.gs') return;
  var text = fs.readFileSync(path.join(root, name), 'utf8');
  camSheet.forEach(function (sheet) {
    var re = new RegExp('insertSheet\\(\\s*[\'"]' + sheet);
    if (re.test(text)) leak.push(name + ' tạo sheet ' + sheet);
  });
});
var manifest = fs.readFileSync(path.join(root, 'appsscript.json'), 'utf8');
if (manifest.indexOf('gmail.readonly') >= 0) leak.push('appsscript.json còn gmail.readonly');
var camHam = ['caiDat', 'caiDatLich', 'onOpen', 'dienMaTab', 'datDropdown_', 'capNhatTuDrive', 'scan', 'colVals_', 'lastDataRow_', 'appendRow_', 'idFromUrl_', 'norm_', 'guessKH_', 'ngayTuTen_', 'gvNorm_', 'gvNum_', 'capNhatGiaVon', 'caiTriggerGiaVon', 'taoKhoiDonHangHomNay', 'dv', 'quet', 'resetKhoiDonHangHomNay', 'thuCuPhap'];
files.forEach(function (name) {
  var text = fs.readFileSync(path.join(root, name), 'utf8');
  if (/getSheetByName\(\s*['"]HangCho_File['"]/.test(text) || /insertSheet\(\s*['"]HangCho_File['"]/.test(text)) {
    leak.push(name + ' đụng tab HangCho_File');
  }
  camHam.forEach(function (ham) {
    var re = new RegExp('function\\s+' + ham + '\\s*\\(');
    if (re.test(text)) leak.push(name + ' trùng tên hàm cũ ' + ham);
  });
});
if (!fs.existsSync(path.join(root, 'CN_GiaVon.gs'))) leak.push('thiếu CN_GiaVon.gs');
if (fs.existsSync(path.join(root, 'GiaVon.gs'))) leak.push('còn GiaVon.gs, sẽ đè file giá vốn cũ trên v7');
var gia = fs.readFileSync(path.join(root, 'CN_GiaVon.gs'), 'utf8');
if (gia.indexOf('SpreadsheetApp.openById') < 0) leak.push('CN_GiaVon không đọc bằng SpreadsheetApp');
if (gia.indexOf('1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR') >= 0) leak.push('CN_GiaVon còn đọc Excel sao chép');
if (gia.indexOf('DM_GiaVon') >= 0 && /\.setValue/.test(gia)) leak.push('CN_GiaVon ghi sheet');
var trig = fs.readFileSync(path.join(root, 'Triggers.gs'), 'utf8');
if (trig.indexOf('function tatTriggerV6Drive_') < 0) leak.push('thiếu tatTriggerV6Drive_');
if (trig.indexOf("getHandlerFunction() === 'capNhatTuDrive'") < 0) leak.push('tatTriggerV6Drive_ không chỉ đúng capNhatTuDrive');
if (trig.indexOf('capNhatGiaVon') >= 0) leak.push('Triggers.gs đụng trigger giá vốn');
if (trig.indexOf('atHour(lich.gio)') < 0 || trig.indexOf('nearMinute(lich.phut)') < 0) leak.push('thiếu lịch 19:45');
var doi = fs.readFileSync(path.join(root, 'DoiSoat.gs'), 'utf8');
if (doi.indexOf('Bill_Kiot') >= 0 || doi.indexOf('500k') >= 0) leak.push('DoiSoat đụng bill hoặc mốc 500k');
if (doi.indexOf('chuanLuoiDashboard_') < 0) leak.push('DoiSoat không chuẩn hóa số Dashboard');
var skSrc = fs.readFileSync(path.join(root, 'SucKhoe.gs'), 'utf8');
if (skSrc.indexOf('ghiO_(sk, 1, 4, soLoi)') < 0) leak.push('capNhatODem_ không ghi CN_SucKhoe!D1');
if (skSrc.indexOf('demLoiMuc_') < 0) leak.push('capNhatODem_ không đếm LỖI bằng demLoiMuc_');
var qStart = skSrc.indexOf('function quetSucKhoe');
var qEnd = skSrc.indexOf('var KHOA_HH_THIEU');
var thanQuet = qStart >= 0 && qEnd > qStart ? skSrc.slice(qStart, qEnd) : '';
if (thanQuet.indexOf('capNhatODem_(ss)') < 0) leak.push('quetSucKhoe không gọi capNhatODem_');
if (thanQuet.indexOf('giuDongCatLuot_(sh.getRange(3, 1, lastRow - 2, 5).getValues(), bay)') < 0) leak.push('quetSucKhoe không lọc QUET_CAT 7 ngày');
if (thanQuet.lastIndexOf('capNhatODem_(ss)') < thanQuet.lastIndexOf('ghiBang_')) leak.push('D1 được ghi trước khi bảng sức khỏe xong');
['HangDoi.gs', 'DoiSoat.gs', 'Triggers.gs'].forEach(function (name) {
  if (fs.readFileSync(path.join(root, name), 'utf8').indexOf('capNhatODem_') < 0) leak.push(name + ' không gọi capNhatODem_');
});
var hangSrc = fs.readFileSync(path.join(root, 'HangDoi.gs'), 'utf8');
var q0 = hangSrc.indexOf('function quetChungTu_');
var thanChung = q0 >= 0 ? hangSrc.slice(q0) : '';
if (thanChung.indexOf('tachDongKhongPhaiChungTu_') < 0) leak.push('quetChungTu_ không tách dòng không phải chứng từ');
if (thanChung.indexOf('xoaCacDong_') < 0) leak.push('quetChungTu_ không xóa dòng bridge');
if (thanChung.indexOf('tachDongKhongPhaiChungTu_') > thanChung.indexOf('xuLyDotQuet_')) leak.push('lọc dòng bridge sau khi xử lý lượt');
if (thanChung.lastIndexOf('xoaCacDong_') > thanChung.lastIndexOf('capNhatODem_(ss)')) leak.push('Z1 được đếm trước khi xóa dòng bridge');
var ghiSrc = fs.readFileSync(path.join(root, 'Ghi.gs'), 'utf8');
if (ghiSrc.indexOf('function xoaCacDong_') < 0 || ghiSrc.indexOf('.deleteRows(') < 0) leak.push('Ghi.gs thiếu xoaCacDong_');
if (logic.indexOf('TEN_FILE_KHONG_PHAI_CHUNG_TU') < 0 || logic.indexOf('LIVE_BRIDGE') < 0 || logic.indexOf('DanhMuc') < 0) leak.push('Logic.gs thiếu danh sách loại trừ tên file');
var readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
['Mã PG (khóa)', 'chưa có PDF mộc đỏ', '1?C26TNT_\\d+', 'C26TNT_00000021.pdf', 'Khách lẻ quen', 'KH007', 'Giá vốn BQ có VAT', 'createdTime', 'HangCho_File', 'không gộp', 'tatTriggerV6Drive_', 'CN_DoiSoat', '19:45', 'CN_GiaVon.gs', 'CN_HangDoi!Z1', 'CN_SucKhoe!D1'].forEach(function (cum) {
  if (readme.indexOf(cum) < 0) leak.push('README thiếu «' + cum + '»');
});
if (leak.length) {
  console.log('FAIL cổng ghi\n' + leak.join('\n'));
  process.exit(1);
}
if (!kq.ok) process.exit(1);
console.log('OK cổng ghi: chỉ Ghi.gs được ghi sheet');
