// Pinterest — API v5 (create Pins).
//
// Live publishing activates when PINTEREST_APP_ID/SECRET are set AND the
// account was connected via OAuth (board + token present). Otherwise demo.
// Connecting happens through the /oauth/pinterest/* routes.
'use strict';

const pinterest = require('../pinterest');
const metaHelpers = require('../meta'); // absMedia (public URLs for media)

function meta() {
  return {
    id: 'pinterest',
    name: 'Pinterest',
    color: '#E60023',
    captionLimit: 500,
    liveReady: pinterest.isConfigured(),
    oauth: pinterest.isConfigured(),
    connectUrl: '/oauth/pinterest/start'
  };
}

async function connect(franchiseeId, params = {}) {
  // DEMO connect (used only when Pinterest isn't configured)
  return {
    handle: params.handle || 'Bio-One ' + franchiseeId.replace('f-', ''),
    status: 'connected (demo)',
    connectedAt: new Date().toISOString()
  };
}

async function publish(account, post) {
  if (pinterest.isConfigured() && account && account.token && account.boardId) {
    try {
      return await pinterest.publishPin(account, post.caption,
        metaHelpers.absMedia(post.media || (post.image ? [post.image] : [])));
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  return { ok: true, externalUrl: 'https://pinterest.com/pin/demo-' + post.id, demo: true };
}

module.exports = { meta, connect, publish };
