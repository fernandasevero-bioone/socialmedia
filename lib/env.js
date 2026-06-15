// Tiny .env loader (no dependency). Reads config/platforms.env into
// process.env if the file exists, without overwriting vars already set by the
// host (Render injects real env vars in production).
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const file = path.join(__dirname, '..', 'config', 'platforms.env');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^["']|["']$/g, '');
    if (val && process.env[key] === undefined) process.env[key] = val;
  }
}

module.exports = { loadEnv };
