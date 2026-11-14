# FunChoice

Ứng dụng desktop Windows 10/11 x64 của **SoloTech**. Trò chơi, phông chữ, hình ảnh và âm thanh đều chạy trên máy. Bộ cài NSIS kèm gói cài WebView2 ngoại tuyến.

## Sử dụng

1. Tải [bộ cài FunChoice 1.2.16 cho Windows x64](https://github.com/dat2925/FunChoice/releases/download/v1.2.16/FunChoice-1.2.16-x64-setup.exe), chạy bộ cài, rồi mở ứng dụng từ menu Start.
2. Thêm trường và lớp. Trong lớp, thêm từng học sinh hoặc chọn **Nhập Excel / CSV**.
3. Mở **Cấu hình trò chơi**, chọn số học sinh, chế độ và hiệu ứng, rồi chọn **Bắt đầu trò chơi**. Dùng **Toàn màn hình** để sân chơi phủ kín màn hình. Nhấn **Esc** để hiện lại các nút điều khiển.
4. Sau lượt chơi, sao chép hoặc xuất kết quả CSV. Mục **Lịch sử chọn** lưu thứ tự công bố, thời gian, chế độ, trường và lớp.
5. Nếu đóng ứng dụng giữa lượt, chọn **Tiếp tục lượt** khi mở lại. Nút **Kết thúc** lưu các kết quả đã công bố và đóng lượt.

Tệp nhập dùng tiêu đề **Họ và tên** ở dòng đầu, tùy chọn thêm **Mã học sinh**, **Giới tính** (Nam/Nữ) và **Trạng thái**. Định dạng mã dưới dạng văn bản trong Excel để giữ số 0 ở đầu. Giá trị `Tạm dừng` hoặc `0` đánh dấu học sinh tạm dừng. CSV dùng UTF-8. Ứng dụng đọc trang tính đầu tiên của tệp XLSX. Tên học sinh có thể trùng nhau. [Tệp Excel mẫu](tests/roster.xlsx) chứa 100 bản ghi minh họa.

## Cách chọn

- **Ngẫu nhiên** lấy mẫu đồng đều trong số học sinh đang hoạt động.
- **Không lặp** lưu vòng chọn theo lớp trong SQLite. Khi một lượt đi qua ranh giới hai vòng, học sinh đã được chọn trong lượt đó được bỏ qua đến lượt sau.
- **Ưu tiên ít được chọn** dùng trọng số `1 / (1 + số lần đã được công bố)`.

Sau cảnh báo của mỗi lần rơi, Rust rút một học sinh theo chế độ đã chọn. Trong **Kiểu rơi thiên thạch**, chọn **Rơi thẳng** để giữ đường lao cũ, **Đổi hướng** để quả cầu lượn sang một bên rồi quay về điểm va chạm, hoặc **Hỗn hợp** để mỗi viên ngẫu nhiên chọn một trong hai quỹ đạo. Kết quả từng lần rơi được lưu vào SQLite. Các hồ sơ từ phiên bản trước hiển thị giới tính “Chưa nhập” cho đến khi giáo viên cập nhật.

Học sinh trò chuyện trên sân, chạy tán loạn khi có cảnh báo, rồi chạy chậm lại lúc thiên thạch lao xuống. Khi bật âm thanh, cảnh báo có tiếng kêu “Cứu với!”. Mỗi lần chọn học sinh có 22% khả năng xuất hiện một cú rơi hụt trước cú rơi trúng. Cú rơi hụt không tính vào kết quả.

Trong chi tiết lớp, mở **Chuẩn bị câu hỏi** để thêm câu thủ công hoặc nhập Excel (.xlsx) hay CSV. Dòng đầu cần có cột **Câu hỏi** và có thể thêm cột **Đáp án**. Chọn câu cho từng lượt hoặc để **Ngẫu nhiên**. Trò chơi ưu tiên các câu chưa gán cho lượt khác trước khi dùng lại câu. Trong **Cấu hình trò chơi**, chọn **Chỉ chọn học sinh** hoặc **Chọn học sinh và hiện câu hỏi**. Ở chế độ câu hỏi, máy quay phóng to học sinh, sau đó câu hỏi hiện lên. Bấm **Hiện đáp án** nếu có, rồi **Tiếp tục** để lưu kết quả và sang lượt kế.

Bật **Cho phép chọn lại học sinh** để cùng một học sinh có thể xuất hiện ở nhiều lượt. Với chế độ **Không lặp**, học sinh có thể được chọn lại khi mở vòng mới. Chế độ có câu hỏi dùng được với bản miễn phí. Giới hạn một lượt chọn của bản miễn phí vẫn áp dụng.

Chọn loại **Trắc nghiệm** để tạo từ 2 đến 8 phương án và đánh dấu các phương án đúng. Với Excel hoặc CSV, dùng các cột **A** đến **H** và ghi ký tự đáp án đúng trong cột **Đáp án đúng**, ví dụ `A C`.

## Sao lưu

Mở **Sao lưu dữ liệu** để tạo tệp `.sqlite`. Thao tác khôi phục thay thế dữ liệu hiện tại sau khi xác nhận. Ứng dụng lưu dữ liệu tại `%LOCALAPPDATA%\vn.solotech.meteor\classroom.sqlite`. Khi xóa trường, lớp hoặc học sinh, thông tin đã công bố vẫn xuất hiện trong lịch sử.

## Phát triển trên Windows

Cần Node.js 24, Rust stable cho MSVC, Visual Studio C++ Build Tools và WebView2.

~~~powershell
npm ci
npm run tauri -- dev
npm run lint
npm run typecheck
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri -- build --debug --no-bundle --config src-tauri/tauri.test.json
npm run e2e
npm run release:windows
~~~

Bài Playwright mở ứng dụng Windows thật và dùng thư mục SQLite riêng. Bộ cài production nằm trong `src-tauri\target\release\bundle\nsis`.


## Miễn phí và Pro

Bản miễn phí cho tạo tối đa 2 lớp trên toàn ứng dụng, thêm tối đa 30 học sinh mỗi lớp, chọn 1 học sinh mỗi lượt và dùng nhạc nền Gay cấn. Các giới hạn số lớp, số học sinh và số người được chọn được gỡ sau khi kích hoạt Pro. Pro có thêm nhạc nền Phiêu lưu, Arcade và MP3. Trong cấu hình, chọn **Chọn tệp MP3…** để lưu một bản sao nhạc nền (tối đa 50 MB). Bản sao được giữ sau khi đóng ứng dụng.

Liên hệ SoloTech qua Zalo **0944228546** hoặc email **solotechvn.official@gmail.com** để nhận key. Mở **Nhập key Pro** để dán key. Key mới dùng được trên nhiều máy. FunChoice hỗ trợ key vĩnh viễn và key dùng đến hết ngày theo giờ Việt Nam. Sau khi hết hạn, dữ liệu hiện có vẫn dùng được và các lượt đã bắt đầu có thể hoàn tất. Các lượt mới và thao tác thêm dữ liệu áp dụng giới hạn miễn phí. [Hướng dẫn cấp key dành cho SoloTech](scripts/README.md).


Khi thêm hoặc sửa trường, chọn **Nền sân trường** để dùng cảnh Nông thôn, Thành phố hoặc Miền núi. Lựa chọn được lưu riêng cho từng trường và áp dụng cho các lớp thuộc trường đó. Các trường từ phiên bản trước mặc định dùng cảnh Nông thôn.
