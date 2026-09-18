# Vạn Phát Chat (Apps Script + Gemini)

## Deploy
1. Tạo project mới tại [script.google.com](https://script.google.com) (hoặc `clasp push` nếu đã liên kết).
2. Dán `Code.gs` + `appsscript.json`.
3. **Project Settings → Script properties**:
   - `GEMINI_API_KEY` = key Gemini (không commit)
   - `SYSTEM_PROMPT` = nội dung từ `content/chat-system-prompt.md` (em/anh chỉnh ở đây để kiểm soát auto-reply)
   - tùy chọn: `PRIMARY_MODEL`, `FALLBACK_MODEL`
4. **Deploy → New deployment → Web app**
   - Execute as: Me
   - Who has access: Anyone
5. Copy URL `/exec` → dán vào `data/chat-config.json` field `apiUrl`.
6. Commit/push Pages để site gọi backend.

## Kiểm thử
```bash
curl -s -X POST "$API_URL" \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"message":"Shop bán giấy A4 không?"}'
```
