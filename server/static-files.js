'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { gzip } = require('node:zlib');
const { promisify } = require('node:util');
const compress = promisify(gzip);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };

function createStaticHandler(directory) {
  const root = path.resolve(directory), cache = new Map();
  return async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    let pathname;
    try { pathname = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    try {
      const stat = await fs.stat(filename);
      if (!stat.isFile()) { res.writeHead(404); return res.end('not found'); }
      const version = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
      let entry = cache.get(filename);
      if (!entry || entry.version !== version) {
        const pending = fs.readFile(filename).then(async data => {
          const etag = crypto.createHash('sha256').update(data).digest('hex').slice(0, 24);
          const packed = data.length >= 1024 && /\.(js|css|html|json|svg)$/.test(filename) ? await compress(data) : null;
          return { data, packed: packed && packed.length < data.length ? packed : null, etag };
        });
        entry = { version, pending }; cache.set(filename, entry);
        pending.catch(() => { if (cache.get(filename) === entry) cache.delete(filename); });
      }
      const file = await entry.pending;
      const accepted = (req.headers['accept-encoding'] || '').split(',').some(item => {
        const [encoding, ...parameters] = item.trim().split(';');
        const q = parameters.find(p => p.trim().startsWith('q='));
        return encoding === 'gzip' && (!q || Number(q.trim().slice(2)) > 0);
      });
      const packed = accepted && file.packed, data = packed || file.data;
      const etag = `"${file.etag}${packed ? '-gzip' : ''}"`;
      const headers = { 'Content-Type': MIME[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache',
        Vary: 'Accept-Encoding', ETag: etag };
      if (packed) headers['Content-Encoding'] = 'gzip';
      const validators = (req.headers['if-none-match'] || '').split(',').map(value => value.trim().replace(/^W\//, ''));
      if (validators.includes(etag) || validators.includes('*')) { res.writeHead(304, headers); return res.end(); }
      headers['Content-Length'] = data.length;
      res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (err) {
      res.writeHead(err.code === 'ENOENT' || err.code === 'ENOTDIR' ? 404 : 500); res.end('not found');
    }
  };
}

module.exports = { createStaticHandler };
