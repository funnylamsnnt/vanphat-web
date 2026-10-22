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
files.forEach(function (name) {
  if (name === 'Logic.gs') return;
  var text = fs.readFileSync(path.join(root, name), 'utf8');
  if (text.indexOf('HangCho_File') >= 0) leak.push(name + ' nhắc HangCho_File ngoài đề xuất ở Logic.gs');
});
var readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
['Mã PG (khóa)', 'chưa có PDF mộc đỏ', '1?C26TNT_\\d+', 'C26TNT_00000021.pdf', 'Khách lẻ quen', 'KH007', 'Giá vốn BQ có VAT', 'createdTime', 'HangCho_File', 'không gộp', 'song song'].forEach(function (cum) {
  if (readme.indexOf(cum) < 0) leak.push('README thiếu «' + cum + '»');
});
if (leak.length) {
  console.log('FAIL cổng ghi\n' + leak.join('\n'));
  process.exit(1);
}
if (!kq.ok) process.exit(1);
console.log('OK cổng ghi: chỉ Ghi.gs được ghi sheet');
