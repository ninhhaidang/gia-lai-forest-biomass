var assetPath = 'users/bonglantrungmuoi/gtb-full-data/';
var assetList = ee.data.getList({ id: assetPath });
assetList.forEach(function (asset) {
    ee.data.deleteAsset(asset.id);
    print('Deleted: ' + asset.id);
});