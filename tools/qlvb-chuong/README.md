# Kiểm tra chuông QLVB

Script Python chuẩn thư viện, không mở trình duyệt, không đăng nhập. Dùng để routine chỉ gọi bot QLVB V.O khi có thông báo mới so với baseline.

Trang cần kiểm tra **không ghi trong repo** (ranh giới: không commit link hệ thống văn bản hành chính). Lúc chạy, routine tự đặt `QLVB_PAGE_URL` là URL https đầy đủ tới `pages/main.zul`.

## Vì sao làm được bằng cookie

ZK 6.5 giữ phiên bằng `JSESSIONID` (HttpOnly). File cookie do người vận hành hoặc bot cấp qua `QLVB_COOKIE_FILE` là đủ để gửi `GET`. Script không gửi form đăng nhập, không lưu mật khẩu, không đọc profile Chrome hay file SQLite `Cookies`.

Hết phiên thường vẫn là HTTP 200. Trong thân trang có lệnh ZK `redirect` tới `login.zul`. Script coi đó là hết phiên (mã 20), cùng với URL cuối trỏ `login.zul` hoặc HTTP 401.

Chuông trên giao diện dùng lớp `notification-bell`, số badge `notification-count`, từng dòng (nếu có trong lần GET) là `notification-item` / `notification-title`. Đây là lớp trong CSS theme công khai, parser bám các lớp đó trong HTML hoặc cây widget `zkmx`.

## Giới hạn

GET một lần chỉ thấy những gì server nhét vào lần tải đầu. Theme gọi thêm sự kiện ZK `onRendered` sau khi vẽ trang. Nếu số trên chuông chỉ hiện sau sự kiện đó, script không thấy dấu chuông và thoát 30, **không** đổi baseline, **không** đoán là hết thông báo. Phương án thay thế an toàn (chưa làm, cần anh duyệt): POST đúng sự kiện `onRendered` mà trang đã gửi, vẫn bằng cookie được cấp, không đăng nhập và không đọc Chrome. Sự kiện này có thể có tác dụng phụ phía server nên không bật sẵn.

Script không bấm chuông, không gọi `/zkau`, không đánh dấu đã đọc.

## Baseline

File mẫu sẵn không có trong workspace nên script tự định nghĩa schema **version 1**:

```json
{
  "version": 1,
  "updatedAt": "2026-10-23T07:00:00+07:00",
  "items": [
    {"id": "notification-count", "kind": "badge", "count": 2},
    {"id": "notice-vi-du", "kind": "notice", "title": "Ví dụ, không phải thông báo thật"}
  ]
}
```

- `notification-count`: số trên chuông. Tăng so với baseline thì là mới.
- `notice`: một thông báo có `id` ổn định. `id` lạ, hoặc cùng `id` mà `title` đổi, thì là mới.
- Có dòng `notice` mới thì JSON chỉ liệt kê các dòng đó, không kèm thêm badge cho cùng một lần.
- Chỉ có số, chưa có danh sách: `moi` là một badge `count`, `truoc`, `them`.
- Số giảm hoặc dòng biến mất: im lặng (mã 0) nhưng baseline cập nhật số mới. Dòng cũ được giữ nếu lần GET này không thấy `notification-item`, để lần sau danh sách hiện lại không bị báo trùng.
- Lần đầu chưa có file baseline: mọi số lớn hơn 0 hoặc mọi dòng đều là mới (mã 10). Đặt `QLVB_SEED=1` để ghi baseline rồi thoát 0, không in, dùng một lần khi lập mốc.

Mặc định ghi `/workspace/qlvb-bell-baseline.json` (quyền `0600`). Đường dẫn này nằm ngoài git nhờ `.gitignore`. Không commit baseline thật.

`moi` in ra stdout, một dòng:

```json
{"moi":[{"id":"notification-count","kind":"badge","count":4,"truoc":1,"them":3}]}
```

hoặc

```json
{"moi":[{"id":"notice-2","kind":"notice","title":"Phiếu trình mới"}]}
```

## File cookie

Một trong ba dạng, chỉ chứa cookie phiên đã có sẵn:

1. Một dòng header: `JSESSIONID=...; tenkhac=...`
2. JSON: `{"cookie":"JSESSIONID=..."}` — có khóa mật khẩu hoặc tên đăng nhập thì script từ chối.
3. Netscape cookie jar (kể cả dòng `#HttpOnly_`).

Không trỏ biến vào thư mục profile Chrome/Chromium/Edge hoặc file SQLite.

## Chạy

```bash
export QLVB_COOKIE_FILE=/duong/dan/ngoai/git/qlvb.cookie
export QLVB_PAGE_URL='https://.../pages/main.zul'
export QLVB_BASELINE_FILE=/workspace/qlvb-bell-baseline.json
python3 tools/qlvb-chuong/check_bell.py
```

`QLVB_TIMEOUT` mặc định 20 giây. `QLVB_ALLOW_FIXTURE=1` và `QLVB_HTTP_FIXTURE` chỉ để thử mock; routine thật không đặt hai biến này.

Đã đối chiếu một lần GET không cookie: server trả HTTP 200, trong thân trang có lệnh ZK `redirect` tới `login.zul`. Script nhận đúng dạng đó là hết phiên. Lần GET đó không lưu cookie.

## Routine

```bash
python3 tools/qlvb-chuong/check_bell.py
rc=$?
case "$rc" in
  0)  ;;
  10) # stdout là {"moi":[...]} — gọi bot QLVB V.O với đúng chuỗi này
      ;;
  20) # hết phiên — cấp lại file cookie, không gọi bot vì không có nội dung
      ;;
  30) # lỗi mạng, 403, hoặc chưa thấy chuông — baseline giữ nguyên
      ;;
esac
```

Stderr chỉ một dòng ngắn khi mã 20 hoặc 30. Mã 0 không in stdout. Cookie không được in.

## Test

```bash
python3 tools/qlvb-chuong/test_check_bell.py
```

Mock bốn tình huống: có mới (mã 10), không mới (mã 0, im), hết phiên `login.zul` (mã 20), HTTP 403 và lỗi mạng (mã 30, baseline không đổi).
