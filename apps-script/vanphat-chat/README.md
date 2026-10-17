# Vạn Phát AI Chat (Grok + catalog)

- Frontend: `js/chat-widget.js` tra `data/products.json` rồi gửi `catalogContext` lên API. Không gửi số tồn. Bốn gợi ý nhanh giữ nguyên: Giấy A4, Bìa hồ sơ, Địa chỉ, Photocopy. Widget gửi tối đa 6 tin lịch sử, huỷ request sau 25 giây, và sau 5 giây đổi trạng thái từ «Đang tra catalog…» sang «Đang soạn trả lời…».
- Backend: Web App này gọi Grok của xAI.
  - Model chính mặc định `grok-4.20-0309-non-reasoning` đi `POST https://api.x.ai/v1/chat/completions`, `max_tokens` 450.
  - Model dự phòng mặc định `grok-4-1-fast-non-reasoning` cũng đi `POST https://api.x.ai/v1/chat/completions`. Chỉ gọi khi model chính gặp HTTP 4xx/5xx hoặc lỗi mạng, và chỉ một lần. Không gọi `grok-4`.
  - Chỉ model suy luận, ví dụ `grok-4.7`, đi `POST https://api.x.ai/v1/responses` với `reasoning.effort` = `low`. `store` để `false` để không lưu hội thoại khách trên xAI.
- Prompt kiểm soát: `content/chat-system-prompt.md` → Script Property `SYSTEM_PROMPT`. Thẻ `[[SP]]` và `[[LEAD]]` giữ trong prompt đó và trong câu mặc định của `Code.gs`.
- API Cursor dùng cho phiên sửa repo. Không gắn API đó vào chat khách.
- Cache widget trên web: service worker lấy `/js/chat-widget.js` theo pathname, bỏ qua `?v`, chiến lược network-first. Có mạng thì tải bản mới, timeout khoảng 3 giây rồi dùng cache; mất mạng mà đã có cache thì widget vẫn mở. Từ nay sửa `js/chat-widget.js` không cần tăng `?v` hay `CHAT_V`. CSS chat nằm trong `css/styles.css` dùng chung, không tách file, nên vẫn cache-first. Nút «Xóa nội dung chat» trên header xóa hội thoại và `sessionId`, giữ giỏ hàng và bill đã gửi.

## Quy tắc nghiệp vụ

- AI chỉ tư vấn theo dữ liệu web/catalog.
- Không tự chốt đơn với khách.
- Nhu cầu thêm/khác → form SĐT → `action: lead` → sheet **Bills** để nhân viên gọi lại.
- Thiếu `XAI_API_KEY`, lỗi API, hoặc quá giới hạn lượt: trả lời có hotline `033 5652 832` và Chat Zalo `https://zalo.me/0335652832`.

## Giới hạn

- Mỗi phiên trình duyệt: khoảng 10 tin/phút và 60 tin/ngày. Phiên là `sessionId` widget lưu trong `sessionStorage`. Apps Script không nhận IP khách.
- Bộ nhớ CacheService giữ bộ đếm phiên tối đa 6 giờ. Khóa có ngày Bangkok, nên sang ngày mới thì đếm lại. Nếu khách im hơn 6 giờ, bộ đếm phiên trong ngày có thể đếm lại từ đầu.
- Cả site: Script Property `DAILY_CAP`, mặc định `2000` tin/ngày theo giờ Bangkok. Bộ đếm này nằm trong Script Properties, không phụ thuộc cache 6 giờ.
- Widget chờ tối đa 25 giây. Hết giờ hoặc lỗi mạng: câu xin lỗi, hotline `033 5652 832`, link Chat Zalo, rồi mở lại ô nhập.

## Deploy

Làm đúng thứ tự này. Script Property đã có sẽ đè default trong `Code.gs`. Hai khóa `PRIMARY_MODEL` và `FALLBACK_MODEL` hiện đang là `grok-4.7` và `grok-4`. Nếu không sửa, chat vẫn đi model cũ.

1. Mở project Apps Script của khung chat. Xóa nội dung `Code.gs` cũ, dán nguyên văn file `apps-script/vanphat-chat/Code.gs`.
2. Project Settings → Script Properties. Đặt lại đúng hai khóa (hai khóa này đè default):
   - `PRIMARY_MODEL` = `grok-4.20-0309-non-reasoning`
   - `FALLBACK_MODEL` = `grok-4-1-fast-non-reasoning`
   Giữ `XAI_API_KEY`. `SYSTEM_PROMPT` dán nguyên văn `content/chat-system-prompt.md` nếu chưa có hoặc khi đổi prompt. `DAILY_CAP` không bắt buộc (trống = 2000 tin/ngày). Xóa `GEMINI_API_KEY` nếu còn. Code không gọi đúng id `grok-4` khi đó là model dự phòng, nhưng model chính vẫn lấy từ `PRIMARY_MODEL`, nên bước này bắt buộc.
3. Trong trình soạn thảo, chọn hàm `installKeepWarmTrigger_` rồi Run **một lần**. Hàm xóa mọi trigger `keepWarm` đang có (kể cả bản trùng) và tạo một trigger thời gian mỗi 5 phút. Chấp nhận quyền khi Google hỏi. Không chạy lại trừ khi trigger bị xóa. `keepWarm` chỉ ghi một khóa CacheService, không gọi Grok và không mở Sheet.
4. Deploy → Manage deployments → bút chì trên Web app **đang dùng** → Version: **New version** → Deploy. Giữ đúng deployment cũ để URL `/exec` không đổi. Execute as Me, Who has access: Anyone.

`doGet` chỉ trả JSON ping (`ok`, `ping`, `service`). Mở URL `/exec` trên trình duyệt là ping rẻ, không gọi Grok và không mở Sheet.

URL `/exec` giữ trong `data/chat-config.json` → `apiUrl` nếu đường dẫn không đổi. Đổi deployment thì cập nhật URL đó.

## Dán lại khi sửa định dạng câu trả lời

Widget trên web tự render markdown và tự bắt mã trong `data/products.json`. Thẻ `[[SP: ...]]` chỉ giúp khớp đúng mã model muốn gắn lên trang.

1. Script Property `SYSTEM_PROMPT`: xóa giá trị cũ, dán **nguyên văn** file `content/chat-system-prompt.md`. Property có hiệu lực ngay, không cần bản deploy mới.
2. Project Apps Script: dán lại toàn bộ `apps-script/vanphat-chat/Code.gs` (câu mặc định khi `SYSTEM_PROMPT` để trống có thêm thẻ `[[SP]]`).
3. Deploy → Manage deployments → bút chì trên Web app hiện tại → Version: **New** → Deploy. Giữ deployment cũ để URL `/exec` không đổi.

Không dán khóa `XAI_API_KEY` vào repo. Không cần redeploy chỉ để hết dấu `**` trên web: phần đó nằm ở `js/chat-widget.js`.
