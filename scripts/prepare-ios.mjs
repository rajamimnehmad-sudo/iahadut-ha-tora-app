import {readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allPlatforms = process.argv.includes('--all');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('iPhone requiere Node 22 o superior.');
const {version} = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const android = readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
const androidVersion = android.match(/\bversionName\s+"([^"]+)"/)?.[1];
const buildNumber = android.match(/\bversionCode\s+(\d+)/)?.[1];
if (androidVersion !== version || !buildNumber) throw new Error('La versión de Android debe coincidir con package.json y tener un versionCode válido.');
for (const [command, args] of [[process.execPath, ['scripts/import-ios-firebase.mjs', '--if-available']], ['npm', ['run', 'build']], ['npx', ['--no-install', 'cap', 'sync', ...(allPlatforms ? [] : ['ios'])]]]) {
  const result = spawnSync(command, args, {cwd:root, stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const projectPath = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
const source = readFileSync(projectPath, 'utf8');
const updated = source.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`);
if (updated !== source) writeFileSync(projectPath, updated);
const check = spawnSync(process.execPath, ['scripts/check-ios-setup.mjs', ...process.argv.slice(2)], {cwd:root, stdio:'inherit'});
if (check.error) throw check.error;
process.exit(check.status ?? 1);
