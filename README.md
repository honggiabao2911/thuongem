# Thương Em

PWA tiếng Việt để theo dõi kỳ kinh, ghi nhật ký sức khỏe và nhận lời nhắc chăm sóc trên iPhone. Bắt đầu với dữ liệu trống.

## Chạy trên máy

Cần Node.js **24 trở lên** và npm. Kiểm tra bằng `node -v`.

```sh
npm ci
npm test
npm run build
```

**Chạy phát triển** trong hai cửa sổ terminal, ngay trong thư mục dự án:

```sh
npm run api
```

```sh
npm run dev
```

Mở [http://localhost:5173](http://localhost:5173/). Vite chuyển tiếp API đến cổng 8787. Dev phục vụ service worker nhưng bỏ qua bộ đệm tài nguyên để tải mã đang sửa; hãy dùng bản build để kiểm tra offline. Nếu dùng tệp `.env` trong dev, giữ `PUBLIC_ORIGIN=http://localhost:5173` và `PORT=8787`.

**Chạy bản build** trên PowerShell:

```powershell
$env:PUBLIC_ORIGIN = 'http://localhost:8787'
npm start
```

Trên Linux/macOS: `PUBLIC_ORIGIN=http://localhost:8787 npm start`. Mở [http://localhost:8787](http://localhost:8787/). Khi chưa cấu hình VAPID, ghi kỳ kinh, dự đoán, nhật ký, thống kê, sao lưu JSON và xuất .ics vẫn dùng được. `localhost` dùng để thử ngay trên máy đang chạy server. Trên iPhone, mở địa chỉ HTTPS triển khai.

## Cấu hình Web Push

1. Sao chép `.env.example` thành `.env` (`cp .env.example .env` trên Linux/macOS hoặc `Copy-Item .env.example .env` trên PowerShell). Giữ tệp `.env` riêng tư.
2. Chạy `npm run keys`. Điền `publicKey` vào `VAPID_PUBLIC_KEY`, `privateKey` vào `VAPID_PRIVATE_KEY`. Đặt `VAPID_SUBJECT=mailto:dia-chi-email-cua-ban` với địa chỉ thật, ví dụ dạng `mailto:bao@example.com`.
3. Chạy `node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"`. Dùng kết quả làm `ACTIVATION_CODE` và gửi mã cho người dùng qua kênh riêng. Mã chỉ dùng để đăng ký thiết bị. Mỗi lượt cài tạo khóa quản lý riêng, lưu trong IndexedDB và xác thực các yêu cầu thay lịch, thử gửi, xóa.
4. Đặt `PUBLIC_ORIGIN` đúng địa chỉ app, không có dấu gạch chéo cuối. Chạy lại API sau khi đổi môi trường. `GET /api/config` chỉ trả khóa VAPID công khai. Giữ cặp khóa ổn định. Nếu đổi cặp khóa thì gỡ và đăng ký lại Web Push.
5. Kiểm tra bộ lập lịch bằng `npm run tick`. Lệnh quét một lần rồi thoát. Trong production, cấu hình timer bên dưới gọi lệnh tự động.

Apple dùng hạ tầng APNs cho Web Push và WebKit xác nhận không cần tham gia chương trình Apple Developer. Máy chủ cần kết nối ra cổng HTTPS tới dịch vụ push của trình duyệt, gồm `*.push.apple.com` với iPhone. [Apple Developer](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers) · [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## Triển khai HTTPS, SQLite và bộ lập lịch

Mẫu triển khai dùng một máy Linux (Debian/Ubuntu) có systemd, DNS, Node 24+, npm và Caddy. Node phục vụ cả frontend và API từ cùng một origin. API và timer dùng chung tệp SQLite trên đĩa bền vững. Chọn một máy chủ hoạt động cả ngày để lời nhắc chạy khi tất cả thiết bị đóng app.

1. Giải nén mã nguồn vào `/opt/thuong-em`. Chạy `npm ci` rồi `npm run build` trong thư mục đó. Tạo `.env` theo hướng dẫn Web Push. Đặt `PUBLIC_ORIGIN=https://thuong.ten-mien-cua-ban` và `DB_PATH=/var/lib/thuong-em/thuong-em.sqlite`. Giữ `HOST=127.0.0.1`, `PORT=8787`.
2. Tạo tài khoản dịch vụ và thư mục dữ liệu. Tài khoản này cần đọc thư mục mã nguồn, `node_modules`, `dist` và `.env`. Cấu hình mẫu dùng Node ở `/usr/bin/node`. Nếu `command -v node` trả đường dẫn khác, sửa cả hai tệp `.service` thành đường dẫn tuyệt đối phù hợp.

   ```sh
   sudo useradd --system --user-group --home-dir /var/lib/thuong-em --shell /usr/sbin/nologin thuongem
   sudo install -d -o thuongem -g thuongem -m 0700 /var/lib/thuong-em
   sudo chown root:thuongem /opt/thuong-em/.env
   sudo chmod 0640 /opt/thuong-em/.env
   sudo install -m 0644 /opt/thuong-em/deploy/thuong-em.service /etc/systemd/system/
   sudo install -m 0644 /opt/thuong-em/deploy/thuong-em-push.service /etc/systemd/system/
   sudo install -m 0644 /opt/thuong-em/deploy/thuong-em-push.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now thuong-em.service thuong-em-push.timer
   sudo systemctl list-timers thuong-em-push.timer
   ```

3. Trỏ bản ghi DNS A và AAAA nếu dùng IPv6 đến máy chủ, mở cổng 80 và 443. Thêm khối trong `deploy/Caddyfile.example` vào `/etc/caddy/Caddyfile` và thay hostname cho khớp `PUBLIC_ORIGIN`. Chạy `sudo caddy validate --config /etc/caddy/Caddyfile` rồi `sudo systemctl reload caddy`. Caddy có thể tự cấp và gia hạn chứng thư khi DNS và cổng đã đúng. [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
4. Mở URL HTTPS và xác minh `/api/config` trả `publicKey`. Kiểm tra `sudo systemctl status thuong-em.service thuong-em-push.timer`. Có thể khởi chạy một lượt bằng `sudo systemctl start thuong-em-push.service`. Kiểm tra trạng thái bằng `sudo journalctl -u thuong-em-push.service -n 30`.
5. Để cập nhật, build bản mới, khởi động lại `thuong-em.service` và giữ nguyên tệp .env, khóa VAPID, tên miền và thư mục SQLite. Bản PWA mới kích hoạt sau khi đóng các cửa sổ còn mở của bản cũ. Đổi origin tạo kho IndexedDB khác; xuất bản sao lưu JSON trước khi chuyển.

SQLite được tạo tự động và dùng WAL. Nếu cần sao lưu máy chủ, dùng SQLite Online Backup hoặc dừng cả API và timer trước khi sao chép tệp DB cùng các tệp phụ còn tồn tại. Tệp DB và bản sao chứa lịch nhắc và đăng ký push, nên cần giới hạn quyền truy cập. Khi khôi phục bản sao DB cũ, có thể khôi phục cả lịch hoặc đăng ký người dùng từng xóa, vì vậy cần giữ chính sách sao lưu phù hợp với phạm vi một người dùng.

**Chi phí tham khảo** (kiểm tra ngày 24/11/2026): DigitalOcean niêm yết Basic Droplet 1 GiB RAM, 1 vCPU, 25 GiB đĩa, 1.000 GiB truyền dữ liệu ở **6 USD/tháng** theo bảng giá. Giá đăng ký tên miền, thuế, lưu lượng vượt mức và sao lưu phụ thuộc nhà cung cấp và lựa chọn của bạn. Let's Encrypt cung cấp chứng thư miễn phí. SQLite và systemd chạy trên máy đã thuê nên kiến trúc này không cần thuê DB hoặc cron riêng. [DigitalOcean](https://www.digitalocean.com/pricing/droplets) · [Let's Encrypt](https://letsencrypt.org/about/)

## Cài trên iPhone và đặt nhắc

1. Dùng **iOS 16.4 trở lên**. Mở URL HTTPS bằng Safari → **Chia sẻ** → **Thêm vào MH chính**. Nếu thấy tùy chọn **Mở dưới dạng ứng dụng web**, bật tùy chọn này. Mở lại từ biểu tượng vừa thêm.
2. Nhập kỳ kinh gần nhất. Nếu biết độ dài chu kỳ thường gặp, nhập số của bạn. Nếu đang có lịch sử, thêm kỳ cũ trong thiết lập hoặc trong Lịch.
3. Vào **Cài đặt → Tùy chỉnh lịch nhắc**. Ở **Sắp tới kỳ kinh**, chọn trước **3 ngày** và **1 ngày** rồi chọn **20:30**. Nếu ngày dự kiến là ngày 20, sẽ tạo mốc ngày 17 và 19 lúc 20:30 theo múi giờ đã chọn. Kiểm tra giờ yên lặng và mục **Lời nhắc sắp tới**. Lời nhắc ngày đến kỳ là mục riêng.
4. Trong **Thông báo tự động**, đọc thông tin quyền riêng tư, nhập mã kích hoạt, đánh dấu đồng ý và bấm **Bật thông báo** rồi cấp quyền. Việc xin quyền diễn ra từ thao tác bấm.
5. Khi hiện **Máy chủ đã nhận lịch**, bấm **Gửi thông báo thử**. Nếu hiện **Dịch vụ push đã nhận yêu cầu thử**, hãy tự kiểm tra biểu ngữ hoặc Trung tâm thông báo. Tình trạng mạng, Focus, quyền thông báo và cài đặt màn hình khóa có thể ảnh hưởng việc nhìn thấy thông báo và thời điểm nhận.
6. Có thể tạm dừng toàn bộ, tắt từng loại, hoặc xóa đăng ký trên máy chủ. Khi đang offline, app giữ thay đổi và hiển thị chưa đồng bộ. Lịch cũ có thể chạy tới khi máy chủ nhận bản cập nhật. App tự thử lại khi mở và có mạng, hoặc khi thiết bị có mạng trở lại trong lúc app đang mở. Khi app đã đóng, hãy mở lại sau khi có mạng để đồng bộ.

Nếu không cấp quyền hoặc dùng thiết bị không hỗ trợ, xuất `.ics` tại **Lời nhắc sắp tới** và nhập vào Lịch hỗ trợ tệp iCalendar. Tệp xuất tối đa 60 ngày cho nhắc lặp, giữ nội dung kín đáo và chỉ là ảnh chụp lịch ở thời điểm xuất. Lịch đã nhập không tự cập nhật.

[Tài liệu cài ứng dụng web của Apple](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27) · [WebKit về quyền Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## Cách tính và giới hạn

- Mỗi độ dài chu kỳ là số ngày giữa hai ngày bắt đầu liên tiếp. Ứng dụng dùng trung vị của tối đa 6 khoảng hoàn chỉnh gần nhất khi có ít nhất 2 khoảng. Với ít lịch sử hơn, chỉ dự đoán nếu đã biết ngày bắt đầu gần nhất và người dùng nhập độ dài thường gặp. Kỳ đang diễn ra không thêm một độ dài chưa có ngày bắt đầu kỳ sau. Nhật ký ra máu lấm tấm không bắt đầu kỳ kinh.
- Theo NHS, rụng trứng thường xảy ra khoảng 10–16 ngày trước kỳ tới. Mốc giữa dùng để hiển thị là 13 ngày. Khoảng thụ thai dự kiến mở rộng thêm 5 ngày phía trước và 1 ngày phía sau khoảng ước tính. Ứng dụng ẩn các ước tính rụng trứng khi có dưới 3 khoảng chu kỳ, chênh lệch dài–ngắn trên 7 ngày hoặc chu kỳ ước tính dưới 21 ngày. Tiêu chí này là lựa chọn hiển thị, không phải ngưỡng chẩn đoán. LH và nhiệt độ chỉ phục vụ ghi chép.
- Ngày sức khỏe ở dạng `YYYY-MM-DD`, không dùng mốc UTC cho ngày kỳ kinh. Lịch dùng múi giờ IANA. Nếu giờ địa phương bị bỏ qua trong ngày đổi giờ mùa hè, hệ thống dời theo độ dài khoảng nhảy. Nếu một giờ xảy ra hai lần, hệ thống chọn lần đầu. Giờ yên lặng xử lý theo giờ địa phương, kể cả qua nửa đêm.
- API lưu cả những mốc gửi một lần và quy tắc lặp trong SQLite. Khi đồng bộ mới, các mốc cũ chưa tới giờ bị thay trong một cập nhật. Các mốc đã gửi được nhận diện bằng mã ổn định để tránh gửi lại khi đổi giờ. Yêu cầu đang gửi hoặc đã được nhà cung cấp nhận có thể vẫn đến. Timer chỉ lấy các lần gửi tối đa 90 phút sau giờ dự kiến. Mỗi lần có tối đa 3 lần thử trong khung này, chỉ thử lại với phản hồi 429 hoặc 503. Với sự cố mạng mơ hồ hoặc tiến trình dừng sau khi giữ chỗ gửi, hệ thống ưu tiên tránh gửi trùng và có thể bỏ qua lần nhắc đó. Đăng ký trả 404/410 được xóa.
- Lịch sử, triệu chứng, biệt danh và tên lời nhắc tự tạo ở IndexedDB. Backend giữ thời điểm nhắc, quy tắc lặp, nội dung push đã chọn từ mẫu và dữ liệu đăng ký. Thời điểm nhắc vẫn nhạy cảm. Bản sao lưu JSON không chứa khóa quản lý push. Nếu xóa dữ liệu trình duyệt trước khi gỡ đăng ký từ app, thiết bị mất khóa quản lý và có thể không còn khả năng xóa đăng ký đó qua giao diện.
- `Thương Em` có thể đổi tên hiển thị bên trong app. Tên manifest và nhãn thông báo vẫn dùng tên ứng dụng ban đầu.

**Các ngày hiển thị là ước tính dựa trên dữ liệu bạn ghi nhận. Không dùng ứng dụng để tránh thai hoặc chẩn đoán bệnh.**

[NHS về chu kỳ](https://www.nhs.uk/conditions/periods/fertility-in-the-menstrual-cycle/) · [Mayo Clinic về cửa sổ thụ thai](https://www.mayoclinic.org/healthy-lifestyle/getting-pregnant/in-depth/how-to-get-pregnant/art-20047611) · [NHS về đau kỳ kinh](https://www.nhs.uk/symptoms/period-pain/) · [NHS về kỳ kinh nhiều](https://www.nhs.uk/conditions/heavy-periods/) · [NHS về đau vùng chậu](https://www.nhs.uk/symptoms/pelvic-pain/)

## Kiểm thử

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Kết quả bàn giao: build production thành công, 14 kiểm thử Node và 3 kịch bản Chromium đều đạt.

Khi đã có Chromium tương thích, có thể chọn đường dẫn qua biến môi trường `CHROMIUM_PATH`. Kiểm thử trình duyệt dùng cấu hình iPhone 13 trên Chromium, gồm kích thước 390 px và 320 px. Backend kiểm thử thay nhà cung cấp push bằng bộ gửi giả lập để xác minh quá trình đăng ký, gửi thử, lịch SQLite và đồng bộ offline. Kiểm thử riêng kiểm tra mã hóa AES128GCM, chữ ký VAPID và xử lý sự kiện push của service worker.

Sau khi triển khai, xác nhận trên iPhone thật:

- [ ] Chạy từ biểu tượng Màn hình chính, kiểm tra safe area, bàn phím và chế độ tối.
- [ ] Ghi ngày kỳ kinh, sửa ngày và kiểm tra màn hình Lịch.
- [ ] Bật Web Push và gửi thử. Kiểm tra nội dung kín đáo xuất hiện trên iPhone.
- [ ] Bật lời nhắc chăm sóc cho hôm nay, đặt giờ sau hiện tại vài phút và tránh khoảng yên lặng. Xem máy chủ đã nhận lịch, rời app và khóa máy. Kiểm tra thông báo đến sau khi timer chạy. Tắt Focus trong lần kiểm tra đầu.
- [ ] Đổi giờ hoặc tạm dừng trước giờ cũ, kiểm tra trạng thái đồng bộ, xác nhận sự kiện đã hủy không xuất hiện.
- [ ] Bật chế độ máy bay, mở lại app từ biểu tượng và sửa nhật ký hoặc lịch nhắc. Kết nối lại, xác nhận lịch mới đã đồng bộ.
- [ ] Thử xuất JSON, nhập vào một hồ sơ thử, rồi xóa đăng ký push và dữ liệu thử.

Bản bàn giao chưa gắn tên miền, máy chủ VPS, khóa VAPID của bạn hoặc iPhone thật. Dịch vụ push thật và việc hiển thị trên thiết bị cần được xác nhận theo checklist trên.

## Mã nguồn và tài liệu kỹ thuật

| Thư mục | Vai trò |
| --- | --- |
| `src/` | React, giao diện, IndexedDB, đăng ký và đồng bộ |
| `shared/` | Mô hình dữ liệu, lịch ngày địa phương, dự đoán và quy tắc nhắc |
| `server/` | HTTP API, SQLite, gửi Web Push và lệnh quét lịch |
| `public/` | Manifest, biểu tượng và service worker |
| `deploy/` | Mẫu Caddy, systemd, trình tạo bộ đệm offline |
| `tests/` | Kiểm thử Node và Chromium |

[React + TypeScript](https://react.dev/learn/typescript) · [Vite](https://vite.dev/guide/) · [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) · [Node SQLite](https://nodejs.org/api/sqlite.html) · [web-push](https://github.com/web-push-libs/web-push) · [Temporal polyfill](https://github.com/js-temporal/temporal-polyfill) · [Zod](https://zod.dev/) · [Lucide](https://lucide.dev/guide/react) · [Playwright](https://playwright.dev/docs/emulation)

## Bản GitHub Pages

Chạy `npm ci` rồi `npm run build:pages` để tạo `docs/` cho địa chỉ `/thuongem/`. Bản tĩnh dùng IndexedDB và có thể xuất lịch .ics.
