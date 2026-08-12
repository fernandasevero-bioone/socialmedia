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
const tiktokApi = require('./lib/tiktok');
const pinterestApi = require('./lib/pinterest');
const secure = require('./lib/secure');

const BUILD = 'tiktok-diag-2026-08'; // bump on each deploy-relevant change; check via /api/version
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
  '.webp':'image/webp', '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime', '.m4v':'video/x-m4v', '.txt':'text/plain' };

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
      const org = orgs[0]; // default to first; user can switch if they admin several
      store.setAccount(entry.userId, 'linkedin', {
        handle: org.name, orgId: org.id, orgUrn: org.urn,
        orgs, // full list of Pages they administer, for the page picker
        token: secure.encrypt(token),
        status: 'connected', connectedAt: new Date().toISOString()
      });
      // if they manage more than one Page, send them to pick the right one
      return redirect(res, orgs.length > 1 ? '/?linkedin=pick' : '/?linkedin=connected');
    } catch (err) {
      console.error('[linkedin oauth]', err.message);
      return redirect(res, '/?linkedin=error');
    }
  }

  // ---- TikTok OAuth ----
  if (p === '/oauth/tiktok/start') {
    const user = currentUser(req);
    if (!user) return redirect(res, '/');
    if (!tiktokApi.isConfigured()) return send(res, 503, { error: 'TikTok is not configured yet (set TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET).' });
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { userId: user.id, ts: Date.now(), provider: 'tiktok' });
    const redirectUri = `${baseUrlFrom(req)}/oauth/tiktok/callback`;
    return redirect(res, tiktokApi.authUrl(redirectUri, state));
  }
  if (p === '/oauth/tiktok/callback') {
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const entry = state && oauthStates.get(state);
    oauthStates.delete(state);
    if (url.searchParams.get('error') || !code || !entry) return redirect(res, '/?tiktok=denied');
    if (Date.now() - entry.ts > 10 * 60 * 1000) return redirect(res, '/?tiktok=expired');
    try {
      const redirectUri = `${baseUrlFrom(req)}/oauth/tiktok/callback`;
      const t = await tiktokApi.exchangeCode(code, redirectUri);
      let displayName = 'TikTok account';
      try { const u = await tiktokApi.getUserInfo(t.token); displayName = u.display_name || displayName; } catch {}
      store.setAccount(entry.userId, 'tiktok', {
        handle: '@' + displayName.replace(/^@/, ''), openId: t.openId,
        token: secure.encrypt(t.token), refreshToken: secure.encrypt(t.refreshToken),
        expiresAt: t.expiresAt,
        status: 'connected', connectedAt: new Date().toISOString()
      });
      return redirect(res, '/?tiktok=connected');
    } catch (err) {
      console.error('[tiktok oauth]', err.message);
      return redirect(res, '/?tiktok=error');
    }
  }

  // ---- Pinterest OAuth ----
  if (p === '/oauth/pinterest/start') {
    const user = currentUser(req);
    if (!user) return redirect(res, '/');
    if (!pinterestApi.isConfigured()) return send(res, 503, { error: 'Pinterest is not configured yet (set PINTEREST_APP_ID / PINTEREST_APP_SECRET).' });
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { userId: user.id, ts: Date.now(), provider: 'pinterest' });
    const redirectUri = `${baseUrlFrom(req)}/oauth/pinterest/callback`;
    return redirect(res, pinterestApi.authUrl(redirectUri, state));
  }
  if (p === '/oauth/pinterest/callback') {
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const entry = state && oauthStates.get(state);
    oauthStates.delete(state);
    if (url.searchParams.get('error') || !code || !entry) return redirect(res, '/?pinterest=denied');
    if (Date.now() - entry.ts > 10 * 60 * 1000) return redirect(res, '/?pinterest=expired');
    try {
      const redirectUri = `${baseUrlFrom(req)}/oauth/pinterest/callback`;
      const token = await pinterestApi.exchangeCode(code, redirectUri);
      const boards = await pinterestApi.getBoards(token);
      if (!boards.length) return redirect(res, '/?pinterest=noboard');
      const username = await pinterestApi.getUsername(token);
      const board = boards[0]; // first board (franchisee can create/rename in Pinterest)
      store.setAccount(entry.userId, 'pinterest', {
        handle: (username ? '@' + username + ' · ' : '') + board.name,
        boardId: board.id, boardName: board.name, token: secure.encrypt(token),
        status: 'connected', connectedAt: new Date().toISOString()
      });
      return redirect(res, '/?pinterest=connected');
    } catch (err) {
      console.error('[pinterest oauth]', err.message);
      return redirect(res, '/?pinterest=error');
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
    if (p === '/api/version') {
      // public build marker — visit /api/version to confirm which code is live
      return send(res, 200, { build: BUILD });
    }
    if (p === '/api/diag/tiktok') {
      // masked credential check + the exact authorize URL we send to TikTok,
      // so a "client_key" error can be diagnosed without exposing secrets
      const redirectUri = `${baseUrlFrom(req)}/oauth/tiktok/callback`;
      return send(res, 200, {
        configured: tiktokApi.isConfigured(),
        credentials: tiktokApi.debugInfo(),
        redirectUri,
        authorizeUrl: tiktokApi.isConfigured() ? tiktokApi.authUrl(redirectUri, 'DIAGNOSTIC') : null
      });
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
    if (p === '/api/linkedin/select-page' && req.method === 'POST') {
      const { orgId } = await readBody(req);
      const acc = store.getAccounts(user.id).linkedin;
      if (!acc || !acc.orgs) return send(res, 400, { error: 'No LinkedIn Pages to choose from' });
      const org = acc.orgs.find(o => o.id === orgId);
      if (!org) return send(res, 404, { error: 'Page not found' });
      const accounts = store.setAccount(user.id, 'linkedin', { ...acc, orgId: org.id, orgUrn: org.urn, handle: org.name });
      return send(res, 200, { accounts });
    }
    if (p === '/api/disconnect' && req.method === 'POST') {
      const { platform } = await readBody(req);
      const acct = store.getAccounts(user.id)[platform];
      if (platform === 'linkedin' && linkedinApi.isConfigured() && acct && acct.token) {
        await linkedinApi.revokeToken(secure.decrypt(acct.token)); // release the LinkedIn authorization
      }
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
      // Delete a post. Scheduled → cancel entirely. Published → the caller may
      // pick WHICH platforms to delete from ({ platforms: [...] }); omitted
      // means all. If platforms remain, the post record stays with the rest.
      const { id, platforms: pick } = await readBody(req);
      const existing = store.getPost(user.id, id);
      if (!existing) return send(res, 404, { error: 'Post not found' });

      if (existing.status !== 'published') {
        store.deletePost(user.id, id);
        return send(res, 200, { ok: true });
      }

      const targets = Array.isArray(pick) && pick.length
        ? existing.platforms.filter(t => pick.includes(t))
        : [...existing.platforms];
      if (!targets.length) return send(res, 400, { error: 'Pick at least one platform' });

      const accounts = store.getAccounts(user.id);
      const results = existing.results || {};
      let platformNote = null;
      const note = msg => { platformNote = (platformNote ? platformNote + ' ' : '') + msg; };

      for (const t of targets) {
        const r = results[t];
        if (!r || !r.ok || r.demo) continue; // nothing real to remove
        try {
          if (t === 'facebook' && metaApi.isConfigured() && accounts.facebook && accounts.facebook.token) {
            const postId = r.platformId || (r.externalUrl || '').split('facebook.com/')[1];
            if (postId) await metaApi.deletePost({ ...accounts.facebook, token: secure.decrypt(accounts.facebook.token) }, postId);
          } else if (t === 'instagram' && metaApi.isConfigured()) {
            const canDelete = metaApi.SCOPES.includes('instagram_manage_contents');
            if (canDelete && accounts.instagram && accounts.instagram.token && r.platformId) {
              await metaApi.deletePost({ ...accounts.instagram, token: secure.decrypt(accounts.instagram.token) }, r.platformId);
            } else {
              note('To remove it from Instagram, delete it in the Instagram app.');
            }
          } else if (t === 'linkedin' && linkedinApi.isConfigured() && accounts.linkedin && accounts.linkedin.token && r.platformId) {
            await linkedinApi.deleteOrgPost({ ...accounts.linkedin, token: secure.decrypt(accounts.linkedin.token) }, r.platformId);
          } else if (t === 'tiktok') {
            note('To remove it from TikTok, delete it in the TikTok app (TikTok does not allow deleting posts via API).');
          } else if (t === 'pinterest' && pinterestApi.isConfigured() && accounts.pinterest && accounts.pinterest.token && r.platformId) {
            await pinterestApi.deletePin({ ...accounts.pinterest, token: secure.decrypt(accounts.pinterest.token) }, r.platformId);
          }
        } catch (e) {
          note(`${providers.get(t) ? providers.get(t).meta().name : t} deletion failed: ${e.message}.`);
        }
      }

      const remaining = existing.platforms.filter(t => !targets.includes(t));
      if (remaining.length) {
        const newResults = { ...results };
        targets.forEach(t => delete newResults[t]);
        store.updatePostById(id, { platforms: remaining, results: newResults });
        return send(res, 200, { ok: true, note: platformNote, remaining });
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
    // decrypt any stored OAuth tokens just for this publish call
    const acct = { ...accounts[t] };
    if (acct.token) acct.token = secure.decrypt(acct.token);
    if (acct.refreshToken) acct.refreshToken = secure.decrypt(acct.refreshToken);
    post.results[t] = await prov.publish(acct, { ...post, caption: captionFor(t) });
    if (post.results[t] && post.results[t].ok === false) {
      console.error(`[publish] ${t} FAILED for ${post.franchiseeId}: ${post.results[t].error}`);
    }
    // a provider may have refreshed short-lived tokens (TikTok) — persist them
    const renewed = post.results[t] && post.results[t]._updatedAccount;
    if (renewed && post.franchiseeId) {
      store.setAccount(post.franchiseeId, t, {
        ...accounts[t],
        token: secure.encrypt(renewed.token),
        refreshToken: secure.encrypt(renewed.refreshToken),
        expiresAt: renewed.expiresAt
      });
      delete post.results[t]._updatedAccount;
    }
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
