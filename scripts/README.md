# Tạo key FunChoice Pro

1. Mở `FunChoice-KeyMaker.exe` trên máy cấp key của SoloTech.
2. Dán mã máy mà người dùng sao chép trong **Nhập key Pro**. Chọn **Vĩnh viễn** hoặc **Có thời hạn**. Với key có thời hạn, điền ngày theo dạng `YYYY-MM-DD`. Key dùng đến hết ngày đó theo giờ Việt Nam.
3. Bấm **Tạo key** rồi **Sao chép key**. Gửi nguyên dòng bắt đầu bằng `FC-PRO1.` cho người dùng.
4. Người dùng mở **Nhập key Pro** trong FunChoice 1.2.1 trở lên và dán key.

KeyMaker lưu một key còn hiệu lực cho mỗi mã máy. Để lấy lại đúng key đã cấp, nhập lại mã máy và thời hạn cũ. Có thể cấp key mới khi key cũ hết hạn. Key vĩnh viễn dùng lại được khi cài lại ứng dụng trên máy có cùng mã.

Công cụ tự tìm khóa ký tại `%LOCALAPPDATA%\FunChoiceIssuer\pro-signing-private.pem` và lưu sổ cấp key ở `issued-machines.sqlite` trong cùng thư mục. Khi chuyển máy cấp key, chuyển cả sổ cấp key cùng khóa ký gốc cho người quản lý và dùng **Chọn khóa ký…** nếu cần.

Key có thời hạn được kiểm tra bằng đồng hồ hệ thống. Mã máy dựa trên mã định danh Windows và có thể đổi khi cài lại Windows. Sổ cấp key nằm trên máy cấp key, nên hãy dùng chung một sổ nếu chuyển sang máy cấp key khác.
