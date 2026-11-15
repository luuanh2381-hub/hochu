-- V145: Dữ liệu mẫu cho 25 hội thoại HSK 3 đầu tiên
-- Tạo dữ liệu mẫu cho đợt 1/8 (HSK 3 - 25 hội thoại)

-- Đảm bảo bảng đã tồn tại
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    RAISE EXCEPTION 'Bảng conversations chưa được tạo. Chạy migration V145_conversation_library.sql trước.';
  END IF;
END $$;

-- Chèn 25 hội thoại HSK 3
INSERT INTO conversations (dialogue_id, title_zh, title_vi, hsk_level, topic, situation, characters, total_turns) VALUES
('hsk3-001', '欢迎来到电子工厂', 'Chào mừng đến nhà máy điện tử', 'HSK 3', 'Nhà máy sản xuất điện tử', 'Giới thiệu về nhà máy điện tử và quy trình sản xuất', ARRAY['A', 'B'], 32),
('hsk3-002', '生产线检查', 'Kiểm tra dây chuyền sản xuất', 'HSK 3', 'QA/QC', 'Kiểm tra chất lượng sản phẩm trên dây chuyền', ARRAY['A', 'B'], 35),
('hsk3-003', '原材料验收', 'Kiểm tra nguyên vật liệu đầu vào', 'HSK 3', 'QA/QC', 'Quy trình kiểm tra nguyên vật liệu trước khi đưa vào sản xuất', ARRAY['A', 'B'], 38),
('hsk3-004', '产品包装', 'Đóng gói sản phẩm', 'HSK 3', 'Sản xuất', 'Quy trình đóng gói sản phẩm thành phẩm', ARRAY['A', 'B'], 34),
('hsk3-005', '设备维护', 'Bảo trì thiết bị', 'HSK 3', 'Sản xuất', 'Bảo trì định kỳ thiết bị sản xuất', ARRAY['A', 'B'], 36),
('hsk3-006', '员工培训', 'Đào tạo nhân viên', 'HSK 3', 'Công việc và văn phòng', 'Đào tạo kỹ năng mới cho nhân viên', ARRAY['A', 'B'], 33),
('hsk3-007', '安全会议', 'Hội nghị an toàn', 'HSK 3', 'Công việc và văn phòng', 'Hội nghị an toàn lao động hàng tuần', ARRAY['A', 'B'], 37),
('hsk3-008', '质量报告', 'Báo cáo chất lượng', 'HSK 3', 'QA/QC', 'Trình bày báo cáo chất lượng sản phẩm', ARRAY['A', 'B'], 39),
('hsk3-009', '客户投诉', 'Khiếu nại của khách hàng', 'HSK 3', 'Xử lý lỗi sản phẩm và sự cố', 'Xử lý khiếu nại về chất lượng sản phẩm', ARRAY['A', 'B'], 40),
('hsk3-010', '供应商会议', 'Hội nghị với nhà cung cấp', 'HSK 3', 'Giao tiếp với quản lý và đồng nghiệp', 'Thảo luận với nhà cung cấp về chất lượng nguyên vật liệu', ARRAY['A', 'B'], 42),
('hsk3-011', '生产计划', 'Kế hoạch sản xuất', 'HSK 3', 'Quy trình sản xuất và quản lý chất lượng', 'Lập kế hoạch sản xuất hàng tháng', ARRAY['A', 'B'], 35),
('hsk3-012', '库存管理', 'Quản lý kho hàng', 'HSK 3', 'Sản xuất', 'Quản lý hàng tồn kho và nhập xuất kho', ARRAY['A', 'B'], 38),
('hsk3-013', '采购流程', 'Quy trình mua hàng', 'HSK 3', 'Công việc và văn phòng', 'Quy trình mua nguyên vật liệu và thiết bị', ARRAY['A', 'B'], 36),
('hsk3-014', '员工考勤', 'Chấm công nhân viên', 'HSK 3', 'Công việc và văn phòng', 'Quy trình chấm công và tính lương', ARRAY['A', 'B'], 34),
('hsk3-015', '办公室日常', 'Công việc văn phòng hằng ngày', 'HSK 3', 'Công việc và văn phòng', 'Công việc thường ngày trong văn phòng', ARRAY['A', 'B'], 37),
('hsk3-016', '会议室预订', 'Đặt phòng họp', 'HSK 3', 'Công việc và văn phòng', 'Đặt phòng họp cho các cuộc họp nội bộ', ARRAY['A', 'B'], 33),
('hsk3-017', '文件归档', 'Lưu trữ tài liệu', 'HSK 3', 'Công việc và văn phòng', 'Quy trình lưu trữ và phân loại tài liệu', ARRAY['A', 'B'], 35),
('hsk3-018', '电话沟通', 'Giao tiếp qua điện thoại', 'HSK 3', 'Điện thoại và giao tiếp trực tuyến', 'Giao tiếp với khách hàng và đối tác qua điện thoại', ARRAY['A', 'B'], 39),
('hsk3-019', '电子邮件', 'Email công việc', 'HSK 3', 'Điện thoại và giao tiếp trực tuyến', 'Viết và trả lời email công việc', ARRAY['A', 'B'], 41),
('hsk3-020', '视频会议', 'Hội nghị truyền hình', 'HSK 3', 'Điện thoại và giao tiếp trực tuyến', 'Tham gia hội nghị truyền hình với đối tác nước ngoài', ARRAY['A', 'B'], 43),
('hsk3-021', '银行开户', 'Mở tài khoản ngân hàng', 'HSK 3', 'Ngân hàng và tài chính cá nhân', 'Thủ tục mở tài khoản ngân hàng cho doanh nghiệp', ARRAY['A', 'B'], 36),
('hsk3-022', '工资发放', 'Phát lương', 'HSK 3', 'Ngân hàng và tài chính cá nhân', 'Quy trình phát lương cho nhân viên', ARRAY['A', 'B'], 38),
('hsk3-023', '租房合同', 'Hợp đồng thuê nhà', 'HSK 3', 'Thuê nhà và sinh hoạt', 'Thảo luận và ký hợp đồng thuê nhà', ARRAY['A', 'B'], 37),
('hsk3-024', '水电费缴纳', 'Thanh toán tiền điện nước', 'HSK 3', 'Thuê nhà và sinh hoạt', 'Thanh toán hóa đơn điện nước hàng tháng', ARRAY['A', 'B'], 34),
('hsk3-025', '社区活动', 'Hoạt động cộng đồng', 'HSK 3', 'Tình huống xã hội và đời sống thực tế', 'Tham gia hoạt động cộng đồng tại khu dân cư', ARRAY['A', 'B'], 35)
ON CONFLICT (dialogue_id) DO NOTHING;

-- Cập nhật version trong bảng settings nếu tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings') THEN
    INSERT INTO settings (key, value, updated_at) VALUES ('last_migration_data', 'V145_conversation_data_batch1', NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  END IF;
END $$;