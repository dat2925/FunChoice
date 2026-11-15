# FunChoice Pro · Thanh toán và cấp bản quyền

Worker Hono dùng Cloudflare D1 và SDK chính thức `@payos/node` với `nodejs_compat`. Ứng dụng desktop gửi mã máy Windows, gói đã chọn và key hiện tại (nếu có) tới Worker khi tạo đơn. Dữ liệu trường, lớp và học sinh tiếp tục nằm trong SQLite local.

## Chạy local với thanh toán giả lập

Cần Node.js 24, Rust và bộ công cụ build Tauri trên Windows.

```powershell
cd server
npm ci
npm run mock:setup
npm run migrate:local
npm run mock:prices
npm run dev -- --ip 127.0.0.1 --port 8787
```

`mock:setup` tạo một cặp ký **riêng cho mock** và lưu cấu hình vào `.dev.vars`. Nó giữ nguyên tệp khi chạy lại. `mock:prices` chỉ đặt giá cho D1 cục bộ. Migration tạo gói mới ở trạng thái chưa mở bán và giữ giá, trạng thái của các gói đã có.

Mở cửa sổ lệnh khác tại thư mục gốc. Dùng giá trị public key do `mock:setup` in ra:

```powershell
$env:FUNCHOICE_DEV_LICENSE_PUBLIC_KEY_HEX = '<public key mock>'
$env:FUNCHOICE_PRO_API_URL = 'http://127.0.0.1:8787'
npm run tauri -- dev
```

Nên dùng thư mục dữ liệu riêng khi thử trên máy đang sử dụng FunChoice. Biến debug `SOLOTECH_TEST_DATA_DIR` nhận đường dẫn tuyệt đối tới thư mục thử nghiệm. Tùy chọn public key mock chỉ có trong bản debug. Trong desktop, mở **Nâng cấp Pro**, chọn gói rồi bấm **Mở trang thanh toán**. Chọn **Xác nhận thanh toán giả lập** trong trình duyệt. Quay lại ứng dụng để xem Pro được kích hoạt. Bạn có thể đóng desktop trước khi xác nhận, sau đó mở lại để kiểm tra việc tiếp tục đơn.

## Kiểm thử

Tại `server/`, chạy `npm run typecheck`, `npm test` và `npm run deploy:check`. Bài kiểm thử tích hợp chạy Worker và D1 cục bộ qua Wrangler. Bài kiểm thử SDK payOS xác minh webhook ký bằng thông tin giả lập. Lệnh `deploy:check` chỉ build gói dry-run.

Để chạy bài thử desktop với mock đang mở, build bằng `npm run tauri -- build --debug --no-bundle --config src-tauri/tauri.test.json`. Giữ `FUNCHOICE_DEV_LICENSE_PUBLIC_KEY_HEX` của mock trong cửa sổ lệnh, đặt `$env:FUNCHOICE_RUN_PAYMENT_E2E = '1'` rồi chạy `npm run e2e -- --grep "thanh toán giả lập"` tại thư mục gốc.

## API

| Phương thức | Đường dẫn | Công dụng |
| --- | --- | --- |
| GET | `/v1/plans` | Gói đang mở bán theo thứ tự 1, 3, 6, 12, 24 tháng rồi vĩnh viễn, kèm `months` và giá VND. `months=0` là vĩnh viễn |
| POST | `/v1/orders` | Tạo hoặc lấy lại checkout cho cùng đơn |
| GET | `/v1/orders/:id` | Trạng thái đơn và đường dẫn checkout còn hiệu lực |
| POST | `/v1/orders/:id/key` | Nhận key sau khi đơn được xác nhận |
| POST | `/v1/licenses/recover` | Khôi phục quyền Pro còn hiệu lực cho đúng mã máy |
| POST | `/v1/webhooks/payos` | Tiếp nhận thông báo có chữ ký từ payOS |

Desktop tạo mã đơn UUID và token ngẫu nhiên 256 bit trước khi gọi API. Gửi token bằng `Authorization: Bearer ...` cho mọi yêu cầu đơn hàng hoặc khôi phục. D1 lưu SHA-256 của token. Khi tạo đơn, gửi `id`, `planId`, `machineCode` và `currentKey` nếu có key cũ. Khôi phục nhận `orderId` và `machineCode`. Desktop hiển thị mã khôi phục dạng `id.token` để người mua cất giữ riêng. Đơn đã thanh toán có thể cấp lại key cho cùng mã máy sau khi cài lại ứng dụng.

D1 ghi giao dịch, quyền Pro và lịch sử cấp trong cùng giao dịch SQLite. Một mã giao dịch ngân hàng chỉ được sử dụng một lần. Mỗi đơn chỉ cộng thời hạn một lần. Worker xác minh webhook bằng SDK payOS, so khớp mã đơn, mã link đã lưu, loại tiền VND và đúng số tiền của đơn. Trang quay về chỉ hướng dẫn mở lại FunChoice. Khi trả key, Worker ký Ed25519 theo định dạng FC-PRO1 hiện có. Cùng máy và cùng thời hạn tạo cùng một key.

Gói có thời hạn cộng từ thời điểm lớn nhất giữa lúc xác nhận thanh toán, hạn hiện tại trên D1 và hạn trên key cũ đã xác minh. D1 cộng số tháng theo lịch UTC, giữ giờ và dùng ngày cuối tháng đích nếu ngày gốc không tồn tại. Máy đã có Pro vĩnh viễn không tạo được đơn mới. Đơn đã có vẫn được xử lý theo giá và thời hạn ghi trên đơn, đồng thời giữ quyền vĩnh viễn nếu máy đã có. Key được giữ trên máy để dùng offline.

## Nâng cấp Worker và D1 hiện có lên sáu gói

Áp dụng migration trước khi deploy Worker. `0002_pro_plan_months.sql` thêm cột `months`, giữ `years` để Worker cũ tiếp tục xử lý trong lúc triển khai, và giữ các đơn, giao dịch, license đã cấp. Ba gói mới có giá `0` và `active=0`.

```powershell
Set-Location 'D:\chon_hoc_sinh\server'
npx.cmd wrangler whoami
npx.cmd wrangler d1 migrations list DB --remote
npx.cmd wrangler d1 migrations apply DB --remote
npx.cmd wrangler d1 execute DB --remote --command "SELECT id, name, months, amount, active FROM plans ORDER BY months = 0, months;"
npx.cmd wrangler deploy
Invoke-RestMethod 'https://funchoice-pro.solotech-funchoice.workers.dev/v1/plans'
```

Kiểm tra đúng tài khoản SoloTech và binding D1 trước khi chạy. Giữ nguyên Cloudflare Secrets và webhook payOS đã đăng ký. Chỉ đặt giá và bật gói sau khi có phê duyệt. Để có giao diện thẻ mới trên Desktop, build lại bộ cài sau khi kiểm tra backend.

## Triển khai sau khi được duyệt

1. Trong payOS, xác thực kênh thu tiền của SoloTech và chuẩn bị Client ID, API Key, Checksum Key. Chốt giá của sáu gói.
2. Trong `server/`, đăng nhập Wrangler, chạy `npx wrangler d1 create funchoice-pro`, thay `database_id` trong `wrangler.jsonc`, rồi chạy `npx wrangler d1 migrations apply DB --remote`.
3. Cập nhật `PUBLIC_BASE_URL` thành HTTPS của Worker và chạy `npx wrangler deploy` lần đầu với `PAYMENT_PROVIDER=disabled`. Giữ nguyên `LICENSE_PUBLIC_KEY_HEX` của FunChoice. Kiểm tra khóa cũ từ máy cấp key:

   ```powershell
   $issuerFile = Join-Path $env:LOCALAPPDATA 'FunChoiceIssuer/pro-signing-private.pem'
   node scripts/issuer.mjs verify $issuerFile
   ```

4. Tạo Cloudflare Secrets bằng `npx wrangler secret put PAYOS_CLIENT_ID`, `npx wrangler secret put PAYOS_API_KEY` và `npx wrangler secret put PAYOS_CHECKSUM_KEY`. Để nhập khóa ký gốc đã xác minh qua stdin của Wrangler, chạy `node scripts/issuer.mjs upload-secret $issuerFile`. Lệnh xác minh khóa công khai lần nữa trước khi gửi. Dùng đúng thư mục `server/` và tài khoản Cloudflare của SoloTech.
5. Đặt `PAYMENT_PROVIDER=payos` rồi chạy `npx wrangler deploy`. Đăng ký `https://<worker-domain>/v1/webhooks/payos` trong trang quản lý kênh payOS. Xác nhận kết nối webhook trước khi mở bán.
6. Đặt giá đã duyệt và bật gói từ D1. Ví dụ câu lệnh sau khi điền số tiền VND thực tế là `UPDATE plans SET amount = <giá>, active = 1 WHERE id = 'pro-1y';`. Các mã còn lại là `pro-1m`, `pro-3m`, `pro-6m`, `pro-2y` và `pro-lifetime`.
7. Khi build desktop production, đặt `FUNCHOICE_PRO_API_URL` thành origin HTTPS của Worker, ví dụ `https://pro.example.vn`, rồi chạy quy trình build Windows hiện tại. Desktop đọc URL này lúc biên dịch và hiển thị **Nâng cấp Pro** khi đã cấu hình. URL backend là cấu hình công khai. Cloudflare Secrets và khóa ký riêng chỉ dùng bên máy chủ.

Trước khi mở bán, kiểm tra đối soát trong bảng điều khiển payOS, trường hợp hết hạn QR, mất kết nối và giữ mã khôi phục. Theo dõi số yêu cầu tạo đơn ở Cloudflare và áp dụng giới hạn lưu lượng theo nhu cầu. Nếu tiếp tục cấp thủ công qua KeyMaker, ghi nhận các đơn đó vào quy trình hỗ trợ vì KeyMaker dùng sổ cấp key riêng. Khi gia hạn từ desktop, Worker kiểm tra key thủ công đã cài để giữ thời hạn.
