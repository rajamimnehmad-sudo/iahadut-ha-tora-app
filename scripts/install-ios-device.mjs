import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args) => {
  const result = spawnSync(command, args, {cwd:root, stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const args = process.argv.slice(2);
const legacy = args.includes('--legacy');
const deviceArgs = args.filter(arg => arg !== '--legacy');
if (!args.length || (args.length === 1 && args[0] === '--list')) {
  run('xcrun', ['devicectl', 'list', 'devices']);
  // xctrace lists the hardware UDID used by Xcode's destination selector;
  // devicectl's default Identifier column can instead be a CoreDevice UUID.
  run('xcrun', ['xctrace', 'list', 'devices']);
  console.log('Conectá y desbloqueá el iPhone, aceptá Confiar y activá Modo de desarrollador.');
  console.log('Luego: npm run install:ios:device -- <UDID>');
  process.exit(0);
}
if (deviceArgs.length !== 1 || !/^[A-Fa-f0-9-]{20,40}$/.test(deviceArgs[0]) || args.length !== deviceArgs.length + Number(legacy)) {
  console.error('Indicá un único UDID de iPhone, con --legacy para iOS 15/16. Para consultar dispositivos: npm run install:ios:device -- --list');
  process.exit(1);
}
const udid = deviceArgs[0];
// CoreDevice/devicectl installs to iOS 17+. Older phones use MobileDevice.
// Check the required helper before spending time compiling the app.
if (legacy) run('ios-deploy', ['--version']);
run(process.execPath, ['scripts/prepare-ios.mjs', '--all', '--require-simulator']);
// The device must be registered in the developer team before its development
// provisioning profiles can be issued. This signs locally and never uploads.
run('xcodebuild', [
  '-project', 'ios/App/App.xcodeproj', '-scheme', 'App',
  '-configuration', 'Debug', '-destination', `platform=iOS,id=${udid}`,
  '-jobs', '2', '-derivedDataPath', 'build/ios-simulator',
  '-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration', 'build'
]);
const appBundle = path.join(root, 'build/ios-simulator/Build/Products/Debug-iphoneos/App.app');
if (legacy) {
  // Installation works without the older OS's debugger Symbols directory.
  // Do not turn a successful install into a failure by starting legacy LLDB.
  run('ios-deploy', ['--id', udid, '--bundle', appBundle, '--timeout', '30']);
  console.log('Abrí Iahadut HaTora tocando su icono en el iPhone. La instalación no requiere los símbolos de depuración de iOS 15/16.');
} else {
  run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', udid, appBundle]);
  run('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', udid, 'ar.vaad.catalogo.app']);
}
console.log('App de desarrollo instalada. Verificá funciones reales; esto no distribuye por TestFlight ni comprueba APNs de producción.');
