import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const activity = fs.readFileSync(new URL('../android/app/src/main/java/ar/vaad/catalogo/app/MainActivity.java', import.meta.url), 'utf8');

test('La navegación de Android queda visible y sin modo inmersivo', () => {
  assert.match(activity, /controller\.show\(WindowInsetsCompat\.Type\.navigationBars\(\)\)/);
  assert.doesNotMatch(activity, /controller\.hide\(/);
  assert.match(activity, /& ~\(View\.SYSTEM_UI_FLAG_HIDE_NAVIGATION/);
  assert.match(activity, /controller\.setAppearanceLightNavigationBars\(true\)/);
  assert.match(activity, /WindowCompat\.setDecorFitsSystemWindows\(getWindow\(\), true\)/);
});
