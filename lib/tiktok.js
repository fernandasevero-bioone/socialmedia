// TikTok API helper — OAuth + Content Posting API (direct post).
//
// Activates only when TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET are set
// (otherwise the app stays in demo mode). Uses global fetch (Node 18+).
//
// TikTok specifics the other platforms don't have:
// - Access tokens last only ~24h; a refresh token (valid ~1 year) renews
//   them. getValidToken() auto-refreshes and reports the new tokens so the
//   caller can persist them.
// - PULL_FROM_URL publishing requires the media domain to be VERIFIED in the
//   TikTok developer portal (host their verification file — see setup doc).
// - Until the app passes TikTok's audit, posts can only be SELF_ONLY
//   (private). publish() tries public first, then falls back and says so.
'use strict';

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const API = 'https://open.tiktokapis.com/v2';

const SCOPES = ['user.info.basic', 'video.publish', 'video.upload'].join(',');

function isConfigured() {
  return !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

// Step 1: consent screen URL
function authUrl(redirectUri, state) {
  const p = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: redirectUri,
    state
  });
  return `${AUTH_URL}?${p}`;
}

async function tokenRequest(params) {
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      ...params
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `TikTok token request ${res.status}`);
  }
  return {
    token: json.access_token,
    refreshToken: json.refresh_token,
    openId: json.open_id,
    expiresAt: new Date(Date.now() + (json.expires_in || 86400) * 1000).toISOString()
  };
}

// Step 2: code → tokens
function exchangeCode(code, redirectUri) {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

// Renew a ~24h access token with the long-lived refresh token
function refreshAccessToken(refreshToken) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

// Ensure a usable access token. account: { token, refreshToken, expiresAt }
// (tokens already decrypted). Returns { token, renewed? } where `renewed`
// holds fresh tokens the caller must persist.
async function getValidToken(account) {
  const expires = account.expiresAt ? new Date(account.expiresAt).getTime() : 0;
  if (account.token && expires > Date.now() + 5 * 60 * 1000) return { token: account.token };
  if (!account.refreshToken) throw new Error('TikTok session expired — reconnect the account');
  const renewed = await refreshAccessToken(account.refreshToken);
  return { token: renewed.token, renewed };
}

async function getUserInfo(token) {
  const res = await fetch(`${API}/user/info/?fields=open_id,display_name,avatar_url`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json.error && json.error.message) || `TikTok user info ${res.status}`);
  return (json.data && json.data.user) || {};
}

async function apiPost(path, token, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  const errCode = json.error && json.error.code;
  if (!res.ok || (errCode && errCode !== 'ok')) {
    throw new Error((json.error && json.error.message) || errCode || `TikTok POST ${res.status}`);
  }
  return json.data || {};
}

function initBody(caption, mediaUrls, privacy) {
  const video = (mediaUrls || []).find(u => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u));
  const photos = (mediaUrls || []).filter(u => !/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u));
  if (video) {
    return {
      path: '/post/publish/video/init/',
      body: {
        post_info: { title: (caption || '').slice(0, 2200), privacy_level: privacy },
        source_info: { source: 'PULL_FROM_URL', video_url: video }
      }
    };
  }
  if (photos.length) {
    return {
      path: '/post/publish/content/init/',
      body: {
        post_info: { title: (caption || '').slice(0, 90), description: (caption || '').slice(0, 2200), privacy_level: privacy },
        source_info: { source: 'PULL_FROM_URL', photo_images: photos.slice(0, 35), photo_cover_index: 0 },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO'
      }
    };
  }
  throw new Error('TikTok requires an image or video');
}

// Publish (video or photos). account: { token } already validated/decrypted.
// Tries public first; before the app passes TikTok's audit only SELF_ONLY is
// allowed, so it falls back to a private post and says so in the result.
async function publish(account, caption, mediaUrls, handle) {
  let privateFallback = false;
  let data;
  try {
    const { path, body } = initBody(caption, mediaUrls, 'PUBLIC_TO_EVERYONE');
    data = await apiPost(path, account.token, body);
  } catch (err) {
    if (!/privacy|audit|unaudited|permission/i.test(err.message)) throw err;
    privateFallback = true;
    const { path, body } = initBody(caption, mediaUrls, 'SELF_ONLY');
    data = await apiPost(path, account.token, body);
  }
  return {
    ok: true,
    platformId: data.publish_id || '',
    externalUrl: `https://www.tiktok.com/@${(handle || '').replace(/^@/, '')}`,
    note: privateFallback ? 'Posted to TikTok as PRIVATE (visible only to the account) until TikTok completes the app audit.' : undefined
  };
}

module.exports = { isConfigured, authUrl, exchangeCode, refreshAccessToken, getValidToken, getUserInfo, publish, SCOPES };
