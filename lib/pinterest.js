// Pinterest API helper — OAuth + create Pins (API v5).
//
// Activates only when PINTEREST_APP_ID + PINTEREST_APP_SECRET are set
// (otherwise the app stays in demo mode). Uses global fetch (Node 18+).
//
// Flow:
//   1. authUrl() → send the franchisee to Pinterest's consent screen.
//   2. callback: exchangeCode() → access token → getBoards() lists their boards.
//   3. publishPin() creates a Pin (image required) on a chosen board.
'use strict';

const AUTH_URL = 'https://www.pinterest.com/oauth/';
const API = 'https://api.pinterest.com/v5';

const SCOPES = ['boards:read', 'pins:read', 'pins:write', 'user_accounts:read'].join(',');

function isConfigured() {
  return !!(process.env.PINTEREST_APP_ID && process.env.PINTEREST_APP_SECRET);
}

function basicAuth() {
  return 'Basic ' + Buffer.from(`${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`).toString('base64');
}

// Step 1: consent screen URL
function authUrl(redirectUri, state) {
  const p = new URLSearchParams({
    client_id: process.env.PINTEREST_APP_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state
  });
  return `${AUTH_URL}?${p}`;
}

// Step 2: code → access token
async function exchangeCode(code, redirectUri) {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(json.message || json.error_description || `Pinterest token exchange ${res.status}`);
  return json.access_token;
}

async function pget(path, token) {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Pinterest GET ${res.status}`);
  return json;
}

async function ppost(path, token, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Pinterest POST ${res.status}`);
  return json;
}

// Boards the user owns: [{ id, name }]
async function getBoards(token) {
  const data = await pget('/boards?page_size=100', token);
  return (data.items || []).map(b => ({ id: b.id, name: b.name }));
}

async function getUsername(token) {
  try { const u = await pget('/user_account', token); return u.username || ''; } catch { return ''; }
}

// Create a Pin (Pinterest requires an image). account: { boardId, token } — token decrypted.
async function publishPin(account, caption, mediaUrls) {
  const img = (mediaUrls || []).find(u => !/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u));
  if (!img) throw new Error('Pinterest requires an image');
  const pin = await ppost('/pins', account.token, {
    board_id: account.boardId,
    description: (caption || '').slice(0, 500),
    media_source: { source_type: 'image_url', url: img }
  });
  return { ok: true, platformId: pin.id, externalUrl: pin.id ? `https://www.pinterest.com/pin/${pin.id}/` : 'https://www.pinterest.com/' };
}

// Delete a Pin
async function deletePin(account, pinId) {
  const res = await fetch(`${API}/pins/${pinId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${account.token}` } });
  if (!res.ok && res.status !== 404) throw new Error(`Pinterest DELETE ${res.status}`);
  return { ok: true };
}

module.exports = { isConfigured, authUrl, exchangeCode, getBoards, getUsername, publishPin, deletePin, SCOPES };
