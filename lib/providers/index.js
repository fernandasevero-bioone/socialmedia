// Platform provider registry.
//
// Every provider implements the same interface:
//   meta()                         -> { id, name, color, captionLimit, liveReady }
//   connect(franchiseeId, params)  -> account info to store (demo: simulated)
//   publish(account, post)         -> { ok, externalUrl?, error? }
//
// DEMO MODE: all providers simulate success so franchisees can experience
// the full flow today. To take a platform live, set its credentials in
// config/platforms.env and implement the marked TODO in its file —
// nothing else in the app changes.
'use strict';

const facebook  = require('./facebook');
const instagram = require('./instagram');
const linkedin  = require('./linkedin');
const tiktok    = require('./tiktok');
const pinterest = require('./pinterest');

const providers = { facebook, instagram, linkedin, tiktok, pinterest };

// Platforms hidden from the UI until their credentials are configured.
// (Pinterest is parked — weak audience fit for Bio-One. The integration stays
// dormant; setting PINTEREST_APP_ID/SECRET makes it reappear automatically.)
const HIDDEN_UNTIL_CONFIGURED = ['pinterest'];

function get(platformId) {
  return providers[platformId] || null; // publish/scheduler still work if an account exists
}

function allMeta() {
  return Object.values(providers)
    .map(p => p.meta())
    .filter(m => !HIDDEN_UNTIL_CONFIGURED.includes(m.id) || m.liveReady);
}

module.exports = { get, allMeta };
