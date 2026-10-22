/**
 * File này tên CN_GiaVon.gs vì project v7 đã có file giá vốn cũ tên GiaVon.gs.
 * Không đè file cũ. Không đổi tên hàm capNhatGiaVon hay caiTriggerGiaVon.
 *
 * Đọc danh mục bằng SpreadsheetApp từ Google Sheet (GIA_VON_SHEET_ID),
 * sheet «Danh Mục Vật Tư». Không đọc file Excel sao chép.
 * «Đơn Giá» là giá bán, chỉ để cấp Mã, Tên và Đơn giá cho DM_GiaVon!C.
 * Không ghi DM_GiaVon. Cột D «Giá vốn BQ có VAT» giữ cách tính của script cũ,
 * trigger capNhatGiaVon vẫn chạy mỗi giờ.
 * ChiTiet_LN!J tra theo cột N, rồi cột M, rồi mã SP. Không ghi J.
 */

function docDanhMucVatTu() {
  var cfg = docConfig_(moSo_());
  var ss = SpreadsheetApp.openById(cfg.GIA_VON_SHEET_ID);
  var sh = ss.getSheetByName(cfg.GIA_VON_SHEET_NAME);
  if (!sh) throw new Error('Không thấy sheet «' + cfg.GIA_VON_SHEET_NAME + '» trong file danh mục.');
  var values = sh.getDataRange().getValues();
  var headers = values.length ? values[0] : [];
  var quy = cotGhiDanhMuc_();
  return {
    spreadsheetId: cfg.GIA_VON_SHEET_ID,
    sheetName: cfg.GIA_VON_SHEET_NAME,
    headers: headers,
    rows: values.slice(1),
    soDong: Math.max(0, values.length - 1),
    cot: tomTatDanhMuc_(headers),
    giaiThich: giaiThichGiaVon_(),
    ghiCot: quy.ghiCot,
    khongGhiCot: quy.khongGhiCot
  };
}

function kiemTraNguonGiaVon() {
  var doc = docDanhMucVatTu();
  var ss = moSo_();
  var cfg = docConfig_(ss);
  khoaSoDung_(ss, cfg);
  var sh = taoSheetNeuThieu_(ss, 'CN_SucKhoe');
  var chu = 'Đọc ' + doc.soDong + ' dòng từ Google Sheet «' + doc.sheetName +
    '» bằng SpreadsheetApp. Cấp Mã/Tên/Đơn giá cho DM_GiaVon!C (cột mã=' + doc.cot.cotMa +
    ', tên=' + doc.cot.cotTen + ', đơn giá=' + doc.cot.cotDonGia +
    '). Đơn Giá là giá bán. Không ghi cột C từ hàm này và không ghi cột D. Giá vốn cột D giữ cách tính hiện tại.';
  var dong = Math.max(sh.getLastRow() + 1, 3);
  ghiBang_(sh, dong, 1, [[dinhDangLuc_(new Date(), cfg.TZ), 'GIA_VON_DOC', 'OK', doc.sheetName, chu]]);
  return chu;
}
