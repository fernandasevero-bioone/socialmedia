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
    ${authLinks([['Create an account', 'signup'], ['Forgot password?', 'forgot']])}
    <p class="subtle" style="font-size:.8rem; margin-top:14px;">Demo: modesto@biooneinc.com or corporate@biooneinc.com &middot; password <b>demo</b></p>`);
  wireAuthLinks(form);
  form.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(form);
    try {
      const { user } = await api.post('/login', { email: f.get('email'), password: f.get('password') });
      state.user = user; await loadData(); renderApp();
    } catch (err) { toast(err.error || 'Login failed'); }
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
  form.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(form);
    try {
      const { user } = await api.post('/register', {
        name: f.get('name'), location: f.get('location'),
        email: f.get('email'), password: f.get('password')
      });
      state.user = user; await loadData();
      toast('Welcome to Bio-One Social Hub, ' + user.name.split(' ')[0] + '!');
      renderApp();
    } catch (err) { toast(err.error || 'Could not create account'); }
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
        <button class="tab ${state.view==='library'?'active':''}" data-v="library">Content Library</button>
        <button class="tab ${state.view==='calendar'?'active':''}" data-v="calendar">📅 Calendar</button>
        <button class="tab ${state.view==='connections'?'active':''}" data-v="connections">My Accounts</button>
        <button class="tab ${state.view==='history'?'active':''}" data-v="history">History</button>
        ${state.user.role === 'admin' ? `<button class="tab ${state.view==='admin'?'active':''}" data-v="admin">⚙️ Admin</button>` : ''}
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
  if (state.view === 'calendar')    return renderCalendar(root);
  if (state.view === 'connections') return renderConnections(root);
  if (state.view === 'history')     return renderHistory(root);
  if (state.view === 'admin')       return renderAdmin(root);
}

// ---------- library ----------
function renderLibrary(root) {
  root.innerHTML = '';
  if (!connectedCount()) {
    root.innerHTML = `<div class="muted-note" style="margin-bottom:18px;">
      👋 You haven't connected any accounts yet. Head to <b>My Accounts</b> to connect, then publish from here.</div>`;
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
  grid.className = 'grid grid-3';
  grid.innerHTML = visible.map(post => `
    <div class="card">
      <div class="thumb"><img src="${esc(post.image)}" alt="${esc(post.title)}" onerror="this.style.display='none'"/></div>
      <div class="pad">
        ${post.category ? `<span class="tag">${esc(post.category)}</span>` : ''}
        <h2 style="font-size:1.05rem;">${esc(post.title)}</h2>
        <p class="subtle" style="font-size:.9rem; max-height:3em; overflow:hidden;">${esc(post.caption)}</p>
        <div style="display:flex; gap:10px; margin-top:12px; align-items:center;">
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
  grid.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => {
    const post = state.library.find(p => p.id === b.dataset.id);
    state.editing = { libraryId: post.id, caption: post.caption, image: post.image,
      platforms: post.platforms.filter(t => state.accounts[t]) };
    renderView();
  });
  grid.querySelectorAll('button[data-dl]').forEach(b => b.onclick = () => {
    const post = state.library.find(p => p.id === b.dataset.dl);
    const ext = (post.image.split('.').pop() || 'png').split(/[?#]/)[0];
    const name = post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    triggerDownload(post.image, `${name}.${ext}`);
    toast('Downloading design…');
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

// ---------- calendar ----------
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

async function renderCalendar(root) {
  root.innerHTML = `<p class="subtle">Loading…</p>`;
  const { posts } = await api.get('/posts');

  // group posts by local YYYY-MM-DD (scheduled use their date; published use posted date)
  const byDay = {};
  posts.forEach(p => {
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
  const scheduledCount = posts.filter(p => p.status === 'scheduled' && new Date(p.scheduledFor) >= new Date(today.toDateString())).length;

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
        <p class="subtle" style="font-size:.85rem;">Published ${new Date(post.createdAt).toLocaleString()}. Published posts can't be edited here.</p>`}
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay.querySelector('#mClose').onclick = close;

  if (isScheduled) {
    overlay.querySelector('#mSave').onclick = async () => {
      const when = overlay.querySelector('#mWhen').value;
      if (!when) return toast('Pick a date/time');
      try {
        await api.post('/posts/update', { id: post.id,
          caption: overlay.querySelector('#mCap').value,
          scheduledFor: new Date(when).toISOString() });
        toast('Scheduled post updated');
        close(); onChange();
      } catch (err) { toast(err.error || 'Update failed'); }
    };
    overlay.querySelector('#mCancel').onclick = async () => {
      if (!confirm('Cancel this scheduled post? It will not be published.')) return;
      try {
        await api.post('/posts/delete', { id: post.id });
        toast('Post canceled');
        close(); onChange();
      } catch (err) { toast(err.error || 'Cancel failed'); }
    };
  }
}

// ---------- admin (corporate only) ----------
function blankDraft() {
  return { id: null, title: '', category: '', caption: '', image: '',
    platforms: ['facebook','instagram','linkedin','x'] };
}

async function renderAdmin(root) {
  if (state.user.role !== 'admin') { state.view = 'library'; return renderView(); }
  const { posts } = await api.get('/library');

  const cats = state.categories || [];
  root.innerHTML = `
    <div class="card" style="margin-bottom:18px;"><div class="pad">
      <h2 style="font-size:1.1rem;">🏷️ Categories</h2>
      <p class="subtle" style="font-size:.88rem;">These power the filter franchisees see in the Content Library, and the category picker below.</p>
      <form id="catForm" style="display:flex; gap:10px; margin:10px 0 4px; flex-wrap:wrap;">
        <input name="newCat" placeholder="New category name (e.g. Did You Know)" style="flex:1; min-width:200px; padding:10px; border:1.5px solid var(--bo-gray-light); border-radius:9px; font-family:inherit; font-size:.95rem;" />
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

    <div class="grid admin-grid">
      <div class="card admin-col"><div class="pad">
        <h2 id="formTitle">➕ Add a template to the library</h2>
        <p class="subtle" style="font-size:.9rem;">Upload a design and caption here. It instantly appears in every franchisee's Content Library, ready for them to customize and publish. Use [BRACKETS] for details each location fills in (e.g. [CITY], [YOUR PHONE]).</p>
        <form id="adminForm">
          <label class="alabel">1. Upload the design image</label>
          <div class="uploader" id="dropZone">
            <img id="imgPrev" src="" style="width:72px; height:72px; object-fit:cover; border-radius:8px; background:#EBECEF; display:none;" />
            <div>
              <button class="btn btn-blue" type="button" id="pickFileBtn">📤 Choose image from your computer</button>
              <div class="subtle" style="font-size:.78rem; margin-top:6px;">PNG, JPG, or SVG — e.g. a Canva export from the Bio-One Branding kit.</div>
            </div>
            <input type="file" id="imgFile" accept="image/*" style="display:none;" />
          </div>
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
            <button class="btn btn-ghost" type="button" id="resetBtn">Clear</button>
          </div>
        </form>
      </div></div>

      <div class="admin-col">
        <h2 style="margin:0 0 12px;">Library posts <span class="subtle" style="font-weight:400;">(${posts.length})</span></h2>
        <div id="adminList"></div>
      </div>
    </div>`;

  // style hook for labels
  root.querySelectorAll('.alabel').forEach(l => { l.style.cssText = 'display:block; font-weight:700; font-size:.85rem; margin-top:14px;'; });
  root.querySelectorAll('.alabel input, .alabel textarea, .alabel select').forEach(i => { i.style.cssText = 'width:100%; margin-top:5px; padding:10px; border:1.5px solid #BDBDBF; border-radius:9px; font-family:inherit; font-size:.95rem; background:#fff;'; });

  // ---- category management ----
  document.getElementById('catForm').onsubmit = async e => {
    e.preventDefault();
    const name = e.target.newCat.value.trim();
    if (!name) return;
    try { const r = await api.post('/admin/categories', { name }); state.categories = r.categories; toast('Category added'); renderAdmin(root); }
    catch (err) { toast(err.error || 'Could not add category'); }
  };
  root.querySelectorAll('button[data-edit-cat]').forEach(b => b.onclick = async () => {
    const oldName = b.dataset.editCat;
    const newName = prompt('Rename category:', oldName);
    if (newName === null || newName.trim() === oldName) return;
    try { const r = await api.post('/admin/categories/rename', { oldName, newName: newName.trim() }); state.categories = r.categories; await refreshLibrary(); toast('Category renamed'); renderAdmin(root); }
    catch (err) { toast(err.error || 'Rename failed'); }
  });
  root.querySelectorAll('button[data-del-cat]').forEach(b => b.onclick = async () => {
    const name = b.dataset.delCat;
    if (!confirm(`Delete category "${name}"? Posts using it become Uncategorized.`)) return;
    try { const r = await api.post('/admin/categories/delete', { name }); state.categories = r.categories; await refreshLibrary(); toast('Category deleted'); renderAdmin(root); }
    catch (err) { toast(err.error || 'Delete failed'); }
  });

  let draft = state.adminDraft || blankDraft();
  state.adminDraft = null;
  const form = document.getElementById('adminForm');
  const imgPrev = document.getElementById('imgPrev');

  function fillForm() {
    form.title.value = draft.title; form.category.value = draft.category;
    form.caption.value = draft.caption; form.image.value = draft.image || '';
    document.getElementById('formTitle').textContent = draft.id ? '✏️ Edit template' : '➕ Add a template to the library';
    if (draft.image) { imgPrev.src = draft.image; imgPrev.style.display = 'block'; } else { imgPrev.style.display = 'none'; }
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
  document.getElementById('pickFileBtn').onclick = () => imgFile.click();
  imgFile.onchange = async ev => {
    const file = ev.target.files[0]; if (!file) return;
    const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    try {
      const { image } = await api.post('/admin/upload', { filename: file.name.replace(/\.[^.]+$/,''), dataUrl });
      draft.image = image; form.image.value = image; imgPrev.src = image; imgPrev.style.display = 'block';
      toast('Image uploaded');
    } catch (err) { toast(err.error || 'Upload failed'); }
  };

  document.getElementById('resetBtn').onclick = () => { draft = blankDraft(); fillForm(); };

  form.onsubmit = async e => {
    e.preventDefault();
    const payload = { id: draft.id, title: form.title.value, category: form.category.value,
      caption: form.caption.value, image: form.image.value, platforms: draft.platforms };
    try {
      await api.post('/admin/library', payload);
      toast(draft.id ? 'Post updated' : 'Post added');
      renderAdmin(root);
    } catch (err) { toast(err.error || 'Save failed'); }
  };

  const list = document.getElementById('adminList');
  list.innerHTML = posts.map(post => `
    <div class="card" style="margin-bottom:12px;"><div class="pad" style="display:flex; gap:12px; align-items:flex-start;">
      <img src="${esc(post.image)}" style="width:56px; height:56px; object-fit:cover; border-radius:8px; flex-shrink:0;" onerror="this.style.visibility='hidden'"/>
      <div style="flex:1; min-width:0;">
        ${post.category ? `<span class="tag">${esc(post.category)}</span>` : `<span class="tag" style="background:#EBECEF; color:var(--bo-gray);">Uncategorized</span>`}
        <div style="font-weight:700; overflow-wrap:anywhere;">${esc(post.title)}</div>
        <div class="subtle clamp-2" style="font-size:.85rem;">${esc(post.caption)}</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <button class="btn btn-ghost" style="padding:6px 14px;" data-edit="${post.id}">Edit</button>
        <button class="btn btn-ghost" style="padding:6px 14px; color:#E62A65; border-color:#f5c2d3;" data-del="${post.id}">Delete</button>
      </div>
    </div></div>`).join('');

  list.querySelectorAll('button[data-edit]').forEach(b => b.onclick = () => {
    const post = posts.find(p => p.id === b.dataset.edit);
    state.adminDraft = { id: post.id, title: post.title, category: post.category,
      caption: post.caption, image: post.image, platforms: [...post.platforms] };
    renderAdmin(root);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  list.querySelectorAll('button[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this post from the library?')) return;
    try { await api.post('/admin/library/delete', { id: b.dataset.del }); toast('Deleted'); renderAdmin(root); }
    catch (err) { toast(err.error || 'Delete failed'); }
  });
}

boot();
