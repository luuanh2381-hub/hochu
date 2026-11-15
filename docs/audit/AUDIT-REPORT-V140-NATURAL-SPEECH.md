# AUDIT REPORT V140 — Natural Chinese Speech (Edge-TTS)

Ngày: 2026-11-09 · Nền: V139 (Edge-TTS hoạt động, `/api/tts` → `api/edge-tts.py`)

## 1. Hiện trạng V139 (đo trước khi sửa)

| Thành phần | Hành vi |
|---|---|
| `js/audio.js` `speak()` | 1 request Edge-TTS cho cả câu; >500 ký tự → Web Speech |
| Cache | IndexedDB `hsk-edge-tts-cache-v1`, khoá SHA-256(`voice|rate|text`), tối đa 300 bản / 40 MB |
| Phát | 1 `<audio>`; `pauseSpeaking/resumeSpeaking/stopSpeaking` chỉ tác động audio hiện tại |
| Hội thoại | **Không có** |
| Luyện nghe ẩn chữ | **Không có** (tab `listen` là trắc nghiệm chọn chữ Hán) |
| Chẩn đoán | 4 tag V139: `EDGE_TTS_SUCCESS`, `EDGE_TTS_API_ERROR`, `EDGE_TTS_PLAY_ERROR`, `WEB_SPEECH_FALLBACK` |

Hạn chế thực tế: câu/đoạn > 500 ký tự rơi thẳng về Web Speech (giọng Android), không có hàng đợi
nhiều đoạn, không có chế độ nhiều nhân vật, không có luyện nghe ẩn nội dung.

## 2. Thay đổi V140

### 2.1 `js/tts-text.js` (mới, THUẦN — không DOM/mạng)

- `splitSpeech(text, maxLen=480)`: cắt **chỉ tại dấu câu**; dấu câu dính vào đoạn trước. Mệnh đề dài
  hơn giới hạn mới cắt tiếp tại **ranh giới từ** (`Intl.Segmenter`, lùi về từng ký tự nếu thiếu).
  Bất biến: `chunks.join('') === text` — không thêm/bớt chữ, dấu hay khoảng trắng.
- `pauseAfter(chunk)`: khoảng lặng nối giữa hai request theo dấu cuối (。！？ = 450 ms, ，、；： = 220 ms,
  khác = 300 ms). **Không** chèn khoảng trắng để ép ngắt nghỉ.
- `cacheKeyText(voice, rate, text)`: khoá cache thô, phân biệt nội dung + giọng + tốc độ.
- `defaultVoiceFor(who)` / `conversationSegments(turns, voices, gapMs)`: 甲 → Xiaoxiao, 乙 → Yunxi;
  giọng từng lượt ghi đè được; khoảng nghỉ mặc định 600 ms giữa lượt.

### 2.2 `js/audio.js`

- `ttsSpeakSegments(segments, hooks)`: hàng đợi phát **tuần tự**, mỗi đoạn 1 giọng/tốc độ, chờ
  `ended` rồi mới sang đoạn kế (không chồng lấn), chèn `gapAfter` giữa đoạn.
- `speak()` giờ chia câu bằng `TT.splitSpeech` rồi đưa vào hàng đợi → câu/đoạn dài không còn rơi
  về Web Speech chỉ vì >500 ký tự.
- `speakSlow()`: tốc độ 0.8 cho riêng lần phát, không đổi cài đặt chung.
- Dừng/tiếp tục: `ttsToken` tăng mỗi lần phát/dừng; vòng lặp cũ tự thoát. `pauseSpeaking` đặt cờ
  `paused` + `audio.pause()`; `resumeSpeaking` bỏ cờ + `audio.play()`; `ttsWait`/`ttsAwaitResume`
  tôn trọng trạng thái tạm dừng kể cả trong khoảng lặng giữa đoạn.
- Cache lỗi: nếu giải mã MP3 lỗi (`NotSupportedError`/`EncodingError`) → `edgeTtsCacheDelete` bản
  hỏng rồi tải lại **đúng 1 lần**.
- Chẩn đoán giữ nguyên 4 tag; lỗi API và lỗi phát được phân biệt bằng `err.ttsKind` (không đoán theo
  chuỗi thông báo). Fallback Web Speech đọc phần còn lại và luôn ghi `WEB_SPEECH_FALLBACK`.

### 2.3 `js/dialogues-data.js` + `js/conversation.js` (mới)

- 3 hội thoại tĩnh (chào hỏi, mua hoa quả, học tiếng Trung), mỗi lượt `{ who, hz, vi }`.
- Tab **🗣️ Hội thoại**: chọn hội thoại; mỗi lượt có nút 🔊 (phát lại riêng) và ô chọn giọng
  (Nữ Xiaoxiao / Nam Yunxi). Nút **▶ Phát tất cả** phát liên tục, tự chuyển giọng theo nhân vật,
  nghỉ 600 ms giữa lượt; có ⏸/▶/⏹ dùng chung hàng đợi audio.

### 2.4 `js/listening.js` (mới)

- Tab **🎧 Luyện nghe**: lấy câu từ `SENTENCES` theo bộ lọc bài đang chọn, xáo trộn 10 câu.
- Ẩn chữ Hán (`🀄 •••`) tới khi bấm **👁 Hiện nội dung**; **không hiện pinyin** trong chế độ này.
- Nghe 1 lần khi mở câu, **🔁 Nghe lại**, **🐢 Nghe chậm** (0.8), **➡ Câu tiếp**.

### 2.5 Điều hướng

- `index.html`: thêm 2 nút trong bảng "Thêm" + nạp `tts-text.js` trước `audio.js`, và
  `dialogues-data.js` / `conversation.js` / `listening.js` sau `audio.js`.
- `js/nav.js`: `convo`, `listening` thuộc nhóm `more` (giữ nguyên 5 chip nhóm Học của V116).
- `js/navigation.js`: dispatch `renderConvo/bindConvo`, `renderListening/bindListening`.
- `js/auth.js`: thêm 2 tab vào `validTabs` để khôi phục đúng tab sau khi tải lại.

## 3. Bảo toàn hệ thống

Không sửa: `lib/fsrs/**`, `api/index.js`, `lib/db.js`, `migrations/**`, `js/question-engine.js`,
`js/question-selector.js`, dữ liệu từ vựng, đăng nhập/đồng bộ. `api/edge-tts.py` giữ nguyên (V139).
Không đổi schema DB, không xoá/di chuyển dữ liệu học.

## 4. Kiểm thử

`test/v140-tts-natural.test.js` — 18 test, không cần mạng/DB:

| Nhóm | Nội dung |
|---|---|
| Câu ngắn | 1 đoạn, đúng giọng/tốc độ, 1 lần phát |
| Câu dài | nhiều request, ghép đúng nội dung, không chồng lấn |
| Không cắt giữa từ | mọi ranh giới đoạn trùng ranh giới từ `Intl.Segmenter` |
| Dấu câu | 。！？ nghỉ lâu hơn ，、；, nội dung không đổi |
| Hội thoại 2 nhân vật | chuyển giọng 甲/乙 đúng từng lượt |
| Chọn giọng từng lượt | ghi đè mặc định |
| Dừng / tiếp tục | dừng giữa chuỗi không phát thêm; pause/resume gọi đúng |
| Phát liên tục | thứ tự play→end→play |
| Cache | dùng lại, không trùng, phân biệt giọng/tốc độ, cache hỏng tải lại 1 lần |
| Mạng yếu / API lỗi | `EDGE_TTS_API_ERROR` + `WEB_SPEECH_FALLBACK`, vẫn đọc |
| Lỗi phát | `EDGE_TTS_PLAY_ERROR` + fallback |

Kết quả: `npm run verify:ui` 10/10 file (gồm V140), `npm run verify:server` 5/5 file.

## 5. Giới hạn / chưa kiểm chứng

- **Chưa đánh giá nghe thực tế.** Không có bằng chứng giọng "tự nhiên hơn" — cần nghe trên Android
  và desktop với cả Xiaoxiao/Yunxi, câu ngắn và đoạn dài. Báo cáo này chỉ chứng minh cấu trúc phát
  và ngắt nghỉ, không chứng minh chất lượng âm thanh.
- Chưa chạy end-to-end trên trình duyệt thật (autoplay Android, IndexedDB thật, mạng chậm thật).
- `js/study-queue.js:290` (`skillAudioAvailable`) vẫn tham chiếu biến `ttsVoice` không tồn tại —
  lỗi có sẵn từ trước, **không sửa** trong V140 (ngoài phạm vi, có thể đang tắt dạng bài Nghe cũ).
- Hội thoại là dữ liệu tĩnh 3 bài; chưa có nhập hội thoại tùy chỉnh.
- Chưa tô sáng lượt đang phát trong chế độ hội thoại.
