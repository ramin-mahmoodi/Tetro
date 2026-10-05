const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

function isPathSensitive(relFromRoot) {
  const normalized = relFromRoot.replace(/\\/g, '/');
  return (
    normalized.startsWith('.') ||
    normalized.includes('/.') ||
    normalized.startsWith('.git') ||
    normalized.startsWith('.github') ||
    normalized.startsWith('node_modules') ||
    normalized.startsWith('scripts/') ||
    normalized.startsWith('tests/') ||
    normalized === 'server.js' ||
    normalized === 'package.json' ||
    normalized === 'package-lock.json'
  );
}

const server = http.createServer((req, res) => {
  try {
    let parsedUrl;
    try {
      parsedUrl = new URL(req.url, 'http://127.0.0.1');
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request: Invalid URL');
      return;
    }

    // Static file serving with strict path traversal & file exposure protection
    let decodedPath = '';
    try {
      decodedPath = decodeURIComponent(parsedUrl.pathname || '/');
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request: Malformed URI component');
      return;
    }

    if (decodedPath === '/' || decodedPath === '') {
      decodedPath = '/index.html';
    }

    // Clean leading slashes and resolve to absolute path
    const normalizedRelative = path.normalize(decodedPath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.resolve(root, '.' + (normalizedRelative.startsWith(path.sep) ? normalizedRelative : path.sep + normalizedRelative));

    // Ensure resolved path is strictly within web root
    const safeRoot = root.endsWith(path.sep) ? root : root + path.sep;
    if (!filePath.startsWith(safeRoot) && filePath !== root) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    // Block sensitive internal files and folders from being read
    const relFromRoot = path.relative(root, filePath);
    if (isPathSensitive(relFromRoot)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (globalErr) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }
});

const PORT = 4173;
const HOST = '127.0.0.1'; // Strictly bind to localhost

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Tetro static server running on http://${HOST}:${PORT}`);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { server, mimeTypes, isPathSensitive };
}
