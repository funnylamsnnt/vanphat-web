/**
 * Hằng đồng bộ hai chiều Excel ↔ Google Sheet giá.
 * Không có token, Client ID, mật khẩu. Không gọi KiotViet.
 *
 * Excel (xlsx, giữ định dạng Office): EXCEL_ID.
 * Google Sheet giá: GSHEET_ID.
 * Bản chụp nền lượt đầu (sao lưu 12:40 ngày 24/10/2026): BASELINE_BACKUP_ID.
 * Script không bao giờ ghi đè file bản chụp nền này.
 */

var GSHEET_ID = '1Hwslun92TLrhXAMgiVDdd6wyvVXP6sqOQbuTKiLKRrM';
var EXCEL_ID = '1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR';
var EXPECTED_TITLE = 'PHIEU BAO GIA VAN PHAT - 2026.xlsx';
var BASELINE_BACKUP_ID = '1FgWLfap4NZXWH-oyjRAIgLkgQNdDFVQP';
var BASELINE_BACKUP_NAME = 'PHIEU BAO GIA VAN PHAT - 2026_BACKUP_20261024_1240.xlsx';
var TEN_SHEET_DM = 'Danh Mục Vật Tư';
var TEN_GEMINI = 'Cấu Hình API Gemini';
var TEN_LOG = 'SYNC_Log';
var TEN_XUNG_DOT = 'SYNC_XungDot';
var TEN_SO_NHAT_KY = 'VanPhat SYNC Nhat Ky';
var HANDLER_DONG_BO = 'dongBoHaiChieu';
var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
var MIN_XLSX_BYTES = 1000000;
var NGUONG_XOA_DONG = 10;

var SHEET_NAMES = [
  'Đơn Đặt Hàng',
  'Danh Mục Vật Tư',
  'Hóa Đơn Đầu Vào',
  'Hóa Đơn Đầu Ra',
  'Quản Lý Nhóm',
  'LIST KHACH HANG',
  'Chính Sách Đối Tác',
  'Lịch Sử Xuất Kho',
  'Chi Tiết Đơn Hàng',
  'Sổ Kho - Nhập Xuất Tồn',
  'Báo Cáo Lợi Nhuận SP',
  'Báo Cáo LN Khách Hàng',
  'Cấu Hình API Gemini'
];

var COT_LOG = ['luc', 'tab', 'khoa', 'cot', 'o', 'nguon', 'gia_tri_cu', 'gia_tri_moi', 'ghi_chu'];
var COT_XUNG = [
  'luc', 'tab', 'khoa', 'cot', 'o',
  'gia_tri_nen', 'gia_tri_excel', 'gia_tri_sheet',
  'ket_luan', 'modified_excel', 'modified_sheet'
];

/**
 * Tiêu đề đã đối chiếu trên Sheet giá ngày 24/10/2026.
 * cheDo khoa: đồng bộ theo khóa dòng.
 * cheDo o: đồng bộ từng ô (phiếu in, không có khóa dòng).
 * cheDo cong-thuc: tab công thức, không ghi đè.
 * cheDo cam: không đọc, không ghi, không đưa nội dung vào log.
 * cotChiExcel: chỉ giữ trên Excel, không xóa, không lấy giá trị từ Sheet đè lên.
 */
var CAU_HINH_TAB = [
  { ten: 'Đơn Đặt Hàng', cheDo: 'o' },
  {
    ten: 'Danh Mục Vật Tư',
    cheDo: 'khoa',
    khoa: ['Mã SP'],
    cotGia: 'Đơn Giá (Gồm VAT 8%)',
    lienTucVp: true,
    tieuDe: [
      'Nhóm Hàng', 'Mã SP', 'Tên Sản Phẩm', 'ĐVT', 'Đơn Giá (Gồm VAT 8%)',
      'Link Hình Ảnh', 'Số TT Mã (hỗ trợ)', 'Hóa Đơn VÀO (Giá Vốn BQ, Có VAT 8%)',
      'Tổng Nhập', 'Tổng Xuất', 'Tồn Kho', 'Định Mức Tối Thiểu', 'Trạng Thái Cảnh Báo',
      'Nguồn tồn kho (tự cập nhật: dòng nhập / xuất)', 'Mã vạch', 'Ghi chú mã vạch',
      'Độ trùng tên (%)', 'Ghi chú trùng', 'Thương Hiệu', 'Quy Cách'
    ],
    batBuocSheet: ['Nhóm Hàng', 'Mã SP', 'Tên Sản Phẩm', 'ĐVT', 'Đơn Giá (Gồm VAT 8%)', 'Link Hình Ảnh'],
    batBuocExcel: ['Mã SP', 'Đơn Giá (Gồm VAT 8%)', 'Độ trùng tên (%)', 'Ghi chú trùng', 'Thương Hiệu', 'Quy Cách'],
    viTriExcel: { 'Mã SP': 1, 'Đơn Giá (Gồm VAT 8%)': 4, 'Thương Hiệu': 18, 'Quy Cách': 19 },
    cotCongThuc: [
      'Số TT Mã (hỗ trợ)', 'Tổng Nhập', 'Tổng Xuất', 'Tồn Kho',
      'Định Mức Tối Thiểu', 'Trạng Thái Cảnh Báo',
      'Nguồn tồn kho (tự cập nhật: dòng nhập / xuất)'
    ],
    cotChiExcel: ['Độ trùng tên (%)', 'Ghi chú trùng', 'Thương Hiệu', 'Quy Cách']
  },
  {
    ten: 'Hóa Đơn Đầu Vào',
    cheDo: 'khoa',
    khoa: ['Số Hóa Đơn', 'Mã SP'],
    tieuDe: [
      'STT', 'Số Hóa Đơn', 'Ký Hiệu', 'Ngày Lập HĐ', 'Nhà Cung Cấp', 'Mã Số Thuế', 'Mã SP',
      'Tên Hàng Hóa / Quy Cách', 'ĐVT', 'Số Lượng', 'Đơn Giá Chưa Thuế', 'Thành Tiền Chưa Thuế',
      'Thuế Suất', 'Tiền Thuế VAT', 'Tổng Thanh Toán', 'Nhóm Hàng'
    ],
    batBuocSheet: ['Số Hóa Đơn', 'Mã SP'],
    batBuocExcel: ['Số Hóa Đơn', 'Mã SP']
  },
  {
    ten: 'Hóa Đơn Đầu Ra',
    cheDo: 'khoa',
    khoa: ['Số Hóa Đơn', 'Mã SP'],
    tieuDe: [
      'STT', 'Số Hóa Đơn', 'Ký Hiệu', 'Ngày Lập HĐ', 'Khách Hàng', 'Mã Số Thuế', 'Mã SP',
      'Tên Hàng Hóa', 'ĐVT', 'Số Lượng', 'Đơn Giá (Có VAT)', 'Thành Tiền Chưa Thuế',
      'Thuế Suất', 'Tiền Thuế VAT', 'Tổng Thanh Toán (có VAT)', 'Nhóm Hàng',
      'Giá Vốn BQ/Đơn Vị (có VAT)', 'Tổng Giá Vốn (có VAT)', 'Lợi Nhuận Gộp (đ)', 'Tỷ Suất LN (%)'
    ],
    batBuocSheet: ['Số Hóa Đơn', 'Mã SP'],
    batBuocExcel: ['Số Hóa Đơn', 'Mã SP']
  },
  {
    ten: 'Quản Lý Nhóm',
    cheDo: 'khoa',
    khoa: ['Tên Nhóm Hàng'],
    tieuDe: ['STT', 'Tên Nhóm Hàng'],
    batBuocSheet: ['Tên Nhóm Hàng'],
    batBuocExcel: ['Tên Nhóm Hàng']
  },
  {
    ten: 'LIST KHACH HANG',
    cheDo: 'khoa',
    khoa: ['Mã số thuế'],
    khoaPhu: ['Khách hàng'],
    tieuDe: ['STT', 'Khách hàng', 'Mã số thuế', 'Địa chỉ', 'Email'],
    batBuocSheet: ['Mã số thuế', 'Khách hàng'],
    batBuocExcel: ['Mã số thuế', 'Khách hàng']
  },
  {
    ten: 'Chính Sách Đối Tác',
    cheDo: 'khoa',
    khoa: ['Mã Đối Tác'],
    tieuDe: [
      'STT', 'Mã Đối Tác', 'Tên Khách Hàng / Đơn Vị', 'Phân Hạng Đối Tác', 'Loại Giảm',
      'Mức Giảm', 'Đơn Tối Thiểu (đ)', 'Hạn Mức Nợ (đ)', 'Kỳ Hạn TT', 'Trạng Thái', 'Ghi Chú Nghiệp Vụ'
    ],
    batBuocSheet: ['Mã Đối Tác'],
    batBuocExcel: ['Mã Đối Tác']
  },
  {
    ten: 'Lịch Sử Xuất Kho',
    cheDo: 'khoa',
    khoa: ['Số Phiếu / Mã Đơn'],
    tieuDe: ['STT', 'Số Phiếu / Mã Đơn', 'Ngày Lập Phiếu', 'Khách Hàng', 'Số Khoản Mục', 'Tổng Thành Tiền', 'Trạng Thái'],
    batBuocSheet: ['Số Phiếu / Mã Đơn'],
    batBuocExcel: ['Số Phiếu / Mã Đơn']
  },
  {
    ten: 'Chi Tiết Đơn Hàng',
    cheDo: 'cong-thuc',
    tieuDe: [
      'Mã Đơn', 'Mã SP', 'Tên Sản Phẩm', 'ĐVT', 'Số Lượng', 'Đơn Giá Gốc', 'Đơn Giá Bán',
      'Doanh Thu (đ)', 'Đơn Giá Vốn (VAT)', 'Tổng Giá Vốn (đ)', 'Lợi Nhuận Gộp (đ)', 'Tỷ Suất LN (%)'
    ]
  },
  { ten: 'Sổ Kho - Nhập Xuất Tồn', cheDo: 'cong-thuc' },
  {
    ten: 'Báo Cáo Lợi Nhuận SP',
    cheDo: 'cong-thuc',
    tieuDe: [
      'STT', 'Mã SP', 'Tên Sản Phẩm', 'ĐVT', 'Nhóm Hàng',
      'Giá Vốn BQ hiện tại (có VAT)', 'Giá Bán Niêm Yết (có VAT)', 'LN Dự Kiến/ĐV (đ)',
      'Tỷ Suất LN Niêm Yết (%)', 'SL Đã Giao (Phiếu Giao Hàng)', 'Doanh Thu Giao Hàng (đ)',
      'Giá Vốn Hàng Đã Giao (đ)', 'Lợi Nhuận Gộp - Giao Hàng (đ)', 'Tỷ Suất LN Gộp (%)',
      'SL Đã Xuất HĐ GTGT', 'Doanh Thu HĐ GTGT (có VAT, đ)'
    ]
  },
  {
    ten: 'Báo Cáo LN Khách Hàng',
    cheDo: 'cong-thuc',
    tieuDe: [
      'STT', 'Mã Đơn', 'Ngày Lập', 'Khách Hàng (đầy đủ)', 'Tên Khách', 'SĐT', 'Tháng', 'Quý', 'Năm',
      'Doanh Thu (đ)', 'Giá Vốn (đ)', 'Lợi Nhuận (đ)', 'Tỷ Suất LN (%)', 'Trạng Thái'
    ]
  },
  { ten: 'Cấu Hình API Gemini', cheDo: 'cam' }
];

function timCauHinh_(ten) {
  var i;
  for (i = 0; i < CAU_HINH_TAB.length; i++) {
    if (CAU_HINH_TAB[i].ten === ten) return CAU_HINH_TAB[i];
  }
  return null;
}

function idCamGhi_(id) {
  return String(id || '') === BASELINE_BACKUP_ID;
}
