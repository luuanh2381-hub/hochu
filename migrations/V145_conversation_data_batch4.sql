-- V145: Dữ liệu mẫu cho 25 hội thoại HSK 3 cuối cùng
-- Tạo dữ liệu mẫu cho đợt 4/8 (HSK 3 - 25 hội thoại)

-- Đảm bảo bảng đã tồn tại
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    RAISE EXCEPTION 'Bảng conversations chưa được tạo. Chạy migration V145_conversation_library.sql trước.';
  END IF;
END $$;

-- Chèn 25 hội thoại HSK 3 cuối cùng
INSERT INTO conversations (dialogue_id, title_zh, title_vi, hsk_level, topic, situation, characters, total_turns) VALUES
('hsk3-076', '供应商审核', 'Kiểm toán nhà cung cấp', 'HSK 3', 'Giao tiếp với quản lý và đồng nghiệp', 'Thực hiện kiểm toán định kỳ nhà cung cấp', ARRAY['A', 'B'], 38),
('hsk3-077', '供应商绩效', 'Hiệu suất nhà cung cấp', 'HSK 3', 'Giao tiếp với quản lý và đồng nghiệp', 'Đánh giá và theo dõi hiệu suất nhà cung cấp', ARRAY['A', 'B'], 36),
('hsk3-078', '供应商改进', 'Cải tiến nhà cung cấp', 'HSK 3', 'Giao tiếp với quản lý và đồng nghiệp', 'Hỗ trợ nhà cung cấp cải tiến chất lượng và hiệu suất', ARRAY['A', 'B'], 37),
('hsk3-079', '采购谈判', 'Đàm phán mua hàng', 'HSK 3', 'Thương lượng và giải quyết mâu thuẫn', 'Đàm phán giá cả, điều khoản và điều kiện với nhà cung cấp', ARRAY['A', 'B'], 42),
('hsk3-080', '合同谈判', 'Đàm phán hợp đồng', 'HSK 3', 'Thương lượng và giải quyết mâu thuẫn', 'Đàm phán các điều khoản kỹ thuật và pháp lý trong hợp đồng', ARRAY['A', 'B'], 40),
('hsk3-081', '价格谈判', 'Đàm phán giá', 'HSK 3', 'Thương lượng và giải quyết mâu thuẫn', 'Đàm phán giá cả và chiết khấu với đối tác kinh doanh', ARRAY['A', 'B'], 39),
('hsk3-082', '付款条件', 'Điều kiện thanh toán', 'HSK 3', 'Thương lượng và giải quyết mâu thuẫn', 'Thảo luận và thống nhất điều kiện thanh toán với nhà cung cấp', ARRAY['A', 'B'], 37),
('hsk3-083', '交货期', 'Thời hạn giao hàng', 'HSK 3', 'Thương lượng và giải quyết mâu thuẫn', 'Đàm phán và xác nhận thời hạn giao hàng phù hợp', ARRAY['A', 'B'], 38),
('hsk3-084', '质量争议', 'Tranh chấp chất lượng', 'HSK 3', 'Thương lượng và giải quyết mâu thuẫn', 'Giải quyết tranh chấp về chất lượng sản phẩm với khách hàng', ARRAY['A', 'B'], 41),
('hsk3-085', '技术争议', 'Tranh chấp kỹ thuật', 'HSK 3', 'Thương lượng và giải quyết mâu thuẫn', 'Giải quyết tranh chấp về thông số kỹ thuật và yêu cầu', ARRAY['A', 'B'], 40),
('hsk3-086', '违约责任', 'Trách nhiệm vi phạm hợp đồng', 'HSK 3', 'Thương lượng và giải quyết mâu thuẫn', 'Thảo luận trách nhiệm khi vi phạm các điều khoản hợp đồng', ARRAY['A', 'B'], 39),
('hsk3-087', '索赔处理', 'Xử lý bồi thường', 'HSK 3', 'Thương lượng và giải quyết mâu thuẫn', 'Quy trình xử lý yêu cầu bồi thường từ khách hàng', ARRAY['A', 'B'], 42),
('hsk3-088', '客户满意度', 'Mức độ hài lòng của khách hàng', 'HSK 3', 'Đưa ra ý kiến và đề xuất', 'Đo lường và phân tích mức độ hài lòng của khách hàng', ARRAY['A', 'B'], 37),
('hsk3-089', '市场调研', 'Nghiên cứu thị trường', 'HSK 3', 'Đưa ra ý kiến và đề xuất', 'Thực hiện nghiên cứu thị trường để phát triển sản phẩm', ARRAY['A', 'B'], 38),
('hsk3-090', '竞争分析', 'Phân tích cạnh tranh', 'HSK 3', 'Đưa ra ý kiến và đề xuất', 'Phân tích đối thủ cạnh tranh và chiến lược thị trường', ARRAY['A', 'B'], 36),
('hsk3-091', '产品改进建议', 'Đề xuất cải tiến sản phẩm', 'HSK 3', 'Đưa ra ý kiến và đề xuất', 'Đề xuất cải tiến sản phẩm dựa trên phản hồi khách hàng', ARRAY['A', 'B'], 39),
('hsk3-092', '流程优化建议', 'Đề xuất tối ưu quy trình', 'HSK 3', 'Đưa ra ý kiến và đề xuất', 'Đề xuất cải tiến quy trình sản xuất và quản lý', ARRAY['A', 'B'], 37),
('hsk3-093', '成本降低建议', 'Đề xuất giảm chi phí', 'HSK 3', 'Đưa ra ý kiến và đề xuất', 'Đề xuất phương án giảm chi phí sản xuất và vận hành', ARRAY['A', 'B'], 38),
('hsk3-094', '质量提升建议', 'Đề xuất nâng cao chất lượng', 'HSK 3', 'Đưa ra ý kiến và đề xuất', 'Đề xuất biện pháp nâng cao chất lượng sản phẩm', ARRAY['A', 'B'], 36),
('hsk3-095', '员工建议', 'Đề xuất của nhân viên', 'HSK 3', 'Đưa ra ý kiến và đề xuất', 'Thu thập và xử lý đề xuất cải tiến từ nhân viên', ARRAY['A', 'B'], 37),
('hsk3-096', '招聘面试', 'Phỏng vấn tuyển dụng', 'HSK 3', 'Phỏng vấn và tuyển dụng', 'Quy trình phỏng vấn ứng tuyển vị trí kỹ thuật và sản xuất', ARRAY['A', 'B'], 39),
('hsk3-097', '职位描述', 'Mô tả công việc', 'HSK 3', 'Phỏng vấn và tuyển dụng', 'Xây dựng mô tả công việc cho vị trí sản xuất và QA/QC', ARRAY['A', 'B'], 38),
('hsk3-098', '技能要求', 'Yêu cầu kỹ năng', 'HSK 3', 'Phỏng vấn và tuyển dụng', 'Xác định yêu cầu kỹ năng chuyên môn cho vị trí tuyển dụng', ARRAY['A', 'B'], 37),
('hsk3-099', '薪资谈判', 'Đàm phán lương', 'HSK 3', 'Phỏng vấn và tuyển dụng', 'Đàm phán mức lương và phúc lợi với ứng viên', ARRAY['A', 'B'], 40),
('hsk3-100', '入职培训', 'Đào tạo nhập chức', 'HSK 3', 'Phỏng vấn và tuyển dụng', 'Chương trình đào tạo cho nhân viên mới vào làm', ARRAY['A', 'B'], 38)
ON CONFLICT (dialogue_id) DO NOTHING;

-- Cập nhật version trong bảng settings nếu tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings') THEN
    INSERT INTO settings (key, value, updated_at) VALUES ('last_migration_data', 'V145_conversation_data_batch4', NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  END IF;
END $$;