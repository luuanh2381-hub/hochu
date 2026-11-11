#!/usr/bin/env node
// scripts/run-tests.js — chạy nhiều file test và CHỈ in kết quả khi có lỗi.
//
// Vì sao: mỗi suite in ~2-10KB dòng "✅ ..." khi tất cả đều qua. Những dòng đó đi vào
// context của phiên làm việc và bị tính lại ở MỌI lượt gọi sau (prompt caching), nên
// in ít là tiết kiệm thật.
//
// Nguyên tắc an toàn: PASS → 1 dòng tóm tắt. FAIL → in TOÀN BỘ output của file đó,
// không cắt gì. Không bao giờ coi "không thấy lỗi" là "đã qua" — luôn dựa vào exit code.
//
// Dùng: node scripts/run-tests.js test/fsrs.test.js test/skills.test.js
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Dùng: node scripts/run-tests.js <file test> [...]');
  process.exit(2);
}

const SUMMARY_RE = /^[^\n]*(passed,\s*\d+\s*failed|Kết quả:\s*\d+\s*PASS,\s*\d+\s*FAIL)[^\n]*$/m;

let failedFiles = 0;
const failures = [];
const started = Date.now();

for (const file of files) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    failedFiles++;
    failures.push({ file, output: `Không tìm thấy file: ${abs}` });
    continue;
  }

  const r = spawnSync(process.execPath, [abs], {
    encoding: 'utf8',
    env: process.env,
    timeout: 600_000,
  });
  const output = `${r.stdout || ''}${r.stderr || ''}`;
  const ok = r.status === 0;

  if (ok) {
    const m = output.match(SUMMARY_RE);
    const summary = m ? m[0].trim().replace(/^[^\d]*/, '') : 'exit 0';
    console.log(`✅ ${path.basename(file)} — ${summary}`);
  } else {
    failedFiles++;
    const reason = r.error ? ` (${r.error.message})` : r.signal ? ` (signal ${r.signal})` : ` (exit ${r.status})`;
    console.log(`❌ ${path.basename(file)} — FAIL${reason}`);
    failures.push({ file, output });
  }
}

for (const { file, output } of failures) {
  console.log(`\n───────── OUTPUT ĐẦY ĐỦ: ${file} ─────────`);
  console.log(output.trimEnd());
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n${files.length - failedFiles}/${files.length} file test qua (${secs}s)`);
process.exit(failedFiles ? 1 : 0);
