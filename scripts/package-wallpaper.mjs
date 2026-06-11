import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'build');
const distDir = path.join(root, 'dist');
const zipPath = path.join(distDir, 'pond-patrol-wallpaper.zip');

const requiredBuildFiles = [
  'index.html',
  'preview.jpg',
  'project.json',
];

async function requireFile(filePath) {
  const info = await stat(filePath);
  if (!info.isFile() || info.size <= 0) {
    throw new Error(`${path.relative(root, filePath)} is missing or empty`);
  }
}

await Promise.all(requiredBuildFiles.map(file => requireFile(path.join(buildDir, file))));
await mkdir(distDir, { recursive: true });
await rm(zipPath, { force: true });

const output = createWriteStream(zipPath);
const archive = new ZipArchive({
  zlib: { level: 9 },
});

const done = new Promise((resolve, reject) => {
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);
  archive.on('warning', error => {
    if (error.code === 'ENOENT') {
      console.warn(error.message);
    } else {
      reject(error);
    }
  });
});

archive.pipe(output);
archive.directory(buildDir, false);
await archive.finalize();
await done;

const zipInfo = await stat(zipPath);
console.log(JSON.stringify({
  bytes: zipInfo.size,
  file: path.relative(root, zipPath).replace(/\\/g, '/'),
}, null, 2));
