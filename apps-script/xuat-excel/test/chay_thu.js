/**
 * Test guard xuất Excel, lịch, fingerprint và upsert KV.
 *   node --test apps-script/xuat-excel/test/chay_thu.js
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');
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
['Logic.gs', 'KVQueue.gs', 'XuatExcel.gs'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
});

function lucSaigon(y, thang, ngay, gio, phut) {
  return new Date(Date.UTC(y, thang - 1, ngay, gio - 7, phut, 0));
}

function bang(a, b) {
  assert.equal(JSON.stringify(a), JSON.stringify(b));
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cellInline(ref, text) {
  return '<c r="' + ref + '" t="inlineStr"><is><t>' + xmlEscape(text) + '</t></is></c>';
}

function cellNum(ref, n) {
  return '<c r="' + ref + '"><v>' + n + '</v></c>';
}

function cellShared(ref, idx) {
  return '<c r="' + ref + '" t="s"><v>' + idx + '</v></c>';
}

function workbookFiles(sheetNames, dmXml, sharedXml) {
  var sheetsXml = sheetNames.map(function (n, i) {
    return '<sheet name="' + xmlEscape(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
  }).join('');
  var rels = sheetNames.map(function (n, i) {
    return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
  }).join('');
  var files = {
    'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheetsXml + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships>' + rels + '</Relationships>'
  };
  var dmIndex = sheetNames.indexOf('Danh Mục Vật Tư');
  if (dmIndex >= 0) files['xl/worksheets/sheet' + (dmIndex + 1) + '.xml'] = dmXml;
  if (sharedXml) files['xl/sharedStrings.xml'] = sharedXml;
  return files;
}

function headerCells(sTen, tTen) {
  return [
    cellInline('A1', 'Nhóm'),
    cellInline('B1', 'Mã'),
    cellInline('C1', 'Tên'),
    cellInline('E1', 'Đơn giá'),
    cellInline('S1', sTen == null ? 'Thương Hiệu' : sTen),
    cellInline('T1', tTen == null ? 'Quy Cách' : tTen)
  ].join('');
}

function dongVp(stt, gia, ten, s, t) {
  var code = 'VP' + String(stt).padStart(3, '0');
  var row = stt + 1;
  var cells = [
    cellInline('B' + row, code),
    cellInline('C' + row, ten || ('Hang ' + code)),
    cellInline('S' + row, s || 'TL'),
    cellInline('T' + row, t || 'Cái')
  ];
  if (gia !== null && gia !== undefined && gia !== '') cells.push(cellNum('E' + row, gia));
  return cells.join('');
}

function xmlDm(soMa, giaTheoMa, opt) {
  opt = opt || {};
  var rows = ['<row r="1">' + headerCells(opt.sTen, opt.tTen) + '</row>'];
  var i;
  for (i = 1; i <= soMa; i++) {
    var code = 'VP' + String(i).padStart(3, '0');
    var gia = giaTheoMa && Object.prototype.hasOwnProperty.call(giaTheoMa, code) ? giaTheoMa[code] : 10000 + i;
    if (opt.boMa && opt.boMa[code]) continue;
    var stt = i;
    if (opt.maLech && opt.maLech[code]) stt = opt.maLech[code];
    rows.push('<row r="' + (i + 1) + '">' + dongVp(stt, gia, opt.ten && opt.ten[code], opt.s && opt.s[code], opt.t && opt.t[code]) + '</row>');
  }
  if (opt.themXml) rows.push(opt.themXml);
  return '<worksheet><sheetData>' + rows.join('') + '</sheetData></worksheet>';
}

function blobCua(files) {
  return {
    getBytes: function () {
      return { length: 1000000, 0: 0x50, 1: 0x4B };
    },
    _files: files
  };
}

function depsGia(opt) {
  opt = opt || {};
  var props = Object.assign({}, opt.props || {});
  var calls = { update: [], export: 0, download: 0, meta: 0, log: [] };
  return {
    calls: calls,
    props: props,
    gsheetMeta: function () {
      calls.meta++;
      return { id: context.GSHEET_ID, name: 'Gia', modifiedTime: opt.modified || '2026-10-24T01:00:00.000Z' };
    },
    excelMeta: function () {
      return opt.excel || { id: context.EXCEL_ID, name: context.EXPECTED_TITLE, version: '3', md5Checksum: 'abc' };
    },
    exportXlsx: function () {
      calls.export++;
      return opt.blobMoi;
    },
    downloadExcel: function () {
      calls.download++;
      return opt.blobCu;
    },
    unzip: function (blob) { return blob._files; },
    updateExcel: function (blob) {
      calls.update.push(blob);
      if (opt.after) return opt.after;
      return { id: context.EXCEL_ID, name: context.EXPECTED_TITLE, version: '4', md5Checksum: 'def' };
    },
    getProp: function (k) { return props[k] || ''; },
    setProp: function (k, v) { props[k] = String(v); },
    log: function (m) { calls.log.push(m); },
    isDryRun: function () { return !!opt.dryProp; }
  };
}

function bill(ma, extra) {
  var b = {
    code: ma,
    time: '2026-10-24 08:00:00',
    customer: 'Cty A',
    kh_code_v7: 'KH01',
    creator: 'Trang',
    seller: 'Hoàng Anh',
    channel: 'Cửa hàng',
    price_list: 'Lẻ',
    branch: 'Mỹ Gia',
    status: 'Hoàn thành',
    lines: [
      { ma: 'VP001', ten: 'Bấm kim', sl: 2, don_gia: 12000, giam: 0, thanh_tien: 24000 }
    ],
    total_goods: 24000,
    discount: 0,
    customer_must_pay: 24000,
    customer_paid: 24000,
    debt: 0,
    payment_method: 'Tiền mặt',
    payment_note: ''
  };
  Object.keys(extra || {}).forEach(function (k) { b[k] = extra[k]; });
  return b;
}

function taoSheetGia_(name) {
  var data = [];
  var sh = { _writeCount: 0, _data: data, _name: name };
  function ensure(r, c) {
    while (data.length < r) data.push([]);
    while (data[r - 1].length < c) data[r - 1].push('');
  }
  sh.getName = function () { return name; };
  sh.getLastRow = function () {
    var i, j;
    for (i = data.length - 1; i >= 0; i--) {
      for (j = 0; j < data[i].length; j++) {
        if (data[i][j] !== '' && data[i][j] != null) return i + 1;
      }
    }
    return 0;
  };
  sh.getRange = function (r, c, nr, nc) {
    return {
      getValues: function () {
        var out = [];
        var i, j;
        for (i = 0; i < nr; i++) {
          var row = [];
          for (j = 0; j < nc; j++) {
            var rr = data[r - 1 + i];
            row.push(rr && rr[c - 1 + j] != null ? rr[c - 1 + j] : '');
          }
          out.push(row);
        }
        return out;
      },
      setValues: function (v) {
        var i, j;
        for (i = 0; i < v.length; i++) {
          for (j = 0; j < v[i].length; j++) {
            ensure(r + i, c + j);
            data[r - 1 + i][c - 1 + j] = v[i][j];
          }
        }
        sh._writeCount++;
      }
    };
  };
  return sh;
}

function taoSoV7_() {
  var sheets = {};
  var opened = [];
  var ss = {
    getId: function () { return context.V7_ID; },
    getSheetByName: function (n) { return sheets[n] || null; },
    insertSheet: function (n) {
      sheets[n] = taoSheetGia_(n);
      return sheets[n];
    }
  };
  return {
    ss: ss,
    sheets: sheets,
    opened: opened,
    openById: function (id) {
      opened.push(id);
      if (id !== context.V7_ID) throw new Error('sai sổ v7');
      return ss;
    }
  };
}

test('sha256 khớp crypto và fingerprint ổn định', function () {
  ['', 'abc', 'Đã trả|0|Hoàn thành|2'].forEach(function (s) {
    assert.equal(context.sha256Hex_(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'));
  });
  var a = context.fingerprintKV_(1000, 0, 'Hoàn thành', 2);
  var b = context.fingerprintKV_('1000.00', '0', 'Hoàn thành', '2');
  assert.equal(a, b);
  assert.equal(a, context.sha256Hex_('1000|0|Hoàn thành|2'));
  assert.notEqual(a, context.fingerprintKV_(1000, 0, 'Đã hủy', 2));
  assert.notEqual(a, context.fingerprintKV_(1000, 500, 'Hoàn thành', 2));
  assert.notEqual(a, context.fingerprintKV_(1000, 0, 'Hoàn thành', 3));
});

test('lịch 7:33–21:33, loại khung 8:05–8:25 và 14:05–14:25', function () {
  assert.equal(context.gioPhutSaigon_(new Date(Date.UTC(2026, 9, 24, 1, 33, 0))).gio, 8);
  assert.equal(context.gioPhutSaigon_(new Date(Date.UTC(2026, 9, 24, 1, 33, 0))).phut, 33);
  assert.equal(context.dinhDangSaigon_(new Date(Date.UTC(2026, 9, 23, 17, 5, 6))), '2026-10-24 00:05:06');

  function chay(gio, phut) {
    return context.quyetDinhLich_(lucSaigon(2026, 10, 24, gio, phut)).chay;
  }
  [7, 8, 9, 13, 14, 15, 20, 21].forEach(function (g) {
    assert.equal(chay(g, 33), true, 'phải chạy ' + g + ':33');
  });
  assert.equal(chay(7, 26), true);
  assert.equal(chay(21, 45), true);
  assert.equal(chay(8, 26), true);
  assert.equal(chay(14, 26), true);
  assert.equal(chay(6, 33), false);
  assert.equal(chay(22, 33), false);
  assert.equal(chay(7, 25), false);
  assert.equal(chay(21, 46), false);
  assert.equal(chay(9, 5), false);

  [5, 15, 25].forEach(function (p) {
    var q8 = context.quyetDinhLich_(lucSaigon(2026, 10, 24, 8, p));
    var q14 = context.quyetDinhLich_(lucSaigon(2026, 10, 24, 14, p));
    assert.equal(q8.chay, false);
    assert.equal(q14.chay, false);
    assert.match(q8.lyDo, /8:05–8:25/);
    assert.match(q14.lyDo, /14:05–14:25/);
  });
  assert.equal(context.trongKhungLoaiTru_(8, 4), false);
  assert.equal(context.trongKhungLoaiTru_(8, 5), true);
  assert.equal(context.trongKhungLoaiTru_(8, 25), true);
  assert.equal(context.trongKhungLoaiTru_(8, 26), false);
  assert.equal(context.trongKhungLoaiTru_(9, 15), false);
  assert.match(context.quyetDinhLich_(lucSaigon(2026, 10, 24, 8, 4)).lyDo, /ngoài phút :33/);
  assert.match(context.quyetDinhLich_(lucSaigon(2026, 10, 24, 9, 5)).lyDo, /ngoài phút :33/);
  assert.match(context.quyetDinhLich_(lucSaigon(2026, 10, 24, 22, 33)).lyDo, /ngoài giờ 7h–21h/);

  var ke = context.keHoachTrigger_();
  assert.equal(ke.length, 15);
  assert.equal(ke[0].gio, 7);
  assert.equal(ke[14].gio, 21);
  ke.forEach(function (m) {
    assert.equal(m.ham, 'xuatBaoGiaTheoGio');
    assert.equal(m.phut, 33);
  });
});

test('guard: 13 sheet, mã liên tục, giá, cột S và T', function () {
  assert.equal(context.SHEET_NAMES.length, 13);
  assert.equal(context.SHEET_NAMES[1], 'Danh Mục Vật Tư');
  var files = workbookFiles(context.SHEET_NAMES, xmlDm(3));
  var cat = context.docCatalogTuTep_(files);
  bang(cat.sheetNames, context.SHEET_NAMES);
  assert.equal(cat.header[18], 'Thương Hiệu');
  assert.equal(cat.header[19], 'Quy Cách');
  assert.equal(cat.items.VP001.price, 10001);
  assert.equal(cat.items.VP003.name, 'Hang VP003');
  var dat = context.kiemTraXuat_(cat, cat);
  assert.equal(dat.ok, true, dat.errs.join('; '));

  var lechTen = context.SHEET_NAMES.slice();
  lechTen[3] = 'Sheet lạ';
  var thieu = context.kiemTraXuat_(context.docCatalogTuTep_(workbookFiles(lechTen, xmlDm(3))), cat);
  assert.equal(thieu.ok, false);
  assert.match(thieu.errs[0], /danh sách sheet lệch/);

  var muoiHai = context.SHEET_NAMES.slice(0, 12);
  var itSheet = context.kiemTraXuat_(context.docCatalogTuTep_(workbookFiles(muoiHai, xmlDm(3))), cat);
  assert.match(itSheet.errs.join(' '), /danh sách sheet lệch/);

  var them = context.SHEET_NAMES.concat(['Sheet thừa']);
  var du = context.kiemTraXuat_(context.docCatalogTuTep_(workbookFiles(them, xmlDm(3))), cat);
  assert.match(du.errs.join(' '), /danh sách sheet lệch/);

  var dao = context.SHEET_NAMES.slice();
  var tmp = dao[0]; dao[0] = dao[2]; dao[2] = tmp;
  var saiThuTu = context.kiemTraXuat_(context.docCatalogTuTep_(workbookFiles(dao, xmlDm(3))), cat);
  assert.match(saiThuTu.errs.join(' '), /danh sách sheet lệch/);

  var dut = context.docCatalogTuTep_(workbookFiles(context.SHEET_NAMES, xmlDm(4, null, { boMa: { VP002: true } })));
  var loiDut = context.kiemTraXuat_(dut, cat);
  assert.equal(loiDut.ok, false);
  assert.match(loiDut.errs.join(' || '), /mã VP không liên tục/);
  assert.match(loiDut.errs.join(' || '), /mất mã/);

  var gia0 = context.docCatalogTuTep_(workbookFiles(context.SHEET_NAMES, xmlDm(3, { VP002: 0 })));
  var loi0 = context.kiemTraXuat_(gia0, cat);
  assert.match(loi0.errs.join(' '), /giá 0\/trống sẽ đè giá thật/);
  assert.match(loi0.errs.join(' '), /VP002/);

  var giaTrong = context.docCatalogTuTep_(workbookFiles(context.SHEET_NAMES, xmlDm(3, { VP001: '' })));
  assert.match(context.kiemTraXuat_(giaTrong, cat).errs.join(' '), /VP001/);

  var giaChu = JSON.parse(JSON.stringify(cat));
  giaChu.items = Object.assign({}, cat.items);
  giaChu.items.VP001 = Object.assign({}, cat.items.VP001, { price: '0' });
  assert.match(context.kiemTraXuat_(giaChu, cat).errs.join(' '), /VP001/);

  var giam = context.docCatalogTuTep_(workbookFiles(context.SHEET_NAMES, xmlDm(3, { VP001: 8000 })));
  var choPhep = context.kiemTraXuat_(giam, cat);
  assert.equal(choPhep.ok, true, choPhep.errs.join('; '));
  assert.match(choPhep.notes[0], /khác .*giá 1/);

  var cu0 = JSON.parse(JSON.stringify(cat));
  cu0.items = Object.assign({}, cat.items);
  cu0.items.VP003 = Object.assign({}, cat.items.VP003, { price: 0 });
  var moi0 = context.docCatalogTuTep_(workbookFiles(context.SHEET_NAMES, xmlDm(3, { VP003: 0 })));
  assert.equal(context.kiemTraXuat_(moi0, cu0).ok, true);

  var thieuS = context.docCatalogTuTep_(workbookFiles(context.SHEET_NAMES, xmlDm(3, null, { sTen: 'Ghi chú' })));
  assert.match(context.kiemTraXuat_(thieuS, cat).errs.join(' '), /Thiếu cột Thương Hiệu|thiếu cột Thương Hiệu/);
  var thieuT = context.docCatalogTuTep_(workbookFiles(context.SHEET_NAMES, xmlDm(3, null, { tTen: '' })));
  assert.match(context.kiemTraXuat_(thieuT, cat).errs.join(' '), /Quy Cách/);

  var shared = '<sst><si><t>Thương Hiệu</t></si><si><t>Quy Cách</t></si><si><t>VP010</t></si></sst>';
  var dmShared = '<worksheet><sheetData><row r="1">' +
    cellShared('S1', 0) + cellShared('T1', 1) +
    '</row><row r="11">' + cellShared('B11', 2) + cellNum('E11', 5000) + '</row></sheetData></worksheet>';
  var catS = context.docCatalogTuTep_(workbookFiles(context.SHEET_NAMES, dmShared, shared));
  assert.equal(catS.header[18], 'Thương Hiệu');
  assert.equal(catS.items.VP010.price, 5000);

  var dmF = '<worksheet><sheetData><row r="1">' + headerCells() + '</row><row r="2">' +
    '<c r="B2"><f>ROW()-1</f><v>VP001</v></c>' + cellNum('E2', 0) + cellInline('S2', 'TL') + cellInline('T2', 'Cái') +
    '</row></sheetData></worksheet>';
  var catF = context.docCatalogTuTep_(workbookFiles(context.SHEET_NAMES, dmF));
  assert.equal(catF.items.VP001.price, 0);
  var cuGia = { sheetNames: context.SHEET_NAMES, header: catF.header, items: { VP001: { name: null, price: 5000, S: 'TL', T: 'Cái' } } };
  assert.match(context.kiemTraXuat_(catF, cuGia).errs.join(' '), /giá 0\/trống/);
});

test('vòng xuất: bỏ qua khi không đổi, không ghi khi guard trượt, dry-run, ghi đúng id', function () {
  var files = workbookFiles(context.SHEET_NAMES, xmlDm(3));
  var dep = depsGia({
    blobMoi: blobCua(files),
    blobCu: blobCua(files),
    modified: 'm2',
    props: { LAST_SHEET_MODIFIED_TIME: 'm2', LAST_GUARD_JSON: 'cu' }
  });
  var bo = context.xuatBaoGiaVong_(dep, { minBytes: 4 });
  assert.equal(bo.skipped, true);
  assert.equal(bo.ghi, false);
  assert.equal(dep.calls.export, 0);
  assert.equal(dep.calls.update.length, 0);
  assert.equal(dep.props.LAST_GUARD_JSON, 'cu');
  assert.match(dep.calls.log.join('\n'), /không đổi/);

  var files0 = workbookFiles(context.SHEET_NAMES, xmlDm(3, { VP001: 0 }));
  var dep0 = depsGia({ blobMoi: blobCua(files0), blobCu: blobCua(files), modified: 'm3', props: { LAST_SHEET_MODIFIED_TIME: 'm2' } });
  var chan = context.xuatBaoGiaVong_(dep0, { minBytes: 4 });
  assert.equal(chan.ok, false);
  assert.equal(chan.ghi, false);
  assert.equal(dep0.calls.update.length, 0);
  assert.match(dep0.props.LAST_GUARD_JSON, /giá 0\/trống/);
  assert.match(dep0.props.LAST_RUN_JSON, /KHONG_GHI/);

  var depDry = depsGia({ blobMoi: blobCua(files), blobCu: blobCua(files), modified: 'm3' });
  var dry = context.xuatBaoGiaVong_(depDry, { minBytes: 4, dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.ghi, false);
  assert.equal(depDry.calls.update.length, 0);
  assert.match(depDry.props.LAST_RUN_JSON, /DRY_RUN/);

  var depProp = depsGia({ blobMoi: blobCua(files), blobCu: blobCua(files), modified: 'm3', dryProp: true });
  var dry2 = context.xuatBaoGiaVong_(depProp, { minBytes: 4, dryRun: false });
  assert.equal(dry2.dryRun, true);
  assert.equal(depProp.calls.update.length, 0);

  var blobGhi = blobCua(files);
  var depOk = depsGia({ blobMoi: blobGhi, blobCu: blobCua(files), modified: 'm3', props: { LAST_GUARD_JSON: 'cu' } });
  var ghi = context.xuatBaoGiaVong_(depOk, { minBytes: 4 });
  assert.equal(ghi.exported, true);
  assert.equal(ghi.ghi, true);
  assert.equal(depOk.calls.update.length, 1);
  assert.equal(depOk.calls.update[0], blobGhi);
  assert.equal(depOk.props.LAST_SHEET_MODIFIED_TIME, 'm3');
  assert.equal(depOk.props.LAST_EXCEL_VERSION, '4');
  assert.equal(depOk.props.LAST_GUARD_JSON, '');

  var depSai = depsGia({
    blobMoi: blobCua(files),
    blobCu: blobCua(files),
    excel: { id: 'khac', name: 'sai.xlsx', version: '1' }
  });
  var saiId = context.xuatBaoGiaVong_(depSai, { minBytes: 4 });
  assert.equal(saiId.ghi, false);
  assert.equal(depSai.calls.export, 0);
  assert.match(saiId.errs[0], /Excel id\/tên sai/);

  var depNho = depsGia({
    blobMoi: { getBytes: function () { return { length: 10, 0: 0x50, 1: 0x4B }; }, _files: files },
    blobCu: blobCua(files)
  });
  var nho = context.xuatBaoGiaVong_(depNho, {});
  assert.match(nho.errs[0], /không phải xlsx hợp lệ/);
  assert.equal(depNho.calls.update.length, 0);

  var depHong = depsGia({
    blobMoi: blobCua({ 'xl/workbook.xml': '<workbook></workbook>' }),
    blobCu: blobCua(files),
    modified: 'm9'
  });
  var hong = context.xuatBaoGiaVong_(depHong, { minBytes: 4 });
  assert.equal(hong.ghi, false);
  assert.equal(depHong.calls.update.length, 0);

  assert.throws(function () {
    context.xuatBaoGiaVong_(depsGia({
      blobMoi: blobCua(files),
      blobCu: blobCua(files),
      modified: 'm3',
      after: { id: 'file-moi', name: context.EXPECTED_TITLE, version: '9' }
    }), { minBytes: 4 });
  }, /id\/tên sau khi ghi sai/);

  var pk = { length: 8, 0: 0x50, 1: 0x4B };
  assert.equal(context.laXlsxBlob_(pk), false);
  assert.equal(context.laXlsxBlob_({ length: 1000000, 0: 0x50, 1: 0x4B }), true);
  assert.equal(context.laXlsxBlob_({ length: 1000000, 0: 1, 1: 2 }), false);
  assert.equal(context.byteAt_([-80], 0), 176);
});

test('trigger giờ loại trừ không đụng Drive; đúng giờ thì đi tiếp', function () {
  var files = workbookFiles(context.SHEET_NAMES, xmlDm(2));
  var dep = depsGia({ blobMoi: blobCua(files), blobCu: blobCua(files), props: { LAST_GUARD_JSON: 'giu' } });
  var bo = context.xuatBaoGiaTheoGioVong_(dep, lucSaigon(2026, 10, 24, 8, 15));
  assert.equal(bo.skipped, true);
  assert.equal(dep.calls.meta, 0);
  assert.equal(dep.calls.export, 0);
  assert.equal(dep.calls.update.length, 0);
  assert.equal(dep.props.LAST_GUARD_JSON, 'giu');
  assert.match(dep.props.LAST_RUN_JSON, /8:05–8:25/);

  var dep14 = depsGia({ blobMoi: blobCua(files), blobCu: blobCua(files) });
  var bo14 = context.xuatBaoGiaTheoGioVong_(dep14, lucSaigon(2026, 10, 24, 14, 20));
  assert.match(bo14.lyDo, /14:05–14:25/);
  assert.equal(dep14.calls.meta, 0);

  var depOk = depsGia({ blobMoi: blobCua(files), blobCu: blobCua(files), modified: 'm5' });
  var chay = context.xuatBaoGiaTheoGioVong_(depOk, lucSaigon(2026, 10, 24, 9, 33));
  assert.equal(chay.exported, true);
  assert.equal(depOk.calls.update.length, 1);

  var depSom = depsGia({ blobMoi: blobCua(files), blobCu: blobCua(files) });
  var som = context.xuatBaoGiaTheoGioVong_(depSom, lucSaigon(2026, 10, 24, 6, 33));
  assert.equal(som.skipped, true);
  assert.equal(depSom.calls.meta, 0);
});

test('cài và gỡ trigger không đụng handler khác', function () {
  var items = [{ handler: 'quetChungTuMoi', hour: null, minute: null }];
  context.ScriptApp = {
    newTrigger: function (name) {
      var spec = { handler: name, hour: null, minute: null, everyDays: false };
      var tb = {
        atHour: function (h) { spec.hour = h; return tb; },
        nearMinute: function (m) { spec.minute = m; return tb; },
        everyDays: function () { spec.everyDays = true; return tb; },
        create: function () { items.push(spec); return spec; }
      };
      return { timeBased: function () { return tb; } };
    },
    getProjectTriggers: function () {
      return items.map(function (t) {
        return { getHandlerFunction: function () { return t.handler; }, _spec: t };
      });
    },
    deleteTrigger: function (tr) {
      var at = items.indexOf(tr._spec);
      if (at >= 0) items.splice(at, 1);
    }
  };
  var bao = context.caiTriggerXuatBaoGia();
  assert.match(bao, /15 trigger/);
  var xuat = items.filter(function (t) { return t.handler === 'xuatBaoGiaTheoGio'; });
  assert.equal(xuat.length, 15);
  assert.equal(xuat[0].hour, 7);
  assert.equal(xuat[14].hour, 21);
  xuat.forEach(function (t) {
    assert.equal(t.minute, 33);
    assert.equal(t.everyDays, true);
  });
  assert.equal(items.some(function (t) { return t.handler === 'quetChungTuMoi'; }), true);
  context.goTriggerXuatBaoGia();
  assert.equal(items.some(function (t) { return t.handler === 'xuatBaoGiaTheoGio'; }), false);
  assert.equal(items.some(function (t) { return t.handler === 'quetChungTuMoi'; }), true);
});

test('Drive.Files.update giữ đúng file id, không tạo file mới', function () {
  var daGoi = [];
  context.Drive = {
    Files: {
      update: function (meta, id, blob, params) {
        daGoi.push({ meta: meta, id: id, blob: blob, params: params });
        return { id: id, name: meta.name, md5Checksum: 'zz', version: '8', size: '10' };
      },
      create: function () { throw new Error('không được tạo file'); },
      copy: function () { throw new Error('không được copy file'); }
    }
  };
  var blob = { ten: 'blob-xuat' };
  var r = context.ghiExcelCungId_(blob);
  assert.equal(daGoi.length, 1);
  assert.equal(daGoi[0].id, context.EXCEL_ID);
  assert.equal(daGoi[0].meta.name, 'PHIEU BAO GIA VAN PHAT - 2026.xlsx');
  assert.equal(daGoi[0].meta.mimeType, context.XLSX_MIME);
  assert.equal(daGoi[0].blob, blob);
  assert.equal(r.id, context.EXCEL_ID);
  assert.equal(daGoi[0].params.supportsAllDrives, true);

  context.Drive.Files.update = function (meta, id) {
    return { id: 'id-khac', name: meta.name };
  };
  assert.throws(function () { context.ghiExcelCungId_(blob); }, /id\/tên sau khi ghi sai/);

  var src = fs.readFileSync(path.join(root, 'XuatExcel.gs'), 'utf8');
  assert.match(src, /Drive\.Files\.update/);
  assert.equal(/Drive\.Files\.create/.test(src), false);
  assert.equal(/Drive\.Files\.copy/.test(src), false);
  assert.match(src, /GSHEET_ID \+[\s\S]*\/export\?mimeType=/);
  var kv = fs.readFileSync(path.join(root, 'KVQueue.gs'), 'utf8');
  var logic = fs.readFileSync(path.join(root, 'Logic.gs'), 'utf8');
  assert.equal(/client_secret|CLIENT_SECRET|refresh_token|SYNC_TOKEN/.test(src + kv + logic), false);
});

test('KV_Queue: tạo cột, upsert, fingerprint, không dòng trùng', function () {
  var so = taoSoV7_();
  context.SpreadsheetApp = { openById: so.openById };
  var tao = context.taoTabKVQueue();
  assert.match(tao, /KV_Queue/);
  bang(so.opened, [context.V7_ID]);
  var sh = so.sheets.KV_Queue;
  assert.equal(JSON.stringify(sh._data[0]), JSON.stringify(context.COT_KV));
  var writeSauHeader = sh._writeCount;
  context.taoTabKVQueue();
  assert.equal(sh._writeCount, writeSauHeader);
  assert.equal(Object.keys(so.sheets).length, 1);

  var luc1 = new Date(Date.UTC(2026, 9, 23, 17, 5, 6));
  var b1 = bill('HD001');
  var kq = context.upsertHangDoiKV_(so.ss, [b1], luc1);
  bang(kq.added, ['HD001']);
  assert.equal(kq.skipped.length, 0);
  assert.equal(sh.getLastRow(), 2);
  var dong = sh._data[1];
  assert.equal(dong[0], 'HD001');
  assert.equal(dong[2], 'KH01');
  assert.equal(dong[3], 'Cty A');
  assert.equal(dong[4], 'Hoàn thành');
  assert.equal(dong[5], 24000);
  assert.equal(dong[6], 24000);
  assert.equal(dong[7], 0);
  assert.equal(dong[8], 'Tiền mặt');
  assert.equal(dong[9], 1);
  assert.equal(dong[12], '2026-10-24 00:05:06');
  assert.equal(dong[13], '');
  var fp = dong[11];
  assert.equal(fp, context.fingerprintKV_(24000, 24000, 'Hoàn thành', 1));
  var json = JSON.parse(dong[10]);
  assert.equal(json.creator, 'Trang');
  assert.equal(json.lines[0].ma, 'VP001');
  assert.equal(json.payment_note, '');

  dong[13] = 'TRUE';
  var truoc = sh._writeCount;
  var jsonCu = dong[10];
  var doiDong = bill('HD001', {
    lines: [{ ma: 'VP009', ten: 'Bút khác', sl: 2, don_gia: 12000, giam: 0, thanh_tien: 24000 }]
  });
  var kq2 = context.upsertHangDoiKV_(so.ss, [doiDong], new Date(Date.UTC(2026, 9, 24, 2, 0, 0)));
  bang(kq2.skipped, ['HD001']);
  assert.equal(kq2.ghi, false);
  assert.equal(sh._writeCount, truoc);
  assert.equal(sh.getLastRow(), 2);
  assert.equal(sh._data[1][13], 'TRUE');
  assert.equal(sh._data[1][10], jsonCu);
  assert.equal(sh._data[1][12], '2026-10-24 00:05:06');

  var luc2 = new Date(Date.UTC(2026, 9, 24, 3, 33, 0));
  var doiTien = bill('HD001', { customer_paid: 0, debt: 24000, status: 'Còn nợ' });
  var kq3 = context.upsertHangDoiKV_(so.ss, [doiTien], luc2);
  bang(kq3.updated, ['HD001']);
  assert.equal(kq3.added.length, 0);
  assert.equal(sh.getLastRow(), 2);
  assert.equal(sh._data[1][4], 'Còn nợ');
  assert.equal(sh._data[1][6], 0);
  assert.equal(sh._data[1][7], 24000);
  assert.equal(sh._data[1][13], '');
  assert.equal(sh._data[1][12], '2026-10-24 10:33:00');
  assert.notEqual(sh._data[1][11], fp);
  assert.equal(sh._data.length, 2);

  var kq4 = context.upsertHangDoiKV_(so.ss, [bill('HD002'), bill('HD002', { status: 'Đã hủy' })], luc2);
  bang(kq4.added, ['HD002']);
  bang(kq4.updated, ['HD002']);
  assert.equal(sh.getLastRow(), 3);
  assert.equal(sh._data[2][0], 'HD002');
  assert.equal(sh._data[2][4], 'Đã hủy');
  var ma = sh._data.map(function (r) { return r[0]; });
  assert.equal(ma.filter(function (x) { return x === 'HD002'; }).length, 1);

  assert.throws(function () { context.upsertHangDoiKV_(so.ss, [{ customer: 'thiếu mã' }], luc2); }, /thiếu mã hóa đơn/);
  assert.equal(sh.getLastRow(), 3);

  var rong = context.upsertHangDoiKV_(so.ss, [], luc2);
  assert.equal(rong.ghi, false);

  assert.throws(function () { context.fetchKiotViet(); }, /đang chờ API KiotViet/);
  var writeTruoc = sh._writeCount;
  assert.throws(function () { context.dongBoTuKiotViet(); }, /đang chờ API KiotViet/);
  assert.equal(sh._writeCount, writeTruoc);
  assert.equal(sh.getLastRow(), 3);
});
