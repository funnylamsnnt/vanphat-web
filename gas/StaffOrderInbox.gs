/**
 * Vạn Phát — Staff order inbox (Apps Script)
 *
 * Deploy → Deploy as web app → Execute as: Me → Who has access: Anyone
 * Copy the Web app URL into js/staff-order.js → STAFF_INBOX_GAS_URL
 *
 * Spreadsheet: 1Nq_Ts5j579y_lJud3JtYO0m2b9hvtRuqDle8DMm7Zyg
 * Columns: Thời gian | Mã đơn | Nhân viên | Cửa hàng | Khách hàng | SĐT | Ghi chú
 *          | Mã SP | Tên SP | ĐVT | SL | Đơn giá bán | Thành tiền | Tổng đơn | Nguồn
 * One row per line item (order meta repeated).
 */

var SPREADSHEET_ID = "1Nq_Ts5j579y_lJud3JtYO0m2b9hvtRuqDle8DMm7Zyg";
var SHEET_NAME = "DonNV"; // create this tab if missing

function doOptions(e) {
  return corsResponse({});
}

function doGet(e) {
  return corsResponse({ ok: true, service: "VanPhat StaffOrderInbox" });
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || "";
    var data = {};
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return corsResponse({ ok: false, error: "Invalid JSON" }, 400);
    }

    var items = data.items || [];
    if (!items.length) {
      return corsResponse({ ok: false, error: "No items" }, 400);
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        "Thời gian",
        "Mã đơn",
        "Nhân viên",
        "Cửa hàng",
        "Khách hàng",
        "SĐT",
        "Ghi chú",
        "Mã SP",
        "Tên SP",
        "ĐVT",
        "SL",
        "Đơn giá bán",
        "Thành tiền",
        "Tổng đơn",
        "Nguồn",
      ]);
    }

    var now = Utilities.formatDate(
      new Date(),
      "Asia/Ho_Chi_Minh",
      "yyyy-MM-dd HH:mm:ss"
    );
    var orderId = data.orderId || "";
    var staff = data.staff || "";
    var shop = data.shop || "";
    var customer = data.customer || "";
    var phone = data.phone || "";
    var note = data.note || "";
    var total = Number(data.total) || 0;
    var source = data.source || "staff";

    var rows = items.map(function (it) {
      var qty = Number(it.qty) || 0;
      var gia = Number(it.gia) || 0;
      var thanh =
        it.thanhTien != null ? Number(it.thanhTien) : qty * gia;
      return [
        now,
        orderId,
        staff,
        shop,
        customer,
        phone,
        note,
        it.ma || "",
        it.ten || "",
        it.dvt || "",
        qty,
        gia,
        thanh,
        total,
        source,
      ];
    });

    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
      .setValues(rows);

    return corsResponse({
      ok: true,
      orderId: orderId,
      rows: rows.length,
    });
  } catch (err) {
    return corsResponse({ ok: false, error: String(err) }, 500);
  }
}

function corsResponse(obj, status) {
  var out = ContentService.createTextOutput(
    JSON.stringify(obj)
  ).setMimeType(ContentService.MimeType.JSON);
  // Apps Script web apps: CORS handled via redirect for simple requests;
  // client posts text/plain to avoid preflight. Status codes beyond 200
  // are limited; body.ok carries success.
  return out;
}
