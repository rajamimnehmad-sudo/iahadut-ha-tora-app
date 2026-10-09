import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args) => {
  const result = spawnSync(command, args, {cwd:root, stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
// Fail before preparing assets if only Command Line Tools are installed.
run('xcodebuild', ['-version']);
run(process.execPath, ['scripts/prepare-ios.mjs', '--all', '--require-simulator']);
const devices = spawnSync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], {encoding:'utf8'});
if (devices.error) throw devices.error;
if (devices.status !== 0) throw new Error('No se pudo consultar el simulador de iPhone.');
const booted = Object.values(JSON.parse(devices.stdout).devices).flat()
  .filter(device => device.state === 'Booted');
const destination = booted.length === 1
  ? `platform=iOS Simulator,id=${booted[0].udid}`
  : 'generic/platform=iOS Simulator';
run('xcodebuild', [
  '-project', 'ios/App/App.xcodeproj', '-scheme', 'App',
  '-configuration', 'Debug', '-sdk', 'iphonesimulator',
  '-destination', destination, '-jobs', '2',
  '-derivedDataPath', process.env.IAHADUT_IOS_DERIVED_DATA || path.join(root, 'build/ios-simulator'),
  `ARCHS=${process.arch === 'arm64' ? 'arm64' : 'x86_64'}`,
  'CODE_SIGNING_ALLOWED=NO', 'build'
]);
