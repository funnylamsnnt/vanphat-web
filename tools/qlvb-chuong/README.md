# Kiểm tra chuông QLVB

Script Python chuẩn thư viện. Routine 10 phút gọi script này trước. Chỉ khi mã thoát là 10 thì bot mới chạy quy trình trình duyệt đầy đủ.

Cách chạy khuyến nghị là **CDP**: nối Chrome đang đăng nhập sẵn, reload tab `main.zul`, đợi ZK vẽ, rồi đọc chuông và bốn số Văn bản đến trên DOM. Không bấm nút, không gõ form, không đăng nhập, không đọc cookie.

GET chỉ với cookie không đủ. Server trả HTTP 200 kèm lệnh ZK `redirect` tới `login.zul` vì phiên còn gắn với bước JS trong trình duyệt (`initializeSecurityMode`). Cùng cookie đó trong Chrome thì vẫn đang đăng nhập. Vì vậy cookie chỉ còn là chế độ phụ để thử fixture.

Trang cần kiểm tra **không ghi trong repo** (ranh giới: không commit link hệ thống văn bản hành chính). Lúc chạy, routine tự đặt `QLVB_PAGE_URL` hoặc `--page-url` là URL https đầy đủ tới `pages/main.zul`.

## Chrome DevTools

Chrome phải được mở trước, đã đăng nhập, với cổng gỡ lỗi chỉ trên máy này:

```bash
google-chrome --remote-debugging-port=9222
```

Script nối `127.0.0.1` (không nhận host khác). `--cdp` hoặc `--cdp 9222`. Bỏ cờ thì vẫn dùng CDP cổng `QLVB_CDP_PORT`, mặc định 9222. Không thấy cổng: mã **30**, stdout:

```json
{"status":"no_browser"}
```

Việc script làm: tìm tab có path kết thúc bằng `main.zul`, chưa có thì mở tab đó, `Page.reload`, rồi `Runtime.evaluate` đọc DOM. Hết phiên khi URL tab kết thúc bằng `login.zul`, hoặc form đăng nhập đang hiện (ô mật khẩu hiện và có chữ đăng nhập). Không lấy giá trị ô mật khẩu, không in cookie.

## File cookie

Đọc từ file **nằm ngoài repo**. Đường dẫn lấy từ `QLVB_COOKIE_FILE` hoặc `--cookie-file`. Không truyền giá trị cookie trên dòng lệnh (lệnh sẽ lộ trong `ps` và lịch sử shell).

File phải có quyền `0600` hoặc chặt hơn (ví dụ `0400`). Bit group hoặc other bật thì script từ chối, mã 30, không đọc nội dung. Không in và không ghi giá trị cookie ra stdout, stderr, hay file state.

```bash
install -m 600 /dev/null /var/lib/vanphat/qlvb.cookie
# rồi ghi cookie đã có sẵn vào file đó
```

Một trong ba dạng, chỉ chứa cookie phiên đã có sẵn:

1. Một dòng header: `JSESSIONID=...; tenkhac=...`
2. JSON: `{"cookie":"JSESSIONID=..."}` — có khóa mật khẩu hoặc tên đăng nhập thì script từ chối. Khóa `expires` / `expiresAt` / `expiry` trong quá khứ thì coi là hết phiên.
3. Netscape cookie jar (kể cả dòng `#HttpOnly_`). Cột hết hạn `0` là cookie phiên, không coi là hết hạn. Thời điểm đã qua thì hết phiên.

Không trỏ biến vào thư mục profile Chrome/Chromium/Edge hoặc file SQLite `Cookies`.

Hết hạn cookie, HTTP 401, URL cuối là `login.zul`, lệnh ZK `redirect` tới `login.zul`, hoặc trang login không có chuông: mã **3**, stdout đúng một dòng:

```json
{"status":"session_expired"}
```

Script không đăng nhập lại và không lưu mật khẩu. Bot gọi trình duyệt để đăng nhập, cấp lại file cookie (`chmod 600`), rồi chạy tiếp.

## Mã thoát

| Mã | `status` | Khi nào |
| --- | --- | --- |
| 0 | `ok` | Không thông báo mới, số chuông không tăng, mọi nhóm đọc được đều 0 hoặc không đọc được nhóm |
| 10 | `new` | Có thông báo mới so với mốc, hoặc số chuông tăng khi danh sách không có trong lần GET, hoặc một nhóm Văn bản đến > 0 |
| 3 | `session_expired` | Hết phiên hoặc cookie hết hạn. Baseline không đổi |
| 4 | `forbidden` hoặc `network` | nginx 403, hoặc lỗi mạng / timeout. `consecutiveFailures` tăng 1 |
| 30 | `no_browser` khi không có Chrome; các lỗi cấu hình khác không có JSON | Thiếu cấu hình, cookie lỏng quyền hoặc nằm trong repo, trang không có chuông lẫn nhóm, baseline hỏng, hoặc cổng CDP không mở |

Mã 0, 10, 3 và 4 in một dòng JSON. Mã 30 in JSON khi `status` là `no_browser`. Lỗi cấu hình khác chỉ có stderr.

403 và lỗi mạng được thử **đúng một lần** nữa, chờ `QLVB_RETRY_BACKOFF` giây (mặc định 1, trần 5). Hết phiên không thử lại. Không vòng lặp.

## JSON khi thành công

`title` là trích yếu. `link` chỉ có khi trang trả về liên kết. `time` là ISO 8601 giờ Bangkok, hoặc `null` nếu không đọc được.

```json
{"status":"new","moi":[{"id":"notice-2","time":"2026-10-30T14:05:00+07:00","title":"Trích yếu ví dụ","khan":true,"link":"https://example.test/van-ban/2"}],"counts":{"choXuLy":1,"sapDenHan":0,"quaHan":0,"nhanDeBiet":0}}
```

Nhóm Văn bản đến, chỉ những nhãn đọc được mới có khóa:

| Khóa | Nhãn trên trang |
| --- | --- |
| `choXuLy` | Chờ xử lý |
| `sapDenHan` | Sắp đến hạn |
| `quaHan` | Quá hạn |
| `nhanDeBiet` | Nhận để biết |

Không thấy nhãn nào thì `counts` là `null` (không suy ra bằng 0). Một khóa có giá trị `> 0` thì mã 10, kể cả khi `moi` rỗng, để bot xử lý hàng đợi. Lần sau số vẫn `> 0` thì vẫn mã 10.

Chỉ khi danh sách thông báo không nằm trong lần GET mà số trên chuông tăng, JSON thêm:

```json
{"status":"new","moi":[],"counts":null,"badge":{"count":4,"truoc":1,"them":3}}
```

Im lặng (mã 0):

```json
{"status":"ok","moi":[],"counts":{"choXuLy":0,"sapDenHan":0,"quaHan":0,"nhanDeBiet":0}}
```

403 và mạng:

```json
{"status":"forbidden","consecutiveFailures":2}
{"status":"network","reason":"timeout","consecutiveFailures":1}
```

`reason` là `timeout` hoặc `network`.

## File state

Cùng đường dẫn baseline cũ (`QLVB_BASELINE_FILE` hoặc `--baseline-file`). Mặc định `/workspace/qlvb-bell-baseline.json`, quyền `0600`, đã nằm trong `.gitignore`. Không commit file thật.

Đọc được cả file cũ (`version` 1, `items` là badge/notice) và `alerted` lẫn lộn chuỗi với object. Một chuỗi coi như mã hoặc `thời điểm|trích yếu`.

```json
{
  "version": 1,
  "updatedAt": "2026-10-30T14:05:00+07:00",
  "tip": "2026-10-30T14:05:00+07:00",
  "alerted": [
    "notice-cu",
    {"id": "notice-2", "time": "2026-10-30T14:05:00+07:00", "title": "Trích yếu ví dụ", "khan": true}
  ],
  "consecutiveFailures": 0,
  "counts": {"choXuLy": 0, "sapDenHan": 0, "quaHan": 0, "nhanDeBiet": 0},
  "items": [
    {"id": "notification-count", "kind": "badge", "count": 2}
  ]
}
```

- `tip`: mốc thời gian mới nhất đã thấy. Thông báo có `time` không sau mốc, và đã nằm trong `alerted` hoặc `items`, thì không báo lại.
- `alerted`: giữ tối đa 400 mục. Chuỗi và object đều nhận.
- `items`: badge và notice như bản version 1, để file cũ vẫn đọc được.
- `consecutiveFailures`: chỉ tăng khi mã 4. Lần GET thành công thì về 0. Hết phiên không đụng file.
- Baseline hỏng thì mã 30, không ghi đè.

`QLVB_SEED=1` hoặc `--seed`: ghi mốc (tip, alerted, items, counts) rồi thoát 0 dù nhóm đang > 0. Dùng một lần khi lập mốc.

Số chuông giảm: mã 0, baseline cập nhật số mới. Lần GET không có `notification-item` thì giữ notice cũ, để lần sau danh sách hiện lại không bị báo trùng.

## Giới hạn

Chế độ cookie chỉ thấy những gì server nhét vào lần GET đầu, và với ZK hiện tại lần đó là trang login. Chế độ CDP đọc DOM sau khi ZK vẽ. Cả hai đều không gọi `/zkau`, không gửi sự kiện `onRendered`, không đánh dấu đã đọc, không bấm. Việc duy nhất làm đổi trang ở CDP là reload tab. Trang không có dấu chuông và cũng không có bốn nhãn nhóm thì mã 30, baseline giữ nguyên.

## Chạy

```bash
export QLVB_PAGE_URL='https://.../pages/main.zul'
export QLVB_BASELINE_FILE=/workspace/qlvb-bell-baseline.json
python3 tools/qlvb-chuong/check_bell.py --cdp
```

Cờ: `--cdp` (cổng tuỳ chọn), `--cookie-file`, `--baseline-file`, `--page-url`, `--timeout`, `--seed`.

Chế độ cookie, chỉ khi cần thử fixture: `QLVB_TRANSPORT=cookie` và `QLVB_COOKIE_FILE`. Không đặt `QLVB_TRANSPORT` thì script dùng CDP.

`QLVB_TIMEOUT` mặc định 20 giây, vừa là hạn chờ ZK vẽ. `QLVB_ALLOW_FIXTURE=1` cùng `QLVB_HTTP_FIXTURE` hoặc `QLVB_CDP_FIXTURE` chỉ để thử mock. Routine thật không đặt các biến fixture.

## Routine

```bash
python3 tools/qlvb-chuong/check_bell.py --cdp
rc=$?
case "$rc" in
  0)  ;;
  10) # stdout là JSON status new — chạy quy trình trình duyệt
      ;;
  3)  # session_expired — người vận hành đăng nhập lại trên Chrome đang mở cổng 9222
      ;;
  4)  # forbidden hoặc network — đọc consecutiveFailures, không thử lại dày hơn một lần
      ;;
  30) # no_browser nếu Chrome chưa mở cổng; hoặc cấu hình, quyền cookie, baseline — xem stderr
      ;;
esac
```

## Test

```bash
python3 tools/qlvb-chuong/test_check_bell.py
```
