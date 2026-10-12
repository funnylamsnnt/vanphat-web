/**
 * Vạn Phát — Gemini AI chat (catalog-grounded) + lead/bill sheet
 *
 * Script Properties:
 *   XAI_API_KEY      — bắt buộc. Khóa xAI, không ghi vào repo.
 *   SYSTEM_PROMPT    — tuỳ chọn (nên dán từ content/chat-system-prompt.md)
 *   PRIMARY_MODEL    — mặc định grok-4.7
 *   FALLBACK_MODEL   — mặc định grok-4
 *   LEAD_SHEET_ID    — tuỳ chọn: ID Google Sheet; nếu trống sẽ tạo sheet "Vạn Phát Chat Bills"
 */

var DEFAULT_SYSTEM_PROMPT =
  'Bạn là trợ lý AI website Vạn Phát. Chỉ tư vấn theo CATALOG đính kèm và thông tin công ty. ' +
  'Không bịa giá, không nêu số tồn. Không tự chốt đơn, không hẹn giao. Photocopy không có giá trên web — chuyển NV. ' +
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

  var result = callGrokWithFallback_(message, history, catalogContext);
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

function callGrokWithFallback_(message, history, catalogContext) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('XAI_API_KEY');
  if (!apiKey) throw new Error('Missing XAI_API_KEY');

  var systemPrompt = props.getProperty('SYSTEM_PROMPT') || DEFAULT_SYSTEM_PROMPT;
  var primary = props.getProperty('PRIMARY_MODEL') || 'grok-4.7';
  var fallback = props.getProperty('FALLBACK_MODEL') || 'grok-4';

  var userPayload =
    'CATALOG (chỉ dùng dữ liệu này cho mã, tên, đơn vị và giá. Không nêu số tồn):\n' +
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
  var messages = [{ role: 'system', content: systemPrompt }];
  for (var i = 0; i < history.length; i++) {
    var h = history[i];
    if (!h || !h.role || !h.text) continue;
    var role = h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user';
    messages.push({ role: role, content: String(h.text).slice(0, 1500) });
  }
  messages.push({ role: 'user', content: message });

  var payload = {
    model: model,
    messages: messages,
    temperature: 0.3,
    max_tokens: 700,
    stream: false
  };

  var res = UrlFetchApp.fetch('https://api.x.ai/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var raw = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Grok HTTP ' + code);
  }

  var data = JSON.parse(raw);
  var text =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  if (!text) throw new Error('Empty Grok response');
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
    XAI_API_KEY: apiKey,
    PRIMARY_MODEL: 'grok-4.7',
    FALLBACK_MODEL: 'grok-4'
  };
  if (systemPrompt) map.SYSTEM_PROMPT = systemPrompt;
  props.setProperties(map, false);
}
