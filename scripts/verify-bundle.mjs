import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'build');
const publicDir = path.join(root, 'public');

const requiredProjectProperties = [
  'autostart',
  'duckspeed',
  'fitmode',
  'interactive',
  'muted',
  'showcontrols',
  'showcursor',
  'showhud',
  'volume',
];

const forbiddenText = [
  /\bDuck Hunt\b/i,
  /\bFamicom\b/i,
  /\bNES Zapper\b/i,
  /\bNintendo\b/i,
  /\bVS\. System\b/i,
  /\bZapper\b/i,
  /\bAdi52\b/i,
];

const textExtensions = new Set(['.css', '.html', '.js', '.json', '.map', '.txt', '.xml']);

const errors = [];
const warnings = [];

function relative(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

async function exists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch (error) {
    return false;
  }
}

async function requireFile(filePath, label = relative(filePath)) {
  if (!await exists(filePath)) {
    fail(`Missing ${label}`);
    return false;
  }

  const info = await stat(filePath);
  if (info.size <= 0) {
    fail(`${label} is empty`);
    return false;
  }

  return true;
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

function resolveBuildRef(ref) {
  const cleanRef = ref.split('#')[0].split('?')[0];
  if (!cleanRef || cleanRef.startsWith('data:') || cleanRef.startsWith('mailto:')) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(cleanRef) || cleanRef.startsWith('//')) {
    fail(`Remote or absolute URL reference found in build/index.html: ${ref}`);
    return null;
  }

  return path.join(buildDir, cleanRef.replace(/^\//, ''));
}

async function verifyHtmlReferences(html) {
  const refs = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)].map(match => match[1]);

  for (const ref of refs) {
    const filePath = resolveBuildRef(ref);
    if (filePath) {
      await requireFile(filePath, `HTML reference ${ref}`);
    }
  }
}

async function verifyPublicAssetsCopied(sourceSubdir, buildSubdir) {
  const sourceDir = path.join(publicDir, sourceSubdir);
  const targetDir = path.join(buildDir, buildSubdir);
  const sourceFiles = await listFiles(sourceDir);

  for (const sourceFile of sourceFiles) {
    const targetFile = path.join(targetDir, path.relative(sourceDir, sourceFile));
    await requireFile(targetFile, `${buildSubdir}/${path.basename(sourceFile)}`);
  }
}

async function verifyProjectJson(projectJsonPath) {
  let project;

  try {
    project = JSON.parse(await readFile(projectJsonPath, 'utf8'));
  } catch (error) {
    fail(`Could not parse ${relative(projectJsonPath)}: ${error.message}`);
    return;
  }

  if (project.type !== 'web') fail('project.json type must be "web"');
  if (project.file !== 'index.html') fail('project.json file must be "index.html"');
  if (project.title !== 'Pond Patrol Wallpaper') fail('project.json title should be "Pond Patrol Wallpaper"');
  if (project.visibility !== 'public') warn('project.json visibility is not "public"');

  if (project.preview) {
    await requireFile(path.join(buildDir, project.preview), `project preview ${project.preview}`);
  } else {
    fail('project.json is missing preview');
  }

  const properties = project.general?.properties || {};
  for (const propertyName of requiredProjectProperties) {
    if (!properties[propertyName]) {
      fail(`project.json is missing user property "${propertyName}"`);
    }
  }
}

async function verifyBundleText(files) {
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!textExtensions.has(ext)) continue;

    const text = await readFile(file, 'utf8');
    const fileLabel = relative(file);

    if (/https?:\/\//i.test(text)) {
      fail(`${fileLabel} contains an http(s) URL`);
    }

    if (/\.mp3\b/i.test(text)) {
      fail(`${fileLabel} references an MP3 file`);
    }

    for (const pattern of forbiddenText) {
      if (pattern.test(text)) {
        fail(`${fileLabel} contains forbidden text matching ${pattern}`);
      }
    }
  }
}

await requireFile(path.join(buildDir, 'index.html'));
await requireFile(path.join(buildDir, 'project.json'));
await requireFile(path.join(buildDir, 'preview.jpg'));

const buildFiles = await listFiles(buildDir);
const html = await readFile(path.join(buildDir, 'index.html'), 'utf8');

if (!/<title>Pond Patrol<\/title>/i.test(html)) {
  fail('build/index.html title should be "Pond Patrol"');
}

if (!buildFiles.some(file => /^main-.+\.css$/i.test(path.basename(file)))) {
  fail('build is missing a hashed main CSS file');
}

if (!buildFiles.some(file => /^main-.+\.js$/i.test(path.basename(file)) && relative(file).startsWith('build/js/'))) {
  fail('build is missing a hashed main JS file in build/js/');
}

for (const file of buildFiles) {
  if (path.extname(file).toLowerCase() === '.mp3') {
    fail(`MP3 file found in build: ${relative(file)}`);
  }
}

await verifyHtmlReferences(html);
await verifyProjectJson(path.join(buildDir, 'project.json'));
await verifyPublicAssetsCopied('images', 'images');
await verifyPublicAssetsCopied('audio', 'audio');
await verifyBundleText(buildFiles);

const summary = {
  checkedFiles: buildFiles.length,
  errors,
  warnings,
};

if (errors.length > 0) {
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(summary, null, 2));
}
