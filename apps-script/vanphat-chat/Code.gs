/**
 * Vạn Phát — Gemini AI chat (catalog-grounded) + lead/bill sheet
 *
 * Script Properties:
 *   GEMINI_API_KEY   — bắt buộc
 *   SYSTEM_PROMPT    — tuỳ chọn (nên dán từ content/chat-system-prompt.md)
 *   PRIMARY_MODEL    — mặc định gemini-2.5-flash
 *   FALLBACK_MODEL   — mặc định gemini-3.5-flash-lite
 *   LEAD_SHEET_ID    — tuỳ chọn: ID Google Sheet; nếu trống sẽ tạo sheet "Vạn Phát Chat Bills"
 */

var DEFAULT_SYSTEM_PROMPT =
  'Bạn là trợ lý AI website Vạn Phát. Chỉ tư vấn theo CATALOG đính kèm và thông tin công ty. ' +
  'Không bịa giá/tồn. Không tự chốt đơn, không hẹn giao. Photocopy không có giá trên web — chuyển NV. ' +
  'Khi cần NV tư vấn thêm / hàng ngoài catalog: nói lịch sự + dòng [[LEAD]] rồi JSON ' +
  '{"ten":"","sdt":"","nhu_cau":"","san_pham_goi_y":[],"ghi_chu":""}. ' +
  'Hotline 033 5652 832. Địa chỉ: LK 19-06 Đường số 20 KĐT Mỹ Gia, Phường Nam Nha Trang.';

function doGet() {
  return jsonOut_({ ok: true, service: 'vanphat-chat', actions: ['chat', 'lead'] });
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = String(body.action || 'chat');

    if (action === 'lead') {
      return handleLead_(body.bill || {});
    }
    return handleChat_(body);
  } catch (err) {
    return jsonOut_({
      ok: false,
      error: 'Lỗi máy chủ chat. Anh/chị gọi hotline 033 5652 832 giúp em nhé.'
    });
  }
}

function handleChat_(body) {
  var message = String(body.message || '').trim();
  if (!message) return jsonOut_({ ok: false, error: 'Thiếu message' });
  if (message.length > 2000) return jsonOut_({ ok: false, error: 'Tin nhắn quá dài' });

  var history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  var catalogContext = String(body.catalogContext || '').slice(0, 6000);

  var result = callGeminiWithFallback_(message, history, catalogContext);
  var needLead = result.text.indexOf('[[LEAD]]') !== -1;
  return jsonOut_({
    ok: true,
    reply: result.text,
    model: result.model,
    needLead: needLead
  });
}

function handleLead_(bill) {
  var sdt = String(bill.sdt || '').replace(/\s+/g, '');
  if (!/^0\d{8,10}$/.test(sdt)) {
    return jsonOut_({ ok: false, error: 'SĐT không hợp lệ' });
  }

  var sheet = getLeadSheet_();
  var now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var sp = Array.isArray(bill.san_pham_goi_y) ? bill.san_pham_goi_y.join(', ') : String(bill.san_pham_goi_y || '');
  var transcript = '';
  if (Array.isArray(bill.transcript)) {
    transcript = bill.transcript
      .map(function (t) {
        return (t.role || '') + ': ' + String(t.text || '').slice(0, 200);
      })
      .join('\n')
      .slice(0, 3000);
  }

  sheet.appendRow([
    now,
    String(bill.ten || ''),
    sdt,
    String(bill.nhu_cau || ''),
    sp,
    String(bill.ghi_chu || ''),
    transcript,
    'MỚI'
  ]);

  return jsonOut_({ ok: true, saved: true });
}

function getLeadSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('LEAD_SHEET_ID');
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('Vạn Phát Chat Bills');
    props.setProperty('LEAD_SHEET_ID', ss.getId());
    var sh0 = ss.getActiveSheet();
    sh0.setName('Bills');
    sh0.appendRow(['Thời gian', 'Tên', 'SĐT', 'Nhu cầu', 'SP gợi ý', 'Ghi chú', 'Transcript', 'Trạng thái']);
  }
  var sh = ss.getSheetByName('Bills') || ss.getSheets()[0];
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Thời gian', 'Tên', 'SĐT', 'Nhu cầu', 'SP gợi ý', 'Ghi chú', 'Transcript', 'Trạng thái']);
  }
  return sh;
}

function callGeminiWithFallback_(message, history, catalogContext) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

  var systemPrompt = props.getProperty('SYSTEM_PROMPT') || DEFAULT_SYSTEM_PROMPT;
  var primary = props.getProperty('PRIMARY_MODEL') || 'gemini-2.5-flash';
  var fallback = props.getProperty('FALLBACK_MODEL') || 'gemini-3.5-flash-lite';

  var userPayload =
    'CATALOG (chỉ dùng dữ liệu này cho giá/mã/tồn):\n' +
    catalogContext +
    '\n\nCâu khách:\n' +
    message;

  try {
    return {
      text: generateContent_(apiKey, primary, systemPrompt, userPayload, history),
      model: primary
    };
  } catch (err1) {
    return {
      text: generateContent_(apiKey, fallback, systemPrompt, userPayload, history),
      model: fallback
    };
  }
}

function generateContent_(apiKey, model, systemPrompt, message, history) {
  var url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) +
    ':generateContent?key=' +
    encodeURIComponent(apiKey);

  var contents = [];
  for (var i = 0; i < history.length; i++) {
    var h = history[i];
    if (!h || !h.role || !h.text) continue;
    var role = h.role === 'model' || h.role === 'assistant' ? 'model' : 'user';
    contents.push({
      role: role,
      parts: [{ text: String(h.text).slice(0, 1500) }]
    });
  }
  contents.push({ role: 'user', parts: [{ text: message }] });

  var payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 700
    }
  };

  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var raw = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Gemini HTTP ' + code + ': ' + raw.slice(0, 200));
  }

  var data = JSON.parse(raw);
  var text =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  if (!text) throw new Error('Empty Gemini response');
  return String(text).trim();
}

function jsonOut_(obj) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

function setChatSecrets_(apiKey, systemPrompt) {
  var props = PropertiesService.getScriptProperties();
  var map = {
    GEMINI_API_KEY: apiKey,
    PRIMARY_MODEL: 'gemini-2.5-flash',
    FALLBACK_MODEL: 'gemini-3.5-flash-lite'
  };
  if (systemPrompt) map.SYSTEM_PROMPT = systemPrompt;
  props.setProperties(map, false);
}
