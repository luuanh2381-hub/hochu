-- V148: TUỲ CHỌN — xoá bảng thư viện âm thanh cũ.
-- Âm thanh giờ gọi Edge-TTS trực tiếp từ trình duyệt (cache IndexedDB), không còn đọc/ghi bảng này.
-- Chạy khi đã deploy V148 và chắc chắn không cần dữ liệu cũ (chỉ là metadata của các MP3 từng tạo). Không ảnh hưởng từ vựng / FSRS / ảnh gợi nhớ.
DROP TABLE IF EXISTS audio_library;
