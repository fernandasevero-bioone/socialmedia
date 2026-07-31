// LinkedIn API helper — OAuth + publishing to Company Pages the franchisee
// administers (Community Management API).
//
// Activates only when LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET are set
// (otherwise the app stays in demo mode). Uses global fetch (Node 18+).
//
// Flow:
//   1. authUrl() → send the franchisee to LinkedIn's consent screen.
//   2. callback: exchangeCode() → access token → getOrganizations() lists the
//      Company Pages they administer.
//   3. publishToOrg() posts on their behalf (text, or text + image).
'use strict';

const AUTH_BASE = 'https://www.linkedin.com/oauth/v2';
const API = 'https://api.linkedin.com/rest';

// Community Management API scopes: read + write org posts, list orgs adminned.
const SCOPES = ['r_organization_social', 'w_organization_social', 'rw_organization_admin'].join(' ');

function isConfigured() {
  return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

// LinkedIn versions its REST API monthly and only accepts recent versions
// (~last 12 months). Override via LINKEDIN_API_VERSION if they sunset this one.
function apiVersion() { return process.env.LINKEDIN_API_VERSION || '202606'; }

function headers(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': apiVersion(),
    'X-Restli-Protocol-Version': '2.0.0',
    ...extra
  };
}

async function lget(path, token) {
  const res = await fetch(API + path, { headers: headers(token) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `LinkedIn GET ${res.status}`);
  return json;
}

async function lpost(path, token, body, extraHeaders = {}) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: headers(token, { 'Content-Type': 'application/json', ...extraHeaders }),
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `LinkedIn POST ${res.status}`);
  return { json, headers: res.headers };
}

// Step 1: consent screen URL
function authUrl(redirectUri, state) {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES
  });
  return `${AUTH_BASE}/authorization?${p}`;
}

// Step 2: code → access token (~60 days)
async function exchangeCode(code, redirectUri) {
  const res = await fetch(`${AUTH_BASE}/accessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(json.error_description || `LinkedIn token exchange ${res.status}`);
  return json.access_token;
}

// Revoke a token at LinkedIn (called on disconnect so the app authorization is
// actually released, not just forgotten locally).
async function revokeToken(token) {
  if (!token) return;
  try {
    await fetch('https://www.linkedin.com/oauth/v2/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        token
      })
    });
  } catch { /* best-effort */ }
}

// Company Pages the user administers: [{ id, urn, name }]
async function getOrganizations(token) {
  const acls = await lget('/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED', token);
  const orgs = [];
  for (const el of (acls.elements || [])) {
    const urn = el.organization; // "urn:li:organization:12345"
    const id = String(urn).split(':').pop();
    let name = 'LinkedIn Page ' + id;
    try {
      const org = await lget(`/organizations/${id}`, token);
      name = org.localizedName || name;
    } catch { /* keep fallback name */ }
    orgs.push({ id, urn, name });
  }
  return orgs;
}

// Upload one image so it can be attached to a post. Downloads the media from
// our own public URL and streams it to LinkedIn's upload endpoint.
async function uploadImage(token, orgUrn, imageUrl) {
  const init = await lpost('/images?action=initializeUpload', token, {
    initializeUploadRequest: { owner: orgUrn }
  });
  const { uploadUrl, image } = init.json.value;
  const src = await fetch(imageUrl);
  if (!src.ok) throw new Error(`could not fetch media (${src.status})`);
  const buf = Buffer.from(await src.arrayBuffer());
  const up = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: buf });
  if (!up.ok) throw new Error(`image upload failed (${up.status})`);
  return image; // "urn:li:image:..."
}

// Publish a post to a Company Page (text, or text + first image).
// account: { orgUrn, orgId, token } — token decrypted by the caller.
async function publishToOrg(account, caption, mediaUrls) {
  const body = {
    author: account.orgUrn,
    commentary: caption || '',
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false
  };
  const img = (mediaUrls || []).find(u => !/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u));
  if (img) {
    try {
      const imageUrn = await uploadImage(account.token, account.orgUrn, img);
      body.content = { media: { id: imageUrn } };
    } catch { /* fall back to text-only rather than failing the post */ }
  }
  const r = await lpost('/posts', account.token, body);
  const postUrn = r.headers.get('x-restli-id') || (r.json && r.json.id) || '';
  return {
    ok: true,
    platformId: postUrn,
    externalUrl: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}/` : `https://www.linkedin.com/company/${account.orgId}/`
  };
}

// Delete a Company Page post
async function deleteOrgPost(account, postUrn) {
  const res = await fetch(`${API}/posts/${encodeURIComponent(postUrn)}`, {
    method: 'DELETE',
    headers: headers(account.token)
  });
  if (!res.ok && res.status !== 404) throw new Error(`LinkedIn DELETE ${res.status}`);
  return { ok: true };
}

module.exports = { isConfigured, authUrl, exchangeCode, revokeToken, getOrganizations, publishToOrg, deleteOrgPost, SCOPES };
