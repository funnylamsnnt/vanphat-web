/**
 * Hàm thuần: lịch 15 phút, guard xuất, gộp 3 bên.
 * Không gọi Drive, SpreadsheetApp hay UrlFetch.
 */

function haiSo_(n) {
  return (n < 10 ? '0' : '') + n;
}

function gioPhutSaigon_(date) {
  var t = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return {
    nam: t.getUTCFullYear(),
    thang: t.getUTCMonth() + 1,
    ngay: t.getUTCDate(),
    gio: t.getUTCHours(),
    phut: t.getUTCMinutes(),
    giay: t.getUTCSeconds()
  };
}

function dinhDangSaigon_(date) {
  var hm = gioPhutSaigon_(date);
  return hm.nam + '-' + haiSo_(hm.thang) + '-' + haiSo_(hm.ngay) + ' ' +
    haiSo_(hm.gio) + ':' + haiSo_(hm.phut) + ':' + haiSo_(hm.giay);
}

function trongKhungLoaiTru_(gio, phut) {
  if (phut < 5 || phut > 40) return false;
  return gio === 8 || gio === 14;
}

/** Trigger mỗi 15 phút. Chỉ dừng trong 8:05–8:40 và 14:05–14:40 (giờ Việt Nam). */
function quyetDinhLich15_(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return { chay: false, lyDo: 'mốc giờ không hợp lệ' };
  }
  var hm = gioPhutSaigon_(date);
  var chu = hm.gio + ':' + haiSo_(hm.phut);
  if (trongKhungLoaiTru_(hm.gio, hm.phut)) {
    var khung = hm.gio === 8 ? '8:05–8:40' : '14:05–14:40';
    return { chay: false, lyDo: 'bỏ qua khung đồng bộ ' + khung + ' (giờ Việt Nam ' + chu + ')', gio: hm.gio, phut: hm.phut };
  }
  return { chay: true, lyDo: 'chạy lúc ' + chu, gio: hm.gio, phut: hm.phut };
}

function chuanTieuDe_(s) {
  var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return t.replace(/đ/g, 'd');
}

function chuanSoChuoi_(n) {
  if (!isFinite(n)) return '';
  if (n === 0) return '0';
  var s = n.toFixed(6);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

function chuanGiaTri_(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number' && isFinite(v)) return chuanSoChuoi_(v);
  if (v instanceof Date) return dinhDangSaigon_(v);
  var s = String(v).trim();
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s)) {
    if (/^-?0\d/.test(s)) return s;
    var nguyen = s.replace('-', '').split('.')[0];
    if (nguyen.length > 15) return s;
    return chuanSoChuoi_(Number(s));
  }
  return s;
}

function cungGiaTri_(a, b) {
  return chuanGiaTri_(a) === chuanGiaTri_(b);
}

function catChuoi_(v, n) {
  var s = v == null ? '' : String(v);
  n = n || 180;
  if (s.length > n) s = s.slice(0, n);
  return s;
}

function cungDanhSach_(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  var i;
  for (i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function soVp_(code) {
  return parseInt(String(code).slice(2), 10);
}

function soSanhVp_(a, b) {
  return soVp_(a) - soVp_(b);
}

/**
 * Ô chỉ một bên đổi thì lấy bên đó.
 * Cùng ô cả hai bên đổi khác nhau: Sheet thắng.
 * Hai bên đổi thành cùng một giá trị: giữ.
 */
function quyetDinhO_(base, excel, sheet) {
  var eDoi = !cungGiaTri_(excel, base);
  var sDoi = !cungGiaTri_(sheet, base);
  if (!eDoi && !sDoi) return 'giu';
  if (eDoi && !sDoi) return 'excel';
  if (sDoi && !eDoi) return 'sheet';
  if (cungGiaTri_(excel, sheet)) return 'giu';
  return 'xung-dot';
}

function giaO_(cell) {
  if (!cell) return '';
  return cell.v == null ? '' : cell.v;
}

function laGiaThat_(v) {
  if (typeof v === 'number' && isFinite(v)) return v > 0;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) {
    var n = Number(v);
    return isFinite(n) && n > 0;
  }
  return false;
}

function laBoQuaO_(cell) {
  return !!(cell && (cell.f || cell.img));
}

function headerTuGrid_(grid) {
  var dong = [];
  var maxRow = 0;
  Object.keys(grid || {}).forEach(function (rk) {
    var r = +rk;
    if (r > maxRow) maxRow = r;
  });
  var gioi = Math.min(maxRow || 1, 30);
  var r;
  for (r = 1; r <= gioi; r++) dong.push(grid[r] || {});
  return dong;
}

function timHangTieuDe_(grid, tenCan) {
  var can = (tenCan || []).map(chuanTieuDe_);
  var rows = headerTuGrid_(grid);
  var best = null;
  var r;
  for (r = 0; r < rows.length; r++) {
    var col = {};
    var headers = [];
    var max = -1;
    Object.keys(rows[r]).forEach(function (ck) {
      var n = +ck;
      if (n > max) max = n;
    });
    var c;
    for (c = 0; c <= max; c++) {
      var raw = rows[r][c] && rows[r][c].v != null ? String(rows[r][c].v) : '';
      headers.push(raw.replace(/\s+/g, ' ').trim());
      var key = chuanTieuDe_(raw);
      if (key && col[key] == null) col[key] = c;
    }
    var du = 0;
    var i;
    for (i = 0; i < can.length; i++) if (col[can[i]] != null) du++;
    if (!best || du > best.du) best = { row: r + 1, headers: headers, col: col, du: du };
    if (du === can.length && can.length) return best;
  }
  return best || { row: 1, headers: [], col: {}, du: 0 };
}

function thieuTen_(colMap, ds) {
  var thieu = [];
  (ds || []).forEach(function (ten) {
    if (colMap[chuanTieuDe_(ten)] == null) thieu.push(ten);
  });
  return thieu;
}

function khoaTuDong_(cells, cfg, colMap) {
  var tenKhoa = cfg.khoa || [];
  var parts = [];
  var i;
  var trong = true;
  for (i = 0; i < tenKhoa.length; i++) {
    var idx = colMap[chuanTieuDe_(tenKhoa[i])];
    var v = idx == null ? '' : chuanGiaTri_(giaO_(cells[idx]));
    if (v) trong = false;
    parts.push(v);
  }
  if (trong && cfg.khoaPhu && cfg.khoaPhu.length) {
    parts = [];
    trong = true;
    for (i = 0; i < cfg.khoaPhu.length; i++) {
      var idx2 = colMap[chuanTieuDe_(cfg.khoaPhu[i])];
      var v2 = idx2 == null ? '' : chuanGiaTri_(giaO_(cells[idx2]));
      if (v2) trong = false;
      parts.push(v2);
    }
  }
  if (trong) return '';
  return parts.join('|');
}

function hangTheoKhoa_(grid, header, cfg) {
  var rows = {};
  var thuTu = {};
  Object.keys(grid || {}).forEach(function (rk) {
    var r = +rk;
    if (r <= header.row) return;
    var khoa = khoaTuDong_(grid[r], cfg, header.col);
    if (!khoa) return;
    thuTu[khoa] = (thuTu[khoa] || 0) + 1;
    var key = thuTu[khoa] === 1 ? khoa : khoa + '#' + thuTu[khoa];
    rows[key] = { row: r, cells: grid[r] };
  });
  return rows;
}

function oTuGrid_(grid) {
  var o = {};
  Object.keys(grid || {}).forEach(function (rk) {
    var row = grid[rk];
    Object.keys(row).forEach(function (ck) {
      var cell = row[ck];
      if (!cell) return;
      o[cell.ref] = {
        v: cell.v,
        f: cell.f,
        img: cell.img,
        formula: cell.formula,
        row: +rk,
        col: +ck
      };
    });
  });
  return o;
}

function moHinhTuGrid_(sheetNames, grids, pathsIgnored) {
  var sheets = {};
  var loi = [];
  (sheetNames || []).forEach(function (ten) {
    var cfg = timCauHinh_(ten);
    if (!cfg || cfg.cheDo === 'cam') {
      sheets[ten] = { cheDo: 'cam' };
      return;
    }
    if (cfg.cheDo === 'cong-thuc') {
      sheets[ten] = { cheDo: 'cong-thuc' };
      return;
    }
    var grid = grids[ten] || {};
    if (cfg.cheDo === 'o') {
      sheets[ten] = { cheDo: 'o', o: oTuGrid_(grid) };
      return;
    }
    var can = (cfg.batBuocExcel || cfg.batBuocSheet || cfg.khoa || []).slice();
    var header = timHangTieuDe_(grid, can.length ? can : (cfg.tieuDe || []));
    var thieu = thieuTen_(header.col, can);
    sheets[ten] = {
      cheDo: 'khoa',
      headerRow: header.row,
      headers: header.headers,
      col: header.col,
      rows: hangTheoKhoa_(grid, header, cfg),
      loi: thieu.length ? 'thiếu tiêu đề ' + thieu.join(', ') : ''
    };
    if (thieu.length) loi.push(ten + ': thiếu tiêu đề ' + thieu.join(', '));
  });
  return { sheetNames: sheetNames.slice(), sheets: sheets, loi: loi };
}

function moHinhTuTep_(files) {
  if (!files) throw new Error('thiếu tệp xlsx');
  var ds = danhSachSheetTuTep_(files);
  var shared = docShared_(layTep_(files, 'xl/sharedStrings.xml') || '');
  var names = ds.map(function (s) { return s.name; });
  var grids = {};
  var i;
  for (i = 0; i < ds.length; i++) {
    var cfg = timCauHinh_(ds[i].name);
    if (!cfg || cfg.cheDo === 'cam' || cfg.cheDo === 'cong-thuc') continue;
    var xml = layTep_(files, ds[i].path);
    if (!xml) throw new Error('xlsx thiếu sheet ' + ds[i].name);
    grids[ds[i].name] = docGridDayDu_(xml, shared);
  }
  return moHinhTuGrid_(names, grids);
}

function moHinhTuBang_(ten, values, formulas, cfg) {
  var grid = {};
  var r;
  var c;
  values = values || [];
  formulas = formulas || [];
  for (r = 0; r < values.length; r++) {
    for (c = 0; c < (values[r] || []).length; c++) {
      var f = formulas[r] && formulas[r][c] ? String(formulas[r][c]) : '';
      if ((values[r][c] == null || values[r][c] === '') && !f) continue;
      if (!grid[r + 1]) grid[r + 1] = {};
      grid[r + 1][c] = {
        v: values[r][c],
        f: !!f,
        img: laCongThucAnh_(f),
        formula: f,
        ref: cotChu_(c) + (r + 1)
      };
    }
  }
  var names = [ten];
  var model = moHinhTuGrid_(names, {});
  model.sheets[ten] = moHinhTuGrid_([ten], (function () { var g = {}; g[ten] = grid; return g; })()).sheets[ten];
  return model.sheets[ten];
}

function kiemViTri_(headers, viTri) {
  var loi = [];
  Object.keys(viTri || {}).forEach(function (ten) {
    var idx = viTri[ten];
    var co = headers && headers.length > idx && chuanTieuDe_(headers[idx]) === chuanTieuDe_(ten);
    if (!co) loi.push(ten + ' không ở cột ' + cotChu_(idx));
  });
  return loi;
}

function cotDongBo_(cfg, colMap) {
  var bo = {};
  (cfg.cotCongThuc || []).forEach(function (ten) { bo[chuanTieuDe_(ten)] = true; });
  (cfg.cotChiExcel || []).forEach(function (ten) { bo[chuanTieuDe_(ten)] = true; });
  (cfg.khoa || []).forEach(function (ten) { bo[chuanTieuDe_(ten)] = true; });
  (cfg.khoaPhu || []).forEach(function (ten) { bo[chuanTieuDe_(ten)] = true; });
  var ds = [];
  Object.keys(colMap || {}).forEach(function (key) {
    if (bo[key]) return;
    ds.push(colMap[key]);
  });
  ds.sort(function (a, b) { return a - b; });
  return ds;
}

function tenCotTheoIndex_(headers, idx) {
  if (!headers || headers[idx] == null || headers[idx] === '') return cotChu_(idx);
  return String(headers[idx]).replace(/\s+/g, ' ').trim();
}

function thatBai_(lyDo) {
  return {
    ok: false,
    dung: true,
    lyDo: lyDo,
    errs: [lyDo],
    ghiSheet: [],
    themDong: [],
    xoaDong: [],
    xungDot: [],
    log: [{ tab: '', khoa: '', cot: '', o: '', nguon: 'dung', cu: '', moi: '', ghiChu: catChuoi_(lyDo, 500) }],
    canXuat: false,
    notes: []
  };
}

function kiemTraXuat_(moi, cu) {
  var errs = [];
  var notes = [];
  moi = moi || { sheetNames: [], header: [], items: {} };
  cu = cu || { sheetNames: [], header: [], items: {} };
  if (!cungDanhSach_(moi.sheetNames, SHEET_NAMES)) {
    errs.push('danh sách sheet lệch: ' + (moi.sheetNames || []).join(' | '));
  }
  var codes = Object.keys(moi.items || {}).sort(soSanhVp_);
  var cuoi = codes.length ? codes[codes.length - 1] : 'không có';
  if (!codes.length || codes[0] !== 'VP001' || soVp_(codes[codes.length - 1]) !== codes.length) {
    errs.push('mã VP không liên tục: ' + codes.length + ' mã, cuối ' + cuoi);
  }
  var lost = [];
  Object.keys(cu.items || {}).forEach(function (c) {
    if (!moi.items || !moi.items[c]) lost.push(c);
  });
  lost.sort(soSanhVp_);
  if (lost.length) errs.push('mất mã so với Excel hiện tại (' + lost.length + '): ' + lost.slice(0, 10).join(', '));
  var zero = [];
  Object.keys(moi.items || {}).forEach(function (c) {
    if (!cu.items || !cu.items[c]) return;
    var cuGia = cu.items[c].price;
    var moiGia = moi.items[c].price;
    var cuThat = typeof cuGia === 'number' && isFinite(cuGia) && cuGia > 0;
    var moiThat = typeof moiGia === 'number' && isFinite(moiGia) && moiGia > 0;
    if (cuThat && !moiThat) zero.push(c);
  });
  zero.sort(soSanhVp_);
  if (zero.length) errs.push('giá 0/trống sẽ đè giá thật (' + zero.length + '): ' + zero.slice(0, 10).join(', '));
  [{ i: 18, ten: 'Thương Hiệu', cot: 'S' }, { i: 19, ten: 'Quy Cách', cot: 'T' }].forEach(function (c) {
    var co = moi.header && moi.header.length > c.i && chuanTieuDe_(moi.header[c.i]) === chuanTieuDe_(c.ten);
    if (!co) errs.push('Sheet thiếu cột ' + c.ten + ' (cột ' + c.cot + ', web đọc cột này) – chép bù Q–T trước');
  });
  notes.push('mã: bản ghi ' + codes.length + ' / Excel ' + Object.keys(cu.items || {}).length);
  return { ok: errs.length === 0, errs: errs, notes: notes };
}

function itemTuHang_(hang, colMap) {
  if (!hang) return null;
  var maIdx = colMap[chuanTieuDe_('Mã SP')];
  var tenIdx = colMap[chuanTieuDe_('Tên Sản Phẩm')];
  var giaIdx = colMap[chuanTieuDe_('Đơn Giá (Gồm VAT 8%)')];
  var ma = maIdx == null ? '' : chuanGiaTri_(giaO_(hang.cells[maIdx]));
  if (!/^VP\d{3,}$/.test(ma)) return null;
  var price = giaIdx == null ? null : giaO_(hang.cells[giaIdx]);
  if (price === '') price = null;
  return {
    ma: ma,
    name: tenIdx == null || giaO_(hang.cells[tenIdx]) === '' ? null : giaO_(hang.cells[tenIdx]),
    price: typeof price === 'number' ? price : (price == null || price === '' ? null : price),
    S: giaO_(hang.cells[18]) === '' ? null : giaO_(hang.cells[18]),
    T: giaO_(hang.cells[19]) === '' ? null : giaO_(hang.cells[19])
  };
}

function catalogTuExcel_(moHinh) {
  var tab = moHinh && moHinh.sheets ? moHinh.sheets[TEN_SHEET_DM] : null;
  var items = {};
  var header = (tab && tab.headers) ? tab.headers.slice() : [];
  if (tab && tab.rows) {
    Object.keys(tab.rows).forEach(function (k) {
      var it = itemTuHang_(tab.rows[k], tab.col || {});
      if (it) items[it.ma] = it;
    });
  }
  while (header.length <= 19) header.push('');
  if (!chuanTieuDe_(header[18])) header[18] = 'Thương Hiệu';
  if (!chuanTieuDe_(header[19])) header[19] = 'Quy Cách';
  return { sheetNames: (moHinh && moHinh.sheetNames) || [], header: header, items: items };
}

function lietKeXoa_(baseRows, excelRows, sheetRows) {
  var out = [];
  var seen = {};
  Object.keys(baseRows || {}).forEach(function (k) {
    var matE = !excelRows[k];
    var matS = !sheetRows[k];
    if (matE || matS) {
      seen[k] = true;
      out.push({ khoa: k, excel: matE, sheet: matS, row: excelRows[k] ? excelRows[k].row : (sheetRows[k] ? sheetRows[k].row : (baseRows[k] ? baseRows[k].row : 0)) });
    }
  });
  Object.keys(excelRows || {}).forEach(function (k) {
    if (seen[k] || !baseRows[k]) return;
  });
  Object.keys(sheetRows || {}).forEach(function (k) {
    if (seen[k] || baseRows[k] || excelRows[k]) return;
  });
  return out;
}

function gopKhoa_(ten, cfg, nenTab, excelTab, sheetTab, opts, tui) {
  var colE = excelTab.col || {};
  var cot = cotDongBo_(cfg, colE);
  var eRows = excelTab.rows || {};
  var sRows = sheetTab.rows || {};
  var bRows = (nenTab && nenTab.rows) || {};
  var xoa = [];
  if (opts.dayExcel) {
    Object.keys(sRows).forEach(function (k) {
      if (!eRows[k]) xoa.push({ khoa: k, excel: true, sheet: false, row: sRows[k].row });
    });
  } else {
    xoa = lietKeXoa_(bRows, eRows, sRows);
  }
  xoa.forEach(function (d) { d.tab = ten; tui.xoaUng.push(d); });

  Object.keys(eRows).forEach(function (k) {
    if (sRows[k]) return;
    var cells = {};
    cot.forEach(function (idx) {
      var cell = eRows[k].cells[idx];
      if (laBoQuaO_(cell)) return;
      cells[idx] = giaO_(cell);
    });
    tui.themDong.push({ tab: ten, khoa: k, cells: cells, nguon: 'excel' });
    tui.log.push({ tab: ten, khoa: k, cot: '', o: '', nguon: 'excel', cu: '', moi: k, ghiChu: 'thêm dòng từ Excel' });
    tui.canXuat = true;
  });

  if (!opts.dayExcel) {
    Object.keys(sRows).forEach(function (k) {
      if (eRows[k] || bRows[k]) return;
      tui.canXuat = true;
      tui.log.push({ tab: ten, khoa: k, cot: '', o: '', nguon: 'sheet', cu: '', moi: k, ghiChu: 'thêm dòng từ Sheet, sẽ có khi xuất Excel' });
    });
  }

  var chung = {};
  Object.keys(eRows).forEach(function (k) { if (sRows[k]) chung[k] = true; });
  Object.keys(chung).forEach(function (k) {
    cot.forEach(function (idx) {
      var ce = eRows[k].cells[idx];
      var cs = sRows[k].cells[idx];
      var cb = bRows[k] && bRows[k].cells ? bRows[k].cells[idx] : null;
      if (laBoQuaO_(ce) || laBoQuaO_(cs) || laBoQuaO_(cb)) return;
      var ve = giaO_(ce);
      var vs = giaO_(cs);
      var vb = giaO_(cb);
      var quyet;
      if (opts.dayExcel) {
        if (cungGiaTri_(ve, vs)) return;
        quyet = 'excel';
      } else if (!bRows[k]) {
        if (cungGiaTri_(ve, vs)) return;
        quyet = 'xung-dot';
      } else {
        quyet = quyetDinhO_(vb, ve, vs);
      }
      if (quyet === 'giu') return;
      var tenCot = tenCotTheoIndex_(excelTab.headers, idx);
      var diaChi = cotChu_(idx) + sRows[k].row;
      if (quyet === 'excel') {
        var giaIdxQuyet = cfg.cotGia ? colE[chuanTieuDe_(cfg.cotGia)] : null;
        if (giaIdxQuyet != null && idx === giaIdxQuyet && !laGiaThat_(ve) && laGiaThat_(vs)) {
          tui.giaGiu[k.split('#')[0]] = vs;
          tui.canXuat = true;
          tui.log.push({
            tab: ten, khoa: k, cot: tenCot, o: diaChi, nguon: 'giu-gia',
            cu: catChuoi_(vs), moi: catChuoi_(ve), ghiChu: 'giá 0/trống không đè giá thật'
          });
        } else {
          tui.ghiSheet.push({ tab: ten, khoa: k, col: idx, row: sRows[k].row, giaTri: ve, nguon: 'excel' });
          tui.log.push({ tab: ten, khoa: k, cot: tenCot, o: diaChi, nguon: 'excel', cu: catChuoi_(vs), moi: catChuoi_(ve), ghiChu: '' });
          tui.canXuat = true;
        }
      } else if (quyet === 'sheet') {
        tui.canXuat = true;
        tui.log.push({ tab: ten, khoa: k, cot: tenCot, o: diaChi, nguon: 'sheet', cu: catChuoi_(ve), moi: catChuoi_(vs), ghiChu: '' });
      } else {
        tui.canXuat = true;
        tui.xungDot.push({
          tab: ten, khoa: k, cot: tenCot, o: diaChi,
          nen: catChuoi_(vb), excel: catChuoi_(ve), sheet: catChuoi_(vs),
          ketLuan: 'Sheet thắng'
        });
        tui.log.push({ tab: ten, khoa: k, cot: tenCot, o: diaChi, nguon: 'xung-dot', cu: catChuoi_(ve), moi: catChuoi_(vs), ghiChu: 'Sheet thắng' });
      }
    });
  });

  if (cfg.lienTucVp) {
    Object.keys(eRows).forEach(function (k) {
      var it = itemTuHang_(eRows[k], colE);
      if (!it) return;
      tui.itemsExcel[it.ma] = it;
    });
    Object.keys(eRows).forEach(function (k) {
      if (!sRows[k] && !opts.dayExcel && bRows[k]) return;
      var goc = eRows[k];
      var it2 = itemTuHang_(goc, colE);
      if (!it2) return;
      var giaIdx = colE[chuanTieuDe_(cfg.cotGia)];
      var tenIdx = colE[chuanTieuDe_('Tên Sản Phẩm')];
      var gia = it2.price;
      var tenSp = it2.name;
      if (sRows[k] && giaIdx != null && !laBoQuaO_(eRows[k].cells[giaIdx]) && !laBoQuaO_(sRows[k].cells[giaIdx])) {
        var qs = opts.dayExcel ? 'excel' : (bRows[k] ? quyetDinhO_(giaO_(bRows[k].cells[giaIdx]), giaO_(eRows[k].cells[giaIdx]), giaO_(sRows[k].cells[giaIdx])) : (cungGiaTri_(giaO_(eRows[k].cells[giaIdx]), giaO_(sRows[k].cells[giaIdx])) ? 'giu' : 'xung-dot'));
        if (qs === 'sheet' || qs === 'xung-dot') gia = giaO_(sRows[k].cells[giaIdx]);
        else gia = giaO_(eRows[k].cells[giaIdx]);
        if (tui.giaGiu[it2.ma] != null) gia = tui.giaGiu[it2.ma];
      }
      if (sRows[k] && tenIdx != null && !laBoQuaO_(eRows[k].cells[tenIdx]) && !laBoQuaO_(sRows[k].cells[tenIdx]) && !laBoQuaO_(bRows[k] && bRows[k].cells[tenIdx])) {
        var qt = opts.dayExcel ? 'excel' : (bRows[k] ? quyetDinhO_(giaO_(bRows[k].cells[tenIdx]), giaO_(eRows[k].cells[tenIdx]), giaO_(sRows[k].cells[tenIdx])) : 'giu');
        if (qt === 'sheet' || qt === 'xung-dot') tenSp = giaO_(sRows[k].cells[tenIdx]);
      }
      if (gia === '') gia = null;
      tui.itemsMoi[it2.ma] = { name: tenSp, price: typeof gia === 'number' ? gia : (gia == null || gia === '' ? null : gia), S: it2.S, T: it2.T };
    });
  }
}

function gopO_(ten, nenTab, excelTab, sheetTab, opts, tui) {
  var eo = (excelTab && excelTab.o) || {};
  var so = (sheetTab && sheetTab.o) || {};
  var bo = (nenTab && nenTab.o) || {};
  var refs = {};
  Object.keys(eo).forEach(function (k) { refs[k] = true; });
  Object.keys(so).forEach(function (k) { refs[k] = true; });
  if (!opts.dayExcel) Object.keys(bo).forEach(function (k) { refs[k] = true; });
  var hangE = {};
  var hangS = {};
  var hangB = {};
  function danhDau_(map, cell) {
    if (!cell || laBoQuaO_(cell) || chuanGiaTri_(cell.v) === '') return;
    map[cell.row] = true;
  }
  Object.keys(eo).forEach(function (k) { danhDau_(hangE, eo[k]); });
  Object.keys(so).forEach(function (k) { danhDau_(hangS, so[k]); });
  Object.keys(bo).forEach(function (k) { danhDau_(hangB, bo[k]); });
  if (opts.dayExcel) {
    Object.keys(hangS).forEach(function (rk) {
      if (!hangE[rk]) tui.xoaUng.push({ tab: ten, khoa: 'dong-' + rk, excel: true, sheet: false, row: +rk });
    });
  } else {
    Object.keys(hangB).forEach(function (rk) {
      if (!hangE[rk] || !hangS[rk]) {
        tui.xoaUng.push({ tab: ten, khoa: 'dong-' + rk, excel: !hangE[rk], sheet: !hangS[rk], row: +rk });
      }
    });
  }
  Object.keys(refs).forEach(function (ref) {
    var ce = eo[ref];
    var cs = so[ref];
    var cb = bo[ref];
    if (laBoQuaO_(ce) || laBoQuaO_(cs) || laBoQuaO_(cb)) return;
    var ve = giaO_(ce);
    var vs = giaO_(cs);
    var vb = giaO_(cb);
    var quyet = opts.dayExcel ? (cungGiaTri_(ve, vs) ? 'giu' : 'excel') : quyetDinhO_(vb, ve, vs);
    if (quyet === 'giu') return;
    var row = (cs && cs.row) || (ce && ce.row) || (cb && cb.row);
    var col = (cs && cs.col) || (ce && ce.col) || (cb && cb.col);
    if (quyet === 'excel') {
      if (!cs && (ve === '' || ve == null)) return;
      tui.ghiSheet.push({ tab: ten, khoa: ref, col: col, row: row, giaTri: ve, nguon: 'excel' });
      tui.log.push({ tab: ten, khoa: ref, cot: cotChu_(col), o: ref, nguon: 'excel', cu: catChuoi_(vs), moi: catChuoi_(ve), ghiChu: '' });
      tui.canXuat = true;
    } else if (quyet === 'sheet') {
      tui.canXuat = true;
      tui.log.push({ tab: ten, khoa: ref, cot: cotChu_(col), o: ref, nguon: 'sheet', cu: catChuoi_(ve), moi: catChuoi_(vs), ghiChu: '' });
    } else {
      tui.canXuat = true;
      tui.xungDot.push({ tab: ten, khoa: ref, cot: cotChu_(col), o: ref, nen: catChuoi_(vb), excel: catChuoi_(ve), sheet: catChuoi_(vs), ketLuan: 'Sheet thắng' });
      tui.log.push({ tab: ten, khoa: ref, cot: cotChu_(col), o: ref, nguon: 'xung-dot', cu: catChuoi_(ve), moi: catChuoi_(vs), ghiChu: 'Sheet thắng' });
    }
  });
}

function gopBaBen_(nen, excel, sheet, opts) {
  opts = opts || {};
  var nguong = opts.nguong == null ? NGUONG_XOA_DONG : opts.nguong;
  excel = excel || { sheetNames: [], sheets: {} };
  sheet = sheet || { sheetNames: [], sheets: {} };
  nen = nen || { sheetNames: SHEET_NAMES.slice(), sheets: {} };
  if (!cungDanhSach_(excel.sheetNames, SHEET_NAMES)) {
    return thatBai_('danh sách sheet lệch (Excel): ' + (excel.sheetNames || []).join(' | '));
  }
  if (!cungDanhSach_(sheet.sheetNames, SHEET_NAMES)) {
    return thatBai_('danh sách sheet lệch (Sheet): ' + (sheet.sheetNames || []).join(' | '));
  }
  if (!opts.dayExcel && !cungDanhSach_(nen.sheetNames, SHEET_NAMES)) {
    return thatBai_('danh sách sheet lệch (bản chụp): ' + (nen.sheetNames || []).join(' | '));
  }
  var loiTieuDe = [];
  SHEET_NAMES.forEach(function (ten) {
    var cfg = timCauHinh_(ten);
    if (!cfg || cfg.cheDo !== 'khoa') return;
    var e = excel.sheets[ten] || {};
    var s = sheet.sheets[ten] || {};
    if (e.loi) loiTieuDe.push('Excel ' + ten + ': ' + e.loi);
    if (s.loi) loiTieuDe.push('Sheet ' + ten + ': ' + s.loi);
    var ve = kiemViTri_(e.headers, cfg.viTriExcel);
    if (ve.length) loiTieuDe.push('Excel ' + ten + ': ' + ve.join(', '));
    var thieuE = thieuTen_(e.col || {}, cfg.batBuocExcel || cfg.khoa);
    var thieuS = thieuTen_(s.col || {}, cfg.batBuocSheet || cfg.khoa);
    if (thieuE.length) loiTieuDe.push('Excel ' + ten + ' thiếu tiêu đề ' + thieuE.join(', '));
    if (thieuS.length) loiTieuDe.push('Sheet ' + ten + ' thiếu tiêu đề ' + thieuS.join(', '));
  });
  if (loiTieuDe.length) return thatBai_(loiTieuDe.join(' || '));

  var tui = {
    ghiSheet: [], themDong: [], xoaUng: [], xungDot: [], log: [],
    canXuat: false, itemsExcel: {}, itemsMoi: {}, giaGiu: {}
  };
  var i;
  for (i = 0; i < SHEET_NAMES.length; i++) {
    var ten = SHEET_NAMES[i];
    var cfg = timCauHinh_(ten);
    if (!cfg || cfg.cheDo === 'cam' || cfg.cheDo === 'cong-thuc') continue;
    var eTab = excel.sheets[ten] || { cheDo: cfg.cheDo, rows: {}, o: {} };
    var sTab = sheet.sheets[ten] || { cheDo: cfg.cheDo, rows: {}, o: {} };
    var bTab = (nen.sheets && nen.sheets[ten]) || { cheDo: cfg.cheDo, rows: {}, o: {} };
    if (cfg.cheDo === 'o') gopO_(ten, bTab, eTab, sTab, opts, tui);
    else gopKhoa_(ten, cfg, bTab, eTab, sTab, opts, tui);
  }

  if (tui.xoaUng.length > nguong) {
    return thatBai_('xóa quá nhiều dòng (' + tui.xoaUng.length + ', ngưỡng ' + nguong + '): ' +
      tui.xoaUng.slice(0, 8).map(function (d) { return d.tab + ' ' + d.khoa; }).join(', '));
  }

  var xoaDong = [];
  tui.xoaUng.forEach(function (d) {
    if (d.tab === TEN_SHEET_DM && !d.excel && d.sheet) {
      tui.xungDot.push({
        tab: d.tab, khoa: d.khoa, cot: '', o: '', nen: d.khoa, excel: d.khoa, sheet: '',
        ketLuan: 'Sheet xóa mã, Excel còn, giữ mã'
      });
      tui.log.push({ tab: d.tab, khoa: d.khoa, cot: '', o: '', nguon: 'xung-dot', cu: d.khoa, moi: d.khoa, ghiChu: 'Sheet xóa mã, Excel còn, giữ mã' });
      return;
    }
    if (d.excel && !d.sheet) {
      xoaDong.push(d);
      tui.log.push({ tab: d.tab, khoa: d.khoa, cot: '', o: '', nguon: 'excel', cu: d.khoa, moi: '', ghiChu: 'xóa dòng theo Excel' });
      tui.canXuat = true;
    } else if (d.sheet && !d.excel) {
      tui.canXuat = true;
      tui.log.push({ tab: d.tab, khoa: d.khoa, cot: '', o: '', nguon: 'sheet', cu: d.khoa, moi: '', ghiChu: 'Excel đã không còn dòng, giữ vì không xóa mã đang có trên Excel' });
    } else if (d.excel && d.sheet) {
      tui.log.push({ tab: d.tab, khoa: d.khoa, cot: '', o: '', nguon: 'ca-hai', cu: d.khoa, moi: '', ghiChu: 'cả hai bên đã xóa' });
    }
  });

  var header = [];
  var tabDm = excel.sheets[TEN_SHEET_DM];
  if (tabDm && tabDm.headers) header = tabDm.headers.slice();
  while (header.length <= 19) header.push('');
  if (!chuanTieuDe_(header[18])) header[18] = 'Thương Hiệu';
  if (!chuanTieuDe_(header[19])) header[19] = 'Quy Cách';
  Object.keys(tui.itemsExcel).forEach(function (ma) {
    if (!tui.itemsMoi[ma]) tui.itemsMoi[ma] = { name: tui.itemsExcel[ma].name, price: tui.itemsExcel[ma].price, S: tui.itemsExcel[ma].S, T: tui.itemsExcel[ma].T };
  });
  xoaDong.forEach(function (d) {
    if (d.tab === TEN_SHEET_DM && /^VP\d{3,}/.test(d.khoa)) delete tui.itemsMoi[d.khoa.split('#')[0]];
  });
  var kiem = kiemTraXuat_(
    { sheetNames: SHEET_NAMES.slice(), header: header, items: tui.itemsMoi },
    { sheetNames: SHEET_NAMES.slice(), header: header, items: tui.itemsExcel }
  );
  if (!kiem.ok) return thatBai_(kiem.errs.join(' || '));

  var coViec = tui.canXuat || tui.ghiSheet.length || tui.themDong.length || xoaDong.length || tui.xungDot.length;
  return {
    ok: true,
    dung: false,
    lyDo: coViec ? '' : 'không có ô cần ghi',
    errs: [],
    ghiSheet: tui.ghiSheet,
    themDong: tui.themDong,
    xoaDong: xoaDong,
    xungDot: tui.xungDot,
    log: tui.log,
    canXuat: !!tui.canXuat,
    notes: kiem.notes,
    soGhiSheet: tui.ghiSheet.length,
    soThem: tui.themDong.length,
    soXoa: xoaDong.length,
    soXungDot: tui.xungDot.length
  };
}

function kiemXuatTuFiles_(files, catCu) {
  var ds = danhSachSheetTuTep_(files);
  var names = ds.map(function (s) { return s.name; });
  var dm = gridDanhMuc_(files);
  var cfg = timCauHinh_(TEN_SHEET_DM);
  var header = timHangTieuDe_(dm.grid, cfg.batBuocExcel || ['Mã SP']);
  var rows = hangTheoKhoa_(dm.grid, header, cfg);
  var items = {};
  Object.keys(rows).forEach(function (k) {
    var it = itemTuHang_(rows[k], header.col);
    if (it) items[it.ma] = { name: it.name, price: it.price, S: it.S, T: it.T };
  });
  var head = header.headers.slice();
  while (head.length <= 19) head.push('');
  return kiemTraXuat_({ sheetNames: names, header: head, items: items }, catCu || { sheetNames: names, header: head, items: {} });
}

function excelBiNguoiSua_(meta, lastMd5, lastMod) {
  if (!lastMd5 && !lastMod) return true;
  if (meta && meta.md5Checksum && lastMd5) return String(meta.md5Checksum) !== String(lastMd5);
  if (meta && meta.modifiedTime && lastMod) return String(meta.modifiedTime) !== String(lastMod);
  return true;
}

function sheetBiSua_(meta, lastMod) {
  if (!lastMod) return true;
  if (!meta || !meta.modifiedTime) return true;
  return String(meta.modifiedTime) !== String(lastMod);
}

function dieuChinhCongThuc_(formula, tuHang, denHang) {
  if (!formula) return '';
  var delta = denHang - tuHang;
  return String(formula).replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, function (m, cAbs, col, rAbs, row) {
    if (rAbs === '$') return m;
    var n = parseInt(row, 10) + delta;
    if (n < 1) n = 1;
    return cAbs + col + n;
  });
}

function tomTatKeHoach_(keHoach) {
  keHoach = keHoach || {};
  var mau = (keHoach.log || []).slice(0, 15).map(function (d) {
    return { tab: d.tab, khoa: d.khoa, cot: d.cot, nguon: d.nguon, cu: d.cu, moi: d.moi, ghiChu: d.ghiChu };
  });
  return {
    ok: !!keHoach.ok,
    dung: !!keHoach.dung,
    lyDo: keHoach.lyDo || '',
    errs: keHoach.errs || [],
    canXuat: !!keHoach.canXuat,
    soGhiSheet: (keHoach.ghiSheet || []).length,
    soThem: (keHoach.themDong || []).length,
    soXoa: (keHoach.xoaDong || []).length,
    soXungDot: (keHoach.xungDot || []).length,
    mau: mau,
    notes: keHoach.notes || []
  };
}
