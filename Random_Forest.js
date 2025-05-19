/**
 * Phân tích Sinh khối rừng (Aboveground Biomass - AGB) tỉnh Gia Lai 
 * sử dụng Random Forest trên nền tảng Google Earth Engine
 * 
 * Mã nguồn này thực hiện việc phân tích và ước tính sinh khối rừng trên mặt đất (AGB)
 * cho tỉnh Gia Lai, Việt Nam, sử dụng thuật toán Random Forest, kết hợp dữ liệu đa nguồn
 * bao gồm Sentinel-1, Sentinel-2, DEM và dữ liệu GEDI.
 * 
 * Ngày cập nhật: 2025-05-10
 * Tác giả: NinhHaiDang
 */

// CẤU HÌNH: Thay đổi thành username Google Earth Engine của bạn
var GEE_USERNAME = 'your_gee_username';
var exportPath = 'users/' + GEE_USERNAME + '/rf-biomass/';

// CẤU HÌNH: Đường dẫn đến shapefile của tỉnh Gia Lai (thay đổi thành asset của bạn)
var GIA_LAI_ASSET = 'projects/your-project-id/assets/gia_lai';

// ------------------------------
// PHẦN 1: XỬ LÝ DỮ LIỆU SENTINEL-2
// ------------------------------

// Xác định vùng nghiên cứu (tỉnh Gia Lai)
var geometry = ee.FeatureCollection(GIA_LAI_ASSET);
Map.centerObject(geometry);

// Xác định khoảng thời gian phân tích
var startDate = ee.Date.fromYMD(2021, 5, 1);
var endDate = ee.Date.fromYMD(2021, 10, 31);

// Lọc ảnh Sentinel-2 theo thời gian và khu vực
var s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED");
var filteredS2 = s2.filterBounds(geometry)
    .filterDate(startDate, endDate);

// Lấy thông tin hệ chiếu từ ảnh đầu tiên
var s2Projection = ee.Image(filteredS2.first()).select('B4').projection();

// Hàm chuyển đổi giá trị pixel sang độ phản xạ thực (nhân với 0.0001)
var scaleBands = function (image) {
    return image.multiply(0.0001).copyProperties(image, ['system:time_start']);
};

// Áp dụng mặt nạ mây sử dụng Cloud Score+
var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
var csPlusBands = csPlus.first().bandNames();
var filteredS2WithCs = filteredS2.linkCollection(csPlus, csPlusBands);

// Hàm loại bỏ pixel bị ảnh hưởng bởi mây (cloud score >= 0.5)
var maskLowQA = function (image) {
    var mask = image.select('cs').gte(0.5);
    return image.updateMask(mask);
};

// Hàm tính toán các chỉ số quang học từ dữ liệu Sentinel-2
var addIndices = function (image) {
    // NDVI (Chỉ số khác biệt thực vật hóa chuẩn hóa)
    var ndvi = image.normalizedDifference(['B8', 'B4']).rename('ndvi');

    // EVI (Chỉ số thực vật tăng cường)
    var evi = image.expression(
        '2.5 * ((NIR - RED)/(NIR + 6 * RED - 7.5 * BLUE + 1))', {
        'NIR': image.select('B8'),
        'RED': image.select('B4'),
        'BLUE': image.select('B2')
    }).rename('evi');

    // SAVI (Chỉ số thực vật điều chỉnh đất)
    var savi = image.expression(
        '((NIR - RED) / (NIR + RED + L)) * (1 + L)', {
        'NIR': image.select('B8'),
        'RED': image.select('B4'),
        'L': 0.5
    }).rename('savi');

    // NDMI (Chỉ số độ ẩm khác biệt chuẩn hóa)
    var ndmi = image.normalizedDifference(['B8', 'B11']).rename('ndmi');

    return image.addBands([ndvi, evi, savi, ndmi]);
};

// Áp dụng quy trình tiền xử lý toàn bộ cho ảnh Sentinel-2
var s2Processed = filteredS2WithCs
    .map(maskLowQA)      // Loại bỏ mây
    .select('B.*')       // Chọn các kênh quang học
    .map(scaleBands)     // Chuyển đổi giá trị pixel sang độ phản xạ
    .map(addIndices);    // Tính toán các chỉ số quang học

// Tạo ảnh composite từ các ảnh Sentinel-2 đã xử lý
var s2Composite = s2Processed.median()  // Sử dụng giá trị trung vị
    .setDefaultProjection(s2Projection)  // Đảm bảo hệ chiếu chính xác
    .clip(geometry);  // Cắt theo ranh giới vùng nghiên cứu

// ------------------------------
// PHẦN 1.1: THIẾT LẬP HIỂN THỊ CHỈ SỐ QUANG HỌC
// ------------------------------

// Thiết lập tham số hiển thị cho các chỉ số thực vật và độ ẩm
var visParams_ndvi = { min: -0.1, max: 0.9, palette: ['red', 'yellow', 'green'] };
var visParams_evi = { min: 0, max: 0.8, palette: ['red', 'yellow', 'green'] };
var visParams_savi = { min: 0, max: 0.8, palette: ['red', 'yellow', 'green'] };
var visParams_ndmi = { min: 0, max: 1, palette: ['ff0000', 'ffff00', '00ffff', '0000ff'] }; // Màu từ đỏ (khô) đến xanh (ẩm)

// Hiển thị các lớp chỉ số trên bản đồ
Map.addLayer(s2Composite.select('ndvi'), visParams_ndvi, 'NDVI');
Map.addLayer(s2Composite.select('evi'), visParams_evi, 'EVI', false);
Map.addLayer(s2Composite.select('savi'), visParams_savi, 'SAVI', false);
Map.addLayer(s2Composite.select('ndmi'), visParams_ndmi, 'NDMI', false);

// Hiển thị ảnh Sentinel-2 với kênh RGB tự nhiên
Map.addLayer(s2Composite, { bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3 }, 'Sentinel-2 Composite', false);

// ------------------------------
// PHẦN 2: XỬ LÝ DỮ LIỆU DEM VÀ TRÍCH XUẤT ĐẶC TRƯNG ĐỊA HÌNH
// ------------------------------

// Truy xuất dữ liệu DEM Copernicus GLO-30
var glo30 = ee.ImageCollection('COPERNICUS/DEM/GLO30');
var glo30Filtered = glo30.filter(ee.Filter.bounds(geometry))
    .select('DEM');

// Lấy thông tin hệ chiếu từ dữ liệu DEM
var demProj = glo30Filtered.first().select(0).projection();

// Tạo ảnh mosaic độ cao và chuyển về hệ tọa độ thống nhất
var elevation = glo30Filtered.mosaic().rename('dem')
    .setDefaultProjection(demProj) // Đảm bảo hệ chiếu chính xác
    .clip(geometry);

// Tính toán độ dốc (slope) từ DEM
var slope = ee.Terrain.slope(elevation).rename('slope')
    .setDefaultProjection(demProj)
    .clip(geometry);

// Tính toán hướng dốc (aspect) từ DEM
var aspect = ee.Terrain.aspect(elevation).rename('aspect')
    .setDefaultProjection(demProj)
    .clip(geometry);

// Kết hợp tất cả các đặc trưng địa hình thành một ảnh tổng hợp
var demBands = elevation.addBands(slope).addBands(aspect);

// Thiết lập tham số hiển thị cho độ cao
var elevationVis = {
    min: 0,
    max: 3000,
    palette: ['0000ff', '00ffff', 'ffff00', 'ff0000', 'ffffff'], // Từ xanh (thấp) đến đỏ và trắng (cao)
};
Map.addLayer(elevation, elevationVis, 'Độ cao GLO-30', false);

// Thiết lập tham số hiển thị cho độ dốc
var slopeVis = {
    min: 0,
    max: 60,
    palette: ['white', 'gray', 'black'], // Từ trắng (bằng phẳng) đến đen (dốc đứng)
};
Map.addLayer(slope, slopeVis, 'Độ dốc GLO-30', false);

// Đặt vị trí và mức độ zoom phù hợp cho bản đồ
Map.centerObject(geometry, 8);

// ------------------------------
// PHẦN 3: XỬ LÝ DỮ LIỆU GEDI L4A (SINH KHỐI)
// ------------------------------

// Truy cập dữ liệu GEDI Level 4A (Aboveground Biomass Density)
var gedi = ee.ImageCollection("LARSE/GEDI/GEDI04_A_002_MONTHLY");

// Hàm áp dụng lọc chất lượng dữ liệu GEDI theo cờ chất lượng
var qualityMask = function (image) {
    return image.updateMask(image.select('l4_quality_flag').eq(1))  // Chỉ sử dụng dữ liệu chất lượng cao
        .updateMask(image.select('degrade_flag').eq(0));  // Loại bỏ dữ liệu bị suy giảm
};

// Hàm lọc theo sai số tương đối (loại bỏ dữ liệu có sai số > 30%)
var errorMask = function (image) {
    var relative_se = image.select('agbd_se')
        .divide(image.select('agbd'));
    return image.updateMask(relative_se.lte(0.3));  // Chỉ giữ lại dữ liệu có sai số tương đối <= 30%
};

// Hàm lọc độ dốc - loại bỏ dữ liệu ở khu vực có độ dốc lớn
var slopeMask = function (image) {
    return image.updateMask(slope.lt(30));  // Chỉ giữ lại dữ liệu ở vùng có độ dốc < 30 độ
};

// Lọc dữ liệu GEDI theo thời gian và khu vực nghiên cứu
var gediFiltered = gedi.filter(ee.Filter.date(startDate, endDate))
    .filter(ee.Filter.bounds(geometry));

// Lấy thông tin hệ chiếu từ dữ liệu GEDI
var gediProjection = ee.Image(gediFiltered.first())
    .select('agbd').projection();

// Áp dụng các bộ lọc chất lượng cho dữ liệu GEDI
var gediProcessed = gediFiltered
    .map(qualityMask)
    .map(errorMask)
    .map(slopeMask);

// Tạo ảnh mosaic Sinh khối từ dữ liệu GEDI đã xử lý
var gediMosaic = gediProcessed.mosaic()
    .select('agbd')
    .setDefaultProjection(gediProjection)  // Đảm bảo hệ chiếu chính xác
    .clip(geometry);

// Hiển thị bản đồ Sinh khối GEDI
Map.addLayer(gediMosaic,
    { min: 0, max: 100, palette: ['blue', 'green', 'yellow', 'red'] },
    'GEDI Biomass Density', false);

// ------------------------------
// PHẦN 3.1: XỬ LÝ DỮ LIỆU GEDI L2A (CHIỀU CAO TÁN CÂY)
// ------------------------------

// Truy cập dữ liệu GEDI Level 2A (Canopy Height Metrics)
var gediL2A = ee.ImageCollection("LARSE/GEDI/GEDI02_A_002_MONTHLY");

// Hàm áp dụng lọc chất lượng cho dữ liệu chiều cao tán cây
var qualityMaskL2A = function (image) {
    return image.updateMask(image.select('quality_flag').eq(1))  // Chỉ sử dụng dữ liệu chất lượng cao
        .updateMask(image.select('degrade_flag').eq(0));  // Loại bỏ dữ liệu bị suy giảm
};

// Hàm lọc độ dốc cho dữ liệu chiều cao tán cây
var slopeMaskL2A = function (image) {
    return image.updateMask(slope.lt(30));  // Chỉ giữ lại dữ liệu ở vùng có độ dốc < 30 độ
};

// Lọc dữ liệu GEDI L2A theo thời gian và khu vực
var gediL2AFiltered = gediL2A
    .filterDate(startDate, endDate)
    .filterBounds(geometry)
    .map(qualityMaskL2A)
    .map(slopeMaskL2A);

// Lấy thông tin hệ chiếu từ dữ liệu GEDI L2A
var gediL2AProjection = ee.Image(gediL2AFiltered.first()).select('rh100').projection();

// Tạo ảnh chiều cao tán cây từ dữ liệu GEDI L2A (sử dụng chỉ số rh100)
var gediCanopyHeight = gediL2AFiltered
    .select('rh100')
    .mosaic()  // Tạo mosaic từ các ảnh đã lọc
    .rename('canopy_height')
    .setDefaultProjection(gediL2AProjection)
    .clip(geometry);

// Hiển thị bản đồ chiều cao tán cây
Map.addLayer(gediCanopyHeight,
    { min: 0, max: 50, palette: ['white', 'green', 'darkgreen'] },
    'GEDI Canopy Height', false);

// ------------------------------
// PHẦN 4: XUẤT DỮ LIỆU ĐÃ XỬ LÝ THÀNH ASSETS
// ------------------------------

// Xuất Composite Sentinel-2 đã xử lý
Export.image.toAsset({
    image: s2Composite.clip(geometry).reproject('EPSG:4326', null, 100),
    description: 'rf-S2_Composite',
    assetId: exportPath + 'rf-s2_composite',
    region: geometry,
    scale: 100,
    crs: 'EPSG:4326',
    maxPixels: 1e10
});

// Xuất dữ liệu DEM và các đặc trưng địa hình
Export.image.toAsset({
    image: demBands.clip(geometry).reproject('EPSG:4326', null, 100),
    description: 'rf-DEM_Bands',
    assetId: exportPath + 'rf-dem_bands',
    region: geometry,
    scale: 100,
    crs: 'EPSG:4326',
    maxPixels: 1e10
});

// Xuất dữ liệu sinh khối GEDI L4A
Export.image.toAsset({
    image: gediMosaic.clip(geometry).reproject('EPSG:4326', null, 100),
    description: 'rf-GEDI_Mosaic',
    assetId: exportPath + 'rf-gedi_mosaic',
    region: geometry,
    scale: 100,
    crs: 'EPSG:4326',
    maxPixels: 1e10
});

// Xuất dữ liệu chiều cao tán cây GEDI L2A
Export.image.toAsset({
    image: gediCanopyHeight.reproject('EPSG:4326', null, 100),
    description: 'rf-GEDI_Canopy_Height',
    assetId: exportPath + 'rf-gedi_canopy_height',
    region: geometry,
    scale: 100,
    crs: 'EPSG:4326',
    maxPixels: 1e10
});

// ------------------------------
// PHẦN 1.5: XỬ LÝ DỮ LIỆU SENTINEL-1 (SAR)
// ------------------------------

// Hàm chuyển đổi giá trị dB (decibel) từ giá trị tuyến tính
function toDB(image) {
    return image.log10().multiply(10.0);
}

// Lọc dữ liệu Sentinel-1 GRD theo thời gian, khu vực và các thông số kỹ thuật
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(geometry)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))  // Lọc polarisation VV
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))  // Lọc polarisation VH
    .filter(ee.Filter.eq('instrumentMode', 'IW'));  // Chế độ Interferometric Wide swath

// Tiền xử lý dữ liệu Sentinel-1
var s1Processed = s1.map(function (image) {
    var EdgeMask = image.select('angle');

    // Lọc nhiễu speckle bằng bộ lọc Gaussian
    var vv = image.select('VV').convolve(ee.Kernel.gaussian(30, 20, 'meters'));
    var vh = image.select('VH').convolve(ee.Kernel.gaussian(30, 20, 'meters'));

    // Kết hợp các kênh và đổi tên
    var s1_image = ee.Image.cat(vv, vh).rename(['VV', 'VH']);

    // Chuẩn hóa giá trị về khoảng [0,1]
    return s1_image
        .unitScale(-25, 0)  // Chuyển đổi khoảng giá trị từ [-25,0] sang [0,1]
        .copyProperties(image, ["system:time_start"]);
});

// Tạo ảnh composite Sentinel-1 và cắt theo vùng nghiên cứu
var s1Composite = s1Processed.median()  // Sử dụng giá trị trung vị
    .setDefaultProjection(s2Projection)  // Sử dụng cùng hệ chiếu với Sentinel-2
    .clip(geometry);

// Thiết lập tham số hiển thị cho các kênh Sentinel-1
var visParams_s1 = { min: -25, max: 0 };
Map.addLayer(s1Composite.select('VV'), visParams_s1, 'S1 VV', false);
Map.addLayer(s1Composite.select('VH'), visParams_s1, 'S1 VH', false);

// Xuất dữ liệu Sentinel-1 đã xử lý
Export.image.toAsset({
    image: s1Composite.clip(geometry).reproject('EPSG:4326', null, 100),
    description: 'rf-S1_Composite',
    assetId: exportPath + 'rf-s1_composite',
    region: geometry,
    scale: 100,
    crs: 'EPSG:4326',
    maxPixels: 1e10
});

// ------------------------------
// PHẦN 5: XÂY DỰNG VÀ HUẤN LUYỆN MÔ HÌNH RANDOM FOREST
// ------------------------------

// Nạp các asset đã xuất để chuẩn bị cho quá trình xây dựng mô hình
var s2Composite_asset = ee.Image(exportPath + 'rf-s2_composite');
var demBands_asset = ee.Image(exportPath + 'rf-dem_bands');
var gediMosaic_asset = ee.Image(exportPath + 'rf-gedi_mosaic');
var canopyHeight_asset = ee.Image(exportPath + 'rf-gedi_canopy_height');
var s1Composite_asset = ee.Image(exportPath + 'rf-s1_composite');

// Thiết lập thông số không gian cho việc phân tích
var gridScale = 100;  // Độ phân giải không gian (100m)
var gridProjection = ee.Projection('EPSG:4326').atScale(gridScale);  // Hệ tọa độ WGS 84

// Kết hợp tất cả các lớp dữ liệu đầu vào thành một ảnh đa kênh
var stacked = s2Composite_asset
    .addBands(demBands_asset)
    .addBands(gediMosaic_asset)
    .addBands(canopyHeight_asset)
    .addBands(s1Composite_asset);

// Chuyển đổi dữ liệu sang hệ tọa độ EPSG:4326 (WGS 84)
stacked = stacked.reproject({
    crs: 'EPSG:4326',
    scale: gridScale
});

// Áp dụng phương pháp resample bilinear để làm mịn dữ liệu
stacked = stacked.resample('bilinear');

// Giảm độ phân giải và đồng bộ hóa tất cả các lớp dữ liệu
var stackedResampled = stacked.reduceResolution({
    reducer: ee.Reducer.mean(),
    maxPixels: 1024
}).reproject({
    crs: gridProjection
}).clip(geometry);

// Loại bỏ các pixel không có dữ liệu
stackedResampled = stackedResampled.updateMask(stackedResampled.mask().gt(0));

// Xác định danh sách các biến dự đoán (predictors)
var predictors = ee.List([
    'canopy_height',  // Chiều cao tán cây từ GEDI L2A
    'dem',            // Độ cao địa hình từ DEM
    'slope',          // Độ dốc từ DEM
    'aspect',         // Hướng dốc từ DEM
    'ndvi',           // Chỉ số thực vật NDVI từ Sentinel-2
    'evi',            // Chỉ số thực vật EVI từ Sentinel-2
    'savi',           // Chỉ số thực vật SAVI từ Sentinel-2
    'ndmi',           // Chỉ số độ ẩm NDMI từ Sentinel-2
    'B5',             // Kênh Red Edge 1 từ Sentinel-2
    'B8',             // Kênh NIR từ Sentinel-2
    'B11',            // Kênh SWIR1 từ Sentinel-2
    'VH',             // Kênh phân cực chéo VH từ Sentinel-1
    'VV'              // Kênh phân cực đồng VV từ Sentinel-1
]);

// Xác định biến mục tiêu (AGB từ GEDI L4A)
var response = gediMosaic_asset.bandNames().get(0);
print('Các biến dự đoán được sử dụng', predictors);
print('Biến mục tiêu', response);

// Tạo các biến đầu vào và đầu ra cho mô hình
var predictorImage = stackedResampled.select(predictors);
var responseImage = stackedResampled.select([response]);

// Tạo lớp mask để phân tầng lấy mẫu
var classMask = responseImage.mask().toInt().rename('class');

// Lấy mẫu phân tầng để tạo dữ liệu huấn luyện
var numSamples = 1000;  // Số lượng mẫu huấn luyện
var training = stackedResampled.addBands(classMask)
    .stratifiedSample({
        numPoints: numSamples,
        classBand: 'class',
        region: geometry,
        scale: gridScale,
        classValues: [0, 1],
        classPoints: [0, numSamples],
        dropNulls: true,
        tileScale: 16
    });

print('Số mẫu huấn luyện thu được', training.size());
print('Thông tin mẫu huấn luyện đầu tiên', training.first());

// Huấn luyện mô hình Random Forest
var model = ee.Classifier.smileRandomForest(100)  // Sử dụng 100 cây quyết định
    .setOutputMode('REGRESSION')  // Chế độ hồi quy cho biến liên tục
    .train({
        features: training,
        classProperty: response,
        inputProperties: predictors
    });

// Dự đoán trên tập huấn luyện để đánh giá hiệu suất
var trainingPredictions = training.classify({
    classifier: model,
    outputName: 'agbd_predicted'
});

// Hàm tính chỉ số RMSE (Root Mean Square Error)
var calculateRmse = function (input) {
    var observed = ee.Array(input.aggregate_array(response));
    var predictions = ee.Array(input.aggregate_array('agbd_predicted'));
    var rmse = observed.subtract(predictions).pow(2)
        .reduce('mean', [0]).sqrt().get([0]);
    return rmse;
};

var rmse = calculateRmse(trainingPredictions);
print('Chỉ số RMSE', rmse);

// Hàm tính hệ số xác định R^2
var calculateR2 = function (input) {
    var observed = ee.Array(input.aggregate_array(response));
    var predictions = ee.Array(input.aggregate_array('agbd_predicted'));
    var meanObserved = observed.reduce('mean', [0]).get([0]);

    var ssr = observed.subtract(predictions).pow(2).reduce('sum', [0]).get([0]);
    var sst = observed.subtract(meanObserved).pow(2).reduce('sum', [0]).get([0]);
    var r2 = ee.Number(1).subtract(ee.Number(ssr).divide(sst));
    return r2;
};

var r2 = calculateR2(trainingPredictions);
print('Hệ số xác định R^2', r2);

// Tạo biểu đồ phân tán để trực quan hóa kết quả
var chart = ui.Chart.feature.byFeature({
    features: trainingPredictions.select([response, 'agbd_predicted']),
    xProperty: response,
    yProperties: ['agbd_predicted'],
}).setChartType('ScatterChart')
    .setOptions({
        title: 'Mật độ Sinh khối Trên mặt đất (Mg/Ha)',
        dataOpacity: 0.8,
        hAxis: { 'title': 'Giá trị thực đo' },
        vAxis: { 'title': 'Giá trị dự đoán' },
        legend: { position: 'right' },
        series: {
            0: {
                visibleInLegend: false,
                color: '#525252',
                pointSize: 3,
                pointShape: 'triangle',
            },
        },
        trendlines: {
            0: {
                type: 'linear',
                color: 'black',
                lineWidth: 1,
                pointSize: 0,
                labelInLegend: 'Đường hồi quy tuyến tính',
                visibleInLegend: true,
                showR2: true
            }
        },
        chartArea: { left: 100, bottom: 100, width: '50%' },
    });
print(chart);

// Áp dụng mô hình để dự đoán AGB cho toàn bộ khu vực nghiên cứu
var predictedImage = stackedResampled.classify({
    classifier: model,
    outputName: response
});

// Xuất bản đồ dự đoán sinh khối
Export.image.toAsset({
    image: predictedImage.clip(geometry),
    description: 'rf-Predicted_Image',
    assetId: exportPath + 'rf-predicted_agbd',
    region: geometry,
    scale: gridScale,
    crs: 'EPSG:4326',
    maxPixels: 1e10
});

// ------------------------------
// PHẦN 6: ƯỚC TÍNH TỔNG SINH KHỐI (AGB) CHO TOÀN TỈNH
// ------------------------------

// Nạp dữ liệu Sentinel-2 và kết quả dự đoán AGB
var s2Composite_for_agb = ee.Image(exportPath + 'rf-s2_composite');
var predictedImage_for_agb = ee.Image(exportPath + 'rf-predicted_agbd');

// Thiết lập hệ tọa độ và độ phân giải không gian
var gridProjection_for_agb = ee.Projection('EPSG:4326').atScale(gridScale);

// Nạp dữ liệu bản đồ lớp phủ ESA WorldCover
var worldcover = ee.ImageCollection('ESA/WorldCover/v200')
    .first()
    .reproject('EPSG:4326', null, 30);

// Chuyển đổi và tái lấy mẫu bản đồ lớp phủ
var worldcoverResampled = worldcover.reduceResolution({
    reducer: ee.Reducer.mode(),  // Sử dụng chế độ (giá trị phổ biến nhất)
    maxPixels: 1024
}).reproject({
    crs: 'EPSG:4326',
    scale: gridScale
});

// Tạo mặt nạ cho các lớp rừng và thực vật
var landCoverMask = worldcoverResampled.eq(10)  // Rừng cây rộng lá thường xanh
    .or(worldcoverResampled.eq(20))  // Rừng cây rộng lá rụng lá
    .or(worldcoverResampled.eq(30))  // Rừng cây kim
    .or(worldcoverResampled.eq(40))  // Rừng thường xanh rụng lá
    .or(worldcoverResampled.eq(95)); // Rừng cây thường xanh và rụng lá hỗn hợp

// Áp dụng mặt nạ lớp phủ cho ảnh dự đoán AGB
var predictedImageMasked = predictedImage_for_agb.updateMask(landCoverMask);

// Tính diện tích mỗi pixel theo đơn vị hecta
var pixelAreaHa = ee.Image.pixelArea().divide(10000);

// Tính tổng sinh khối (Tấn) bằng cách nhân mật độ (Tấn/ha) với diện tích (ha)
var predictedAgb = predictedImageMasked.multiply(pixelAreaHa);

// Thực hiện tính tổng sinh khối trên toàn bộ khu vực nghiên cứu
var stats = predictedAgb.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geometry,
    scale: 30,
    crs: 'EPSG:4326',
    maxPixels: 1e10,
    tileScale: 16
});

// Lấy giá trị tổng sinh khối và hiển thị
var totalAgb = stats.getNumber(response);
print('Tổng sinh khối AGB (Megagam)', totalAgb);

// ------------------------------
// PHẦN 7: ĐÁNH GIÁ ĐỘ QUAN TRỌNG CỦA CÁC ĐẶC TRƯNG
// ------------------------------

// Trích xuất thông tin độ quan trọng của các biến từ mô hình Random Forest
var fullImportanceDict = ee.Dictionary(model.explain().get('importance'));

// Chuyển đổi thông tin độ quan trọng thành FeatureCollection để dễ xử lý
var allFeatureNames = fullImportanceDict.keys();
var allImportanceFeatures = allFeatureNames.map(function (featureName) {
    var importanceValue = fullImportanceDict.get(featureName);
    return ee.Feature(null, {
        'feature': featureName,
        'importance': importanceValue
    });
});
var fullImportanceFC = ee.FeatureCollection(allImportanceFeatures);

// Chuẩn hóa giá trị độ quan trọng để tổng bằng 1
var allImportanceValuesList = ee.List(fullImportanceFC.aggregate_array('importance'));
var sumOfAllImportances = ee.Number(allImportanceValuesList.reduce(ee.Reducer.sum()));

var normalizedFC = fullImportanceFC.map(function (feature) {
    var originalImportance = ee.Number(feature.get('importance'));
    var normalizedImportance = originalImportance.divide(sumOfAllImportances);
    return feature.set('importance', normalizedImportance);
});

// Sắp xếp các đặc trưng theo độ quan trọng giảm dần
var sortedNormalizedFC = normalizedFC.sort('importance', false);

// Hiển thị kết quả độ quan trọng các đặc trưng
print('Độ quan trọng của các đặc trưng (Đã chuẩn hóa, Sắp xếp):', sortedNormalizedFC);

// Tạo biểu đồ tròn thể hiện độ quan trọng tương đối của các đặc trưng
var pieChartImportance = ui.Chart.feature.byFeature({
    features: sortedNormalizedFC,
    xProperty: 'feature',
    yProperties: ['importance']
})
    .setChartType('PieChart')
    .setOptions({
        title: 'Phân bố độ quan trọng của các đặc trưng (%)',
        legend: { position: 'right' },
        pieSliceText: 'percentage',
        // Các đặc trưng có độ quan trọng < 1% được gom vào nhóm "Other"
        sliceVisibilityThreshold: 0.01
    });

// Hiển thị biểu đồ tròn
print('Biểu đồ độ quan trọng của các đặc trưng:', pieChartImportance);

// ------------------------------
// PHẦN 8: XUẤT BÁO CÁO TỔNG HỢP DẠNG CSV
// ------------------------------

// Thông tin metadata về thí nghiệm
var scriptNameVal = 'rf';               // Tên script
var modelTypeVal = 'RandomForest';          // Loại mô hình sử dụng
var datasetTypeVal = 'Full';                // Loại dữ liệu (Full = sử dụng tất cả đặc trưng)

// Tạo danh sách chứa tất cả các thông tin tổng hợp
var summaryFeaturesList = ee.List([]);

// PHẦN 1: Thông tin cấu hình thí nghiệm
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Configuration', 'item': 'StartDate', 'value': startDate.format('YYYY-MM-dd')
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Configuration', 'item': 'EndDate', 'value': endDate.format('YYYY-MM-dd')
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Configuration', 'item': 'NumTrainingSamples', 'value': ee.Number(numSamples)
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Configuration', 'item': 'PredictorBands', 'value': predictors.join(', ')
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Configuration', 'item': 'ResponseBand', 'value': response
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Configuration', 'item': 'Calculated_Optical_Indices', 'value': 'ndvi, evi, savi, ndmi'
}));

// PHẦN 2: Thông tin về nguồn dữ liệu
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'S2_CollectionID', 'value': "COPERNICUS/S2_SR_HARMONIZED"
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'DEM_CollectionID', 'value': "COPERNICUS/DEM/GLO30"
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'GEDI_L4A_CollectionID', 'value': "LARSE/GEDI/GEDI04_A_002_MONTHLY"
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'GEDI_L2A_CollectionID', 'value': "LARSE/GEDI/GEDI02_A_002_MONTHLY"
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'WorldCover_CollectionID', 'value': "ESA/WorldCover/v200"
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'Geometry_AssetID', 'value': "projects/ee-bonglantrungmuoi/assets/gia_lai"
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'CloudMask_CS_Threshold_gte', 'value': 0.5
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'GEDI_L4A_QualityFlag_eq', 'value': 1
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'GEDI_L4A_DegradeFlag_eq', 'value': 0
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'GEDI_L4A_RelativeSE_lte', 'value': 0.3
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'GEDI_L2A_QualityFlag_eq', 'value': 1
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'GEDI_L2A_DegradeFlag_eq', 'value': 0
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'GEDI_SlopeMask_lt', 'value': 30
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'Model_NumTrees', 'value': 100
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'Resample_GridScale', 'value': gridScale
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'PredictedAGBD_AssetID', 'value': exportPath + 'rf-predicted_agbd'
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'DataSource_Parameters', 'item': 'LandCoverMask_Classes', 'value': "10,20,30,40,95"
}));

// PHẦN 3: Thông tin về tham số xử lý và hệ tọa độ
// Hệ tọa độ của Sentinel-2
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'S2_NativeProj_CRS', 'value': s2Projection.crs()
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'S2_NativeProj_Scale', 'value': s2Projection.nominalScale()
}));

// Hệ tọa độ của DEM
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'DEM_NativeProj_CRS', 'value': demProj.crs()
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'DEM_NativeProj_Scale', 'value': demProj.nominalScale()
}));

// Hệ tọa độ của GEDI L4A
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'GEDI_L4A_NativeProj_CRS', 'value': gediProjection.crs()
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'GEDI_L4A_NativeProj_Scale', 'value': gediProjection.nominalScale()
}));

// Hệ tọa độ của GEDI L2A
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'GEDI_L2A_NativeProj_CRS', 'value': gediL2AProjection.crs()
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'GEDI_L2A_NativeProj_Scale', 'value': gediL2AProjection.nominalScale()
}));

// Hệ tọa độ sử dụng trong phân tích
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'Resampling_GridProj_CRS', 'value': 'EPSG:4326'
}));

// Các tham số xử lý khác
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'TrainingSample_TileScale', 'value': 16
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'ReduceResolution_Reducer', 'value': 'ee.Reducer.mean()'
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'ReduceResolution_MaxPixels', 'value': 1024
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'AGB_ReduceRegion_Reducer', 'value': 'ee.Reducer.sum()'
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'AGB_ReduceRegion_Scale', 'value': 30
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'AGB_ReduceRegion_MaxPixels', 'value': 1e10
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'AGB_ReduceRegion_TileScale', 'value': 16
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'WorldCover_Resample_Reducer', 'value': 'ee.Reducer.mode()'
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Processing_Parameters', 'item': 'WorldCover_Resample_MaxPixels', 'value': 1024
}));

// PHẦN 4: Thông tin về tham số xuất dữ liệu
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Export_Parameters', 'item': 'Export_Asset_Scale_Intermediate', 'value': 100
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Export_Parameters', 'item': 'Export_Asset_Scale_PredictedAGBD', 'value': gridScale
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Export_Parameters', 'item': 'Export_Asset_MaxPixels', 'value': 1e10
}));

// PHẦN 5: Các chỉ số đánh giá hiệu suất mô hình
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'PerformanceMetric', 'item': 'RMSE', 'value': rmse
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'PerformanceMetric', 'item': 'R2', 'value': r2
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'PerformanceMetric', 'item': 'TotalAGB_Mg', 'value': totalAgb
}));

// PHẦN 6: Thông tin về mức độ quan trọng của các đặc trưng
var importanceMapped = sortedNormalizedFC.map(function (f) {
    return ee.Feature(null, {
        'script_name': scriptNameVal,
        'model_type': modelTypeVal,
        'dataset_type': datasetTypeVal,
        'category': 'FeatureImportance_Normalized',
        'item': f.get('feature'),  // Tên đặc trưng
        'value': f.get('importance')  // Độ quan trọng (đã chuẩn hóa)
    });
});

// Kết hợp tất cả thông tin thành một FeatureCollection duy nhất
var summaryFCBase = ee.FeatureCollection(summaryFeaturesList);
var finalSummaryFC = summaryFCBase.merge(importanceMapped);

// Xuất báo cáo tổng hợp dưới dạng CSV
var csvExportDescription = scriptNameVal + '_summary';
var csvFileName = scriptNameVal + '_summary';

Export.table.toDrive({
    collection: finalSummaryFC,
    description: csvExportDescription,
    fileNamePrefix: csvFileName,
    fileFormat: 'CSV',
    selectors: ['script_name', 'model_type', 'dataset_type', 'category', 'item', 'value'],
    folder: 'Gia_Lai_Biomass'
}); 