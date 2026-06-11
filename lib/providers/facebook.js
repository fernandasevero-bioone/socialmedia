// Facebook Pages — Meta Graph API
//
// GOING LIVE:
// 1. Create a Meta app at developers.facebook.com (Business type).
// 2. Request `pages_manage_posts`, `pages_read_engagement` in App Review.
// 3. OAuth: redirect franchisee to the Facebook Login dialog, exchange the
//    code for a long-lived Page access token, store it encrypted.
// 4. Publish: POST graph.facebook.com/{page-id}/feed  { message }
//    (or /photos with image url for image posts).
'use strict';

function meta() {
  return {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    captionLimit: 63206,
    liveReady: false // flip true once Meta App Review is approved
  };
}

async function connect(franchiseeId, params = {}) {
  // DEMO: simulate a connected Facebook Page.
  // TODO(live): full OAuth code exchange + page selection.
  return {
    handle: params.handle || 'Bio-One ' + franchiseeId.replace('f-', ''),
    status: 'connected (demo)',
    connectedAt: new Date().toISOString()
  };
}

async function publish(account, post) {
  // DEMO: simulate a successful page post.
  // TODO(live): POST /{page-id}/feed with the page access token.
  return { ok: true, externalUrl: 'https://facebook.com/demo/posts/' + post.id, demo: true };
}

module.exports = { meta, connect, publish };
