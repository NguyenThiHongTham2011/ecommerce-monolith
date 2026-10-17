# PROMPT 2 — Ecommerce Monolithic MVP

Một ứng dụng Express duy nhất kết nối PostgreSQL bằng Prisma. Tách module trong cùng tiến trình, không phải microservices. Dùng Prisma 7.10.1 với adapter PostgreSQL; DATABASE_URL đọc từ .env qua prisma.config.ts. Thư viện được khóa bằng package-lock.json. Node.js yêu cầu 22.12 trở lên (Docker dùng Node 22).

## 1. Đọc sơ đồ

Giữ đúng 7 bảng: Role, User, MemberShip, Product, Order, OrderDetail, Shipment. Role và MemberShip có nhiều User; User có nhiều Order; Order có nhiều OrderDetail và Shipment. OrderDetail dùng khóa chính kép (oid,pid). Giá là Decimal(10,2), mật khẩu chỉ lưu hash bcrypt. Giữ tên createat theo hình.

Kiểm tra: `npx prisma validate`. Đánh giá: schema hợp lệ chưa chứng minh database đã chạy; cần bước migration và healthcheck.

## 2. Chuẩn bị thư mục và môi trường

Giải nén dự án vào thư mục riêng, ví dụ `D:\LTHDV\PROMPT 2\ecommerce-monolith`. Trong VS Code chọn File > Open Folder, mở thư mục đó. Terminal > New Terminal, dùng Git Bash.

```bash
npm ci
node scripts/init-env.js
```

Script tạo `.env` với mật khẩu và JWT secret ngẫu nhiên, không ghi đè file sẵn có. Mở `.env` trên máy để xem ADMIN_USERNAME và ADMIN_PASSWORD. Không gửi file này lên GitHub/chat. Cấu hình mẫu nằm trong `.env.example`. Mật khẩu database được tạo bằng hex để dùng an toàn trong connection URL.

Kiểm tra: `.env` tồn tại và `npm ci` thành công. Đánh giá: bước này mới cài dependency và cấu hình, chưa kết nối PostgreSQL.

## 3. Schema và migration

Migration ban đầu nằm trong prisma/migrations. Docker tự chạy `prisma migrate deploy`, rồi seed hai vai trò admin/normal, membership Basic và tài khoản admin từ `.env`. Seed không đổi mật khẩu admin đã tồn tại. Không có tài khoản admin mặc định công khai.

Kiểm tra: service migrate exit code 0. Đánh giá: không dùng db push thay cho migration; không xóa volume khi sửa lỗi.

## 4. Khởi động Docker Compose

Mở Docker Desktop, chờ Engine running, chạy trong thư mục dự án:

```bash
docker compose up -d --build --wait --wait-timeout 240
docker compose ps -a
curl --fail http://localhost:3001/health
```

Kết quả đạt: postgres và api Healthy, migrate Exited (0), health trả status healthy và database connected. Cổng API 3001, PostgreSQL 5433 để tránh trùng PROMPT 1. Khi chạy Node trực tiếp, `.env` dùng PostgreSQL localhost:5433; Compose tự đổi host thành postgres.

Nếu lỗi: `docker compose logs --tail 100 api migrate postgres`. `.env` đổi POSTGRES_PASSWORD không đổi mật khẩu trong volume đã khởi tạo. Giữ mật khẩu cũ hoặc chủ động xử lý database, không tùy tiện xóa volume.

## 5. API và JWT

Đăng ký luôn là normal/Basic, score 10; không nhận role từ request. Token chỉ được cấp khi password đúng. Token hết hạn mặc định 1 giờ. Các request được bảo vệ dùng header `Authorization: Bearer <token>`. Server đọc vai trò hiện tại từ database. Không trả password hash.

| Method     | Endpoint                         | Quyền / chức năng                                    |
| ---------- | -------------------------------- | ---------------------------------------------------- |
| POST       | /api/auth/register               | Công khai: username, fullname, password (12-72 byte) |
| POST       | /api/auth/login                  | Công khai: username, password → token                |
| GET/PATCH  | /api/users/me                    | JWT: xem tài khoản / sửa fullname                    |
| GET        | /api/users                       | Admin: danh sách người dùng (tối đa 100)             |
| GET        | /api/roles                       | Admin: xem vai trò                                   |
| GET        | /api/memberships                 | JWT: xem hạng                                        |
| POST       | /api/memberships                 | Admin: tạo mname, score                              |
| PUT        | /api/memberships/:id             | Admin: sửa mname, score                              |
| PATCH      | /api/users/:id/membership        | Admin: gán mid                                       |
| GET        | /api/products, /api/products/:id | Công khai: đọc sản phẩm                              |
| POST       | /api/products                    | Admin: tạo pname, price, quantity                    |
| PUT/DELETE | /api/products/:id                | Admin: sửa/xóa sản phẩm                              |
| POST       | /api/orders                      | JWT: đặt hàng với items [{pid,qty}]                  |
| GET        | /api/orders, /api/orders/:id     | Khách chỉ xem đơn mình; admin xem tất cả             |
| POST       | /api/orders/:id/shipments        | Admin: thêm shipment với status                      |
| PATCH      | /api/shipments/:id               | Admin: sửa status                                    |
| GET        | /health                          | Kiểm tra SELECT 1 thực tế trên PostgreSQL            |

Ví dụ body sản phẩm: `{"pname":"Notebook","price":"25000.00","quantity":10}`. Gửi price dạng chuỗi thập phân để tránh sai số tiền. Đặt hàng: `{"items":[{"pid":1,"qty":2}]}`. Giá đơn được lấy từ server, không tin giá client. Transaction rollback khi thiếu tồn kho. Trừ tồn bằng điều kiện quantity >= qty để tránh bán quá số lượng khi có request đồng thời.

Phạm vi MVP: không thanh toán thật, không refresh token, không tự cộng điểm thành viên; score là thuộc tính của hạng theo sơ đồ. Không có trạng thái hủy đơn trong sơ đồ nên không tự suy diễn shipment cancelled là hủy đơn/hoàn kho. Không sửa/xóa đơn đã đặt để giữ lịch sử. Tối đa 100 bản ghi/list; cần thêm phân trang nếu mở rộng.

## 6. Kiểm thử và đánh giá

```bash
npm test
npm run test:integration
```

`npm test`: kiểm thử validation, JWT, phân quyền, health lỗi, lấy giá server và chống thiếu kho bằng database giả. `test:integration`: gọi API thật đang chạy, test đăng ký/login, admin/normal, CRUD, đơn hàng, tồn kho, shipment và chống đọc đơn người khác. Bài integration tạo dữ liệu test để xem; chạy trên database bài tập. Không coi unit test là minh chứng PostgreSQL/Docker chạy thành công.

Đạt yêu cầu thực tế khi: migration/seed thành công, API và PostgreSQL Healthy, cả hai lệnh test xanh. Lưu ảnh kết quả terminal và Docker Desktop làm minh chứng.

## 7. Dừng và chạy lại

`docker compose stop` dừng container, giữ dữ liệu. `docker compose up -d --wait` chạy lại. `docker compose down` gỡ container/network nhưng giữ volume. Tránh `down -v` vì xóa dữ liệu database.

## Trạng thái bàn giao

Xem VALIDATION.md để biết kiểm tra nào đã chạy thực tế. Repository: https://github.com/NguyenThiHongTham2011/ecommerce-monolith. Dự án độc lập với product-api PROMPT 1.

## Đối chiếu phiếu chấm

Đăng ký mới nhận role normal và membership score 10. Đặt hàng tạo Order, OrderDetail, trừ kho và tự tạo Shipment PENDING trong cùng transaction. Bộ request Postman ở postman/P2-Phieu-Cham.postman_collection.json; điền X_PID và Y_PID trước khi chạy đặt hàng X=2, Y=5.
