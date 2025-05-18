// ------------------------------
// Phần 1: Xử lý dữ liệu Sentinel-2 (Phiên bản Mini)
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

// Hàm tính toán các chỉ số quang học (Phiên bản Mini - loại bỏ một số chỉ số)
var addIndicesMini = function (image) {
    var ndvi = image.normalizedDifference(['B8', 'B4']).rename('ndvi');
    var mndwi = image.normalizedDifference(['B3', 'B11']).rename('mndwi');
    var ndbi = image.normalizedDifference(['B11', 'B8']).rename('ndbi');
    // EVI, BSI, SAVI, ARVI, NDRE2 đã bị loại bỏ

    var gci = image.expression(
        '(NIR / GREEN) - 1', {
        'NIR': image.select('B8'),
        'GREEN': image.select('B3')
    }).rename('gci');

    var ndmi = image.normalizedDifference(['B8', 'B11']).rename('ndmi');

    var cire = image.expression(
        '(REDEDGE - RED) / RED', {
        'REDEDGE': image.select('B5'),
        'RED': image.select('B4')
    }).rename('cire');

    var ndre1 = image.normalizedDifference(['B8', 'B5']).rename('ndre1'); // (NIR - RedEdge1) / (NIR + RedEdge1)

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

    return image.addBands([ndvi, mndwi, ndbi, gci, ndmi, cire, ndre1, mtci, s2rep]);
};


// Áp dụng các bước tiền xử lý
var s2ProcessedMini = filteredS2WithCs
    .map(maskLowQA)
    .select('B.*')
    .map(scaleBands)
    .map(addIndicesMini); // Sử dụng hàm addIndicesMini

// Tạo ảnh composite Sentinel-2 và cắt theo geometry
var s2CompositeMini = s2ProcessedMini.median()
    .setDefaultProjection(s2Projection)
    .clip(geometry);

// ------------------------------
// Hiển thị các chỉ số riêng lẻ (Phiên bản Mini)
// ------------------------------

// Thiết lập tham số hiển thị cơ bản cho các chỉ số (có thể cần điều chỉnh)
var visParams_ndvi_mini = { min: -0.1, max: 0.9, palette: ['red', 'yellow', 'green'] };
var visParams_mndwi_mini = { min: -1, max: 1, palette: ['0500ff', '0097ff', '00ffc1', 'ff0000'] };
var visParams_ndbi_mini = { min: -1, max: 1, palette: ['0000ff', '00ff00', 'ff0000'] };
var visParams_gci_mini = { min: -0.5, max: 2, palette: ['red', 'yellow', 'green'] };
var visParams_ndmi_mini = { min: 0, max: 1, palette: ['ff0000', 'ffff00', '00ffff', '0000ff'] };
var visParams_cire_mini = { min: -0.5, max: 1, palette: ['red', 'yellow', 'green'] };
var visParams_ndre1_mini = { min: -0.2, max: 0.8, palette: ['#FF0000', '#FFFF00', '#008000'] };
var visParams_mtci_mini = { min: 0, max: 5, palette: ['#F0E68C', '#9ACD32', '#32CD32', '#228B22'] };
var visParams_s2rep_mini = { min: 700, max: 750, palette: ['#0000FF', '#00FFFF', '#FFFF00', '#FF0000'] };

// Thêm các lớp chỉ số vào bản đồ (Phiên bản Mini)
Map.addLayer(s2CompositeMini.select('ndvi'), visParams_ndvi_mini, 'NDVI (Mini)');
Map.addLayer(s2CompositeMini.select('mndwi'), visParams_mndwi_mini, 'MNDWI (Mini)', false);
Map.addLayer(s2CompositeMini.select('ndbi'), visParams_ndbi_mini, 'NDBI (Mini)', false);
Map.addLayer(s2CompositeMini.select('gci'), visParams_gci_mini, 'GCI (Mini)', false);
Map.addLayer(s2CompositeMini.select('ndmi'), visParams_ndmi_mini, 'NDMI (Mini)', false);
Map.addLayer(s2CompositeMini.select('cire'), visParams_cire_mini, 'CIRE (Mini)', false);
Map.addLayer(s2CompositeMini.select('ndre1'), visParams_ndre1_mini, 'NDRE1 (Mini)', false);
Map.addLayer(s2CompositeMini.select('mtci'), visParams_mtci_mini, 'MTCI (Mini)', false);
Map.addLayer(s2CompositeMini.select('s2rep'), visParams_s2rep_mini, 'S2REP (Mini)', false);

// Hiển thị composite với các kênh quang học cơ bản (RGB)
Map.addLayer(s2CompositeMini, { bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3 }, 'Sentinel-2 Composite (Mini)', false);

// ------------------------------
// Phần 2: Xử lý DEM và Tính độ dốc (Sử dụng GLO-30) - Giống bản Full
// ------------------------------
var glo30 = ee.ImageCollection('COPERNICUS/DEM/GLO30');
var glo30Filtered = glo30.filter(ee.Filter.bounds(geometry))
    .select('DEM');
var demProj = glo30Filtered.first().select(0).projection();
var elevation = glo30Filtered.mosaic().rename('dem')
    .setDefaultProjection(demProj)
    .clip(geometry);
var slope = ee.Terrain.slope(elevation).rename('slope')
    .setDefaultProjection(demProj)
    .clip(geometry);
var demBands = elevation.addBands(slope);
var elevationVis = {
    min: 0,
    max: 3000,
    palette: ['0000ff', '00ffff', 'ffff00', 'ff0000', 'ffffff'],
};
Map.addLayer(elevation, elevationVis, 'Độ cao GLO-30 (Mini)', false);
var slopeVis = {
    min: 0,
    max: 60,
    palette: ['white', 'gray', 'black'],
};
Map.addLayer(slope, slopeVis, 'Độ dốc GLO-30 (Mini)', false);
Map.centerObject(geometry, 8);

// ------------------------------
// Phần 3: Xử lý dữ liệu GEDI L4A - Giống bản Full
// ------------------------------
var gedi = ee.ImageCollection("LARSE/GEDI/GEDI04_A_002_MONTHLY");
var qualityMask = function (image) {
    return image.updateMask(image.select('l4_quality_flag').eq(1))
        .updateMask(image.select('degrade_flag').eq(0));
};
var errorMask = function (image) {
    var relative_se = image.select('agbd_se')
        .divide(image.select('agbd'));
    return image.updateMask(relative_se.lte(0.3));
};
var slopeMask = function (image) {
    return image.updateMask(slope.lt(30));
};
var gediFiltered = gedi.filter(ee.Filter.date(startDate, endDate))
    .filter(ee.Filter.bounds(geometry));
var gediProjection = ee.Image(gediFiltered.first())
    .select('agbd').projection();
var gediProcessed = gediFiltered
    .map(qualityMask)
    .map(errorMask)
    .map(slopeMask);
var gediMosaic = gediProcessed.mosaic()
    .select('agbd')
    .setDefaultProjection(gediProjection)
    .clip(geometry);
Map.addLayer(gediMosaic, { min: 0, max: 100, palette: ['blue', 'green', 'yellow', 'red'] }, 'GEDI Biomass Density (Mini)', false);

// ------------------------------
// Phần 3.1: Xử lý dữ liệu GEDI L2A - Canopy Height - Giống bản Full
// ------------------------------
var gediL2A = ee.ImageCollection("LARSE/GEDI/GEDI02_A_002_MONTHLY");
var qualityMaskL2A = function (image) {
    return image.updateMask(image.select('quality_flag').eq(1))
        .updateMask(image.select('degrade_flag').eq(0));
};
var slopeMaskL2A = function (image) {
    return image.updateMask(slope.lt(30));
};
var gediL2AFiltered = gediL2A
    .filterDate(startDate, endDate)
    .filterBounds(geometry)
    .map(qualityMaskL2A)
    .map(slopeMaskL2A);
var gediL2AProjection = ee.Image(gediL2AFiltered.first()).select('rh100').projection();
var gediCanopyHeight = gediL2AFiltered
    .select('rh100')
    .mosaic()
    .rename('canopy_height')
    .setDefaultProjection(gediL2AProjection)
    .clip(geometry);
Map.addLayer(gediCanopyHeight, { min: 0, max: 50, palette: ['white', 'green', 'darkgreen'] }, 'GEDI Canopy Height (Mini)', false);

// ------------------------------
// Phần 4: Xuất dữ liệu thành Assets (Phiên bản Mini)
// ------------------------------
var exportPathMini = 'users/bonglantrungmuoi/gtb-mini-data/'; // Đổi path
Export.image.toAsset({
    image: s2CompositeMini.clip(geometry),
    description: 'gtb-mini-data-S2_Composite_Export_Mini',
    assetId: exportPathMini + 'gtb-mini-data-s2_composite_mini',
    region: geometry,
    scale: 100,
    maxPixels: 1e10
});
Export.image.toAsset({
    image: demBands.clip(geometry), // Giữ nguyên demBands
    description: 'gtb-mini-data-DEM_Bands_Export_Mini',
    assetId: exportPathMini + 'gtb-mini-data-dem_bands_mini',
    region: geometry,
    scale: 100,
    maxPixels: 1e10
});
Export.image.toAsset({
    image: gediMosaic.clip(geometry), // Giữ nguyên gediMosaic
    description: 'gtb-mini-data-GEDI_Mosaic_Export_Mini',
    assetId: exportPathMini + 'gtb-mini-data-gedi_mosaic_mini',
    region: geometry,
    scale: 100,
    maxPixels: 1e10
});
Export.image.toAsset({
    image: gediCanopyHeight, // Giữ nguyên gediCanopyHeight
    description: 'gtb-mini-data-GEDI_Canopy_Height_Export_Mini',
    assetId: exportPathMini + 'gtb-mini-data-gedi_canopy_height_mini',
    region: geometry,
    scale: 100,
    maxPixels: 1e10
});

// ------------------------------
// Phần 5: Resampling & Huấn luyện mô hình hồi quy (Gradient Tree Boost) với Canopy Height (Phiên bản Mini)
// ------------------------------
var s2Composite_asset_mini = ee.Image(exportPathMini + 'gtb-mini-data-s2_composite_mini');
var demBands_asset_mini = ee.Image(exportPathMini + 'gtb-mini-data-dem_bands_mini');
var gediMosaic_asset_mini = ee.Image(exportPathMini + 'gtb-mini-data-gedi_mosaic_mini');
var canopyHeight_asset_mini = ee.Image(exportPathMini + 'gtb-mini-data-gedi_canopy_height_mini');
var gridScale = 100;
var gridProjection = ee.Projection('EPSG:3857').atScale(gridScale);

var stacked_mini = s2Composite_asset_mini.addBands(demBands_asset_mini).addBands(gediMosaic_asset_mini).addBands(canopyHeight_asset_mini);
stacked_mini = stacked_mini.resample('bilinear');
var stackedResampled_mini = stacked_mini.reduceResolution({
    reducer: ee.Reducer.mean(),
    maxPixels: 1024
}).reproject({
    crs: gridProjection
}).clip(geometry);
stackedResampled_mini = stackedResampled_mini.updateMask(stackedResampled_mini.mask().gt(0));

// predictors_mini sẽ chỉ bao gồm các chỉ số đã chọn trong addIndicesMini
var predictors_mini = s2Composite_asset_mini.bandNames().cat(demBands_asset_mini.bandNames()).cat(canopyHeight_asset_mini.bandNames());
var response_mini = gediMosaic_asset_mini.bandNames().get(0);
print('Predictors (Mini - bao gồm canopy height)', predictors_mini);
print('Response variable (Mini)', response_mini);

var predictorImage_mini = stackedResampled_mini.select(predictors_mini);
var responseImage_mini = stackedResampled_mini.select([response_mini]);
var classMask_mini = responseImage_mini.mask().toInt().rename('class');

var numSamples = 1000;
var training_mini = stackedResampled_mini.addBands(classMask_mini)
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
print('Số đặc trưng được trích xuất (Mini)', training_mini.size());
print('Đặc trưng huấn luyện mẫu (Mini)', training_mini.first());

// Huấn luyện mô hình Gradient Tree Boost (Phiên bản Mini)
var model_mini = ee.Classifier.smileGradientTreeBoost(50) // Đổi mô hình
    .setOutputMode('REGRESSION')
    .train({
        features: training_mini,
        classProperty: response_mini,
        inputProperties: predictors_mini
    });

var trainingPredictions_mini = training_mini.classify({
    classifier: model_mini,
    outputName: 'agbd_predicted'
});

var calculateRmse_mini = function (input) {
    var observed = ee.Array(input.aggregate_array(response_mini));
    var predictions = ee.Array(input.aggregate_array('agbd_predicted'));
    var rmse = observed.subtract(predictions).pow(2)
        .reduce('mean', [0]).sqrt().get([0]);
    return rmse;
};
var rmse_mini = calculateRmse_mini(trainingPredictions_mini);
print('RMSE (Mini)', rmse_mini);

var calculateR2_mini = function (input) {
    var observed = ee.Array(input.aggregate_array(response_mini));
    var predictions = ee.Array(input.aggregate_array('agbd_predicted'));
    var meanObserved = observed.reduce('mean', [0]).get([0]);
    var ssr = observed.subtract(predictions).pow(2).reduce('sum', [0]).get([0]);
    var sst = observed.subtract(meanObserved).pow(2).reduce('sum', [0]).get([0]);
    var r2 = ee.Number(1).subtract(ee.Number(ssr).divide(sst));
    return r2;
};
var r2_mini = calculateR2_mini(trainingPredictions_mini);
print('R^2 (Mini)', r2_mini);

var chart_mini = ui.Chart.feature.byFeature({
    features: trainingPredictions_mini.select([response_mini, 'agbd_predicted']),
    xProperty: response_mini,
    yProperties: ['agbd_predicted'],
}).setChartType('ScatterChart')
    .setOptions({
        title: 'Mật độ Biomass Trên mặt đất (Mg/Ha) - GTB Mini', // Đổi title
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
print(chart_mini);

var predictedImage_mini = stackedResampled_mini.classify({
    classifier: model_mini,
    outputName: response_mini
});

Export.image.toAsset({
    image: predictedImage_mini.clip(geometry),
    description: 'gtb-mini-data-Predicted_Image_Export_Mini',
    assetId: exportPathMini + 'gtb-mini-data-predicted_agbd_mini',
    region: geometry,
    scale: gridScale,
    maxPixels: 1e10
});

// ------------------------------
// Phần 6: Ước tính Tổng Biomass (AGB) (Phiên bản Mini)
// ------------------------------
var s2Composite_for_agb_mini = ee.Image(exportPathMini + 'gtb-mini-data-s2_composite_mini');
var predictedImage_for_agb_mini = ee.Image(exportPathMini + 'gtb-mini-data-predicted_agbd_mini');
var gridProjection_for_agb_mini = s2Composite_for_agb_mini.projection();
var worldcover = ee.ImageCollection('ESA/WorldCover/v200').first();
var worldcoverResampled = worldcover.reduceResolution({
    reducer: ee.Reducer.mode(),
    maxPixels: 1024
}).reproject({
    crs: gridProjection_for_agb_mini
});
var landCoverMask = worldcoverResampled.eq(10)
    .or(worldcoverResampled.eq(20))
    .or(worldcoverResampled.eq(30))
    .or(worldcoverResampled.eq(40))
    .or(worldcoverResampled.eq(95));
var predictedImageMasked_mini = predictedImage_for_agb_mini.updateMask(landCoverMask);
var pixelAreaHa = ee.Image.pixelArea().divide(10000);
var predictedAgb_mini = predictedImageMasked_mini.multiply(pixelAreaHa);
var stats_mini = predictedAgb_mini.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geometry,
    scale: 30,
    maxPixels: 1e10,
    tileScale: 16
});
var totalAgb_mini = stats_mini.getNumber(response_mini);
print('Tổng AGB (Mg) - GTB Mini', totalAgb_mini); // Đổi print

// ------------------------------
// Phần 7: Đánh giá Độ quan trọng của Đặc trưng (Phiên bản Mini)
// ------------------------------
var fullImportanceDict_mini = ee.Dictionary(model_mini.explain().get('importance'));
var allFeatureNames_mini = fullImportanceDict_mini.keys();
var allImportanceFeatures_mini = allFeatureNames_mini.map(function (featureName) {
    var importanceValue = fullImportanceDict_mini.get(featureName);
    return ee.Feature(null, {
        'feature': featureName,
        'importance': importanceValue
    });
});
var fullImportanceFC_mini = ee.FeatureCollection(allImportanceFeatures_mini);

// Trong phiên bản mini, chúng ta đã loại bỏ các chỉ số không mong muốn
// nên không cần lọc s2OriginalBandsToFilterOut nữa.
// Tuy nhiên, chúng ta vẫn có thể muốn lọc các kênh S2 gốc nếu chúng vẫn còn trong predictors.
var s2OriginalBandsToFilterOut_mini = ee.List([
    'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12'
]);

var filteredImportanceFC_mini = fullImportanceFC_mini.filter(
    ee.Filter.inList('feature', s2OriginalBandsToFilterOut_mini).not()
);

var filteredImportanceValuesList_mini = ee.List(filteredImportanceFC_mini.aggregate_array('importance'));
var sumOfFilteredImportances_mini = ee.Number(0);
if (filteredImportanceValuesList_mini.size().gt(0)) {
    sumOfFilteredImportances_mini = ee.Number(filteredImportanceValuesList_mini.reduce(ee.Reducer.sum()));
}

var normalizedAndFilteredFC_mini = filteredImportanceFC_mini.map(function (feature) {
    var originalImportance = ee.Number(feature.get('importance'));
    var normalizedImportance = ee.Number(0);
    if (sumOfFilteredImportances_mini.gt(0)) {
        normalizedImportance = originalImportance.divide(sumOfFilteredImportances_mini);
    }
    return feature.set('importance', normalizedImportance);
});

var sortedNormalizedAndFilteredFC_mini = normalizedAndFilteredFC_mini.sort('importance', false);

print('Độ quan trọng của Đặc trưng (Mini - Đã Lọc, Chuẩn hóa, Sắp xếp) - GTB Mini:', sortedNormalizedAndFilteredFC_mini); // Đổi print

if (sortedNormalizedAndFilteredFC_mini.size().gt(0)) {
    var pieChartImportance_mini = ui.Chart.feature.byFeature({
        features: sortedNormalizedAndFilteredFC_mini,
        xProperty: 'feature',
        yProperties: ['importance']
    })
        .setChartType('PieChart')
        .setOptions({
            title: 'Tỷ lệ Độ quan trọng của Đặc trưng (Mini - Chuẩn hóa, Lọc hiển thị) - GTB Mini', // Đổi title
            legend: { position: 'right' },
            pieSliceText: 'percentage',
        });
    print('Biểu đồ Tròn Độ quan trọng của Đặc trưng (Mini - Đã Lọc và Chuẩn hóa) - GTB Mini:', pieChartImportance_mini); // Đổi print
} else {
    print('Không có dữ liệu đặc trưng để vẽ biểu đồ sau khi lọc (Mini).');
}

// ------------------------------
// Phần 8: Xuất CSV tổng hợp
// ------------------------------

// Metadata
var scriptNameVal = 'gtb-mini-data'; // JS string
var modelTypeVal = 'GradientTreeBoost'; // JS string
var datasetTypeVal = 'Mini'; // JS string

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
    'category': 'Configuration', 'item': 'PredictorBands', 'value': predictors_mini.join(', ')
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'Configuration', 'item': 'ResponseBand', 'value': response_mini // response_mini is an ee.String
}));

// Performance Metrics
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'PerformanceMetric', 'item': 'RMSE', 'value': rmse_mini
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'PerformanceMetric', 'item': 'R2', 'value': r2_mini
}));
summaryFeaturesList = summaryFeaturesList.add(ee.Feature(null, {
    'script_name': scriptNameVal, 'model_type': modelTypeVal, 'dataset_type': datasetTypeVal,
    'category': 'PerformanceMetric', 'item': 'TotalAGB_Mg', 'value': totalAgb_mini
}));

// Feature Importances (from sortedNormalizedAndFilteredFC_mini)
var importanceMapped = sortedNormalizedAndFilteredFC_mini.map(function (f) {
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