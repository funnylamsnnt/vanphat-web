/**
 * Quét Drive / Gmail rồi chỉ nối dòng vào CN_HangDoi.
 * Lần đầu chưa có mốc: ghi mốc hiện tại, không kéo lịch sử.
 */

function damBaoHangDoi_(ss) {
  var sh = taoSheetNeuThieu_(ss, 'CN_HangDoi');
  if (sh.getRange(1, 1).getValue() !== COT_HANG_DOI[0]) {
    ghiBang_(sh, 1, 1, [COT_HANG_DOI]);
  }
  ghiCongThuc_(sh, 1, 26, congThucDemChoBot_());
  return sh;
}

function docKhoaDaCo_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 3, last - 1, 5).getValues();
  var out = [];
  var i;
  for (i = 0; i < vals.length; i++) {
    if (!vals[i][0]) continue;
    out.push({fileId: String(vals[i][0]), modifiedTime: String(vals[i][4] || '')});
  }
  return out;
}

function ghiHangMoi_(sh, items, thoiGian) {
  if (!items.length) return 0;
  var rows = [];
  var i;
  for (i = 0; i < items.length; i++) rows.push(dongHangDoi_(thoiGian, items[i]));
  ghiBang_(sh, Math.max(sh.getLastRow() + 1, 2), 1, rows);
  return rows.length;
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
  var soFile = 0;
  var biCat = false;
  var moc = String(mocIso).replace(/'/g, '');

  function themFile(file, pathNames) {
    if (soFile >= 400) {
      biCat = true;
      return;
    }
    soFile++;
    var item = nhanDienFile_({
      id: file.id,
      name: file.name,
      mime: file.mimeType,
      modifiedTime: file.modifiedTime,
      pathNames: pathNames,
      trongCay: true,
      boQua: false
    }, cfg);
    if (item.duaVao) hang.push(item);
  }

  function lietKeFileTrong_(folderId, pathNames) {
    var q = "'" + idTrongQuery_(folderId) + "' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder' and modifiedTime > '" + moc + "'";
    var files = lietKeDrive_(q, 'nextPageToken, files(id, name, mimeType, modifiedTime)');
    var i;
    for (i = 0; i < files.length; i++) {
      themFile(files[i], pathNames);
      if (biCat) return;
    }
  }

  function diThuMuc_(folderId, pathNames) {
    if (biCat) return;
    if (pathNames.length && vungChungTu_(pathNames, cfg)) lietKeFileTrong_(folderId, pathNames);
    var q = "'" + idTrongQuery_(folderId) + "' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'";
    var files = lietKeDrive_(q, 'nextPageToken, files(id, name)');
    var i;
    for (i = 0; i < files.length; i++) {
      var path = pathNames.concat([files[i].name]);
      if (!nenDiSau_(path, cfg)) continue;
      diThuMuc_(files[i].id, path);
      if (biCat) return;
    }
  }

  diThuMuc_(cfg.DRIVE_FOLDER_ID, []);
  return {items: hang, biCat: biCat};
}

function lietKeGmail_(cfg, mocIso) {
  var mocMs = mocIso ? new Date(mocIso).getTime() : 0;
  var after = mocMs ? Math.floor(mocMs / 1000) : 0;
  var q = truyVanGmail_(cfg.GMAIL_FROM, after);
  var out = [];
  var start = 0;
  var biCat = false;
  while (out.length < 100) {
    var threads = GmailApp.search(q, start, 25);
    if (!threads || !threads.length) break;
    var t;
    for (t = 0; t < threads.length && out.length < 100; t++) {
      var msgs = threads[t].getMessages();
      var m;
      for (m = 0; m < msgs.length && out.length < 100; m++) {
        var msg = msgs[m];
        if (!thuGuiTu_(msg.getFrom(), cfg.GMAIL_FROM)) continue;
        var luc = msg.getDate();
        if (mocMs && luc.getTime() <= mocMs) continue;
        var atts = msg.getAttachments();
        if (!atts || !atts.length) continue;
        var a;
        for (a = 0; a < atts.length && out.length < 100; a++) {
          out.push({
            nguon: 'Gmail',
            fileId: 'gmail:' + msg.getId() + ':' + a,
            ten: atts[a].getName(),
            khach: '',
            loai: loaiGmail_(atts[a].getName()),
            modifiedTime: luc.toISOString(),
            thuMuc: 'Gmail/' + cfg.GMAIL_FROM,
            url: 'https://mail.google.com/mail/u/0/#all/' + msg.getId(),
            duaVao: true
          });
        }
      }
    }
    if (out.length >= 100) biCat = true;
    if (threads.length < 25) break;
    start += threads.length;
  }
  out.sort(function(a, b) {
    return String(a.modifiedTime).localeCompare(String(b.modifiedTime));
  });
  return {items: out, biCat: biCat};
}

function quetChungTu_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return;
  try {
    var ss = moSo_();
    damBaoConfig_(ss);
    var cfg = docConfig_(ss);
    khoaSoDung_(ss, cfg);
    var sh = damBaoHangDoi_(ss);
    var bay = new Date();
    var iso = bay.toISOString();
    var hien = dinhDangLuc_(bay, cfg.TZ);
    var prop = PropertiesService.getScriptProperties();

    var qdDrive = quyetDinhMoc_(prop.getProperty(KHOA_MOC_DRIVE) || '', iso);
    var driveChon = [];
    var mocDriveMoi = qdDrive.mocLuu;
    if (!qdDrive.khoiTao) {
      var ketDrive = quetDriveTheoCay_(cfg, qdDrive.mocQuery);
      if (ketDrive.biCat) {
        throw new Error('Quá 400 file mới trong một lượt, chưa dời mốc Drive.');
      }
      driveChon = ketDrive.items;
      mocDriveMoi = iso;
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
        var gm = lietKeGmail_(cfg, qdG.mocQuery);
        if (gm.biCat) throw new Error('Quá 100 thư mới trong một lượt, chưa dời mốc Gmail.');
        gmailChon = gm.items;
        mocGmailMoi = iso;
        gmailChu = 'Mốc Gmail ' + mocGmailMoi;
      }
    }

    var loc = locTrung_(docKhoaDaCo_(sh), driveChon.concat(gmailChon));
    ghiHangMoi_(sh, loc.giu, hien);
    ghiCongThuc_(sh, 1, 26, congThucDemChoBot_());
    ghiO_(sh, 1, 25, 'Mốc Drive ' + mocDriveMoi);
    ghiO_(sh, 1, 24, gmailChu);
    prop.setProperty(KHOA_MOC_DRIVE, mocDriveMoi);
    if (luuGmail) prop.setProperty(KHOA_MOC_GMAIL, mocGmailMoi);
  } finally {
    lock.releaseLock();
  }
}
