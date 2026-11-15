// test/helpers/mini-pg.js — client Postgres TỐI THIỂU (giao thức "simple query", xác thực trust) chỉ để TEST với Postgres thật
// khi không cài được gói 'pg'. Không dùng ở production. Hỗ trợ: query(sql) 1 hoặc nhiều câu, lỗi có .code (SQLSTATE), kiểu int/bool/json.
const net = require('net');

// Chỉ để TEST: thay $1,$2… bằng literal đã escape (thay cho extended protocol). Không dùng với dữ liệu không tin cậy.
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.length ? `ARRAY[${v.map(lit).join(',')}]` : "'{}'";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function interpolate(sql, params) { return sql.replace(/\$(\d+)/g, (m, n) => (Number(n) >= 1 && Number(n) <= params.length ? lit(params[n - 1]) : m)); }

function connectMini({ host = '127.0.0.1', port = Number(process.env.TEST_PG_PORT || 54329), user = 'postgres', database = 'postgres' } = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, host);
    let buf = Buffer.alloc(0);
    let waiter = null;
    let ready = false;
    const queue = [];
    sock.on('error', (e) => { if (waiter) waiter.reject(e); else reject(e); });
    sock.on('close', () => { if (waiter) waiter.reject(Object.assign(new Error('Connection terminated'), { code: 'ECONNRESET' })); });
    const startup = () => {
      const params = Buffer.from(`user\0${user}\0database\0${database}\0\0`);
      const len = 8 + params.length;
      const b = Buffer.alloc(len); b.writeInt32BE(len, 0); b.writeInt32BE(196608, 4); params.copy(b, 8);
      sock.write(b);
    };
    function parseMsgs(onMsg) {
      while (buf.length >= 5) {
        const len = buf.readInt32BE(1);
        if (buf.length < 1 + len) return;
        const type = String.fromCharCode(buf[0]);
        const body = buf.subarray(5, 1 + len);
        buf = buf.subarray(1 + len);
        onMsg(type, body);
      }
    }
    const conv = (oid, v) => {
      if (v === null) return null;
      if (oid === 16) return v === 't';
      if (oid === 20 || oid === 21 || oid === 23) return Number(v);
      if (oid === 114 || oid === 3802) return JSON.parse(v);
      return v;
    };
    function errFields(body) {
      const f = {}; let i = 0;
      while (i < body.length && body[i] !== 0) { const c = String.fromCharCode(body[i]); const e = body.indexOf(0, i + 1); f[c] = body.toString('utf8', i + 1, e); i = e + 1; }
      return f;
    }
    let cur = null;
    function onMsg(type, body) {
      if (!ready) {
        if (type === 'E') { const f = errFields(body); return reject(Object.assign(new Error(f.M), { code: f.C })); }
        if (type === 'Z') { ready = true; return resolve(client); }
        return;
      }
      if (!cur) return;
      if (type === 'T') {
        const n = body.readInt16BE(0); let o = 2; cur.fields = [];
        for (let k = 0; k < n; k++) { const e = body.indexOf(0, o); const name = body.toString('utf8', o, e); o = e + 1; const oid = body.readInt32BE(o + 6); o += 18; cur.fields.push({ name, oid }); }
      } else if (type === 'D') {
        const n = body.readInt16BE(0); let o = 2; const row = {};
        for (let k = 0; k < n; k++) { const l = body.readInt32BE(o); o += 4; if (l < 0) row[cur.fields[k].name] = null; else { row[cur.fields[k].name] = conv(cur.fields[k].oid, body.toString('utf8', o, o + l)); o += l; } }
        cur.rows.push(row);
      } else if (type === 'C') {
        const tag = body.toString('utf8', 0, body.length - 1); const m = tag.match(/(\d+)$/); cur.rowCount = m ? Number(m[1]) : 0;
      } else if (type === 'E') {
        if (!cur.error) { const f = errFields(body); cur.error = Object.assign(new Error(f.M), { code: f.C, detail: f.D }); }
      } else if (type === 'Z') {
        const c = cur; cur = null;
        if (c.error) c.reject(c.error); else c.resolve({ rows: c.rows, rowCount: c.rowCount });
        next();
      }
    }
    function next() {
      if (cur || !queue.length) return;
      cur = queue.shift(); cur.rows = []; cur.fields = []; cur.rowCount = 0;
      const q = Buffer.from(cur.sql + '\0');
      const b = Buffer.alloc(5 + q.length); b[0] = 0x51; b.writeInt32BE(4 + q.length, 1); q.copy(b, 5);
      sock.write(b);
    }
    sock.on('data', (d) => { buf = Buffer.concat([buf, d]); parseMsgs(onMsg); });
    const client = {
      query(sql, params) {
        if (typeof sql !== 'string') throw new Error('mini-pg: chỉ hỗ trợ query(text, params?)');
        if (params && params.length) sql = interpolate(sql, params);
        return new Promise((resolve, reject) => { queue.push({ sql, resolve, reject }); next(); });
      },
      release() { try { sock.end(); } catch (e) { /* bỏ qua */ } },
      end() { try { sock.end(); } catch (e) { /* bỏ qua */ } },
    };
    sock.on('connect', startup);
  });
}

module.exports = { connectMini };
