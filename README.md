# FunChoice

Ứng dụng desktop Windows 10/11 x64 của **SoloTech**. Trò chơi, phông chữ, hình ảnh và âm thanh đều chạy trên máy. Bộ cài NSIS kèm gói cài WebView2 ngoại tuyến.

## Sử dụng

1. Tải bộ cài Windows x64 từ [trang FunChoice](https://dat2925.github.io/FunChoice/), chạy tệp rồi mở ứng dụng từ menu Start.
2. Thêm trường và lớp. Trong lớp, thêm từng học sinh hoặc chọn **Nhập Excel / CSV**.
3. Mở **Cấu hình trò chơi** và chọn **Thiên thạch**, **Tiếp sức đấu đội** hoặc **Căn phòng bí ẩn**. Với Thiên thạch, chọn số học sinh, chế độ và hiệu ứng, rồi chọn **Bắt đầu trò chơi**. Dùng **Toàn màn hình** để sân chơi phủ kín màn hình. Nhấn **Esc** để hiện lại các nút điều khiển.
4. Sau lượt chơi, sao chép hoặc xuất kết quả CSV. Mục **Lịch sử chọn** lưu thứ tự công bố, thời gian, chế độ, trường và lớp.
5. Nếu đóng ứng dụng giữa lượt, chọn **Tiếp tục lượt** khi mở lại. Nút **Kết thúc** lưu các kết quả đã công bố và đóng lượt.

Tệp nhập dùng tiêu đề **Họ và tên** ở dòng đầu, tùy chọn thêm **Mã học sinh**, **Giới tính** (Nam/Nữ) và **Trạng thái**. Định dạng mã dưới dạng văn bản trong Excel để giữ số 0 ở đầu. Giá trị `Tạm dừng` hoặc `0` đánh dấu học sinh tạm dừng. CSV dùng UTF-8. Ứng dụng đọc trang tính đầu tiên của tệp XLSX. Tên học sinh có thể trùng nhau. [Tệp Excel mẫu](tests/roster.xlsx) chứa 100 bản ghi minh họa.

## Cách chọn

- **Ngẫu nhiên** lấy mẫu đồng đều trong số học sinh đang hoạt động.
- **Không lặp** lưu vòng chọn theo lớp trong SQLite. Khi một lượt đi qua ranh giới hai vòng, học sinh đã được chọn trong lượt đó được bỏ qua đến lượt sau.
- **Ưu tiên ít được chọn** dùng trọng số `1 / (1 + số lần đã được công bố)`.

Sau cảnh báo của mỗi lần rơi, Rust rút một học sinh theo chế độ đã chọn. Trong **Kiểu rơi thiên thạch**, chọn **Rơi thẳng** để giữ đường lao cũ, **Đổi hướng** để quả cầu lượn sang một bên rồi quay về điểm va chạm, hoặc **Hỗn hợp** để mỗi viên ngẫu nhiên chọn một trong hai quỹ đạo. Kết quả từng lần rơi được lưu vào SQLite. Các hồ sơ từ phiên bản trước hiển thị giới tính “Chưa nhập” cho đến khi giáo viên cập nhật.

Học sinh trò chuyện bằng chữ trên sân, chạy tán loạn khi có cảnh báo, rồi chạy chậm lại lúc thiên thạch lao xuống. Mỗi lần chọn học sinh có 22% khả năng xuất hiện một cú rơi hụt trước cú rơi trúng. Cú rơi hụt không tính vào kết quả.

Trong chi tiết lớp, mở **Chuẩn bị câu hỏi** để thêm câu thủ công hoặc nhập Excel (.xlsx) hay CSV. Dòng đầu cần có cột **Câu hỏi** và có thể thêm cột **Đáp án**. Chọn câu cho từng lượt hoặc để **Ngẫu nhiên**. Trò chơi ưu tiên các câu chưa gán cho lượt khác trước khi dùng lại câu. Trong **Cấu hình trò chơi**, chọn **Chỉ chọn học sinh** hoặc **Chọn học sinh và hiện câu hỏi**. Ở chế độ câu hỏi, máy quay phóng to học sinh, sau đó câu hỏi hiện lên. Bấm **Hiện đáp án** nếu có, rồi **Tiếp tục** để lưu kết quả và sang lượt kế.

Bật **Cho phép chọn lại học sinh** để cùng một học sinh có thể xuất hiện ở nhiều lượt. Với chế độ **Không lặp**, học sinh có thể được chọn lại khi mở vòng mới. Chế độ có câu hỏi dùng được với bản miễn phí. Giới hạn một lượt chọn của bản miễn phí vẫn áp dụng.

Chọn loại **Trắc nghiệm** để tạo từ 2 đến 8 phương án và đánh dấu các phương án đúng. Với Excel hoặc CSV, dùng các cột **A** đến **H** và ghi ký tự đáp án đúng trong cột **Đáp án đúng**, ví dụ `A C`.

Để nhập Word, vào **Chuẩn bị câu hỏi → Nhập từ Word** và chọn tệp `.docx`. Xem trước câu hỏi, phương án, đáp án và ảnh đính kèm trước khi lưu. Trong Thiên thạch và Tiếp sức đấu đội, bấm **Xem kết quả** để chấm câu trắc nghiệm rồi **Tiếp tục** để sang lượt sau.

## Sao lưu

Mở **Sao lưu dữ liệu** để tạo tệp `.sqlite`. Thao tác khôi phục thay thế dữ liệu hiện tại sau khi xác nhận. Ứng dụng lưu dữ liệu tại `%LOCALAPPDATA%\vn.solotech.meteor\classroom.sqlite`. Khi xóa trường, lớp hoặc học sinh, thông tin đã công bố vẫn xuất hiện trong lịch sử.

## Cập nhật FunChoice

Từ phiên bản 1.2.21, FunChoice kiểm tra bản mới khi mở ứng dụng. Bạn cũng có thể bấm **Kiểm tra cập nhật** ở cuối thanh bên. Khi có bản mới, mở thông báo, kết thúc lượt chơi đang dở và bấm **Cập nhật ngay**. Bộ cài giữ cùng mã ứng dụng để tiếp tục dùng dữ liệu lớp và key Pro hiện có. Người dùng bản 1.2.20 trở về trước cần chạy bộ cài mới thủ công một lần.

### Phát hành bản cập nhật

Tăng phiên bản trong `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` và các tệp npm. Ghi các thay đổi người dùng cần biết vào `release-notes/<version>.md`, mỗi thay đổi một dòng bắt đầu bằng `- `. Chạy `npm run release:windows`, rồi tải đồng thời bộ cài `FunChoice-<version>-x64-setup.exe`, tệp `.exe.sig` và `latest.json` từ thư mục `release` lên GitHub Release có tag `v<version>`. Đặt bản đó làm **Latest**. Cửa sổ cập nhật lấy mục **Có gì mới** từ [manifest cập nhật](https://github.com/dat2925/FunChoice/releases/latest/download/latest.json).

Máy phát hành dùng khóa ký gốc tại `%LOCALAPPDATA%\FunChoiceRelease\updater.key` hoặc đường dẫn trong `TAURI_SIGNING_PRIVATE_KEY`. Giữ bản sao khóa này ngoài GitHub để các phiên bản đã cài tiếp tục xác minh được bản mới.

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


## Tiếp sức đấu đội

Trong **Chuẩn bị câu hỏi**, chọn **Tải Excel mẫu**, sau đó nhập tệp hoặc chỉnh nội dung trước khi nhập. Chọn từ 2 đến 6 đội, đặt tên, chọn số vòng và chia học sinh thủ công hoặc chia đều ngẫu nhiên. Mỗi lượt tự hiện một câu từ ngân hàng của lớp. Giáo viên có thể bấm **Hiện đáp án**, sau đó bấm **Đúng · +1 điểm** hoặc **Sai / Bỏ qua** để chấm và chuyển lượt. Bảng tổng kết hiện đội thắng hoặc các đội đồng hạng. Điểm tiếp sức được giữ trong trận đang mở.

## Căn phòng bí ẩn

Trong chương **Bí mật phòng học cũ**, cả lớp trả lời câu hỏi và khám phá các đồ vật để thu thập manh mối. Dùng manh mối để mở két, lấy chìa khóa và thoát khỏi căn phòng. Giáo viên có thể chọn từ 3 đến 10 câu hỏi, với số vị trí khám phá tương ứng. Bấm vị trí trên ảnh thiết lập để gán câu hỏi của lớp hoặc dùng câu mẫu. Mỗi câu đúng cho một chữ số; thứ tự và giá trị manh mối đổi ngẫu nhiên mỗi lượt, không trùng chữ số và tránh lặp lượt trước. Bức tranh chỉ thứ tự nhập mật mã để mở két. Có thể đặt thời lượng và bật gợi ý. Tiến độ được lưu để có thể tạm dừng và tiếp tục sau.

## Chuẩn bị nhiều cấu hình cho một lớp

Mở lớp, bấm **Cấu hình đã lưu → Tạo cấu hình**, rồi đặt tên theo tiết học. Chọn trò chơi, các thiết lập và nguồn câu hỏi. Có thể chọn từng câu từ ngân hàng hoặc chọn một đề đã lưu. FunChoice lưu nội dung câu hỏi và thứ tự cùng cấu hình. Khi đến lớp, mở **Cấu hình đã lưu** và bấm **Chơi ngay** ở cấu hình cần dùng.

## Miễn phí và Pro

Mã tích hợp thanh toán và cấp key theo mã máy nằm ở [server/](server/README.md), gồm hướng dẫn chạy mock và cấu hình triển khai payOS.

Bản miễn phí cho tạo tối đa 2 lớp trên toàn ứng dụng, thêm tối đa 30 học sinh mỗi lớp, chọn 1 học sinh mỗi lượt và dùng nhạc nền Gay cấn. Các giới hạn số lớp, số học sinh và số người được chọn được gỡ sau khi kích hoạt Pro. Pro có thêm nhạc nền Phiêu lưu, Arcade và MP3. Trong cấu hình, chọn **Chọn tệp MP3…** để lưu một bản sao nhạc nền (tối đa 50 MB). Bản sao được giữ sau khi đóng ứng dụng.

Mở **Nhập key Pro**, sao chép **Mã máy** và gửi cho SoloTech qua Zalo **0944228546** hoặc email **solotechvn.official@gmail.com**. Dán key được cấp vào cùng cửa sổ. Key chỉ dùng trên máy có mã tương ứng, với lựa chọn vĩnh viễn hoặc dùng đến hết ngày theo giờ Việt Nam. Nếu đang dùng key chia sẻ cũ `FC-PRO2`, hãy gửi mã máy để được cấp lại. Sau khi hết hạn, dữ liệu hiện có vẫn dùng được và các lượt đã bắt đầu có thể hoàn tất. [Hướng dẫn cấp key dành cho SoloTech](scripts/README.md).


Khi thêm hoặc sửa trường, chọn **Nền sân trường** để dùng cảnh Nông thôn, Thành phố hoặc Miền núi. Lựa chọn được lưu riêng cho từng trường và áp dụng cho các lớp thuộc trường đó. Các trường từ phiên bản trước mặc định dùng cảnh Nông thôn.
