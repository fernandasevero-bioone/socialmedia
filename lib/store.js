// Simple JSON-file persistence for demo mode.
// Swap this module for Postgres/Prisma when moving to production —
// every read/write goes through the functions below.
'use strict';

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const EMPTY = {
  // accounts: connected social accounts, keyed by franchiseeId
  // { [franchiseeId]: { facebook: {handle, connectedAt, status}, ... } }
  accounts: {},
  // posts: published/scheduled post records
  // [{ id, franchiseeId, libraryId, caption, platforms, status, scheduledFor, createdAt, results }]
  posts: []
};

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
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

module.exports = { getAccounts, setAccount, removeAccount, getPosts, addPost };
