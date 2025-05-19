# Dự án Phân tích Sinh khối (Biomass) tỉnh Gia Lai sử dụng Google Earth Engine

Dự án này tập trung vào việc ước tính và lập bản đồ Sinh khối Trên mặt đất (Aboveground Biomass - AGBD) tại tỉnh Gia Lai, Việt Nam, bằng cách sử dụng dữ liệu viễn thám đa nguồn và các thuật toán học máy trên nền tảng Google Earth Engine (GEE).

## Giới thiệu chi tiết

Tỉnh Gia Lai có diện tích rừng và thảm thực vật đa dạng, đóng vai trò quan trọng trong hệ sinh thái và tiềm năng kinh tế. Việc ước tính chính xác trữ lượng sinh khối là cần thiết cho công tác quản lý tài nguyên rừng bền vững, theo dõi biến đổi khí hậu, và đánh giá tiềm năng năng lượng sinh học. Dự án này sử dụng sức mạnh của Google Earth Engine để xử lý và phân tích lượng lớn dữ liệu vệ tinh, kết hợp với các mô hình học máy để xây dựng bản đồ phân bố sinh khối cho toàn tỉnh.

Các mục tiêu chính của dự án bao gồm:
*   Tiền xử lý và tạo các bộ dữ liệu viễn thám sẵn sàng cho phân tích từ ảnh Sentinel-2, dữ liệu DEM Copernicus GLO-30, và dữ liệu GEDI.
*   Xây dựng và so sánh hiệu quả của hai mô hình học máy (Random Forest và Gradient Tree Boost) trong việc ước tính AGBD.
*   Đánh giá ảnh hưởng của việc sử dụng các bộ chỉ số quang học khác nhau từ Sentinel-2 đến độ chính xác của mô hình.
*   Tạo ra các bản đồ ước tính AGBD cho tỉnh Gia Lai.

## Nguồn dữ liệu

Dự án sử dụng các nguồn dữ liệu sau trên Google Earth Engine:

1.  **Ảnh vệ tinh Sentinel-2 SR Harmonized:**
    *   ID Collection: `COPERNICUS/S2_SR_HARMONIZED`
    *   Sử dụng để tính toán các chỉ số thực vật và đất liên quan đến sinh khối.
    *   Dữ liệu được lọc theo khoảng thời gian từ 01/05/2021 đến 31/10/2021.
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
6.  **Dữ liệu Sentinel-1 GRD:**
    *   ID Collection: `COPERNICUS/S1_GRD`
    *   Cung cấp dữ liệu radar với kênh phân cực VV và VH để bổ sung thông tin cấu trúc thực vật.

## Phương pháp luận

Quy trình phân tích tổng thể được thực hiện trên Google Earth Engine và bao gồm các bước chính:

1.  **Tiền xử lý dữ liệu:**
    *   **Sentinel-2:**
        *   Lọc ảnh theo ngày và khu vực nghiên cứu.
        *   Áp dụng mặt nạ mây sử dụng Cloud Score+ (ngưỡng `cs >= 0.5`).
        *   Chuyển đổi giá trị pixel sang độ phản xạ (nhân với `0.0001`).
        *   Tính toán các chỉ số quang học (NDVI, EVI, SAVI, NDMI,...)
        *   Tạo ảnh composite (median) từ các ảnh đã xử lý.
    *   **Sentinel-1:**
        *   Lọc ảnh theo thời gian, khu vực, và chế độ.
        *   Áp dụng bộ lọc Gaussian để giảm nhiễu speckle.
        *   Sử dụng kênh VV và VH.
    *   **DEM GLO-30:**
        *   Tạo mosaic DEM cho khu vực.
        *   Tính toán lớp độ dốc (slope) và hướng dốc (aspect).
    *   **GEDI L4A & L2A:**
        *   Lọc dữ liệu theo thời gian, khu vực, cờ chất lượng, sai số (cho L4A) và độ dốc (ngưỡng `< 30 độ`).
        *   Tạo ảnh mosaic cho AGBD (từ L4A) và chiều cao tán cây (`rh100` từ L2A).

2.  **Chuẩn bị dữ liệu cho mô hình:**
    *   Các lớp dữ liệu được xuất thành assets trong Google Earth Engine.
    *   Dữ liệu được xếp chồng (stack) và resample (bilinear) về độ phân giải không gian 100m.
    *   Dữ liệu huấn luyện được lấy mẫu từ các điểm GEDI L4A AGBD và các biến dự đoán.

3.  **Huấn luyện mô hình và Dự đoán:**
    *   Hai thuật toán học máy được sử dụng:
        *   **Random Forest (RF)**
        *   **Gradient Tree Boost (GTB)**
    *   Mỗi mô hình sử dụng 100 cây quyết định.
    *   Mô hình đã huấn luyện được áp dụng lên toàn bộ vùng nghiên cứu.

4.  **Đánh giá và Phân tích:**
    *   Đánh giá hiệu suất mô hình sử dụng RMSE và R².
    *   Phân tích độ quan trọng của các biến dự đoán.
    *   Ước tính tổng sinh khối cho toàn tỉnh.

## Mã nguồn 

Dự án bao gồm hai mã nguồn chính:

*   **`Random_Forest.js`**:
    *   Sử dụng thuật toán Random Forest để ước tính sinh khối.
    *   Thực hiện toàn bộ quy trình từ tiền xử lý đến đánh giá mô hình.

*   **`Gradient_Tree_Boosting.js`**:
    *   Sử dụng thuật toán Gradient Tree Boosting để ước tính sinh khối.
    *   Thực hiện quy trình tương tự như Random Forest.

## Hướng dẫn sử dụng

1.  **Truy cập Google Earth Engine Code Editor:** Mở [Google Earth Engine Code Editor](https://code.earthengine.google.com/).

2.  **Sao chép và Dán Mã Nguồn:**
    *   Mở từng tệp `.js` trong dự án này.
    *   Sao chép toàn bộ nội dung của script.
    *   Dán vào một script mới trong GEE Code Editor.

3.  **Cấu hình tham số (QUAN TRỌNG):**
    *   Sau khi dán mã nguồn, bạn cần cấu hình hai tham số quan trọng:
    
        ```javascript
        // CẤU HÌNH: Thay đổi thành username Google Earth Engine của bạn
        var GEE_USERNAME = 'your_gee_username';
        
        // CẤU HÌNH: Đường dẫn đến shapefile của tỉnh Gia Lai (thay đổi thành asset của bạn)
        var GIA_LAI_ASSET = 'projects/your-project-id/assets/gia_lai';
        ```
        
        - Đổi `'your_gee_username'` thành tên người dùng GEE của bạn (ví dụ: `'user1234'`).
        - Đổi `'projects/your-project-id/assets/gia_lai'` thành đường dẫn đến asset chứa ranh giới tỉnh Gia Lai mà bạn đã tải lên.

4.  **Tải lên shapefile tỉnh Gia Lai:**
    *   Bạn cần tải lên shapefile ranh giới tỉnh Gia Lai vào tài khoản Google Earth Engine của mình.
    *   Sau khi tải lên, cập nhật biến `GIA_LAI_ASSET` với đường dẫn đến asset.

5.  **Chạy Script:** Nhấn nút "Run" trong GEE Code Editor.
    *   Các lớp bản đồ trung gian (chỉ số, DEM, GEDI) sẽ được thêm vào cửa sổ bản đồ.
    *   Quá trình huấn luyện mô hình và dự đoán có thể mất một khoảng thời gian.
    *   Các tác vụ xuất (Export) sẽ xuất hiện trong tab "Tasks". Bạn cần nhấn "RUN" cho từng tác vụ.

6.  **Xem Kết quả:** Sau khi các tác vụ xuất hoàn thành, bạn có thể tìm thấy các lớp dữ liệu và bản đồ sinh khối trong thư mục GEE Assets của bạn.

## Cấu trúc thư mục dự án

```
.
├── README.md
├── LICENSE
├── .gitignore
├── Gradient_Tree_Boosting.js
└── Random_Forest.js
```

## Công nghệ sử dụng

*   **Nền tảng chính:** Google Earth Engine (GEE)
*   **Ngôn ngữ lập trình:** JavaScript (API của GEE)
*   **Thuật toán học máy:** Random Forest, Gradient Tree Boost

## Liên hệ

Nếu có bất kỳ câu hỏi hoặc góp ý nào, bạn có thể liên hệ qua:
*   Email: ninhhaidangg@gmail.com
*   Github: https://github.com/ninhhaidang/

