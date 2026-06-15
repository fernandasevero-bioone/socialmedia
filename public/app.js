// Bio-One Social — front-end (vanilla JS, no build step).
'use strict';

const app = document.getElementById('app');
const state = { user: null, platforms: [], accounts: {}, library: [], view: 'library', editing: null };

const api = {
  async get(p)      { const r = await fetch('/api' + p); if (!r.ok) throw await r.json(); return r.json(); },
  async post(p, b)  { const r = await fetch('/api' + p, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(b||{}) }); const j = await r.json(); if (!r.ok) throw j; return j; }
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

// Run an async action with a spinner on the clicked button (so it visibly
// "thinks" while the network call is in flight). Restores the button after.
async function withBusy(btn, fn, busyLabel) {
  if (!btn) return fn();
  const orig = btn.innerHTML;
  const wasDisabled = btn.disabled;
  btn.disabled = true;
  btn.classList.add('is-busy');
  btn.innerHTML = `<span class="spinner"></span>${busyLabel ? ' ' + busyLabel : ''}`;
  try { return await fn(); }
  finally {
    if (btn.isConnected) { btn.disabled = wasDisabled; btn.classList.remove('is-busy'); btn.innerHTML = orig; }
  }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const platMeta = id => state.platforms.find(p => p.id === id) || { name:id, color:'#7A7A80' };
const isVideo = url => /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(url || '');
// markup for a media thumbnail (image or video) inside a .thumb container
const mediaThumb = (url, alt) => isVideo(url)
  ? `<video src="${esc(url)}" muted playsinline preload="metadata"></video><span class="play-badge">▶</span>`
  : `<img src="${esc(url)}" alt="${esc(alt||'')}" onerror="this.style.display='none'"/>`;

// ---------- bootstrap ----------
const META_MSG = {
  connected: '✅ Facebook/Instagram connected!',
  nopage: 'Connected, but no Facebook Page was found on that account.',
  denied: 'Connection canceled.',
  expired: 'That connection link expired — please try again.',
  error: 'Could not connect to Meta. Please try again.'
};

async function boot() {
  // initial view from the URL slug (e.g. /calendar)
  const fromPath = viewFromPath();
  if (fromPath) state.view = fromPath;
  // returning from Meta OAuth? show a message and land on My Accounts
  const params = new URLSearchParams(location.search);
  if (params.get('meta')) {
    const msg = META_MSG[params.get('meta')] || '';
    state.view = 'connections';
    history.replaceState(null, '', '/' + slugForView('connections'));
    if (msg) setTimeout(() => toast(msg), 400);
  }
  // arriving via a password-reset link? (/#reset=TOKEN)
  const resetMatch = location.hash.match(/^#reset=([0-9a-f]+)$/);
  if (resetMatch) return renderReset(resetMatch[1]);
  try {
    const { user } = await api.get('/me');
    state.user = user;
    await loadData();
    renderApp();
  } catch {
    renderLogin();
  }
}

async function loadData() {
  const [pl, lib, acc, cat] = await Promise.all([ api.get('/platforms'), api.get('/library'), api.get('/accounts'), api.get('/categories') ]);
  state.platforms = pl.platforms; state.library = lib.posts; state.accounts = acc.accounts; state.categories = cat.categories;
}

async function refreshLibrary() {
  const [lib, cat] = await Promise.all([ api.get('/library'), api.get('/categories') ]);
  state.library = lib.posts; state.categories = cat.categories;
}

// ---------- login / signup / forgot / reset ----------
function authShell(inner) {
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="authForm">
        <div class="logo" style="font-size:1.5rem;"><img class="mark" src="/favicon.svg" alt="Bio-One" />
          <div>Bio-One Social Hub</div></div>
        ${inner}
      </form>
    </div>`;
  return document.getElementById('authForm');
}

function authLinks(links) {
  return `<div style="display:flex; justify-content:space-between; margin-top:16px; font-size:.85rem;">
    ${links.map(([label, mode]) => `<a href="#" data-auth="${mode}">${label}</a>`).join('')}
  </div>`;
}

function wireAuthLinks(form) {
  form.querySelectorAll('a[data-auth]').forEach(a => a.onclick = e => {
    e.preventDefault();
    ({ login: renderLogin, signup: renderSignup, forgot: renderForgot })[a.dataset.auth]();
  });
}

function renderLogin() {
  const form = authShell(`
    <p class="subtle" style="margin-top:14px;">Sign in to manage your location's social media.</p>
    <label>Email<input name="email" type="email" autocomplete="email" required /></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
    <button class="btn btn-primary" style="width:100%; justify-content:center; margin-top:22px;">Sign In</button>
    ${authLinks([['Create an account', 'signup'], ['Forgot password?', 'forgot']])}`);
  wireAuthLinks(form);
  form.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(form);
    withBusy(form.querySelector('.btn-primary'), async () => {
      try {
        const { user } = await api.post('/login', { email: f.get('email'), password: f.get('password') });
        state.user = user; await loadData(); renderApp();
      } catch (err) { toast(err.error || 'Login failed'); }
    }, 'Signing in…');
  };
}

function renderSignup() {
  const form = authShell(`
    <p class="subtle" style="margin-top:14px;">Create your franchisee account.</p>
    <label>Your name<input name="name" autocomplete="name" placeholder="e.g. Patricia Smith" required /></label>
    <label>Franchise location<input name="location" placeholder="e.g. Bio-One of Modesto, CA" required /></label>
    <label>Email<input name="email" type="email" autocomplete="email" required /></label>
    <label>Password<input name="password" type="password" autocomplete="new-password" minlength="6" placeholder="At least 6 characters" required /></label>
    <button class="btn btn-primary" style="width:100%; justify-content:center; margin-top:22px;">Create Account</button>
    ${authLinks([['← Back to sign in', 'login']])}`);
  wireAuthLinks(form);
  form.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(form);
    withBusy(form.querySelector('.btn-primary'), async () => {
      try {
        const { user } = await api.post('/register', {
          name: f.get('name'), location: f.get('location'),
          email: f.get('email'), password: f.get('password')
        });
        state.user = user; await loadData();
        toast('Welcome to Bio-One Social Hub, ' + user.name.split(' ')[0] + '!');
        renderApp();
      } catch (err) { toast(err.error || 'Could not create account'); }
    }, 'Creating…');
  };
}

function renderForgot() {
  const form = authShell(`
    <p class="subtle" style="margin-top:14px;">Enter your email and we'll send you a link to reset your password.</p>
    <label>Email<input name="email" type="email" autocomplete="email" required /></label>
    <button class="btn btn-primary" style="width:100%; justify-content:center; margin-top:22px;">Send reset link</button>
    <div id="resetSent"></div>
    ${authLinks([['← Back to sign in', 'login']])}`);
  wireAuthLinks(form);
  form.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(form);
    const { demoResetLink } = await api.post('/forgot', { email: f.get('email') });
    document.getElementById('resetSent').innerHTML = `
      <div class="muted-note" style="margin-top:16px;">
        If an account exists for that email, a reset link has been sent.
        ${demoResetLink ? `<br/><br/><b>Demo mode</b> (no email service connected): <a href="${demoResetLink}">click here to reset your password</a>.` : ''}
      </div>`;
    if (demoResetLink) document.querySelector('#resetSent a').onclick = ev => {
      ev.preventDefault();
      renderReset(demoResetLink.split('=')[1]);
    };
  };
}

function renderReset(token) {
  const form = authShell(`
    <p class="subtle" style="margin-top:14px;">Choose a new password.</p>
    <label>New password<input name="password" type="password" autocomplete="new-password" minlength="6" placeholder="At least 6 characters" required /></label>
    <label>Confirm new password<input name="confirm" type="password" autocomplete="new-password" minlength="6" required /></label>
    <button class="btn btn-primary" style="width:100%; justify-content:center; margin-top:22px;">Set new password</button>
    ${authLinks([['← Back to sign in', 'login']])}`);
  wireAuthLinks(form);
  form.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(form);
    if (f.get('password') !== f.get('confirm')) return toast('Passwords do not match');
    try {
      await api.post('/reset', { token, password: f.get('password') });
      history.replaceState(null, '', location.pathname); // clear #reset= from URL
      toast('Password updated — sign in with your new password');
      renderLogin();
    } catch (err) { toast(err.error || 'Reset failed'); }
  };
}

// ---------- shell ----------
function renderApp() {
  app.innerHTML = `
    <header class="topnav">
      <div class="logo"><img class="mark" src="/favicon.svg" alt="Bio-One" /><div>Bio-One Social Hub</div></div>
      <div style="display:flex; align-items:center; gap:14px;">
        <span class="subtle">${esc(state.user.name)}</span>
        <button class="btn btn-ghost" id="logoutBtn">Sign out</button>
      </div>
    </header>
    <div class="container">
      <div class="tabs">
        <button class="tab ${state.view==='library'?'active':''}" data-v="library">📚 Content Library</button>
        <button class="tab ${state.view==='calendar'?'active':''}" data-v="calendar">📅 Calendar</button>
        <button class="tab ${state.view==='analytics'?'active':''}" data-v="analytics">📊 Analytics</button>
        <button class="tab ${state.view==='connections'?'active':''}" data-v="connections">🔗 My Accounts</button>
        <button class="tab ${state.view==='history'?'active':''}" data-v="history">🕘 History</button>
        ${state.user.role === 'admin' ? `<button class="tab ${state.view==='admin'?'active':''}" data-v="admin">⚙️ Admin</button>
        <button class="tab ${state.view==='templates'?'active':''}" data-v="templates">🗂️ Templates</button>` : ''}
      </div>
      <div id="viewRoot"></div>
    </div>`;
  document.getElementById('logoutBtn').onclick = async () => { await api.post('/logout'); state.user=null; renderLogin(); };
  app.querySelectorAll('.tab').forEach(b => b.onclick = () => go(b.dataset.v));
  renderView();
}

function connectedCount() { return Object.keys(state.accounts).length; }

// URL slug ↔ view mapping (each section gets its own address)
const VIEW_TO_SLUG = { library:'library', calendar:'calendar', analytics:'analytics',
  connections:'accounts', history:'history', admin:'admin', templates:'templates' };
const SLUG_TO_VIEW = { '':'library', library:'library', calendar:'calendar', analytics:'analytics',
  accounts:'connections', history:'history', admin:'admin', templates:'templates' };

function slugForView(v) { return VIEW_TO_SLUG[v] || 'library'; }
function viewFromPath() { return SLUG_TO_VIEW[location.pathname.replace(/^\/+/, '').toLowerCase()]; }

// navigate to a top-level view and update the URL
function go(view, push = true) {
  state.view = view; state.editing = null; state.tplForm = null;
  if (push) history.pushState({ view }, '', '/' + slugForView(view));
  renderView();
}

// browser back/forward
window.onpopstate = () => {
  if (!state.user) return;
  state.view = viewFromPath() || 'library';
  state.editing = null; state.tplForm = null;
  renderView();
};

function renderView() {
  const root = document.getElementById('viewRoot');
  // keep the highlighted tab in sync with the current view (also covers
  // programmatic switches, e.g. publish → calendar, edit template → admin)
  app.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.v === state.view));
  if (state.editing) return renderComposer(root);
  if (state.view === 'library')     return renderLibrary(root);
  if (state.view === 'calendar')    return renderCalendar(root);
  if (state.view === 'analytics')   return renderAnalytics(root);
  if (state.view === 'connections') return renderConnections(root);
  if (state.view === 'history')     return renderHistory(root);
  if (state.view === 'admin')       return renderAdmin(root);
  if (state.view === 'templates')   return renderTemplates(root);
}

// ---------- library ----------
function renderLibrary(root) {
  root.innerHTML = '';

  // header row with the "create your own post" action
  const header = document.createElement('div');
  header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:16px;';
  header.innerHTML = `<h2 style="margin:0;">Content Library</h2>
    <button class="btn btn-primary" id="ownPostBtn">➕ Create your own post</button>`;
  root.appendChild(header);
  header.querySelector('#ownPostBtn').onclick = () => {
    state.editing = { custom: true, libraryId: null, caption: '', image: '', media: [],
      category: '', platforms: [], perPlatform: false, captions: {} };
    renderView();
  };

  if (!connectedCount()) {
    const note = document.createElement('div');
    note.className = 'muted-note';
    note.style.marginBottom = '18px';
    note.innerHTML = `👋 You haven't connected any accounts yet. Head to <b>My Accounts</b> to connect, then publish from here.`;
    root.appendChild(note);
  }

  // category filter bar
  const cats = state.categories || [];
  if (state.libFilter && state.libFilter !== '__all' && !cats.includes(state.libFilter)) state.libFilter = '__all';
  const active = state.libFilter || '__all';
  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  filterBar.innerHTML = `<span class="filter-label">Filter:</span>
    <button class="filter-chip ${active==='__all'?'on':''}" data-cat="__all">All</button>
    ${cats.map(c => `<button class="filter-chip ${active===c?'on':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}`;
  root.appendChild(filterBar);
  filterBar.querySelectorAll('button[data-cat]').forEach(b => b.onclick = () => {
    state.libFilter = b.dataset.cat; renderLibrary(root);
  });

  const visible = active === '__all' ? state.library : state.library.filter(p => p.category === active);

  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'muted-note';
    empty.style.marginTop = '4px';
    empty.textContent = active === '__all' ? 'No posts in the library yet.' : `No posts in "${active}" yet.`;
    root.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'grid grid-4';
  grid.innerHTML = visible.map(post => `
    <div class="card">
      <div class="thumb preview-open" data-preview="${esc(post.id)}" title="Click to preview">${mediaThumb(post.image, post.title)}${(post.media && post.media.length > 1) ? `<span class="count-badge">+${post.media.length - 1}</span>` : ''}</div>
      <div class="pad">
        ${post.category ? `<span class="tag">${esc(post.category)}</span>` : ''}
        <h2 class="card-title preview-open" data-preview="${esc(post.id)}" style="cursor:pointer;">${esc(post.title)}</h2>
        <p class="subtle clamp-3" style="font-size:.9rem;">${esc(post.caption)}</p>
        <div class="card-actions">
          <button class="btn btn-primary" style="flex:1; justify-content:center;" data-id="${esc(post.id)}">Use this post</button>
          <button class="btn btn-icon" data-dl="${esc(post.id)}" title="Download design to your computer" aria-label="Download design">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>
            </svg>
          </button>
        </div>
      </div>
    </div>`).join('');
  root.appendChild(grid);
  grid.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => usePost(state.library.find(p => p.id === b.dataset.id)));
  grid.querySelectorAll('[data-preview]').forEach(el => el.onclick = () => openLibraryPreview(state.library.find(p => p.id === el.dataset.preview)));
  grid.querySelectorAll('button[data-dl]').forEach(b => b.onclick = () => {
    const post = state.library.find(p => p.id === b.dataset.dl);
    const ext = (post.image.split('.').pop() || 'png').split(/[?#]/)[0];
    const name = post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    triggerDownload(post.image, `${name}.${ext}`);
    toast('Downloading design…');
  });
}

// open a library post into the composer
function usePost(post) {
  const media = (post.media && post.media.length) ? [...post.media] : [post.image];
  state.editing = { libraryId: post.id, caption: post.caption, image: post.image, media,
    category: post.category || '', platforms: post.platforms.filter(t => state.accounts[t]),
    perPlatform: false, captions: {} };
  renderView();
}

// large preview of a library post before using it
function openLibraryPreview(post) {
  if (!post) return;
  const media = (post.media && post.media.length) ? post.media : [post.image];
  const cover = media[0];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card" style="width:min(640px,95vw);">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        ${post.category ? `<span class="tag">${esc(post.category)}</span>` : '<span></span>'}
        <button class="btn btn-ghost" id="pvClose" style="padding:6px 14px;">✕</button>
      </div>
      <h2 style="margin:8px 0 12px;">${esc(post.title)}</h2>
      <div class="preview-media">${isVideo(cover)
        ? `<video src="${esc(cover)}" controls playsinline></video>`
        : `<img src="${esc(cover)}" alt="${esc(post.title)}"/>`}</div>
      ${media.length > 1 ? `<div class="gallery" style="padding:10px 0;">${media.map((m,i)=>`<div class="g-thumb ${i===0?'cover':''}">${isVideo(m)?`<video src="${esc(m)}" muted></video>`:`<img src="${esc(m)}"/>`}</div>`).join('')}</div>` : ''}
      <p style="white-space:pre-wrap; font-size:.92rem; margin:14px 0; max-height:30vh; overflow:auto;">${esc(post.caption)}</p>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-primary" id="pvUse" style="flex:1; justify-content:center;">Use this post</button>
        <button class="btn btn-icon" id="pvDl" title="Download" aria-label="Download">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = ev => { if (ev.target === overlay) close(); };
  overlay.querySelector('#pvClose').onclick = close;
  overlay.querySelector('#pvUse').onclick = () => { close(); usePost(post); };
  overlay.querySelector('#pvDl').onclick = () => {
    const ext = (cover.split('.').pop() || 'png').split(/[?#]/)[0];
    triggerDownload(cover, post.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '.' + ext);
    toast('Downloading design…');
  };
}

// ---------- composer ----------
function renderComposer(root) {
  const e = state.editing;
  if (!e.media) e.media = [];
  if (!e.media.length && e.image) e.media = [e.image];
  const connected = state.platforms.filter(p => state.accounts[p.id]);
  const limitFor = id => platMeta(id).captionLimit || 9999;

  // custom posts (franchisee's own) get a media uploader; library posts use template media
  const ownUploader = e.custom ? `
    <label class="alabel" style="display:block; font-weight:700; font-size:.85rem; margin-bottom:4px;">Your image or video</label>
    <div class="uploader">
      <div>
        <button class="btn btn-blue" type="button" id="ownPick">📤 Add image or video</button>
        <div class="subtle" style="font-size:.78rem; margin-top:6px;">Upload one or more. The first is the cover.</div>
      </div>
      <input type="file" id="ownFile" accept="image/*,video/*" multiple style="display:none;" />
    </div>
    <div id="ownMedia" class="media-list">
      ${e.media.map((m,i)=>`<div class="media-item">
        <div class="media-prev">${isVideo(m)?`<video src="${esc(m)}" muted></video>`:`<img src="${esc(m)}"/>`}</div>
        ${i===0?'<span class="cover-tag">Cover</span>':`<button type="button" class="mini" data-own-cover="${i}" title="Make cover">★</button>`}
        <button type="button" class="mini del" data-own-rm="${i}" title="Remove">✕</button>
      </div>`).join('')}
    </div>` : '';

  // caption editor: one shared box, or one per selected platform when toggled on
  const captionEditor = e.perPlatform
    ? e.platforms.map(t => `
        <div style="margin-top:12px;">
          <label class="subtle" style="font-size:.82rem; font-weight:700; display:flex; align-items:center; gap:7px;">
            <span class="chip" style="background:${platMeta(t).color}; padding:3px 10px;"><span class="dot"></span>${esc(platMeta(t).name)}</span></label>
          <textarea class="cap-pp" data-pp="${esc(t)}" style="min-height:90px; margin-top:6px;">${esc(e.captions[t] != null ? e.captions[t] : e.caption)}</textarea>
          <div class="counter" data-cnt="${esc(t)}"></div>
        </div>`).join('')
    : `<textarea id="cap">${esc(e.caption)}</textarea><div class="counter" id="counter"></div>`;

  const galleryThumbs = e.media.map((m, i) => `
    <div class="g-thumb ${i===0?'cover':''}">${isVideo(m) ? `<video src="${esc(m)}" muted></video>` : `<img src="${esc(m)}"/>`}
      ${i===0 ? '<span class="cover-tag">Cover</span>' : ''}</div>`).join('');

  root.innerHTML = `
    <button class="btn btn-ghost" id="backBtn" style="margin-bottom:18px;">← Back to library</button>
    <div class="grid" style="grid-template-columns: 1.3fr 1fr; align-items:start;">
      <div class="card"><div class="pad">
        <h2>${e.custom ? 'Create your own post' : 'Customize your caption'}</h2>
        <p class="subtle" style="font-size:.9rem;">${e.custom ? 'Upload your media, write your caption, choose accounts, and publish or schedule.' : "Replace the [BRACKETS] with your location's details."}</p>

        ${ownUploader}

        <label class="toggle">
          <input type="checkbox" id="ppToggle" ${e.perPlatform?'checked':''}/>
          <span>Customize caption per platform</span>
        </label>

        <div id="capArea">${captionEditor}</div>

        <h2 style="margin-top:18px; font-size:1.1rem;">Publish to</h2>
        ${connected.length ? `<div class="platforms" id="platPick">
          ${connected.map(p => `<button class="chip ${e.platforms.includes(p.id)?'':'off'}" data-p="${p.id}"
            style="${e.platforms.includes(p.id)?`background:${p.color}`:''}"><span class="dot"></span>${esc(p.name)}</button>`).join('')}
        </div>` : `<div class="muted-note">No connected accounts. Connect one under <b>My Accounts</b> first.</div>`}

        <div style="display:flex; gap:10px; margin-top:22px; flex-wrap:wrap;">
          <button class="btn btn-primary" id="pubNow" ${connected.length?'':'disabled'}>Publish now</button>
          <button class="btn btn-blue" id="schedBtn" ${connected.length?'':'disabled'}>📅 Schedule day & time</button>
        </div>
        <div id="schedRow" style="display:none; margin-top:12px; align-items:center; gap:10px; flex-wrap:wrap;">
          <label class="subtle" style="font-size:.85rem;">Date &amp; time:
            <input type="datetime-local" id="schedAt" style="padding:8px; border-radius:8px; border:1.5px solid #BDBDBF; font-family:inherit;"/></label>
          <button class="btn btn-primary" id="schedGo">Confirm schedule</button>
        </div>
      </div></div>

      <div class="card">
        <div class="thumb">${!e.media[0]
          ? `<div style="color:#fff; text-align:center; padding:24px; font-weight:700;">Your image or video<br/>preview appears here</div>`
          : isVideo(e.media[0])
            ? `<video src="${esc(e.media[0])}" controls playsinline></video>`
            : `<img src="${esc(e.media[0])}" onerror="this.parentNode.style.minHeight='220px'"/>`}</div>
        ${e.media.length > 1 ? `<div class="gallery">${galleryThumbs}</div>` : ''}
        <div class="pad"><span class="tag">Live preview</span>
          <p id="preview" style="white-space:pre-wrap; font-size:.92rem;"></p></div>
      </div>
    </div>`;

  const preview = document.getElementById('preview');
  function counterText(len, lim) { return `${len} / ${lim} chars`; }

  function refreshShared() {
    const cap = document.getElementById('cap');
    e.caption = cap.value;
    preview.textContent = cap.value;
    const lim = e.platforms.length ? Math.min(...e.platforms.map(limitFor)) : 280;
    const counter = document.getElementById('counter');
    counter.textContent = counterText(cap.value.length, lim) + (e.platforms.length ? ` (tightest platform)` : '');
    counter.classList.toggle('over', cap.value.length > lim);
  }
  function refreshPerPlatform() {
    root.querySelectorAll('textarea.cap-pp').forEach(ta => {
      const t = ta.dataset.pp; e.captions[t] = ta.value;
      const cnt = root.querySelector(`[data-cnt="${t}"]`);
      const lim = limitFor(t);
      cnt.textContent = counterText(ta.value.length, lim);
      cnt.classList.toggle('over', ta.value.length > lim);
    });
    preview.textContent = e.captions[e.platforms[0]] != null ? e.captions[e.platforms[0]] : e.caption;
  }
  function refresh() { e.perPlatform ? refreshPerPlatform() : refreshShared(); }

  if (e.perPlatform) {
    root.querySelectorAll('textarea.cap-pp').forEach(ta => ta.addEventListener('input', refreshPerPlatform));
  } else {
    document.getElementById('cap').addEventListener('input', refreshShared);
  }
  refresh();

  document.getElementById('ppToggle').onchange = ev => {
    e.perPlatform = ev.target.checked;
    if (e.perPlatform) { // seed each platform's caption from the shared one
      e.platforms.forEach(t => { if (e.captions[t] == null) e.captions[t] = e.caption; });
    }
    renderComposer(root);
  };

  document.getElementById('backBtn').onclick = () => { state.editing = null; renderView(); };

  // custom-post media uploader
  if (e.custom) {
    const ownFile = document.getElementById('ownFile');
    const ownPick = document.getElementById('ownPick');
    ownPick.onclick = () => ownFile.click();
    ownFile.onchange = ev => {
      const files = [...ev.target.files]; if (!files.length) return;
      withBusy(ownPick, async () => {
        for (const file of files) {
          const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
          try { const { image } = await api.post('/upload', { filename: file.name.replace(/\.[^.]+$/,''), dataUrl }); e.media.push(image); }
          catch (err) { toast(err.error || 'Upload failed'); }
        }
        renderComposer(root);
        toast('Upload complete');
      }, 'Uploading…');
    };
    root.querySelectorAll('button[data-own-rm]').forEach(b => b.onclick = () => { e.media.splice(+b.dataset.ownRm, 1); renderComposer(root); });
    root.querySelectorAll('button[data-own-cover]').forEach(b => b.onclick = () => {
      const i = +b.dataset.ownCover; const [m] = e.media.splice(i, 1); e.media.unshift(m); renderComposer(root);
    });
  }

  root.querySelectorAll('button[data-p]').forEach(b => b.onclick = () => {
    const id = b.dataset.p;
    e.platforms = e.platforms.includes(id) ? e.platforms.filter(x=>x!==id) : [...e.platforms, id];
    renderComposer(root);
  });

  const publish = async (scheduledFor) => {
    if (!e.platforms.length) return toast('Pick at least one account');
    const captions = e.perPlatform
      ? Object.fromEntries(e.platforms.map(t => [t, e.captions[t] != null ? e.captions[t] : e.caption]))
      : null;
    try {
      await api.post('/publish', { libraryId: e.libraryId, caption: e.caption, captions,
        category: e.category || '', media: e.media, platforms: e.platforms, scheduledFor });
      toast(scheduledFor ? '🗓️ Scheduled!' : '✅ Published to ' + e.platforms.length + ' account(s)');
      state.editing = null; go(scheduledFor ? 'calendar' : 'history');
    } catch (err) { toast(err.error || 'Publish failed'); }
  };
  const pubNow = document.getElementById('pubNow'); if (pubNow) pubNow.onclick = () => withBusy(pubNow, () => publish(null), 'Publishing…');
  const schedBtn = document.getElementById('schedBtn');
  if (schedBtn) schedBtn.onclick = () => { document.getElementById('schedRow').style.display='flex'; };
  const schedGo = document.getElementById('schedGo');
  if (schedGo) schedGo.onclick = () => { const v = document.getElementById('schedAt').value; if(!v) return toast('Pick a date/time'); withBusy(schedGo, () => publish(new Date(v).toISOString()), 'Scheduling…'); };
}

// Trigger a browser download of a file the server streams as an attachment.
function triggerDownload(href, filename) {
  const a = document.createElement('a');
  a.href = href; if (filename) a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

// ---------- connections ----------
function renderConnections(root) {
  root.innerHTML = `<div class="card"><div class="pad">
    <h2>Your social accounts</h2>
    <p class="subtle">Each franchisee connects and controls their own accounts. Only you can see and post to these.</p>
    <div id="connList" style="margin-top:8px;"></div>
  </div></div>`;
  const list = document.getElementById('connList');
  const byId = id => state.platforms.find(p => p.id === id);
  const fb = byId('facebook'), ig = byId('instagram');
  let html = '';

  // combined Facebook & Instagram row (one Meta login connects both)
  if (fb && ig) {
    const fbAcc = state.accounts.facebook, igAcc = state.accounts.instagram;
    const oauth = fb.oauth;
    const status = fbAcc
      ? `<span class="subtle">${esc(fbAcc.handle)}${igAcc ? ` · ${esc(igAcc.handle)}` : ' · Instagram not linked'}</span>`
      : `<span class="subtle">Not connected</span>`;
    html += `<div class="conn-row">
      <div class="conn-left">
        <span class="chip" style="background:${fb.color}"><span class="dot"></span>Facebook</span>
        <span class="chip" style="background:${ig.color}"><span class="dot"></span>Instagram</span>
        ${status}
        ${oauth ? '' : '<span class="badge no" title="API access pending approval">demo</span>'}
      </div>
      <div>${fbAcc
        ? `<span class="badge ok">Connected</span> <button class="btn btn-ghost" data-disc-meta>Disconnect</button>`
        : `<button class="btn btn-primary" data-conn-meta ${oauth ? 'data-oauth="1"' : ''}>Connect Facebook &amp; Instagram</button>`}</div>
    </div>
    <p class="subtle" style="font-size:.8rem; margin:-2px 0 6px;">One login connects your Facebook Page and the Instagram Business account linked to it.</p>`;
  }

  // remaining platforms, individually
  state.platforms.filter(p => p.id !== 'facebook' && p.id !== 'instagram').forEach(p => {
    const acc = state.accounts[p.id];
    html += `<div class="conn-row">
      <div class="conn-left">
        <span class="chip" style="background:${p.color}"><span class="dot"></span>${esc(p.name)}</span>
        ${acc ? `<span class="subtle">${esc(acc.handle)}</span>` : `<span class="subtle">Not connected</span>`}
        ${p.liveReady ? '' : '<span class="badge no" title="API access pending approval">demo</span>'}
      </div>
      <div>${acc
        ? `<span class="badge ok">Connected</span> <button class="btn btn-ghost" data-disc="${p.id}">Disconnect</button>`
        : `<button class="btn btn-primary" data-conn="${p.id}" ${p.oauth ? 'data-oauth="1"' : ''}>Connect</button>`}</div>
    </div>`;
  });
  list.innerHTML = html;

  // combined Meta connect/disconnect
  const connMeta = list.querySelector('button[data-conn-meta]');
  if (connMeta) connMeta.onclick = () => {
    if (fb.oauth) { connMeta.classList.add('is-busy'); connMeta.innerHTML = '<span class="spinner"></span> Redirecting…'; window.location.href = '/oauth/meta/start'; return; }
    withBusy(connMeta, async () => {
      await api.post('/connect', { platform: 'facebook' });
      const { accounts } = await api.post('/connect', { platform: 'instagram' });
      state.accounts = accounts; toast('Connected Facebook & Instagram'); renderConnections(root);
    }, 'Connecting…');
  };
  const discMeta = list.querySelector('button[data-disc-meta]');
  if (discMeta) discMeta.onclick = () => withBusy(discMeta, async () => {
    await api.post('/disconnect', { platform: 'facebook' });
    const { accounts } = await api.post('/disconnect', { platform: 'instagram' });
    state.accounts = accounts; renderConnections(root);
  });

  // other platforms
  list.querySelectorAll('button[data-conn]').forEach(b => b.onclick = () => {
    if (b.dataset.oauth) { window.location.href = '/oauth/meta/start'; return; }
    withBusy(b, async () => {
      const { accounts } = await api.post('/connect', { platform: b.dataset.conn });
      state.accounts = accounts; toast('Connected ' + platMeta(b.dataset.conn).name); renderConnections(root);
    }, 'Connecting…');
  });
  list.querySelectorAll('button[data-disc]').forEach(b => b.onclick = () => withBusy(b, async () => {
    const { accounts } = await api.post('/disconnect', { platform: b.dataset.disc });
    state.accounts = accounts; renderConnections(root);
  }));
}

// ---------- history ----------
async function renderHistory(root) {
  root.innerHTML = `<p class="subtle">Loading…</p>`;
  const { posts } = await api.get('/posts');
  if (!posts.length) { root.innerHTML = `<div class="muted-note">No posts yet. Publish your first one from the Content Library.</div>`; return; }
  root.innerHTML = posts.map(post => {
    const cover = (post.media && post.media[0]) || post.image;
    return `
    <div class="card" style="margin-bottom:14px;"><div class="pad" style="display:flex; gap:14px; align-items:flex-start;">
      ${cover ? `<div class="hist-thumb">${mediaThumb(cover, '')}${(post.media && post.media.length > 1) ? `<span class="count-badge">+${post.media.length-1}</span>` : ''}</div>` : ''}
      <div style="flex:1; min-width:0;">
        <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center;">
          <span class="badge ${post.status==='published'?'ok':'no'}">${post.status==='scheduled'?'🗓️ Scheduled':'✅ Published'}</span>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="subtle" style="font-size:.85rem;">${new Date(post.scheduledFor||post.createdAt).toLocaleString()}</span>
            <button class="btn btn-ghost" style="padding:5px 12px; color:#E62A65; border-color:#f5c2d3;" data-del-post="${esc(post.id)}">Delete</button>
          </div>
        </div>
        <p style="white-space:pre-wrap; margin:10px 0;">${esc(post.caption)}</p>
        <div class="platforms">${post.platforms.map(t => {
          const r = post.results[t];
          const link = r && r.externalUrl;
          const chip = `<span class="chip" style="background:${platMeta(t).color}"><span class="dot"></span>${esc(platMeta(t).name)}</span>`;
          return link ? `<a href="${esc(link)}" target="_blank" style="text-decoration:none;">${chip}</a>` : chip;
        }).join('')}</div>
      </div>
    </div></div>`;
  }).join('');

  root.querySelectorAll('button[data-del-post]').forEach(b => b.onclick = () => {
    const post = posts.find(p => p.id === b.dataset.delPost);
    const published = post && post.status === 'published';
    if (!confirm(published
      ? 'Delete this post? It will be removed from the app and from the connected Facebook/Instagram accounts it was posted to.'
      : 'Delete this scheduled post? It will not be published.')) return;
    withBusy(b, async () => {
      try {
        const { note } = await api.post('/posts/delete', { id: b.dataset.delPost });
        toast(note || 'Post deleted');
        renderHistory(root);
      } catch (err) { toast(err.error || 'Delete failed'); }
    });
  });
}

// ---------- analytics ----------
async function renderAnalytics(root) {
  root.innerHTML = `<p class="subtle">Loading…</p>`;
  const { posts } = await api.get('/posts');

  let published = 0, scheduled = 0, failedPlatforms = 0, sentPlatforms = 0;
  const perPlatform = {};   // platform -> { ok, fail }
  const perCategory = {};   // category -> count
  posts.forEach(p => {
    if (p.status === 'scheduled') scheduled++; else published++;
    const cat = p.category || 'Uncategorized';
    perCategory[cat] = (perCategory[cat] || 0) + 1;
    Object.entries(p.results || {}).forEach(([t, r]) => {
      perPlatform[t] = perPlatform[t] || { ok: 0, fail: 0 };
      if (r.ok === false) { perPlatform[t].fail++; failedPlatforms++; }
      else { perPlatform[t].ok++; sentPlatforms++; }
    });
  });

  const stat = (label, value, color) =>
    `<div class="stat"><div class="stat-num" style="color:${color||'var(--bo-soft-black)'}">${value}</div><div class="stat-label">${label}</div></div>`;

  const maxCat = Math.max(1, ...Object.values(perCategory));
  const catBars = Object.entries(perCategory).sort((a,b)=>b[1]-a[1]).map(([c, n]) => `
    <div class="bar-row"><span class="bar-label">${esc(c)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(n/maxCat*100).toFixed(0)}%"></span></span>
      <span class="bar-val">${n}</span></div>`).join('') || '<p class="subtle">No posts yet.</p>';

  const platRows = Object.entries(perPlatform).map(([t, s]) => `
    <div class="conn-row">
      <span class="chip" style="background:${platMeta(t).color}"><span class="dot"></span>${esc(platMeta(t).name)}</span>
      <span class="subtle" style="font-size:.88rem;">${s.ok} sent${s.fail ? ` · <span style="color:var(--bo-pink); font-weight:700;">${s.fail} failed</span>` : ''}</span>
    </div>`).join('') || '<p class="subtle">Nothing published yet.</p>';

  root.innerHTML = `
    <h2 style="margin:0 0 4px;">Your analytics</h2>
    <p class="subtle" style="font-size:.88rem; margin-top:0;">Activity for ${esc(state.user.location)}. Engagement metrics (likes, views) will appear here once each platform's API is connected live.</p>
    <div class="stat-row">
      ${stat('Published', published, 'var(--bo-teal)')}
      ${stat('Scheduled', scheduled, 'var(--bo-orange)')}
      ${stat('Successful sends', sentPlatforms)}
      ${stat('Failed sends', failedPlatforms, failedPlatforms ? 'var(--bo-pink)' : undefined)}
    </div>
    <div class="grid" style="grid-template-columns:1fr 1fr; align-items:start; margin-top:18px;">
      <div class="card"><div class="pad"><h2 style="font-size:1.05rem;">Posts by category</h2>${catBars}</div></div>
      <div class="card"><div class="pad"><h2 style="font-size:1.05rem;">By platform</h2>${platRows}</div></div>
    </div>`;
}

// ---------- calendar ----------
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

async function renderCalendar(root) {
  root.innerHTML = `<p class="subtle">Loading…</p>`;
  const { posts } = await api.get('/posts');

  // category of a post (stored on newer posts; fall back to its library template)
  const catOf = p => p.category || (state.library.find(l => l.id === p.libraryId) || {}).category || '';
  const usedCats = [...new Set(posts.map(catOf).filter(Boolean))];
  const active = (state.calFilter === '__all' || usedCats.includes(state.calFilter)) ? state.calFilter : '__all';
  const fposts = active === '__all' ? posts : posts.filter(p => catOf(p) === active);

  // group posts by local YYYY-MM-DD (scheduled use their date; published use posted date)
  const byDay = {};
  fposts.forEach(p => {
    const d = new Date(p.scheduledFor || p.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    (byDay[key] = byDay[key] || []).push(p);
  });

  if (!state.calMonth) state.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const view = state.calMonth;
  const year = view.getFullYear(), month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const scheduledCount = fposts.filter(p => p.status === 'scheduled' && new Date(p.scheduledFor) >= new Date(today.toDateString())).length;

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${month}-${day}`;
    const dayPosts = byDay[key] || [];
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    const events = dayPosts.map(p => {
      const t = new Date(p.scheduledFor || p.createdAt);
      const time = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const bg = p.status === 'scheduled' ? 'var(--bo-orange)' : 'var(--bo-teal)';
      const icon = p.status === 'scheduled' ? '🗓️' : '✅';
      const label = `${icon} ${time} · ${p.platforms.map(x => platMeta(x).name).join(', ')}`;
      return `<button class="cal-ev" style="background:${bg}" data-ev="${esc(p.id)}" title="${esc(p.caption)}">${esc(label)}</button>`;
    }).join('');
    cells += `<div class="cal-cell ${isToday ? 'today' : ''}"><div class="cal-date">${day}</div>${events}</div>`;
  }

  root.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
      <h2 style="margin:0;">${MONTHS[month]} ${year}</h2>
      <div style="display:flex; gap:8px; align-items:center;">
        <span class="badge ok" style="font-size:.8rem;">${scheduledCount} upcoming scheduled</span>
        <button class="btn btn-ghost" id="calPrev" style="padding:8px 14px;">←</button>
        <button class="btn btn-ghost" id="calToday" style="padding:8px 14px;">Today</button>
        <button class="btn btn-ghost" id="calNext" style="padding:8px 14px;">→</button>
      </div>
    </div>
    ${usedCats.length ? `<div class="filter-bar">
      <span class="filter-label">Filter:</span>
      <button class="filter-chip ${active==='__all'?'on':''}" data-cal-cat="__all">All</button>
      ${usedCats.map(c => `<button class="filter-chip ${active===c?'on':''}" data-cal-cat="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>` : ''}
    <div class="cal-legend">
      <span><i style="background:var(--bo-orange)"></i> Scheduled</span>
      <span><i style="background:var(--bo-teal)"></i> Published</span>
    </div>
    <div class="cal-grid">
      ${WEEKDAYS.map(d => `<div class="cal-head">${d}</div>`).join('')}
      ${cells}
    </div>
    ${posts.length ? '' : `<div class="muted-note" style="margin-top:16px;">Nothing scheduled yet. Open a post from the <b>Content Library</b> and choose <b>Schedule…</b> to see it here.</div>`}`;

  document.getElementById('calPrev').onclick  = () => { state.calMonth = new Date(year, month - 1, 1); renderCalendar(root); };
  document.getElementById('calNext').onclick  = () => { state.calMonth = new Date(year, month + 1, 1); renderCalendar(root); };
  document.getElementById('calToday').onclick = () => { state.calMonth = new Date(today.getFullYear(), today.getMonth(), 1); renderCalendar(root); };

  root.querySelectorAll('button[data-cal-cat]').forEach(b => b.onclick = () => {
    state.calFilter = b.dataset.calCat; renderCalendar(root);
  });

  root.querySelectorAll('button[data-ev]').forEach(b => b.onclick = () => {
    const post = posts.find(p => p.id === b.dataset.ev);
    if (post) openPostModal(post, () => renderCalendar(root));
  });
}

// modal for viewing/editing a calendar post.
// Scheduled posts: edit caption, reschedule, or cancel. Published: read-only.
function openPostModal(post, onChange) {
  const isScheduled = post.status === 'scheduled';
  // datetime-local needs local time formatted as YYYY-MM-DDTHH:MM
  const d = new Date(post.scheduledFor || post.createdAt);
  const pad = n => String(n).padStart(2, '0');
  const localVal = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="badge ${isScheduled ? 'no' : 'ok'}">${isScheduled ? '🗓️ Scheduled' : '✅ Published'}</span>
        <button class="btn btn-ghost" id="mClose" style="padding:6px 14px;">✕</button>
      </div>
      <div class="platforms" style="margin:12px 0;">
        ${post.platforms.map(t => `<span class="chip" style="background:${platMeta(t).color}"><span class="dot"></span>${esc(platMeta(t).name)}</span>`).join('')}
      </div>
      ${isScheduled ? `
        <label style="font-weight:700; font-size:.85rem;">Caption
          <textarea id="mCap" style="margin-top:6px;">${esc(post.caption)}</textarea></label>
        <label style="font-weight:700; font-size:.85rem; display:block; margin-top:12px;">Scheduled for
          <input type="datetime-local" id="mWhen" value="${localVal}"
            style="display:block; margin-top:6px; padding:10px; border:1.5px solid var(--bo-gray-light); border-radius:9px; font-family:inherit; font-size:.95rem;"/></label>
        <div style="display:flex; gap:10px; margin-top:20px; flex-wrap:wrap;">
          <button class="btn btn-primary" id="mSave">Save changes</button>
          <button class="btn btn-ghost" id="mCancel" style="color:var(--bo-pink); border-color:#f5c2d3; margin-left:auto;">Cancel this post</button>
        </div>`
      : `
        <p style="white-space:pre-wrap;">${esc(post.caption)}</p>
        <p class="subtle" style="font-size:.85rem;">Published ${new Date(post.createdAt).toLocaleString()}. Published posts can't be edited, but you can delete them.</p>
        <div style="display:flex; margin-top:16px;">
          <button class="btn btn-ghost" id="mDelete" style="color:var(--bo-pink); border-color:#f5c2d3; margin-left:auto;">Delete post</button>
        </div>`}
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay.querySelector('#mClose').onclick = close;

  if (isScheduled) {
    overlay.querySelector('#mSave').onclick = () => {
      const when = overlay.querySelector('#mWhen').value;
      if (!when) return toast('Pick a date/time');
      withBusy(overlay.querySelector('#mSave'), async () => {
        try {
          await api.post('/posts/update', { id: post.id,
            caption: overlay.querySelector('#mCap').value,
            scheduledFor: new Date(when).toISOString() });
          toast('Scheduled post updated');
          close(); onChange();
        } catch (err) { toast(err.error || 'Update failed'); }
      }, 'Saving…');
    };
    overlay.querySelector('#mCancel').onclick = () => {
      if (!confirm('Cancel this scheduled post? It will not be published.')) return;
      withBusy(overlay.querySelector('#mCancel'), async () => {
        try { await api.post('/posts/delete', { id: post.id }); toast('Post canceled'); close(); onChange(); }
        catch (err) { toast(err.error || 'Cancel failed'); }
      });
    };
  } else {
    overlay.querySelector('#mDelete').onclick = () => {
      if (!confirm('Delete this post? It will be removed from the app and from the connected Facebook/Instagram accounts it was posted to.')) return;
      withBusy(overlay.querySelector('#mDelete'), async () => {
        try { const { note } = await api.post('/posts/delete', { id: post.id }); toast(note || 'Post deleted'); close(); onChange(); }
        catch (err) { toast(err.error || 'Delete failed'); }
      });
    };
  }
}

function blankDraft() {
  return { id: null, title: '', category: '', caption: '', image: '', media: [],
    platforms: ['facebook','instagram','linkedin'] };
}

// ---------- admin (corporate only): sign-ups + notifications ----------
async function renderAdmin(root) {
  if (state.user.role !== 'admin') { state.view = 'library'; return renderView(); }
  const [{ users }, { outbox }] = await Promise.all([ api.get('/admin/users'), api.get('/admin/outbox') ]);
  const signups = users.filter(u => u.role !== 'admin');
  const signupRows = signups.length ? signups
    .sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0))
    .map(u => `<div class="conn-row">
      <div class="conn-left"><b>${esc(u.email)}</b> <span class="subtle">— ${esc(u.name)}, ${esc(u.location)}</span></div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="subtle" style="font-size:.8rem;">${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ''}</span>
        <button class="btn btn-ghost" style="padding:5px 12px; color:#E62A65; border-color:#f5c2d3;" data-del-user="${esc(u.email)}">Delete</button>
      </div>
    </div>`).join('') : '<p class="subtle" style="font-size:.88rem;">No franchisee sign-ups yet.</p>';
  const outboxRows = outbox.length ? outbox.slice(0, 20).map(m => `
    <div class="conn-row"><div class="conn-left">
      <span class="badge no">✉️</span>
      <div><b style="font-size:.9rem;">${esc(m.to)}</b><div class="subtle" style="font-size:.8rem;">${esc(m.subject)}</div></div>
    </div><span class="subtle" style="font-size:.8rem;">${new Date(m.sentAt).toLocaleString()}</span></div>`).join('')
    : '<p class="subtle" style="font-size:.88rem;">No notifications sent yet. Failure alerts to franchisees will appear here.</p>';

  root.innerHTML = `
    <div class="admin-stack">
      <div class="card" style="margin-bottom:18px;"><div class="pad">
        <h2 style="font-size:1.1rem;">👥 Franchisee sign-ups <span class="subtle" style="font-weight:400;">(${signups.length})</span></h2>
        <p class="subtle" style="font-size:.88rem;">Everyone who created an account. Use it to track adoption or export your mailing list. Manage templates &amp; categories under the <b>🗂️ Templates</b> tab.</p>
        <div style="max-height:320px; overflow:auto;">${signupRows}</div>
      </div></div>

      <div class="card"><div class="pad">
        <h2 style="font-size:1.1rem;">✉️ Notifications sent</h2>
        <p class="subtle" style="font-size:.88rem;">Failure alerts emailed to franchisees. (Demo mode logs them here; connect an email provider to deliver for real.)</p>
        <div style="max-height:320px; overflow:auto;">${outboxRows}</div>
      </div></div>
    </div>`;

  root.querySelectorAll('button[data-del-user]').forEach(b => b.onclick = () => {
    const email = b.dataset.delUser;
    if (!confirm(`Delete ${email}? This permanently removes their account, connected accounts, and posts.`)) return;
    withBusy(b, async () => {
      try { await api.post('/admin/users/delete', { email }); toast('User deleted'); renderAdmin(root); }
      catch (err) { toast(err.error || 'Delete failed'); }
    });
  });
}

// ---------- templates (corporate only): categories + list, with create/edit form ----------
async function renderTemplates(root) {
  if (state.user.role !== 'admin') { state.view = 'library'; return renderView(); }
  if (state.tplForm) return renderTemplateForm(root);

  await refreshLibrary();
  const posts = state.library;
  const cats = state.categories || [];
  if (!state.tplFilter || (state.tplFilter !== '__all' && !cats.includes(state.tplFilter))) state.tplFilter = '__all';
  const active = state.tplFilter;
  const visible = active === '__all' ? posts : posts.filter(p => p.category === active);

  root.innerHTML = `
    <div class="admin-stack">
      <div class="card" style="margin-bottom:18px;"><div class="pad">
        <h2 style="font-size:1.1rem;">🏷️ Categories</h2>
        <p class="subtle" style="font-size:.88rem;">These power the filter franchisees see in the Content Library, and the category picker on each template.</p>
        <form id="catForm" style="display:flex; gap:10px; margin:10px 0 4px; flex-wrap:wrap;">
          <input name="newCat" placeholder="New category name" style="flex:1; min-width:200px; padding:10px; border:1.5px solid var(--bo-gray-light); border-radius:9px; font-family:inherit; font-size:.95rem;" />
          <button class="btn btn-primary" type="submit">Add category</button>
        </form>
        <div class="cat-list" id="catList">
          ${cats.length ? cats.map(c => `
            <span class="cat-pill">
              <span>${esc(c)}</span>
              <button data-edit-cat="${esc(c)}" title="Rename">✎</button>
              <button data-del-cat="${esc(c)}" title="Delete">✕</button>
            </span>`).join('') : '<span class="subtle" style="font-size:.88rem;">No categories yet — add your first above.</span>'}
        </div>
      </div></div>

      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
        <h2 style="margin:0;">Templates <span class="subtle" style="font-weight:400;">(${posts.length})</span></h2>
        <button class="btn btn-primary" id="newTplBtn">➕ New template</button>
      </div>
      <div class="filter-bar">
        <span class="filter-label">Filter:</span>
        <button class="filter-chip ${active==='__all'?'on':''}" data-tcat="__all">All</button>
        ${cats.map(c => `<button class="filter-chip ${active===c?'on':''}" data-tcat="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>
      <div id="tplList">${visible.length ? '' : '<div class="muted-note">No templates here yet.</div>'}</div>
    </div>`;

  // category management
  document.getElementById('catForm').onsubmit = e => {
    e.preventDefault();
    const name = e.target.newCat.value.trim();
    if (!name) return;
    withBusy(e.target.querySelector('button[type=submit]'), async () => {
      try { const r = await api.post('/admin/categories', { name }); state.categories = r.categories; toast('Category added'); renderTemplates(root); }
      catch (err) { toast(err.error || 'Could not add category'); }
    });
  };
  root.querySelectorAll('button[data-edit-cat]').forEach(b => b.onclick = async () => {
    const oldName = b.dataset.editCat;
    const newName = prompt('Rename category:', oldName);
    if (newName === null || newName.trim() === oldName) return;
    try { const r = await api.post('/admin/categories/rename', { oldName, newName: newName.trim() }); state.categories = r.categories; await refreshLibrary(); toast('Category renamed'); renderTemplates(root); }
    catch (err) { toast(err.error || 'Rename failed'); }
  });
  root.querySelectorAll('button[data-del-cat]').forEach(b => b.onclick = async () => {
    const name = b.dataset.delCat;
    if (!confirm(`Delete category "${name}"? Posts using it become Uncategorized.`)) return;
    try { const r = await api.post('/admin/categories/delete', { name }); state.categories = r.categories; await refreshLibrary(); toast('Category deleted'); renderTemplates(root); }
    catch (err) { toast(err.error || 'Delete failed'); }
  });

  document.getElementById('newTplBtn').onclick = () => { state.tplForm = blankDraft(); renderTemplates(root); };
  root.querySelectorAll('button[data-tcat]').forEach(b => b.onclick = () => { state.tplFilter = b.dataset.tcat; renderTemplates(root); });

  const list = document.getElementById('tplList');
  list.innerHTML = visible.map(post => `
    <div class="card" style="margin-bottom:12px;"><div class="pad" style="display:flex; gap:12px; align-items:flex-start;">
      <div class="tpl-thumb">${mediaThumb(post.image, post.title)}</div>
      <div style="flex:1; min-width:0;">
        ${post.category ? `<span class="tag">${esc(post.category)}</span>` : `<span class="tag" style="background:#EBECEF; color:var(--bo-gray);">Uncategorized</span>`}
        <div style="font-weight:700; overflow-wrap:anywhere;">${esc(post.title)}</div>
        <div class="subtle clamp-2" style="font-size:.85rem;">${esc(post.caption)}</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <button class="btn btn-ghost" style="padding:6px 14px;" data-edit="${post.id}">Edit</button>
        <button class="btn btn-ghost" style="padding:6px 14px; color:#E62A65; border-color:#f5c2d3;" data-del="${post.id}">Delete</button>
      </div>
    </div></div>`).join('') || list.innerHTML;

  list.querySelectorAll('button[data-edit]').forEach(b => b.onclick = () => {
    const post = posts.find(p => p.id === b.dataset.edit);
    state.tplForm = { id: post.id, title: post.title, category: post.category,
      caption: post.caption, image: post.image,
      media: (post.media && post.media.length) ? [...post.media] : (post.image ? [post.image] : []),
      platforms: [...post.platforms] };
    renderTemplates(root);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  list.querySelectorAll('button[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this template from the library?')) return;
    try { await api.post('/admin/library/delete', { id: b.dataset.del }); toast('Template deleted'); renderTemplates(root); }
    catch (err) { toast(err.error || 'Delete failed'); }
  });
}

// the create/edit template form (shown inside Templates when adding/editing)
function renderTemplateForm(root) {
  const cats = state.categories || [];
  let draft = state.tplForm;
  if (!draft.media) draft.media = draft.image ? [draft.image] : [];

  root.innerHTML = `
    <div class="admin-stack">
      <button class="btn btn-ghost" id="tplBack" style="margin-bottom:14px;">← Back to templates</button>
      <div class="card"><div class="pad">
        <h2 id="formTitle">${draft.id ? '✏️ Edit template' : '➕ Add a template to the library'}</h2>
        <p class="subtle" style="font-size:.9rem;">It instantly appears in every franchisee's Content Library, ready for them to customize and publish. Use [BRACKETS] for details each location fills in (e.g. [CITY], [YOUR PHONE]).</p>
        <form id="adminForm">
          <label class="alabel">1. Upload designs (images or video)</label>
          <div class="uploader">
            <div>
              <button class="btn btn-blue" type="button" id="pickFileBtn">📤 Add image or video</button>
              <div class="subtle" style="font-size:.78rem; margin-top:6px;">Add one or several. The first is the cover. Images: PNG, JPG, SVG. Videos: MP4, WEBM, MOV.</div>
            </div>
            <input type="file" id="imgFile" accept="image/*,video/*" multiple style="display:none;" />
          </div>
          <div id="mediaList" class="media-list"></div>
          <input type="hidden" name="image" />
          <label class="alabel">2. Template name<input name="title" placeholder="e.g. Did You Know — Odor Removal" required /></label>
          <label class="alabel">3. Category
            <select name="category">
              <option value="">— Uncategorized —</option>
              ${cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
            </select>
          </label>
          <label class="alabel">4. Default caption<textarea name="caption" style="min-height:120px;" placeholder="Write the caption franchisees start from…" required></textarea></label>
          <p class="alabel" style="margin-top:14px;">5. Available on</p>
          <div class="platforms" id="adminPlats">
            ${state.platforms.map(p=>`<button type="button" class="chip off" data-p="${p.id}"><span class="dot"></span>${esc(p.name)}</button>`).join('')}
          </div>
          <div style="display:flex; gap:10px; margin-top:20px;">
            <button class="btn btn-primary" type="submit">Save to library</button>
            <button class="btn btn-ghost" type="button" id="cancelTpl">Cancel</button>
          </div>
        </form>
      </div></div>
    </div>`;

  root.querySelectorAll('.alabel').forEach(l => { l.style.cssText = 'display:block; font-weight:700; font-size:.85rem; margin-top:14px;'; });
  root.querySelectorAll('.alabel input, .alabel textarea, .alabel select').forEach(i => { i.style.cssText = 'width:100%; margin-top:5px; padding:10px; border:1.5px solid #BDBDBF; border-radius:9px; font-family:inherit; font-size:.95rem; background:#fff;'; });

  const form = document.getElementById('adminForm');
  const mediaList = document.getElementById('mediaList');

  function renderMediaList() {
    draft.image = draft.media[0] || '';
    form.image.value = draft.image;
    mediaList.innerHTML = draft.media.map((m, i) => `
      <div class="media-item">
        <div class="media-prev">${isVideo(m) ? `<video src="${esc(m)}" muted></video>` : `<img src="${esc(m)}"/>`}</div>
        ${i===0 ? '<span class="cover-tag">Cover</span>' : `<button type="button" class="mini" data-cover="${i}" title="Make cover">★</button>`}
        <button type="button" class="mini del" data-rm="${i}" title="Remove">✕</button>
      </div>`).join('');
    mediaList.querySelectorAll('button[data-rm]').forEach(b => b.onclick = () => { draft.media.splice(+b.dataset.rm, 1); renderMediaList(); });
    mediaList.querySelectorAll('button[data-cover]').forEach(b => b.onclick = () => {
      const i = +b.dataset.cover; const [m] = draft.media.splice(i, 1); draft.media.unshift(m); renderMediaList();
    });
  }

  function fillForm() {
    form.title.value = draft.title; form.category.value = draft.category; form.caption.value = draft.caption;
    renderMediaList();
    root.querySelectorAll('#adminPlats .chip').forEach(c => {
      const on = draft.platforms.includes(c.dataset.p);
      c.classList.toggle('off', !on);
      c.style.background = on ? platMeta(c.dataset.p).color : '';
    });
  }
  fillForm();

  root.querySelectorAll('#adminPlats .chip').forEach(c => c.onclick = () => {
    const id = c.dataset.p;
    draft.platforms = draft.platforms.includes(id) ? draft.platforms.filter(x=>x!==id) : [...draft.platforms, id];
    fillForm();
  });

  const imgFile = document.getElementById('imgFile');
  const pickBtn = document.getElementById('pickFileBtn');
  pickBtn.onclick = () => imgFile.click();
  imgFile.onchange = ev => {
    const files = [...ev.target.files]; if (!files.length) return;
    withBusy(pickBtn, async () => {
      for (const file of files) {
        const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
        try {
          const { image } = await api.post('/admin/upload', { filename: file.name.replace(/\.[^.]+$/,''), dataUrl });
          draft.media.push(image);
        } catch (err) { toast(err.error || 'Upload failed'); }
      }
      imgFile.value = '';
      renderMediaList();
      toast('Upload complete');
    }, 'Uploading…');
  };

  const back = () => { state.tplForm = null; renderTemplates(root); };
  document.getElementById('tplBack').onclick = back;
  document.getElementById('cancelTpl').onclick = back;

  form.onsubmit = e => {
    e.preventDefault();
    const wasEditing = !!draft.id;
    const payload = { id: draft.id, title: form.title.value, category: form.category.value,
      caption: form.caption.value, image: form.image.value, media: draft.media, platforms: draft.platforms };
    withBusy(form.querySelector('button[type=submit]'), async () => {
      try {
        await api.post('/admin/library', payload);
        await refreshLibrary();
        toast(wasEditing ? 'Template updated' : 'Template added to library');
        state.tplForm = null;
        renderTemplates(root);
      } catch (err) { toast(err.error || 'Save failed'); }
    }, 'Saving…');
  };
}

boot();
