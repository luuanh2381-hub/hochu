-- V145: Dữ liệu mẫu cho 25 hội thoại HSK 3 tiếp theo
-- Tạo dữ liệu mẫu cho đợt 2/8 (HSK 3 - 25 hội thoại)

-- Đảm bảo bảng đã tồn tại
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    RAISE EXCEPTION 'Bảng conversations chưa được tạo. Chạy migration V145_conversation_library.sql trước.';
  END IF;
END $$;

-- Chèn 25 hội thoại HSK 3 tiếp theo
INSERT INTO conversations (dialogue_id, title_zh, title_vi, hsk_level, topic, situation, characters, total_turns) VALUES
('hsk3-026', '产品测试', 'Kiểm tra sản phẩm', 'HSK 3', 'QA/QC', 'Quy trình kiểm tra sản phẩm cuối cùng trước khi xuất xưởng', ARRAY['A', 'B'], 36),
('hsk3-027', '包装材料', 'Vật liệu đóng gói', 'HSK 3', 'Sản xuất', 'Đánh giá và lựa chọn vật liệu đóng gói phù hợp', ARRAY['A', 'B'], 34),
('hsk3-028', '设备校准', 'Hiệu chuẩn thiết bị', 'HSK 3', 'Sản xuất', 'Hiệu chuẩn định kỳ thiết bị đo lường và kiểm tra', ARRAY['A', 'B'], 37),
('hsk3-029', '生产记录', 'Ghi chép sản xuất', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Quy trình ghi chép và lưu trữ hồ sơ sản xuất', ARRAY['A', 'B'], 35),
('hsk3-030', '质量标准', 'Tiêu chuẩn chất lượng', 'HSK 3', 'QA/QC', 'Xây dựng và áp dụng tiêu chuẩn chất lượng sản phẩm', ARRAY['A', 'B'], 38),
('hsk3-031', '供应商评估', 'Đánh giá nhà cung cấp', 'HSK 3', 'Giao tiếp với quản lý và đồng nghiệp', 'Đánh giá hiệu suất và chất lượng của nhà cung cấp', ARRAY['A', 'B'], 39),
('hsk3-032', '员工绩效', 'Đánh giá hiệu suất nhân viên', 'HSK 3', 'Công việc và văn phòng', 'Đánh giá hiệu suất làm việc của nhân viên', ARRAY['A', 'B'], 36),
('hsk3-033', '培训需求', 'Xác định nhu cầu đào tạo', 'HSK 3', 'Công việc và văn phòng', 'Xác định nhu cầu đào tạo kỹ năng mới cho nhân viên', ARRAY['A', 'B'], 37),
('hsk3-034', '采购订单', 'Đơn đặt hàng mua hàng', 'HSK 3', 'Công việc và văn phòng', 'Lập và xử lý đơn đặt hàng nguyên vật liệu', ARRAY['A', 'B'], 35),
('hsk3-035', '库存盘点', 'Kiểm kê kho hàng', 'HSK 3', 'Sản xuất', 'Quy trình kiểm kê định kỳ hàng tồn kho', ARRAY['A', 'B'], 38),
('hsk3-036', '设备故障', 'Sự cố thiết bị', 'HSK 3', 'Xử lý lỗi sản phẩm và sự cố', 'Xử lý sự cố thiết bị sản xuất và khắc phục nhanh chóng', ARRAY['A', 'B'], 40),
('hsk3-037', '客户反馈', 'Phản hồi của khách hàng', 'HSK 3', 'Xử lý lỗi sản phẩm và sự cố', 'Thu thập và phân tích phản hồi từ khách hàng', ARRAY['A', 'B'], 37),
('hsk3-038', '内部审核', 'Kiểm toán nội bộ', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Thực hiện kiểm toán nội bộ hệ thống quản lý chất lượng', ARRAY['A', 'B'], 39),
('hsk3-039', '纠正措施', 'Biện pháp khắc phục', 'HSK 3', 'Xử lý lỗi sản phẩm và sự cố', 'Triển khai biện pháp khắc phục khi phát hiện sai sót', ARRAY['A', 'B'], 41),
('hsk3-040', '预防措施', 'Biện pháp phòng ngừa', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Triển khai biện pháp phòng ngừa để tránh tái diễn vấn đề', ARRAY['A', 'B'], 38),
('hsk3-041', '文件控制', 'Kiểm soát tài liệu', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Quy trình kiểm soát và cập nhật tài liệu quy trình', ARRAY['A', 'B'], 36),
('hsk3-042', '记录保存', 'Lưu trữ hồ sơ', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Quy trình lưu trữ và bảo quản hồ sơ chất lượng', ARRAY['A', 'B'], 35),
('hsk3-043', '客户要求', 'Yêu cầu của khách hàng', 'HSK 3', 'Giao tiếp với quản lý và đồng nghiệp', 'Xác định và đáp ứng các yêu cầu đặc biệt của khách hàng', ARRAY['A', 'B'], 37),
('hsk3-044', '合同评审', 'Đánh giá hợp đồng', 'HSK 3', 'Giao tiếp với quản lý và đồng nghiệp', 'Đánh giá kỹ thuật và khả thi của hợp đồng sản xuất', ARRAY['A', 'B'], 39),
('hsk3-045', '设计开发', 'Thiết kế và phát triển', 'HSK 3', 'Sản xuất', 'Quy trình thiết kế và phát triển sản phẩm mới', ARRAY['A', 'B'], 42),
('hsk3-046', '样品确认', 'Xác nhận mẫu', 'HSK 3', 'Sản xuất', 'Quy trình xác nhận mẫu sản phẩm với khách hàng', ARRAY['A', 'B'], 38),
('hsk3-047', '工艺流程', 'Quy trình công nghệ', 'HSK 3', 'Sản xuất', 'Xây dựng và kiểm soát quy trình công nghệ sản xuất', ARRAY['A', 'B'], 36),
('hsk3-048', '作业指导书', 'Hướng dẫn thao tác', 'HSK 3', 'Sản xuất', 'Soạn thảo và cập nhật hướng dẫn thao tác cho nhân viên', ARRAY['A', 'B'], 37),
('hsk3-049', '测量系统', 'Hệ thống đo lường', 'HSK 3', 'QA/QC', 'Đánh giá và kiểm soát hệ thống đo lường chất lượng', ARRAY['A', 'B'], 35),
('hsk3-050', '实验室管理', 'Quản lý phòng thí nghiệm', 'HSK 3', 'QA/QC', 'Quy trình quản lý và vận hành phòng thí nghiệm kiểm tra', ARRAY['A', 'B'], 38)
ON CONFLICT (dialogue_id) DO NOTHING;

-- Cập nhật version trong bảng settings nếu tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings') THEN
    INSERT INTO settings (key, value, updated_at) VALUES ('last_migration_data', 'V145_conversation_data_batch2', NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  END IF;
END $$;