/**
 * Quét Drive / Gmail rồi chỉ nối hoặc sửa dòng trên CN_HangDoi.
 * Chưa có mốc, hoặc mốc đã nằm trong ngày: quét từ đầu ngày giờ Việt Nam, không kéo các ngày trước.
 * Gmail lần đầu vẫn chỉ đặt mốc.
 * Quá 400 file: xử lý phần cũ nhất, dời mốc bằng mocKeTiep_, ghi LỖI lên CN_SucKhoe.
 */

function damBaoHangDoi_(ss) {
  var sh = taoSheetNeuThieu_(ss, 'CN_HangDoi');
  var a1 = sh.getRange(1, 1).getValue();
  if (a1 !== COT_HANG_DOI[0]) {
    ghiBang_(sh, 1, 1, [COT_HANG_DOI]);
  } else {
    var headers = sh.getRange(1, 1, 1, COT_HANG_DOI.length).getValues()[0];
    var thieu = [];
    var c;
    for (c = 0; c < COT_HANG_DOI.length; c++) {
      if (headers[c] !== COT_HANG_DOI[c]) thieu.push(c);
    }
    if (thieu.length) {
      var tu = thieu[0];
      var den = thieu[thieu.length - 1];
      ghiBang_(sh, 1, tu + 1, [COT_HANG_DOI.slice(tu, den + 1)]);
    }
  }
  return sh;
}

function docHangDoi_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, COT_HANG_DOI.length).getValues();
  var out = [];
  var i;
  for (i = 0; i < vals.length; i++) {
    if (!vals[i][2]) continue;
    out.push({
      row: i + 2,
      thoiGian: String(vals[i][0] || ''),
      nguon: String(vals[i][1] || ''),
      fileId: String(vals[i][2] || ''),
      ten: String(vals[i][3] || ''),
      khach: String(vals[i][4] || ''),
      trangThai: String(vals[i][5] || ''),
      modifiedTime: String(vals[i][6] || ''),
      loai: String(vals[i][7] || ''),
      thuMuc: String(vals[i][8] || ''),
      url: String(vals[i][9] || ''),
      ghep: String(vals[i][10] || ''),
      maKh: String(vals[i][11] || ''),
      mime: ''
    });
  }
  return out;
}

function docLuoiHienThi_(ss, ten) {
  var sh = ss.getSheetByName(ten);
  if (!sh) return [];
  return sh.getDataRange().getDisplayValues();
}

function ghiHangMoi_(sh, items, thoiGian) {
  if (!items.length) return 0;
  var rows = [];
  var i;
  for (i = 0; i < items.length; i++) rows.push(dongHangDoi_(thoiGian, items[i]));
  ghiBang_(sh, Math.max(sh.getLastRow() + 1, 2), 1, rows);
  return rows.length;
}

function capNhatHang_(sh, sua, thoiGian) {
  var i;
  for (i = 0; i < sua.length; i++) {
    if (!sua[i].row) continue;
    ghiBang_(sh, sua[i].row, 1, [dongHangDoi_(thoiGian, sua[i].item)]);
  }
  return sua.length;
}

function canDrive_() {
  if (typeof Drive === 'undefined' || !Drive.Files) {
    throw new Error('Bật dịch vụ nâng cao Drive API v3 (Services → Drive API), rồi chạy lại.');
  }
}

function lietKeDrive_(q, fields) {
  canDrive_();
  var out = [];
  var token = '';
  do {
    var opt = {
      q: q,
      pageSize: 100,
      fields: fields,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    };
    if (token) opt.pageToken = token;
    var res = Drive.Files.list(opt);
    var files = (res && res.files) || [];
    var i;
    for (i = 0; i < files.length; i++) out.push(files[i]);
    token = res && res.nextPageToken ? res.nextPageToken : '';
  } while (token);
  return out;
}

function quetDriveTheoCay_(cfg, mocIso) {
  var hang = [];

  function themFile(file, pathNames) {
    var item = nhanDienFile_({
      id: file.id,
      name: file.name,
      mime: file.mimeType,
      modifiedTime: file.modifiedTime,
      createdTime: file.createdTime,
      pathNames: pathNames,
      trongCay: true,
      boQua: false
    }, cfg, cfg.dmKhachHang);
    if (item.duaVao) hang.push(item);
  }

  function lietKeFileTrong_(folderId, pathNames) {
    var q = truyVanFileMoi_(folderId, mocIso);
    var files = lietKeDrive_(q, 'nextPageToken, files(id, name, mimeType, modifiedTime, createdTime)');
    var i;
    for (i = 0; i < files.length; i++) themFile(files[i], pathNames);
  }

  function diThuMuc_(folderId, pathNames) {
    if (pathNames.length && vungChungTu_(pathNames, cfg)) lietKeFileTrong_(folderId, pathNames);
    var q = "'" + idTrongQuery_(folderId) + "' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'";
    var files = lietKeDrive_(q, 'nextPageToken, files(id, name)');
    var i;
    for (i = 0; i < files.length; i++) {
      var path = pathNames.concat([files[i].name]);
      if (!nenDiSau_(path, cfg)) continue;
      diThuMuc_(files[i].id, path);
    }
  }

  diThuMuc_(cfg.DRIVE_FOLDER_ID, []);
  return {items: hang};
}

function lietKeGmail_(cfg, mocIso) {
  var mocMs = mocIso ? new Date(mocIso).getTime() : 0;
  var after = mocMs ? Math.floor(mocMs / 1000) : 0;
  var q = truyVanGmail_(cfg.GMAIL_FROM, after);
  var out = [];
  var start = 0;
  var dayDu = true;
  while (start < 5000) {
    var threads = GmailApp.search(q, start, 25);
    if (!threads || !threads.length) break;
    var t;
    for (t = 0; t < threads.length; t++) {
      var msgs = threads[t].getMessages();
      var m;
      for (m = 0; m < msgs.length; m++) {
        var msg = msgs[m];
        if (!thuGuiTu_(msg.getFrom(), cfg.GMAIL_FROM)) continue;
        var luc = msg.getDate();
        if (mocMs && luc.getTime() <= mocMs) continue;
        var atts = msg.getAttachments();
        if (!atts || !atts.length) continue;
        var a;
        for (a = 0; a < atts.length; a++) {
          var ten = atts[a].getName();
          out.push({
            nguon: 'Gmail',
            fileId: 'gmail:' + msg.getId() + ':' + a,
            ten: ten,
            mime: atts[a].getContentType ? atts[a].getContentType() : '',
            khach: '',
            maKh: '',
            loai: loaiGmail_(ten, cfg),
            modifiedTime: luc.toISOString(),
            createdTime: luc.toISOString(),
            thuMuc: 'Gmail/' + cfg.GMAIL_FROM,
            url: 'https://mail.google.com/mail/u/0/#all/' + msg.getId(),
            duaVao: true
          });
        }
      }
    }
    if (threads.length < 25) break;
    start += threads.length;
    if (start >= 5000) dayDu = false;
  }
  out.sort(function(a, b) {
    return mocLuc_(a).localeCompare(mocLuc_(b));
  });
  return {items: out, dayDu: dayDu};
}

function quetChungTu_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return;
  try {
    var ss = moSo_();
    damBaoConfig_(ss);
    var cfg = docConfig_(ss);
    khoaSoDung_(ss, cfg);
    cfg.dmKhachHang = docLuoiHienThi_(ss, 'DM_KhachHang');
    var sh = damBaoHangDoi_(ss);
    var bay = new Date();
    var iso = bay.toISOString();
    var hien = dinhDangLuc_(bay, cfg.TZ);
    var prop = PropertiesService.getScriptProperties();
    var loiQuet = [];

    var qdDrive = mocQuetDrive_(prop.getProperty(KHOA_MOC_DRIVE) || '', iso);
    var driveChon = [];
    var mocDriveMoi = qdDrive.mocLuu;
    var chuDrive = 'Mốc Drive ' + mocDriveMoi;
    var hangCu = docHangDoi_(sh);
    var ketDrive = quetDriveTheoCay_(cfg, qdDrive.mocQuery);
    var tach = tachChuaCo_(ketDrive.items, hangCu);
    var cat = catLuotQuet_(tach.chua, 400);
    driveChon = cat.giu.concat(tach.da);
    if (cat.biCat) {
      mocDriveMoi = mocKeTiep_(iso, cat.daXet, true);
      loiQuet.push(dongLoiCatQuet_(cat.giu.length, cat.tong, mocDriveMoi));
      chuDrive = 'Mốc Drive ' + mocDriveMoi + ' | LỖI cắt lượt, còn ' + (cat.tong - cat.giu.length) + ' file';
    } else {
      mocDriveMoi = iso;
      chuDrive = (qdDrive.khoiTao ? 'Mốc Drive đầu ngày ' : 'Mốc Drive ') + mocDriveMoi;
    }

    var gmailChon = [];
    var gmailChu = 'Gmail tắt';
    var luuGmail = false;
    var mocGmailMoi = '';
    if (nenQuetGmail_(cfg)) {
      luuGmail = true;
      var qdG = quyetDinhMoc_(prop.getProperty(KHOA_MOC_GMAIL) || '', iso);
      mocGmailMoi = qdG.mocLuu;
      gmailChu = 'Mốc Gmail ' + (qdG.khoiTao ? iso : qdG.mocQuery);
      if (!qdG.khoiTao) {
        try {
          var gm = lietKeGmail_(cfg, qdG.mocQuery);
          if (!gm.dayDu) {
            loiQuet.push(dongBaoCao_('GMAIL', 'LỖI', 'Gmail', 'Chưa đọc hết thư trong một lượt. Giữ mốc Gmail cũ.'));
            gmailChu = 'Gmail lỗi: chưa đọc hết thư, giữ mốc ' + qdG.mocQuery;
            luuGmail = false;
          } else {
            var catG = catLuotQuet_(gm.items, 100);
            gmailChon = catG.giu;
            if (catG.biCat) {
              mocGmailMoi = mocKeTiep_(iso, catG.daXet, true);
              loiQuet.push(dongBaoCao_(
                'QUET_CAT',
                'LỖI',
                'Gmail',
                'Quá 100 thư/lượt. Đã xử lý phần cũ nhất, mốc dời tới ' + mocGmailMoi + '.'
              ));
            } else {
              mocGmailMoi = iso;
            }
            gmailChu = 'Mốc Gmail ' + mocGmailMoi;
          }
        } catch (eG) {
          luuGmail = false;
          gmailChon = [];
          loiQuet.push(dongBaoCao_('GMAIL', 'LỖI', 'Gmail', String(eG.message || eG)));
          gmailChu = 'Gmail lỗi: ' + String(eG.message || eG);
        }
      }
    }

    var chiMuc = chiMucSo_({
      BaoGia: docLuoiHienThi_(ss, 'BaoGia'),
      PhieuGiao: docLuoiHienThi_(ss, 'PhieuGiao'),
      HoaDon: docLuoiHienThi_(ss, 'HoaDon')
    });
    var dot = xuLyDotQuet_(hangCu, driveChon.concat(gmailChon), chiMuc, cfg);
    capNhatHang_(sh, dot.sua, hien);
    ghiHangMoi_(sh, dot.them, hien);
    var i;
    for (i = 0; i < loiQuet.length; i++) ghiLoiQuet_(ss, cfg, loiQuet[i]);
    capNhatODem_(ss);
    ghiO_(sh, 1, 25, chuDrive);
    ghiO_(sh, 1, 24, gmailChu);
    prop.setProperty(KHOA_MOC_DRIVE, mocDriveMoi);
    if (luuGmail) prop.setProperty(KHOA_MOC_GMAIL, mocGmailMoi);
  } finally {
    lock.releaseLock();
  }
}
