/**
 * Đọc danh mục vật tư. Chỉ đọc.
 * «Đơn Giá» trên sheet Danh Mục Vật Tư là giá bán. Hàm này chỉ cấp Mã, Tên và Đơn giá
 * để điền DM_GiaVon!C. Không ghi DM_GiaVon và không ghi cột D.
 * Giá vốn là DM_GiaVon!D «Giá vốn BQ có VAT», do script «Cập nhật giá vốn» ghi mỗi giờ.
 * ChiTiet_LN!J tra theo cột N nhập tay, rồi cột M tên ghép, rồi mã SP cột C. Không ghi J.
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
    cot: tomTatDanhMuc_(headers),
    giaiThich: giaiThichGiaVon_()
  };
}

function kiemTraNguonGiaVon() {
  var doc = docDanhMucVatTu();
  var ss = moSo_();
  var cfg = docConfig_(ss);
  khoaSoDung_(ss, cfg);
  var sh = taoSheetNeuThieu_(ss, 'CN_SucKhoe');
  var chu = 'Đọc ' + doc.soDong + ' dòng từ «' + doc.sheetName +
    '». Cấp Mã/Tên/Đơn giá cho DM_GiaVon!C (cột mã=' + doc.cot.cotMa +
    ', tên=' + doc.cot.cotTen + ', đơn giá=' + doc.cot.cotDonGia +
    '). Đơn Giá là giá bán, không phải giá vốn. Giá vốn = DM_GiaVon!D «Giá vốn BQ có VAT», script Cập nhật giá vốn ghi mỗi giờ. Hàm này không ghi cột D.';
  var dong = Math.max(sh.getLastRow() + 1, 3);
  ghiBang_(sh, dong, 1, [[dinhDangLuc_(new Date(), cfg.TZ), 'GIA_VON_DOC', 'OK', doc.sheetName, chu]]);
  return chu;
}
