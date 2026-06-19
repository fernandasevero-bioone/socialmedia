// Authentication: self-serve franchisee accounts with salted scrypt password
// hashing, plus a forgot-password reset flow.
//
// Multi-tenant isolation is enforced server-side by franchiseeId (= user.id)
// on every accounts/posts query.
//
// PRODUCTION notes:
// - Sessions are in-memory (sign-in is per server restart); move to a signed
//   session store.
// - Password reset links should be EMAILED via a provider (SendGrid, SES…).
//   In demo mode the app surfaces the link directly so the flow is testable
//   without an email service. Swap that in server.js (/api/forgot).
// - Consider restricting signup to invite codes or a corporate-approved
//   email domain so only real franchisees can register.
'use strict';

const crypto = require('crypto');
const store = require('./store');

const RESET_TTL_MS = 60 * 60 * 1000; // reset links valid for 1 hour

// Admin allowlist — these emails are always admins; everyone else who signs up
// is a franchisee. Add corporate admin emails here (Claude updates this list).
const ADMIN_EMAILS = [
  'fernanda.severo@biooneinc.com'
];
function roleFor(email) {
  return ADMIN_EMAILS.includes(String(email).trim().toLowerCase()) ? 'admin' : 'franchisee';
}

// ---- password hashing (scrypt, per-user salt) ----
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function verifyPassword(user, password) {
  const hash = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash));
}

// ---- seed demo users on first run ----
function seedDemoUsers() {
  if (store.getUsers().length) return;
  const demo = [
    { id: 'f-modesto',   email: 'modesto@biooneinc.com',   name: 'Patricia Smith',  location: 'Bio-One of Modesto, CA',     role: 'franchisee' },
    { id: 'f-alabama',   email: 'alabama@biooneinc.com',   name: 'James Carter',    location: 'Bio-One of Birmingham, AL',  role: 'franchisee' }
  ];
  for (const u of demo) {
    const salt = crypto.randomBytes(16).toString('hex');
    store.addUser({ ...u, salt, passwordHash: hashPassword('demo', salt), createdAt: new Date().toISOString() });
  }
}
seedDemoUsers();

// ---- sessions ----
const sessions = new Map(); // token -> userId

function login(email, password) {
  const user = store.getUserByEmail(email);
  if (!user || !verifyPassword(user, password)) return null;
  // self-correct role from the allowlist (e.g. an admin who signed up earlier)
  const desired = roleFor(user.email);
  if (user.role !== desired) { store.updateUser(user.id, { role: desired }); user.role = desired; }
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
  const user = store.getUsers().find(u => u.id === id);
  return user ? publicUser(user) : null;
}

// ---- self-serve registration (always creates a franchisee, never an admin) ----
function register({ name, location, email, password }) {
  if (!name || !email || !password) return { error: 'Name, email, and password are required' };
  if (String(password).length < 6) return { error: 'Password must be at least 6 characters' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Please enter a valid email address' };
  if (store.getUserByEmail(email)) return { error: 'An account with this email already exists' };

  const salt = crypto.randomBytes(16).toString('hex');
  const user = store.addUser({
    id: 'f-' + crypto.randomBytes(6).toString('hex'),
    email: String(email).trim(),
    name: String(name).trim(),
    location: String(location || '').trim() || 'Bio-One Franchise',
    role: roleFor(email),
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString()
  });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, user.id);
  return { token, user: publicUser(user) };
}

// ---- forgot / reset password ----
function createResetToken(email) {
  const user = store.getUserByEmail(email);
  if (!user) return null; // caller responds identically either way (no account enumeration)
  const resetToken = crypto.randomBytes(32).toString('hex');
  store.updateUser(user.id, { resetToken, resetExpires: Date.now() + RESET_TTL_MS });
  return resetToken;
}

function resetPassword(resetToken, newPassword) {
  if (!resetToken) return { error: 'Invalid reset link' };
  if (String(newPassword).length < 6) return { error: 'Password must be at least 6 characters' };
  const user = store.getUsers().find(u => u.resetToken === resetToken);
  if (!user || !user.resetExpires || Date.now() > user.resetExpires) {
    return { error: 'This reset link is invalid or has expired. Request a new one.' };
  }
  const salt = crypto.randomBytes(16).toString('hex');
  store.updateUser(user.id, {
    salt,
    passwordHash: hashPassword(newPassword, salt),
    resetToken: null,
    resetExpires: null
  });
  return { ok: true, email: user.email };
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, location: u.location, role: u.role };
}

// sanitized list of all sign-ups (no password material) for corporate
function listUsers() {
  return store.getUsers().map(u => ({
    email: u.email, name: u.name, location: u.location, role: u.role, createdAt: u.createdAt || null
  }));
}

// corporate deletes a franchisee account (and their data). Admins can't be deleted here.
function deleteUser(email) {
  const u = store.getUserByEmail(email);
  if (!u) return { error: 'User not found' };
  if (u.role === 'admin') return { error: 'Admin accounts cannot be deleted here' };
  store.deleteUser(u.id);
  return { ok: true };
}

module.exports = { login, logout, userForToken, register, createResetToken, resetPassword, listUsers, deleteUser };
