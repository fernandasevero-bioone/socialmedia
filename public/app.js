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
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const platMeta = id => state.platforms.find(p => p.id === id) || { name:id, color:'#7A7A80' };

// ---------- bootstrap ----------
async function boot() {
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
  const [pl, lib, acc] = await Promise.all([ api.get('/platforms'), api.get('/library'), api.get('/accounts') ]);
  state.platforms = pl.platforms; state.library = lib.posts; state.accounts = acc.accounts;
}

// ---------- login ----------
function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="loginForm">
        <div class="logo" style="font-size:1.5rem;"><span class="mark">B1</span>
          <div>Bio-One Social<small>Help First, Business Second.</small></div></div>
        <p class="subtle" style="margin-top:14px;">Sign in to manage your locations' social media.</p>
        <label>Email<input name="email" type="email" value="modesto@biooneinc.com" required /></label>
        <label>Password<input name="password" type="password" value="demo" required /></label>
        <button class="btn btn-primary" style="width:100%; justify-content:center; margin-top:22px;">Sign In</button>
        <p class="subtle" style="font-size:.8rem; margin-top:14px;">Demo accounts: modesto@ / corporate@ &middot; password <b>demo</b></p>
      </form>
    </div>`;
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const { user } = await api.post('/login', { email: f.get('email'), password: f.get('password') });
      state.user = user; await loadData(); renderApp();
    } catch (err) { toast(err.error || 'Login failed'); }
  });
}

// ---------- shell ----------
function renderApp() {
  app.innerHTML = `
    <header class="topnav">
      <div class="logo"><span class="mark">B1</span><div>Bio-One Social<small>${esc(state.user.location)}</small></div></div>
      <div style="display:flex; align-items:center; gap:14px;">
        <span class="subtle">${esc(state.user.name)}</span>
        <button class="btn btn-ghost" id="logoutBtn">Sign out</button>
      </div>
    </header>
    <div class="container">
      <div class="tabs">
        <button class="tab ${state.view==='library'?'active':''}" data-v="library">Content Library</button>
        <button class="tab ${state.view==='connections'?'active':''}" data-v="connections">My Accounts</button>
        <button class="tab ${state.view==='history'?'active':''}" data-v="history">History</button>
      </div>
      <div id="viewRoot"></div>
    </div>`;
  document.getElementById('logoutBtn').onclick = async () => { await api.post('/logout'); state.user=null; renderLogin(); };
  app.querySelectorAll('.tab').forEach(b => b.onclick = () => { state.view = b.dataset.v; renderView(); });
  renderView();
}

function connectedCount() { return Object.keys(state.accounts).length; }

function renderView() {
  const root = document.getElementById('viewRoot');
  if (state.editing) return renderComposer(root);
  if (state.view === 'library')     return renderLibrary(root);
  if (state.view === 'connections') return renderConnections(root);
  if (state.view === 'history')     return renderHistory(root);
}

// ---------- library ----------
function renderLibrary(root) {
  if (!connectedCount()) {
    root.innerHTML = `<div class="muted-note" style="margin-bottom:18px;">
      👋 You haven't connected any accounts yet. Head to <b>My Accounts</b> to connect, then publish from here.</div>`;
  } else { root.innerHTML = ''; }
  const grid = document.createElement('div');
  grid.className = 'grid grid-3';
  grid.innerHTML = state.library.map(post => `
    <div class="card">
      <div class="thumb"><img src="${esc(post.image)}" alt="${esc(post.title)}" onerror="this.style.display='none'"/></div>
      <div class="pad">
        <span class="tag">${esc(post.category)}</span>
        <h2 style="font-size:1.05rem;">${esc(post.title)}</h2>
        <p class="subtle" style="font-size:.9rem; max-height:3em; overflow:hidden;">${esc(post.caption)}</p>
        <button class="btn btn-primary" style="margin-top:12px;" data-id="${esc(post.id)}">Use this post</button>
      </div>
    </div>`).join('');
  root.appendChild(grid);
  grid.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => {
    const post = state.library.find(p => p.id === b.dataset.id);
    state.editing = { libraryId: post.id, caption: post.caption, image: post.image,
      platforms: post.platforms.filter(t => state.accounts[t]) };
    renderView();
  });
}

// ---------- composer ----------
function renderComposer(root) {
  const e = state.editing;
  const connected = state.platforms.filter(p => state.accounts[p.id]);
  root.innerHTML = `
    <button class="btn btn-ghost" id="backBtn" style="margin-bottom:18px;">← Back to library</button>
    <div class="grid" style="grid-template-columns: 1.3fr 1fr; align-items:start;">
      <div class="card"><div class="pad">
        <h2>Customize your caption</h2>
        <p class="subtle" style="font-size:.9rem;">Replace the [BRACKETS] with your location's details.</p>
        <textarea id="cap">${esc(e.caption)}</textarea>
        <div class="counter" id="counter"></div>

        <h2 style="margin-top:18px; font-size:1.1rem;">Publish to</h2>
        ${connected.length ? `<div class="platforms" id="platPick">
          ${connected.map(p => `<button class="chip ${e.platforms.includes(p.id)?'':'off'}" data-p="${p.id}"
            style="${e.platforms.includes(p.id)?`background:${p.color}`:''}"><span class="dot"></span>${esc(p.name)}</button>`).join('')}
        </div>` : `<div class="muted-note">No connected accounts. Connect one under <b>My Accounts</b> first.</div>`}

        <div style="display:flex; gap:10px; margin-top:22px; flex-wrap:wrap;">
          <button class="btn btn-primary" id="pubNow" ${connected.length?'':'disabled'}>Publish now</button>
          <button class="btn btn-blue" id="schedBtn" ${connected.length?'':'disabled'}>Schedule…</button>
        </div>
        <div id="schedRow" style="display:none; margin-top:12px;">
          <label class="subtle" style="font-size:.85rem;">When:
            <input type="datetime-local" id="schedAt" style="padding:8px; border-radius:8px; border:1.5px solid #BDBDBF; font-family:inherit;"/></label>
          <button class="btn btn-ghost" id="schedGo">Confirm schedule</button>
        </div>
      </div></div>

      <div class="card">
        <div class="thumb"><img src="${esc(e.image)}" onerror="this.parentNode.style.minHeight='220px'"/></div>
        <div class="pad"><span class="tag">Live preview</span>
          <p id="preview" style="white-space:pre-wrap; font-size:.92rem;"></p></div>
      </div>
    </div>`;

  const cap = document.getElementById('cap');
  const counter = document.getElementById('counter');
  const preview = document.getElementById('preview');
  const minLimit = () => Math.min(...e.platforms.map(p => platMeta(p).captionLimit || 9999), 9999);
  const refresh = () => {
    e.caption = cap.value;
    preview.textContent = cap.value;
    const lim = e.platforms.length ? minLimit() : 280;
    const over = cap.value.length > lim;
    counter.textContent = `${cap.value.length} / ${lim} chars${e.platforms.length?` (tightest: ${platMeta(e.platforms.reduce((a,b)=>(platMeta(a).captionLimit<platMeta(b).captionLimit?a:b))).name})`:''}`;
    counter.classList.toggle('over', over);
  };
  cap.addEventListener('input', refresh); refresh();

  document.getElementById('backBtn').onclick = () => { state.editing = null; renderView(); };
  root.querySelectorAll('button[data-p]').forEach(b => b.onclick = () => {
    const id = b.dataset.p;
    e.platforms = e.platforms.includes(id) ? e.platforms.filter(x=>x!==id) : [...e.platforms, id];
    renderComposer(root);
  });

  const publish = async (scheduledFor) => {
    if (!e.platforms.length) return toast('Pick at least one account');
    try {
      const { post } = await api.post('/publish', { libraryId: e.libraryId, caption: e.caption, platforms: e.platforms, scheduledFor });
      toast(scheduledFor ? '🗓️ Scheduled!' : '✅ Published to ' + e.platforms.length + ' account(s)');
      state.editing = null; state.view = 'history'; renderView();
    } catch (err) { toast(err.error || 'Publish failed'); }
  };
  const pubNow = document.getElementById('pubNow'); if (pubNow) pubNow.onclick = () => publish(null);
  const schedBtn = document.getElementById('schedBtn');
  if (schedBtn) schedBtn.onclick = () => { document.getElementById('schedRow').style.display='flex'; };
  const schedGo = document.getElementById('schedGo');
  if (schedGo) schedGo.onclick = () => { const v = document.getElementById('schedAt').value; if(!v) return toast('Pick a date/time'); publish(new Date(v).toISOString()); };
}

// ---------- connections ----------
function renderConnections(root) {
  root.innerHTML = `<div class="card"><div class="pad">
    <h2>Your social accounts</h2>
    <p class="subtle">Each franchisee connects and controls their own accounts. Only you can see and post to these.</p>
    <div id="connList" style="margin-top:8px;"></div>
  </div></div>`;
  const list = document.getElementById('connList');
  list.innerHTML = state.platforms.map(p => {
    const acc = state.accounts[p.id];
    return `<div class="conn-row">
      <div class="conn-left">
        <span class="chip" style="background:${p.color}"><span class="dot"></span>${esc(p.name)}</span>
        ${acc ? `<span class="subtle">${esc(acc.handle)}</span>` : `<span class="subtle">Not connected</span>`}
        ${p.liveReady ? '' : '<span class="badge no" title="API access pending approval">demo</span>'}
      </div>
      <div>${acc
        ? `<span class="badge ok">Connected</span> <button class="btn btn-ghost" data-disc="${p.id}">Disconnect</button>`
        : `<button class="btn btn-primary" data-conn="${p.id}">Connect</button>`}</div>
    </div>`;
  }).join('');

  list.querySelectorAll('button[data-conn]').forEach(b => b.onclick = async () => {
    const { accounts } = await api.post('/connect', { platform: b.dataset.conn });
    state.accounts = accounts; toast('Connected ' + platMeta(b.dataset.conn).name); renderConnections(root);
  });
  list.querySelectorAll('button[data-disc]').forEach(b => b.onclick = async () => {
    const { accounts } = await api.post('/disconnect', { platform: b.dataset.disc });
    state.accounts = accounts; renderConnections(root);
  });
}

// ---------- history ----------
async function renderHistory(root) {
  root.innerHTML = `<p class="subtle">Loading…</p>`;
  const { posts } = await api.get('/posts');
  if (!posts.length) { root.innerHTML = `<div class="muted-note">No posts yet. Publish your first one from the Content Library.</div>`; return; }
  root.innerHTML = posts.map(post => `
    <div class="card" style="margin-bottom:14px;"><div class="pad">
      <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <span class="badge ${post.status==='published'?'ok':'no'}">${post.status==='scheduled'?'🗓️ Scheduled':'✅ Published'}</span>
        <span class="subtle" style="font-size:.85rem;">${new Date(post.scheduledFor||post.createdAt).toLocaleString()}</span>
      </div>
      <p style="white-space:pre-wrap; margin:10px 0;">${esc(post.caption)}</p>
      <div class="platforms">${post.platforms.map(t => {
        const r = post.results[t];
        const link = r && r.externalUrl;
        const chip = `<span class="chip" style="background:${platMeta(t).color}"><span class="dot"></span>${esc(platMeta(t).name)}</span>`;
        return link ? `<a href="${esc(link)}" target="_blank" style="text-decoration:none;">${chip}</a>` : chip;
      }).join('')}</div>
    </div></div>`).join('');
}

boot();
