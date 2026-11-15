#!/usr/bin/env node
// Sinh lib/conversation-seed.js từ migrations/V145_conversation_data_batch{1..8}.sql — NGUYÊN VĂN (không sửa chữ Hán/pinyin/tiếng Việt).
// Lý do: hàm Vercel không chắc đóng gói thư mục migrations/ lúc chạy, nên nhúng văn bản SQL vào module JS để nút "Nhập dữ liệu" của admin dùng được.
// Chạy lại khi sửa file batch: node scripts/build-conversation-seed.js   (test v154 đối chiếu file này với file SQL).
const fs = require('fs'); const path = require('path');
const { CONVERSATION_BATCHES } = require('../lib/conversation-batches');
const root = path.join(__dirname, '..');
const out = {};
for (const b of CONVERSATION_BATCHES) out[b.batch] = fs.readFileSync(path.join(root, 'migrations', b.file), 'utf8');
fs.writeFileSync(path.join(root, 'lib', 'conversation-seed.js'),
  `// TỰ SINH bởi scripts/build-conversation-seed.js — KHÔNG sửa tay. Nguyên văn 8 file migrations/V145_conversation_data_batch*.sql.\n` +
  `module.exports = ${JSON.stringify(out, null, 1)};\n`);
console.log('OK', Object.keys(out).length, 'batch');
