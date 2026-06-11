// Content library store — read/write access to data/library.json so the
// corporate admin can manage posts from the UI (no redeploy needed).
//
// PRODUCTION: move this to the same database as lib/store.js. The function
// signatures below are what the rest of the app depends on, so a DB-backed
// version is a drop-in replacement.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIB_PATH = path.join(__dirname, '..', 'data', 'library.json');

function load() {
  const raw = JSON.parse(fs.readFileSync(LIB_PATH, 'utf8'));
  return raw.posts || [];
}

function save(posts) {
  const existing = JSON.parse(fs.readFileSync(LIB_PATH, 'utf8'));
  existing.posts = posts;
  fs.writeFileSync(LIB_PATH, JSON.stringify(existing, null, 2));
}

function all() {
  return load();
}

function create({ title, category, caption, image, platforms }) {
  const posts = load();
  const post = {
    id: 'lib-' + crypto.randomBytes(4).toString('hex'),
    category: category || 'General',
    title: title || 'Untitled post',
    image: image || '/img/posts/announcement.svg',
    caption: caption || '',
    platforms: Array.isArray(platforms) && platforms.length
      ? platforms
      : ['facebook', 'instagram', 'linkedin', 'x']
  };
  posts.unshift(post);
  save(posts);
  return post;
}

function update(id, fields) {
  const posts = load();
  const post = posts.find(p => p.id === id);
  if (!post) return null;
  for (const key of ['title', 'category', 'caption', 'image', 'platforms']) {
    if (fields[key] !== undefined) post[key] = fields[key];
  }
  save(posts);
  return post;
}

function remove(id) {
  const posts = load();
  const next = posts.filter(p => p.id !== id);
  if (next.length === posts.length) return false;
  save(next);
  return true;
}

module.exports = { all, create, update, remove };
