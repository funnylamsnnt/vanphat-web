/**
 * Đọc xlsx và chép bù cột Q–T trên Danh Mục Vật Tư.
 * Hàm thuần: không gọi Drive. Test Node nạp file này trực tiếp.
 */

function giaiXml_(s) {
  return String(s)
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function xmlEscape_(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  var m = String(ref || '').toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  var col = 0;
  var i;
  for (i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
  return { col: col - 1, row: parseInt(m[2], 10), ref: m[1] + m[2] };
}

function cotChu_(index0) {
  var n = index0 + 1;
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function theV_(inner) {
  var m = String(inner || '').match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  return m ? m[1] : null;
}

function docCongThuc_(inner) {
  var m = String(inner || '').match(/<f\b[^>]*>([\s\S]*?)<\/f>/);
  return m ? giaiXml_(m[1]) : '';
}

function laCongThucAnh_(formula) {
  return /^\s*=?\s*IMAGE\s*\(/i.test(String(formula || ''));
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

function docGridDayDu_(xml, shared) {
  var grid = {};
  var re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  var m;
  while ((m = re.exec(xml || ''))) {
    var pos = viTriO_(thuocTinh_(m[1], 'r'));
    if (!pos) continue;
    var inner = m[2] || '';
    var formula = docCongThuc_(inner);
    var img = laCongThucAnh_(formula);
    if (!grid[pos.row]) grid[pos.row] = {};
    grid[pos.row][pos.col] = {
      v: docGiaTri_(inner, thuocTinh_(m[1], 't'), shared),
      f: !!formula,
      img: img,
      formula: formula,
      ref: cotChu_(pos.col) + pos.row
    };
  }
  return grid;
}

function danhSachSheetTuTep_(files) {
  var wb = layTep_(files, 'xl/workbook.xml');
  if (!wb) throw new Error('xlsx thiếu xl/workbook.xml');
  var sheets = docSheets_(wb);
  var rels = docRels_(layTep_(files, 'xl/_rels/workbook.xml.rels') || '');
  return sheets.map(function (s) {
    return { name: s.name, path: chuanTarget_(rels[s.rid] || '') };
  });
}

function timTheC_(xml, ref) {
  var needle = 'r="' + ref + '"';
  var from = 0;
  while (from < xml.length) {
    var i = xml.indexOf(needle, from);
    if (i < 0) return null;
    var start = xml.lastIndexOf('<c', i);
    if (start < 0) return null;
    var gt = xml.indexOf('>', start);
    if (gt < 0 || i > gt) {
      from = i + needle.length;
      continue;
    }
    var attrs = xml.slice(start + 2, xml.charAt(gt - 1) === '/' ? gt - 1 : gt);
    if (xml.charAt(gt - 1) === '/') return { start: start, end: gt + 1, attrs: attrs };
    var end = xml.indexOf('</c>', gt);
    if (end < 0) return null;
    return { start: start, end: end + 4, attrs: attrs };
  }
  return null;
}

function theOMoi_(ref, value, attrs) {
  var style = '';
  var sm = String(attrs || '').match(/\ss="[^"]*"/);
  if (sm) style = sm[0];
  if (typeof value === 'number' && isFinite(value)) {
    return '<c r="' + ref + '"' + style + '><v>' + value + '</v></c>';
  }
  if (value == null || value === '') return '<c r="' + ref + '"' + style + '/>';
  return '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEscape_(value) + '</t></is></c>';
}

function chenOVaoHang_(xml, ref, value) {
  var pos = viTriO_(ref);
  if (!pos) return xml;
  var rowRe = new RegExp('<row\\b[^>]*\\sr="' + pos.row + '"[^>]*/?>');
  var m = rowRe.exec(xml);
  if (!m) {
    var sheetData = xml.indexOf('</sheetData>');
    if (sheetData < 0) return xml;
    var row = '<row r="' + pos.row + '">' + theOMoi_(ref, value, '') + '</row>';
    return xml.slice(0, sheetData) + row + xml.slice(sheetData);
  }
  var tag = m[0];
  if (tag.charAt(tag.length - 2) === '/') {
    var mo = tag.slice(0, -2) + '>' + theOMoi_(ref, value, '') + '</row>';
    return xml.slice(0, m.index) + mo + xml.slice(m.index + tag.length);
  }
  var end = xml.indexOf('</row>', m.index);
  if (end < 0) return xml;
  return xml.slice(0, end) + theOMoi_(ref, value, '') + xml.slice(end);
}

function datOXml_(xml, ref, value) {
  var tim = timTheC_(xml, ref);
  if (!tim) return chenOVaoHang_(xml, ref, value);
  return xml.slice(0, tim.start) + theOMoi_(ref, value, tim.attrs) + xml.slice(tim.end);
}

function gridDanhMuc_(files) {
  var ds = danhSachSheetTuTep_(files);
  var shared = docShared_(layTep_(files, 'xl/sharedStrings.xml') || '');
  var i;
  for (i = 0; i < ds.length; i++) {
    if (ds[i].name !== TEN_SHEET_DM) continue;
    var xml = layTep_(files, ds[i].path);
    if (!xml) throw new Error('xlsx thiếu sheet ' + TEN_SHEET_DM);
    return { path: ds[i].path, xml: xml, grid: docGridDayDu_(xml, shared) };
  }
  throw new Error('xlsx thiếu sheet ' + TEN_SHEET_DM);
}

function maTrenDong_(row) {
  if (!row || row[1] == null || row[1].v == null) return '';
  return String(row[1].v).trim();
}

/**
 * Chép cột Q–T từ Excel cũ sang xml bản xuất, theo Mã SP.
 * Không xóa cột. Ô trống trên Excel không xóa ô đã có chữ trên bản xuất.
 */
function noiDungTep_(file) {
  if (file == null) return '';
  if (typeof file === 'string') return file;
  if (typeof file.getDataAsString === 'function') return file.getDataAsString('UTF-8');
  return String(file);
}

function laTepXml_(k) {
  return /\.(xml|rels)$/i.test(k);
}

function chepBuGiuNhiPhan_(mapMoi, mapCu) {
  var strMoi = {};
  var strCu = {};
  Object.keys(mapMoi || {}).forEach(function (k) {
    if (laTepXml_(k)) strMoi[k] = noiDungTep_(mapMoi[k]);
  });
  Object.keys(mapCu || {}).forEach(function (k) {
    if (laTepXml_(k)) strCu[k] = noiDungTep_(mapCu[k]);
  });
  var chep = chepBuQT_(strMoi, strCu);
  var out = {};
  Object.keys(mapMoi || {}).forEach(function (k) { out[k] = mapMoi[k]; });
  Object.keys(chep.files).forEach(function (k) {
    if (chep.files[k] !== strMoi[k]) out[k] = chep.files[k];
  });
  return { files: out, filesXml: chep.files, soO: chep.soO };
}

function chepBuQT_(filesMoi, filesCu) {
  var moi = gridDanhMuc_(filesMoi);
  var cu = gridDanhMuc_(filesCu);
  var theoMa = {};
  Object.keys(cu.grid).forEach(function (rk) {
    var ma = maTrenDong_(cu.grid[rk]);
    if (/^VP\d{3,}$/.test(ma)) theoMa[ma] = cu.grid[rk];
  });
  var headerCu = cu.grid[1] || {};
  var xml = moi.xml;
  var soO = 0;
  var c;
  for (c = 16; c <= 19; c++) {
    if (!headerCu[c] || headerCu[c].v == null || headerCu[c].v === '') continue;
    var refH = cotChu_(c) + '1';
    xml = datOXml_(xml, refH, headerCu[c].v);
    soO++;
  }
  Object.keys(moi.grid).forEach(function (rk) {
    var row = moi.grid[rk];
    var ma = maTrenDong_(row);
    var nguon = theoMa[ma];
    if (!nguon) return;
    var col;
    for (col = 16; col <= 19; col++) {
      var cell = nguon[col];
      if (!cell || cell.f || cell.img) continue;
      if (cell.v == null || cell.v === '') continue;
      xml = datOXml_(xml, cotChu_(col) + rk, cell.v);
      soO++;
    }
  });
  var files = {};
  Object.keys(filesMoi).forEach(function (k) { files[k] = filesMoi[k]; });
  files[moi.path] = xml;
  return { files: files, soO: soO };
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
