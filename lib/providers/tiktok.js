// TikTok — Content Posting API.
//
// Live publishing activates when TIKTOK_CLIENT_KEY/SECRET are set AND the
// account was connected via OAuth. Otherwise demo. Connecting happens through
// the /oauth/tiktok/* routes.
//
// TikTok access tokens last ~24h; publish() auto-refreshes via the stored
// refresh token and returns `_updatedAccount` so the server can persist the
// new tokens (encrypted).
'use strict';

const tiktok = require('../tiktok');
const metaHelpers = require('../meta'); // absMedia (public URLs for media)

function meta() {
  return {
    id: 'tiktok',
    name: 'TikTok',
    color: '#FE2C55',
    captionLimit: 2200,
    liveReady: tiktok.isConfigured(),
    oauth: tiktok.isConfigured(),
    connectUrl: '/oauth/tiktok/start'
  };
}

async function connect(franchiseeId, params = {}) {
  // DEMO connect (used only when TikTok isn't configured)
  return {
    handle: params.handle || '@bioone.' + franchiseeId.replace('f-', ''),
    status: 'connected (demo)',
    connectedAt: new Date().toISOString()
  };
}

async function publish(account, post) {
  if (tiktok.isConfigured() && account && (account.token || account.refreshToken)) {
    try {
      const { token, renewed } = await tiktok.getValidToken(account);
      const result = await tiktok.publish({ token }, post.caption,
        metaHelpers.absMedia(post.media || (post.image ? [post.image] : [])), account.handle);
      if (renewed) result._updatedAccount = renewed; // server persists (encrypted)
      return result;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  return { ok: true, externalUrl: 'https://tiktok.com/@demo/video/' + post.id, demo: true };
}

module.exports = { meta, connect, publish };
