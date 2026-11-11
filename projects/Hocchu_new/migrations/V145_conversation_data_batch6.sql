-- V145: Dữ liệu mẫu cho 25 hội thoại HSK 4 tiếp theo
-- Tạo dữ liệu mẫu cho đợt 6/8 (HSK 4 - 25 hội thoại)

-- Đảm bảo bảng đã tồn tại
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    RAISE EXCEPTION 'Bảng conversations chưa được tạo. Chạy migration V145_conversation_library.sql trước.';
  END IF;
END $$;

-- Chèn 25 hội thoại HSK 4 tiếp theo
INSERT INTO conversations (dialogue_id, title_zh, title_vi, hsk_level, topic, situation, characters, total_turns) VALUES
('hsk4-026', '人工智能应用', 'Ứng dụng trí tuệ nhân tạo', 'HSK 4', 'Công việc và văn phòng', 'Áp dụng AI trong quản lý sản xuất và kiểm soát chất lượng', ARRAY['A', 'B'], 47),
('hsk4-027', '机器学习', 'Học máy', 'HSK 4', 'Công việc và văn phòng', 'Sử dụng học máy để dự báo sự cố thiết bị và chất lượng sản phẩm', ARRAY['A', 'B'], 45),
('hsk4-028', '大数据分析', 'Phân tích dữ liệu lớn', 'HSK 4', 'Công việc và văn phòng', 'Phân tích dữ liệu sản xuất quy mô lớn để tối ưu hóa quy trình', ARRAY['A', 'B'], 48),
('hsk4-029', '物联网', 'Internet vạn vật', 'HSK 4', 'Công việc và văn phòng', 'Triển khai IoT trong giám sát và điều khiển dây chuyền sản xuất', ARRAY['A', 'B'], 46),
('hsk4-030', '数字孪生', 'Song sinh số', 'HSK 4', 'Công việc và văn phòng', 'Xây dựng và vận hành mô hình song sinh số cho nhà máy', ARRAY['A', 'B'], 47),
('hsk4-031', '预测性维护', 'Bảo trì dự đoán', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Triển khai bảo trì dự đoán dựa trên phân tích dữ liệu cảm biến', ARRAY['A', 'B'], 49),
('hsk4-032', '智能质检', 'Kiểm tra chất lượng thông minh', 'HSK 4', 'QA/QC', 'Áp dụng thị giác máy tính và AI trong kiểm tra chất lượng', ARRAY['A', 'B'], 48),
('hsk4-033', '自动化测试', 'Kiểm thử tự động', 'HSK 4', 'QA/QC', 'Thiết kế và triển khai hệ thống kiểm thử tự động', ARRAY['A', 'B'], 46),
('hsk4-034', '缺陷识别', 'Nhận diện khiếm khuyết', 'HSK 4', 'QA/QC', 'Phát triển thuật toán nhận diện khiếm khuyết sản phẩm', ARRAY['A', 'B'], 47),
('hsk4-035', '质量预测', 'Dự báo chất lượng', 'HSK 4', 'QA/QC', 'Xây dựng mô hình dự báo chất lượng sản phẩm dựa trên dữ liệu', ARRAY['A', 'B'], 45),
('hsk4-036', '供应商绩效预测', 'Dự báo hiệu suất nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Dự báo hiệu suất nhà cung cấp dựa trên dữ liệu lịch sử', ARRAY['A', 'B'], 48),
('hsk4-037', '供应链风险预测', 'Dự báo rủi ro chuỗi cung ứng', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Dự báo rủi ro chuỗi cung ứng toàn cầu', ARRAY['A', 'B'], 47),
('hsk4-038', '市场趋势预测', 'Dự báo xu hướng thị trường', 'HSK 4', 'Đưa ra ý kiến và đề xuất', 'Phân tích và dự báo xu hướng thị trường công nghệ', ARRAY['A', 'B'], 46),
('hsk4-039', '技术趋势预测', 'Dự báo xu hướng công nghệ', 'HSK 4', 'Đưa ra ý kiến và đề xuất', 'Dự báo xu hướng phát triển công nghệ trong ngành điện tử', ARRAY['A', 'B'], 48),
('hsk4-040', '产品需求预测', 'Dự báo nhu cầu sản phẩm', 'HSK 4', 'Đưa ra ý kiến và đề xuất', 'Xây dựng mô hình dự báo nhu cầu sản phẩm điện tử', ARRAY['A', 'B'], 47),
('hsk4-041', '研发投资决策', 'Quyết định đầu tư R&D', 'HSK 4', 'Đưa ra ý kiến và đề xuất', 'Phân tích ROI và quyết định đầu tư vào các dự án R&D', ARRAY['A', 'B'], 49),
('hsk4-042', '技术路线图规划', 'Lập kế hoạch lộ trình công nghệ', 'HSK 4', 'Đưa ra ý kiến và đề xuất', 'Lập kế hoạch lộ trình công nghệ 5-10 năm cho doanh nghiệp', ARRAY['A', 'B'], 46),
('hsk4-043', '创新生态系统', 'Hệ sinh thái đổi mới', 'HSK 4', 'Đưa ra ý kiến và đề xuất', 'Xây dựng hệ sinh thái đổi mới bao gồm đối tác, startup và viện nghiên cứu', ARRAY['A', 'B'], 47),
('hsk4-044', '开放式创新平台', 'Nền tảng đổi mới mở', 'HSK 4', 'Đưa ra ý kiến và đề xuất', 'Xây dựng nền tảng đổi mới mở để kết nối với cộng đồng toàn cầu', ARRAY['A', 'B'], 45),
('hsk4-045', '技术商业化', 'Thương mại hóa công nghệ', 'HSK 4', 'Đưa ra ý kiến và đề xuất', 'Quy trình thương mại hóa công nghệ từ phòng thí nghiệm đến thị trường', ARRAY['A', 'B'], 48),
('hsk4-046', '知识产权商业化', 'Thương mại hóa sở hữu trí tuệ', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Chiến lược thương mại hóa bằng sáng chế và công nghệ', ARRAY['A', 'B'], 46),
('hsk4-047', '技术许可谈判', 'Đàm phán cấp phép công nghệ', 'HSK 4', 'Thương lượng và giải quyết mâu thuẫn', 'Đàm phán các điều khoản kỹ thuật và tài chính trong hợp đồng cấp phép', ARRAY['A', 'B'], 49),
('hsk4-048', '专利池管理', 'Quản lý nhóm bằng sáng chế', 'HSK 4', 'Thương lượng và giải quyết mâu thuẫn', 'Quản lý và vận hành nhóm bằng sáng chế chung', ARRAY['A', 'B'], 47),
('hsk4-049', '标准必要专利', 'Bằng sáng chế thiết yếu cho tiêu chuẩn', 'HSK 4', 'Thương lượng và giải quyết mâu thuẫn', 'Quản lý và đàm phán về bằng sáng chế thiết yếu cho tiêu chuẩn', ARRAY['A', 'B'], 48),
('hsk4-050', 'FRAND原则', 'Nguyên tắc FRAND', 'HSK 4', 'Thương lượng và giải quyết mâu thuẫn', 'Áp dụng nguyên tắc công bằng, hợp lý và không phân biệt đối xử', ARRAY['A', 'B'], 46)
ON CONFLICT (dialogue_id) DO NOTHING;

-- Cập nhật version trong bảng settings nếu tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings') THEN
    INSERT INTO settings (key, value, updated_at) VALUES ('last_migration_data', 'V145_conversation_data_batch6', NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  END IF;
END $$;