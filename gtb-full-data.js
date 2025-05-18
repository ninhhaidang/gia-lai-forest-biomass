// ------------------------------
// Phần 1: Xử lý dữ liệu Sentinel-2
// ------------------------------

// Chọn vùng Gia Lai
var geometry = ee.FeatureCollection("projects/ee-bonglantrungmuoi/assets/gia_lai");
Map.centerObject(geometry);

var startDate = ee.Date.fromYMD(2022, 12, 1);
var endDate = ee.Date.fromYMD(2023, 12, 31);

// Lọc ảnh Sentinel-2 theo thời gian và khu vực
var s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED");
var filteredS2 = s2.filterBounds(geometry)
    .filterDate(startDate, endDate);

// Lấy hệ chiếu trước khi xử lý
var s2Projection = ee.Image(filteredS2.first()).select('B4').projection();

// Hàm áp dụng hệ số tỷ lệ để chuyển giá trị pixel thành độ phản xạ
var scaleBands = function (image) {
    return image.multiply(0.0001).copyProperties(image, ['system:time_start']);
};

// Sử dụng mặt nạ mây từ Cloud Score+
var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
var csPlusBands = csPlus.first().bandNames();
var filteredS2WithCs = filteredS2.linkCollection(csPlus, csPlusBands);

// Hàm loại bỏ các pixel có điểm chất lượng thấp
var maskLowQA = function (image) {
    var mask = image.select('cs').gte(0.5);
    return image.updateMask(mask);
};

// Hàm tính toán các chỉ số quang học, bổ sung thêm các chỉ số nâng cao
var addIndices = function (image) {
    var ndvi = image.normalizedDifference(['B8', 'B4']).rename('ndvi');
    var mndwi = image.normalizedDifference(['B3', 'B11']).rename('mndwi');
    var ndbi = image.normalizedDifference(['B11', 'B8']).rename('ndbi');

    var evi = image.expression(
        '2.5 * ((NIR - RED)/(NIR + 6 * RED - 7.5 * BLUE + 1))', {
        'NIR': image.select('B8'),
        'RED': image.select('B4'),
        'BLUE': image.select('B2')
    }).rename('evi');

    var bsi = image.expression(
        '((X + Y) - (A + B)) / ((X + Y) + (A + B))', {
        'X': image.select('B11'),
        'Y': image.select('B4'),
        'A': image.select('B8'),
        'B': image.select('B2'),
    }).rename('bsi');

    // Các chỉ số bổ sung
    var savi = image.expression(
        '((NIR - RED) / (NIR + RED + L)) * (1 + L)', {
        'NIR': image.select('B8'),
        'RED': image.select('B4'),
        'L': 0.5
    }).rename('savi');

    var gci = image.expression(
        '(NIR / GREEN) - 1', {
        'NIR': image.select('B8'),
        'GREEN': image.select('B3')
    }).rename('gci');

    var arvi = image.expression(
        '(NIR - (2 * RED - BLUE)) / (NIR + (2 * RED - BLUE))', {
        'NIR': image.select('B8'),
        'RED': image.select('B4'),
        'BLUE': image.select('B2')
    }).rename('arvi');

    var ndmi = image.normalizedDifference(['B8', 'B11']).rename('ndmi');

    var cire = image.expression(
        '(REDEDGE - RED) / RED', {
        'REDEDGE': image.select('B5'),
        'RED': image.select('B4')
    }).rename('cire');

    var ndre1 = image.normalizedDifference(['B8', 'B5']).rename('ndre1'); // (NIR - RedEdge1) / (NIR + RedEdge1)

    var ndre2 = image.normalizedDifference(['B8', 'B6']).rename('ndre2'); // (NIR - RedEdge2) / (NIR + RedEdge2)

    var mtci = image.expression( // MERIS Terrestrial Chlorophyll Index
        '(B6 - B5) / (B5 - B4)', {
        'B6': image.select('B6'), // Red Edge 2
        'B5': image.select('B5'), // Red Edge 1
        'B4': image.select('B4')  // Red
    }).rename('mtci');

    var s2rep = image.expression( // Sentinel-2 Red Edge Position
        '705 + 35 * (((B7 + B4) / 2 - B5) / (B6 - B5))', {
        'B7': image.select('B7'), // Red Edge 3
        'B6': image.select('B6'), // Red Edge 2
        'B5': image.select('B5'), // Red Edge 1
        'B4': image.select('B4')  // Red
    }).rename('s2rep');

    return image.addBands([ndvi, mndwi, ndbi, evi, bsi, savi, gci, arvi, ndmi, cire,
        ndre1, ndre2, mtci, s2rep]);
};


// Áp dụng các bước tiền xử lý
var s2Processed = filteredS2WithCs
    .map(maskLowQA)
    .select('B.*')
    .map(scaleBands)
    .map(addIndices);  // Bổ sung các chỉ số mới vào quá trình xử lý

// Tạo ảnh composite Sentinel-2 và cắt theo geometry
var s2Composite = s2Processed.median()  // Sử dụng trung bình các ảnh để tạo composite
    .setDefaultProjection(s2Projection)  // Đảm bảo hệ chiếu đúng
    .clip(geometry);  // Cắt theo vùng nghiên cứu

// ------------------------------
// Hiển thị các chỉ số riêng lẻ
// ------------------------------

// Thiết lập tham số hiển thị cơ bản cho các chỉ số (có thể cần điều chỉnh)
var visParams_ndvi = { min: -0.1, max: 0.9, palette: ['red', 'yellow', 'green'] };
var visParams_mndwi = { min: -1, max: 1, palette: ['0500ff', '0097ff', '00ffc1', 'ff0000'] };
var visParams_ndbi = { min: -1, max: 1, palette: ['0000ff', '00ff00', 'ff0000'] };
var visParams_evi = { min: 0, max: 0.8, palette: ['red', 'yellow', 'green'] };
var visParams_bsi = { min: -1, max: 1, palette: ['00ff00', 'ffffff', '8b4513'] }; // Green -> White -> Brown
var visParams_savi = { min: 0, max: 0.8, palette: ['red', 'yellow', 'green'] };
var visParams_gci = { min: -0.5, max: 2, palette: ['red', 'yellow', 'green'] }; // Có thể cần điều chỉnh min/max
var visParams_arvi = { min: -1, max: 1, palette: ['red', 'yellow', 'green'] };
var visParams_ndmi = { min: 0, max: 1, palette: ['ff0000', 'ffff00', '00ffff', '0000ff'] }; // Red(khô) -> Blue(ướt)
var visParams_cire = { min: -0.5, max: 1, palette: ['red', 'yellow', 'green'] }; // Có thể cần điều chỉnh min/max
var visParams_ndre1 = { min: -0.2, max: 0.8, palette: ['#FF0000', '#FFFF00', '#008000'] }; // Đỏ, Vàng, Xanh lá
var visParams_ndre2 = { min: -0.2, max: 0.8, palette: ['#FF0000', '#FFFF00', '#006400'] }; // Đỏ, Vàng, Xanh lá đậm
var visParams_mtci = { min: 0, max: 5, palette: ['#F0E68C', '#9ACD32', '#32CD32', '#228B22'] }; // Khaki, YellowGreen, LimeGreen, ForestGreen
var visParams_s2rep = { min: 700, max: 750, palette: ['#0000FF', '#00FFFF', '#FFFF00', '#FF0000'] }; // Blue, Cyan, Yellow, Red (đại diện cho dải sóng)

// Thêm các lớp chỉ số vào bản đồ
Map.addLayer(s2Composite.select('ndvi'), visParams_ndvi, 'NDVI');
Map.addLayer(s2Composite.select('mndwi'), visParams_mndwi, 'MNDWI', false);
Map.addLayer(s2Composite.select('ndbi'), visParams_ndbi, 'NDBI', false);
Map.addLayer(s2Composite.select('evi'), visParams_evi, 'EVI', false);
Map.addLayer(s2Composite.select('bsi'), visParams_bsi, 'BSI', false);
Map.addLayer(s2Composite.select('savi'), visParams_savi, 'SAVI', false);
Map.addLayer(s2Composite.select('gci'), visParams_gci, 'GCI', false);
Map.addLayer(s2Composite.select('arvi'), visParams_arvi, 'ARVI', false);
Map.addLayer(s2Composite.select('ndmi'), visParams_ndmi, 'NDMI', false);
Map.addLayer(s2Composite.select('cire'), visParams_cire, 'CIRE', false);
Map.addLayer(s2Composite.select('ndre1'), visParams_ndre1, 'NDRE1', false);
Map.addLayer(s2Composite.select('ndre2'), visParams_ndre2, 'NDRE2', false);
Map.addLayer(s2Composite.select('mtci'), visParams_mtci, 'MTCI', false);
Map.addLayer(s2Composite.select('s2rep'), visParams_s2rep, 'S2REP', false);

// Hiển thị composite với các kênh quang học cơ bản (RGB)
Map.addLayer(s2Composite, { bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3 }, 'Sentinel-2 Composite', false);

// ------------------------------
// Phần 2: Xử lý DEM và Tính độ dốc (Sử dụng GLO-30)
// ------------------------------

// Chọn dữ liệu DEM GLO-30
var glo30 = ee.ImageCollection('COPERNICUS/DEM/GLO30');
var glo30Filtered = glo30.filter(ee.Filter.bounds(geometry))
    .select('DEM');

// Lấy hệ chiếu từ GLO-30
var demProj = glo30Filtered.first().select(0).projection();

// Tạo ảnh độ cao từ GLO-30 và cập nhật hệ chiếu
var elevation = glo30Filtered.mosaic().rename('dem')
    .setDefaultProjection(demProj) // Đảm bảo sử dụng hệ chiếu của GLO-30
    .clip(geometry);

// Tính toán độ dốc từ ảnh độ cao (DEM)
var slope = ee.Terrain.slope(elevation).rename('slope')
    .setDefaultProjection(demProj) // Đảm bảo sử dụng hệ chiếu của GLO-30
    .clip(geometry);

// Kết hợp ảnh độ cao và độ dốc thành một ảnh
var demBands = elevation.addBands(slope);

// Thiết lập các tham số hiển thị cho ảnh độ cao
var elevationVis = {
    min: 0,
    max: 3000,
    palette: ['0000ff', '00ffff', 'ffff00', 'ff0000', 'ffffff'],
};
Map.addLayer(elevation, elevationVis, 'Độ cao GLO-30', false);

// Thiết lập các tham số hiển thị cho ảnh độ dốc
var slopeVis = {
    min: 0,
    max: 60,
    palette: ['white', 'gray', 'black'],
};
Map.addLayer(slope, slopeVis, 'Độ dốc GLO-30', false);

// Căn chỉnh bản đồ theo vị trí của khu vực nghiên cứu
Map.centerObject(geometry, 8);

// ------------------------------
// Phần 3: Xử lý dữ liệu GEDI L4A
// ------------------------------

// Chọn dữ liệu GEDI L4A
var gedi = ee.ImageCollection("LARSE/GEDI/GEDI04_A_002_MONTHLY");

// Hàm tạo mặt nạ chất lượng cho GEDI
var qualityMask = function (image) {
    return image.updateMask(image.select('l4_quality_flag').eq(1))
        .updateMask(image.select('degrade_flag').eq(0));
};

// Hàm tạo mặt nạ sai số cho GEDI
var errorMask = function (image) {
    var relative_se = image.select('agbd_se')
        .divide(image.select('agbd'));
    return image.updateMask(relative_se.lte(0.3));
};

// Hàm tạo mặt nạ độ dốc cho GEDI
var slopeMask = function (image) {
    return image.updateMask(slope.lt(30)); // Sử dụng độ dốc tính từ phần 2
};

// Lọc dữ liệu GEDI theo thời gian và khu vực
var gediFiltered = gedi.filter(ee.Filter.date(startDate, endDate))
    .filter(ee.Filter.bounds(geometry));

// Lấy hệ chiếu của GEDI
var gediProjection = ee.Image(gediFiltered.first())
    .select('agbd').projection();

// Áp dụng các mặt nạ và xử lý dữ liệu GEDI
var gediProcessed = gediFiltered
    .map(qualityMask)
    .map(errorMask)
    .map(slopeMask);

// Ghép các ảnh GEDI lại với nhau (mosaic)
var gediMosaic = gediProcessed.mosaic()
    .select('agbd')
    .setDefaultProjection(gediProjection) // Đảm bảo hệ chiếu của GEDI
    .clip(geometry);

// Hiển thị kết quả của GEDI Biomass Density
Map.addLayer(gediMosaic, { min: 0, max: 100, palette: ['blue', 'green', 'yellow', 'red'] }, 'GEDI Biomass Density', false);

// ------------------------------
// Phần 3.1: Xử lý dữ liệu GEDI L2A - Canopy Height
// ------------------------------

// Chọn dữ liệu GEDI L2A - Chiều cao tán cây
var gediL2A = ee.ImageCollection("LARSE/GEDI/GEDI02_A_002_MONTHLY");

// Hàm tạo mặt nạ chất lượng và độ dốc
var qualityMaskL2A = function (image) {
    return image.updateMask(image.select('quality_flag').eq(1))
        .updateMask(image.select('degrade_flag').eq(0));
};

var slopeMaskL2A = function (image) {
    return image.updateMask(slope.lt(30)); // Dùng slope từ phần 2
};

// Lọc dữ liệu theo thời gian và vùng
var gediL2AFiltered = gediL2A
    .filterDate(startDate, endDate)
    .filterBounds(geometry)
    .map(qualityMaskL2A)
    .map(slopeMaskL2A);

// Lấy hệ chiếu từ GEDI L2A
var gediL2AProjection = ee.Image(gediL2AFiltered.first()).select('rh100').projection();

// Tính trung bình chiều cao tán cây (rh100)
var gediCanopyHeight = gediL2AFiltered
    .select('rh100')
    .mosaic() // hoặc .mean() nếu muốn tính trung bình
    .rename('canopy_height')
    .setDefaultProjection(gediL2AProjection)
    .clip(geometry);

// Hiển thị kết quả Canopy Height
Map.addLayer(gediCanopyHeight, { min: 0, max: 50, palette: ['white', 'green', 'darkgreen'] }, 'GEDI Canopy Height', false);


// ------------------------------
// Phần 4: Xuất dữ liệu thành Assets
// ------------------------------
var exportPath = 'users/bonglantrungmuoi/gtb-full-data/'; // Đổi path
Export.image.toAsset({
    image: s2Composite.clip(geometry),
    description: 'gtb-full-data-S2_Composite_Export',
    assetId: exportPath + 'gtb-full-data-s2_composite',
    region: geometry,
    scale: 100,
    maxPixels: 1e10
});

Export.image.toAsset({
    image: demBands.clip(geometry),
    description: 'gtb-full-data-DEM_Bands_Export',
    assetId: exportPath + 'gtb-full-data-dem_bands',
    region: geometry,
    scale: 100,
    maxPixels: 1e10
});

Export.image.toAsset({
    image: gediMosaic.clip(geometry),
    description: 'gtb-full-data-GEDI_Mosaic_Export',
    assetId: exportPath + 'gtb-full-data-gedi_mosaic',
    region: geometry,
    scale: 100,
    maxPixels: 1e10
});

Export.image.toAsset({
    image: gediCanopyHeight,
    description: 'gtb-full-data-GEDI_Canopy_Height_Export',
    assetId: exportPath + 'gtb-full-data-gedi_canopy_height',
    region: geometry,
    scale: 100,
    maxPixels: 1e10
});

// ------------------------------
// Phần 5: Resampling & Huấn luyện mô hình hồi quy (Gradient Tree Boost) với Canopy Height
// ------------------------------

var s2Composite_asset = ee.Image(exportPath + 'gtb-full-data-s2_composite');
var demBands_asset = ee.Image(exportPath + 'gtb-full-data-dem_bands');
var gediMosaic_asset = ee.Image(exportPath + 'gtb-full-data-gedi_mosaic');
var canopyHeight_asset = ee.Image(exportPath + 'gtb-full-data-gedi_canopy_height');
var gridScale = 100;
var gridProjection = ee.Projection('EPSG:3857').atScale(gridScale);

var stacked = s2Composite_asset.addBands(demBands_asset).addBands(gediMosaic_asset).addBands(canopyHeight_asset);

stacked = stacked.resample('bilinear');

var stackedResampled = stacked.reduceResolution({
    reducer: ee.Reducer.mean(),
    maxPixels: 1024
}).reproject({
    crs: gridProjection
}).clip(geometry);

stackedResampled = stackedResampled.updateMask(stackedResampled.mask().gt(0));

var predictors = s2Composite_asset.bandNames().cat(demBands_asset.bandNames()).cat(canopyHeight_asset.bandNames());
var response = gediMosaic_asset.bandNames().get(0);
print('Predictors (bao gồm canopy height)', predictors);
print('Response variable', response);

var predictorImage = stackedResampled.select(predictors);
var responseImage = stackedResampled.select([response]);

var classMask = responseImage.mask().toInt().rename('class');

var numSamples = 1000;
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
print('Số đặc trưng được trích xuất', training.size());
print('Đặc trưng huấn luyện mẫu', training.first());

// Huấn luyện mô hình Gradient Tree Boost
var model = ee.Classifier.smileGradientTreeBoost(50) // Đổi mô hình
    .setOutputMode('REGRESSION')
    .train({
        features: training,
        classProperty: response,
        inputProperties: predictors
    });

var trainingPredictions = training.classify({
    classifier: model,
    outputName: 'agbd_predicted'
});

var calculateRmse = function (input) {
    var observed = ee.Array(input.aggregate_array(response));
    var predictions = ee.Array(input.aggregate_array('agbd_predicted'));
    var rmse = observed.subtract(predictions).pow(2)
        .reduce('mean', [0]).sqrt().get([0]);
    return rmse;
};
var rmse = calculateRmse(trainingPredictions);
print('RMSE', rmse);

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
print('R^2', r2);

var chart = ui.Chart.feature.byFeature({
    features: trainingPredictions.select([response, 'agbd_predicted']),
    xProperty: response,
    yProperties: ['agbd_predicted'],
}).setChartType('ScatterChart')
    .setOptions({
        title: 'Mật độ Biomass Trên mặt đất (Mg/Ha) - GTB Full', // Đổi title
        dataOpacity: 0.8,
        hAxis: { 'title': 'Quan sát' },
        vAxis: { 'title': 'Dự đoán' },
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
                labelInLegend: 'Đường phù hợp tuyến tính',
                visibleInLegend: true,
                showR2: true
            }
        },
        chartArea: { left: 100, bottom: 100, width: '50%' },
    });
print(chart);

var predictedImage = stackedResampled.classify({
    classifier: model,
    outputName: response
});

Export.image.toAsset({
    image: predictedImage.clip(geometry),
    description: 'gtb-full-data-Predicted_Image_Export',
    assetId: exportPath + 'gtb-full-data-predicted_agbd',
    region: geometry,
    scale: gridScale,
    maxPixels: 1e10
});

// ------------------------------
// Phần 6: Ước tính Tổng Biomass (AGB)
// ------------------------------
var s2Composite_for_agb = ee.Image(exportPath + 'gtb-full-data-s2_composite');
var predictedImage_for_agb = ee.Image(exportPath + 'gtb-full-data-predicted_agbd');
var gridProjection_for_agb = s2Composite_for_agb.projection();
var worldcover = ee.ImageCollection('ESA/WorldCover/v200').first();
var worldcoverResampled = worldcover.reduceResolution({
    reducer: ee.Reducer.mode(),
    maxPixels: 1024
}).reproject({
    crs: gridProjection_for_agb
});
var landCoverMask = worldcoverResampled.eq(10)
    .or(worldcoverResampled.eq(20))
    .or(worldcoverResampled.eq(30))
    .or(worldcoverResampled.eq(40))
    .or(worldcoverResampled.eq(95));
var predictedImageMasked = predictedImage_for_agb.updateMask(landCoverMask);
var pixelAreaHa = ee.Image.pixelArea().divide(10000);
var predictedAgb = predictedImageMasked.multiply(pixelAreaHa);
var stats = predictedAgb.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geometry,
    scale: 30,
    maxPixels: 1e10,
    tileScale: 16
});
var totalAgb = stats.getNumber(response);
print('Tổng AGB (Mg) - GTB Full', totalAgb); // Đổi print

// ------------------------------
// Phần 7: Đánh giá Độ quan trọng của Đặc trưng (Lọc hiển thị, Chuẩn hóa, Biểu đồ Tròn)
// ------------------------------

var fullImportanceDict = ee.Dictionary(model.explain().get('importance'));

var allFeatureNames = fullImportanceDict.keys();
var allImportanceFeatures = allFeatureNames.map(function (featureName) {
    var importanceValue = fullImportanceDict.get(featureName);
    return ee.Feature(null, {
        'feature': featureName,
        'importance': importanceValue
    });
});
var fullImportanceFC = ee.FeatureCollection(allImportanceFeatures);

var s2OriginalBandsToFilterOut = ee.List([
    'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12'
]);

var filteredImportanceFC = fullImportanceFC.filter(
    ee.Filter.inList('feature', s2OriginalBandsToFilterOut).not()
);

var filteredImportanceValuesList = ee.List(filteredImportanceFC.aggregate_array('importance'));
var sumOfFilteredImportances = ee.Number(0);
if (filteredImportanceValuesList.size().gt(0)) {
    sumOfFilteredImportances = ee.Number(filteredImportanceValuesList.reduce(ee.Reducer.sum()));
}

var normalizedAndFilteredFC = filteredImportanceFC.map(function (feature) {
    var originalImportance = ee.Number(feature.get('importance'));
    var normalizedImportance = ee.Number(0);
    if (sumOfFilteredImportances.gt(0)) {
        normalizedImportance = originalImportance.divide(sumOfFilteredImportances);
    }
    return feature.set('importance', normalizedImportance);
});

var sortedNormalizedAndFilteredFC = normalizedAndFilteredFC.sort('importance', false);

print('Độ quan trọng của Đặc trưng (Đã Lọc, Chuẩn hóa, Sắp xếp) - GTB Full:', sortedNormalizedAndFilteredFC); // Đổi print

if (sortedNormalizedAndFilteredFC.size().gt(0)) {
    var pieChartImportance = ui.Chart.feature.byFeature({
        features: sortedNormalizedAndFilteredFC,
        xProperty: 'feature',
        yProperties: ['importance']
    })
        .setChartType('PieChart')
        .setOptions({
            title: 'Tỷ lệ Độ quan trọng của Đặc trưng (Chuẩn hóa, Lọc hiển thị) - GTB Full', // Đổi title
            legend: { position: 'right' },
            pieSliceText: 'percentage',
        });

    print('Biểu đồ Tròn Độ quan trọng của Đặc trưng (Đã Lọc và Chuẩn hóa) - GTB Full:', pieChartImportance); // Đổi print
} else {
    print('Không có dữ liệu đặc trưng để vẽ biểu đồ sau khi lọc.');
}

// Ghi chú quan trọng:
// - Mô hình của bạn vẫn được huấn luyện với CẢ các kênh phổ gốc và các chỉ số.
// - Các điểm "importance" hiển thị ở đây cho các chỉ số đã được chuẩn hóa để tổng của chúng
//   (trong nhóm các đặc trưng đã lọc) bằng 1.
// - Biểu đồ tròn thể hiện tốt nhất khi số lượng các phần (đặc trưng) không quá nhiều.
//   Nếu có quá nhiều đặc trưng, biểu đồ có thể trở nên khó đọc.

// ------------------------------
// Phần 8: Xuất CSV tổng hợp
// ------------------------------

// Metadata
var scriptNameVal = 'gtb-full-data'; // JS string
var modelTypeVal = 'GradientTreeBoost'; // JS string
var datasetTypeVal = 'Full'; // JS string

// Create a list to hold all summary features
var summaryFeaturesList = ee.List([]);

// Configuration Data
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
    'category': 'Configuration', 'item': 'ResponseBand', 'value': response // response is an ee.String
}));

// Performance Metrics
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

// Feature Importances (from sortedNormalizedAndFilteredFC)
var importanceMapped = sortedNormalizedAndFilteredFC.map(function (f) {
    return ee.Feature(null, {
        'script_name': scriptNameVal,
        'model_type': modelTypeVal,
        'dataset_type': datasetTypeVal,
        'category': 'FeatureImportance_NormalizedFiltered',
        'item': f.get('feature'), // feature name
        'value': f.get('importance') // importance score
    });
});

// Convert summaryFeaturesList to FeatureCollection and merge with importanceMapped (which is already an FC)
var summaryFCBase = ee.FeatureCollection(summaryFeaturesList);
var finalSummaryFC = summaryFCBase.merge(importanceMapped);

// Export to CSV
var csvExportDescription = scriptNameVal + '_summary_export';
var csvFileName = scriptNameVal + '_summary';

Export.table.toDrive({
    collection: finalSummaryFC,
    description: csvExportDescription,
    fileNamePrefix: csvFileName,
    fileFormat: 'CSV',
    selectors: ['script_name', 'model_type', 'dataset_type', 'category', 'item', 'value']
});