/**
 * Xuất Google Sheet giá chính thành revision mới của đúng file Excel.
 * Trigger thời gian gọi xuatBaoGiaTheoGio. Guard trượt thì không gọi Drive.Files.update.
 * Không tạo file mới (không Files.create, không Files.copy).
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
}

function ketThat_(deps, lyDo, kiem) {
  var obj = { ok: false, ghi: false, muc: 'KHONG_GHI', lyDo: lyDo };
  if (kiem && kiem.errs) obj.errs = kiem.errs;
  if (kiem && kiem.notes) obj.notes = kiem.notes;
  ghiKet_(deps, obj);
  if (deps.setProp) deps.setProp('LAST_GUARD_JSON', catJson_(obj));
  return {
    ok: false,
    ghi: false,
    errs: kiem && kiem.errs ? kiem.errs : [lyDo],
    notes: kiem ? kiem.notes : []
  };
}

/**
 * deps: gsheetMeta, excelMeta, exportXlsx, downloadExcel, unzip, updateExcel,
 * getProp, setProp, log, isDryRun.
 * opts.dryRun: không ghi. opts.force: bỏ qua modifiedTime, không bỏ qua guard.
 * opts.minBytes: chỉ dùng khi test.
 */
function xuatBaoGiaVong_(deps, opts) {
  opts = opts || {};
  var minBytes = opts.minBytes == null ? MIN_XLSX_BYTES : opts.minBytes;
  var gmeta = deps.gsheetMeta();
  var emeta = deps.excelMeta();
  if (!emeta || emeta.id !== EXCEL_ID || emeta.name !== EXPECTED_TITLE) {
    return ketThat_(deps, 'Excel id/tên sai: ' + (emeta && emeta.id) + ' ' + (emeta && emeta.name));
  }
  var since = opts.since != null ? String(opts.since) : String((deps.getProp && deps.getProp('LAST_SHEET_MODIFIED_TIME')) || '');
  if (!opts.force && since && gmeta && gmeta.modifiedTime && since === String(gmeta.modifiedTime)) {
    var ly = 'Sheet không đổi kể từ lần xuất trước: ' + since;
    ghiKet_(deps, { ok: true, skipped: true, ghi: false, muc: 'KHONG_DOI', lyDo: ly });
    return { ok: true, skipped: true, ghi: false, lyDo: ly, gsheet: gmeta };
  }
  var blob = deps.exportXlsx();
  if (!laXlsxBlob_(blob, minBytes)) return ketThat_(deps, 'file xuất từ Sheet không phải xlsx hợp lệ');
  var cur = deps.downloadExcel();
  if (!laXlsxBlob_(cur, minBytes)) return ketThat_(deps, 'Excel hiện tại không phải xlsx hợp lệ');
  var kiem;
  try {
    kiem = kiemTraXuat_(docCatalogTuBlob_(blob, deps.unzip), docCatalogTuBlob_(cur, deps.unzip));
  } catch (err) {
    return ketThat_(deps, String(err && err.message ? err.message : err));
  }
  if (!kiem.ok) return ketThat_(deps, kiem.errs.join(' || '), kiem);
  var dry = !!(opts.dryRun || (deps.isDryRun && deps.isDryRun()));
  if (dry) {
    var dryObj = {
      ok: true,
      dryRun: true,
      ghi: false,
      muc: 'DRY_RUN',
      bytes: doDaiBlob_(blob),
      notes: kiem.notes,
      gsheet: gmeta,
      excel: { id: emeta.id, name: emeta.name, version: emeta.version }
    };
    ghiKet_(deps, dryObj);
    return dryObj;
  }
  var after = deps.updateExcel(blob);
  if (!after || after.id !== EXCEL_ID || after.name !== EXPECTED_TITLE) {
    throw new Error('id/tên sau khi ghi sai: ' + (after && after.id) + ' ' + (after && after.name));
  }
  if (gmeta && gmeta.modifiedTime) deps.setProp('LAST_SHEET_MODIFIED_TIME', String(gmeta.modifiedTime));
  if (after.version != null) deps.setProp('LAST_EXCEL_VERSION', String(after.version));
  if (after.md5Checksum) deps.setProp('LAST_EXCEL_MD5', String(after.md5Checksum));
  ghiKet_(deps, { muc: 'DA_GHI', notes: kiem.notes, version: after.version, modifiedTime: gmeta && gmeta.modifiedTime });
  if (deps.setProp) deps.setProp('LAST_GUARD_JSON', '');
  return { ok: true, exported: true, ghi: true, muc: 'DA_GHI', gsheet: gmeta, before: emeta, after: after, notes: kiem.notes };
}

function xuatBaoGiaTheoGioVong_(deps, now) {
  var q = quyetDinhLich_(now || new Date());
  if (!q.chay) {
    ghiKet_(deps, { ok: true, skipped: true, ghi: false, muc: 'BO_QUA_LICH', lyDo: q.lyDo, luc: dinhDangSaigon_(now || new Date()) });
    return { ok: true, skipped: true, ghi: false, lyDo: q.lyDo };
  }
  return xuatBaoGiaVong_(deps, { dryRun: false });
}

function tepTuBlob_(blob) {
  var nguon = blob && typeof blob.getBlob === 'function' ? blob.getBlob() : blob;
  var parts = Utilities.unzip(nguon);
  var map = {};
  var i;
  for (i = 0; i < parts.length; i++) map[parts[i].getName()] = parts[i].getDataAsString('UTF-8');
  return map;
}

/** Ghi đè đúng file Excel. Drive.Files.update tạo revision mới, không tạo file khác. */
function ghiExcelCungId_(blob) {
  var r = Drive.Files.update(
    { name: EXPECTED_TITLE, mimeType: XLSX_MIME },
    EXCEL_ID,
    blob,
    {
      keepRevisionForever: false,
      supportsAllDrives: true,
      fields: 'id,name,md5Checksum,modifiedTime,version,size'
    }
  );
  if (!r || r.id !== EXCEL_ID || r.name !== EXPECTED_TITLE) {
    throw new Error('id/tên sau khi ghi sai: ' + (r && r.id) + ' ' + (r && r.name));
  }
  return r;
}

function taoDepsThat_() {
  return {
    gsheetMeta: function () {
      return Drive.Files.get(GSHEET_ID, {
        fields: 'id,name,modifiedTime,version,mimeType',
        supportsAllDrives: true
      });
    },
    excelMeta: function () {
      return Drive.Files.get(EXCEL_ID, {
        fields: 'id,name,md5Checksum,modifiedTime,size,version',
        supportsAllDrives: true
      });
    },
    exportXlsx: function () {
      var url = 'https://www.googleapis.com/drive/v3/files/' + GSHEET_ID +
        '/export?mimeType=' + encodeURIComponent(XLSX_MIME);
      var resp = UrlFetchApp.fetch(url, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (resp.getResponseCode() !== 200) throw new Error('export lỗi HTTP ' + resp.getResponseCode());
      return resp.getBlob().setContentType(XLSX_MIME).setName(EXPECTED_TITLE);
    },
    downloadExcel: function () {
      return DriveApp.getFileById(EXCEL_ID).getBlob();
    },
    unzip: function (blob) { return tepTuBlob_(blob); },
    updateExcel: function (blob) { return ghiExcelCungId_(blob); },
    getProp: function (k) { return props_().getProperty(k) || ''; },
    setProp: function (k, v) { props_().setProperty(k, v == null ? '' : String(v)); },
    log: function (m) { Logger.log(m); console.log(m); },
    isDryRun: function () { return String(props_().getProperty('DRY_RUN') || '').trim().toLowerCase() === 'true'; }
  };
}

/** Trigger mỗi giờ. Tự bỏ khung 8:05–8:25, 14:05–14:25 và ngoài 7h–21h. */
function xuatBaoGiaTheoGio() {
  return xuatBaoGiaTheoGioVong_(taoDepsThat_(), new Date());
}

/** Chạy tay, không ghi, vẫn chạy đủ guard. Bỏ qua lịch. */
function chayDryRun() {
  return xuatBaoGiaVong_(taoDepsThat_(), { dryRun: true });
}

/** Chạy tay và ghi nếu guard đạt. Vẫn tôn trọng Script Property DRY_RUN=true. Bỏ qua lịch. */
function chayXuatBaoGia() {
  return xuatBaoGiaVong_(taoDepsThat_(), { dryRun: false });
}

/** Bỏ qua mốc modifiedTime đã lưu. Guard vẫn chặn nếu trượt. */
function chayXuatBatKeModified() {
  return xuatBaoGiaVong_(taoDepsThat_(), { dryRun: false, force: true });
}

function caiTriggerXuatBaoGia() {
  goTriggerXuatBaoGia();
  var ke = keHoachTrigger_();
  ke.forEach(function (m) {
    ScriptApp.newTrigger(m.ham).timeBased().atHour(m.gio).nearMinute(m.phut).everyDays(1).create();
  });
  return 'Đã gắn ' + ke.length + ' trigger ' + HANDLER_XUAT + ', mỗi giờ phút :33 từ 7h đến 21h (Asia/Saigon).';
}

function goTriggerXuatBaoGia() {
  var all = ScriptApp.getProjectTriggers();
  var n = 0;
  var i;
  for (i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === HANDLER_XUAT) {
      ScriptApp.deleteTrigger(all[i]);
      n++;
    }
  }
  return 'Đã gỡ ' + n + ' trigger ' + HANDLER_XUAT + '. Trigger khác của project giữ nguyên.';
}
