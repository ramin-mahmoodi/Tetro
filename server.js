const http = require('http');
const https = require('https');
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
  '.ico': 'image/x-icon'
};

// Strict allowlist of permitted exchange API hostnames for the dev proxy
const ALLOWED_PROXY_HOSTS = new Set([
  'api.wallex.ir',
  'wallex.ir',
  'apiv2.nobitex.ir',
  'api.abantether.com',
  'publicapi.ramzinex.ir',
  'service.tetherland.com',
  'market.tetherland.com',
  'api-web.tabdeal.org',
  'api.exir.io',
  'api.bitpin.ir',
  'api.bitpin.org'
]);

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

    // 1. Local CORS proxy route for testing live Iranian exchange APIs
    if (parsedUrl.pathname === '/proxy') {
      const targetParam = parsedUrl.searchParams.get('url');
      if (!targetParam || typeof targetParam !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Missing or invalid url query parameter' }));
        return;
      }

      let parsedTarget;
      try {
        parsedTarget = new URL(targetParam);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Invalid URL format' }));
        return;
      }

      // Restrict protocol to http: and https: only (prevents ftp://, file:// crashes and exploits)
      if (parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:') {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Only http and https protocols are supported' }));
        return;
      }

      // Restrict target host to allowed exchange domains (prevents SSRF into internal networks)
      const targetHostname = parsedTarget.hostname.toLowerCase();
      if (!ALLOWED_PROXY_HOSTS.has(targetHostname)) {
        res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: `Forbidden: Host '${targetHostname}' is not in proxy allowlist` }));
        return;
      }

      const client = parsedTarget.protocol === 'https:' ? https : http;
      try {
        const proxyReq = client.get(parsedTarget.href, {
          timeout: 7000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
          }
        }, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, {
            'Content-Type': proxyRes.headers['content-type'] || 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Cache-Control': 'no-cache'
          });
          proxyRes.pipe(res);
        });

        proxyReq.on('timeout', () => {
          proxyReq.destroy();
          if (!res.headersSent) {
            res.writeHead(504, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Gateway Timeout' }));
          }
        });

        proxyReq.on('error', (err) => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: err.message }));
        }
      }
      return;
    }

    // 2. Static file serving with strict path traversal & file exposure protection
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
    if (!filePath.startsWith(root)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    // Block sensitive internal files and folders from being read
    const relFromRoot = path.relative(root, filePath).replace(/\\/g, '/');
    const isSensitive = (
      relFromRoot.startsWith('.') ||
      relFromRoot.includes('/.') ||
      relFromRoot.startsWith('.git') ||
      relFromRoot.startsWith('.github') ||
      relFromRoot.startsWith('node_modules') ||
      relFromRoot.startsWith('scripts/') ||
      relFromRoot === 'server.js' ||
      relFromRoot === 'package.json' ||
      relFromRoot === 'package-lock.json'
    );

    if (isSensitive) {
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
const HOST = '127.0.0.1'; // Strictly bind to localhost to avoid exposure to external networks

server.listen(PORT, HOST, () => {
  console.log(`Tetro server running securely on http://${HOST}:${PORT}`);
});
