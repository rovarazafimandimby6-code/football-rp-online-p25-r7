import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('P27 stade : les filets animés utilisent un buffer dynamique sans recalculer les normales', async () => {
  const field = await readFile(path.join(root, 'src/field.js'), 'utf8');
  assert.match(field, /backNetGeo\.attributes\.position\.setUsage\(THREE\.DynamicDrawUsage\)/);
  assert.match(field, /const netMat = this\.netMaterial \|\|/);
  assert.match(field, /MeshBasicMaterial\(\{[\s\S]*?map: createNetTexture\(\)/);
  assert.doesNotMatch(field, /computeVertexNormals\(\)/);
  assert.match(field, /attr\.setZ\(i, panel\.base\[i \* 3 \+ 2\] \+ wave\)/);
  assert.match(field, /attr\.array\.set\(panel\.base\)/);
});
