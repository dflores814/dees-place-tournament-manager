const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('metro-resolver');

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;
const nativeBarcodeDetectorShim = path.resolve(__dirname, 'src/shims/barcode-detector.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'barcode-detector' && platform !== 'web') {
    return {
      type: 'sourceFile',
      filePath: nativeBarcodeDetectorShim,
    };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return resolve(context, moduleName, platform);
};

module.exports = config;
