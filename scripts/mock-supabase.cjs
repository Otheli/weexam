// Server Supabase tiruan (Auth + PostgREST weexam_state + Storage) + file statis dist/, satu origin.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = Number(process.argv[2] || 5180), DIST = path.resolve(process.argv[3] || 'dist');
const users = new Map(); // email -> {id,password}
const tokens = new Map(); // access -> userId
const refresh = new Map(); // refresh -> userId
const rows = new Map(); // userId -> {data,rev}
const objs = new Map(); // path -> {buf,type}
const KEY = 'test-anon-key';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const body = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
const mkSession = (id, email) => {
  const a = 'at-' + crypto.randomUUID(), r = 'rt-' + crypto.randomUUID();
  tokens.set(a, id); refresh.set(r, id);
  return { access_token: a, refresh_token: r, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id, email, identities: [{}] } };
};
const uidOf = (req) => tokens.get((req.headers.authorization || '').replace('Bearer ', ''));
let stats = { puts: 0, uploads: 0 };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  if (p === '/__stats') return json(res, 200, { ...stats, rows: [...rows.values()].map((r) => r.rev), objs: [...objs.keys()] });
  if (p === '/__down') { global.down = u.searchParams.get('on') === '1'; return json(res, 200, { down: global.down }); }
  if (p.startsWith('/auth/v1') || p.startsWith('/rest/v1') || p.startsWith('/storage/v1')) {
    if (global.down) { res.destroy(); return; }
    const b = await body(req);
    if (p === '/auth/v1/signup') {
      const { email, password } = JSON.parse(b);
      if (users.has(email)) return json(res, 400, { msg: 'User already registered' });
      if (password.length < 6) return json(res, 422, { msg: 'Password should be at least 6 characters' });
      const id = crypto.randomUUID(); users.set(email, { id, password });
      return json(res, 200, mkSession(id, email));
    }
    if (p === '/auth/v1/token') {
      const g = u.searchParams.get('grant_type');
      const j = JSON.parse(b);
      if (g === 'password') {
        const us = users.get(j.email);
        if (!us || us.password !== j.password) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        return json(res, 200, mkSession(us.id, j.email));
      }
      const id = refresh.get(j.refresh_token);
      if (!id) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
      const email = [...users.entries()].find(([, v]) => v.id === id)[0];
      return json(res, 200, mkSession(id, email));
    }
    if (p === '/auth/v1/logout') return json(res, 204, {});
    if (p === '/auth/v1/user') {
      const id = uidOf(req); if (!id) return json(res, 401, { msg: 'bad jwt' });
      const email = [...users.entries()].find(([, v]) => v.id === id)[0];
      return json(res, 200, { id, email });
    }
    const uid = uidOf(req);
    if (!uid) return json(res, 401, { message: 'JWT expired' });
    if (p === '/rest/v1/weexam_state') {
      const rev = u.searchParams.get('rev');
      const sel = u.searchParams.get('select') || '*';
      const cur = rows.get(uid);
      if (req.method === 'GET') return json(res, 200, cur ? [sel === 'rev' ? { rev: cur.rev } : { rev: cur.rev, data: cur.data }] : []);
      if (req.method === 'POST') {
        if (cur) return json(res, 409, { code: '23505', message: 'duplicate key' });
        const j = JSON.parse(b); rows.set(uid, { data: j.data, rev: 1 }); stats.puts++;
        return json(res, 201, [{ rev: 1 }]);
      }
      if (req.method === 'PATCH') {
        const want = Number((rev || '').replace('eq.', ''));
        if (!cur || cur.rev !== want) return json(res, 200, []);
        const j = JSON.parse(b); rows.set(uid, { data: j.data, rev: j.rev }); stats.puts++;
        return json(res, 200, [{ rev: j.rev }]);
      }
    }
    const m = p.match(/^\/storage\/v1\/object\/(?:authenticated\/)?weexam-files\/(.+)$/);
    if (m) {
      const key = m[1];
      if (!key.startsWith(uid + '/')) return json(res, 403, { message: 'forbidden' });
      if (req.method === 'POST') { objs.set(key, { buf: b, type: req.headers['content-type'] }); stats.uploads++; return json(res, 200, { Key: key }); }
      if (req.method === 'DELETE') { objs.delete(key); return json(res, 200, {}); }
      if (req.method === 'GET') { const o = objs.get(key); if (!o) return json(res, 404, { message: 'Not found' }); res.writeHead(200, { 'Content-Type': o.type }); return res.end(o.buf); }
    }
    return json(res, 404, { message: 'unknown ' + p });
  }
  if (p === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(`window.WEEXAM_CLOUD={url:location.origin,key:'${KEY}'};`); }
  let f = path.join(DIST, p === '/' ? 'index.html' : p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('mock on', PORT));
