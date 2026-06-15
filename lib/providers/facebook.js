// Facebook Pages — Meta Graph API.
//
// Live publishing activates when META_APP_ID/SECRET are set AND the account was
// connected via OAuth (real page token present). Otherwise demo mode.
// Connecting happens through the /oauth/meta/* routes, not connect() below.
'use strict';

const meta = require('../meta');

function meta_() {
  return {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    captionLimit: 63206,
    liveReady: meta.isConfigured(),
    oauth: meta.isConfigured() // front-end: connect via OAuth redirect, not demo
  };
}

async function connect(franchiseeId, params = {}) {
  // DEMO connect (used only when Meta isn't configured)
  return {
    handle: params.handle || 'Bio-One ' + franchiseeId.replace('f-', ''),
    status: 'connected (demo)',
    connectedAt: new Date().toISOString()
  };
}

async function publish(account, post) {
  if (meta.isConfigured() && account && account.token && account.pageId) {
    try {
      return await meta.publishToPage(account, post.caption, meta.absMedia(post.media || (post.image ? [post.image] : [])));
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  return { ok: true, externalUrl: 'https://facebook.com/demo/posts/' + post.id, demo: true };
}

module.exports = { meta: meta_, connect, publish };
