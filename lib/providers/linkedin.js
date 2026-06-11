// LinkedIn — Community Management API
//
// GOING LIVE:
// 1. Create a LinkedIn app, apply for the Community Management API
//    (posting to Company Pages; personal-profile posting is restricted).
// 2. OAuth 2.0 with `w_organization_social` scope.
// 3. Publish: POST api.linkedin.com/rest/posts
//    { author: "urn:li:organization:{id}", commentary, visibility: "PUBLIC", ... }
'use strict';

function meta() {
  return {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0A66C2',
    captionLimit: 3000,
    liveReady: false
  };
}

async function connect(franchiseeId, params = {}) {
  return {
    handle: params.handle || 'Bio-One ' + franchiseeId.replace('f-', '') + ' (Company Page)',
    status: 'connected (demo)',
    connectedAt: new Date().toISOString()
  };
}

async function publish(account, post) {
  // TODO(live): POST /rest/posts with organization URN.
  return { ok: true, externalUrl: 'https://linkedin.com/feed/update/demo-' + post.id, demo: true };
}

module.exports = { meta, connect, publish };
