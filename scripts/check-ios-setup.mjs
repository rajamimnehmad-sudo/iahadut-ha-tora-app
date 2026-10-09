import {existsSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const native = path.join(root, 'ios/App');
const project = readFileSync(path.join(native, 'App.xcodeproj/project.pbxproj'), 'utf8');
const packageSwift = readFileSync(path.join(native, 'CapApp-SPM/Package.swift'), 'utf8');
const {version} = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const blockers = [];
const simulatorBlockers = [];
const errors = [];
for (const file of ['App/Info.plist', 'App/App.entitlements', 'App/PrivacyInfo.xcprivacy', 'App/IahadutBridgeViewController.swift', 'App/PushHistoryPlugin.swift', 'App/PushHistoryStore.swift', 'NotificationService/NotificationService.swift', 'NotificationService/Info.plist', 'NotificationService/NotificationService.entitlements', 'App/public/index.html']) {
  if (!existsSync(path.join(native, file))) errors.push(`Falta ${file}; ejecutar npm run prepare:ios.`);
}
for (const [, dependency] of packageSwift.matchAll(/path: "([^"]+)"/g)) {
  if (!existsSync(path.join(native, 'CapApp-SPM', dependency, 'Package.swift'))) errors.push(`Dependencia SPM ausente: ${dependency}.`);
}
const versions = [...project.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(match => match[1].replaceAll('"', ''));
if (!versions.length || versions.some(value => value !== version)) errors.push('La app y su extensión deben compartir la versión de package.json.');
const android = readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
const expectedBuild = android.match(/\bversionCode\s+(\d+)/)?.[1];
const builds = [...project.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(match => match[1].replaceAll('"', ''));
if (!expectedBuild || builds.length !== 4 || builds.some(value => value !== expectedBuild)) errors.push('La app iOS y su extensión deben compartir el build de Android; ejecutar npm run prepare:ios.');
if (!packageSwift.includes('AnalyticsWithoutAdIdSupport')) errors.push('La configuración SPM no desactivó el soporte de identificador publicitario.');
const firebasePath = path.join(native, 'App/GoogleService-Info.plist');
if (!existsSync(firebasePath)) simulatorBlockers.push('Descargar el GoogleService-Info.plist oficial de la app iOS ar.vaad.catalogo.app en Firebase y guardarlo en ios/App/App/. Los plugins Firebase necesitan ese archivo para iniciar.');
else {
  for (const [key, expected] of Object.entries({BUNDLE_ID:'ar.vaad.catalogo.app', PROJECT_ID:'iahadut-hatora', GOOGLE_APP_ID:'1:705952373371:ios:0b69e3f1c3651860f520de'})) {
    const result = spawnSync('plutil', ['-extract', key, 'raw', '-o', '-', firebasePath], {encoding:'utf8'});
    if (result.status !== 0 || result.stdout.trim() !== expected) errors.push(`GoogleService-Info.plist tiene un ${key} incorrecto para esta app.`);
  }
}
const xcode = spawnSync('xcodebuild', ['-version'], {encoding:'utf8'});
if (xcode.status !== 0) simulatorBlockers.push('Instalar y seleccionar Xcode completo en un disco con espacio suficiente.');
blockers.push(...simulatorBlockers);
const teams = [...project.matchAll(/DEVELOPMENT_TEAM = ([A-Z0-9]+);/g)].map(match => match[1]);
if (teams.length !== 4 || new Set(teams).size !== 1) blockers.push('Seleccionar el mismo equipo Apple Developer en Debug y Release de la app y su extensión.');
blockers.push('Verificar la entrega APNs y probar notificaciones, red, cámara, offline y firma en un iPhone real.');
console.log(JSON.stringify({version, sourceErrors:errors, simulatorBuildBlockers:simulatorBlockers, deviceBuildBlockers:blockers, nativeBuildVerified:null, nativeBuildVerification:'Este comando revisa la configuración; no ejecuta ni verifica una compilación nativa.'}, null, 2));
if (errors.length || (process.argv.includes('--require-device') && blockers.length) ||
    (process.argv.includes('--require-simulator') && simulatorBlockers.length)) process.exitCode = 1;
