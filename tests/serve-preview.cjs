const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const allowed = new Set(['/tests/preview.html', '/tests/preview-store.js', '/app.js', '/notebook-model.js', '/notebook-ui.js', '/project-editor.js', '/style.css', '/notebook.css', '/favicon.svg']);
http.createServer((req, res) => {
  const file = req.url === '/' ? '/tests/preview.html' : new URL(req.url, 'http://localhost').pathname;
  if (!allowed.has(file)) { res.writeHead(404); res.end(); return; }
  const type = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  fs.createReadStream(path.join(root, file)).pipe(res);
}).listen(8080, '127.0.0.1', () => console.log('Synthetic preview: http://127.0.0.1:8080'));
