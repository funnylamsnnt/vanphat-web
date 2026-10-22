/**
 * Kiểm tra sức khỏe sổ, chuyển từ chk.py. Chỉ đọc sheet nghiệp vụ.
 * Kết quả ghi vào CN_SucKhoe.
 */

function quetSucKhoe() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var ss = moSo_();
    damBaoConfig_(ss);
    var cfg = docConfig_(ss);
    khoaSoDung_(ss, cfg);
    var sh = taoSheetNeuThieu_(ss, 'CN_SucKhoe');
    var sheets = {};
    var i;
    for (i = 0; i < SHEET_CAN_DOC.length; i++) {
      var ten = SHEET_CAN_DOC[i];
      var ws = ss.getSheetByName(ten);
      sheets[ten] = ws ? ws.getDataRange().getDisplayValues() : null;
    }
    var pg = ss.getSheetByName('PhieuGiao');
    var log = ss.getSheetByName('Log_CapNhat');
    var logHeader = '';
    var logTail = [];
    var logLuc = '';
    if (log && log.getLastRow() >= 1) {
      logHeader = String(log.getRange(1, 1).getDisplayValue() || '');
      var last = log.getLastRow();
      if (last >= 2) {
        var so = Math.min(3, last - 1);
        logTail = log.getRange(last - so + 1, 1, so, 3).getDisplayValues();
        logLuc = log.getRange(last, 1).getValue();
      }
    }
    var bao = lapBaoCaoSucKhoe_({
      phieuGiaoA1: pg ? pg.getRange(1, 1).getDisplayValue() : '',
      headerChapNhan: cfg.HEADER_PHIEU_GIAO,
      coLog: !!log,
      logHeader: logHeader,
      logTail: logTail,
      logLucCuoi: logLuc,
      bayGio: new Date(),
      staleGio: cfg.LOG_STALE_GIO,
      sheets: sheets
    });
    var luc = dinhDangLuc_(new Date(), cfg.TZ);
    var bang = [];
    for (i = 0; i < bao.length; i++) {
      bang.push([luc, bao[i].ma, bao[i].muc, bao[i].doiTuong, bao[i].chiTiet]);
    }
    var lastRow = sh.getLastRow();
    if (lastRow > 2) xoaVung_(sh, 3, 1, lastRow - 2, 5);
    ghiO_(sh, 1, 1, 'Cập nhật');
    ghiO_(sh, 1, 2, luc);
    ghiO_(sh, 1, 3, 'Số lỗi');
    ghiO_(sh, 1, 4, demMuc_(bao, 'LỖI'));
    ghiBang_(sh, 2, 1, [['Thời điểm', 'Mã', 'Mức', 'Đối tượng', 'Chi tiết']]);
    if (bang.length) ghiBang_(sh, 3, 1, bang);
    ghiCongThuc_(sh, 1, 26, congThucDemLoi_());
  } finally {
    lock.releaseLock();
  }
}

function ghiLoiQuet_(ss, cfg, baoCao) {
  if (!baoCao) return;
  var sh = taoSheetNeuThieu_(ss, 'CN_SucKhoe');
  if (sh.getRange(1, 1).getValue() !== 'Cập nhật') {
    ghiO_(sh, 1, 1, 'Cập nhật');
    ghiO_(sh, 1, 3, 'Số lỗi');
    ghiBang_(sh, 2, 1, [['Thời điểm', 'Mã', 'Mức', 'Đối tượng', 'Chi tiết']]);
  }
  var dong = Math.max(sh.getLastRow() + 1, 3);
  ghiBang_(sh, dong, 1, [[
    dinhDangLuc_(new Date(), cfg && cfg.TZ),
    baoCao.ma,
    baoCao.muc,
    baoCao.doiTuong,
    baoCao.chiTiet
  ]]);
}
