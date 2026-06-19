// Meta Graph API helper — OAuth + publishing for Facebook Pages and Instagram.
//
// Activates only when META_APP_ID + META_APP_SECRET are set (otherwise the app
// stays in demo mode). Uses the global fetch in Node 18+.
//
// Flow:
//   1. authUrl() → send the franchisee to Facebook's login dialog.
//   2. callback: exchangeCode() → long-lived user token → getConnections()
//      returns each Page (with its page token) and any linked IG Business acct.
//   3. publishToPage() / publishToInstagram() post on the user's behalf.
'use strict';

const crypto = require('crypto');

const GRAPH = 'https://graph.facebook.com/v21.0';
// Scopes requested at login. Only include permissions that are actually
// granted/enabled on the app — requesting a not-yet-approved permission makes
// Facebook reject the ENTIRE login ("Invalid Scopes").
// NOTE: instagram_manage_contents (Instagram delete) is intentionally NOT
// requested here yet — re-add it only after Meta approves it, or login breaks.
const SCOPES = [
  'pages_show_list',           // list the Pages the franchisee manages
  'pages_read_engagement',     // read the Page + its linked IG account
  'pages_manage_posts',        // publish & delete Facebook Page posts
  'instagram_basic',           // identify the linked IG Business account
  'instagram_content_publish', // publish to Instagram
  'business_management'        // access the Page/IG assets in the user's business portfolio
].join(',');

function isConfigured() {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function appId()     { return process.env.META_APP_ID; }
function appSecret() { return process.env.META_APP_SECRET; }

// Meta must fetch media by public URL. Turn our relative paths (/media/x.png)
// into absolute URLs using APP_BASE_URL (the deployed site address).
function absMedia(urls) {
  const base = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  return (urls || []).map(u => /^https?:/i.test(u) ? u : base + u);
}

async function gget(url) {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error ? json.error.message : `Graph GET ${res.status}`);
  return json;
}
async function gpost(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error ? json.error.message : `Graph POST ${res.status}`);
  return json;
}

// Step 1: where to send the user to grant access
function authUrl(redirectUri, state) {
  const p = new URLSearchParams({
    client_id: appId(), redirect_uri: redirectUri, state,
    scope: SCOPES, response_type: 'code'
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${p}`;
}

// Step 2: code → long-lived user token → connected Pages + linked IG accounts
async function exchangeCode(code, redirectUri) {
  const short = await gget(`${GRAPH}/oauth/access_token?` + new URLSearchParams({
    client_id: appId(), client_secret: appSecret(), redirect_uri: redirectUri, code
  }));
  const long = await gget(`${GRAPH}/oauth/access_token?` + new URLSearchParams({
    grant_type: 'fb_exchange_token', client_id: appId(), client_secret: appSecret(),
    fb_exchange_token: short.access_token
  }));
  return long.access_token; // long-lived user token (~60 days)
}

// The Facebook user id of the person who logged in (used to honor deauthorize
// and data-deletion callbacks).
async function getUserId(userToken) {
  const me = await gget(`${GRAPH}/me?fields=id&access_token=${userToken}`);
  return me.id;
}

// Verify + decode a Meta signed_request (deauthorize / data-deletion pings)
function parseSignedRequest(signed) {
  if (!signed || !signed.includes('.')) return null;
  const [encSig, encPayload] = signed.split('.');
  const b64 = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const expected = crypto.createHmac('sha256', appSecret()).update(encPayload).digest();
  const sig = b64(encSig);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
  try { return JSON.parse(b64(encPayload).toString('utf8')); } catch { return null; }
}

// Returns { pages: [{id,name,token}], instagram: [{id,username,pageId,token}] }
async function getConnections(userToken) {
  const out = { pages: [], instagram: [] };
  const accts = await gget(`${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${userToken}`);
  for (const pg of (accts.data || [])) {
    out.pages.push({ id: pg.id, name: pg.name, token: pg.access_token });
    try {
      const ig = await gget(`${GRAPH}/${pg.id}?fields=instagram_business_account{id,username}&access_token=${pg.access_token}`);
      if (ig.instagram_business_account) {
        out.instagram.push({
          id: ig.instagram_business_account.id,
          username: ig.instagram_business_account.username,
          pageId: pg.id, token: pg.access_token
        });
      }
    } catch { /* page may have no linked IG */ }
  }
  return out;
}

// Publish text + optional photo to a Facebook Page
async function publishToPage(account, caption, mediaUrls) {
  const img = (mediaUrls || []).find(u => !/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u));
  if (img) {
    const r = await gpost(`${GRAPH}/${account.pageId}/photos`, { url: img, caption, access_token: account.token });
    const id = r.post_id || r.id;
    return { ok: true, externalUrl: `https://facebook.com/${id}`, platformId: id };
  }
  const r = await gpost(`${GRAPH}/${account.pageId}/feed`, { message: caption, access_token: account.token });
  return { ok: true, externalUrl: `https://facebook.com/${r.id}`, platformId: r.id };
}

// Delete a Facebook Page post
async function deletePost(account, postId) {
  const res = await fetch(`${GRAPH}/${postId}?access_token=${account.token}`, { method: 'DELETE' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error ? json.error.message : `Graph DELETE ${res.status}`);
  return json;
}

// Publish to Instagram (2-step: create container, then publish)
async function publishToInstagram(account, caption, mediaUrls) {
  const media = (mediaUrls || [])[0];
  if (!media) throw new Error('Instagram requires an image or video');
  const isVid = /\.(mp4|mov|m4v)(\?|#|$)/i.test(media);
  const createBody = isVid
    ? { media_type: 'REELS', video_url: media, caption, access_token: account.token }
    : { image_url: media, caption, access_token: account.token };
  const container = await gpost(`${GRAPH}/${account.id}/media`, createBody);

  // videos need processing time before publish; poll status briefly
  if (isVid) {
    for (let i = 0; i < 20; i++) {
      const st = await gget(`${GRAPH}/${container.id}?fields=status_code&access_token=${account.token}`);
      if (st.status_code === 'FINISHED') break;
      if (st.status_code === 'ERROR') throw new Error('Instagram video processing failed');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  const pub = await gpost(`${GRAPH}/${account.id}/media_publish`, { creation_id: container.id, access_token: account.token });
  return { ok: true, externalUrl: `https://instagram.com/${account.username || ''}`, id: pub.id, platformId: pub.id };
}

module.exports = { isConfigured, absMedia, authUrl, exchangeCode, getUserId, parseSignedRequest, getConnections, publishToPage, publishToInstagram, deletePost, SCOPES };
