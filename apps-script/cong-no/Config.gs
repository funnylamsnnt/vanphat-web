/**
 * Đọc và bổ sung sheet CONFIG. Không ghi đè giá trị anh đã sửa.
 */

var KHOA_MOC_DRIVE = 'cn.mocDrive';
var KHOA_MOC_GMAIL = 'cn.mocGmail';

function hienThiConfig_(giaTri) {
  if (giaTri === true) return 'TRUE';
  if (giaTri === false) return 'FALSE';
  return giaTri;
}

function moSo_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Hãy mở script từ trong sổ công nợ (v7 hoặc bản sao).');
  return ss;
}

function khoaSoDung_(ss, cfg) {
  var id = ss.getId();
  if (cfg.V7_SPREADSHEET_ID && id !== cfg.V7_SPREADSHEET_ID) {
    throw new Error(
      'Sổ đang mở không khớp CONFIG V7_SPREADSHEET_ID. Trên bản sao, sửa ô đó thành id của bản sao rồi chạy lại. Id đang mở: ' + id
    );
  }
}

function damBaoConfig_(ss) {
  var sh = taoSheetNeuThieu_(ss, 'CONFIG');
  var last = sh.getLastRow();
  if (last < 1 || !sh.getRange(1, 1).getValue()) {
    var bang = [['Khoa', 'Gia tri', 'Ghi chu']];
    var k;
    for (k in CONFIG_MAC_DINH) {
      if (!CONFIG_MAC_DINH.hasOwnProperty(k)) continue;
      bang.push([k, hienThiConfig_(CONFIG_MAC_DINH[k]), GHI_CHU_CONFIG[k] || '']);
    }
    ghiBang_(sh, 1, 1, bang);
    return sh;
  }
  var vals = sh.getRange(1, 1, last, 1).getValues();
  var batDau = chuanHoa_(vals[0][0]) === 'khoa' ? 1 : 0;
  var co = {};
  var r;
  for (r = batDau; r < vals.length; r++) {
    if (vals[r][0]) co[String(vals[r][0]).trim()] = true;
  }
  var them = [];
  var key;
  for (key in CONFIG_MAC_DINH) {
    if (!CONFIG_MAC_DINH.hasOwnProperty(key)) continue;
    if (co[key]) continue;
    them.push([key, hienThiConfig_(CONFIG_MAC_DINH[key]), GHI_CHU_CONFIG[key] || '']);
  }
  if (them.length) ghiBang_(sh, sh.getLastRow() + 1, 1, them);
  return sh;
}

function docConfig_(ss) {
  var sh = ss.getSheetByName('CONFIG');
  if (!sh || sh.getLastRow() < 1) return hopNhatConfig_(null);
  var vals = sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
  var cap = {};
  var i;
  for (i = 0; i < vals.length; i++) {
    var k = String(vals[i][0] || '').trim();
    if (!k || chuanHoa_(k) === 'khoa') continue;
    cap[k] = vals[i][1];
  }
  return hopNhatConfig_(cap);
}

function dinhDangLuc_(date, tz) {
  return Utilities.formatDate(date, tz || CONFIG_MAC_DINH.TZ, 'yyyy-MM-dd HH:mm:ss');
}

function gioPhutVn_(date, tz) {
  var s = Utilities.formatDate(date, tz || CONFIG_MAC_DINH.TZ, 'H:m');
  var p = s.split(':');
  return {gio: Number(p[0]), phut: Number(p[1])};
}
