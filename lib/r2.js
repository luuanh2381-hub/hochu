// lib/r2.js — Cloudflare R2 (S3-compatible) — CHỈ chạy ở server, CHỈ dùng cho ẢNH GỢI NHỚ từ vựng (V142).
//
// V148: âm thanh không đi qua tệp này (client gọi Edge-TTS trực tiếp) — tệp chỉ phục vụ ảnh.
// Credentials đọc từ biến môi trường, KHÔNG bao giờ trả ra client, KHÔNG log giá trị.
// Chỉ dùng đúng bucket trong R2_BUCKET_NAME; key ảnh do server tự sinh từ hash (client không được chọn key).
// Chỉ nhận JPEG/PNG/WebP (kiểm tra magic bytes). Presigned URL 15–30 phút.
'use strict';

const { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_ENDPOINT'];
const PRESIGN_MIN = 900;      // 15 phút
const PRESIGN_MAX = 1800;     // 30 phút
const PRESIGN_DEFAULT = 1200; // 20 phút

// Ảnh gợi nhớ từ vựng — chỉ nhận JPEG/PNG/WebP (kiểm tra magic bytes), tối đa 2 MB.
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

  // Key ảnh do server suy ra từ hash (client không chọn): img/v1/<2 ký tự>/<hash>.<ext>
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

  async function headObject(key) {
    if (!isConfigured()) throw new Error('R2 chưa cấu hình');
    if (!IMAGE_KEY_RE.test(String(key || ''))) throw new Error('Key ảnh không hợp lệ');
    try {
      const out = await getClient().send(new HeadObjectCommand({ Bucket: config().bucket, Key: key }));
      return { contentLength: out && out.ContentLength, contentType: out && out.ContentType };
    } catch (err) {
      const status = err && err.$metadata && err.$metadata.httpStatusCode;
      if (status === 404 || err.name === 'NotFound' || err.name === 'NoSuchKey') return null;
      throw err;
    }
  }

  return { ENV_KEYS, clampExpiry, config, missingEnv, isConfigured, getClient, headObject,
    detectImage, imageKey, putImage, presignImageGet };
}

const defaultR2 = createR2();

module.exports = defaultR2;
module.exports.createR2 = createR2;
module.exports.detectImage = detectImage;
module.exports.PRESIGN_MIN = PRESIGN_MIN;
module.exports.PRESIGN_MAX = PRESIGN_MAX;
module.exports.PRESIGN_DEFAULT = PRESIGN_DEFAULT;