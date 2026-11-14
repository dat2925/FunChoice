# Tạo key FunChoice Pro

1. Mở `FunChoice-KeyMaker.exe` trên máy cấp key của SoloTech.
2. Chọn **Vĩnh viễn** hoặc **Có thời hạn**. Với key có thời hạn, điền ngày theo dạng `YYYY-MM-DD`. Key dùng đến hết ngày đó theo giờ Việt Nam.
3. Bấm **Tạo key** rồi **Sao chép key**. Gửi nguyên dòng bắt đầu bằng `FC-PRO2.` cho người dùng.
4. Người dùng mở **Nhập key Pro** trong FunChoice 1.2.1 trở lên và dán key.

Mỗi lần tạo cho ra một key riêng. Key mới dùng được trên nhiều máy. FunChoice 1.2.1 vẫn đọc key `FC-PRO1` đã cấp trước đây trên máy được cấp.

Công cụ tự tìm khóa ký tại `%LOCALAPPDATA%\FunChoiceIssuer\pro-signing-private.pem`. Khi chuyển sang máy cấp key khác, dùng nút **Chọn khóa ký…** và chọn bản sao của khóa gốc. Chỉ chuyển khóa ký cho người quản lý cấp key. Gửi người dùng bộ cài FunChoice và key kích hoạt.

Key có thời hạn được kiểm tra bằng đồng hồ hệ thống. FunChoice hoạt động ngoại tuyến nên key đã gửi có thể được chia sẻ và không thể thu hồi từ xa.
