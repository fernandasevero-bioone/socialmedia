// LinkedIn — Community Management API (Company Pages).
//
// Live publishing activates when LINKEDIN_CLIENT_ID/SECRET are set AND the
// account was connected via OAuth (org URN + token present). Otherwise demo.
// Connecting happens through the /oauth/linkedin/* routes.
'use strict';

const linkedin = require('../linkedin');
const metaHelpers = require('../meta'); // absMedia (public URLs for media)

function meta() {
  return {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0A66C2',
    captionLimit: 3000,
    liveReady: linkedin.isConfigured(),
    oauth: linkedin.isConfigured(),
    connectUrl: '/oauth/linkedin/start'
  };
}

async function connect(franchiseeId, params = {}) {
  // DEMO connect (used only when LinkedIn isn't configured)
  return {
    handle: params.handle || 'Bio-One ' + franchiseeId.replace('f-', '') + ' (Company Page)',
    status: 'connected (demo)',
    connectedAt: new Date().toISOString()
  };
}

async function publish(account, post) {
  if (linkedin.isConfigured() && account && account.token && account.orgUrn) {
    try {
      return await linkedin.publishToOrg(account, post.caption,
        metaHelpers.absMedia(post.media || (post.image ? [post.image] : [])));
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  return { ok: true, externalUrl: 'https://linkedin.com/feed/update/demo-' + post.id, demo: true };
}

module.exports = { meta, connect, publish };
