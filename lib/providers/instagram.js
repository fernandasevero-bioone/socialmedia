// Instagram — Meta Graph API (Content Publishing).
//
// Live publishing activates when META_APP_ID/SECRET are set AND the account was
// connected via OAuth (IG Business account + page token present). IG must be a
// Business/Creator account linked to a Facebook Page. Connecting happens through
// the /oauth/meta/* routes (the same Meta login also links Instagram).
'use strict';

const meta = require('../meta');

function meta_() {
  return {
    id: 'instagram',
    name: 'Instagram',
    color: '#E4405F',
    captionLimit: 2200,
    liveReady: meta.isConfigured(),
    oauth: meta.isConfigured(),
    connectUrl: '/oauth/meta/start'
  };
}

async function connect(franchiseeId, params = {}) {
  return {
    handle: params.handle || '@bioone_' + franchiseeId.replace('f-', ''),
    status: 'connected (demo)',
    connectedAt: new Date().toISOString()
  };
}

async function publish(account, post) {
  if (meta.isConfigured() && account && account.token && account.id) {
    try {
      return await meta.publishToInstagram(account, post.caption, meta.absMedia(post.media || (post.image ? [post.image] : [])));
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  return { ok: true, externalUrl: 'https://instagram.com/p/demo-' + post.id, demo: true };
}

module.exports = { meta: meta_, connect, publish };
