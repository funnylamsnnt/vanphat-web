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

var NUMFMT_NGAY_CODE = 'dd/mm/yyyy';
var CHI_SO_STYLE_NGAY = -1;

function nenGhiSerialNgay_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return true;
  return !!(laChuoiDateJs_(value) && ngayTuChuoi_(value));
}

function theOMoi_(ref, value, attrs) {
  var style = '';
  var sm = String(attrs || '').match(/\ss="[^"]*"/);
  if (sm) style = sm[0];
  var ghi = value;
  if (nenGhiSerialNgay_(value)) {
    var so = giaTriGhiExcel_(value);
    if (typeof so === 'number' && isFinite(so)) {
      ghi = so;
      if (CHI_SO_STYLE_NGAY >= 0) style = ' s="' + CHI_SO_STYLE_NGAY + '"';
    }
  }
  if (typeof ghi === 'number' && isFinite(ghi)) {
    return '<c r="' + ref + '"' + style + '><v>' + ghi + '</v></c>';
  }
  if (ghi == null || ghi === '') return '<c r="' + ref + '"' + style + '/>';
  return '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEscape_(ghi) + '</t></is></c>';
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

function datNhieuOXml_(xml, cap) {
  var keys = Object.keys(cap || {});
  if (!keys.length) return xml;
  var refs = {};
  var i;
  for (i = 0; i < keys.length; i++) refs[keys[i]] = true;
  var found = {};
  var re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  var m;
  while ((m = re.exec(xml))) {
    var ref = thuocTinh_(m[1], 'r');
    if (!refs[ref] || found[ref]) continue;
    found[ref] = { start: m.index, end: m.index + m[0].length, attrs: m[1] };
  }
  var co = [];
  var thieu = [];
  for (i = 0; i < keys.length; i++) {
    if (found[keys[i]]) co.push(keys[i]);
    else thieu.push(keys[i]);
  }
  co.sort(function (a, b) { return found[b].start - found[a].start; });
  var out = xml;
  for (i = 0; i < co.length; i++) {
    var refCo = co[i];
    var tim = found[refCo];
    out = out.slice(0, tim.start) + theOMoi_(refCo, cap[refCo], tim.attrs) + out.slice(tim.end);
  }
  for (i = 0; i < thieu.length; i++) out = chenOVaoHang_(out, thieu[i], cap[thieu[i]]);
  return out;
}

function datOXml_(xml, ref, value) {
  var cap = {};
  cap[ref] = value;
  return datNhieuOXml_(xml, cap);
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
  var cap = {};
  var c;
  for (c = 16; c <= 19; c++) {
    if (!headerCu[c] || headerCu[c].v == null || headerCu[c].v === '') continue;
    cap[cotChu_(c) + '1'] = headerCu[c].v;
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
      cap[cotChu_(col) + rk] = cell.v;
      soO++;
    }
  });
  xml = datNhieuOXml_(xml, cap);
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

function timStylesPath_(files) {
  var keys = Object.keys(files || {});
  var i;
  for (i = 0; i < keys.length; i++) {
    if (chuanKey_(keys[i]) === 'xl/styles.xml') return keys[i];
  }
  return '';
}

function chenStyleNgay_(xml) {
  xml = String(xml || '');
  var used = {};
  var reFmt = /<numFmt\b([^>]*)\/?>/g;
  var m;
  var idCo = 0;
  while ((m = reFmt.exec(xml))) {
    var fid = parseInt(thuocTinh_(m[1], 'numFmtId'), 10);
    var code = thuocTinh_(m[1], 'formatCode');
    if (isFinite(fid)) used[fid] = code;
    if (code === NUMFMT_NGAY_CODE && isFinite(fid)) idCo = fid;
  }
  var id = idCo;
  if (!id) {
    id = 176;
    while (used[id]) id++;
    var the = '<numFmt numFmtId="' + id + '" formatCode="' + NUMFMT_NGAY_CODE + '"/>';
    if (/<numFmts\b/.test(xml)) {
      xml = xml.replace(/<numFmts\b([^>]*)>/, function (_, attrs) {
        var count = parseInt(thuocTinh_(attrs, 'count') || '0', 10) + 1;
        var a2 = attrs;
        if (/count="\d+"/.test(a2)) a2 = a2.replace(/count="\d+"/, 'count="' + count + '"');
        else a2 += ' count="' + count + '"';
        if (a2.charAt(0) !== ' ') a2 = ' ' + a2;
        return '<numFmts' + a2 + '>' + the;
      });
    } else if (/<styleSheet\b/.test(xml)) {
      xml = xml.replace(/<styleSheet\b[^>]*>/, function (open) {
        return open + '<numFmts count="1">' + the + '</numFmts>';
      });
    } else {
      xml = '<styleSheet><numFmts count="1">' + the + '</numFmts><cellXfs count="0"></cellXfs></styleSheet>';
    }
  }
  var reBlock = /<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/;
  var block = xml.match(reBlock);
  if (!block) {
    xml = xml.replace(/<\/styleSheet>/, '<cellXfs count="1"><xf numFmtId="' + id + '" applyNumberFormat="1"/></cellXfs></styleSheet>');
    return { xml: xml, index: 0 };
  }
  var inner = block[2];
  var reOne = /<xf\b([^>]*?)\/>|<xf\b([^>]*?)>[\s\S]*?<\/xf>/g;
  var i = 0;
  var found = -1;
  while ((m = reOne.exec(inner))) {
    var at = m[1] != null ? m[1] : (m[2] || '');
    if (parseInt(thuocTinh_(at, 'numFmtId') || '0', 10) === id && thuocTinh_(at, 'applyNumberFormat') === '1') found = i;
    i++;
  }
  if (found >= 0) return { xml: xml, index: found };
  var countXf = i + 1;
  var attrs = block[1] || '';
  if (/count="\d+"/.test(attrs)) attrs = attrs.replace(/count="\d+"/, 'count="' + countXf + '"');
  else attrs += ' count="' + countXf + '"';
  if (attrs.charAt(0) !== ' ') attrs = ' ' + attrs;
  var neu = '<cellXfs' + attrs + '>' + inner + '<xf numFmtId="' + id + '" applyNumberFormat="1"/></cellXfs>';
  xml = xml.replace(reBlock, neu);
  return { xml: xml, index: i };
}

function baoDamDinhDangNgay_(files) {
  var path = timStylesPath_(files);
  var xml = path ? noiDungTep_(layTep_(files, path)) : '';
  if (!xml) {
    path = 'xl/styles.xml';
    xml = '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="1"><xf numFmtId="0"/></cellXfs></styleSheet>';
  }
  var ket = chenStyleNgay_(xml);
  files[path] = ket.xml;
  CHI_SO_STYLE_NGAY = ket.index;
  return ket.index;
}

function suaNgayTrongXml_(xml, shared) {
  return String(xml || '').replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, function (all, attrs, inner) {
    if (inner == null) return all;
    var loai = thuocTinh_(attrs, 't');
    var text = '';
    if (loai === 'inlineStr') text = noiText_(inner);
    else if (loai === 'str') {
      var raw = theV_(inner);
      text = raw == null ? '' : giaiXml_(raw);
    } else if (loai === 's') {
      var rawS = theV_(inner);
      var idx = parseInt(rawS, 10);
      text = shared && shared[idx] != null ? shared[idx] : '';
    } else return all;
    if (!nenGhiSerialNgay_(text)) return all;
    var ref = thuocTinh_(attrs, 'r');
    if (!ref) return all;
    return theOMoi_(ref, text, attrs);
  });
}

/** Đổi ô chữ Date toString trong xlsx thành serial ngày, có numFmt dd/mm/yyyy. */
function chuanHoaNgayXlsx_(files) {
  CHI_SO_STYLE_NGAY = -1;
  if (!files) return 0;
  var keys = Object.keys(files);
  var can = false;
  var i;
  for (i = 0; i < keys.length; i++) {
    if (!/xl\/worksheets\/sheet\d+\.xml$/i.test(chuanKey_(keys[i]))) continue;
    if (/GMT[+-]\d{4}/.test(noiDungTep_(layTep_(files, keys[i])))) { can = true; break; }
  }
  if (!can) return 0;
  baoDamDinhDangNgay_(files);
  var sharedXml = layTep_(files, 'xl/sharedStrings.xml');
  var shared = docShared_(sharedXml ? noiDungTep_(sharedXml) : '');
  var n = 0;
  for (i = 0; i < keys.length; i++) {
    if (!/xl\/worksheets\/sheet\d+\.xml$/i.test(chuanKey_(keys[i]))) continue;
    var cu = noiDungTep_(layTep_(files, keys[i]));
    var moi = suaNgayTrongXml_(cu, shared);
    if (moi !== cu) {
      files[keys[i]] = moi;
      n++;
    }
  }
  return n;
}
