/**
 * Cổng ghi duy nhất. Mọi setValue/setValues/setFormula/clearContent/insertSheet
 * phải nằm trong file này. Sheet ngoài CN_HangDoi, CN_SucKhoe, CONFIG bị chặn.
 * DM_KhachHang!AD2:AD501 bị chặn kể cả khi sau này bị đưa nhầm vào danh sách.
 */

function taoSheetNeuThieu_(ss, ten) {
  camGhiSheet_(ten);
  var sh = ss.getSheetByName(ten);
  if (!sh) sh = ss.insertSheet(ten);
  return sh;
}

function ghiBang_(sheet, row, col, values) {
  if (!values || !values.length || !values[0] || !values[0].length) return;
  assertGhiChoPhep_(sheet.getName(), {
    row: row,
    column: col,
    numRows: values.length,
    numColumns: values[0].length
  });
  sheet.getRange(row, col, values.length, values[0].length).setValues(values);
}

function ghiO_(sheet, row, col, value) {
  assertGhiChoPhep_(sheet.getName(), {
    row: row,
    column: col,
    numRows: 1,
    numColumns: 1
  });
  sheet.getRange(row, col).setValue(value);
}

function ghiCongThuc_(sheet, row, col, formula) {
  assertGhiChoPhep_(sheet.getName(), {
    row: row,
    column: col,
    numRows: 1,
    numColumns: 1
  });
  sheet.getRange(row, col).setFormula(formula);
}

function xoaVung_(sheet, row, col, numRows, numColumns) {
  if (numRows < 1 || numColumns < 1) return;
  assertGhiChoPhep_(sheet.getName(), {
    row: row,
    column: col,
    numRows: numRows,
    numColumns: numColumns
  });
  sheet.getRange(row, col, numRows, numColumns).clearContent();
}
