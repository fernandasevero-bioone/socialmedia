// Demo authentication: each franchisee logs in and only ever sees
// their own connected accounts and post history (multi-tenant isolation
// is enforced server-side by franchiseeId on every query).
//
// PRODUCTION: replace with your real identity provider (e.g. the same
// SSO franchisees use for the intranet, or email magic links). Sessions
// here are in-memory; use a signed/encrypted session store in production.
'use strict';

const crypto = require('crypto');

// Demo franchisee directory. In production this comes from corporate's
// franchisee roster.
// role: 'franchisee' (connect accounts, publish) or 'admin' (corporate —
// also manages the shared content library).
const USERS = [
  { id: 'f-modesto',  email: 'modesto@biooneinc.com',  password: 'demo', name: 'Patricia Smith', location: 'Bio-One of Modesto, CA', role: 'franchisee' },
  { id: 'f-alabama',  email: 'alabama@biooneinc.com',  password: 'demo', name: 'James Carter',   location: 'Bio-One of Birmingham, AL', role: 'franchisee' },
  { id: 'f-corporate', email: 'corporate@biooneinc.com', password: 'demo', name: 'Corporate Admin', location: 'Bio-One Inc. HQ', role: 'admin' }
];

const sessions = new Map(); // token -> userId

function login(email, password) {
  const user = USERS.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || user.password !== password) return null;
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, user.id);
  return { token, user: publicUser(user) };
}

function logout(token) {
  sessions.delete(token);
}

function userForToken(token) {
  const id = sessions.get(token);
  if (!id) return null;
  const user = USERS.find(u => u.id === id);
  return user ? publicUser(user) : null;
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, location: u.location, role: u.role };
}

module.exports = { login, logout, userForToken };
