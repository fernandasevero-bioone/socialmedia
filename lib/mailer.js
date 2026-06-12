// Email notifications.
//
// DEMO MODE: there's no email service wired up (and outbound network is
// restricted), so "sending" records the message to an in-memory + on-disk
// outbox and logs it. Corporate can review the outbox in the app, which also
// proves the trigger fired.
//
// PRODUCTION: replace `deliver()` with a real provider call (SendGrid, AWS
// SES, Postmark…). Everything else — when/what we send — stays the same.
'use strict';

const fs = require('fs');
const path = require('path');

const OUTBOX_PATH = path.join(__dirname, '..', 'data', 'outbox.json');

function loadOutbox() {
  try { return JSON.parse(fs.readFileSync(OUTBOX_PATH, 'utf8')); } catch { return []; }
}
function saveOutbox(list) {
  fs.mkdirSync(path.dirname(OUTBOX_PATH), { recursive: true });
  fs.writeFileSync(OUTBOX_PATH, JSON.stringify(list, null, 2));
}

function deliver({ to, subject, body }) {
  // DEMO delivery: log + persist to the outbox.
  // PRODUCTION: await sendgrid.send({ to, from, subject, text: body })
  const record = { to, subject, body, sentAt: new Date().toISOString() };
  const outbox = loadOutbox();
  outbox.unshift(record);
  saveOutbox(outbox.slice(0, 200)); // keep the most recent 200
  console.log(`[mailer] (demo) → ${to}: ${subject}`);
  return record;
}

// Notify a franchisee that one or more platforms FAILED to publish.
function sendPublishFailure(toEmail, name, post, failures) {
  const lines = failures.map(f => `  • ${f.platform}: ${f.error || 'unknown error'}`).join('\n');
  const when = post.scheduledFor ? `scheduled for ${new Date(post.scheduledFor).toLocaleString()}` : 'just now';
  return deliver({
    to: toEmail,
    subject: `⚠️ Bio-One Social Hub: a post failed to publish`,
    body:
`Hi ${name || ''},

We couldn't publish your post (${when}) to the following account(s):

${lines}

Your other platforms (if any) went out fine. You can edit and try again from
the Bio-One Social Hub.

Caption:
"${(post.caption || '').slice(0, 280)}"

— Bio-One Social Hub`
  });
}

function getOutbox() {
  return loadOutbox();
}

module.exports = { sendPublishFailure, getOutbox, deliver };
