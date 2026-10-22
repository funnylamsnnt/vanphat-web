/**
 * Đối soát cuối ngày, ghi mỗi dòng vào CN_DoiSoat.
 * Không đọc bill bán lẻ và không lập cảnh báo theo mốc tiền.
 */

function damBaoDoiSoat_(ss) {
  var sh = taoSheetNeuThieu_(ss, 'CN_DoiSoat');
  if (sh.getRange(1, 1).getValue() !== 'Cập nhật') {
    ghiO_(sh, 1, 1, 'Cập nhật');
    ghiO_(sh, 1, 3, 'Số dòng');
    ghiO_(sh, 1, 4, 0);
    ghiBang_(sh, 2, 1, [COT_DOI_SOAT]);
  }
  return sh;
}

function ghiBaoCaoDoiSoat_(sh, luc, rows) {
  var last = sh.getLastRow();
  if (last > 2) xoaVung_(sh, 3, 1, last - 2, COT_DOI_SOAT.length);
  ghiO_(sh, 1, 1, 'Cập nhật');
  ghiO_(sh, 1, 2, luc);
  ghiO_(sh, 1, 3, 'Số dòng');
  ghiO_(sh, 1, 4, rows.length);
  ghiBang_(sh, 2, 1, [COT_DOI_SOAT]);
  if (!rows || !rows.length) return;
  var bang = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    bang.push([
      rows[i].muc,
      rows[i].nhom,
      rows[i].doiTuong,
      rows[i].giaTri,
      rows[i].ghiChu
    ]);
  }
  ghiBang_(sh, 3, 1, bang);
}

function docLuoiDoiSoat_(ss, ten) {
  var sh = ss.getSheetByName(ten);
  if (!sh) return [];
  return sh.getDataRange().getDisplayValues();
}

function doiSoatCuoiNgay() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var ss = moSo_();
    damBaoConfig_(ss);
    var cfg = docConfig_(ss);
    khoaSoDung_(ss, cfg);
    var soLoi = capNhatODem_(ss);
    var homNay = homNayVn_(new Date());
    var hang = ss.getSheetByName('CN_HangDoi');
    var hangRows = [];
    if (hang && hang.getLastRow() >= 2) {
      var vals = hang.getRange(2, 1, hang.getLastRow() - 1, COT_HANG_DOI.length).getDisplayValues();
      var i;
      for (i = 0; i < vals.length; i++) {
        if (!vals[i][2] && !vals[i][3]) continue;
        hangRows.push({
          thoiGian: String(vals[i][0] || ''),
          ten: String(vals[i][3] || ''),
          khach: String(vals[i][4] || ''),
          trangThai: String(vals[i][5] || ''),
          modifiedTime: String(vals[i][6] || ''),
          loai: String(vals[i][7] || '')
        });
      }
    }
    var bao = lapBaoCaoDoiSoat_({
      homNay: homNay,
      hangDoi: hangRows,
      vConNo: docLuoiDoiSoat_(ss, 'V_ConNo'),
      vQuaHan: docLuoiDoiSoat_(ss, 'V_QuaHan'),
      vChoXuatHd: docLuoiDoiSoat_(ss, 'V_ChoXuatHD'),
      dashboard: chuanLuoiDashboard_(docLuoiDoiSoat_(ss, 'Dashboard')),
      soLoi: soLoi
    });
    var sh = damBaoDoiSoat_(ss);
    ghiBaoCaoDoiSoat_(sh, dinhDangLuc_(new Date(), cfg.TZ), bao);
    capNhatODem_(ss);
  } finally {
    lock.releaseLock();
  }
}
