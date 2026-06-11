// Simple JSON-file persistence for demo mode.
// Swap this module for Postgres/Prisma when moving to production —
// every read/write goes through the functions below.
'use strict';

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const EMPTY = {
  // users: franchisee/admin logins
  // [{ id, email, name, location, role, passwordHash, salt, resetToken?, resetExpires? }]
  users: [],
  // accounts: connected social accounts, keyed by franchiseeId
  // { [franchiseeId]: { facebook: {handle, connectedAt, status}, ... } }
  accounts: {},
  // posts: published/scheduled post records
  // [{ id, franchiseeId, libraryId, caption, platforms, status, scheduledFor, createdAt, results }]
  posts: []
};

function load() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    // older db files predate the users collection
    if (!db.users) db.users = [];
    return db;
  } catch {
    return structuredClone(EMPTY);
  }
}

function save(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getAccounts(franchiseeId) {
  const db = load();
  return db.accounts[franchiseeId] || {};
}

function setAccount(franchiseeId, platform, info) {
  const db = load();
  db.accounts[franchiseeId] = db.accounts[franchiseeId] || {};
  db.accounts[franchiseeId][platform] = info;
  save(db);
  return db.accounts[franchiseeId];
}

function removeAccount(franchiseeId, platform) {
  const db = load();
  if (db.accounts[franchiseeId]) {
    delete db.accounts[franchiseeId][platform];
    save(db);
  }
  return db.accounts[franchiseeId] || {};
}

function getPosts(franchiseeId) {
  const db = load();
  return db.posts
    .filter(p => p.franchiseeId === franchiseeId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function addPost(post) {
  const db = load();
  db.posts.push(post);
  save(db);
  return post;
}

// update fields on a post — only if it belongs to this franchisee
function updatePost(franchiseeId, id, fields) {
  const db = load();
  const post = db.posts.find(p => p.id === id && p.franchiseeId === franchiseeId);
  if (!post) return null;
  Object.assign(post, fields);
  save(db);
  return post;
}

function deletePost(franchiseeId, id) {
  const db = load();
  const before = db.posts.length;
  db.posts = db.posts.filter(p => !(p.id === id && p.franchiseeId === franchiseeId));
  if (db.posts.length === before) return false;
  save(db);
  return true;
}

function getPost(franchiseeId, id) {
  return load().posts.find(p => p.id === id && p.franchiseeId === franchiseeId) || null;
}

// ---- users ----
function getUsers() {
  return load().users;
}

function getUserByEmail(email) {
  return load().users.find(u => u.email.toLowerCase() === String(email).toLowerCase()) || null;
}

function addUser(user) {
  const db = load();
  db.users.push(user);
  save(db);
  return user;
}

function updateUser(id, fields) {
  const db = load();
  const user = db.users.find(u => u.id === id);
  if (!user) return null;
  Object.assign(user, fields);
  save(db);
  return user;
}

module.exports = { getAccounts, setAccount, removeAccount, getPosts, addPost, getPost, updatePost, deletePost, getUsers, getUserByEmail, addUser, updateUser };
