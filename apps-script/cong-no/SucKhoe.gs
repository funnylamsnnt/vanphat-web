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
    var bay = new Date();
    var hhTruoc = docMocThieuHh_();
    var inpSk = {
      phieuGiaoA1: pg ? pg.getRange(1, 1).getDisplayValue() : '',
      headerChapNhan: cfg.HEADER_PHIEU_GIAO,
      coLog: !!log,
      logHeader: logHeader,
      logTail: logTail,
      logLucCuoi: logLuc,
      bayGio: bay,
      staleGio: cfg.LOG_STALE_GIO,
      hhThieu: hhTruoc,
      sheets: sheets
    };
    var bao = lapBaoCaoSucKhoe_(inpSk);
    if (inpSk.hhThieuSau) luuMocThieuHh_(inpSk.hhThieuSau);
    var luc = dinhDangLuc_(bay, cfg.TZ);
    var bang = [];
    for (i = 0; i < bao.length; i++) {
      bang.push([luc, bao[i].ma, bao[i].muc, bao[i].doiTuong, bao[i].chiTiet]);
    }
    var lastRow = sh.getLastRow();
    var giuCat = [];
    if (lastRow > 2) {
      giuCat = giuDongCatLuot_(sh.getRange(3, 1, lastRow - 2, 5).getValues(), bay);
      xoaVung_(sh, 3, 1, lastRow - 2, 5);
    }
    ghiO_(sh, 1, 1, 'Cập nhật');
    ghiO_(sh, 1, 2, luc);
    ghiO_(sh, 1, 3, 'Số lỗi');
    ghiBang_(sh, 2, 1, [['Thời điểm', 'Mã', 'Mức', 'Đối tượng', 'Chi tiết']]);
    if (bang.length) ghiBang_(sh, 3, 1, bang);
    if (giuCat.length) ghiBang_(sh, 3 + bang.length, 1, giuCat);
    capNhatODem_(ss);
  } finally {
    lock.releaseLock();
  }
}

var KHOA_HH_THIEU = 'CN_HH_THIEU_MOC';

function docMocThieuHh_() {
  var raw = PropertiesService.getScriptProperties().getProperty(KHOA_HH_THIEU);
  if (!raw) return {daKhoiTao: false, moc: {}};
  try {
    var o = JSON.parse(raw);
    if (!o || !o.moc) return {daKhoiTao: false, moc: {}};
    return {daKhoiTao: true, moc: o.moc};
  } catch (e) {
    return {daKhoiTao: false, moc: {}};
  }
}

function luuMocThieuHh_(phan) {
  PropertiesService.getScriptProperties().setProperty(KHOA_HH_THIEU, JSON.stringify({
    moc: phan && phan.moc ? phan.moc : {}
  }));
}

function capNhatODem_(ss) {
  var hang = ss.getSheetByName('CN_HangDoi');
  if (hang) {
    var soCan = 0;
    var lastHang = hang.getLastRow();
    if (lastHang >= 2) {
      var trang = hang.getRange(2, 6, lastHang - 1, 1).getDisplayValues();
      var ds = [];
      var r;
      for (r = 0; r < trang.length; r++) ds.push(String(trang[r][0] || ''));
      soCan = demCanBot_(ds);
    }
    ghiO_(hang, 1, 26, soCan);
  }
  var sk = ss.getSheetByName('CN_SucKhoe');
  if (!sk) return 0;
  var last = sk.getLastRow();
  var soLoi = 0;
  if (last >= 3) {
    soLoi = demLoiMuc_(sk.getRange(3, 3, last - 2, 1).getDisplayValues());
  }
  if (sk.getRange(1, 3).getValue() !== 'Số lỗi') ghiO_(sk, 1, 3, 'Số lỗi');
  // Mỗi lượt ghi lại số dòng mức đúng chữ LỖI vào CN_SucKhoe!D1, sau khi bảng sức khỏe và dòng QUET_CAT còn giữ đã nằm trên sheet.
  ghiO_(sk, 1, 4, soLoi);
  ghiO_(sk, 1, 26, '');
  return soLoi;
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
