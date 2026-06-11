// Bio-One Social — demo server.
// Zero external dependencies (Node stdlib only) so it runs anywhere,
// including locked-down environments. The architecture (providers, store,
// auth) is structured so you can drop in Express + Postgres later without
// touching the front-end.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const auth = require('./lib/auth');
const store = require('./lib/store');
const providers = require('./lib/providers');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const library = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'library.json'), 'utf8'));

const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function currentUser(req) {
  return auth.userForToken(getCookie(req, 'session'));
}

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(filePath, (err, buf) => {
    if (err) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // ---- API ----
  if (p.startsWith('/api/')) {
    // Auth: login / logout / me
    if (p === '/api/login' && req.method === 'POST') {
      const { email, password } = await readBody(req);
      const result = auth.login(email, password);
      if (!result) return send(res, 401, { error: 'Invalid email or password' });
      return send(res, 200, { user: result.user }, {
        'Set-Cookie': `session=${result.token}; HttpOnly; Path=/; SameSite=Lax`
      });
    }
    if (p === '/api/logout' && req.method === 'POST') {
      auth.logout(getCookie(req, 'session'));
      return send(res, 200, { ok: true }, { 'Set-Cookie': 'session=; Path=/; Max-Age=0' });
    }
    if (p === '/api/me') {
      const user = currentUser(req);
      return user ? send(res, 200, { user }) : send(res, 401, { error: 'not logged in' });
    }

    // Everything below requires auth
    const user = currentUser(req);
    if (!user) return send(res, 401, { error: 'not logged in' });

    if (p === '/api/platforms') {
      return send(res, 200, { platforms: providers.allMeta() });
    }
    if (p === '/api/library') {
      return send(res, 200, { posts: library.posts });
    }
    if (p === '/api/accounts' && req.method === 'GET') {
      return send(res, 200, { accounts: store.getAccounts(user.id) });
    }
    if (p === '/api/connect' && req.method === 'POST') {
      const { platform, handle } = await readBody(req);
      const prov = providers.get(platform);
      if (!prov) return send(res, 400, { error: 'unknown platform' });
      const info = await prov.connect(user.id, { handle });
      const accounts = store.setAccount(user.id, platform, info);
      return send(res, 200, { accounts });
    }
    if (p === '/api/disconnect' && req.method === 'POST') {
      const { platform } = await readBody(req);
      return send(res, 200, { accounts: store.removeAccount(user.id, platform) });
    }
    if (p === '/api/posts' && req.method === 'GET') {
      return send(res, 200, { posts: store.getPosts(user.id) });
    }
    if (p === '/api/publish' && req.method === 'POST') {
      const { libraryId, caption, platforms: targets, scheduledFor } = await readBody(req);
      const connected = store.getAccounts(user.id);
      const chosen = (targets || []).filter(t => connected[t]);
      if (!chosen.length) return send(res, 400, { error: 'No connected accounts selected' });

      const post = {
        id: crypto.randomBytes(6).toString('hex'),
        franchiseeId: user.id,
        libraryId: libraryId || null,
        caption,
        platforms: chosen,
        status: scheduledFor ? 'scheduled' : 'published',
        scheduledFor: scheduledFor || null,
        createdAt: new Date().toISOString(),
        results: {}
      };

      if (!scheduledFor) {
        for (const t of chosen) {
          const prov = providers.get(t);
          post.results[t] = await prov.publish(connected[t], post);
        }
      }
      store.addPost(post);
      return send(res, 200, { post });
    }
    return send(res, 404, { error: 'unknown endpoint' });
  }

  // ---- Static ----
  serveStatic(req, res, p);
});

server.listen(PORT, () => {
  console.log(`Bio-One Social running → http://localhost:${PORT}`);
  console.log('Demo logins: modesto@biooneinc.com / corporate@biooneinc.com  (password: demo)');
});
