'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { createStaticHandler } = require('../server/static-files');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'crate-static-'));
  const source = 'const greeting = "hello crate crew";\n'.repeat(200);
  await fs.writeFile(path.join(root, 'client.js'), source); await fs.writeFile(path.join(root, 'index.html'), '<p>Hello</p>');
  const server = http.createServer(createStaticHandler(root));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true }); });
  const request = (url, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, headers, method, agent: false }, res => {
      const parts = []; res.on('data', d => parts.push(d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
    }); req.on('error', reject); req.end();
  });
  return { root, source, request };
}

test('static gzip shrinks JS and returns the original bytes when decompressed or gzip is refused', async t => {
  const { request, source } = await fixture(t);
  const packed = await request('/client.js', { 'Accept-Encoding': 'gzip' });
  assert.equal(packed.status, 200); assert.equal(packed.headers['content-encoding'], 'gzip');
  assert.equal(gunzipSync(packed.body).toString(), source); assert.ok(packed.body.length < source.length / 3);
  assert.equal(packed.headers.vary, 'Accept-Encoding');
  const plain = await request('/client.js', { 'Accept-Encoding': 'gzip;q=0' });
  assert.equal(plain.headers['content-encoding'], undefined); assert.equal(plain.body.toString(), source);
  assert.notEqual(plain.headers.etag, packed.headers.etag);
});

test('ETag revalidation returns empty 304 responses and edited assets invalidate the cached representation', async t => {
  const { request, root } = await fixture(t);
  const a = await request('/client.js', { 'Accept-Encoding': 'gzip' });
  const b = await request('/client.js', { 'Accept-Encoding': 'gzip', 'If-None-Match': 'W/' + a.headers.etag });
  assert.equal(b.status, 304); assert.equal(b.body.length, 0);
  const identity = await request('/client.js', { 'If-None-Match': a.headers.etag }); assert.equal(identity.status, 200);
  await fs.writeFile(path.join(root, 'client.js'), 'const changed = true;');
  const c = await request('/client.js', { 'If-None-Match': a.headers.etag });
  assert.equal(c.status, 200); assert.notEqual(c.headers.etag, a.headers.etag); assert.equal(c.body.toString(), 'const changed = true;');
});

test('HEAD serves representation metadata without a body; malformed or escaping paths and missing assets fail cleanly', async t => {
  const { request } = await fixture(t);
  const get = await request('/client.js', { 'Accept-Encoding': 'gzip' }), head = await request('/client.js', { 'Accept-Encoding': 'gzip' }, 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(head.headers['content-length'], get.headers['content-length']);
  assert.equal((await request('/')).body.toString(), '<p>Hello</p>');
  assert.equal((await request('/../private.txt')).status, 403);
  assert.equal((await request('/%ZZ')).status, 400);
  assert.equal((await request('/absent.js')).status, 404);
  assert.equal((await request('/', {}, 'POST')).status, 405);
});
