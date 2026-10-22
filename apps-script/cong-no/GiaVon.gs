/**
 * Đọc danh mục giá từ Google Sheet. Chỉ đọc.
 * Repo không có mã script «Cập nhật giá vốn» đang gắn trên v7
 * (script đó đọc Excel 1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR và ghi Log_CapNhat).
 * Hàm này là nguồn đọc thay thế. Không ghi DM_GiaVon, không ghi file danh mục.
 */

function docDanhMucVatTu() {
  var cfg = docConfig_(moSo_());
  var ss = SpreadsheetApp.openById(cfg.GIA_VON_SHEET_ID);
  var sh = ss.getSheetByName(cfg.GIA_VON_SHEET_NAME);
  if (!sh) throw new Error('Không thấy sheet «' + cfg.GIA_VON_SHEET_NAME + '» trong file danh mục.');
  var values = sh.getDataRange().getValues();
  var headers = values.length ? values[0] : [];
  return {
    spreadsheetId: cfg.GIA_VON_SHEET_ID,
    sheetName: cfg.GIA_VON_SHEET_NAME,
    headers: headers,
    rows: values.slice(1),
    soDong: Math.max(0, values.length - 1),
    cot: tomTatDanhMuc_(headers)
  };
}

function kiemTraNguonGiaVon() {
  var doc = docDanhMucVatTu();
  var ss = moSo_();
  var cfg = docConfig_(ss);
  khoaSoDung_(ss, cfg);
  var sh = taoSheetNeuThieu_(ss, 'CN_SucKhoe');
  var chu = 'Đọc ' + doc.soDong + ' dòng từ «' + doc.sheetName +
    '». Cột mã=' + doc.cot.cotMa + ', đơn giá=' + doc.cot.cotDonGia +
    ', giá vốn=' + doc.cot.cotGiaVon + '. Không ghi giá vào sổ.';
  var dong = Math.max(sh.getLastRow() + 1, 3);
  ghiBang_(sh, dong, 1, [[dinhDangLuc_(new Date(), cfg.TZ), 'GIA_VON_DOC', 'OK', doc.sheetName, chu]]);
  return chu;
}
