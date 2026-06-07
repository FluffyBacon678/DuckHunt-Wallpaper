import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv[2] || 'build';
const port = Number(process.argv[3] || 5057);
const root = path.resolve(__dirname, '..', rootArg);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function resolveRequestPath(url) {
  const parsedUrl = new URL(url, 'http://127.0.0.1');
  const requestedPath = decodeURIComponent(parsedUrl.pathname);
  const normalizedPath = path.normalize(requestedPath).replace(/^([/\\])+/, '');
  const filePath = path.join(root, normalizedPath || 'index.html');

  if (!filePath.startsWith(root)) {
    return null;
  }

  return filePath;
}

createServer(async (request, response) => {
  const filePath = resolveRequestPath(request.url);

  if (!filePath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    });
    response.end(data);
  } catch (error) {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});
