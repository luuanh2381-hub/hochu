-- V145: Dữ liệu mẫu cho 25 hội thoại HSK 4 đầu tiên
-- Tạo dữ liệu mẫu cho đợt 5/8 (HSK 4 - 25 hội thoại)

-- Đảm bảo bảng đã tồn tại
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    RAISE EXCEPTION 'Bảng conversations chưa được tạo. Chạy migration V145_conversation_library.sql trước.';
  END IF;
END $$;

-- Chèn 25 hội thoại HSK 4 đầu tiên
INSERT INTO conversations (dialogue_id, title_zh, title_vi, hsk_level, topic, situation, characters, total_turns) VALUES
('hsk4-001', '高级质量管理体系', 'Hệ thống quản lý chất lượng nâng cao', 'HSK 4', 'Quy trình sản xuất và quản lý chất lượng', 'Triển khai hệ thống quản lý chất lượng ISO 9001 và các tiêu chuẩn quốc tế', ARRAY['A', 'B'], 42),
('hsk4-002', '统计过程控制', 'Kiểm soát quy trình thống kê', 'HSK 4', 'QA/QC', 'Áp dụng SPC để giám sát và kiểm soát quy trình sản xuất', ARRAY['A', 'B'], 45),
('hsk4-003', '能力分析', 'Phân tích năng lực quy trình', 'HSK 4', 'QA/QC', 'Phân tích khả năng quy trình sản xuất đạt yêu cầu kỹ thuật', ARRAY['A', 'B'], 43),
('hsk4-004', '控制图', 'Biểu đồ kiểm soát', 'HSK 4', 'QA/QC', 'Xây dựng và phân tích biểu đồ kiểm soát quy trình', ARRAY['A', 'B'], 46),
('hsk4-005', '过程能力指数', 'Chỉ số năng lực quy trình', 'HSK 4', 'QA/QC', 'Tính toán và diễn giải các chỉ số năng lực như Cp, Cpk, Pp, Ppk', ARRAY['A', 'B'], 44),
('hsk4-006', '根本原因分析', 'Phân tích nguyên nhân gốc', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Áp dụng các phương pháp phân tích nguyên nhân gốc như 5 Whys, Fishbone', ARRAY['A', 'B'], 47),
('hsk4-007', '失效模式与影响分析', 'Phân tích mô hình thất bại và ảnh hưởng', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Thực hiện FMEA để đánh giá rủi ro trong thiết kế và quy trình', ARRAY['A', 'B'], 48),
('hsk4-008', '故障树分析', 'Phân tích cây lỗi', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Áp dụng phân tích cây lỗi để xác định nguyên nhân sự cố hệ thống', ARRAY['A', 'B'], 45),
('hsk4-009', '可靠性工程', 'Kỹ thuật độ tin cậy', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Ứng dụng kỹ thuật độ tin cậy trong thiết kế và sản xuất sản phẩm điện tử', ARRAY['A', 'B'], 46),
('hsk4-010', '寿命预测', 'Dự báo tuổi thọ', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Dự báo tuổi thọ sản phẩm dựa trên dữ liệu thử nghiệm và vận hành', ARRAY['A', 'B'], 44),
('hsk4-011', '供应商风险管理', 'Quản lý rủi ro nhà cung cấp', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Đánh giá và quản lý rủi ro từ chuỗi cung ứng toàn cầu', ARRAY['A', 'B'], 47),
('hsk4-012', '供应链韧性', 'Độ bền chuỗi cung ứng', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Xây dựng chuỗi cung ứng linh hoạt và có khả năng phục hồi', ARRAY['A', 'B'], 45),
('hsk4-013', '多源采购', 'Mua hàng đa nguồn', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Triển khai chiến lược mua hàng từ nhiều nhà cung cấp để giảm rủi ro', ARRAY['A', 'B'], 43),
('hsk4-014', '技术转移', 'Chuyển giao công nghệ', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Quy trình chuyển giao công nghệ giữa các đơn vị và quốc gia', ARRAY['A', 'B'], 48),
('hsk4-015', '知识产权战略', 'Chiến lược sở hữu trí tuệ', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Xây dựng chiến lược bảo vệ và khai thác sở hữu trí tuệ', ARRAY['A', 'B'], 46),
('hsk4-016', '专利申请', 'Đăng ký bằng sáng chế', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Quy trình đăng ký và quản lý bằng sáng chế quốc tế', ARRAY['A', 'B'], 47),
('hsk4-017', '技术许可', 'Cấp phép công nghệ', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Thương lượng và thực hiện hợp đồng cấp phép công nghệ', ARRAY['A', 'B'], 45),
('hsk4-018', '研发合作', 'Hợp tác nghiên cứu và phát triển', 'HSK 4', 'Giao tiếp với quản lý và đồng nghiệp', 'Hợp tác R&D với đối tác quốc tế và tổ chức nghiên cứu', ARRAY['A', 'B'], 48),
('hsk4-019', '创新管理', 'Quản lý đổi mới', 'HSK 4', 'Đưa ra ý kiến và đề xuất', 'Xây dựng hệ thống quản lý đổi mới trong doanh nghiệp', ARRAY['A', 'B'], 44),
('hsk4-020', '开放式创新', 'Đổi mới mở', 'HSK 4', 'Đưa ra ý kiến và đề xuất', 'Áp dụng mô hình đổi mới mở để thu hút ý tưởng từ bên ngoài', ARRAY['A', 'B'], 46),
('hsk4-021', '技术路线图', 'Lộ trình công nghệ', 'HSK 4', 'Đưa ra ý kiến và đề xuất', 'Xây dựng lộ trình công nghệ dài hạn cho doanh nghiệp', ARRAY['A', 'B'], 45),
('hsk4-022', '产品生命周期管理', 'Quản lý vòng đời sản phẩm', 'HSK 4', 'Đưa ra ý kiến và đề xuất', 'Quản lý toàn bộ vòng đời sản phẩm từ ý tưởng đến ngừng sản xuất', ARRAY['A', 'B'], 47),
('hsk4-023', '可持续发展', 'Phát triển bền vững', 'HSK 4', 'Tình huống xã hội và đời sống thực tế', 'Triển khai chiến lược phát triển bền vững trong sản xuất điện tử', ARRAY['A', 'B'], 43),
('hsk4-024', '绿色制造', 'Sản xuất xanh', 'HSK 4', 'Tình huống xã hội và đời sống thực tế', 'Áp dụng các công nghệ và quy trình sản xuất thân thiện môi trường', ARRAY['A', 'B'], 46),
('hsk4-025', '碳足迹', 'Dấu chân carbon', 'HSK 4', 'Tình huống xã hội và đời sống thực tế', 'Đo lường và giảm dấu chân carbon trong chuỗi cung ứng', ARRAY['A', 'B'], 44)
ON CONFLICT (dialogue_id) DO NOTHING;

-- Cập nhật version trong bảng settings nếu tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings') THEN
    INSERT INTO settings (key, value, updated_at) VALUES ('last_migration_data', 'V145_conversation_data_batch5', NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  END IF;
END $$;