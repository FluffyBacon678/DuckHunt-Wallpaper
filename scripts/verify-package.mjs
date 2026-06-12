import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'build');
const zipPath = path.join(root, 'dist', 'pond-patrol-wallpaper.zip');

const requiredRootFiles = [
  'index.html',
  'preview.jpg',
  'project.json',
];

const requiredFileGroups = [
  'audio/',
  'fonts/',
  'images/',
  'js/',
];

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function toZipPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

async function listFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await listFiles(filePath));
    } else if (entry.isFile()) {
      out.push(filePath);
    }
  }

  return out;
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const maxCommentLength = 0xffff;
  const minOffset = Math.max(0, buffer.length - maxCommentLength - 22);

  for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset;
    }
  }

  throw new Error('Could not find ZIP end of central directory');
}

function readZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  if (centralDirectoryEnd > buffer.length) {
    throw new Error('ZIP central directory points past the end of the file');
  }

  const entries = new Map();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory entry at offset ${offset}`);
    }

    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);

    entries.set(fileName, {
      compressedSize,
      isDirectory: fileName.endsWith('/'),
      uncompressedSize,
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  if (offset !== centralDirectoryEnd) {
    warnings.push('ZIP central directory had trailing bytes');
  }

  return entries;
}

function verifySafeEntryNames(entries) {
  for (const entryName of entries.keys()) {
    if (entryName.startsWith('build/')) {
      fail(`ZIP entry should not be nested under build/: ${entryName}`);
    }

    if (entryName.startsWith('/') || /^[a-z]:\//i.test(entryName)) {
      fail(`ZIP entry must be relative: ${entryName}`);
    }

    if (entryName.includes('\\') || entryName.split('/').includes('..')) {
      fail(`ZIP entry has an unsafe path: ${entryName}`);
    }

    if (/\.mp3$/i.test(entryName)) {
      fail(`ZIP entry should not be an MP3: ${entryName}`);
    }
  }
}

async function verifyEntriesMatchBuild(entries) {
  const buildFiles = await listFiles(buildDir);
  const expected = new Map();

  for (const filePath of buildFiles) {
    const fileInfo = await stat(filePath);
    const entryName = toZipPath(path.relative(buildDir, filePath));
    expected.set(entryName, fileInfo.size);
  }

  for (const [entryName, size] of expected.entries()) {
    const entry = entries.get(entryName);

    if (!entry) {
      fail(`ZIP is missing build file: ${entryName}`);
      continue;
    }

    if (entry.isDirectory) {
      fail(`ZIP entry should be a file: ${entryName}`);
    }

    if (entry.uncompressedSize !== size) {
      fail(`ZIP entry size mismatch for ${entryName}: expected ${size}, got ${entry.uncompressedSize}`);
    }
  }

  for (const [entryName, entry] of entries.entries()) {
    if (entry.isDirectory) continue;

    if (!expected.has(entryName)) {
      fail(`ZIP contains unexpected file: ${entryName}`);
    }
  }

  return expected.size;
}

const zipInfo = await stat(zipPath);
if (!zipInfo.isFile() || zipInfo.size <= 0) {
  fail('dist/pond-patrol-wallpaper.zip is missing or empty');
}

const zipBuffer = await readFile(zipPath);
const entries = readZipEntries(zipBuffer);

verifySafeEntryNames(entries);

for (const requiredFile of requiredRootFiles) {
  const entry = entries.get(requiredFile);
  if (!entry || entry.isDirectory || entry.uncompressedSize <= 0) {
    fail(`ZIP is missing required root file: ${requiredFile}`);
  }
}

for (const group of requiredFileGroups) {
  if (![...entries.keys()].some(entryName => entryName.startsWith(group) && !entryName.endsWith('/'))) {
    fail(`ZIP is missing files under ${group}`);
  }
}

const expectedFileCount = await verifyEntriesMatchBuild(entries);

const summary = {
  errors,
  expectedFileCount,
  warnings,
  zipBytes: zipInfo.size,
  zipEntries: entries.size,
};

if (errors.length > 0) {
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(summary, null, 2));
}
