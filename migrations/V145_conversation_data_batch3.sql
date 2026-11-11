-- V145: Dữ liệu mẫu cho 25 hội thoại HSK 3 tiếp theo
-- Tạo dữ liệu mẫu cho đợt 3/8 (HSK 3 - 25 hội thoại)

-- Đảm bảo bảng đã tồn tại
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    RAISE EXCEPTION 'Bảng conversations chưa được tạo. Chạy migration V145_conversation_library.sql trước.';
  END IF;
END $$;

-- Chèn 25 hội thoại HSK 3 tiếp theo
INSERT INTO conversations (dialogue_id, title_zh, title_vi, hsk_level, topic, situation, characters, total_turns) VALUES
('hsk3-051', '原材料检验', 'Kiểm tra nguyên vật liệu', 'HSK 3', 'QA/QC', 'Quy trình kiểm tra chi tiết nguyên vật liệu đầu vào', ARRAY['A', 'B'], 36),
('hsk3-052', '半成品检验', 'Kiểm tra bán thành phẩm', 'HSK 3', 'QA/QC', 'Kiểm tra chất lượng bán thành phẩm trong quy trình sản xuất', ARRAY['A', 'B'], 37),
('hsk3-053', '成品检验', 'Kiểm tra thành phẩm', 'HSK 3', 'QA/QC', 'Kiểm tra cuối cùng thành phẩm trước khi đóng gói', ARRAY['A', 'B'], 38),
('hsk3-054', '抽样检验', 'Kiểm tra mẫu ngẫu nhiên', 'HSK 3', 'QA/QC', 'Áp dụng phương pháp kiểm tra mẫu ngẫu nhiên', ARRAY['A', 'B'], 35),
('hsk3-055', '全检', 'Kiểm tra 100%', 'HSK 3', 'QA/QC', 'Quy trình kiểm tra toàn bộ sản phẩm cho hàng đặc biệt', ARRAY['A', 'B'], 39),
('hsk3-056', '不良品处理', 'Xử lý sản phẩm lỗi', 'HSK 3', 'Xử lý lỗi sản phẩm và sự cố', 'Quy trình xử lý và phân loại sản phẩm lỗi', ARRAY['A', 'B'], 40),
('hsk3-057', '返工流程', 'Quy trình tái chế', 'HSK 3', 'Xử lý lỗi sản phẩm và sự cố', 'Quy trình tái chế sản phẩm lỗi để đạt tiêu chuẩn', ARRAY['A', 'B'], 37),
('hsk3-058', '报废流程', 'Quy trình loại bỏ', 'HSK 3', 'Xử lý lỗi sản phẩm và sự cố', 'Quy trình loại bỏ sản phẩm không thể tái chế', ARRAY['A', 'B'], 36),
('hsk3-059', '客户投诉处理', 'Xử lý khiếu nại khách hàng', 'HSK 3', 'Xử lý lỗi sản phẩm và sự cố', 'Quy trình xử lý khiếu nại và bồi thường', ARRAY['A', 'B'], 41),
('hsk3-060', '供应商质量问题', 'Vấn đề chất lượng nhà cung cấp', 'HSK 3', 'Xử lý lỗi sản phẩm và sự cố', 'Xử lý vấn đề chất lượng từ nhà cung cấp nguyên vật liệu', ARRAY['A', 'B'], 38),
('hsk3-061', '内部质量问题', 'Vấn đề chất lượng nội bộ', 'HSK 3', 'Xử lý lỗi sản phẩm và sự cố', 'Xử lý vấn đề chất lượng phát sinh trong quá trình sản xuất', ARRAY['A', 'B'], 39),
('hsk3-062', '质量改进', 'Cải tiến chất lượng', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Triển khai các dự án cải tiến chất lượng', ARRAY['A', 'B'], 37),
('hsk3-063', '六西格玛', 'Sáu Sigma', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Giới thiệu và áp dụng phương pháp Sáu Sigma', ARRAY['A', 'B'], 35),
('hsk3-064', '精益生产', 'Sản xuất tinh gọn', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Áp dụng nguyên tắc sản xuất tinh gọn để giảm lãng phí', ARRAY['A', 'B'], 38),
('hsk3-065', '5S管理', 'Quản lý 5S', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Thực hiện và duy trì hệ thống quản lý 5S', ARRAY['A', 'B'], 36),
('hsk3-066', '目视化管理', 'Quản lý trực quan', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Áp dụng quản lý trực quan để cải thiện hiệu quả', ARRAY['A', 'B'], 37),
('hsk3-067', '标准化作业', 'Tiêu chuẩn hóa thao tác', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Xây dựng và thực hiện quy trình thao tác tiêu chuẩn', ARRAY['A', 'B'], 35),
('hsk3-068', '防错技术', 'Công nghệ phòng sai', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Áp dụng công nghệ phòng sai trong thiết kế sản xuất', ARRAY['A', 'B'], 39),
('hsk3-069', '质量成本', 'Chi phí chất lượng', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Phân tích và quản lý chi phí liên quan đến chất lượng', ARRAY['A', 'B'], 38),
('hsk3-070', '质量意识', 'Ý thức chất lượng', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Đào tạo và nâng cao ý thức chất lượng cho nhân viên', ARRAY['A', 'B'], 36),
('hsk3-071', '供应商开发', 'Phát triển nhà cung cấp', 'HSK 3', 'Giao tiếp với quản lý và đồng nghiệp', 'Hợp tác phát triển nhà cung cấp để nâng cao chất lượng', ARRAY['A', 'B'], 37),
('hsk3-072', '联合审核', 'Kiểm toán chung', 'HSK 3', 'Giao tiếp với quản lý và đồng nghiệp', 'Thực hiện kiểm toán chung với nhà cung cấp', ARRAY['A', 'B'], 35),
('hsk3-073', '技术协议', 'Thỏa thuận kỹ thuật', 'HSK 3', 'Giao tiếp với quản lý và đồng nghiệp', 'Soạn thảo và ký kết thỏa thuận kỹ thuật với đối tác', ARRAY['A', 'B'], 38),
('hsk3-074', '知识产权', 'Quyền sở hữu trí tuệ', 'HSK 3', 'Giao tiếp với quản lý và đồng nghiệp', 'Bảo vệ và quản lý quyền sở hữu trí tuệ trong hợp tác', ARRAY['A', 'B'], 39),
('hsk3-075', '保密协议', 'Thỏa thuận bảo mật', 'HSK 3', 'Giao tiếp với quản lý và đồng nghiệp', 'Thỏa thuận bảo mật thông tin kỹ thuật và kinh doanh', ARRAY['A', 'B'], 37)
ON CONFLICT (dialogue_id) DO NOTHING;

-- Cập nhật version trong bảng settings nếu tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings') THEN
    INSERT INTO settings (key, value, updated_at) VALUES ('last_migration_data', 'V145_conversation_data_batch3', NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  END IF;
END $$;