import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = join(root, '..', 'assets');
const destination = join(root, '..', 'dist', 'assets');
const manifest = join(root, '..', 'manifest.webmanifest');
const manifestDestination = join(root, '..', 'dist', 'manifest.webmanifest');
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
await cp(manifest, manifestDestination, { force: true });
console.log('P27 static 3D assets and fullscreen landscape manifest copied into dist.');
