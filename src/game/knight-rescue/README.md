# Hiệp Sĩ Cứu Mèo

Trong FunChoice: chọn trường → lớp → Cấu hình trò chơi → Hiệp Sĩ Cứu Mèo → Thiết lập.

- `GameState.ts`: quy tắc thuần TypeScript; `travel → question → feedback`, kết thúc bằng `rescue → completed` hoặc `failed`. Phaser không tính mạng, thưởng hoặc đáp án.
- `KnightSetup.tsx`: ngân hàng lớp, đề đã lưu, câu mẫu, gán thủ công, ngẫu nhiên và cảnh báo số câu. Tổng số câu bằng đợt thường + rương + câu Boss. Boss hoàn tất sau đủ số câu bắt buộc nếu còn mạng; câu sai vẫn gây sát thương.
- `KnightPlay.tsx`: tái sử dụng `QuestionCard` và ảnh SQLite. Câu không có đáp án trắc nghiệm luôn do giáo viên chấm. Đồng hồ bắt đầu sau khi câu hỏi được render. Đáp án được kiểm tra lại theo thời gian tại lúc nhận thao tác.
- `KnightRescueScene.tsx`, `GameAnimations.ts`, `audio.ts`: Phaser, hình vector dựng bằng mã và âm thanh Web Audio tự tạo; không cần mạng, không sử dụng tài nguyên của bên thứ ba.
- `KnightResults.tsx`, `KnightHistory.tsx`: thống kê, chi tiết kết quả và tiếp tục qua lịch sử chung.
- Migration `009_knight_rescue.sql` chỉ thêm bảng riêng. `knight_save` lưu snapshot trong transaction với revision; không sửa ngân hàng hoặc bảng game cũ. Sao lưu/khôi phục chung bao gồm bảng mới.

Kết quả từng câu được lưu trước khi hiển thị hiệu ứng. Timer checkpoint mỗi giây; đóng đột ngột có thể khôi phục thời gian từ checkpoint gần nhất. Mở lại phiên luôn bắt đầu ở trạng thái tạm dừng. Phần thưởng đã xử lý không được tính lại. Lỗi lưu làm dừng game và cho phép thử lại đúng snapshot.

Kiểm tra: `npm run lint`, `npm run typecheck`, `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`.

Windows E2E dùng dữ liệu tạm và chặn truy cập HTTP bên ngoài:

```powershell
npm run build
cargo build --manifest-path src-tauri/Cargo.toml --features tauri/custom-protocol
$env:FUNCHOICE_E2E_BINARY='src-tauri/target/debug/solotech-meteor.exe'
npx playwright test -g 'Hiệp Sĩ Cứu Mèo'
```
