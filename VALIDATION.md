# Kiểm tra thực tế PROMPT 2 — 17/10/2026

- npm test: 11/11 PASS.
- Người dùng đã chạy integration với API/PostgreSQL container: PASS.
- Audit trực tiếp: /health HTTP 200, database connected.
- PostgreSQL có đủ 7 bảng theo sơ đồ.
- Đăng ký mới: role normal, membership score 10; đăng nhập cấp JWT.
- Đặt hàng không token: 401. Có token: X số lượng 2, Y số lượng 5.
- SQL xác nhận Order/OrderDetail, tồn kho X giảm 2 và Y giảm 5; tự có Shipment PENDING.
- Bộ Postman đã chuẩn bị, chưa ghi nhận thao tác chạy trực tiếp trên ứng dụng Postman.
- Docker Desktop và kết quả Compose người dùng cung cấp xác nhận hệ thống chạy. Assistant bị từ chối chạy docker.exe trong môi trường hiện tại; không ghi đã chạy Docker CLI thay người dùng.

Không đưa .env hoặc node_modules lên GitHub. Kiểm tra phần dữ liệu tạo lúc audit ở báo cáo 24 mục; dữ liệu thử được giữ lại.