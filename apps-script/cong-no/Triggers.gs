/**
 * Tạo và gỡ trigger. removeTriggers chỉ xóa handler của project này,
 * không đụng trigger «Cập nhật giá vốn» hay trigger khác.
 */

var HANDLER_TRIGGER = ['quetChungTuMoi', 'quetChungTu23h', 'quetSucKhoe'];

function caiDatSheet() {
  var ss = moSo_();
  damBaoConfig_(ss);
  damBaoHangDoi_(ss);
  var sh = taoSheetNeuThieu_(ss, 'CN_SucKhoe');
  if (sh.getRange(1, 1).getValue() !== 'Cập nhật') {
    ghiO_(sh, 1, 1, 'Cập nhật');
    ghiO_(sh, 1, 3, 'Số lỗi');
    ghiO_(sh, 1, 4, 0);
    ghiBang_(sh, 2, 1, [['Thời điểm', 'Mã', 'Mức', 'Đối tượng', 'Chi tiết']]);
    ghiCongThuc_(sh, 1, 26, congThucDemLoi_());
  }
  return 'Đã chuẩn bị CONFIG, CN_HangDoi, CN_SucKhoe trên sổ ' + ss.getId();
}

function installTriggers() {
  caiDatSheet();
  removeTriggers();
  ScriptApp.newTrigger('quetChungTuMoi').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('quetChungTu23h').timeBased().everyDays(1).atHour(23).nearMinute(0).create();
  ScriptApp.newTrigger('quetSucKhoe').timeBased().everyHours(1).create();
  return 'Đã gắn trigger quét 15 phút, mốc 23:00 và kiểm tra sức khỏe mỗi giờ.';
}

function removeTriggers() {
  var all = ScriptApp.getProjectTriggers();
  var i;
  for (i = 0; i < all.length; i++) {
    if (HANDLER_TRIGGER.indexOf(all[i].getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(all[i]);
    }
  }
}

function quetChungTuMoi() {
  var cfg = docConfig_(moSo_());
  var hm = gioPhutVn_(new Date(), cfg.TZ);
  if (!trongGioQuet_(hm.gio, hm.phut, cfg)) return;
  quetChungTu_();
}

function quetChungTu23h() {
  quetChungTu_();
}

function chayThuLogicMau() {
  var kq = tuChayMau_();
  Logger.log(kq.text);
  if (!kq.ok) throw new Error(kq.text);
  return kq.text;
}
