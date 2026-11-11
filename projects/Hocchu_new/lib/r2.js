// lib/r2.js — V141: Cloudflare R2 (S3-compatible) — CHỈ chạy ở server.
//
// Credentials đọc từ biến môi trường, KHÔNG bao giờ trả ra client, KHÔNG log giá trị.
// Chỉ dùng đúng bucket trong R2_BUCKET_NAME; storage_key do server tự sinh từ content_hash
// (client không được chọn key). Chỉ nhận MP3 (kiểm tra frame sync giống api/edge-tts.py).
// Presigned URL 15–30 phút; health check chỉ trả mã trạng thái an toàn, không trả e.message.
'use strict';

const {
  S3Client, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command,
  PutObjectCommand, DeleteObjectCommand, GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_ENDPOINT'];
const PRESIGN_MIN = 900;      // 15 phút
const PRESIGN_MAX = 1800;     // 30 phút
const PRESIGN_DEFAULT = 1200; // 20 phút
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const HEALTH_KEY = 'health/probe.mp3';

function isMp3(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 4 && buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0;
}

// V142: ảnh gợi nhớ từ vựng — chỉ nhận JPEG/PNG/WebP (kiểm tra magic bytes), tối đa 2 MB.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
function detectImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return { ext: 'jpg', contentType: IMAGE_TYPES.jpg };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return { ext: 'png', contentType: IMAGE_TYPES.png };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', contentType: IMAGE_TYPES.webp };
  return null;
}
const IMAGE_KEY_RE = /^img\/v1\/[a-f0-9]{2}\/[a-f0-9]{64}\.(jpg|png|webp)$/;

function clampExpiry(seconds) {
  const n = Math.round(Number(seconds));
  if (!Number.isFinite(n)) return PRESIGN_DEFAULT;
  return Math.min(PRESIGN_MAX, Math.max(PRESIGN_MIN, n));
}

function errorCode(err) {
  // Chỉ trả mã lỗi ổn định của AWS/SDK, không trả message (có thể chứa chi tiết nội bộ).
  if (err && typeof err.Code === 'string' && err.Code) return err.Code; // lỗi S3 (AccessDenied, InvalidRequest…)
  if (err && typeof err.name === 'string' && err.name && err.name !== 'Error') return err.name;
  const status = err && err.$metadata && err.$metadata.httpStatusCode;
  return status ? 'HTTP_' + status : 'unknown';
}

function createR2(opts) {
  const options = opts || {};
  const readEnv = options.env || (() => process.env);
  const sign = options.sign || ((client, command, o) => getSignedUrl(client, command, o));
  let client = options.client || null;

  function config() {
    const env = readEnv();
    return {
      accountId: env.R2_ACCOUNT_ID || '',
      accessKeyId: env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: env.R2_SECRET_ACCESS_KEY || '',
      bucket: env.R2_BUCKET_NAME || '',
      endpoint: env.R2_ENDPOINT || '',
    };
  }
  function missingEnv() {
    const env = readEnv();
    return ENV_KEYS.filter((k) => !env[k]);
  }
  function isConfigured() { return missingEnv().length === 0; }

  function getClient() {
    if (client) return client;
    const c = config();
    client = new S3Client({
      region: 'auto',
      endpoint: c.endpoint,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
      // R2 chỉ hỗ trợ checksum FULL_OBJECT cho CRC-64/NVME; AWS SDK v3 tự gắn CRC32 FULL_OBJECT
      // vào PutObject và R2 từ chối. WHEN_REQUIRED tắt checksum tự động (chỉ gửi khi API bắt buộc).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return client;
  }

  // Key suy ra từ content_hash (server tự tính) — không nhận key từ client.
  function storageKey(hash) {
    if (!/^[a-f0-9]{64}$/.test(String(hash || ''))) throw new Error('content_hash không hợp lệ');
    return `tts/v1/${hash.slice(0, 2)}/${hash}.mp3`;
  }

  async function presignGet(hashOrKey, expiresIn) {
    if (!isConfigured()) throw new Error('R2 chưa cấu hình');
    const key = /^[a-f0-9]{64}$/.test(String(hashOrKey || '')) ? storageKey(hashOrKey) : String(hashOrKey || '');
    if (!key.endsWith('.mp3')) throw new Error('Chỉ ký URL cho tệp MP3');
    const url = await sign(getClient(), new GetObjectCommand({ Bucket: config().bucket, Key: key }), { expiresIn: clampExpiry(expiresIn) });
    return url;
  }

  async function putMp3(hashOrKey, buf) {
    if (!isConfigured()) throw new Error('R2 chưa cấu hình');
    const key = /^[a-f0-9]{64}$/.test(String(hashOrKey || '')) ? storageKey(hashOrKey) : String(hashOrKey || '');
    if (!key.endsWith('.mp3')) throw new Error('Chỉ được tải lên tệp MP3');
    if (!isMp3(buf)) throw new Error('Dữ liệu tải lên không phải MP3');
    if (buf.length > MAX_UPLOAD_BYTES) throw new Error('Tệp MP3 quá lớn');
    await getClient().send(new PutObjectCommand({
      Bucket: config().bucket,
      Key: key,
      Body: buf,
      ContentType: 'audio/mpeg',
      ContentLength: buf.length,
    }));
    return key;
  }

  // V142: key ảnh do server suy ra từ hash (client không chọn): img/v1/<2 ký tự>/<hash>.<ext>
  function imageKey(hash, ext) {
    if (!/^[a-f0-9]{64}$/.test(String(hash || ''))) throw new Error('hash ảnh không hợp lệ');
    if (!IMAGE_TYPES[ext]) throw new Error('Định dạng ảnh không hợp lệ');
    return `img/v1/${hash.slice(0, 2)}/${hash}.${ext}`;
  }
  async function putImage(hash, buf) {
    if (!isConfigured()) throw new Error('R2 chưa cấu hình');
    const kind = detectImage(buf);
    if (!kind) throw new Error('Dữ liệu tải lên không phải ảnh JPEG/PNG/WebP');
    if (buf.length > MAX_IMAGE_BYTES) throw new Error('Ảnh quá lớn');
    const key = imageKey(hash, kind.ext);
    await getClient().send(new PutObjectCommand({
      Bucket: config().bucket, Key: key, Body: buf, ContentType: kind.contentType, ContentLength: buf.length,
    }));
    return { key, contentType: kind.contentType, size: buf.length };
  }
  async function presignImageGet(key, expiresIn) {
    if (!isConfigured()) throw new Error('R2 chưa cấu hình');
    if (!IMAGE_KEY_RE.test(String(key || ''))) throw new Error('Key ảnh không hợp lệ');
    return sign(getClient(), new GetObjectCommand({ Bucket: config().bucket, Key: key }), { expiresIn: clampExpiry(expiresIn) });
  }

  async function headObject(hashOrKey) {
    if (!isConfigured()) throw new Error('R2 chưa cấu hình');
    const key = /^[a-f0-9]{64}$/.test(String(hashOrKey || '')) ? storageKey(hashOrKey) : String(hashOrKey || '');
    try {
      const out = await getClient().send(new HeadObjectCommand({ Bucket: config().bucket, Key: key }));
      return { contentLength: out && out.ContentLength, contentType: out && out.ContentType };
    } catch (err) {
      const status = err && err.$metadata && err.$metadata.httpStatusCode;
      if (status === 404 || err.name === 'NotFound' || err.name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async function head(hashOrKey) {
    return (await headObject(hashOrKey)) !== null;
  }

  // Kiểm tra: đủ 5 biến môi trường → bucket tồn tại/quyền vào → đọc → ghi → HEAD xác minh → ký URL.
  // Ghi thử 1 object MP3 4 byte bằng đúng hàm putMp3, HEAD lại để xác nhận, rồi xoá.
  async function health() {
    const started = Date.now();
    const checks = { env: 'unknown', bucket: 'unknown', read: 'unknown', write: 'unknown', verify: 'unknown', cleanup: 'unknown', presign: 'unknown' };
    const errors = [];
    const missing = missingEnv();
    if (missing.length) {
      checks.env = 'missing';
      return { ok: false, configured: false, checks, errors: [{ check: 'env', code: 'missing', missing }], latencyMs: Date.now() - started };
    }
    checks.env = 'ok';
    const c = config();
    try {
      await getClient().send(new HeadBucketCommand({ Bucket: c.bucket }));
      checks.bucket = 'ok';
    } catch (err) {
      checks.bucket = 'fail';
      errors.push({ check: 'bucket', code: errorCode(err) });
      return { ok: false, configured: true, checks, errors, latencyMs: Date.now() - started };
    }
    try {
      await getClient().send(new ListObjectsV2Command({ Bucket: c.bucket, MaxKeys: 1 }));
      checks.read = 'ok';
    } catch (err) {
      checks.read = 'fail';
      errors.push({ check: 'read', code: errorCode(err) });
    }
    const probe = Buffer.from([0xFF, 0xFB, 0x90, 0x64]);
    try {
      await putMp3(HEALTH_KEY, probe);
      checks.write = 'ok';
      try {
        const meta = await headObject(HEALTH_KEY);
        checks.verify = meta && (meta.contentLength == null || meta.contentLength === probe.length) ? 'ok' : 'mismatch';
        if (checks.verify !== 'ok') errors.push({ check: 'verify', code: 'mismatch' });
      } catch (err) {
        checks.verify = 'fail';
        errors.push({ check: 'verify', code: errorCode(err) });
      }
      try {
        await getClient().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: HEALTH_KEY }));
        checks.cleanup = 'ok';
      } catch (err) {
        checks.cleanup = 'fail';
        errors.push({ check: 'cleanup', code: errorCode(err) });
      }
    } catch (err) {
      checks.write = 'fail';
      errors.push({ check: 'write', code: errorCode(err) });
    }
    try {
      const url = await presignGet('health/probe.mp3', PRESIGN_DEFAULT);
      checks.presign = /^https:\/\//.test(String(url)) ? 'ok' : 'fail';
      if (checks.presign !== 'ok') errors.push({ check: 'presign', code: 'invalid_url' });
    } catch (err) {
      checks.presign = 'fail';
      errors.push({ check: 'presign', code: errorCode(err) });
    }
    return {
      ok: checks.bucket === 'ok' && checks.read === 'ok' && checks.write === 'ok' && checks.verify === 'ok' && checks.presign === 'ok',
      configured: true,
      bucket: c.bucket,
      checks,
      errors,
      latencyMs: Date.now() - started,
    };
  }

  return { ENV_KEYS, isMp3, clampExpiry, config, missingEnv, isConfigured, getClient, storageKey, presignGet, putMp3, head, headObject, health,
    detectImage, imageKey, putImage, presignImageGet };
}

const defaultR2 = createR2();

module.exports = defaultR2;
module.exports.createR2 = createR2;
module.exports.isMp3 = isMp3;
module.exports.detectImage = detectImage;
module.exports.PRESIGN_MIN = PRESIGN_MIN;
module.exports.PRESIGN_MAX = PRESIGN_MAX;
module.exports.PRESIGN_DEFAULT = PRESIGN_DEFAULT;