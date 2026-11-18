# V175 — "Từ mới trong câu" (màn đáp án Hôm nay học): hiện pinyin, hiện đủ từ, chia 2 cột đều
Sửa: js/review.js (rvExWordsHtml + CSS .rv-words-*), test/v172-sentence-words.test.js, test/v173-answer-dedupe.test.js.
Trước: chỉ hiện pinyin khi dữ liệu có sẵn, ẩn từ đang học, mỗi từ 1 dòng dồn bên trái.
Nay: mỗi từ là 1 ô (chữ Hán + pinyin / nghĩa · ghi chú), hiện TẤT CẢ từ database có cho câu (kèm số lượng), lưới 2 cột đều nhau;
số từ lẻ → ô cuối trải ngang. Thiếu pinyin trong dữ liệu → lấy pinyin của đúng từ đó trong kho từ vựng (WORDS). Tắt "Hiện Pinyin" vẫn ẩn.
