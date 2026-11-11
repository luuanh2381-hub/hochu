-- V145: Dữ liệu mẫu cho 25 hội thoại HSK 4 cuối cùng
-- Tạo dữ liệu mẫu cho đợt 8/8 (HSK 4 - 25 hội thoại)

-- Đảm bảo bảng đã tồn tại
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    RAISE EXCEPTION 'Bảng conversations chưa được tạo. Chạy migration V145_conversation_library.sql trước.';
  END IF;
END $$;

-- Chèn 25 hội thoại HSK 4 cuối cùng
INSERT INTO conversations (dialogue_id, title_zh, title_vi, hsk_level, topic, situation, characters, total_turns) VALUES
('hsk4-076', '高级供应链管理', 'Quản lý chuỗi cung ứng nâng cao', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Áp dụng các phương pháp quản lý chuỗi cung ứng hiện đại', ARRAY['A', 'B'], 49),
('hsk4-077', '供应链协同', 'Hợp tác chuỗi cung ứng', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Xây dựng hệ thống hợp tác chuỗi cung ứng tích hợp', ARRAY['A', 'B'], 47),
('hsk4-078', '供应商整合', 'Tích hợp nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Chiến lược tích hợp nhà cung cấp để tối ưu hóa chuỗi cung ứng', ARRAY['A', 'B'], 48),
('hsk4-079', '采购战略', 'Chiến lược mua hàng', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Xây dựng chiến lược mua hàng toàn cầu và đa nguồn', ARRAY['A', 'B'], 46),
('hsk4-080', '全球采购', 'Mua hàng toàn cầu', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Quản lý mua hàng quốc tế và các rủi ro liên quan', ARRAY['A', 'B'], 49),
('hsk4-081', '供应商关系管理', 'Quản lý quan hệ nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Xây dựng và duy trì quan hệ chiến lược với nhà cung cấp', ARRAY['A', 'B'], 47),
('hsk4-082', '供应商绩效管理', 'Quản lý hiệu suất nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Thiết lập KPI và hệ thống đánh giá hiệu suất nhà cung cấp', ARRAY['A', 'B'], 48),
('hsk4-083', '供应商发展计划', 'Kế hoạch phát triển nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Xây dựng kế hoạch phát triển năng lực nhà cung cấp', ARRAY['A', 'B'], 46),
('hsk4-084', '供应商风险管理', 'Quản lý rủi ro nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Đánh giá và quản lý rủi ro từ nhà cung cấp toàn cầu', ARRAY['A', 'B'], 49),
('hsk4-085', '供应商审计', 'Kiểm toán nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Thực hiện kiểm toán định kỳ nhà cung cấp theo tiêu chuẩn quốc tế', ARRAY['A', 'B'], 47),
('hsk4-086', '供应商认证', 'Chứng nhận nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Quy trình chứng nhận nhà cung cấp theo tiêu chuẩn ISO', ARRAY['A', 'B'], 48),
('hsk4-087', '供应商质量协议', 'Thỏa thuận chất lượng nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Xây dựng và ký kết thỏa thuận chất lượng với nhà cung cấp', ARRAY['A', 'B'], 46),
('hsk4-088', '供应商技术协议', 'Thỏa thuận kỹ thuật nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Soạn thảo thỏa thuận kỹ thuật chi tiết với nhà cung cấp', ARRAY['A', 'B'], 49),
('hsk4-089', '供应商保密协议', 'Thỏa thuận bảo mật nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Thỏa thuận bảo mật thông tin kỹ thuật và kinh doanh với nhà cung cấp', ARRAY['A', 'B'], 47),
('hsk4-090', '供应商知识产权协议', 'Thỏa thuận sở hữu trí tuệ nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Quy định về quyền sở hữu trí tuệ trong hợp tác với nhà cung cấp', ARRAY['A', 'B'], 48),
('hsk4-091', '供应商合规管理', 'Quản lý tuân thủ nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Đảm bảo nhà cung cấp tuân thủ các quy định pháp lý và đạo đức', ARRAY['A', 'B'], 46),
('hsk4-092', '供应商可持续发展', 'Phát triển bền vững nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Đánh giá và thúc đẩy phát triển bền vững của nhà cung cấp', ARRAY['A', 'B'], 49),
('hsk4-093', '供应商环境责任', 'Trách nhiệm môi trường nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Yêu cầu nhà cung cấp thực hiện trách nhiệm môi trường', ARRAY['A', 'B'], 47),
('hsk4-094', '供应商社会责任', 'Trách nhiệm xã hội nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Đánh giá và yêu cầu nhà cung cấp thực hiện trách nhiệm xã hội', ARRAY['A', 'B'], 48),
('hsk4-095', '供应商道德规范', 'Quy tắc đạo đức nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Xây dựng và áp dụng quy tắc đạo đức cho nhà cung cấp', ARRAY['A', 'B'], 46),
('hsk4-096', '供应商行为准则', 'Quy tắc ứng xử nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Xây dựng quy tắc ứng xử cho nhà cung cấp toàn cầu', ARRAY['A', 'B'], 49),
('hsk4-097', '供应商合规审计', 'Kiểm toán tuân thủ nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Thực hiện kiểm toán tuân thủ các quy định pháp lý và đạo đức', ARRAY['A', 'B'], 47),
('hsk4-098', '供应商环境审计', 'Kiểm toán môi trường nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Thực hiện kiểm toán môi trường nhà cung cấp', ARRAY['A', 'B'], 48),
('hsk4-099', '供应商社会责任审计', 'Kiểm toán trách nhiệm xã hội nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Thực hiện kiểm toán trách nhiệm xã hội nhà cung cấp', ARRAY['A', 'B'], 46),
('hsk4-100', '供应商道德审计', 'Kiểm toán đạo đức nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Thực hiện kiểm toán đạo đức nhà cung cấp', ARRAY['A', 'B'], 49)
ON CONFLICT (dialogue_id) DO NOTHING;

-- Cập nhật version trong bảng settings nếu tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings') THEN
    INSERT INTO settings (key, value, updated_at) VALUES ('last_migration_data', 'V145_conversation_data_batch8', NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  END IF;
END $$;