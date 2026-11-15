#!/usr/bin/env node
// scripts/token-report.js — đọc log phiên Claude Code (.jsonl) và in số token THẬT.
//
// Vì sao: số liệu token chỉ có trong ~/.claude/projects/<slug>/*.jsonl. Không có script
// thì mỗi lần cần báo cáo phải viết lại vài lệnh python rời (tốn thêm lượt gọi tool).
// Script này CHỈ đọc file JSONL có sẵn — không gọi mạng, không gửi gì đi đâu.
//
// Dùng:
//   node scripts/token-report.js              # phiên mới nhất của project này
//   node scripts/token-report.js --all        # tất cả phiên của project này
//   node scripts/token-report.js --file <x>   # chỉ định file .jsonl
const fs = require('fs');
const os = require('os');
const path = require('path');

function projectSlug(dir) {
  return path.resolve(dir).replace(/[\/\\]/g, '-');
}

function sessionsDir() {
  const base = path.join(os.homedir(), '.claude', 'projects');
  const exact = path.join(base, projectSlug(process.cwd()));
  if (fs.existsSync(exact)) return exact;
  // Fallback: chọn thư mục gần đúng nhất (đuôi của slug)
  if (!fs.existsSync(base)) return null;
  const want = path.basename(projectSlug(process.cwd()));
  const hit = fs.readdirSync(base).find((d) => d.endsWith(want));
  return hit ? path.join(base, hit) : null;
}

function parseFile(file) {
  const stat = { file, calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, toolCalls: 0, prompts: 0 };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const m = d && d.message;
    if (!m || typeof m !== 'object') continue;
    if (m.usage) {
      stat.calls++;
      stat.input += m.usage.input_tokens || 0;
      stat.cacheRead += m.usage.cache_read_input_tokens || 0;
      stat.cacheWrite += m.usage.cache_creation_input_tokens || 0;
      stat.output += m.usage.output_tokens || 0;
    }
    if (m.role === 'user' && typeof m.content === 'string' && !m.content.startsWith('<')) stat.prompts++;
    if (Array.isArray(m.content)) {
      for (const b of m.content) if (b && b.type === 'tool_use') stat.toolCalls++;
    }
  }
  stat.mtime = fs.statSync(file).mtime;
  return stat;
}

function fmt(n) { return n.toLocaleString('en-US'); }
function row(label, v) { return `${label.padEnd(22)} ${fmt(v)}`; }

const args = process.argv.slice(2);
let files = [];

if (args[0] === '--file' && args[1]) {
  files = [args[1]];
} else {
  const dir = sessionsDir();
  if (!dir) {
    console.error('Không tìm thấy thư mục ~/.claude/projects cho project này.');
    console.error('Đây là giới hạn của môi trường, KHÔNG phải số liệu 0.');
    process.exit(1);
  }
  const all = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dir, f));
  if (!all.length) { console.error(`Không có file .jsonl trong ${dir}`); process.exit(1); }
  files = args[0] === '--all'
    ? all.sort((a, b) => fs.statSync(a).mtime - fs.statSync(b).mtime)
    : [all.sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime)[0]];
}

const stats = files.map(parseFile);

for (const s of stats) {
  console.log(`\n── ${path.basename(s.file)}  (${s.mtime.toISOString().replace('T', ' ').slice(0, 19)})`);
  console.log(row('Lần gọi API', s.calls));
  console.log(row('Input tokens', s.input));
  console.log(row('Cache read tokens', s.cacheRead));
  console.log(row('Cache write tokens', s.cacheWrite));
  console.log(row('Output tokens', s.output));
  console.log(row('Tool calls', s.toolCalls));
  console.log(row('Prompt người dùng', s.prompts));
}

if (stats.length > 1) {
  const sum = stats.reduce((a, s) => {
    for (const k of ['calls', 'input', 'cacheRead', 'cacheWrite', 'output', 'toolCalls', 'prompts']) a[k] += s[k];
    return a;
  }, { calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, toolCalls: 0, prompts: 0 });
  console.log('\n── TỔNG');
  console.log(row('Lần gọi API', sum.calls));
  console.log(row('Input tokens', sum.input));
  console.log(row('Cache read tokens', sum.cacheRead));
  console.log(row('Cache write tokens', sum.cacheWrite));
  console.log(row('Output tokens', sum.output));
  console.log(row('Tool calls', sum.toolCalls));
  console.log(row('Prompt người dùng', sum.prompts));
}

const ctx = stats.reduce((a, s) => a + (s.calls ? s.cacheRead / s.calls : 0), 0) / (stats.length || 1);
console.log(`\nContext cache-read trung bình mỗi lần gọi: ~${fmt(Math.round(ctx))} token`);
