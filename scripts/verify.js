#!/usr/bin/env node
// scripts/verify.js — một lệnh duy nhất cho mỗi vùng code: syntax + test liên quan.
//
// Thay cho chuỗi thủ công "node --check nhiều file; npm test; npm run test:xxx" tốn
// 3-5 lượt gọi tool mỗi lần sửa. Ở đây là 1 lượt, và chỉ in 1 dòng mỗi mục khi qua.
//
// Dùng: node scripts/verify.js <vùng>     (xem AREAS bên dưới)
//       node scripts/verify.js --list
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Vùng → file cần `node --check` + file test cần chạy.
// Quy ước: chỉ chứa test KHÔNG cần DATABASE_URL, để lệnh này chạy được ở mọi máy.
const AREAS = {
  server: {
    desc: 'api/index.js + lib/ (route, DB, kỹ năng, FSRS)',
    syntax: ['api/index.js', ...glob('lib/**/*.js')],
    tests: ['test/auth-security.test.js', 'test/xss-escaping.smoke.test.js', 'test/skills.test.js', 'test/drill-notes.test.js', 'test/cron-task.test.js', 'test/v142-word-images.test.js', 'test/v144-word-image-admin.test.js', 'test/v145-conversation.test.js', 'test/v146-session-size.test.js', 'test/v147-tts-latency.test.js', 'test/v148-no-r2-audio.test.js'],
  },
  ui: {
    desc: 'js/ + css/ + index.html (frontend)',
    syntax: [...glob('js/*.js')],
    tests: [
      'test/v110-ui.smoke.test.js', 'test/v132-tap-only.test.js', 'test/v133-duel-listen.test.js',
      'test/v134-binary-tf.test.js', 'test/v135-sentence-order.test.js', 'test/v136-question-mix.test.js', 'test/v137-tone-recognition.test.js', 'test/v138-sentence.test.js', 'test/v150-exercise-tier.test.js', 'test/v151-image-button.test.js', 'test/v152-conversation-gen.test.js', 'test/v116-menu.test.js', 'test/v140-tts-natural.test.js', 'test/v142-word-images.test.js', 'test/v143-study-ux.test.js', 'test/v144-word-image-admin.test.js', 'test/v145-conversation.test.js', 'test/v146-session-size.test.js', 'test/v149-legacy-cap.test.js', 'test/v147-tts-latency.test.js',
    ],
  },
  core: {
    desc: 'module thuần dùng chung server+browser',
    syntax: ['js/question-engine.js', 'js/question-selector.js', 'js/order-sentence.js', 'js/answer-match.js', 'js/skill-score.js', 'js/audio-hash.js', 'lib/skills.js'],
    tests: ['test/question-engine.test.js', 'test/adaptive-session.test.js', 'test/answer-match.test.js', 'test/review-render.smoke.test.js', 'test/skills.test.js', 'test/v138-sentence.test.js'],
  },
  fsrs: {
    desc: 'lõi FSRS + optimizer (không gồm test cần DATABASE_URL)',
    syntax: [...glob('lib/fsrs/*.js'), 'lib/fsrs.js'],
    tests: ['test/fsrs.test.js', 'test/fsrs-optimizer.test.js', 'test/retention-recommend.test.js', 'test/study-time.test.js'],
  },
};

function glob(pattern) {
  // Đủ cho nhu cầu ở đây: chỉ hỗ trợ "dir/*.js" và "dir/**/*.js", không cần thư viện ngoài.
  const starStar = pattern.includes('/**/');
  const [dir, rest] = starStar
    ? [pattern.split('/**/')[0], pattern.split('/**/')[1]]
    : pattern.split('/');
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (starStar) walk(p);
      } else if (e.name.endsWith('.js')) {
        out.push(path.relative(ROOT, p));
      }
    }
  };
  walk(base);
  return out.sort();
}

const area = process.argv[2];
if (!area || area === '--list') {
  console.log('Vùng khả dụng:');
  for (const [k, v] of Object.entries(AREAS)) console.log(`  ${k.padEnd(8)} ${v.desc}`);
  process.exit(area ? 0 : 2);
}
if (!AREAS[area]) {
  console.error(`Vùng không hợp lệ: ${area}\nChạy: node scripts/verify.js --list`);
  process.exit(2);
}

const cfg = AREAS[area];
let bad = 0;

// 1) Syntax check — im lặng khi sạch.
const syntaxFails = [];
for (const f of cfg.syntax) {
  const r = spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
  if (r.status !== 0) syntaxFails.push({ f, out: `${r.stdout || ''}${r.stderr || ''}` });
}
if (syntaxFails.length) {
  bad += syntaxFails.length;
  console.log(`❌ syntax: ${syntaxFails.length}/${cfg.syntax.length} file lỗi`);
  for (const { f, out } of syntaxFails) console.log(`  ${f}\n${out.trimEnd()}`);
} else {
  console.log(`✅ syntax: ${cfg.syntax.length} file sạch`);
}

// 2) Test — giao hẳn cho run-tests.js (in đầy đủ khi fail).
console.log(`▶ verify:${area} — ${cfg.desc}`);
const r = spawnSync(process.execPath, [path.join(__dirname, 'run-tests.js'), ...cfg.tests], {
  stdio: 'inherit',
  env: process.env,
});
if (r.status !== 0) bad++;

process.exit(bad ? 1 : 0);
