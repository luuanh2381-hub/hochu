// lib/hanzi-parts.js — V118.2: kiểm tra "dòng chiết tự nào DÙNG ĐƯỢC". Thuần, không DB.
// Trước đây admin đếm "đã có chiết tự" = có DÒNG trong bảng hanzi_parts, còn giao diện chỉ hiển thị được dòng đúng dạng
// {type:'parts', items:[{c,m}]} hoặc {type:'note', text}. Dòng rỗng / sai dạng / bị mã hoá JSON 2 lần được đếm là "xong" nhưng không hiện được.
function normalizeParts(p) {
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch { return null; } } // dòng bị JSON.stringify 2 lần
  if (!p || typeof p !== 'object') return null;
  if (p.type === 'parts' && Array.isArray(p.items)) {
    const items = p.items.filter(x => x && x.c && x.m);
    return items.length ? { type: 'parts', items } : null;
  }
  if (p.type === 'note' && typeof p.text === 'string' && p.text.trim()) return { type: 'note', text: p.text };
  return null;
}
// rows = [{hz, parts}], charSet = Set chữ cần có → { done, validSet, invalid: [chữ có dòng nhưng không dùng được], missing: [chữ chưa có dòng] }
function auditParts(rows, charSet) {
  const validSet = new Set(), rowKeys = new Set();
  for (const r of rows) { rowKeys.add(r.hz); if (normalizeParts(r.parts)) validSet.add(r.hz); }
  const invalid = [], missing = [];
  for (const ch of [...charSet].sort()) {
    if (validSet.has(ch)) continue;
    (rowKeys.has(ch) ? invalid : missing).push(ch);
  }
  return { done: [...charSet].filter(c => validSet.has(c)).length, validSet, invalid, missing };
}
module.exports = { normalizeParts, auditParts };
