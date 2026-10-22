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
