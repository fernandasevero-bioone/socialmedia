// Instagram — Meta Graph API (Content Publishing)
//
// GOING LIVE:
// 1. Franchisee's Instagram must be a Business/Creator account linked to
//    their Facebook Page (personal accounts cannot publish via API).
// 2. Same Meta app as Facebook; request `instagram_content_publish`.
// 3. Publish is two steps:
//    a. POST /{ig-user-id}/media        { image_url, caption } -> creation_id
//    b. POST /{ig-user-id}/media_publish { creation_id }
//    Note: image posts require a publicly reachable image URL.
'use strict';

function meta() {
  return {
    id: 'instagram',
    name: 'Instagram',
    color: '#E4405F',
    captionLimit: 2200,
    liveReady: false
  };
}

async function connect(franchiseeId, params = {}) {
  // DEMO: simulate a connected IG Business account.
  return {
    handle: params.handle || '@bioone_' + franchiseeId.replace('f-', ''),
    status: 'connected (demo)',
    connectedAt: new Date().toISOString()
  };
}

async function publish(account, post) {
  // TODO(live): two-step media container create + publish.
  return { ok: true, externalUrl: 'https://instagram.com/p/demo-' + post.id, demo: true };
}

module.exports = { meta, connect, publish };
