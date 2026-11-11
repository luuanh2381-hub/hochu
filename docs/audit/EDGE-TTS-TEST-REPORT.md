# EDGE-TTS-TEST-REPORT — phòng thử nghiệm `/tts-lab`

Ngày đo: 2026-11-09 · Môi trường: Termux Linux (aarch64), Python `/data/data/com.termux/files/usr/bin/python3`,
`edge-tts 7.3.1` · Mạng thật tới dịch vụ Edge-TTS.

Phạm vi: **chỉ thư mục `tts-lab/`**. Không sửa FSRS, Question Engine, review, dữ liệu từ vựng,
tài khoản, thống kê, hệ thống audio hiện có, Web Speech API; không đổi DB/schema; không nối vào bài học.

## 1. Kiến trúc

```
Trình duyệt  ──POST /api/tts──►  tts-lab/server.py  ──websocket──►  Edge-TTS (Microsoft)
    ▲                                │  (stdlib http.server)
    └────────── audio/mpeg ──────────┘  không DB · không lưu text · không log
```

| File | Vai trò |
|---|---|
| `tts-lab/server.py` | HTTP server stdlib: 2 route GET + 1 POST, whitelist 2 voice, 500 ký tự, rate limit, timeout |
| `tts-lab/index.html` | UI thuần HTML/CSS/JS (không build, không framework), gọi `/api/tts` |
| `tts-lab/test_tts_lab.py` | 7 unit test phần thuần (validate, map tốc độ, rate limit) |
| `tts-lab/check_voices.py` | Script đo thực tế 2 voice × 5 tốc độ × 5 câu; ghi MP3 ra thư mục tạm |

Chạy: `python3 tts-lab/server.py` → `http://127.0.0.1:8765/tts-lab`.

## 2. Voice — kết quả kiểm tra thực tế

| Voice | Giới tính | Có trong `edge-tts --list-voices` | Tạo MP3 thật |
|---|---|---|---|
| `zh-CN-XiaoxiaoNeural` | Nữ (mặc định) | Có | **Có** — 25/25 lần OK |
| `zh-CN-YunxiNeural` | Nam | Có | **Có** — 25/25 lần OK |

Không dùng và không cấu hình bất kỳ giọng Đài Loan nào. Request gửi `zh-TW-HsiaoChenNeural`
bị từ chối `400 {"error":"Giọng đọc không được phép"}` (đã test).
Không thay thế ngầm voice nào: voice lạ → 400.

## 3. Sinh MP3 — số đo thực tế

Ma trận 5 câu mẫu × 2 voice × 5 tốc độ = **50/50 thành công**:

- Thời gian: min **996 ms** · trung bình **1.884 s** · max **11.583 s** (một lần mạng chậm).
- Kích thước: **12.672 – 27.792 B**.
- MP3 hợp lệ (header `ff f3`), bitrate ước tính 80 kbps. Ví dụ câu 1 / Xiaoxiao:
  - 0.8x: 1.89 s · 0.9x: 1.68 s · 1.0x: 1.51 s · 1.1x: 1.38 s · 1.2x: 1.27 s.
  - Tỷ lệ thời lượng 0.8x/1.2x = **1.49** ≈ 1.5 kỳ vọng → map tốc độ đúng.

Thử thêm qua HTTP:

| Trường hợp | Kết quả |
|---|---|
| Chữ phồn thể (`我想在臺灣找一份合適的工作。`) | 200 · 1,26 s · 22.464 B |
| Câu nặng thanh điệu (`妈妈骑马，马慢，妈妈骂马。`) | 200 · 1,58 s · 21.600 B |
| Câu khó (`四是四，十是十…`) | 200 · 1,41 s · 34.704 B |
| **500 ký tự** | 200 · lần đầu **19,49 s** / 712.944 B · lần sau 4,71 s |

> Vì 500 ký tự đo được 19,49 s, timeout đã được nâng từ **20 s → 45 s** sau khi đo.
> Đây là giới hạn quan trọng: giữ 20 s sẽ khiến văn bản dài bị 504 không ổn định.

## 4. Kiểm thử HTTP / bảo mật

| Kiểm tra | Kết quả |
|---|---|
| `GET /tts-lab` | 200, 12.078 B HTML |
| `GET /tts-lab/health` | `{"ok":true,"voices":[2 voice],"maxChars":500}` |
| POST hợp lệ | 200 `audio/mpeg` |
| Voice Đài Loan | 400 |
| Tốc độ `2.0` | 400 |
| 501 ký tự | 400 (`tối đa 500 ký tự`) |
| Văn bản trống/toàn khoảng trắng | 400 |
| Gửi 11 request/phút | request 11 → **429** |
| Body > 16 KB | 400 trước khi parse |
| Log server | không in URL/body/text người dùng (`log_message` bị vô hiệu) |
| Timeout dịch vụ | nhánh 504 có trong code; **chưa ép được lỗi thật** |
| Lỗi kết nối dịch vụ | nhánh 502 có trong code; **chưa ép được lỗi thật** |

Một lần **504 thật** xảy ra ở request đầu tiên (20,06 s, kết nối đầu chậm); gửi lại ngay sau đó
thành công 1,32 s. Không tái diễn trong 50 lần của ma trận.

## 5. Chất lượng âm thanh

**Chưa đánh giá được bằng tai.** Môi trường này không có loa/tai nghe và tôi không nghe được file.
Vì vậy **không cho điểm /10** và không khẳng định độ chính xác phát âm, thanh điệu hay độ tự nhiên.
Những gì đã xác nhận chỉ là: file MP3 hợp lệ, thời lượng thay đổi hợp lý theo tốc độ, hai voice khác nhau
cho kích thước khác nhau, tiếng Trung giản thể/phồn thể đều tạo được audio.

Việc nghe thử trên điện thoại Android và desktop **chưa thực hiện**.

## 6. Khả thi trên Vercel

**Chưa triển khai, chưa kiểm chứng.** Đọc cấu hình hiện tại:

- `vercel.json` chỉ khai báo function Node `api/index.js` (`maxDuration: 300`); không có Python runtime.
- Rewrite `/api/(.*)` → `/api/index` khiến `/api/tts` rơi vào Express app, không tới server Python.

Kết luận: không thể đưa `tts-lab/server.py` lên Vercel **mà không đổi kiến trúc** (thêm runtime Python,
function riêng, rewrite riêng). Theo yêu cầu, tôi **không** thay đổi kiến trúc và **không** chuyển sang
dịch vụ TTS trả phí. Khuyến nghị: chạy cục bộ như hiện tại; nếu cần online thì dựng một service Python
riêng (không đụng repo này).

## 7. Lỗi / giới hạn đã gặp

1. **500 ký tự rất sát timeout 20 s** → đã nâng lên 45 s.
2. Request đầu tiên có thể chậm >20 s (đã gặp 1 lần 504); các request sau nhanh.
3. Rate limit lưu trong RAM, reset khi restart server; đủ cho thử nghiệm cục bộ.
4. Chưa có HTTPS/auth — server mặc định chỉ bind `127.0.0.1`.
5. Edge-TTS là dịch vụ không chính thức của Microsoft, có thể đổi/không ổn định; không có SLA.
6. 500 ký tự tạo file ~700 KB và ~70 s audio — nên giới hạn thực tế khi dùng.
7. Không kiểm chứng được pause/resume/stop trên thiết bị thật; code dùng HTMLAudioElement chuẩn.

## 8. Đề xuất tích hợp

**Chưa nên tích hợp vào app học.** Lý do: chưa nghe đánh giá chất lượng, chưa thử trên Android/desktop,
Vercel không chạy được Python, và Edge-TTS không có SLA. Nếu sau này muốn dùng, nên:
đo chất lượng bằng tai trên 5 câu mẫu + câu thanh điệu; dựng service Python riêng có HTTPS;
cache MP3 theo hash câu để tránh gọi lặp; giữ Web Speech làm đường lui.

## 9. Phân loại bằng chứng

**Đã thực sự chạy/đo:**
- Cài đặt `edge-tts 7.3.1`, 2 voice tồn tại trong danh sách.
- 50/50 tổ hợp voice × tốc độ × câu tạo MP3; thời gian/kích thước như trên.
- Sinh MP3 cho phồn thể, câu thanh điệu, câu khó, 500 ký tự.
- Server: page, health, 200/400/429, whitelist voice, giới hạn 500, rate limit.
- 7/7 unit test.
- Cú pháp JS trong `index.html` qua `node --check`.
- Đọc `vercel.json` xác nhận không có Python runtime.

**Chưa kiểm thử:**
- Nghe và chấm chất lượng phát âm.
- Phát trên Android/desktop; pause/resume/stop; chuyển voice khi đang phát.
- Mạng chậm/yếu thật, dịch vụ không phản hồi (nhánh 504/502 chưa ép được).
- Deploy Vercel.
- Giọng không khả dụng (không chủ động gỡ voice).

**Suy ra từ tài liệu/cấu hình (không phải đo):**
- Vercel cần thêm Python runtime + rewrite riêng mới chạy được lab.
- Edge-TTS là dịch vụ không chính thức, không có cam kết ổn định.