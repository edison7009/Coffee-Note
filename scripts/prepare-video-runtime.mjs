import { createRequire } from 'node:module';
import { chmod, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const triples = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
};
const key = `${process.platform}-${process.arch}`;
const triple = triples[key];
if (!triple) throw new Error(`TierNote Video does not support the ${key} build target yet.`);

const extension = process.platform === 'win32' ? '.exe' : '';
const destination = path.join(
  root,
  'src-tauri',
  'binaries',
  `tiernote-video-ffmpeg-${triple}${extension}`,
);
await mkdir(path.dirname(destination), { recursive: true });
await copyFile(ffmpeg.path, destination);
if (process.platform !== 'win32') await chmod(destination, 0o755);
console.log(`Prepared TierNote Video encoder: ${path.relative(root, destination)}`);
