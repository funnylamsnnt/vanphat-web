# Apps Script sổ công nợ v7

Script này gắn vào Google Sheet sổ công nợ v7 của Công ty Vạn Phát. Script không gọi LLM. Script chạy bằng quyền Google của chủ sổ. Repo không chứa token, mật khẩu hay file `.clasprc.json`.

Script chỉ ghi bốn sheet: `CN_HangDoi`, `CN_SucKhoe`, `CONFIG`, `CN_DoiSoat`. Mọi lệnh ghi đi qua `Ghi.gs`. Sheet khác, gồm `PhieuGiao`, `HoaDon`, `ChiTiet_LN`, `DM_GiaVon`, `HangCho_File`, bị chặn. Vùng `DM_KhachHang!AD2:AD501` bị chặn riêng. `DM_KhachHang` chỉ được đọc để đoán mã KH/KL và khi kiểm tra sức khỏe.

## Việc script làm

1. Mỗi 15 phút từ 07:00 đến 18:00 (giờ `Asia/Ho_Chi_Minh`), và một lần trong giờ 23:00: quét chứng từ mới trên Drive. Gmail tắt mặc định.
2. Mỗi giờ: kiểm tra sức khỏe sổ theo logic `chk.py`, ghi `CN_SucKhoe`. `CN_SucKhoe!D1` là số lỗi, cập nhật cuối mỗi lượt quét.
3. Hàm `docDanhMucVatTu()` nằm trong file `CN_GiaVon.gs`. Hàm đọc Google Sheet danh mục bằng `SpreadsheetApp`, không đọc Excel sao chép. Hàm cấp Mã, Tên và Đơn giá cho `DM_GiaVon!C` nhưng không ghi cột đó và không ghi cột D. Giá vốn cột D «Giá vốn BQ có VAT» giữ cách tính của script cũ.
4. Mỗi ngày lúc 19:45 (giờ `Asia/Ho_Chi_Minh`): ghi `CN_DoiSoat`. Google có thể chạy lệch khoảng 15 phút quanh mốc `nearMinute(45)`.

Quét Drive lấy mốc truy vấn là thời điểm sớm hơn giữa mốc đã lưu và đầu ngày theo giờ Việt Nam. Lần đầu chưa có mốc cũng quét từ đầu ngày, không kéo chứng từ của các ngày trước. Gmail lần đầu vẫn chỉ đặt mốc, không kéo thư cũ.

## Cấu hình đã điền

Sheet `CONFIG` được tạo với các khóa sau. Sửa trên sheet thì lần chạy sau dùng giá trị mới. Không ghi đè ô anh đã sửa.

| Khóa | Giá trị |
|---|---|
| `DRIVE_FOLDER_ID` | `1KAyFZVJJCqu92Swk5JgX15YY0fZDpdrl` |
| `V7_SPREADSHEET_ID` | `1jkmfMIJsoZrDlOxmkqbj44GOsNb1eh3UNk3Tyn0MaJs` |
| `GMAIL_BAT` | `FALSE` |
| `GMAIL_FROM` | `congtytnhhvanphat999@gmail.com` |
| `GIA_VON_SHEET_ID` | `1Hwslun92TLrhXAMgiVDdd6wyvVXP6sqOQbuTKiLKRrM` |
| `GIA_VON_SHEET_NAME` | `Danh Mục Vật Tư` |
| `BO_QUA_THU_MUC` | `1. VAO` |
| `TEN_KHACH` | `2. DANH SACH KHACH HANG` (khớp thêm tên `STT2`) |
| `TEN_HOA_DON` | `9. HOA DON` (khớp thêm tên `STT9`) |
| `TEN_RA` | `2. RA` |
| `TEN_BG` | `8. PHIẾU BÁO GIÁ` |
| `HEADER_PHIEU_GIAO` | `Mã PG (khóa)` và các cụm dự phòng `Mã PG`, `Mã Phiếu`, `Mã phiếu` |
| `LOAI_TRU_FILE_ID` | `1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR`, `1W3h5ZMzZYReAyZT2Jp39tg-O4U8dZs81` |
| `LOAI_TRU_TEN` | `backup`, `bản sao`, `Copy of`, `(v6)`, `_old` (không phân biệt hoa thường, bỏ dấu) |
| `KY_HIEU_HD` | `1?C26TNT_\d+`. Nếu ô này đã ghi `1C26TNT`, sửa thành regex này. Script không ghi đè ô đã có. |

Cây Drive thực tế trong thư mục gốc: `2. DANH SACH KHACH HANG` là danh sách khách (mỗi khách một thư mục, bên trong có BG/PG xlsx, PDF và thư mục tháng). `9. HOA DON / 2. RA` là thư mục HĐ GTGT đầu ra. `9. HOA DON / 1. VAO` bị bỏ qua cả cây con.

Script chỉ lấy file trong ba vùng đó:

- Danh sách khách: PDF, ảnh, Excel, Google Sheet/Doc.
- `2. RA`: cùng loại file. Tên khớp regex `1?C26TNT_\d+` thì loại là `HĐ`, kể cả `C26TNT_00000021.pdf` (không có số 1 đầu) và `1C26TNT_00000021.pdf`. Không khớp thì loại là `HĐ?`. Không coi mọi file trong `2. RA` là HĐ.
- `8. PHIẾU BÁO GIÁ`: chỉ file đoán được là BG.

Tên file «phiếu báo giá», «phiếu giao», hoặc mã dạng `BG26-001` / `PG26-029` thì loại là `BG` hoặc `PG`, kể cả khi nằm trong `2. RA`. Tên có «hóa đơn» mà không khớp regex `1?C26TNT_\d+` thì loại là `HĐ?`. Khách đoán từ thư mục ngay dưới danh sách khách hoặc dưới `2. RA`, bỏ số thứ tự đầu tên (`4. CTY ...` còn `CTY ...`). Lượt quét truyền thẳng lưới `DM_KhachHang` vào `doanKhach_` (chỉ đọc) để ra mã KH hoặc KL. File sổ v7, file danh mục giá, hai id trong `LOAI_TRU_FILE_ID`, và tên chứa cụm loại trừ không vào hàng đợi. Thư mục lương, nhà cung cấp, logo, web không được đi vào.

Mốc quét Drive lấy file có `modifiedTime` sau mốc hoặc `createdTime` sau mốc. Một lượt xử lý tối đa 400 file cũ nhất. Còn dư thì `mocKeTiep_` dời mốc tới thời điểm file thứ 400 (cùng mốc thì giữ cả nhóm), ghi một dòng `LỖI` mã `QUET_CAT` lên `CN_SucKhoe`, không dừng bằng lỗi lặp. Lượt sau lấy phần còn lại.

## Sheet CN_HangDoi

Hàng 1 là tiêu đề. Dữ liệu từ hàng 2. Cột:

`Thời gian`, `Nguồn`, `FileId`, `Tên`, `Khách hàng`, `Trạng thái`, `ModifiedTime`, `Loại chứng từ`, `Thư mục`, `URL`, `Ghép/Mộc đỏ`, `Mã KH`.

File xlsx và PDF mộc đỏ cùng tên, cùng thư mục, thành một dòng. `FileId` giữ file xlsx khi đã có. Cột `URL` nối bằng ` | `. PDF lên ở lượt sau thì sửa dòng cũ, không thêm dòng mới. Chỉ có xlsx thì cột `Ghép/Mộc đỏ` ghi `chưa có PDF mộc đỏ`. Đã có cả PDF thì ghi `đã ghép PDF mộc đỏ`. Chỉ có PDF thì ghi `chỉ có PDF mộc đỏ`.

Trạng thái:

- File chưa có trong `BaoGia` (cột D số phiếu, cột I URL), `PhieuGiao` (cột D số phiếu, cột K URL) hoặc `HoaDon` (cột A số HĐ, cột K link): `Chờ bot`.
- File đã có trong sổ thì ghi `Đã có trong sổ`. Khớp id trên URL, hoặc số phiếu BG/PG dài từ 4 ký tự nằm trong tên file. Với HĐ, lấy số ở cuối tên theo regex (bỏ số 0 đầu, `00000021` thành `21`) rồi so với `HoaDon` cột A sau cùng cách chuẩn hoá. Số HĐ hai chữ số vẫn khớp.
- Dòng đã ghi, file bị sửa (`modifiedTime` mới hơn mốc đang lưu trên hàng đợi) và vẫn khớp sổ: sửa dòng đó thành `Sửa file đã ghi`.

`CN_HangDoi!Z1` là số, do script đếm rồi ghi bằng `setValue`. Đếm cả `Chờ bot` và `Sửa file đã ghi`, vì cả hai đều còn việc cho bot. `Đã có trong sổ` không cộng. Không ghi công thức `COUNTIF`: sổ locale Việt Nam tách đối số bằng `;`, công thức dấu phẩy ra `#ERROR!`. Ô này được ghi lại cuối mỗi lượt quét. Ô `Y1` là mốc Drive. Ô `X1` ghi Gmail đang tắt, mốc Gmail, hoặc lỗi Gmail.

Script không ghi sheet `HangCho_File`. Tab đó trên v7 (vùng A1:K100) giữ nguyên: không gộp, không chép, không xóa. Quét Drive chỉ còn một nơi là `CN_HangDoi`. Hàm `tatTriggerV6Drive_` gỡ đúng các trigger `capNhatTuDrive`. Code cũ không bị xoá.

## Sheet CN_SucKhoe

Mỗi giờ script xóa phần kết quả sức khỏe cũ và ghi bản mới. Dòng mã `QUET_CAT` do `ghiLoiQuet_` ghi (cắt lượt) chỉ được giữ nếu cột A chưa quá 7 ngày so với lúc quét. Cột A đọc được cả khi là chữ `yyyy-MM-dd HH:mm:ss` giờ Việt Nam và khi Sheets đã đổi ô sang kiểu ngày giờ (`Date`). Dòng cũ hơn, hoặc cột A không đọc được, bị bỏ. `capNhatODem_` đếm lại sau khi bảng mới và các dòng `QUET_CAT` còn giữ đã ghi xong, rồi `setValue` số đó vào `CN_SucKhoe!D1`. Chỉ dòng mức đúng chữ `LỖI` được đếm, gồm cả dòng cắt lượt còn giữ. Dòng `CẢNH BÁO` không cộng. Ô này được ghi lại cuối mỗi lượt quét chứng từ, quét sức khỏe và đối soát. `CN_SucKhoe!Z1` được xóa trắng mỗi lượt để khỏi lẫn với D1 và khỏi `#ERROR!`. Các việc kiểm:

- Ô hiển thị bắt đầu bằng `#REF`, `#N/A`, `#VAL`, `#DIV`, `#NAM`, `#ERR` (đúng nhóm trong `chk.py`).
- `PhieuGiao!A1` phải chứa «Mã PG (khóa)», «Mã PG» hoặc «Mã Phiếu». Header đang dùng trên v7 là «Mã PG (khóa)».
- Khóa cột A của `HH_Data` còn thiếu trong `HH_Nhap`. Luật không tắt. Lần đầu script ghi nhận các khóa đang thiếu thì coi là đã quá 60 phút và ghi `LỖI` (đúng như lượt 23:00). Khóa mới xuất hiện sau đó: chưa tới 60 phút thì `CẢNH BÁO`, đủ 60 phút vẫn thiếu thì `LỖI`. Mốc nằm trong Script Properties, không ghi vào sổ nghiệp vụ.
- `Log_CapNhat`: có sheet, header cột A bắt đầu bằng «Thời», ba dòng cuối, cảnh báo nếu lần cuối cũ hơn 26 giờ.
- Vùng lỗi của `chk.py`: `LoiNhuan_Data` cột P–U, `LoiNhuan` cột W–AH, `DM_KhachHang` cột W–AD.
- `DM_KhachHang!AD2:AD501`: ô chứa `#` là lỗi; ô chứa «Đạt» chỉ ghi mức thông tin. Không ghi vào vùng này.

## Sheet CN_DoiSoat

Mỗi ngày lúc 19:45, hàm `doiSoatCuoiNgay` xóa phần kết quả cũ và ghi bản mới. Chỉ sheet này nhận kết quả đối soát. Nội dung:

- Chứng từ mới trong ngày trên `CN_HangDoi`, và đã vào sổ hay chưa. Ngày tính theo giờ `Asia/Ho_Chi_Minh`, dựa trên cột Thời gian hoặc `modifiedTime`.
- Nợ theo khách, đọc `V_ConNo` theo đúng chuỗi tiêu đề (bỏ khoảng trắng thừa, không phân biệt hoa thường, giữ dấu): `Mã KH`, `Khách hàng`, `Còn nợ`, `Ngày đến hạn`, `Số ngày quá hạn`. `Khách`, `Đến hạn` và `Quá hạn` không được nhận. Cộng `Còn nợ` theo mã KH rồi đối chiếu với `Dashboard!E30`. `Ngày đến hạn` và `Số ngày quá hạn` chỉ để ghi chú, không cộng vào tiền. Lệch thì một dòng `LỖI` trên `CN_DoiSoat`.
- Nợ quá hạn, đọc `V_QuaHan` theo `Mã KH`, `Khách hàng`, `Còn nợ`. Cột `Số ngày quá hạn` là số ngày, không phải tiền. Tiền cộng theo `Còn nợ`, rồi đối chiếu tổng với `Dashboard!H30`. Lệch thì một dòng `LỖI`.
- Chờ xuất hóa đơn, đọc `V_ChoXuatHD` theo `Mã KH`, `Khách hàng`, `Còn nợ`. View này không có cột `Chờ xuất HĐ` hay `Số tiền`. Tiền cũng cộng theo `Còn nợ`, rồi đối chiếu tổng với `Dashboard!K30`. Lệch thì một dòng `LỖI`. Không đọc cột F và không đọc cột `Loại CT`.
- Bốn số trên `Dashboard`, mỗi số một ô cố định. Nhãn ở dòng trên, số ở dòng dưới: `E30` tổng nợ (nhãn `E29`), `H30` quá hạn (nhãn `H29`), `K30` chờ xuất HĐ (nhãn `K29`), `B9` doanh thu (nhãn `B8`). Nhãn không khớp thì ghi `LỖI` và không lấy số.
- Số lỗi, lấy từ `CN_SucKhoe!D1`.

Không đối soát bill Kiot. Không làm cảnh báo bill 500k. Script không lọc bỏ dòng theo các chữ đó.

## Trigger

`installTriggers` xóa trigger cũ của đúng bốn hàm của script này rồi tạo lại:

- `quetChungTuMoi`: mỗi 15 phút. Ngoài khung 07:00–18:10 hàm thoát ngay, không gọi Drive. Mốc 18:00 được cộng 10 phút vì trigger Google có thể trễ.
- `quetChungTu23h`: mỗi ngày, trong giờ 23, gần phút 0, theo múi `Asia/Ho_Chi_Minh`.
- `quetSucKhoe`: mỗi giờ.
- `doiSoatCuoiNgay`: mỗi ngày, giờ 19, gần phút 45.

`removeTriggers` chỉ xóa bốn hàm đó. Không gỡ `capNhatGiaVon` và không gỡ `capNhatTuDrive`.

`tatTriggerV6Drive_` chỉ gỡ trigger có handler `capNhatTuDrive` (đang có 4 trigger). Chạy tay một lần khi anh muốn dừng quét Drive cũ. Không xoá code cũ, không xoá `HangCho_File`.

Hai rủi ro trước khi tắt quét Drive cũ:

- Chạy lại `caiDatLich` của code v6 sẽ gắn lại trigger `capNhatTuDrive`. Hàm đó nằm trên project v7, không có trong repo này. `tatTriggerV6Drive_` không chặn lần gọi sau.
- `Dashboard!B4:F4` là công thức `MAX(Log_CapNhat!A)`. Chữ «Nguồn: Drive… 4 lần/ngày» nằm ở `L4`, ô gộp `L4:P4`, là chữ gõ tay. Script v6 không ghi `Dashboard`. Trong `Log_CapNhat`, dòng «Tự động – quét Drive» do `capNhatTuDrive` của v6 ghi, dòng «Cập nhật giá vốn» do `capNhatGiaVon` ghi mỗi giờ. Tắt v6 xong thì `B4` vẫn nhích theo giá vốn. PR này không sửa `B4` và không ghi `Log_CapNhat`. Không sửa `L4` bằng script. Sau khi tắt v6, anh sửa tay `L4` thành: «Nguồn: quét CN_HangDoi (15 phút, 07:00–18:10, và 23:00). Không còn capNhatTuDrive 4 lần/ngày.»

## Gắn vào sổ

Bản PR #71 đã gắn trên sổ v7 thật. Bản này chưa dán đè lên project đó. Bot Công Nợ duyệt PR trước. Các bước dán lên v7 nằm ở mục «Cập nhật project đang gắn trên v7».

Cách chạy trên bản sao:

1. Trong Drive, tạo bản sao sổ `QUẢN LÝ CÔNG NỢ KHÁCH HÀNG - VẠN PHÁT (v7)`.
2. Mở bản sao → Tiện ích → Apps Script.
3. Project Settings → Time zone: `(GMT+07:00) Ho Chi Minh`.
4. Bật `appsscript.json` (Project Settings → Show appsscript.json) và dán file `appsscript.json` của thư mục này. Services phải có Drive API v3.
5. Tạo các file `.gs` cùng tên với repo (`Logic.gs`, `Ghi.gs`, `Config.gs`, `HangDoi.gs`, `SucKhoe.gs`, `CN_GiaVon.gs`, `DoiSoat.gs`, `Triggers.gs`) và dán nội dung. Trên project v7 đang chạy, file giá vốn cũ vẫn tên `GiaVon.gs`. Không dán đè file đó. File đọc danh mục mới phải tên `CN_GiaVon.gs`. Xóa `Code.gs` trống nếu project mới tạo sẵn.
6. Chọn hàm `caiDatSheet` → Run → cấp quyền bằng tài khoản chủ sheet.
7. Trên bản sao, sửa `CONFIG!V7_SPREADSHEET_ID` thành id của bản sao. Id này nằm trên URL `/spreadsheets/d/<id>/edit`. Nếu chưa sửa, `quetSucKhoe` và `quetChungTu_` dừng, không ghi hàng đợi.
8. Chọn `chayThuLogicMau` → Run. Nhật ký phải có dòng `OK logic mẫu chạy hết, không lỗi`. Hàm này không ghi sheet.
9. Chọn `quetSucKhoe` → Run. Xem `CN_SucKhoe`.
10. Chọn `installTriggers` khi muốn lịch tự chạy trên bản sao.

Cách đẩy bằng clasp, vẫn trên project của bản sao:

```bash
cd apps-script/cong-no
npx @google/clasp login
printf '%s\n' '{"scriptId":"<SCRIPT_ID của bản sao>","rootDir":"."}' > .clasp.json
npx @google/clasp push
```

`.clasp.json` nằm trong `.gitignore`. Không commit file đó.

## Giá vốn

File trong repo là `CN_GiaVon.gs`. Trên project v7, file này không được đặt tên `GiaVon.gs` vì tên đó đã là script giá vốn cũ.

«Đơn Giá» trên sheet `Danh Mục Vật Tư` là giá bán, không phải giá vốn. `docDanhMucVatTu()` mở Google Sheet `1Hwslun92TLrhXAMgiVDdd6wyvVXP6sqOQbuTKiLKRrM` bằng `SpreadsheetApp`. Không đọc bản Excel sao chép. Hàm chỉ cấp Mã, Tên, Đơn giá cho `DM_GiaVon!C` và không ghi ô nào trên `DM_GiaVon`.

Giá vốn là `DM_GiaVon!D` «Giá vốn BQ có VAT». Hàm cũ `capNhatGiaVon` và trigger của nó giữ nguyên cách tính cột D. Script này không thay hàm đó.

`ChiTiet_LN!J` tra theo thứ tự: cột N nhập tay, rồi cột M tên ghép, rồi mã SP cột C. Script này không ghi `ChiTiet_LN`.

`kiemTraNguonGiaVon` chỉ để chạy tay: đọc danh mục rồi thêm một dòng tóm tắt trên `CN_SucKhoe`, không ghi giá.

## Quy tắc giai đoạn sau

Ba quy tắc này chưa thực thi khi xếp hàng đợi. Giai đoạn sau mới dùng:

- HĐ khác sản phẩm nhưng cùng tổng giá trị là hợp lệ, chỉ lệch giá trị mới báo.
- Nhóm Khách lẻ quen (mã KL) có theo dõi nợ.
- KH007 là khách vãng lai, không vào công nợ.

Lượt quét truyền thẳng `DM_KhachHang` vào `doanKhach_` để ra mã KH/KL và đánh dấu khách lẻ quen hoặc KH007. Hàng đợi giai đoạn này vẫn nhận cả KH007. Chưa loại khách vãng lai khỏi công nợ.

## Gmail

`appsscript.json` chưa xin `https://www.googleapis.com/auth/gmail.readonly`. `GMAIL_BAT` mặc định `FALSE`, lượt quét không gọi Gmail.

Khi anh bật Gmail: thêm scope đó vào `oauthScopes`, đẩy lại script, cấp quyền, rồi đặt `GMAIL_BAT` = `TRUE`. Lần sau chỉ lấy thư có đính kèm gửi từ `congtytnhhvanphat999@gmail.com`. Thư nhà cung cấp gửi đến hộp thư không được lấy. Lần đầu bật cũng chỉ đặt mốc, không kéo thư cũ. File đính kèm khớp `1?C26TNT_\d+` thì loại là `HĐ`, ví dụ `C26TNT_00000021.pdf`. Không khớp thì `HĐ?`. Tên phiếu giao hoặc báo giá giữ `PG` hoặc `BG`.

Nếu `GMAIL_BAT` bật mà chưa có quyền, script ghi `LỖI` lên `CN_SucKhoe` và vẫn lưu mốc Drive. Quá 100 thư một lượt thì dời mốc Gmail từng phần, không chặn mốc Drive.

## Chạy thử trong repo

Không cần Google:

```bash
node apps-script/cong-no/test/chay_thu.js
```

Kỳ vọng hai dòng: `OK logic mẫu chạy hết, không lỗi` và `OK cổng ghi: chỉ Ghi.gs được ghi sheet`.

## Cập nhật project đang gắn trên v7

Sổ đang chạy là `1jkmfMIJsoZrDlOxmkqbj44GOsNb1eh3UNk3Tyn0MaJs`. Project đó đã có code cũ. Làm đúng các bước sau, không xoá dữ liệu:

1. Mở sổ v7 → Tiện ích → Apps Script.
2. Dán đè các file đã có của script mới: `Logic.gs`, `Ghi.gs`, `Config.gs`, `HangDoi.gs`, `SucKhoe.gs`, `Triggers.gs`, `appsscript.json`.
3. Thêm file mới `DoiSoat.gs` và `CN_GiaVon.gs`. Không đổi tên `CN_GiaVon.gs` thành `GiaVon.gs`. Không sửa và không xoá `GiaVon.gs` cũ hay các file code v6 khác.
4. Chạy `caiDatSheet`. Hàm tạo hoặc bổ sung `CN_DoiSoat`. Không ghi sheet nghiệp vụ.
5. Chạy `chayThuLogicMau`. Nhật ký phải có `OK logic mẫu chạy hết, không lỗi`.
6. Chạy `installTriggers`. Lịch mới thêm mốc 19:45. Trigger `capNhatGiaVon` và `capNhatTuDrive` chưa bị gỡ ở bước này.
7. Khi anh muốn chỉ còn một quét Drive: xem hai rủi ro ở mục Trigger, rồi chạy `tatTriggerV6Drive_` một lần. Hàm gỡ đúng trigger `capNhatTuDrive`. Vào Triggers kiểm tra còn `capNhatGiaVon`, `quetChungTuMoi`, `quetChungTu23h`, `quetSucKhoe`, `doiSoatCuoiNgay`. Không chạy lại `caiDatLich`.
8. Không xoá tab `HangCho_File`. Không xoá dòng công nợ, hóa đơn, phiếu giao.
9. Bản sửa ô đếm và mốc quét: dán lại `Logic.gs`, `HangDoi.gs`, `SucKhoe.gs`, `Triggers.gs`. Chạy `caiDatSheet` để ghi số vào `CN_HangDoi!Z1` và `CN_SucKhoe!D1`, đồng thời xóa công thức ở `CN_SucKhoe!Z1`.
10. Chạy tay `quetChungTu_` một lần để lấy chứng từ trong ngày, gồm phiếu giao đã sửa trước mốc 23:12. Không đợi khung 07:00 hôm sau. Rồi chạy `quetSucKhoe` để chốt lại D1. Khóa `HH_Data` đang thiếu ở lượt này vẫn là `LỖI`. Dòng `QUET_CAT` nếu đang có sẽ được giữ.
11. Bản sửa đối soát theo ô Dashboard: dán lại `Logic.gs` và `SucKhoe.gs`. Chạy `doiSoatCuoiNgay` một lần để ghi lại `CN_DoiSoat`. Kỳ vọng `Chờ xuất HĐ` lấy `K30`, không còn số 3.
12. Bản sửa tiêu đề `Khách hàng`: dán lại `Logic.gs`. Chạy `doiSoatCuoiNgay` một lần, rồi `quetSucKhoe` một lần. Ba view phải hết `LỖI` thiếu cột. `V_ConNo` cộng `Còn nợ` và đối chiếu `E30`. `V_QuaHan` đối chiếu `H30`. `V_ChoXuatHD` đối chiếu `K30`. Lệch thì một dòng `LỖI`. `CN_SucKhoe!D1` được ghi lại số `LỖI`. Dòng `QUET_CAT` cũ hơn 7 ngày sẽ rời sheet ở lượt `quetSucKhoe` này, kể cả ô mốc đang là kiểu ngày giờ. Không ghi `Log_CapNhat`. Không sửa `Dashboard!B4` hay `L4`.

`guessKH_` của quét cũ tương ứng `doanKhach_` trên quét mới, đã đối chiếu `DM_KhachHang`. `dienMaTab` ghi mã vào tab cũ. Quét mới không làm việc đó vì không được ghi `HangCho_File` hay sổ nghiệp vụ. Mã KH nằm ở cột L của `CN_HangDoi` để bot dùng. `ngayTuTen_` lấy ngày trong tên file cho cột Ngày của tab cũ. Đối soát dùng ngày ghi nhận và `modifiedTime` theo giờ Việt Nam, chưa port `ngayTuTen_`.
