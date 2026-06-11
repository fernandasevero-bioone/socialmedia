// X (Twitter) — API v2
//
// GOING LIVE:
// 1. X API write access requires a paid tier (Basic, ~$100/mo, covers the
//    whole app — not per franchisee).
// 2. OAuth 2.0 PKCE with `tweet.write users.read offline.access` scopes.
// 3. Publish: POST api.x.com/2/tweets { text }
//    (media upload is a separate endpoint, then attach media_ids).
'use strict';

function meta() {
  return {
    id: 'x',
    name: 'X',
    color: '#242428', // brand Soft Black — X's own black clashes less this way
    captionLimit: 280,
    liveReady: false
  };
}

async function connect(franchiseeId, params = {}) {
  return {
    handle: params.handle || '@BioOne_' + franchiseeId.replace('f-', ''),
    status: 'connected (demo)',
    connectedAt: new Date().toISOString()
  };
}

async function publish(account, post) {
  // TODO(live): POST /2/tweets with user access token.
  return { ok: true, externalUrl: 'https://x.com/demo/status/' + post.id, demo: true };
}

module.exports = { meta, connect, publish };
