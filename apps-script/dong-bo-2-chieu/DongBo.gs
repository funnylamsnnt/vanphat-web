/**
 * Vòng đồng bộ 15 phút. Guard trượt hoặc xóa quá ngưỡng thì không ghi file giá.
 * Đưa thay đổi vào Sheet trước, rồi mới xuất lại Excel.
 * Không gọi KiotViet. Không ghi đè bản sao lưu nền.
 */

function props_() {
  return PropertiesService.getScriptProperties();
}

function catJson_(obj) {
  var text = JSON.stringify(obj);
  if (text.length > 8000) text = text.slice(0, 8000);
  return text;
}

function ghiKet_(deps, obj) {
  var text = catJson_(obj);
  if (deps.log) deps.log(text);
  if (deps.setProp) deps.setProp('LAST_RUN_JSON', text);
  return obj;
}

function ketDung_(deps, lyDo, muc) {
  var obj = { ok: false, ghi: false, muc: muc || 'KHONG_GHI', lyDo: lyDo };
  ghiKet_(deps, obj);
  if (deps.setProp) deps.setProp('LAST_GUARD_JSON', catJson_(obj));
  return { ok: false, ghi: false, dung: true, lyDo: lyDo, errs: [lyDo], skipped: false };
}

function nguongTuProp_(deps) {
  var raw = deps.getProp ? deps.getProp('NGUONG_XOA_DONG') : '';
  if (raw == null || String(raw).trim() === '') return NGUONG_XOA_DONG;
  var n = parseInt(raw, 10);
  if (!isFinite(n) || n < 0) return NGUONG_XOA_DONG;
  return n;
}

function dongBoVong_(deps, opts) {
  opts = opts || {};
  var now = opts.now || new Date();
  if (!opts.boQuaLich) {
    var q = quyetDinhLich15_(now);
    if (!q.chay) {
      ghiKet_(deps, { ok: true, skipped: true, ghi: false, muc: 'BO_QUA_LICH', lyDo: q.lyDo, luc: dinhDangSaigon_(now) });
      return { ok: true, skipped: true, ghi: false, lyDo: q.lyDo };
    }
  }
  var daKhoa = false;
  if (!opts.boQuaKhoa) {
    if (!deps.tryLock || !deps.tryLock()) {
      ghiKet_(deps, { ok: true, skipped: true, ghi: false, muc: 'DANG_KHOA', lyDo: 'đang có lượt khác' });
      return { ok: true, skipped: true, ghi: false, lyDo: 'đang có lượt khác' };
    }
    daKhoa = true;
  }
  try {
    return dongBoTrongKhoa_(deps, opts, now);
  } finally {
    if (daKhoa && deps.releaseLock) deps.releaseLock();
  }
}

function dongBoTrongKhoa_(deps, opts, now) {
  var excelMeta = deps.excelMeta();
  if (!excelMeta || excelMeta.id !== EXCEL_ID || excelMeta.name !== EXPECTED_TITLE) {
    return ketDung_(deps, 'Excel id/tên sai: ' + (excelMeta && excelMeta.id) + ' ' + (excelMeta && excelMeta.name));
  }
  var sheetMeta = deps.sheetMeta();
  if (!sheetMeta || sheetMeta.id !== GSHEET_ID) {
    return ketDung_(deps, 'Sheet id sai: ' + (sheetMeta && sheetMeta.id));
  }
  var lastMd5 = String((deps.getProp && deps.getProp('LAST_EXCEL_MD5')) || '');
  var lastExcelMod = String((deps.getProp && deps.getProp('LAST_EXCEL_MODIFIED_TIME')) || '');
  var lastSheetMod = String((deps.getProp && deps.getProp('LAST_SHEET_MODIFIED_TIME')) || '');
  var excelSua = opts.force || excelBiNguoiSua_(excelMeta, lastMd5, lastExcelMod);
  var sheetSua = opts.force || sheetBiSua_(sheetMeta, lastSheetMod);
  if (!excelSua && !sheetSua) {
    ghiKet_(deps, { ok: true, skipped: true, ghi: false, muc: 'KHONG_DOI', lyDo: 'Excel và Sheet không đổi kể từ lần đồng bộ trước' });
    return { ok: true, skipped: true, ghi: false, lyDo: 'Excel và Sheet không đổi kể từ lần đồng bộ trước' };
  }
  var snapMeta = deps.snapshotMeta ? deps.snapshotMeta() : { id: BASELINE_BACKUP_ID, md5Checksum: '' };
  var snapId = (snapMeta && snapMeta.id) || BASELINE_BACKUP_ID;
  var dayExcel = !lastMd5 && snapMeta && snapMeta.md5Checksum && excelMeta.md5Checksum &&
    String(snapMeta.md5Checksum) === String(excelMeta.md5Checksum);
  var excelPack = deps.taiExcel();
  var sheetMo = deps.taiSheet();
  var nenMo = dayExcel ? excelPack.moHinh : deps.taiSnapshot();
  var plan = gopBaBen_(nenMo, excelPack.moHinh, sheetMo, { dayExcel: !!dayExcel, nguong: nguongTuProp_(deps) });
  plan.modifiedExcel = excelMeta.modifiedTime || '';
  plan.modifiedSheet = sheetMeta.modifiedTime || '';
  plan.dayExcel = !!dayExcel;
  var dry = !!(opts.dryRun || (deps.isDryRun && deps.isDryRun()));
  var tom = tomTatKeHoach_(plan);
  tom.dayExcel = !!dayExcel;
  tom.snapId = snapId;
  if (!plan.ok) {
    tom.muc = 'KHONG_GHI';
    tom.ghi = false;
    ghiKet_(deps, tom);
    if (deps.setProp) deps.setProp('LAST_GUARD_JSON', catJson_(tom));
    if (!dry && deps.ghiNhatKy) deps.ghiNhatKy(plan, dinhDangSaigon_(now));
    return plan;
  }
  if (dry) {
    tom.ok = true;
    tom.dryRun = true;
    tom.ghi = false;
    tom.muc = 'DRY_RUN';
    ghiKet_(deps, tom);
    return tom;
  }
  var coViec = (plan.ghiSheet && plan.ghiSheet.length) || (plan.themDong && plan.themDong.length) ||
    (plan.xoaDong && plan.xoaDong.length) || plan.canXuat;
  if (!coViec) {
    if (excelMeta.md5Checksum) deps.setProp('LAST_EXCEL_MD5', String(excelMeta.md5Checksum));
    if (excelMeta.modifiedTime) deps.setProp('LAST_EXCEL_MODIFIED_TIME', String(excelMeta.modifiedTime));
    if (sheetMeta.modifiedTime) deps.setProp('LAST_SHEET_MODIFIED_TIME', String(sheetMeta.modifiedTime));
    tom.muc = 'KHONG_DOI';
    tom.ghi = false;
    tom.skipped = true;
    ghiKet_(deps, tom);
    return tom;
  }
  var luc = dinhDangSaigon_(now);
  var bu = deps.saoLuu(luc);
  if (!bu || bu.excelId === EXCEL_ID || bu.sheetId === GSHEET_ID || idCamGhi_(bu.excelId) || idCamGhi_(bu.sheetId)) {
    throw new Error('sao lưu trả về đúng file đang dùng');
  }
  deps.setProp('LAST_BACKUP_JSON', catJson_(bu));
  if (deps.apDung && ((plan.ghiSheet && plan.ghiSheet.length) || (plan.themDong && plan.themDong.length) || (plan.xoaDong && plan.xoaDong.length))) {
    plan.apDung = deps.apDung(plan);
  }
  if (deps.ghiNhatKy) deps.ghiNhatKy(plan, luc);
  var after = null;
  if (plan.canXuat) {
    var minBytes = opts.minBytes == null ? MIN_XLSX_BYTES : opts.minBytes;
    var blob = deps.exportXlsx();
    if (!laXlsxBlob_(blob, minBytes)) return ketDung_(deps, 'đã ghi Sheet nhưng file xuất không phải xlsx hợp lệ, chưa ghi Excel');
    var filesMoi = deps.unzip(blob);
    var daChep = chepBuGiuNhiPhan_(filesMoi, excelPack.files);
    var kiem = kiemXuatTuFiles_(daChep.filesXml, catalogTuExcel_(excelPack.moHinh));
    if (!kiem.ok) return ketDung_(deps, 'đã ghi Sheet nhưng chưa ghi Excel: ' + kiem.errs.join(' || '));
    var zipBlob = deps.zip(daChep.files);
    if (!laXlsxBlob_(zipBlob, minBytes)) return ketDung_(deps, 'đã ghi Sheet nhưng file xlsx sau khi chép Q–T không hợp lệ, chưa ghi Excel');
    after = deps.updateExcel(zipBlob);
    if (!after || after.id !== EXCEL_ID || after.name !== EXPECTED_TITLE || idCamGhi_(after.id)) {
      throw new Error('id/tên sau khi ghi sai: ' + (after && after.id) + ' ' + (after && after.name));
    }
    deps.capNhatSnapshot(zipBlob, snapId);
  }
  var sheetSau = deps.sheetMeta();
  if (after && after.md5Checksum) deps.setProp('LAST_EXCEL_MD5', String(after.md5Checksum));
  else if (!plan.canXuat && excelMeta.md5Checksum) deps.setProp('LAST_EXCEL_MD5', String(excelMeta.md5Checksum));
  if (after && after.modifiedTime) deps.setProp('LAST_EXCEL_MODIFIED_TIME', String(after.modifiedTime));
  else if (excelMeta.modifiedTime) deps.setProp('LAST_EXCEL_MODIFIED_TIME', String(excelMeta.modifiedTime));
  if (after && after.version != null) deps.setProp('LAST_EXCEL_VERSION', String(after.version));
  if (sheetSau && sheetSau.modifiedTime) deps.setProp('LAST_SHEET_MODIFIED_TIME', String(sheetSau.modifiedTime));
  if (deps.setProp) deps.setProp('LAST_GUARD_JSON', '');
  var xong = {
    ok: true,
    ghi: true,
    muc: 'DA_GHI',
    dayExcel: !!dayExcel,
    backup: bu,
    version: after && after.version,
    soGhiSheet: plan.soGhiSheet,
    soThem: plan.soThem,
    soXoa: plan.soXoa,
    soXungDot: plan.soXungDot,
    notes: plan.notes || []
  };
  ghiKet_(deps, xong);
  return xong;
}

function apDungKeHoach_(ss, keHoach) {
  var dem = { ghi: 0, them: 0, xoa: 0, boQua: 0 };
  var theo = {};
  function bucket(tab) {
    if (!theo[tab]) theo[tab] = { ghi: [], them: [], xoa: [] };
    return theo[tab];
  }
  (keHoach.ghiSheet || []).forEach(function (o) { bucket(o.tab).ghi.push(o); });
  (keHoach.themDong || []).forEach(function (o) { bucket(o.tab).them.push(o); });
  (keHoach.xoaDong || []).forEach(function (o) { bucket(o.tab).xoa.push(o); });
  Object.keys(theo).forEach(function (ten) {
    if (ten === TEN_GEMINI) return;
    var cfg = timCauHinh_(ten);
    if (!cfg || cfg.cheDo === 'cam' || cfg.cheDo === 'cong-thuc') return;
    var sh = ss.getSheetByName(ten);
    if (!sh) throw new Error('thiếu tab ' + ten);
    theo[ten].ghi.forEach(function (o) {
      if (!o.row || o.col == null || o.col < 0) return;
      var range = sh.getRange(o.row, o.col + 1);
      var f = range.getFormula ? range.getFormula() : '';
      if (f) { dem.boQua++; return; }
      range.setValue(o.giaTri);
      dem.ghi++;
    });
    var xoa = [];
    theo[ten].xoa.forEach(function (d) {
      if (d.row > 0 && xoa.indexOf(d.row) < 0) xoa.push(d.row);
    });
    xoa.sort(function (a, b) { return b - a; });
    xoa.forEach(function (r) {
      sh.deleteRow(r);
      dem.xoa++;
    });
    theo[ten].them.forEach(function (dong) {
      var last = sh.getLastRow();
      var dest = last + 1;
      Object.keys(dong.cells || {}).forEach(function (ck) {
        sh.getRange(dest, (+ck) + 1).setValue(dong.cells[ck]);
      });
      if (cfg.cotCongThuc && last >= 2) {
        var soCot = sh.getLastColumn ? sh.getLastColumn() : 20;
        if (soCot < 1) soCot = 1;
        var header = sh.getRange(1, 1, 1, soCot).getValues()[0];
        cfg.cotCongThuc.forEach(function (tenCot) {
          var idx = -1;
          var c;
          for (c = 0; c < header.length; c++) {
            if (chuanTieuDe_(header[c]) === chuanTieuDe_(tenCot)) idx = c;
          }
          if (idx < 0) return;
          var f2 = sh.getRange(last, idx + 1).getFormula ? sh.getRange(last, idx + 1).getFormula() : '';
          if (!f2) return;
          sh.getRange(dest, idx + 1).setFormula(dieuChinhCongThuc_(f2, last, dest));
        });
      }
      dem.them++;
    });
  });
  return dem;
}

function damBaoTab_(ss, ten, cot) {
  var sh = ss.getSheetByName(ten);
  if (!sh) sh = ss.insertSheet(ten);
  var canHeader = sh.getLastRow() < 1;
  if (!canHeader) {
    var h = sh.getRange(1, 1, 1, cot.length).getValues()[0];
    canHeader = !cot.every(function (t, i) { return String(h[i] || '') === t; }) && String(h[0] || '') === '';
  }
  if (sh.getLastRow() < 1 || canHeader) sh.getRange(1, 1, 1, cot.length).setValues([cot.slice()]);
  return sh;
}

function ghiNhatKy_(ss, keHoach, luc) {
  var logSh = damBaoTab_(ss, TEN_LOG, COT_LOG);
  var xdSh = damBaoTab_(ss, TEN_XUNG_DOT, COT_XUNG);
  var logs = [];
  (keHoach.log || []).forEach(function (d) {
    if (d.tab === TEN_GEMINI) return;
    logs.push([
      luc, d.tab || '', catChuoi_(d.khoa, 120), catChuoi_(d.cot, 80), d.o || '',
      d.nguon || '', catChuoi_(d.cu, 180), catChuoi_(d.moi, 180), catChuoi_(d.ghiChu, 300)
    ]);
  });
  if (!logs.length && keHoach && keHoach.lyDo) {
    logs.push([luc, '', '', '', '', 'dung', '', '', catChuoi_(keHoach.lyDo, 500)]);
  }
  if (logs.length) {
    var start = logSh.getLastRow() + 1;
    logSh.getRange(start, 1, logs.length, COT_LOG.length).setValues(logs);
  }
  var xds = [];
  (keHoach.xungDot || []).forEach(function (d) {
    if (d.tab === TEN_GEMINI) return;
    xds.push([
      luc, d.tab || '', catChuoi_(d.khoa, 120), catChuoi_(d.cot, 80), d.o || '',
      catChuoi_(d.nen, 180), catChuoi_(d.excel, 180), catChuoi_(d.sheet, 180),
      d.ketLuan || 'Sheet thắng',
      catChuoi_(keHoach.modifiedExcel, 40), catChuoi_(keHoach.modifiedSheet, 40)
    ]);
  });
  if (xds.length) xdSh.getRange(xdSh.getLastRow() + 1, 1, xds.length, COT_XUNG.length).setValues(xds);
  return { log: logs.length, xung: xds.length };
}

function ghiExcelCungId_(blob) {
  var r = Drive.Files.update(
    { name: EXPECTED_TITLE, mimeType: XLSX_MIME },
    EXCEL_ID,
    blob,
    { keepRevisionForever: false, supportsAllDrives: true, fields: 'id,name,md5Checksum,modifiedTime,version,size' }
  );
  if (!r || r.id !== EXCEL_ID || r.name !== EXPECTED_TITLE || idCamGhi_(r.id)) {
    throw new Error('id/tên sau khi ghi sai: ' + (r && r.id) + ' ' + (r && r.name));
  }
  return r;
}

function saoChepFile_(id, ten) {
  if (idCamGhi_(id) && ten.indexOf('SNAPSHOT') >= 0) {
    throw new Error('không ghi đè bản sao lưu nền');
  }
  var r = Drive.Files.copy({ name: ten }, id, { supportsAllDrives: true, fields: 'id,name' });
  if (!r || !r.id || r.id === id || r.id === EXCEL_ID || r.id === GSHEET_ID || idCamGhi_(r.id)) {
    throw new Error('bản sao không an toàn: ' + (r && r.id));
  }
  return r;
}

function capNhatSnapshotThat_(blob, snapId) {
  if (!snapId || idCamGhi_(snapId) || snapId === EXCEL_ID || snapId === GSHEET_ID) {
    var copied = saoChepFile_(EXCEL_ID, 'PHIEU BAO GIA VAN PHAT - SNAPSHOT.xlsx');
    props_().setProperty('SNAPSHOT_FILE_ID', copied.id);
    return copied.id;
  }
  var r = Drive.Files.update(
    { name: 'PHIEU BAO GIA VAN PHAT - SNAPSHOT.xlsx', mimeType: XLSX_MIME },
    snapId,
    blob,
    { supportsAllDrives: true, fields: 'id,name' }
  );
  if (!r || idCamGhi_(r.id) || r.id === EXCEL_ID) throw new Error('snapshot ghi sai id');
  return r.id;
}

function tepBlob_(blob) {
  var nguon = blob && typeof blob.getBlob === 'function' ? blob.getBlob() : blob;
  // Utilities.unzip chỉ nhận blob kiểu application/zip; dùng bản sao để không đổi blob gốc.
  var parts = Utilities.unzip(nguon.copyBlob().setContentType('application/zip'));
  var map = {};
  var i;
  for (i = 0; i < parts.length; i++) map[parts[i].getName()] = parts[i];
  return map;
}

function zipTep_(map) {
  var blobs = [];
  Object.keys(map).forEach(function (name) {
    var b = map[name];
    if (typeof b === 'string') b = Utilities.newBlob(b, 'text/xml', name);
    else if (b && b.setName) b = b.setName(name);
    blobs.push(b);
  });
  return Utilities.zip(blobs).setName(EXPECTED_TITLE).setContentType(XLSX_MIME);
}

function moHinhTuMap_(files) {
  var str = {};
  Object.keys(files || {}).forEach(function (k) {
    if (laTepXml_(k)) str[k] = noiDungTep_(files[k]);
  });
  return { moHinh: moHinhTuTep_(str), files: files };
}

function moSheetGia_() {
  var ss = SpreadsheetApp.openById(GSHEET_ID);
  var all = ss.getSheets();
  var byName = {};
  var i;
  for (i = 0; i < all.length; i++) byName[all[i].getName()] = all[i];
  var names = [];
  for (i = 0; i < SHEET_NAMES.length; i++) {
    if (byName[SHEET_NAMES[i]]) names.push(SHEET_NAMES[i]);
  }
  for (i = 0; i < all.length; i++) {
    if (names.indexOf(all[i].getName()) < 0) names.push(all[i].getName());
  }
  var grids = {};
  for (i = 0; i < names.length; i++) {
    var ten = names[i];
    var cfg = timCauHinh_(ten);
    if (!cfg || cfg.cheDo === 'cam' || cfg.cheDo === 'cong-thuc') continue;
    var sh = byName[ten];
    if (!sh) continue;
    var lastR = sh.getLastRow();
    var lastC = sh.getLastColumn();
    if (lastR < 1 || lastC < 1) {
      grids[ten] = {};
      continue;
    }
    var values = sh.getRange(1, 1, lastR, lastC).getValues();
    var formulas = sh.getRange(1, 1, lastR, lastC).getFormulas();
    var grid = {};
    var r;
    var c;
    for (r = 0; r < values.length; r++) {
      for (c = 0; c < values[r].length; c++) {
        var f = formulas[r][c] ? String(formulas[r][c]) : '';
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
    grids[ten] = grid;
  }
  return moHinhTuGrid_(names, grids);
}

function moSoNhatKy_() {
  var id = props_().getProperty('SYNC_LOG_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create(TEN_SO_NHAT_KY);
  props_().setProperty('SYNC_LOG_ID', ss.getId());
  return ss;
}

function taoDepsThat_() {
  return {
    excelMeta: function () {
      return Drive.Files.get(EXCEL_ID, { fields: 'id,name,md5Checksum,modifiedTime,version', supportsAllDrives: true });
    },
    sheetMeta: function () {
      return Drive.Files.get(GSHEET_ID, { fields: 'id,name,modifiedTime,version', supportsAllDrives: true });
    },
    snapshotMeta: function () {
      var id = props_().getProperty('SNAPSHOT_FILE_ID') || BASELINE_BACKUP_ID;
      return Drive.Files.get(id, { fields: 'id,name,md5Checksum,modifiedTime', supportsAllDrives: true });
    },
    taiExcel: function () {
      var blob = DriveApp.getFileById(EXCEL_ID).getBlob();
      return moHinhTuMap_(tepBlob_(blob));
    },
    taiSheet: function () { return moSheetGia_(); },
    taiSnapshot: function () {
      var id = props_().getProperty('SNAPSHOT_FILE_ID') || BASELINE_BACKUP_ID;
      var blob = DriveApp.getFileById(id).getBlob();
      return moHinhTuMap_(tepBlob_(blob)).moHinh;
    },
    exportXlsx: function () {
      var url = 'https://www.googleapis.com/drive/v3/files/' + GSHEET_ID + '/export?mimeType=' + encodeURIComponent(XLSX_MIME);
      var resp = UrlFetchApp.fetch(url, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (resp.getResponseCode() !== 200) throw new Error('export lỗi HTTP ' + resp.getResponseCode());
      return resp.getBlob().setContentType(XLSX_MIME).setName(EXPECTED_TITLE);
    },
    unzip: function (blob) { return tepBlob_(blob); },
    zip: function (files) { return zipTep_(files); },
    updateExcel: function (blob) { return ghiExcelCungId_(blob); },
    saoLuu: function (luc) {
      var tem = String(luc || '').replace(/[^\d]/g, '');
      var excelCopy = saoChepFile_(EXCEL_ID, 'PHIEU BAO GIA VAN PHAT - 2026_BACKUP_' + tem + '.xlsx');
      var sheetCopy = saoChepFile_(GSHEET_ID, 'PHIEU BAO GIA VAN PHAT - 2026_BACKUP_' + tem + ' SHEET');
      return { excelId: excelCopy.id, sheetId: sheetCopy.id, luc: luc };
    },
    capNhatSnapshot: function (blob, snapId) { return capNhatSnapshotThat_(blob, snapId); },
    apDung: function (plan) { return apDungKeHoach_(SpreadsheetApp.openById(GSHEET_ID), plan); },
    ghiNhatKy: function (plan, luc) { return ghiNhatKy_(moSoNhatKy_(), plan, luc); },
    getProp: function (k) { return props_().getProperty(k) || ''; },
    setProp: function (k, v) { props_().setProperty(k, v == null ? '' : String(v)); },
    log: function (m) { Logger.log(m); console.log(m); },
    isDryRun: function () { return String(props_().getProperty('DRY_RUN') || '').trim().toLowerCase() === 'true'; },
    tryLock: function () { return LockService.getScriptLock().tryLock(20000); },
    releaseLock: function () {
      try { LockService.getScriptLock().releaseLock(); } catch (e) { /* đã nhả */ }
    }
  };
}

function dongBoHaiChieu() {
  return dongBoVong_(taoDepsThat_(), {});
}

function chayDryRun() {
  return dongBoVong_(taoDepsThat_(), { dryRun: true, boQuaLich: true });
}

function chayDongBo() {
  return dongBoVong_(taoDepsThat_(), { boQuaLich: true });
}

function caiTriggerDongBo() {
  goTriggerDongBo();
  ScriptApp.newTrigger(HANDLER_DONG_BO).timeBased().everyMinutes(15).create();
  return 'Đã gắn 1 trigger ' + HANDLER_DONG_BO + ' mỗi 15 phút. Gỡ trigger xuatBaoGiaTheoGio trong project VanPhat Xuat Excel trước khi để lịch này chạy.';
}

function goTriggerDongBo() {
  var all = ScriptApp.getProjectTriggers();
  var n = 0;
  var i;
  for (i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === HANDLER_DONG_BO) {
      ScriptApp.deleteTrigger(all[i]);
      n++;
    }
  }
  return 'Đã gỡ ' + n + ' trigger ' + HANDLER_DONG_BO + '.';
}

function taoSoNhatKy() {
  var ss = moSoNhatKy_();
  damBaoTab_(ss, TEN_LOG, COT_LOG);
  damBaoTab_(ss, TEN_XUNG_DOT, COT_XUNG);
  return 'Sổ nhật ký ' + ss.getId();
}
