# V115 — Cải tiến để ghi nhớ hiệu quả hơn

Bản này thực hiện 7 hướng cải tiến rút ra từ đánh giá "Hôm nay học" và "Phân tích năng lực" ở V114.
Không đổi thuật toán FSRS, không đổi lịch ôn, không đổi công thức điểm theo từ, không xoá route API nào.

## Thành thật trước: đã kiểm chứng gì, chưa kiểm chứng gì

| | Trạng thái |
|---|---|
| Logic thuần (`memory-forecast`, `skill-pooled`, dạng câu thanh điệu) | Chạy thật trong Node, có test |
| Giao diện (`review.js`, `lesson.js`, `skills-*.js`) | Chạy NGUYÊN file thật trong `vm` với DOM/mạng giả, có test |
| Test cũ | Kết quả y hệt bản V114 (so sánh trực tiếp); `skills` 50/50 khi có bản gốc làm tham chiếu route |
| **SQL mới** `getLearnedFsrsCards` | **Chưa chạy trên PostgreSQL** (chỉ kiểm cấu trúc: chỉ đọc, có LIMIT) |
| **`getMemoryForecast` gọi ts-fsrs thật** | **Chưa chạy** (môi trường build không có `ts-fsrs`); chỉ kiểm cách nối dây |
| **Xem nét viết (HanziWriter)** | **Chưa chạy** (cần mạng + trình duyệt); chỉ phần tách chữ được test |
| Trên điện thoại/trình duyệt thật | **Chưa thử** (bàn phím, cảm giác thao tác, bố cục màn nhỏ) |

Việc cần làm trước khi dùng thật: chạy trên staging/Neon, mở "Hôm nay học" xem ô 🧠, thử 1 phiên có trả lời sai, thử "Xem nét viết".

## Thay đổi hành vi mặc định (cần biết)

1. **Trả lời sai không còn tự chuyển câu.** Trước: ~2 giây rồi tự đi. Nay: dừng ở màn đáp án đến khi bấm "Tiếp tục". Trả lời đúng vẫn tự chuyển như cũ.
2. **Mỗi thẻ không còn hiện 4 nút Again/Hard/Good/Easy.** Mặc định hệ thống tự chấm, chỉ hiện "Hệ thống chấm: Good · [Đổi đánh giá] [Tiếp tục]". Muốn như cũ: Hôm nay học → Cài đặt → bỏ tích "Hệ thống tự chấm đánh giá". Phím 1–4 vẫn hoạt động.
3. **Bố cục "Hôm nay học":** nút Bắt đầu + 3 số (Cần ôn / Từ mới / Dự kiến nhớ) lên đầu; 9 ô số cũ và đoạn giải thích gập vào "📊 Chi tiết số liệu". Không bỏ số liệu nào.
4. Độ dài phiên mặc định **không giới hạn** (giữ như cũ); chọn 10/20/30 thẻ là tuỳ chọn.

## Từng hạng mục

**1. Vòng sửa lỗi ngay** (`review.js`). Thẻ chính thức sai: (a) dừng chờ đọc đáp án; (b) hiện nhắc "sẽ hỏi lại sau 2 câu"; (c) chèn 1 câu *luyện bổ sung* (`redo`) sau 2 thẻ, hỏi bằng **dạng khác** lần sai. Thẻ chính thức vẫn quay lại sau `REPEAT_GAP` như cũ để đo trí nhớ thật. Câu `redo` là lượt "vừa xem đáp án" → server không cộng điểm kỹ năng, không đổi FSRS. Hàng đợi sắp hết thì không chèn (thẻ chính thức quay lại ngay).
Chưa làm: bắt gõ lại đáp án ngay trên màn đáp án (cần bộ gõ tiếng Trung, dễ gây khó chịu trên điện thoại).

**2. Từ cứng đầu.** Định nghĩa: quên ≥ 4 lần **và** hiện chưa vững (stability < 21 ngày). Điều kiện thứ hai là cần thiết vì `lapses` không bao giờ giảm; thiếu nó thì từ đã học vững vẫn bị gắn cờ mãi (lỗi mình phát hiện và sửa trong lúc làm). Trên màn đáp án của câu sai: khối 🧲 gợi ý đổi cách học (Hán Việt, mẹo tự viết, xem nét viết). Nút "Học riêng N từ cứng đầu" ở Hôm nay học.
Lưu ý: ngưỡng 4 và 21 là lựa chọn của mình, chưa hiệu chỉnh bằng dữ liệu của bạn.

**3. Dự kiến còn nhớ.** Trung bình xác suất nhớ lại FSRS tính cho từng thẻ đã học (dùng đúng retention và weights cá nhân), cộng dự báo thẻ đến hạn 7 ngày (theo giờ Việt Nam) và danh sách từ sắp quên (<80%). Ghi rõ trên giao diện: *ước lượng của mô hình, không phải điểm kiểm tra*. Dưới 5 thẻ thì hiện "—". Lỗi phần này chỉ làm mất ô 🧠, không ảnh hưởng dashboard.

**4. Gọn "Hôm nay học" + phiên ngắn có điểm dừng.** Xem mục thay đổi mặc định. Phiên ngắn chỉ cắt phần cuối danh sách FSRS; phần còn lại vẫn nằm trên server, "Học tiếp" lấy tiếp.

**5. Phân tích kỹ năng gộp.** Khối "🧭 Mức từng kỹ năng của bạn" (gộp mọi từ, 90 ngày): tỉ lệ **đã trừ xác suất đoán mò** (trắc nghiệm 4 đáp án −25%, tự gõ không trừ), khoảng tin cậy Wilson 95%, số lượt; dưới 20 lượt thì không nêu tỉ lệ. Thêm 1 khuyến nghị "nhận ra tốt nhưng tự nhớ kém" khi cả hai ≥ 30 lượt và chênh ≥ 25 điểm. **Không sửa điểm theo từ** vì công thức đó còn lặp trong 4 câu SQL ở `skill-store.js`; sửa một phía sẽ làm lệch phía kia.

**6. Tự chấm rating.** Xem mục thay đổi mặc định.

**7. Đa dạng cách ghi nhớ.**
- 🎵 *Luyện thanh điệu* (nghe → chọn cách đọc): chỉ luyện bổ sung. Đáp án nhiễu là cùng chữ nhưng **đổi thanh** — không phải từ thật; đây là ngoại lệ có chủ ý với nguyên tắc "chỉ dùng pinyin có thật" của các dạng khác. Bỏ qua từ nhiều cách đọc, số thanh, âm nhẹ hoàn toàn.
- ✏️ *Xem nét viết / tập viết* (HanziWriter, nạp muộn từ jsDelivr, thử lần lượt 3.5.0 rồi 3.7.0): chưa chạy thật. Hai số phiên bản này mình lấy theo trí nhớ, **chưa kiểm tra có tồn tại**; nếu cả hai sai, nút chỉ báo "không tải được" và việc học không bị ảnh hưởng — khi đó sửa `STROKE_LIB_URLS` ở đầu `js/stroke.js`.
- **Không làm:** pinyin cho câu ví dụ. Không có nguồn pinyin cấp câu trong dữ liệu, tự ghép từ pinyin từng từ sẽ sai ở từ nhiều âm; thêm thư viện ngoài mà không kiểm thử được thì mình không muốn đưa vào.

## File thay đổi

Mới: `lib/memory-forecast.js`, `lib/skill-pooled.js`, `js/stroke.js`, `test/v115-features.test.js`.
Sửa: `api/index.js`, `index.html`, `package.json`, `js/{review,lesson,question-engine,question-selector,skills-ui,skills-analysis,word-notes}.js`, `lib/{db,skills,skill-recommend}.js`, `lib/fsrs/reviewService.js`, `test/adaptive-session.test.js`.

Sửa test cũ (có lý do): `adaptive-session.test.js` — (1) thêm `RV_CORRECTION_GAP` vào danh sách hằng số harness (hàm `rvAdvanceQueue` giờ dùng nó); (2) test "thẻ sai quay lại sau REPEAT_GAP" đếm vị trí trong danh sách *chính thức* vì giờ có thêm 1 câu `redo` xen giữa, và bổ sung assert cho câu redo. Không nới lỏng assert nào khác.

Thay đổi API (chỉ thêm trường, không bỏ): `/api/study/today` thêm `memory`; `/api/skills/retention` thêm `pooled`; `/api/skills/recommendations` nhận thêm dữ liệu gộp; bảng bài tập thêm `practice-listening-tone`.

## Chạy test

```
node test/v115-features.test.js    # 55 test mới
npm run test:v110                  # đã nối v115 vào
```
Các test cần `ts-fsrs` (`fsrs`, `fsrs-optimizer*`) vẫn không chạy được trong môi trường không có `npm install`; kết quả giống hệt V114.

## Hạn chế còn lại

- Chưa có bằng chứng các thay đổi này làm bạn nhớ tốt hơn — đó là câu hỏi thực nghiệm. Gợi ý theo dõi: tỉ lệ đúng ở thẻ ở trạng thái Review (đã có ở Thống kê) sau 3–4 tuần, và số từ cứng đầu theo thời gian.
- Khối "Mức từng kỹ năng" dùng cửa sổ 90 ngày; người mới học sẽ thấy "chưa đủ dữ liệu" vài buổi đầu — đúng với thiết kế, không phải lỗi.
- Độ tin cậy của "Dự kiến nhớ" phụ thuộc số lượt ôn: thẻ mới học có ít thông tin nên ước lượng thô hơn.
