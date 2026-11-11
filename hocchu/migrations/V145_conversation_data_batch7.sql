-- V145: Dữ liệu mẫu cho 25 hội thoại HSK 4 tiếp theo
-- Tạo dữ liệu mẫu cho đợt 7/8 (HSK 4 - 25 hội thoại)

-- Đảm bảo bảng đã tồn tại
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    RAISE EXCEPTION 'Bảng conversations chưa được tạo. Chạy migration V145_conversation_library.sql trước.';
  END IF;
END $$;

-- Chèn 25 hội thoại HSK 4 tiếp theo
INSERT INTO conversations (dialogue_id, title_zh, title_vi, hsk_level, topic, situation, characters, total_turns) VALUES
('hsk4-051', '高级质量管理工具', 'Công cụ quản lý chất lượng nâng cao', 'HSK 4', 'Quy trình sản xuất và quản lý chất lượng', 'Áp dụng các công cụ quản lý chất lượng như QFD, TRIZ, AHP', ARRAY['A', 'B'], 48),
('hsk4-052', '质量功能展开', 'Mở rộng chức năng chất lượng', 'HSK 4', 'Quy trình sản xuất và quản lý chất lượng', 'Áp dụng QFD để chuyển đổi yêu cầu khách hàng thành đặc tính kỹ thuật', ARRAY['A', 'B'], 46),
('hsk4-053', '发明问题解决理论', 'Lý thuyết giải quyết vấn đề sáng chế', 'HSK 4', 'Quy trình sản xuất và quản lý chất lượng', 'Áp dụng TRIZ để giải quyết mâu thuẫn kỹ thuật và đổi mới', ARRAY['A', 'B'], 49),
('hsk4-054', '层次分析法', 'Phương pháp phân tích thứ bậc', 'HSK 4', 'Quy trình sản xuất và quản lý chất lượng', 'Sử dụng AHP để ra quyết định đa tiêu chí trong quản lý chất lượng', ARRAY['A', 'B'], 47),
('hsk4-055', '六西格玛设计', 'Thiết kế sáu sigma', 'HSK 4', 'Quy trình sản xuất và quản lý chất lượng', 'Áp dụng DMADV trong thiết kế sản phẩm và quy trình mới', ARRAY['A', 'B'], 48),
('hsk4-056', '精益六西格玛', 'Sáu sigma tinh gọn', 'HSK 4', 'Quy trình sản xuất và quản lý chất lượng', 'Kết hợp nguyên tắc tinh gọn và sáu sigma để cải tiến quy trình', ARRAY['A', 'B'], 46),
('hsk4-057', '价值流图析', 'Phân tích dòng giá trị', 'HSK 4', 'Quy trình sản xuất và quản lý chất lượng', 'Xây dựng và phân tích bản đồ dòng giá trị để loại bỏ lãng phí', ARRAY['A', 'B'], 49),
('hsk4-058', '拉动系统', 'Hệ thống kéo', 'HSK 4', 'Quy trình sản xuất và quản lý chất lượng', 'Triển khai hệ thống kéo Kanban trong sản xuất điện tử', ARRAY['A', 'B'], 47),
('hsk4-059', '单件流', 'Dòng chảy đơn chiếc', 'HSK 4', 'Quy trình sản xuất và quản lý chất lượng', 'Áp dụng dòng chảy đơn chiếc để giảm thời gian chu kỳ và tồn kho', ARRAY['A', 'B'], 48),
('hsk4-060', '均衡生产', 'Sản xuất cân bằng', 'HSK 4', 'Quy trình sản xuất và quản lý chất lượng', 'Triển khai sản xuất cân bằng để ổn định tải và cải thiện hiệu quả', ARRAY['A', 'B'], 46),
('hsk4-061', '快速换模', 'Thay khuôn nhanh', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Áp dụng SMED để giảm thời gian chuẩn bị và thay đổi khuôn', ARRAY['A', 'B'], 49),
('hsk4-062', '全面生产维护', 'Bảo trì sản xuất toàn diện', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Triển khai TPM để tối đa hóa hiệu suất thiết bị', ARRAY['A', 'B'], 47),
('hsk4-063', '自主维护', 'Bảo trì tự chủ', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Đào tạo nhân viên vận hành thực hiện bảo trì cơ bản', ARRAY['A', 'B'], 48),
('hsk4-064', '计划维护', 'Bảo trì dự phòng', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Xây dựng và thực hiện kế hoạch bảo trì dự phòng', ARRAY['A', 'B'], 46),
('hsk4-065', '预测性维护', 'Bảo trì dự đoán', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Triển khai bảo trì dự đoán dựa trên phân tích dữ liệu cảm biến', ARRAY['A', 'B'], 49),
('hsk4-066', '可靠性中心维护', 'Bảo trì tập trung vào độ tin cậy', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Áp dụng RCM để xác định chiến lược bảo trì tối ưu', ARRAY['A', 'B'], 47),
('hsk4-067', '故障模式影响与严重度分析', 'Phân tích mô hình thất bại, ảnh hưởng và mức độ nghiêm trọng', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Mở rộng FMEA thành FMECA để đánh giá mức độ nghiêm trọng', ARRAY['A', 'B'], 48),
('hsk4-068', '风险优先数', 'Số ưu tiên rủi ro', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Tính toán và sử dụng RPN trong phân tích rủi ro', ARRAY['A', 'B'], 46),
('hsk4-069', '失效树分析', 'Phân tích cây thất bại', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Áp dụng phân tích cây thất bại để xác định nguyên nhân sự cố', ARRAY['A', 'B'], 49),
('hsk4-070', '事件树分析', 'Phân tích cây sự kiện', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Sử dụng phân tích cây sự kiện để đánh giá hậu quả sự cố', ARRAY['A', 'B'], 47),
('hsk4-071', '危害与可操作性分析', 'Phân tích nguy hiểm và khả năng vận hành', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Áp dụng HAZOP để đánh giá rủi ro trong quy trình sản xuất', ARRAY['A', 'B'], 48),
('hsk4-072', '保护层分析', 'Phân tích lớp bảo vệ', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Sử dụng LOPA để xác định và đánh giá các lớp bảo vệ an toàn', ARRAY['A', 'B'], 46),
('hsk4-073', '定量风险评估', 'Đánh giá rủi ro định lượng', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Thực hiện đánh giá rủi ro định lượng để ra quyết định đầu tư', ARRAY['A', 'B'], 49),
('hsk4-074', '风险矩阵', 'Ma trận rủi ro', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Xây dựng và áp dụng ma trận rủi ro để phân loại rủi ro', ARRAY['A', 'B'], 47),
('hsk4-075', '风险登记册', 'Sổ đăng ký rủi ro', 'HSK 4', 'Xử lý lỗi sản phẩm và sự cố', 'Duy trì và cập nhật sổ đăng ký rủi ro trong suốt vòng đời dự án', ARRAY['A', 'B'], 48)
ON CONFLICT (dialogue_id) DO NOTHING;

-- Cập nhật version trong bảng settings nếu tồn tại
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings') THEN
    INSERT INTO settings (key, value, updated_at) VALUES ('last_migration_data', 'V145_conversation_data_batch7', NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  END IF;
END $$;