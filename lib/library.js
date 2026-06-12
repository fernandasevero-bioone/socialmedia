// Content library store — read/write access to data/library.json so the
// corporate admin can manage posts AND categories from the UI (no redeploy).
//
// PRODUCTION: move this to the same database as lib/store.js. The function
// signatures below are what the rest of the app depends on, so a DB-backed
// version is a drop-in replacement.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIB_PATH = path.join(__dirname, '..', 'data', 'library.json');

function loadDoc() {
  const raw = JSON.parse(fs.readFileSync(LIB_PATH, 'utf8'));
  raw.posts = raw.posts || [];
  // seed the managed category list from existing posts the first time
  if (!raw.categories) {
    raw.categories = [...new Set(raw.posts.map(p => p.category).filter(Boolean))];
    saveDoc(raw);
  }
  return raw;
}

function saveDoc(doc) {
  fs.writeFileSync(LIB_PATH, JSON.stringify(doc, null, 2));
}

// ---- posts ----
function all() {
  return loadDoc().posts;
}

function create({ title, category, caption, image, platforms }) {
  const doc = loadDoc();
  const post = {
    id: 'lib-' + crypto.randomBytes(4).toString('hex'),
    category: category || '',
    title: title || 'Untitled post',
    image: image || '/img/posts/announcement.svg',
    caption: caption || '',
    platforms: Array.isArray(platforms) && platforms.length
      ? platforms
      : ['facebook', 'instagram', 'linkedin', 'x']
  };
  doc.posts.unshift(post);
  saveDoc(doc);
  return post;
}

function update(id, fields) {
  const doc = loadDoc();
  const post = doc.posts.find(p => p.id === id);
  if (!post) return null;
  for (const key of ['title', 'category', 'caption', 'image', 'platforms']) {
    if (fields[key] !== undefined) post[key] = fields[key];
  }
  saveDoc(doc);
  return post;
}

function remove(id) {
  const doc = loadDoc();
  const next = doc.posts.filter(p => p.id !== id);
  if (next.length === doc.posts.length) return false;
  doc.posts = next;
  saveDoc(doc);
  return true;
}

// ---- categories ----
function categories() {
  return loadDoc().categories;
}

function addCategory(name) {
  const clean = String(name || '').trim();
  if (!clean) return { error: 'Category name is required' };
  const doc = loadDoc();
  if (doc.categories.some(c => c.toLowerCase() === clean.toLowerCase())) {
    return { error: 'That category already exists' };
  }
  doc.categories.push(clean);
  saveDoc(doc);
  return { categories: doc.categories };
}

function renameCategory(oldName, newName) {
  const clean = String(newName || '').trim();
  if (!clean) return { error: 'Category name is required' };
  const doc = loadDoc();
  const idx = doc.categories.findIndex(c => c === oldName);
  if (idx === -1) return { error: 'Category not found' };
  if (doc.categories.some(c => c.toLowerCase() === clean.toLowerCase() && c !== oldName)) {
    return { error: 'That category already exists' };
  }
  doc.categories[idx] = clean;
  // keep posts in sync with the rename
  doc.posts.forEach(p => { if (p.category === oldName) p.category = clean; });
  saveDoc(doc);
  return { categories: doc.categories };
}

function removeCategory(name) {
  const doc = loadDoc();
  const before = doc.categories.length;
  doc.categories = doc.categories.filter(c => c !== name);
  if (doc.categories.length === before) return { error: 'Category not found' };
  // posts that used it become uncategorized rather than pointing at a ghost
  doc.posts.forEach(p => { if (p.category === name) p.category = ''; });
  saveDoc(doc);
  return { categories: doc.categories };
}

module.exports = { all, create, update, remove, categories, addCategory, renameCategory, removeCategory };
