# Dự án Phân tích Sinh khối (Biomass) tỉnh Gia Lai sử dụng Google Earth Engine

Dự án này tập trung vào việc ước tính và lập bản đồ Sinh khối Trên mặt đất (Aboveground Biomass - AGBD) tại tỉnh Gia Lai, Việt Nam, bằng cách sử dụng dữ liệu viễn thám đa nguồn và các thuật toán học máy trên nền tảng Google Earth Engine (GEE).

## Giới thiệu chi tiết

Tỉnh Gia Lai có diện tích rừng và thảm thực vật đa dạng, đóng vai trò quan trọng trong hệ sinh thái và tiềm năng kinh tế. Việc ước tính chính xác trữ lượng sinh khối là cần thiết cho công tác quản lý tài nguyên rừng bền vững, theo dõi biến đổi khí hậu, và đánh giá tiềm năng năng lượng sinh học. Dự án này sử dụng sức mạnh của Google Earth Engine để xử lý và phân tích lượng lớn dữ liệu vệ tinh, kết hợp với các mô hình học máy để xây dựng bản đồ phân bố sinh khối cho toàn tỉnh.

Các mục tiêu chính của dự án bao gồm:
*   Tiền xử lý và tạo các bộ dữ liệu viễn thám sẵn sàng cho phân tích từ ảnh Sentinel-2, dữ liệu DEM Copernicus GLO-30, và dữ liệu GEDI.
*   Xây dựng và so sánh hiệu quả của hai mô hình học máy (Random Forest và Gradient Tree Boost) trong việc ước tính AGBD.
*   Đánh giá ảnh hưởng của việc sử dụng các bộ chỉ số quang học khác nhau (phiên bản "mini" và "full") từ Sentinel-2 đến độ chính xác của mô hình.
*   Tạo ra các bản đồ ước tính AGBD cho tỉnh Gia Lai.

## Nguồn dữ liệu

Dự án sử dụng các nguồn dữ liệu sau trên Google Earth Engine:

1.  **Ảnh vệ tinh Sentinel-2 SR Harmonized:**
    *   ID Collection: `COPERNICUS/S2_SR_HARMONIZED`
    *   Sử dụng để tính toán các chỉ số thực vật và đất liên quan đến sinh khối.
    *   Dữ liệu được lọc theo khoảng thời gian từ 01/12/2022 đến 31/12/2023.
2.  **Dữ liệu che phủ mây Cloud Score+:**
    *   ID Collection: `GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED`
    *   Sử dụng để loại bỏ các pixel bị ảnh hưởng bởi mây trên ảnh Sentinel-2.
3.  **Mô hình số độ cao (DEM) Copernicus GLO-30:**
    *   ID Collection: `COPERNICUS/DEM/GLO30`
    *   Sử dụng để tạo lớp dữ liệu độ cao và độ dốc, là các yếu tố ảnh hưởng đến phân bố sinh khối.
4.  **Dữ liệu Sinh khối GEDI L4A (GEDI Level 4A Aboveground Biomass Density):**
    *   ID Collection: `LARSE/GEDI/GEDI04_A_002_MONTHLY`
    *   Cung cấp các điểm dữ liệu AGBD (tấn/ha) để huấn luyện và kiểm định mô hình.
    *   Dữ liệu được lọc theo cờ chất lượng (`l4_quality_flag`, `degrade_flag`), sai số tương đối (`agbd_se`/`agbd`), và độ dốc địa hình.
5.  **Dữ liệu Chiều cao tán cây GEDI L2A (GEDI Level 2A Canopy Height Metrics):**
    *   ID Collection: `LARSE/GEDI/GEDI02_A_002_MONTHLY`
    *   Sử dụng chỉ số `rh100` (Relative Height 100%) làm một trong các biến dự đoán cho mô hình.
    *   Dữ liệu được lọc theo cờ chất lượng (`quality_flag`, `degrade_flag`) và độ dốc.
6.  **Ranh giới hành chính tỉnh Gia Lai:**
    *   Asset ID: `projects/ee-bonglantrungmuoi/assets/gia_lai`
    *   Sử dụng để cắt (clip) tất cả các lớp dữ liệu theo phạm vi nghiên cứu.

## Phương pháp luận

Quy trình phân tích tổng thể được thực hiện trên Google Earth Engine và bao gồm các bước chính:

1.  **Tiền xử lý dữ liệu:**
    *   **Sentinel-2:**
        *   Lọc ảnh theo ngày và khu vực nghiên cứu.
        *   Áp dụng mặt nạ mây sử dụng Cloud Score+ (ngưỡng `cs >= 0.5`).
        *   Chuyển đổi giá trị pixel sang độ phản xạ (nhân với `0.0001`).
        *   Tính toán các chỉ số quang học. Có hai bộ chỉ số được sử dụng:
            *   **Bộ "Mini":** NDVI, MNDWI, NDBI, GCI, NDMI, CIRE, NDRE1, MTCI, S2REP.
            *   **Bộ "Full":** Bao gồm bộ "Mini" và bổ sung EVI, BSI, SAVI, ARVI, NDRE2.
        *   Tạo ảnh composite (median) từ các ảnh đã xử lý.
    *   **DEM GLO-30:**
        *   Tạo mosaic DEM cho khu vực.
        *   Tính toán lớp độ dốc (slope).
    *   **GEDI L4A & L2A:**
        *   Lọc dữ liệu theo thời gian, khu vực, cờ chất lượng, sai số (cho L4A) và độ dốc (ngưỡng `< 30 độ`).
        *   Tạo ảnh mosaic cho AGBD (từ L4A) và chiều cao tán cây (`rh100` từ L2A).

2.  **Chuẩn bị dữ liệu cho mô hình:**
    *   Tất cả các lớp dữ liệu (ảnh composite Sentinel-2 với các chỉ số, DEM, slope, GEDI canopy height, GEDI AGBD) được xuất thành các assets trong Google Earth Engine.
    *   Các assets này sau đó được nạp lại, xếp chồng (stack) và resample (bilinear) về cùng độ phân giải không gian (100m, EPSG:3857) để tạo thành bộ dữ liệu đầu vào cho mô hình.
    *   Dữ liệu huấn luyện được lấy mẫu từ các điểm GEDI L4A AGBD và các biến dự đoán tương ứng tại các điểm đó.

3.  **Huấn luyện mô hình và Dự đoán:**
    *   Hai thuật toán học máy được sử dụng để xây dựng mô hình hồi quy dự đoán AGBD:
        *   **Random Forest (RF)**
        *   **Gradient Tree Boost (GTB)**
    *   Mỗi thuật toán được huấn luyện với cả hai bộ chỉ số Sentinel-2 ("mini" và "full") để so sánh.
    *   Các tham số mô hình (ví dụ: số cây, độ sâu cây) được thiết lập trong các script.
    *   Mô hình đã huấn luyện sau đó được áp dụng lên toàn bộ ảnh stacked của khu vực Gia Lai để tạo ra bản đồ ước tính AGBD.

4.  **Xuất kết quả:**
    *   Bản đồ AGBD cuối cùng được xuất thành asset trên Google Earth Engine.

## Các Scripts trong dự án

Dự án bao gồm các tệp script Google Earth Engine (`.js`) sau:

*   **`gtb-mini-data.js`**:
    *   Thực hiện toàn bộ quy trình từ tiền xử lý dữ liệu đến ước tính AGBD.
    *   Sử dụng bộ chỉ số Sentinel-2 **"mini"**.
    *   Sử dụng mô hình **Gradient Tree Boost (GTB)**.
*   **`rf-mini-data.js`**:
    *   Tương tự như `gtb-mini-data.js` nhưng sử dụng mô hình **Random Forest (RF)**.
    *   Sử dụng bộ chỉ số Sentinel-2 **"mini"**.
*   **`gtb-full-data.js`**:
    *   Thực hiện toàn bộ quy trình từ tiền xử lý dữ liệu đến ước tính AGBD.
    *   Sử dụng bộ chỉ số Sentinel-2 **"full"** (bao gồm nhiều chỉ số hơn).
    *   Sử dụng mô hình **Gradient Tree Boost (GTB)**.
*   **`rf-full-data.js`**:
    *   Tương tự như `gtb-full-data.js` nhưng sử dụng mô hình **Random Forest (RF)**.
    *   Sử dụng bộ chỉ số Sentinel-2 **"full"**.

*   **`gtb-clear-mini-data.js`**: Script tiện ích để xóa các GEE assets đã được tạo bởi `gtb-mini-data.js`.
*   **`gtb-clear-full-data.js`**: Script tiện ích để xóa các GEE assets đã được tạo bởi `gtb-full-data.js`.
*   **`rf-clear-mini-data.js`**: Script tiện ích để xóa các GEE assets đã được tạo bởi `rf-mini-data.js`.
*   **`rf-clear-full-data.js`**: Script tiện ích để xóa các GEE assets đã được tạo bởi `rf-full-data.js`.

**Lưu ý về đường dẫn xuất (Export Path):**
Các script chính (ví dụ: `gtb-mini-data.js`) có một biến `exportPathMini` (hoặc tương tự) được đặt là `'users/YOUR_GEE_USERNAME/YOUR_FOLDER/'`. Bạn cần **thay đổi `YOUR_GEE_USERNAME/YOUR_FOLDER`** thành đường dẫn thư mục GEE Asset của bạn trước khi chạy các script để xuất kết quả. Các script "clear" cũng sử dụng đường dẫn tương tự để xóa assets.

## Hướng dẫn sử dụng

1.  **Truy cập Google Earth Engine Code Editor:** Mở [Google Earth Engine Code Editor](https://code.earthengine.google.com/).
2.  **Sao chép và Dán Mã Nguồn:**
    *   Mở từng tệp `.js` trong dự án này.
    *   Sao chép toàn bộ nội dung của script.
    *   Dán vào một script mới trong GEE Code Editor.
3.  **Chỉnh sửa Đường dẫn Xuất (Quan trọng):**
    *   Trong các script chính (ví dụ: `gtb-mini-data.js`, `rf-full-data.js`, v.v.), tìm đến dòng định nghĩa biến `exportPath...` (ví dụ `var exportPathMini = 'users/bonglantrungmuoi/gtb-mini-data/';`).
    *   **Thay đổi `'users/bonglantrungmuoi/...'` thành đường dẫn GEE Asset của riêng bạn** (ví dụ: `'users/TEN_USER_GEE_CUA_BAN/GiaLai_Biomass_Output/'`). Đây là nơi các kết quả trung gian và bản đồ cuối cùng sẽ được lưu.
    *   Thực hiện tương tự cho các script `*-clear-*-data.js` nếu bạn muốn sử dụng chúng, đảm bảo đường dẫn `assetPath` khớp với nơi bạn đã lưu các assets.
4.  **Chạy Script:** Nhấn nút "Run" trong GEE Code Editor.
    *   Các lớp bản đồ trung gian (chỉ số, DEM, GEDI) sẽ được thêm vào cửa sổ bản đồ (Map).
    *   Quá trình huấn luyện mô hình và dự đoán có thể mất một khoảng thời gian.
    *   Các tác vụ xuất (Export) sẽ xuất hiện trong tab "Tasks" ở phía bên phải. Bạn cần nhấn "RUN" cho từng tác vụ để thực sự lưu chúng vào GEE Assets của bạn.
5.  **Xem Kết quả:** Sau khi các tác vụ xuất hoàn thành, bạn có thể tìm thấy các lớp dữ liệu và bản đồ sinh khối trong thư mục GEE Assets mà bạn đã chỉ định.

## Cấu trúc thư mục dự án (Hiện tại)

Dự án hiện tại có cấu trúc phẳng, bao gồm các tệp sau trong thư mục gốc:

```
.
├── README.md
├── gtb-clear-full-data.js
├── gtb-clear-mini-data.js
├── gtb-full-data.js
├── gtb-mini-data.js
├── rf-clear-full-data.js
├── rf-clear-mini-data.js
├── rf-full-data.js
└── rf-mini-data.js
```

## Công nghệ sử dụng

*   **Nền tảng chính:** Google Earth Engine (GEE)
*   **Ngôn ngữ lập trình:** JavaScript (API của GEE)
*   **Thuật toán học máy:** Random Forest, Gradient Tree Boost (thông qua các hàm của GEE)

## Đóng góp

Hiện tại, dự án này chủ yếu phục vụ mục đích nghiên cứu cá nhân. Tuy nhiên, nếu bạn có ý tưởng cải tiến hoặc phát hiện lỗi, vui lòng tạo một "Issue" trên GitHub repository (nếu có).

## Giấy phép

Dự án này được cấp phép theo Giấy phép MIT. Vui lòng xem tệp `LICENSE` (nếu có) để biết thêm chi tiết. (Bạn nên tạo một tệp `LICENSE` với nội dung giấy phép MIT).

## Liên hệ

Nếu có bất kỳ câu hỏi hoặc góp ý nào, bạn có thể liên hệ qua:
*   [Tên của bạn/Tên nhóm]
*   [Địa chỉ email của bạn]
*   [Liên kết GitHub Profile của bạn (nếu có)]

---
*README này được tạo tự động một phần dựa trên phân tích mã nguồn.*
