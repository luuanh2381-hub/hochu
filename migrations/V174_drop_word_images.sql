-- V174: TUỲ CHỌN — xoá bảng ảnh gợi nhớ cũ.
-- Tính năng ảnh gợi nhớ đã bị gỡ hoàn toàn (không còn code đọc/ghi bảng này). Bảng chỉ chứa metadata + câu chuyện gợi nhớ;
-- các tệp ảnh nằm trong bucket Cloudflare R2 (thư mục img/v1/) và KHÔNG bị xoá bởi lệnh này — xoá tay trên Cloudflare nếu muốn.
-- Không ảnh hưởng từ vựng / FSRS / lịch sử học. Chạy khi chắc chắn không cần dữ liệu cũ.
DROP TABLE IF EXISTS word_images;
