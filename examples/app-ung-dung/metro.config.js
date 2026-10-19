// Metro đọc thư viện trong packages/ (hugo-music, hugo-stream) từ mã nguồn, không cần build trước.
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const packagesDir = path.resolve(__dirname, '../../packages');
const sources = Object.fromEntries(fs.readdirSync(packagesDir).flatMap((dir) => {
  const file = path.join(packagesDir, dir, 'package.json');
  if (!fs.existsSync(file)) return [];
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entry = pkg['react-native'] ?? pkg.main;
  return entry ? [[pkg.name, path.join(packagesDir, dir, entry)]] : [];
}));

const config = getDefaultConfig(__dirname);
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) =>
  sources[moduleName]
    ? { type: 'sourceFile', filePath: sources[moduleName] }
    : (resolve ?? context.resolveRequest)(context, moduleName, platform);

module.exports = config;
