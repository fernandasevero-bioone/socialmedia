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
const library = require('./lib/library');
const providers = require('./lib/providers');
const mailer = require('./lib/mailer');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'img', 'posts');

const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const MAX_BODY = 80 * 1024 * 1024; // 80MB — accommodates base64 image/short-video uploads
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > MAX_BODY) { reject(new Error('payload too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', reject);
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
    if (p === '/api/register' && req.method === 'POST') {
      const body = await readBody(req);
      const result = auth.register(body);
      if (result.error) return send(res, 400, { error: result.error });
      return send(res, 200, { user: result.user }, {
        'Set-Cookie': `session=${result.token}; HttpOnly; Path=/; SameSite=Lax`
      });
    }
    if (p === '/api/forgot' && req.method === 'POST') {
      const { email } = await readBody(req);
      const token = auth.createResetToken(email);
      // DEMO: return the reset link directly so the flow works without an
      // email service. PRODUCTION: email the link instead and return only
      // { ok: true } — never expose the token in the response.
      const resetLink = token ? `/#reset=${token}` : null;
      return send(res, 200, { ok: true, demoResetLink: resetLink });
    }
    if (p === '/api/reset' && req.method === 'POST') {
      const { token, password } = await readBody(req);
      const result = auth.resetPassword(token, password);
      if (result.error) return send(res, 400, { error: result.error });
      return send(res, 200, { ok: true, email: result.email });
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
      return send(res, 200, { posts: library.all() });
    }
    if (p === '/api/categories') {
      return send(res, 200, { categories: library.categories() });
    }

    // ---- Admin (corporate only): manage the shared content library ----
    if (p.startsWith('/api/admin/')) {
      if (user.role !== 'admin') return send(res, 403, { error: 'Corporate access only' });

      if (p === '/api/admin/library' && req.method === 'POST') {
        const body = await readBody(req);
        const post = body.id ? library.update(body.id, body) : library.create(body);
        if (!post) return send(res, 404, { error: 'post not found' });
        return send(res, 200, { post });
      }
      if (p === '/api/admin/library/delete' && req.method === 'POST') {
        const { id } = await readBody(req);
        return library.remove(id) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'post not found' });
      }
      if (p === '/api/admin/users') {
        return send(res, 200, { users: auth.listUsers() });
      }
      if (p === '/api/admin/outbox') {
        return send(res, 200, { outbox: mailer.getOutbox() });
      }
      if (p === '/api/admin/categories' && req.method === 'POST') {
        const { name } = await readBody(req);
        const r = library.addCategory(name);
        return r.error ? send(res, 400, r) : send(res, 200, r);
      }
      if (p === '/api/admin/categories/rename' && req.method === 'POST') {
        const { oldName, newName } = await readBody(req);
        const r = library.renameCategory(oldName, newName);
        return r.error ? send(res, 400, r) : send(res, 200, r);
      }
      if (p === '/api/admin/categories/delete' && req.method === 'POST') {
        const { name } = await readBody(req);
        const r = library.removeCategory(name);
        return r.error ? send(res, 400, r) : send(res, 200, r);
      }
      if (p === '/api/admin/upload' && req.method === 'POST') {
        // Accepts { filename, dataUrl } where dataUrl is a base64 data URI.
        // Keeps uploads dependency-free (no multipart parser needed).
        // PRODUCTION: large videos should stream to cloud storage (S3/GCS)
        // rather than ride through a base64 JSON body.
        const { filename, dataUrl } = await readBody(req);
        const m = /^data:((?:image|video)\/([a-z0-9.+-]+));base64,(.+)$/i.exec(dataUrl || '');
        if (!m) return send(res, 400, { error: 'Unsupported file. Upload an image (PNG, JPG, SVG, WEBP, GIF) or video (MP4, WEBM, MOV).' });
        const EXT = { 'png':'png','jpeg':'jpg','jpg':'jpg','svg+xml':'svg','webp':'webp','gif':'gif',
                      'mp4':'mp4','webm':'webm','quicktime':'mov','x-m4v':'m4v','ogg':'ogg' };
        const ext = EXT[m[2].toLowerCase()];
        if (!ext) return send(res, 400, { error: 'Unsupported format: ' + m[2] });
        const safe = (filename || 'upload').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40);
        const name = `up-${Date.now()}-${safe}.${ext}`;
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(m[3], 'base64'));
        return send(res, 200, { image: `/img/posts/${name}` });
      }
      return send(res, 404, { error: 'unknown admin endpoint' });
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
    if (p === '/api/posts/update' && req.method === 'POST') {
      // edit caption and/or reschedule — scheduled posts only
      const { id, caption, scheduledFor } = await readBody(req);
      const existing = store.getPost(user.id, id);
      if (!existing) return send(res, 404, { error: 'Post not found' });
      if (existing.status !== 'scheduled') return send(res, 400, { error: 'Only scheduled posts can be edited' });
      const fields = {};
      if (caption !== undefined) fields.caption = caption;
      if (scheduledFor !== undefined) {
        if (!scheduledFor || isNaN(Date.parse(scheduledFor))) return send(res, 400, { error: 'Invalid date/time' });
        fields.scheduledFor = scheduledFor;
      }
      return send(res, 200, { post: store.updatePost(user.id, id, fields) });
    }
    if (p === '/api/posts/delete' && req.method === 'POST') {
      // cancel a scheduled post — scheduled posts only
      const { id } = await readBody(req);
      const existing = store.getPost(user.id, id);
      if (!existing) return send(res, 404, { error: 'Post not found' });
      if (existing.status !== 'scheduled') return send(res, 400, { error: 'Only scheduled posts can be canceled' });
      store.deletePost(user.id, id);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/publish' && req.method === 'POST') {
      const { libraryId, caption, captions, category, media, platforms: targets, scheduledFor } = await readBody(req);
      const connected = store.getAccounts(user.id);
      const chosen = (targets || []).filter(t => connected[t]);
      if (!chosen.length) return send(res, 400, { error: 'No connected accounts selected' });

      // caption for a given platform: per-platform override if provided, else default
      const captionFor = t => (captions && captions[t] != null && captions[t] !== '') ? captions[t] : caption;

      const post = {
        id: crypto.randomBytes(6).toString('hex'),
        franchiseeId: user.id,
        libraryId: libraryId || null,
        caption,                                   // default caption
        captions: captions && Object.keys(captions).length ? captions : null, // per-platform overrides
        category: category || '',
        media: Array.isArray(media) && media.length ? media : null, // multiple images/videos
        platforms: chosen,
        status: scheduledFor ? 'scheduled' : 'published',
        scheduledFor: scheduledFor || null,
        createdAt: new Date().toISOString(),
        results: {}
      };

      if (!scheduledFor) {
        for (const t of chosen) {
          const prov = providers.get(t);
          post.results[t] = await prov.publish(connected[t], { ...post, caption: captionFor(t) });
        }
        // email the franchisee about any platforms that failed (not on success)
        const failures = chosen
          .filter(t => post.results[t] && post.results[t].ok === false)
          .map(t => ({ platform: providers.get(t).meta().name, error: post.results[t].error }));
        if (failures.length) mailer.sendPublishFailure(user.email, user.name, post, failures);
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
