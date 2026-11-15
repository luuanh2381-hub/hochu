// js/word-image-audit.js — V144: logic THUẦN cho hệ thống quản lý & kiểm tra ẢNH GỢI NHỚ.
// Dùng ở CẢ server (api/index.js dựng số liệu) và browser (js/word-image-admin.js hiện bảng, xuất CSV).
// KHÔNG DB, KHÔNG R2, KHÔNG DOM → test được bằng node thuần.
//
// 4 mức xác minh (không bao giờ kết luận ảnh "có" chỉ vì cột storage_key có dữ liệu):
//   1) bản ghi  : word_images có hàng, status = 'ready', có storage_key  → bucket 'ok'
//   2) tệp R2   : HEAD đúng key ảnh trên R2 (verdict 'stored' / 'gone')  → do route verify trả về
//   3) URL      : ký được URL tải ảnh (presign lỗi → verdict 'unknown')
//   4) hiển thị : <img> thật sự load được (client ghi verdict.display = true/false)
(function (g) {
  'use strict';
  var TINY_BYTES = 8000; // ảnh < 8KB gần như chắc chắn là ảnh lỗi/trắng
  var CJK_RE = /[㐀-鿿豈-﫿]/;

  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function bucketOf(row) {
    if (!row) return 'missing';
    // 'ready' mà không có storage_key là hàng hỏng: không có ảnh để xem, và luồng sinh ảnh cũng không
    // tự chạm tới (chỉ nhận 'prompted'/'failed') → phải xếp vào nhóm LỖI để được xoá và tạo lại.
    if (row.status === 'ready') return row.storage_key ? 'ok' : 'error';
    if (row.status === 'failed') return 'error';
    return 'pending'; // drafting | prompted | generating
  }

  // ── Dựng danh sách từ cần kiểm tra: gộp theo CHỮ HÁN (1 chữ có thể nằm ở nhiều bài) ──
  function buildItems(words, rows) {
    var byHz = new Map();
    for (var i = 0; i < (words || []).length; i++) {
      var w = words[i] || {};
      var hz = norm(w.hz);
      if (!hz) continue;
      var it = byHz.get(hz);
      if (!it) { it = { hz: hz, py: norm(w.py), vi: norm(w.vi), lessons: [], tag: '', row: null }; byHz.set(hz, it); }
      var l = Number(w.l);
      if (Number.isFinite(l) && it.lessons.indexOf(l) < 0) it.lessons.push(l);
      if (!it.tag && norm(w.tag)) it.tag = norm(w.tag);
      if (!it.py) it.py = norm(w.py);
      if (!it.vi) it.vi = norm(w.vi);
    }
    for (var j = 0; j < (rows || []).length; j++) {
      var r = rows[j] || {};
      var target = byHz.get(norm(r.hz));
      if (target) target.row = r;
    }
    var out = [];
    byHz.forEach(function (it) { it.lessons.sort(function (a, b) { return a - b; }); out.push(it); });
    return out;
  }

  // Từ CÙNG nghĩa nhưng bị AI kể cùng một câu chuyện → nghi trùng ảnh (mỗi từ phải có ảnh riêng).
  function duplicateMap(items) {
    var byStory = new Map();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it.row) continue;
      var k = norm(it.row.story_vi).toLowerCase().replace(/[.!?,;:\s]+$/, '');
      if (k.length < 12) continue;
      if (!byStory.has(k)) byStory.set(k, []);
      byStory.get(k).push(it.hz);
    }
    var map = new Map();
    byStory.forEach(function (list) {
      if (list.length < 2) return;
      for (var i = 0; i < list.length; i++) map.set(list[i], list.filter(function (x) { return x !== list[i]; }));
    });
    return map;
  }
  // Cờ "cần xem lại chất lượng" — chỉ từ dữ liệu ĐANG CÓ, không phán đoán nội dung ảnh.
  function qcFlags(it) {
    var r = it.row, out = [];
    if (!r) return out;
    var b = bucketOf(r);
    if (b === 'error' && norm(r.error)) out.push('lỗi tạo: ' + norm(r.error).slice(0, 40));
    if (b === 'pending') out.push('đang chờ máy vẽ');
    if (b === 'ok') {
      if (!norm(r.story_vi)) out.push('thiếu câu chuyện gợi nhớ');
      if (Number(r.file_size) > 0 && Number(r.file_size) < TINY_BYTES) out.push('tệp ảnh nhỏ bất thường');
      if (CJK_RE.test(norm(r.image_prompt))) out.push('prompt còn chữ Hán');
      if (norm(r.content_type) && !/^image\//.test(norm(r.content_type))) out.push('content-type lạ');
    }
    return out;
  }

  function emptyCounts() { return { total: 0, ok: 0, missing: 0, pending: 0, error: 0, dup: 0, qc: 0 }; }
  function pct(part, total) { return total ? Math.round(part * 1000 / total) / 10 : 0; }

  // Thống kê theo 1 khoá (bài học hoặc nhãn). LƯU Ý: 1 từ có thể thuộc nhiều bài/nhãn → tổng các
  // dòng KHÔNG cộng lại thành tổng hệ thống (hàm trả về tổng hệ thống riêng: totals.words).
  function groupBy(items, keyOf) {
    var groups = new Map();
    for (var i = 0; i < items.length; i++) {
      var keys = keyOf(items[i]);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (!groups.has(key)) groups.set(key, emptyCounts());
        var c = groups.get(key);
        c.total++;
        c[items[i].bucket]++;
        if (items[i].dupOf.length) c.dup++;
        if (items[i].qc.length) c.qc++;
      }
    }
    var out = [];
    groups.forEach(function (c, key) { c.key = key; c.pctOk = pct(c.ok, c.total); out.push(c); });
    return out;
  }

  function audit(words, rows) {
    var items = buildItems(words, rows);
    var dups = duplicateMap(items);
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      it.bucket = bucketOf(it.row);
      it.dupOf = dups.get(it.hz) || [];
      it.qc = qcFlags(it);
      it.errorText = it.row ? norm(it.row.error) : '';
    }
    var totals = emptyCounts();
    for (var j = 0; j < items.length; j++) {
      totals.total++;
      totals[items[j].bucket]++;
      if (items[j].dupOf.length) totals.dup++;
      if (items[j].qc.length) totals.qc++;
    }
    totals.pctOk = pct(totals.ok, totals.total);
    return {
      items: items,
      totals: totals,
      byLesson: groupBy(items, function (x) { return x.lessons.length ? x.lessons : []; }).sort(function (a, b) { return a.key - b.key; }),
      byTag: groupBy(items, function (x) { return [x.tag || '(không nhãn)']; }).sort(function (a, b) { return String(a.key).localeCompare(String(b.key)); }),
    };
  }

  // ── Định dạng gửi qua mạng: mảng gọn (1 từ ≈ 90 byte) thay vì object, để trang quản trị tải nhanh ──
  function packItems(items) {
    return items.map(function (it) {
      return [
        it.hz, it.py, it.vi, it.lessons.join(','), it.tag, it.bucket,
        (it.dupOf.length ? 'd' : '') + (it.qc.length ? 'q' : ''),
        Number(it.row && it.row.file_size) || 0,
        it.row ? norm(it.row.content_type) : '',
        norm(it.errorText).slice(0, 60),
      ];
    });
  }
  function unpackItems(rows) {
    return (rows || []).map(function (r) {
      var fl = String(r[6] || '');
      return {
        hz: r[0], py: r[1] || '', vi: r[2] || '',
        lessons: String(r[3] || '').split(',').filter(Boolean).map(Number),
        tag: r[4] || '', bucket: r[5] || 'missing',
        hasDup: fl.indexOf('d') >= 0, hasQc: fl.indexOf('q') >= 0,
        size: Number(r[7]) || 0, ctype: r[8] || '', errorText: r[9] || '',
      };
    });
  }

  // ── Hàng đợi sinh ảnh theo thứ tự BẮT BUỘC: bài ưu tiên (37→36→38) → sửa ảnh lỗi → còn lại
  //    (bài thiếu nhiều nhất trước). Mỗi chữ Hán chỉ nằm ở ĐÚNG 1 chặng → không tạo trùng. ──
  function buildStages(items, priorityLessons) {
    var pri = (priorityLessons || []).map(Number);
    var seen = new Set();
    var uniq = function (list) {
      var out = [];
      for (var i = 0; i < list.length; i++) { if (seen.has(list[i].hz)) continue; seen.add(list[i].hz); out.push(list[i].hz); }
      return out;
    };
    var byLesson = new Map();
    for (var i = 0; i < items.length; i++) {
      for (var k = 0; k < items[i].lessons.length; k++) {
        var l = items[i].lessons[k];
        if (!byLesson.has(l)) byLesson.set(l, []);
        byLesson.get(l).push(items[i]);
      }
    }
    var stages = [], used = new Set();
    for (var p = 0; p < pri.length; p++) {
      used.add(pri[p]);
      var hzPri = uniq((byLesson.get(pri[p]) || []).filter(function (x) { return x.bucket === 'missing'; }));
      if (hzPri.length) stages.push({ kind: 'lesson', l: pri[p], label: 'Bài ' + pri[p], hz: hzPri });
    }
    var errs = uniq(items.filter(function (x) { return x.bucket === 'error'; }));
    if (errs.length) stages.push({ kind: 'errors', l: null, label: 'Sửa ảnh lỗi', hz: errs });
    var rest = [];
    byLesson.forEach(function (list, l) { if (!used.has(l)) rest.push({ l: l, hz: uniq(list.filter(function (x) { return x.bucket === 'missing'; })) }); });
    rest = rest.filter(function (x) { return x.hz.length; }).sort(function (a, b) { return b.hz.length - a.hz.length || a.l - b.l; });
    for (var q = 0; q < rest.length; q++) stages.push({ kind: 'lesson', l: rest[q].l, label: 'Bài ' + rest[q].l, hz: rest[q].hz });
    return stages;
  }

  // ── Nhãn trạng thái hiện trên bảng + trong CSV (1 chỗ duy nhất, tránh lệch nhau) ──
  function statusInfo(it, v) {
    var verdict = (v && v.v) || '';
    if (it.bucket === 'ok') {
      if (verdict === 'gone') return { key: 'gone', tone: 'bad', label: 'Ảnh hỏng: tệp không có trên R2' };
      if (v && v.display === false) return { key: 'nourl', tone: 'bad', label: 'Ảnh hỏng: không hiển thị được' };
      if (verdict === 'stored') return { key: 'ok', tone: 'ok', label: 'Đạt (đã kiểm tra tệp + hiển thị)' };
      if (verdict === 'unknown') return { key: 'ok?', tone: 'warn', label: 'Có bản ghi (chưa kiểm tra được R2)' };
      return { key: 'ok?', tone: 'warn', label: 'Có bản ghi (chưa kiểm tra R2)' };
    }
    if (it.bucket === 'missing') return { key: 'missing', tone: 'bad', label: 'Thiếu ảnh' };
    if (it.bucket === 'error') return { key: 'error', tone: 'bad', label: 'Lỗi khi tạo' + (it.errorText ? ': ' + it.errorText : '') };
    return { key: 'pending', tone: 'warn', label: 'Đang xử lý (chờ soạn prompt/vẽ)' };
  }
  function lessonText(it) { return it.lessons.length ? it.lessons.join(', ') : ''; }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  // CSV cho Excel: BOM + CRLF + escape theo RFC4180.
  function csv(rows) {
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  function exportRows(items, verdicts, mode) {
    var vs = verdicts || {};
    var list = items.filter(function (it) {
      if (mode === 'all') return true;
      if (mode === 'error') return it.bucket === 'error' || vs[it.hz] && (vs[it.hz].v === 'gone' || vs[it.hz].display === false);
      return it.bucket === 'missing';
    });
    var head = ['Chữ Hán', 'Pinyin', 'Nghĩa tiếng Việt', 'Bài', 'Nhãn', 'Trạng thái (DB)', 'Kiểm tra tệp R2', 'Hiển thị', 'Trùng với', 'Cần xem lại', 'Lý do / ghi chú'];
    var rows = list.map(function (it) {
      var v = vs[it.hz] || {};
      var si = statusInfo(it, v);
      return [
        it.hz, it.py, it.vi, lessonText(it), it.tag || '', si.label,
        v.v === 'stored' ? 'có tệp' : (v.v === 'gone' ? 'không có tệp' : (v.v ? v.v : 'chưa kiểm tra')),
        v.display === true ? 'OK' : (v.display === false ? 'LỖI' : 'chưa kiểm tra'),
        (it.dupOf || []).join(' '),
        (it.qc || []).join('; '),
        v.reason || '',
      ];
    });
    return csv([head].concat(rows));
  }

  // ── Báo cáo theo bài sau 1 lượt chạy hàng đợi ──
  // items0: bản chụp lúc bắt đầu · log: {hz: {gen, r2, show, reason}} · remaining: Set hz chưa xong
  function runReport(items0, log, remaining) {
    var map = new Map();
    for (var i = 0; i < items0.length; i++) {
      var it = items0[i];
      var keys = it.lessons.length ? it.lessons : [0];
      for (var k = 0; k < keys.length; k++) {
        if (!map.has(keys[k])) map.set(keys[k], { l: keys[k], total: 0, okStart: 0, missingStart: 0, created: 0, r2Ok: 0, showOk: 0, genFail: 0, uploadFail: 0, unprocessed: 0 });
        var c = map.get(keys[k]);
        c.total++;
        if (it.bucket === 'ok') c.okStart++;
        if (it.bucket === 'missing' || it.bucket === 'error') c.missingStart++;
        var e = log[it.hz];
        if (e) {
          if (e.gen) c.created++;
          if (e.r2) c.r2Ok++;
          if (e.show) c.showOk++;
          if (e.gen === false) c.genFail++;
          if (e.gen && e.r2 === false) c.uploadFail++;
        }
        if (remaining.has(it.hz)) c.unprocessed++;
      }
    }
    return Array.from(map.values()).sort(function (a, b) { return a.l - b.l; });
  }
  function unprocessedList(items0, log, remaining, stopReason) {
    return items0.filter(function (it) { return remaining.has(it.hz); }).map(function (it) {
      var e = log[it.hz] || {};
      return { hz: it.hz, vi: it.vi, lessons: lessonText(it), reason: e.reason || stopReason || 'chưa tới lượt' };
    });
  }

  var API = {
    TINY_BYTES: TINY_BYTES,
    norm: norm, bucketOf: bucketOf, buildItems: buildItems, qcFlags: qcFlags,
    audit: audit, packItems: packItems, unpackItems: unpackItems,
    buildStages: buildStages, statusInfo: statusInfo, lessonText: lessonText,
    csv: csv, exportRows: exportRows, runReport: runReport, unprocessedList: unprocessedList,
  };
  g.WIAudit = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
