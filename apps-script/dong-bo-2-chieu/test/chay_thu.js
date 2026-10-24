/**
 * Test đồng bộ hai chiều Excel ↔ Sheet.
 *   node --test apps-script/dong-bo-2-chieu/test/chay_thu.js
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var test = require('node:test');
var assert = require('node:assert/strict');

var root = path.join(__dirname, '..');
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
  parseInt: parseInt,
  parseFloat: parseFloat,
  JSON: JSON
};
vm.createContext(context);
['Config.gs', 'Xlsx.gs', 'Logic.gs', 'DongBo.gs'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
});

var DM = context.TEN_SHEET_DM;
var GIA = 'Đơn Giá (Gồm VAT 8%)';
var TEN = 'Tên Sản Phẩm';

function lucSaigon(y, thang, ngay, gio, phut) {
  return new Date(Date.UTC(y, thang - 1, ngay, gio - 7, phut, 0));
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cellInline(ref, text, style) {
  var s = style ? ' s="' + style + '"' : '';
  return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t>' + xmlEscape(text) + '</t></is></c>';
}

function cellNum(ref, n) {
  return '<c r="' + ref + '"><v>' + n + '</v></c>';
}

function cellOf(v) {
  if (v && typeof v === 'object' && v.__cell) {
    return { v: v.v, f: !!v.f, img: !!v.img, formula: v.formula || '' };
  }
  if (v == null || v === '') return null;
  return { v: v, f: false, img: false, formula: '' };
}

function gridFrom(matrix) {
  var grid = {};
  matrix.forEach(function (arr, ri) {
    var row = {};
    var has = false;
    var ci;
    for (ci = 0; ci < arr.length; ci++) {
      var spec = cellOf(arr[ci]);
      if (!spec) continue;
      has = true;
      row[ci] = {
        v: spec.v,
        f: spec.f,
        img: spec.img,
        formula: spec.formula,
        ref: context.cotChu_(ci) + (ri + 1)
      };
    }
    if (has) grid[ri + 1] = row;
  });
  return grid;
}

function dongVp(ma, ten, gia) {
  var row = [];
  row[0] = 'Giấy';
  row[1] = ma;
  row[2] = ten;
  row[3] = 'Cái';
  row[4] = gia;
  row[5] = 'https://example.test/' + ma;
  [6, 8, 9, 10, 11, 12, 13].forEach(function (i) {
    row[i] = { __cell: true, v: 1, f: true, formula: '=1+1' };
  });
  row[7] = 1000;
  row[14] = '0893000000001';
  row[15] = 'ma vach';
  row[16] = 12;
  row[17] = 'khong trung';
  row[18] = 'TL';
  row[19] = 'Hop';
  return row;
}

function dongTheoTieuDe(tieuDe, map) {
  var row = tieuDe.map(function () { return ''; });
  Object.keys(map).forEach(function (k) {
    var idx = -1;
    tieuDe.forEach(function (ten, i) {
      if (context.chuanTieuDe_(ten) === context.chuanTieuDe_(k)) idx = i;
    });
    if (idx < 0) throw new Error('thieu cot ' + k);
    row[idx] = map[k];
  });
  return row;
}

function moDayDu() {
  var dm = context.timCauHinh_(DM);
  var grids = {};
  grids[DM] = gridFrom([
    dm.tieuDe,
    dongVp('VP001', 'But', 12000),
    dongVp('VP002', 'Giay', 8000),
    dongVp('VP003', 'Keo', 15000)
  ]);
  function tabKhoa(ten, banDo) {
    var cfg = context.timCauHinh_(ten);
    grids[ten] = gridFrom([cfg.tieuDe].concat(banDo));
  }
  tabKhoa('Hóa Đơn Đầu Vào', [
    dongTheoTieuDe(context.timCauHinh_('Hóa Đơn Đầu Vào').tieuDe, { 'Số Hóa Đơn': 'HDV1', 'Mã SP': 'VP001', 'Số Lượng': 2 })
  ]);
  tabKhoa('Hóa Đơn Đầu Ra', [
    dongTheoTieuDe(context.timCauHinh_('Hóa Đơn Đầu Ra').tieuDe, { 'Số Hóa Đơn': 'HDR1', 'Mã SP': 'VP001', 'Số Lượng': 1 })
  ]);
  tabKhoa('Quản Lý Nhóm', [
    dongTheoTieuDe(context.timCauHinh_('Quản Lý Nhóm').tieuDe, { 'Tên Nhóm Hàng': 'Giấy' })
  ]);
  tabKhoa('LIST KHACH HANG', [
    dongTheoTieuDe(context.timCauHinh_('LIST KHACH HANG').tieuDe, { 'Khách hàng': 'Khach A', 'Mã số thuế': '0101234567' }),
    dongTheoTieuDe(context.timCauHinh_('LIST KHACH HANG').tieuDe, { 'Khách hàng': 'Khach Khong MST' })
  ]);
  var cs = context.timCauHinh_('Chính Sách Đối Tác');
  grids['Chính Sách Đối Tác'] = gridFrom([
    ['Chinh sach doi tac'],
    ['Khong phai header'],
    cs.tieuDe,
    dongTheoTieuDe(cs.tieuDe, { 'Mã Đối Tác': 'DT01', 'Tên Khách Hàng / Đơn Vị': 'Cong ty A' })
  ]);
  tabKhoa('Lịch Sử Xuất Kho', [
    dongTheoTieuDe(context.timCauHinh_('Lịch Sử Xuất Kho').tieuDe, { 'Số Phiếu / Mã Đơn': 'PX001' })
  ]);
  grids['Đơn Đặt Hàng'] = gridFrom([['VAN PHAT', 'Phieu giao']]);
  var model = context.moHinhTuGrid_(context.SHEET_NAMES.slice(), grids);
  if (model.loi.length) throw new Error(model.loi.join(' || '));
  return model;
}

function datCot(model, tab, khoa, tenCot, value) {
  var t = model.sheets[tab];
  var idx = t.col[context.chuanTieuDe_(tenCot)];
  if (idx == null) throw new Error('khong co cot ' + tenCot);
  var hang = t.rows[khoa];
  if (!hang) throw new Error('khong co khoa ' + khoa);
  if (!hang.cells[idx]) {
    hang.cells[idx] = { v: value, f: false, img: false, formula: '', ref: context.cotChu_(idx) + hang.row };
  } else {
    hang.cells[idx].v = value;
    hang.cells[idx].f = false;
    hang.cells[idx].img = false;
  }
  return idx;
}

function ghiCot(plan, tab, khoa, col) {
  return (plan.ghiSheet || []).filter(function (o) {
    return o.tab === tab && o.khoa === khoa && o.col === col;
  });
}

function themNhom(model, ten, row) {
  var tab = model.sheets['Quản Lý Nhóm'];
  var idx = tab.col[context.chuanTieuDe_('Tên Nhóm Hàng')];
  tab.rows[ten] = {
    row: row,
    cells: {}
  };
  tab.rows[ten].cells[idx] = { v: ten, f: false, img: false, formula: '', ref: context.cotChu_(idx) + row };
}

function dmXml(opt) {
  opt = opt || {};
  var titles = context.timCauHinh_(DM).tieuDe.slice();
  var head = [];
  titles.forEach(function (ten, i) {
    if (opt.boCot && opt.boCot[i]) return;
    var text = ten;
    if (i === 18 && opt.sTen != null) text = opt.sTen;
    if (i === 19 && opt.tTen != null) text = opt.tTen;
    head.push(cellInline(context.cotChu_(i) + '1', text));
  });
  var codes = opt.codes || ['VP001', 'VP002', 'VP003'];
  var rows = ['<row r="1">' + head.join('') + '</row>'];
  codes.forEach(function (code, n) {
    var row = n + 2;
    var gia = opt.gia && Object.prototype.hasOwnProperty.call(opt.gia, code) ? opt.gia[code] : (12000 + n);
    var body = [cellInline('B' + row, code), cellInline('C' + row, (opt.ten && opt.ten[code]) || code)];
    if (gia !== null && gia !== '') body.push(cellNum('E' + row, gia));
    var s = opt.s && Object.prototype.hasOwnProperty.call(opt.s, code) ? opt.s[code] : 'TL';
    var t = opt.t && Object.prototype.hasOwnProperty.call(opt.t, code) ? opt.t[code] : 'Cai';
    if (s !== '') body.push(cellInline('S' + row, s, opt.styleS));
    if (t !== '') body.push(cellInline('T' + row, t));
    if (opt.q && opt.q[code]) body.push(cellInline('Q' + row, opt.q[code]));
    if (opt.extra && opt.extra[code]) body.push(opt.extra[code]);
    rows.push('<row r="' + row + '">' + body.join('') + '</row>');
  });
  return '<worksheet><sheetData>' + rows.join('') + '</sheetData></worksheet>';
}

function filesVoiDm(dm, names) {
  names = names || context.SHEET_NAMES.slice();
  var sheetsXml = names.map(function (n, i) {
    return '<sheet name="' + xmlEscape(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
  }).join('');
  var rels = names.map(function (n, i) {
    return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
  }).join('');
  var files = {
    'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheetsXml + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships>' + rels + '</Relationships>'
  };
  var dmIndex = names.indexOf(DM);
  files['xl/worksheets/sheet' + (dmIndex + 1) + '.xml'] = dm;
  return files;
}

function blobPk(files) {
  return {
    getBytes: function () { return { length: 32, 0: 0x50, 1: 0x4B }; },
    _files: files
  };
}

function giaMacDinh() {
  return { VP001: 12000, VP002: 8000, VP003: 15000 };
}

function depsCoBan(opt) {
  opt = opt || {};
  var props = Object.assign({}, opt.props || {});
  var calls = [];
  var sheetLan = 0;
  function mark(ten) { calls.push(ten); }
  var d = {
    calls: calls,
    props: props,
    plan: null,
    snapId: '',
    zipFiles: null,
    excelMeta: function () {
      mark('excelMeta');
      return opt.excelMeta || {
        id: context.EXCEL_ID,
        name: context.EXPECTED_TITLE,
        md5Checksum: 'md5-e',
        modifiedTime: '2026-10-24T05:22:35.000Z',
        version: '9'
      };
    },
    sheetMeta: function () {
      mark('sheetMeta');
      sheetLan++;
      if (opt.sheetMetaSau && sheetLan > 1) return opt.sheetMetaSau;
      return opt.sheetMeta || { id: context.GSHEET_ID, modifiedTime: '2026-10-24T01:13:18.000Z' };
    },
    snapshotMeta: function () {
      mark('snapshotMeta');
      return opt.snapshotMeta || { id: context.BASELINE_BACKUP_ID, md5Checksum: 'md5-snap' };
    },
    taiExcel: function () { mark('taiExcel'); return opt.excelPack; },
    taiSheet: function () { mark('taiSheet'); return opt.sheetMo; },
    taiSnapshot: function () { mark('taiSnapshot'); return opt.nenMo; },
    saoLuu: function () {
      mark('saoLuu');
      return opt.backup || { excelId: 'bak-excel', sheetId: 'bak-sheet', luc: 'x' };
    },
    apDung: function (plan) { mark('apDung'); d.plan = plan; return { ghi: (plan.ghiSheet || []).length }; },
    ghiNhatKy: function () { mark('ghiNhatKy'); },
    exportXlsx: function () { mark('export'); return opt.blob || blobPk(opt.filesXuat); },
    unzip: function (blob) { mark('unzip'); return blob._files; },
    zip: function (files) { mark('zip'); d.zipFiles = files; return blobPk(files); },
    updateExcel: function () {
      mark('updateExcel');
      return opt.after || {
        id: context.EXCEL_ID,
        name: context.EXPECTED_TITLE,
        md5Checksum: 'md5-moi',
        modifiedTime: '2026-10-24T06:00:00.000Z',
        version: '10'
      };
    },
    capNhatSnapshot: function (blob, snapId) { mark('snapshot'); d.snapId = snapId; },
    getProp: function (k) { return props[k] || ''; },
    setProp: function (k, v) { props[k] = String(v); },
    log: function () { mark('log'); },
    isDryRun: function () { return !!opt.dryProp; },
    tryLock: function () { mark('tryLock'); return opt.lock === undefined ? true : opt.lock; },
    releaseLock: function () { mark('releaseLock'); }
  };
  return d;
}

function taoSheetNho(name, values, formulas) {
  var data = values.map(function (r) { return r.slice(); });
  var forms = (formulas || values.map(function (r) { return r.map(function () { return ''; }); })).map(function (r) { return r.slice(); });
  var sh = {
    _deleted: [],
    getName: function () { return name; },
    getLastRow: function () {
      var i;
      var j;
      for (i = data.length - 1; i >= 0; i--) {
        for (j = 0; j < (data[i] || []).length; j++) {
          if (data[i][j] !== '' && data[i][j] != null) return i + 1;
        }
        for (j = 0; j < (forms[i] || []).length; j++) if (forms[i][j]) return i + 1;
      }
      return 0;
    },
    getLastColumn: function () {
      var m = 0;
      var i;
      for (i = 0; i < data.length; i++) if ((data[i] || []).length > m) m = data[i].length;
      return m;
    },
    deleteRow: function (r) {
      sh._deleted.push(r);
      data.splice(r - 1, 1);
      forms.splice(r - 1, 1);
    },
    getRange: function (r, c, numRows, numCols) {
      if (numRows == null) {
        return {
          getFormula: function () { return (forms[r - 1] && forms[r - 1][c - 1]) || ''; },
          getValue: function () { return data[r - 1] ? data[r - 1][c - 1] : ''; },
          setValue: function (v) {
            while (data.length < r) data.push([]);
            while (forms.length < r) forms.push([]);
            data[r - 1][c - 1] = v;
          },
          setFormula: function (f) {
            while (data.length < r) data.push([]);
            while (forms.length < r) forms.push([]);
            forms[r - 1][c - 1] = f;
          }
        };
      }
      return {
        getValues: function () {
          var out = [];
          var i;
          var j;
          for (i = 0; i < numRows; i++) {
            var row = [];
            for (j = 0; j < numCols; j++) {
              row.push(data[r - 1 + i] && data[r - 1 + i][c - 1 + j] != null ? data[r - 1 + i][c - 1 + j] : '');
            }
            out.push(row);
          }
          return out;
        },
        setValues: function (vals) {
          var i;
          var j;
          for (i = 0; i < vals.length; i++) {
            while (data.length < r + i) data.push([]);
            for (j = 0; j < vals[i].length; j++) data[r - 1 + i][c - 1 + j] = vals[i][j];
          }
        }
      };
    },
    _data: data,
    _forms: forms
  };
  return sh;
}

test('chuẩn hóa tiêu đề, giá trị và quyết định ô', function () {
  assert.equal(context.chuanTieuDe_('Đơn Giá (Gồm VAT 8%)'), 'don gia (gom vat 8%)');
  assert.equal(context.chuanTieuDe_('Độ trùng tên (%)'), context.chuanTieuDe_('do trung ten (%)'));
  assert.equal(context.chuanTieuDe_('Đơn Giá\n(Gồm VAT 8%)'), context.chuanTieuDe_(GIA));
  assert.equal(context.chuanGiaTri_('12000.00'), '12000');
  assert.equal(context.chuanGiaTri_(12000), '12000');
  assert.equal(context.cungGiaTri_(12000, '12000.00'), true);
  assert.equal(context.chuanGiaTri_('0101234567'), '0101234567');
  assert.equal(context.cungGiaTri_('010', '10'), false);
  assert.equal(context.quyetDinhO_(100, 100, 100), 'giu');
  assert.equal(context.quyetDinhO_(100, 200, 100), 'excel');
  assert.equal(context.quyetDinhO_(100, 100, 200), 'sheet');
  assert.equal(context.quyetDinhO_(100, 200, 200), 'giu');
  assert.equal(context.quyetDinhO_(100, 200, 300), 'xung-dot');
  assert.equal(context.dieuChinhCongThuc_('=A2+B2', 2, 3), '=A3+B3');
  assert.equal(context.dieuChinhCongThuc_('=A$2+B2', 2, 3), '=A$2+B3');
  assert.equal(context.dieuChinhCongThuc_('=$A$2', 2, 5), '=$A$2');
  assert.equal(context.dieuChinhCongThuc_('=AA10', 10, 12), '=AA12');
});

test('lịch 15 phút bỏ đúng hai khung, chạy ngoài 7–21h', function () {
  function chay(gio, phut) {
    return context.quyetDinhLich15_(lucSaigon(2026, 10, 24, gio, phut)).chay;
  }
  assert.equal(chay(8, 4), true);
  assert.equal(chay(8, 5), false);
  assert.equal(chay(8, 15), false);
  assert.equal(chay(8, 25), false);
  assert.equal(chay(8, 26), true);
  assert.equal(chay(8, 30), true);
  assert.equal(chay(9, 0), true);
  assert.equal(chay(14, 5), false);
  assert.equal(chay(14, 20), false);
  assert.equal(chay(14, 25), false);
  assert.equal(chay(14, 26), true);
  assert.equal(chay(23, 0), true);
  assert.match(context.quyetDinhLich15_(lucSaigon(2026, 10, 24, 8, 15)).lyDo, /8:05–8:25/);
  assert.match(context.quyetDinhLich15_(lucSaigon(2026, 10, 24, 14, 20)).lyDo, /14:05–14:25/);
});

test('mô hình đủ 13 tab, khóa MST giữ số 0, chính sách lấy header dòng 3', function () {
  var m = moDayDu();
  assert.equal(m.sheetNames.length, 13);
  assert.deepEqual(m.sheetNames, context.SHEET_NAMES);
  assert.ok(m.sheets['LIST KHACH HANG'].rows['0101234567']);
  assert.ok(m.sheets['LIST KHACH HANG'].rows['Khach Khong MST']);
  assert.equal(m.sheets['Chính Sách Đối Tác'].headerRow, 3);
  assert.equal(m.sheets[context.TEN_GEMINI].cheDo, 'cam');
  assert.equal(m.sheets['Sổ Kho - Nhập Xuất Tồn'].cheDo, 'cong-thuc');
  var goc = moDayDu();
  var plan = context.gopBaBen_(clone(goc), clone(goc), clone(goc), {});
  assert.equal(plan.ok, true);
  assert.equal(plan.canXuat, false);
  assert.equal(plan.ghiSheet.length, 0);
});

test('hóa đơn trùng khóa được đánh #2 theo thứ tự dòng', function () {
  var cfg = context.timCauHinh_('Hóa Đơn Đầu Vào');
  var grid = gridFrom([
    cfg.tieuDe,
    dongTheoTieuDe(cfg.tieuDe, { 'Số Hóa Đơn': 'HD1', 'Mã SP': 'VP101', 'Số Lượng': 1 }),
    dongTheoTieuDe(cfg.tieuDe, { 'Số Hóa Đơn': 'HD1', 'Mã SP': 'VP101', 'Số Lượng': 4 })
  ]);
  var header = context.timHangTieuDe_(grid, cfg.khoa);
  var rows = context.hangTheoKhoa_(grid, header, cfg);
  assert.ok(rows['HD1|VP101']);
  assert.ok(rows['HD1|VP101#2']);
  assert.equal(rows['HD1|VP101#2'].cells[header.col[context.chuanTieuDe_('Số Lượng')]].v, 4);
});

test('ba bên: excel, sheet, xung đột, công thức, Q–T, giá 0', function () {
  var goc = moDayDu();
  var nen = clone(goc);
  var excel = clone(goc);
  var sheet = clone(goc);
  var cotGia = datCot(excel, DM, 'VP001', GIA, 13000);
  var plan = context.gopBaBen_(nen, excel, sheet, {});
  assert.equal(plan.ok, true);
  assert.equal(plan.canXuat, true);
  assert.equal(ghiCot(plan, DM, 'VP001', cotGia).length, 1);
  assert.equal(ghiCot(plan, DM, 'VP001', cotGia)[0].giaTri, 13000);
  assert.equal(plan.xungDot.length, 0);

  nen = clone(goc); excel = clone(goc); sheet = clone(goc);
  datCot(sheet, DM, 'VP001', GIA, 14000);
  plan = context.gopBaBen_(nen, excel, sheet, {});
  assert.equal(plan.ok, true);
  assert.equal(ghiCot(plan, DM, 'VP001', cotGia).length, 0);
  assert.equal(plan.canXuat, true);
  assert.ok(plan.log.some(function (d) { return d.nguon === 'sheet' && d.khoa === 'VP001'; }));

  nen = clone(goc); excel = clone(goc); sheet = clone(goc);
  datCot(excel, DM, 'VP001', GIA, 13000);
  datCot(sheet, DM, 'VP001', GIA, 14000);
  plan = context.gopBaBen_(nen, excel, sheet, {});
  assert.equal(plan.ok, true);
  assert.equal(ghiCot(plan, DM, 'VP001', cotGia).length, 0);
  assert.equal(plan.xungDot.length, 1);
  assert.equal(plan.xungDot[0].ketLuan, 'Sheet thắng');
  assert.equal(plan.xungDot[0].sheet, '14000');
  assert.equal(plan.canXuat, true);

  nen = clone(goc); excel = clone(goc); sheet = clone(goc);
  datCot(excel, DM, 'VP001', GIA, 13000);
  datCot(sheet, DM, 'VP001', GIA, 13000);
  plan = context.gopBaBen_(nen, excel, sheet, {});
  assert.equal(ghiCot(plan, DM, 'VP001', cotGia).length, 0);
  assert.equal(plan.xungDot.length, 0);

  nen = clone(goc); excel = clone(goc); sheet = clone(goc);
  var cotTen = datCot(excel, DM, 'VP002', TEN, 'Giay moi');
  excel.sheets[DM].rows.VP002.cells[cotTen].f = true;
  excel.sheets[DM].rows.VP002.cells[cotTen].formula = '=IMAGE("x")';
  excel.sheets[DM].rows.VP002.cells[cotTen].img = true;
  plan = context.gopBaBen_(nen, excel, sheet, {});
  assert.equal(ghiCot(plan, DM, 'VP002', cotTen).length, 0);

  nen = clone(goc); excel = clone(goc); sheet = clone(goc);
  var cotVon = datCot(excel, DM, 'VP001', 'Hóa Đơn VÀO (Giá Vốn BQ, Có VAT 8%)', 2500);
  plan = context.gopBaBen_(nen, excel, sheet, {});
  assert.equal(ghiCot(plan, DM, 'VP001', cotVon)[0].giaTri, 2500);

  nen = clone(goc); excel = clone(goc); sheet = clone(goc);
  datCot(excel, DM, 'VP001', 'Tổng Nhập', 99);
  plan = context.gopBaBen_(nen, excel, sheet, {});
  assert.equal(plan.ghiSheet.length, 0);
  assert.equal(plan.canXuat, false);

  nen = clone(goc); excel = clone(goc); sheet = clone(goc);
  datCot(excel, DM, 'VP001', 'Thương Hiệu', 'KHAC');
  datCot(sheet, DM, 'VP001', 'Quy Cách', 'Thung');
  plan = context.gopBaBen_(nen, excel, sheet, {});
  assert.equal(plan.ghiSheet.length, 0);
  assert.equal(plan.canXuat, false);
  assert.ok(!JSON.stringify(plan).includes('KHAC') || plan.ghiSheet.length === 0);

  nen = clone(goc); excel = clone(goc); sheet = clone(goc);
  datCot(sheet, DM, 'VP001', GIA, 0);
  plan = context.gopBaBen_(nen, excel, sheet, {});
  assert.equal(plan.ok, false);
  assert.match(plan.lyDo, /giá 0\/trống sẽ đè giá thật/);
  assert.equal(plan.ghiSheet.length, 0);
  assert.equal(plan.xoaDong.length, 0);
  assert.equal(plan.canXuat, false);

  nen = clone(goc); excel = clone(goc); sheet = clone(goc);
  datCot(excel, DM, 'VP001', GIA, 0);
  plan = context.gopBaBen_(nen, excel, sheet, {});
  assert.equal(plan.ok, true);
  assert.equal(ghiCot(plan, DM, 'VP001', cotGia).length, 0);
  assert.ok(plan.log.some(function (d) { return d.ghiChu === 'giá 0/trống không đè giá thật' && d.khoa === 'VP001'; }));
  assert.equal(plan.canXuat, true);
});

test('lượt đầu dayExcel đẩy giá Excel lên Sheet, không lấy Sheet cũ đè', function () {
  var goc = moDayDu();
  var excel = clone(goc);
  var sheet = clone(goc);
  datCot(excel, DM, 'VP001', GIA, 13000);
  datCot(sheet, DM, 'VP001', GIA, 11111);
  datCot(excel, DM, 'VP002', TEN, 'Giay 1222');
  var plan = context.gopBaBen_(excel, excel, sheet, { dayExcel: true });
  assert.equal(plan.ok, true);
  var gia = ghiCot(plan, DM, 'VP001', 4);
  assert.equal(gia.length, 1);
  assert.equal(gia[0].giaTri, 13000);
  var ten = ghiCot(plan, DM, 'VP002', 2);
  assert.equal(ten.length, 1);
  assert.equal(ten[0].giaTri, 'Giay 1222');
  assert.equal(plan.xungDot.length, 0);
});

test('xóa dòng: dưới ngưỡng thì xóa, quá ngưỡng thì dừng, Sheet xóa mã VP thì giữ', function () {
  var goc = moDayDu();
  var nen = clone(goc);
  var excel = clone(goc);
  var sheet = clone(goc);
  themNhom(nen, 'Nhom A', 20);
  themNhom(sheet, 'Nhom A', 20);
  themNhom(nen, 'Nhom B', 21);
  themNhom(sheet, 'Nhom B', 21);
  var plan = context.gopBaBen_(nen, excel, sheet, { nguong: 10 });
  assert.equal(plan.ok, true);
  assert.equal(plan.soXoa, 2);
  assert.ok(plan.xoaDong.every(function (d) { return d.tab === 'Quản Lý Nhóm'; }));

  nen = clone(goc); excel = clone(goc); sheet = clone(goc);
  var i;
  for (i = 1; i <= 11; i++) {
    themNhom(nen, 'Nhom ' + i, 30 + i);
    themNhom(sheet, 'Nhom ' + i, 30 + i);
  }
  plan = context.gopBaBen_(nen, excel, sheet, { nguong: 10 });
  assert.equal(plan.ok, false);
  assert.match(plan.lyDo, /xóa quá nhiều dòng/);
  assert.equal(plan.ghiSheet.length, 0);
  assert.equal(plan.xoaDong.length, 0);
  assert.equal(plan.canXuat, false);

  nen = clone(goc); excel = clone(goc); sheet = clone(goc);
  delete sheet.sheets[DM].rows.VP003;
  plan = context.gopBaBen_(nen, excel, sheet, {});
  assert.equal(plan.ok, true);
  assert.equal(plan.soXoa, 0);
  assert.ok(plan.xungDot.some(function (d) { return d.khoa === 'VP003' && /giữ mã/.test(d.ketLuan); }));

  plan = context.gopBaBen_(nen, excel, sheet, { nguong: 0 });
  assert.equal(plan.ok, false);
  assert.match(plan.lyDo, /xóa quá nhiều dòng/);

  nen = clone(goc); excel = clone(goc); sheet = clone(goc);
  delete excel.sheets[DM].rows.VP002;
  plan = context.gopBaBen_(nen, excel, sheet, {});
  assert.equal(plan.ok, false);
  assert.match(plan.lyDo, /mã VP không liên tục/);
  assert.equal(plan.ghiSheet.length, 0);

  nen = clone(goc); excel = clone(goc); sheet = clone(goc);
  delete excel.sheets[DM].rows.VP003;
  plan = context.gopBaBen_(nen, excel, sheet, {});
  assert.equal(plan.ok, true);
  assert.equal(plan.soXoa, 1);
  assert.equal(plan.xoaDong[0].khoa, 'VP003');
});

test('lệch tab hoặc lệch vị trí cột thì dừng, không ghi', function () {
  var goc = moDayDu();
  var excel = clone(goc);
  excel.sheetNames = excel.sheetNames.filter(function (n) { return n !== context.TEN_GEMINI; });
  var plan = context.gopBaBen_(clone(goc), excel, clone(goc), {});
  assert.equal(plan.ok, false);
  assert.match(plan.lyDo, /danh sách sheet lệch/);
  assert.equal(plan.lyDo.includes('GEMINI_BI_MAT'), false);
  assert.equal(plan.ghiSheet.length, 0);

  excel = clone(goc);
  var tmp = excel.sheetNames[0];
  excel.sheetNames[0] = excel.sheetNames[1];
  excel.sheetNames[1] = tmp;
  plan = context.gopBaBen_(clone(goc), excel, clone(goc), {});
  assert.equal(plan.ok, false);
  assert.match(plan.lyDo, /danh sách sheet lệch/);

  excel = clone(goc);
  excel.sheets[DM].headers[1] = 'Sai cot';
  plan = context.gopBaBen_(clone(goc), excel, clone(goc), {});
  assert.equal(plan.ok, false);
  assert.match(plan.lyDo, /Mã SP không ở cột B/);
});

test('không đọc tab Gemini và tab công thức', function () {
  var names = context.SHEET_NAMES.slice();
  var files = filesVoiDm(dmXml({ gia: giaMacDinh() }), names);
  var docCam = false;
  var docBaoCao = false;
  names.forEach(function (ten, i) {
    var cfg = context.timCauHinh_(ten);
    var pathXml = 'xl/worksheets/sheet' + (i + 1) + '.xml';
    if (ten === DM) return;
    if (!cfg || cfg.cheDo === 'cam') {
      files[pathXml] = {
        biMat: 'GEMINI_BI_MAT',
        toString: function () { docCam = true; return '<worksheet><sheetData><c r="A1" t="inlineStr"><is><t>GEMINI_BI_MAT</t></is></c></sheetData></worksheet>'; },
        getDataAsString: function () { docCam = true; return this.toString(); }
      };
      return;
    }
    if (cfg.cheDo === 'cong-thuc') {
      files[pathXml] = {
        toString: function () { docBaoCao = true; return '<worksheet/>'; },
        getDataAsString: function () { docBaoCao = true; return '<worksheet/>'; }
      };
      return;
    }
    files[pathXml] = '<worksheet><sheetData></sheetData></worksheet>';
  });
  var model = context.moHinhTuTep_(files);
  assert.equal(docCam, false);
  assert.equal(docBaoCao, false);
  assert.equal(JSON.stringify(model).includes('GEMINI_BI_MAT'), false);
  var plan = context.gopBaBen_(model, model, model, { dayExcel: true });
  assert.equal(JSON.stringify(plan).includes('GEMINI_BI_MAT'), false);
});

test('chép bù Q–T giữ style, không xóa ô trống, giữ phần nhị phân', function () {
  var xuat = dmXml({
    gia: giaMacDinh(),
    s: { VP001: 'TU-SHEET', VP002: 'GIU-S2', VP003: 'TL' },
    q: { VP001: 'xuat-q' },
    styleS: '7',
    extra: { VP001: '<c r="R2"><f>1+1</f><v>9</v></c>' }
  });
  var goc = dmXml({
    gia: giaMacDinh(),
    s: { VP001: 'TL-EXCEL', VP002: '', VP003: 'TL' },
    q: { VP001: 'excel-q' },
    extra: { VP001: '<c r="R2"><f>SUM(A1)</f><v>1</v></c>' }
  });
  var png = { kind: 'bin', n: 1 };
  var mapMoi = filesVoiDm(xuat);
  var mapCu = filesVoiDm(goc);
  mapMoi['xl/media/image1.png'] = png;
  var ket = context.chepBuGiuNhiPhan_(mapMoi, mapCu);
  assert.equal(ket.files['xl/media/image1.png'], png);
  var xml = ket.filesXml['xl/worksheets/sheet2.xml'];
  assert.match(xml, /s="7"/);
  assert.match(xml, /TL-EXCEL/);
  assert.match(xml, /GIU-S2/);
  assert.match(xml, /excel-q/);
  assert.equal(xml.includes('TU-SHEET'), false);
  assert.match(xml, /<f>1\+1<\/f>/);
  assert.equal(context.laXlsxBlob_({ getBytes: function () { return { length: 10, 0: 0x50, 1: 0x4B }; } }, 8), true);
  assert.equal(context.laXlsxBlob_({ getBytes: function () { return { length: 10, 0: 0x00, 1: 0x4B }; } }, 8), false);
});

test('guard xuất giữ câu chặn cũ', function () {
  var gia = giaMacDinh();
  var files = filesVoiDm(dmXml({ gia: gia }));
  var cat = context.catalogTuExcel_(moDayDu());
  var on = context.kiemXuatTuFiles_(files, cat);
  assert.equal(on.ok, true, on.errs.join(' | '));

  var lech = filesVoiDm(dmXml({ gia: gia }), context.SHEET_NAMES.slice().reverse());
  assert.match(context.kiemXuatTuFiles_(lech, cat).errs.join(' '), /danh sách sheet lệch/);

  var gap = filesVoiDm(dmXml({ codes: ['VP001', 'VP003'], gia: gia }));
  assert.match(context.kiemXuatTuFiles_(gap, cat).errs.join(' '), /mã VP không liên tục/);

  var mat = filesVoiDm(dmXml({ gia: gia }));
  var catThem = clone(cat);
  catThem.items.VP004 = { name: 'Them', price: 9000, S: 'TL', T: 'Cai' };
  assert.match(context.kiemXuatTuFiles_(mat, catThem).errs.join(' '), /mất mã so với Excel hiện tại/);

  var zero = filesVoiDm(dmXml({ gia: { VP001: 0, VP002: 8000, VP003: 15000 } }));
  assert.match(context.kiemXuatTuFiles_(zero, cat).errs.join(' '), /giá 0\/trống sẽ đè giá thật/);

  var thieuS = filesVoiDm(dmXml({ gia: gia, sTen: 'Sai' }));
  assert.match(context.kiemXuatTuFiles_(thieuS, cat).errs.join(' '), /thiếu cột Thương Hiệu/);
  var thieuT = filesVoiDm(dmXml({ gia: gia, tTen: '' , boCot: { 19: true } }));
  assert.match(context.kiemXuatTuFiles_(thieuT, cat).errs.join(' '), /thiếu cột Quy Cách/);
});

test('vòng: khóa, khung cấm, dry-run, thứ tự ghi, không đè snapshot nền', function () {
  var goc = moDayDu();
  var excel = clone(goc);
  var sheet = clone(goc);
  datCot(excel, DM, 'VP002', TEN, 'Giay 1222');
  var files = filesVoiDm(dmXml({ gia: giaMacDinh(), s: { VP001: 'TL-EXCEL', VP002: 'TL', VP003: 'TL' } }));
  var filesXuat = filesVoiDm(dmXml({
    gia: giaMacDinh(),
    s: { VP001: 'TU-SHEET', VP002: 'TL', VP003: 'TL' },
    styleS: '7'
  }));
  var pack = { moHinh: excel, files: files };

  var khoa = depsCoBan({ excelPack: pack, sheetMo: sheet, nenMo: clone(goc), lock: false });
  var kq = context.dongBoVong_(khoa, { boQuaLich: true, now: lucSaigon(2026, 10, 24, 9, 0) });
  assert.equal(kq.skipped, true);
  assert.equal(khoa.calls.includes('excelMeta'), false);
  assert.equal(khoa.calls.includes('tryLock'), true);

  var den = depsCoBan({ excelPack: pack, sheetMo: sheet, nenMo: clone(goc) });
  den.excelMeta = function () { throw new Error('khong duoc goi Drive'); };
  kq = context.dongBoVong_(den, { now: lucSaigon(2026, 10, 24, 8, 15) });
  assert.equal(kq.skipped, true);
  assert.match(kq.lyDo, /8:05–8:25/);
  assert.equal(den.calls.includes('tryLock'), false);

  var toi = depsCoBan({
    excelPack: pack,
    sheetMo: sheet,
    nenMo: clone(goc),
    props: { LAST_EXCEL_MD5: 'md5-e', LAST_EXCEL_MODIFIED_TIME: '2026-10-24T05:22:35.000Z', LAST_SHEET_MODIFIED_TIME: '2026-10-24T01:13:18.000Z' }
  });
  kq = context.dongBoVong_(toi, { now: lucSaigon(2026, 10, 24, 23, 0), minBytes: 1 });
  assert.equal(kq.skipped, true);
  assert.match(kq.lyDo, /không đổi/);
  assert.equal(toi.calls.includes('tryLock'), true);
  assert.equal(toi.calls.includes('taiExcel'), false);
  assert.equal(context.dongBoVong_(depsCoBan({
    excelPack: pack,
    sheetMo: sheet,
    props: { LAST_EXCEL_MD5: 'md5-e', LAST_EXCEL_MODIFIED_TIME: '2026-10-24T05:22:35.000Z', LAST_SHEET_MODIFIED_TIME: '2026-10-24T01:13:18.000Z' }
  }), { now: lucSaigon(2026, 10, 24, 8, 30), minBytes: 1 }).skipped, true);

  var dry = depsCoBan({ excelPack: pack, sheetMo: sheet, nenMo: clone(goc), filesXuat: filesXuat });
  kq = context.dongBoVong_(dry, { boQuaLich: true, dryRun: true, minBytes: 1, now: lucSaigon(2026, 10, 24, 9, 0) });
  assert.equal(kq.muc, 'DRY_RUN');
  assert.equal(kq.ghi, false);
  assert.ok(kq.soGhiSheet > 0);
  assert.equal(dry.calls.includes('saoLuu'), false);
  assert.equal(dry.calls.includes('apDung'), false);
  assert.equal(dry.calls.includes('updateExcel'), false);
  assert.equal(dry.calls.includes('ghiNhatKy'), false);

  var propDry = depsCoBan({ excelPack: pack, sheetMo: sheet, nenMo: clone(goc), dryProp: true, filesXuat: filesXuat });
  kq = context.dongBoVong_(propDry, { boQuaLich: true, minBytes: 1 });
  assert.equal(kq.muc, 'DRY_RUN');
  assert.equal(propDry.calls.includes('saoLuu'), false);

  var sai = depsCoBan({
    excelPack: pack,
    excelMeta: { id: 'sai', name: 'khac.xlsx', md5Checksum: 'x' }
  });
  kq = context.dongBoVong_(sai, { boQuaLich: true, minBytes: 1 });
  assert.equal(kq.ok, false);
  assert.match(kq.lyDo, /Excel id/);
  assert.equal(sai.calls.includes('taiExcel'), false);
  assert.equal(sai.calls.includes('updateExcel'), false);

  var xong = depsCoBan({
    excelPack: pack,
    sheetMo: sheet,
    nenMo: clone(goc),
    filesXuat: filesXuat,
    snapshotMeta: { id: context.BASELINE_BACKUP_ID, md5Checksum: 'md5-khac' },
    sheetMetaSau: { id: context.GSHEET_ID, modifiedTime: '2026-10-24T06:05:00.000Z' }
  });
  kq = context.dongBoVong_(xong, { boQuaLich: true, minBytes: 1, now: lucSaigon(2026, 10, 24, 9, 0) });
  assert.equal(kq.ok, true);
  assert.equal(kq.muc, 'DA_GHI');
  assert.equal(kq.ghi, true);
  var thuTu = xong.calls.filter(function (n) { return ['saoLuu', 'apDung', 'ghiNhatKy', 'export', 'updateExcel', 'snapshot'].indexOf(n) >= 0; });
  assert.deepEqual(thuTu, ['saoLuu', 'apDung', 'ghiNhatKy', 'export', 'updateExcel', 'snapshot']);
  assert.equal(xong.snapId, context.BASELINE_BACKUP_ID);
  assert.equal(xong.props.LAST_EXCEL_MD5, 'md5-moi');
  assert.equal(xong.props.LAST_SHEET_MODIFIED_TIME, '2026-10-24T06:05:00.000Z');
  assert.equal(xong.props.LAST_GUARD_JSON, '');
  assert.match(xong.zipFiles['xl/worksheets/sheet2.xml'], /TL-EXCEL/);
  assert.match(xong.zipFiles['xl/worksheets/sheet2.xml'], /s="7"/);
  assert.equal(xong.calls.includes('releaseLock'), true);
  assert.equal(xong.plan.ghiSheet.some(function (o) { return o.giaTri === 'Giay 1222'; }), true);

  var dau = depsCoBan({
    excelPack: pack,
    sheetMo: sheet,
    filesXuat: filesXuat,
    snapshotMeta: { id: context.BASELINE_BACKUP_ID, md5Checksum: 'md5-e' },
    props: {}
  });
  kq = context.dongBoVong_(dau, { boQuaLich: true, minBytes: 1 });
  assert.equal(kq.dayExcel, true);
  assert.equal(dau.calls.includes('taiSnapshot'), false);
  assert.equal(dau.plan.ghiSheet.some(function (o) { return o.giaTri === 'Giay 1222'; }), true);
  assert.equal(dau.plan.ghiSheet.some(function (o) { return o.giaTri === 'But'; }), false);

  var guard = depsCoBan({
    excelPack: pack,
    sheetMo: sheet,
    nenMo: clone(goc),
    filesXuat: filesVoiDm(dmXml({ gia: { VP001: 0, VP002: 8000, VP003: 15000 } })),
    props: { LAST_EXCEL_MD5: 'cu-md5' }
  });
  kq = context.dongBoVong_(guard, { boQuaLich: true, minBytes: 1 });
  assert.equal(kq.ok, false);
  assert.match(kq.lyDo, /đã ghi Sheet nhưng chưa ghi Excel/);
  assert.match(kq.lyDo, /giá 0\/trống sẽ đè giá thật/);
  assert.equal(guard.calls.includes('saoLuu'), true);
  assert.equal(guard.calls.includes('apDung'), true);
  assert.equal(guard.calls.includes('updateExcel'), false);
  assert.equal(guard.props.LAST_EXCEL_MD5, 'cu-md5');

  var huy = depsCoBan({ excelPack: { moHinh: excel, files: files }, sheetMo: sheet, nenMo: clone(goc) });
  var lech = clone(excel);
  lech.sheetNames = lech.sheetNames.slice(0, 12);
  huy.taiExcel = function () { huy.calls.push('taiExcel'); return { moHinh: lech, files: files }; };
  kq = context.dongBoVong_(huy, { boQuaLich: true, minBytes: 1 });
  assert.equal(kq.ok, false);
  assert.match(kq.lyDo, /danh sách sheet lệch/);
  assert.equal(huy.calls.includes('saoLuu'), false);
  assert.equal(huy.calls.includes('ghiNhatKy'), true);
  assert.equal(huy.calls.includes('updateExcel'), false);
});

test('áp dụng bỏ ô công thức và chép công thức sang dòng mới', function () {
  var tieuDe = context.timCauHinh_(DM).tieuDe.slice();
  var forms = tieuDe.map(function () { return ''; });
  var dataForms = tieuDe.map(function () { return ''; });
  dataForms[6] = '=A2+B2';
  var sh = taoSheetNho(DM, [tieuDe, dongVp('VP001', 'But', 12000).map(function (v) {
    return v && v.__cell ? v.v : (v || '');
  })], [forms, dataForms]);
  sh._forms[1][2] = '=IMAGE("a")';
  var ss = { getSheetByName: function (ten) { return ten === DM ? sh : null; } };
  var dem = context.apDungKeHoach_(ss, {
    ghiSheet: [{ tab: DM, row: 2, col: 2, giaTri: 'Khong ghi' }],
    themDong: [{ tab: DM, cells: { 1: 'VP004', 2: 'Moi', 4: 9000 } }],
    xoaDong: []
  });
  assert.equal(dem.boQua, 1);
  assert.equal(sh.getRange(2, 3).getValue(), 'But');
  assert.equal(sh._forms[2][6], '=A3+B3');
  var xoa = taoSheetNho('khac', [
    ['a'], ['b'], ['c'], ['d']
  ]);
  context.apDungKeHoach_({ getSheetByName: function () { return xoa; } }, {
    ghiSheet: [],
    themDong: [],
    xoaDong: [{ tab: 'Đơn Đặt Hàng', row: 4 }, { tab: 'Đơn Đặt Hàng', row: 2 }]
  });
  assert.deepEqual(xoa._deleted, [4, 2]);
});

test('thêm dòng từ Excel vào dòng trống sau dữ liệu, không xuống cuối vùng công thức (VP530/531)', function () {
  var tieuDe = context.timCauHinh_(DM).tieuDe.slice();
  var n = tieuDe.length;
  function hang(vals) { var r = []; var i; for (i = 0; i < n; i++) r.push(vals[i] == null ? '' : vals[i]); return r; }
  function fHang(rr, coMa) {
    var f = []; var i; for (i = 0; i < n; i++) f.push('');
    if (coMa) f[1] = '=IF(C' + rr + '="","","VP"&TEXT(ROW()-1,"000"))';
    f[6] = '=IF($B' + rr + '="","",1)';
    return f;
  }
  var data = [tieuDe, hang(['Bút', 'VP001', 'But', 'Cây', 5500]), hang([]), hang([]), hang([]), hang([])];
  var forms = [tieuDe.map(function () { return ''; }), fHang(2, true), fHang(3, true), fHang(4, false), fHang(5, false), fHang(6, false)];
  var sh = taoSheetNho(DM, data, forms);
  assert.equal(sh.getLastRow(), 6);
  var ss = { getSheetByName: function (ten) { return ten === DM ? sh : null; } };
  context.apDungKeHoach_(ss, {
    ghiSheet: [],
    themDong: [
      { tab: DM, khoa: 'VP002', cells: { 0: 'Dụng cụ VP', 2: 'Dập ghim', 3: 'Cái', 4: 500000 } },
      { tab: DM, khoa: 'VP003', cells: { 0: 'Không đưa lên web', 2: 'Phụ thu', 3: 'PT', 4: 500000 } }
    ],
    xoaDong: []
  });
  assert.equal(sh.getRange(3, 3).getValue(), 'Dập ghim');
  assert.match(sh._forms[2][1], /ROW\(\)-1/);
  assert.equal(sh.getRange(4, 3).getValue(), 'Phụ thu');
  assert.match(sh._forms[3][1], /C4/);
  assert.equal(sh.getRange(7, 3).getValue(), '');
});

test('nhật ký bỏ tab Gemini và trigger chỉ gỡ handler đồng bộ', function () {
  var tabs = {};
  var ss = {
    getSheetByName: function (n) { return tabs[n] || null; },
    insertSheet: function (n) {
      tabs[n] = taoSheetNho(n, [], []);
      return tabs[n];
    }
  };
  context.ghiNhatKy_(ss, {
    modifiedExcel: '2026-10-24T05:22:35.000Z',
    modifiedSheet: '2026-10-24T01:13:18.000Z',
    log: [
      { tab: context.TEN_GEMINI, khoa: 'GEMINI_BI_MAT', cot: 'A', o: 'A2', nguon: 'excel', cu: 'cu', moi: 'GEMINI_BI_MAT', ghiChu: '' },
      { tab: DM, khoa: 'VP001', cot: 'Tên', o: 'C2', nguon: 'excel', cu: 'But', moi: 'But moi', ghiChu: '' }
    ],
    xungDot: [
      { tab: context.TEN_GEMINI, khoa: 'GEMINI_BI_MAT', cot: 'A', excel: 'x', sheet: 'y', ketLuan: 'Sheet thắng' },
      { tab: DM, khoa: 'VP001', cot: GIA, o: 'E2', nen: '1', excel: '2', sheet: '3', ketLuan: 'Sheet thắng' }
    ]
  }, '2026-10-24 12:22:00');
  var logText = JSON.stringify(tabs[context.TEN_LOG]._data);
  var xdText = JSON.stringify(tabs[context.TEN_XUNG_DOT]._data);
  assert.equal(logText.includes('GEMINI_BI_MAT'), false);
  assert.match(logText, /VP001/);
  assert.equal(xdText.includes('GEMINI_BI_MAT'), false);
  assert.match(xdText, /Sheet thắng/);
  assert.match(xdText, /2026-10-24T05:22:35/);

  var deleted = [];
  var created = [];
  var triggers = [
    { getHandlerFunction: function () { return 'dongBoHaiChieu'; } },
    { getHandlerFunction: function () { return 'viecKhac'; } }
  ];
  context.ScriptApp = {
    getProjectTriggers: function () { return triggers.slice(); },
    deleteTrigger: function (t) { deleted.push(t.getHandlerFunction()); },
    newTrigger: function (name) {
      return {
        timeBased: function () {
          return { everyMinutes: function (n) { return { create: function () { created.push(name + ':' + n); } }; } };
        }
      };
    }
  };
  context.goTriggerDongBo();
  assert.deepEqual(deleted, ['dongBoHaiChieu']);
  context.caiTriggerDongBo();
  assert.deepEqual(created, ['dongBoHaiChieu:30']);
  assert.equal(deleted.includes('viecKhac'), false);
});

test('snapshot và bản sao không được trùng file nền hay file giá', function () {
  var store = {};
  var updates = [];
  var copies = [];
  context.PropertiesService = {
    getScriptProperties: function () {
      return {
        getProperty: function (k) { return store[k] || ''; },
        setProperty: function (k, v) { store[k] = String(v); }
      };
    }
  };
  context.Drive = {
    Files: {
      update: function (meta, id) {
        updates.push(id);
        return { id: id, name: meta.name };
      },
      copy: function (meta, id) {
        copies.push({ id: id, name: meta.name });
        return { id: 'snap-moi', name: meta.name };
      }
    }
  };
  var id = context.capNhatSnapshotThat_({}, context.BASELINE_BACKUP_ID);
  assert.equal(id, 'snap-moi');
  assert.equal(store.SNAPSHOT_FILE_ID, 'snap-moi');
  assert.equal(updates.length, 0);
  assert.equal(copies[0].id, context.EXCEL_ID);
  assert.equal(context.capNhatSnapshotThat_({}, 'snap-moi'), 'snap-moi');
  assert.deepEqual(updates, ['snap-moi']);
  assert.throws(function () {
    context.saoChepFile_(context.BASELINE_BACKUP_ID, 'PHIEU BAO GIA VAN PHAT - SNAPSHOT.xlsx');
  }, /không ghi đè bản sao lưu nền/);
  context.Drive.Files.copy = function () { return { id: context.BASELINE_BACKUP_ID, name: 'x' }; };
  assert.throws(function () {
    context.saoChepFile_(context.EXCEL_ID, 'PHIEU BAO GIA VAN PHAT - 2026_BACKUP_x.xlsx');
  }, /bản sao không an toàn/);
  assert.equal(context.idCamGhi_(context.BASELINE_BACKUP_ID), true);
  assert.equal(context.idCamGhi_(context.EXCEL_ID), false);
});

test('mã nguồn không chứa bí mật, không tạo file giá mới, không gọi KiotViet', function () {
  var src = ['Config.gs', 'Xlsx.gs', 'Logic.gs', 'DongBo.gs', 'appsscript.json'].map(function (f) {
    return fs.readFileSync(path.join(root, f), 'utf8');
  }).join('\n');
  assert.equal(src.includes('client_secret'), false);
  assert.equal(src.includes('api.kiotviet'), false);
  assert.equal(src.includes('Drive.Files.create'), false);
  assert.equal(src.includes('funnylams'), false);
  assert.equal(src.includes('1jkmfMIJsoZrDlOxmkqbj44GOsNb1eh3UNk3Tyn0MaJs'), false);
  assert.equal(src.includes('AIza'), false);
  assert.equal(src.includes(context.BASELINE_BACKUP_ID), true);
  assert.equal(context.SHEET_NAMES.length, 13);
  assert.equal(context.timCauHinh_(DM).cotChiExcel.length, 4);
  assert.equal(context.timCauHinh_(DM).viTriExcel['Thương Hiệu'], 18);
  assert.equal(context.timCauHinh_(DM).viTriExcel['Quy Cách'], 19);
  assert.equal(context.HANDLER_DONG_BO, 'dongBoHaiChieu');
});
