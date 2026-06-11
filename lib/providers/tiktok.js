// TikTok — Content Posting API
//
// GOING LIVE:
// 1. Register at developers.tiktok.com, request Content Posting API.
// 2. IMPORTANT: until the app passes TikTok's audit, posts can only be
//    sent to the user's DRAFTS (they tap publish in the TikTok app).
//    After the audit, Direct Post is enabled.
// 3. Publish (photo posts): POST /v2/post/publish/content/init/
//    Video requires uploading the file or providing a verified pull URL.
'use strict';

function meta() {
  return {
    id: 'tiktok',
    name: 'TikTok',
    color: '#FE2C55',
    captionLimit: 2200,
    liveReady: false
  };
}

async function connect(franchiseeId, params = {}) {
  return {
    handle: params.handle || '@bioone.' + franchiseeId.replace('f-', ''),
    status: 'connected (demo)',
    connectedAt: new Date().toISOString()
  };
}

async function publish(account, post) {
  // TODO(live): content init + upload. Pre-audit: post lands in drafts.
  return { ok: true, externalUrl: 'https://tiktok.com/@demo/video/' + post.id, demo: true };
}

module.exports = { meta, connect, publish };
