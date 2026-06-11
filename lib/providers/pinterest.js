// Pinterest — API v5
//
// GOING LIVE:
// 1. Create an app at developers.pinterest.com; trial access works for
//    development, request standard access for production.
// 2. OAuth 2.0 with `pins:write boards:read` scopes.
// 3. Publish: POST api.pinterest.com/v5/pins
//    { board_id, title, description, media_source: { source_type: "image_url", url } }
//    Pins require an image — pair library graphics with each caption.
'use strict';

function meta() {
  return {
    id: 'pinterest',
    name: 'Pinterest',
    color: '#E60023',
    captionLimit: 500,
    liveReady: false
  };
}

async function connect(franchiseeId, params = {}) {
  return {
    handle: params.handle || 'Bio-One ' + franchiseeId.replace('f-', ''),
    status: 'connected (demo)',
    connectedAt: new Date().toISOString()
  };
}

async function publish(account, post) {
  // TODO(live): POST /v5/pins with board selection.
  return { ok: true, externalUrl: 'https://pinterest.com/pin/demo-' + post.id, demo: true };
}

module.exports = { meta, connect, publish };
