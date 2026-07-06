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

require('./lib/env').loadEnv(); // load config/platforms.env into process.env

const auth = require('./lib/auth');
const store = require('./lib/store');
const library = require('./lib/library');
const providers = require('./lib/providers');
const mailer = require('./lib/mailer');
const metaApi = require('./lib/meta');
const linkedinApi = require('./lib/linkedin');
const secure = require('./lib/secure');

const oauthStates = new Map(); // state -> { userId, ts }
function baseUrlFrom(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}`;
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'img', 'posts');

const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif',
  '.webp':'image/webp', '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime', '.m4v':'video/x-m4v' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

// raw body (for form-encoded Meta callbacks)
function readRaw(req) {
  return new Promise(resolve => {
    let data = ''; req.on('data', c => (data += c)); req.on('end', () => resolve(data)); req.on('error', () => resolve(''));
  });
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
    if (err) {
      // SPA fallback: extensionless routes (e.g. /calendar, /analytics) serve
      // the app shell so deep links and refresh work.
      if (!path.extname(filePath)) {
        return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, b2) =>
          e2 ? send(res, 404, { error: 'not found' })
             : (res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(b2)));
      }
      return send(res, 404, { error: 'not found' });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // ---- Meta (Facebook + Instagram) OAuth ----
  if (p === '/oauth/meta/start') {
    const user = currentUser(req);
    if (!user) return redirect(res, '/');
    if (!metaApi.isConfigured()) return send(res, 503, { error: 'Meta is not configured yet (set META_APP_ID / META_APP_SECRET).' });
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { userId: user.id, ts: Date.now() });
    const redirectUri = `${baseUrlFrom(req)}/oauth/meta/callback`;
    return redirect(res, metaApi.authUrl(redirectUri, state));
  }
  if (p === '/oauth/meta/callback') {
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const entry = state && oauthStates.get(state);
    oauthStates.delete(state);
    if (url.searchParams.get('error') || !code || !entry) return redirect(res, '/?meta=denied');
    if (Date.now() - entry.ts > 10 * 60 * 1000) return redirect(res, '/?meta=expired');
    try {
      const redirectUri = `${baseUrlFrom(req)}/oauth/meta/callback`;
      const userToken = await metaApi.exchangeCode(code, redirectUri);
      const fbUserId = await metaApi.getUserId(userToken);
      const conn = await metaApi.getConnections(userToken);
      if (conn.pages[0]) {
        const pg = conn.pages[0];
        store.setAccount(entry.userId, 'facebook', {
          handle: pg.name, pageId: pg.id, token: secure.encrypt(pg.token), fbUserId,
          status: 'connected', connectedAt: new Date().toISOString()
        });
      }
      if (conn.instagram[0]) {
        const ig = conn.instagram[0];
        store.setAccount(entry.userId, 'instagram', {
          handle: '@' + (ig.username || 'account'), id: ig.id, pageId: ig.pageId,
          token: secure.encrypt(ig.token), fbUserId,
          status: 'connected', connectedAt: new Date().toISOString()
        });
      }
      return redirect(res, conn.pages.length ? '/?meta=connected' : '/?meta=nopage');
    } catch (err) {
      console.error('[meta oauth]', err.message);
      return redirect(res, '/?meta=error');
    }
  }
  // ---- LinkedIn OAuth (Company Pages) ----
  if (p === '/oauth/linkedin/start') {
    const user = currentUser(req);
    if (!user) return redirect(res, '/');
    if (!linkedinApi.isConfigured()) return send(res, 503, { error: 'LinkedIn is not configured yet (set LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET).' });
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { userId: user.id, ts: Date.now(), provider: 'linkedin' });
    const redirectUri = `${baseUrlFrom(req)}/oauth/linkedin/callback`;
    return redirect(res, linkedinApi.authUrl(redirectUri, state));
  }
  if (p === '/oauth/linkedin/callback') {
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const entry = state && oauthStates.get(state);
    oauthStates.delete(state);
    if (url.searchParams.get('error') || !code || !entry) return redirect(res, '/?linkedin=denied');
    if (Date.now() - entry.ts > 10 * 60 * 1000) return redirect(res, '/?linkedin=expired');
    try {
      const redirectUri = `${baseUrlFrom(req)}/oauth/linkedin/callback`;
      const token = await linkedinApi.exchangeCode(code, redirectUri);
      const orgs = await linkedinApi.getOrganizations(token);
      if (!orgs.length) return redirect(res, '/?linkedin=noorg');
      const org = orgs[0]; // first Page they administer (their location's Page)
      store.setAccount(entry.userId, 'linkedin', {
        handle: org.name, orgId: org.id, orgUrn: org.urn,
        token: secure.encrypt(token),
        status: 'connected', connectedAt: new Date().toISOString()
      });
      return redirect(res, '/?linkedin=connected');
    } catch (err) {
      console.error('[linkedin oauth]', err.message);
      return redirect(res, '/?linkedin=error');
    }
  }

  // Meta pings this when a user removes the app → wipe their stored tokens.
  if (p === '/oauth/meta/deauthorize' && req.method === 'POST') {
    const body = await readRaw(req);
    const signed = new URLSearchParams(body).get('signed_request');
    const data = metaApi.parseSignedRequest(signed);
    if (data && data.user_id) { const ids = store.purgeMetaUser(data.user_id); console.log('[meta] deauthorized; cleared', ids.length); }
    return send(res, 200, { ok: true });
  }
  // Meta data-deletion request → remove the user's connected data, respond per spec.
  if (p === '/oauth/meta/data-deletion' && req.method === 'POST') {
    const body = await readRaw(req);
    const signed = new URLSearchParams(body).get('signed_request');
    const data = metaApi.parseSignedRequest(signed);
    if (data && data.user_id) store.purgeMetaUser(data.user_id);
    const code = crypto.randomBytes(8).toString('hex');
    return send(res, 200, { url: `${baseUrlFrom(req)}/data-deletion.html`, confirmation_code: code });
  }

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
      if (p === '/api/admin/users/delete' && req.method === 'POST') {
        const { email } = await readBody(req);
        const r = auth.deleteUser(email);
        return r.error ? send(res, 400, r) : send(res, 200, { users: auth.listUsers() });
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
        const body = await readBody(req);
        const r = saveUpload(body);
        return r.error ? send(res, 400, { error: r.error }) : send(res, 200, { image: r.image });
      }
      return send(res, 404, { error: 'unknown admin endpoint' });
    }
    if (p === '/api/upload' && req.method === 'POST') {
      // any signed-in user can upload media for their own custom posts
      const body = await readBody(req);
      const r = saveUpload(body);
      return r.error ? send(res, 400, { error: r.error }) : send(res, 200, { image: r.image });
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
      // remove a post from the app (works for scheduled OR published). For a
      // published Facebook post, also best-effort delete it from the Page.
      const { id } = await readBody(req);
      const existing = store.getPost(user.id, id);
      if (!existing) return send(res, 404, { error: 'Post not found' });
      let platformNote = null;
      if (existing.status === 'published' && existing.results && metaApi.isConfigured()) {
        const accounts = store.getAccounts(user.id);
        // Facebook Page post
        const fbRes = existing.results.facebook, fbAcc = accounts.facebook;
        if (fbRes && fbRes.ok && fbAcc && fbAcc.token) {
          const postId = fbRes.platformId || (fbRes.externalUrl || '').split('facebook.com/')[1];
          if (postId) {
            try { await metaApi.deletePost({ ...fbAcc, token: secure.decrypt(fbAcc.token) }, postId); }
            catch (e) { platformNote = 'Removed from the app, but Facebook deletion failed: ' + e.message; }
          }
        }
        // Instagram post — only attempt when instagram_manage_contents is an
        // active scope (i.e. approved). Until then, guide the user.
        const igRes = existing.results.instagram, igAcc = accounts.instagram;
        if (igRes && igRes.ok) {
          const igDeleteEnabled = metaApi.SCOPES.includes('instagram_manage_contents');
          if (igDeleteEnabled && igAcc && igAcc.token && igRes.platformId) {
            try { await metaApi.deletePost({ ...igAcc, token: secure.decrypt(igAcc.token) }, igRes.platformId); }
            catch (e) { platformNote = (platformNote ? platformNote + ' ' : '') + 'Removed from the app, but Instagram deletion failed: ' + e.message; }
          } else {
            platformNote = (platformNote ? platformNote + ' ' : '') + 'Removed from the app. To remove it from Instagram, delete it in the Instagram app.';
          }
        }
      }
      // LinkedIn Company Page post
      if (existing.status === 'published' && existing.results && linkedinApi.isConfigured()) {
        const liRes = existing.results.linkedin, liAcc = store.getAccounts(user.id).linkedin;
        if (liRes && liRes.ok && liRes.platformId && liAcc && liAcc.token) {
          try { await linkedinApi.deleteOrgPost({ ...liAcc, token: secure.decrypt(liAcc.token) }, liRes.platformId); }
          catch (e) { platformNote = (platformNote ? platformNote + ' ' : '') + 'Removed from the app, but LinkedIn deletion failed: ' + e.message; }
        }
      }
      store.deletePost(user.id, id);
      return send(res, 200, { ok: true, note: platformNote });
    }
    if (p === '/api/publish' && req.method === 'POST') {
      const { libraryId, caption, captions, category, media, platforms: targets, scheduledFor } = await readBody(req);
      const connected = store.getAccounts(user.id);
      const chosen = (targets || []).filter(t => connected[t]);
      if (!chosen.length) return send(res, 400, { error: 'No connected accounts selected' });

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
        const failures = await deliverPost(post, connected);
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

// ---- shared upload handler (admin templates AND franchisee custom posts) ----
// Accepts { filename, dataUrl } (base64 data URI). Dependency-free, no
// multipart parser. PRODUCTION: stream large videos to cloud storage instead.
function saveUpload({ filename, dataUrl } = {}) {
  const m = /^data:((?:image|video)\/([a-z0-9.+-]+));base64,(.+)$/i.exec(dataUrl || '');
  if (!m) return { error: 'Unsupported file. Upload an image (PNG, JPG, SVG, WEBP, GIF) or video (MP4, WEBM, MOV).' };
  const EXT = { 'png':'png','jpeg':'jpg','jpg':'jpg','svg+xml':'svg','webp':'webp','gif':'gif',
                'mp4':'mp4','webm':'webm','quicktime':'mov','x-m4v':'m4v','ogg':'ogg' };
  const ext = EXT[m[2].toLowerCase()];
  if (!ext) return { error: 'Unsupported format: ' + m[2] };
  const safe = (filename || 'upload').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40);
  const name = `up-${Date.now()}-${Math.random().toString(36).slice(2,7)}-${safe}.${ext}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(m[3], 'base64'));
  return { image: `/img/posts/${name}` };
}

// ---- shared publish logic (used by immediate publish AND the scheduler) ----
// Fills post.results for each platform and returns the list of failures.
async function deliverPost(post, accounts) {
  const captionFor = t => (post.captions && post.captions[t] != null && post.captions[t] !== '')
    ? post.captions[t] : post.caption;
  post.results = post.results || {};
  const failures = [];
  for (const t of post.platforms) {
    const prov = providers.get(t);
    if (!prov) {
      post.results[t] = { ok: false, error: 'unknown platform' };
      failures.push({ platform: t, error: 'unknown platform' });
      continue;
    }
    if (!accounts[t]) { // account was disconnected between scheduling and send time
      post.results[t] = { ok: false, error: 'account no longer connected' };
      failures.push({ platform: prov.meta().name, error: 'account no longer connected' });
      continue;
    }
    // decrypt any stored OAuth token just for this publish call
    const acct = { ...accounts[t] };
    if (acct.token) acct.token = secure.decrypt(acct.token);
    post.results[t] = await prov.publish(acct, { ...post, caption: captionFor(t) });
    if (post.results[t] && post.results[t].ok === false) {
      failures.push({ platform: prov.meta().name, error: post.results[t].error });
    }
  }
  return failures;
}

// ---- background scheduler ----
// Every tick, publish any scheduled posts whose time has arrived. In demo this
// is a simple in-process interval; for production use a durable job queue or
// cron so it survives restarts and scales across multiple servers.
const SCHEDULER_INTERVAL_MS = Number(process.env.SCHEDULER_INTERVAL_MS) || 30 * 1000;
let schedulerBusy = false;
async function runScheduler() {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    const due = store.getDueScheduled(new Date());
    for (const post of due) {
      const accounts = store.getAccounts(post.franchiseeId);
      const failures = await deliverPost(post, accounts);
      store.updatePostById(post.id, {
        status: 'published',
        results: post.results,
        publishedAt: new Date().toISOString()
      });
      const okCount = post.platforms.length - failures.length;
      console.log(`[scheduler] published ${post.id} → ${okCount} ok, ${failures.length} failed`);
      if (failures.length) {
        const owner = store.getUsers().find(u => u.id === post.franchiseeId);
        if (owner) mailer.sendPublishFailure(owner.email, owner.name, post, failures);
      }
    }
  } catch (err) {
    console.error('[scheduler] error:', err.message);
  } finally {
    schedulerBusy = false;
  }
}

server.listen(PORT, () => {
  console.log(`Bio-One Social running → http://localhost:${PORT}`);
  console.log('Demo logins: modesto@biooneinc.com / corporate@biooneinc.com  (password: demo)');
  setInterval(runScheduler, SCHEDULER_INTERVAL_MS);
  runScheduler(); // catch anything already due at startup
  console.log(`Scheduler active — checking every ${SCHEDULER_INTERVAL_MS / 1000}s for due posts.`);
});
