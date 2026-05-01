// ─── STATE ───
let currentProfileId = null;
let currentProfileData = null;
let editingTradeId = null;
let deleteTarget = null;
let allTrades = [];
let chartInstances = {};
let currentUser = JSON.parse(localStorage.getItem('tradelog_user') || 'null');

const API = '';

// ─── HELPERS ───
function $(id) { return document.getElementById(id); }

async function apiFetch(url, options = {}) {
  const headers = options.headers || {};
  if (currentUser && currentUser.password) {
    headers['X-Profile-Password'] = currentUser.password;
  }
  
  const res = await fetch(url, { ...options, headers: { ...headers, 'Content-Type': 'application/json' } });
  const json = await res.json();
  if (res.status === 401) {
    toast('Unauthorized - Please login', 'error');
    logout();
  }
  return json;
}

function toast(msg, type = 'success') {
  const c = $('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}
function openModal(id) { $(id).classList.add('active'); }
function closeModal(id) { $(id).classList.remove('active'); editingTradeId = null; }
function fmt(n, d = 2) { return n != null ? Number(n).toFixed(d) : '—'; }
function fmtPnL(n) {
  if (n == null) return '—';
  const cls = n >= 0 ? 'pnl-positive' : 'pnl-negative';
  const sign = n >= 0 ? '+' : '';
  return `<span class="${cls}">${sign}$${fmt(n)}</span>`;
}
function fmtPct(n) {
  if (n == null) return '—';
  const cls = n >= 0 ? 'pnl-positive' : 'pnl-negative';
  const sign = n >= 0 ? '+' : '';
  return `<span class="${cls}">${sign}${fmt(n)}%</span>`;
}
function fmtRR(n) {
  if (n == null || n === 0) return '—';
  return `<span style="font-weight:600;color:var(--text-primary)">${fmt(n)}R</span>`;
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function toggleRiskMode(checked) {
  const label = $('label-quantity');
  const input = $('trade-quantity');
  if (checked) {
    label.textContent = 'Risked (R) *';
    input.placeholder = 'e.g. 1.0';
  } else {
    label.textContent = 'Quantity *';
    input.placeholder = '0';
  }
}
function qualityDots(q) {
  let h = '';
  for (let i = 1; i <= 5; i++) h += `<div class="quality-dot${i <= q ? ' active' : ''}"></div>`;
  return `<div class="quality-dots">${h}</div>`;
}

// ─── AUTH ───
function openLoginModal() {
  $('login-name').value = '';
  $('login-password').value = '';
  openModal('modal-login');
  setTimeout(() => $('login-name').focus(), 100);
}

async function login() {
  const name = $('login-name').value.trim();
  const password = $('login-password').value;
  if (!name || !password) { toast('Please enter name and password', 'error'); return; }
  
  try {
    const res = await fetch(`${API}/api/profiles/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password })
    });
    const json = await res.json();
    if (!json.success) { toast(json.error, 'error'); return; }
    
    currentUser = { id: json.data.id, name: json.data.name, password: password, isAdmin: json.data.isAdmin };
    localStorage.setItem('tradelog_user', JSON.stringify(currentUser));
    
    updateAuthUI();
    closeModal('modal-login');
    toast(`Welcome back, ${currentUser.name}!`);
    
    if ($('page-profiles').style.display === '') loadProfiles();
    else if (currentProfileId === currentUser.id) openDashboard(currentProfileId);
  } catch (e) { toast('Login failed', 'error'); }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('tradelog_user');
  updateAuthUI();
  toast('Logged out');
  if ($('page-profiles').style.display === '') loadProfiles();
  else openDashboard(currentProfileId);
}

function updateAuthUI() {
  if (currentUser) {
    $('btn-header-login').style.display = 'none';
    $('logged-in-user').style.display = 'flex';
    $('logged-in-name').textContent = currentUser.name;
  } else {
    $('btn-header-login').style.display = '';
    $('logged-in-user').style.display = 'none';
  }
}

function isOwner(profileId) {
  return currentUser && currentUser.id === Number(profileId);
}

// ─── LOOKUPS ───
async function loadLookups() {
  try {
    const [sRes, cRes] = await Promise.all([
      fetch(`${API}/api/lookup/strategies`),
      fetch(`${API}/api/lookup/categories`)
    ]);
    const strats = (await sRes.json()).data || [];
    const cats = (await cRes.json()).data || [];
    
    populateSelect('trade-strategy', strats);
    populateSelect('trade-category', cats, '', 'No Category');
  } catch (e) { toast('Failed to load strategies/categories', 'error'); }
}

function populateSelect(id, data, currentVal = '', emptyLabel = null) {
  const select = $(id);
  let html = emptyLabel ? `<option value="">${emptyLabel}</option>` : '';
  data.forEach(item => {
    html += `<option value="${item.name}" ${item.name === currentVal ? 'selected' : ''}>${item.name}</option>`;
  });
  select.innerHTML = html;
}

async function addLookupItem(type) {
  if (!currentUser?.isAdmin && !isOwner(currentProfileId)) { toast('Only the owner or admin can add items', 'error'); return; }
  const name = prompt(`Enter new ${type.slice(0, -1)} name:`);
  if (!name || !name.trim()) return;
  
  try {
    const json = await apiFetch(`${API}/api/lookup/${type}`, {
      method: 'POST',
      body: JSON.stringify({ name: name.trim() })
    });
    if (!json.success) { toast(json.error, 'error'); return; }
    
    toast(`Added ${name}`);
    await loadLookups();
    $(type === 'strategies' ? 'trade-strategy' : 'trade-category').value = name.trim();
  } catch (e) { toast('Failed to add item', 'error'); }
}

async function openLookupManager(type) {
  if (!currentUser?.isAdmin && !isOwner(currentProfileId)) { toast('Only the owner or admin can manage items', 'error'); return; }
  $('lookup-manager-title').textContent = `Manage ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  openModal('modal-lookup-manager');
  try {
    const res = await fetch(`${API}/api/lookup/${type}`);
    const json = await res.json();
    renderLookupList(type, json.data || []);
  } catch (e) { toast('Failed to load items', 'error'); }
}

function renderLookupList(type, data) {
  const list = $('lookup-manager-list');
  if (!data.length) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">No items yet.</div>';
    return;
  }
  list.innerHTML = data.map(item => `
    <div class="lookup-item">
      <div class="lookup-item-name">${item.name}</div>
      <div class="lookup-item-actions">
        <button class="lookup-action-btn" onclick="renameLookupItem('${type}', ${item.id}, '${item.name.replace(/'/g, "\\'")}')" title="Rename">✎</button>
        <button class="lookup-action-btn delete" onclick="deleteLookupItem('${type}', ${item.id}, '${item.name.replace(/'/g, "\\'")}')" title="Delete">✕</button>
      </div>
    </div>
  `).join('');
}

async function renameLookupItem(type, id, oldName) {
  const newName = prompt(`Rename "${oldName}" to:`, oldName);
  if (!newName || !newName.trim() || newName === oldName) return;
  
  try {
    const json = await apiFetch(`${API}/api/lookup/${type}/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: newName.trim() })
    });
    if (!json.success) { toast(json.error, 'error'); return; }
    
    toast(`Renamed to ${newName}`);
    openLookupManager(type); // Refresh list
    loadLookups(); // Refresh dropdowns
  } catch (e) { toast('Failed to rename', 'error'); }
}

async function deleteLookupItem(type, id, name) {
  if (!confirm(`Delete ${type.slice(0, -1)} "${name}"? Trades using this will remain but the option will be gone.`)) return;
  
  try {
    const json = await apiFetch(`${API}/api/lookup/${type}/${id}`, { method: 'DELETE' });
    if (!json.success) { toast(json.error, 'error'); return; }
    
    toast(`Deleted ${name}`);
    openLookupManager(type); // Refresh list
    loadLookups(); // Refresh dropdowns
  } catch (e) { toast('Failed to delete', 'error'); }
}

// ─── PROFILES PAGE ───
async function loadProfiles() {
  try {
    const res = await fetch(`${API}/api/profiles`);
    const json = await res.json();
    renderProfiles(json.data || []);
  } catch (e) { toast('Failed to load profiles', 'error'); }
}

function renderProfiles(profiles) {
  const grid = $('profiles-grid');
  const isAdmin = currentUser && currentUser.isAdmin;
  // Orhan her zaman başta
  profiles = [...profiles].sort((a, b) => {
    if (a.name === 'Orhan') return -1;
    if (b.name === 'Orhan') return 1;
    return 0;
  });
  let html = '';
  profiles.forEach(p => {
    const wr = p.closed_trades > 0 ? ((p.winning_trades / p.closed_trades) * 100).toFixed(0) : '0';
    const pnlCls = (p.total_pnl || 0) >= 0 ? 'pnl-positive' : 'pnl-negative';
    const canDelete = isAdmin || isOwner(p.id);
    const isKing = p.name === 'Orhan';
    html += `
      <div class="card profile-card" onclick="openDashboard(${p.id})">
        ${canDelete ? `<button class="profile-delete-btn" onclick="event.stopPropagation();deleteProfile(${p.id},'${p.name.replace(/'/g, "\\'")}')" title="Delete">✕</button>` : ''}
        <div style="position:relative;display:inline-block;">
          ${isKing ? `<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:18px;line-height:1;filter:drop-shadow(0 0 6px gold);">👑</div>` : ''}
          <div class="profile-avatar" style="background:linear-gradient(135deg,${p.color},${p.color}dd)">${p.avatar_initials || '?'}</div>
        </div>
        <div class="profile-name">${p.name}</div>
        <div class="profile-meta">
          ${p.bio || p.default_market + ' Trader'} • ${fmtDate(p.created_at)}
          ${isAdmin && p.password_plain ? `<br><span style="color:var(--gold);font-size:10px">PWD: ${p.password_plain}</span>` : ''}
        </div>
        <div class="profile-stats">
          <div><div class="profile-stat-value">${p.total_trades || 0}</div><div class="profile-stat-label">Trades</div></div>
          <div><div class="profile-stat-value">${wr}%</div><div class="profile-stat-label">Win Rate</div></div>
          <div><div class="profile-stat-value ${pnlCls}">$${fmt(p.total_pnl || 0)}</div><div class="profile-stat-label">P&L</div></div>
          ${(p.total_r != null && p.total_r !== 0) ? `<div><div class="profile-stat-value" style="color:${p.total_r >= 0 ? 'var(--gold)' : 'var(--danger)'};">${p.total_r >= 0 ? '+' : ''}${fmt(p.total_r, 2)}R</div><div class="profile-stat-label">Total R</div></div>` : ''}
        </div>
      </div>`;
  });
  html += `<div class="card profile-card profile-card-new" onclick="openProfileModal()"><div class="plus">+</div><div>New Profile</div></div>`;
  grid.innerHTML = html;
}

function openProfileModal(existing = null) {
  const isAdmin = currentUser && currentUser.isAdmin;
  if (existing) {
    currentProfileId = existing.id;
    $('modal-profile-title').textContent = 'Edit Profile';
    $('profile-name').value = existing.name;
    $('profile-color').value = existing.color || '#3b82f6';
    $('profile-bio').value = existing.bio || '';
    $('profile-market').value = existing.default_market || 'Stocks';
    $('profile-risk-unit').value = existing.risk_unit_value || 100;
    $('btn-save-profile').textContent = 'Save Changes';
    
    if (isAdmin) {
      $('group-profile-password').style.display = '';
      $('profile-password').value = existing.password_plain || '';
      $('profile-password').placeholder = 'Change password';
    } else {
      $('group-profile-password').style.display = 'none';
    }
  } else {
    currentProfileId = null;
    $('modal-profile-title').textContent = 'New Profile';
    $('profile-name').value = '';
    $('profile-password').value = '';
    $('profile-password').placeholder = 'Min 4 characters';
    $('profile-color').value = '#3b82f6';
    $('profile-bio').value = '';
    $('profile-market').value = 'Stocks';
    $('profile-risk-unit').value = 100;
    $('btn-save-profile').textContent = 'Create Profile';
    $('group-profile-password').style.display = '';
  }
  openModal('modal-profile');
  setTimeout(() => $('profile-name').focus(), 100);
}

async function saveProfile() {
  const name = $('profile-name').value.trim();
  const password = $('profile-password').value;
  const isAdmin = currentUser && currentUser.isAdmin;
  if (!name) { toast('Name is required', 'error'); return; }
  if (!currentProfileId && (!password || password.length < 4)) {
    toast('Password is required for new profile (min 4 chars)', 'error');
    return;
  }
  
  try {
    const url = currentProfileId ? `${API}/api/profiles/${currentProfileId}` : `${API}/api/profiles`;
    const method = currentProfileId ? 'PUT' : 'POST';
    const json = await apiFetch(url, {
      method,
      body: JSON.stringify({
        name, password, color: $('profile-color').value,
        bio: $('profile-bio').value.trim(),
        default_market: $('profile-market').value,
        risk_unit_value: parseFloat($('profile-risk-unit').value || 100)
      })
    });
    if (!json.success) { toast(json.error, 'error'); return; }
    
    if (!currentProfileId && !isAdmin) {
      // Auto login after create (only if not admin)
      currentUser = { id: json.data.id, name: json.data.name, password: password };
      localStorage.setItem('tradelog_user', JSON.stringify(currentUser));
      updateAuthUI();
    }
    
    toast(currentProfileId ? 'Profile updated' : `Profile "${name}" created`);
    closeModal('modal-profile');
    if (currentProfileId) openDashboard(currentProfileId);
    else loadProfiles();
  } catch (e) { toast('Failed to save profile', 'error'); }
}

function deleteProfile(id, name) {
  if (!currentUser?.isAdmin && !isOwner(id)) { toast('Only the owner or admin can delete a profile', 'error'); return; }
  deleteTarget = { type: 'profile', id };
  $('confirm-message').textContent = `Delete profile "${name}" and all its trades? This cannot be undone.`;
  openModal('modal-confirm');
}

// ─── DASHBOARD ───
function showProfiles() {
  $('page-profiles').style.display = '';
  $('page-dashboard').style.display = 'none';
  $('btn-back-profiles').style.display = 'none';
  currentProfileId = null;
  loadProfiles();
}

async function openDashboard(profileId) {
  currentProfileId = profileId;
  $('page-profiles').style.display = 'none';
  $('page-dashboard').style.display = '';
  $('btn-back-profiles').style.display = '';

  try {
    const [pRes, sRes, tRes] = await Promise.all([
      fetch(`${API}/api/profiles/${profileId}`, { headers: currentUser?.password ? { 'X-Profile-Password': currentUser.password } : {} }),
      fetch(`${API}/api/trades/stats/${profileId}`),
      fetch(`${API}/api/trades/profile/${profileId}`)
    ]);
    const profile = (await pRes.json()).data;
    const stats = (await sRes.json()).data;
    allTrades = (await tRes.json()).data || [];

    renderDashboard(profile, stats);
  } catch (e) { toast('Failed to load dashboard', 'error'); }
}

function renderDashboard(profile, stats) {
  currentProfileData = profile;
  const isAdmin = currentUser && currentUser.isAdmin;
  const owner = isAdmin || isOwner(profile.id);
  
  // Profile header
  $('dash-avatar').style.background = `linear-gradient(135deg,${profile.color},${profile.color}dd)`;
  $('dash-avatar').textContent = profile.avatar_initials || '?';
  $('dash-profile-name').innerHTML = profile.name + (owner ? ' <button class="btn-icon" id="btn-edit-profile" title="Edit Profile" style="font-size:14px;vertical-align:middle;margin-left:8px">✎</button>' : '');
  if (owner) {
    $('btn-edit-profile').onclick = () => openProfileModal(profile);
  }
  $('dash-profile-meta').textContent = `${profile.bio || profile.default_market + ' Trader'} • Joined ${fmtDate(profile.created_at)} • 1R = $${profile.risk_unit_value || 100}`;
  $('trade-market').value = profile.default_market || 'Stocks';
  
  // New Trade button visibility
  document.querySelector('button[onclick="openTradeModal()"]').style.display = owner ? '' : 'none';

  // Stats cards
  const streakText = stats.currentStreak >= 0 ? `${stats.currentStreak}W` : `${Math.abs(stats.currentStreak)}L`;
  const cards = [
    { label: 'Total P&L', value: fmtPnL(stats.totalPnL), sub: `${stats.closedCount} closed trades` },
    { label: 'Win Rate', value: `${fmt(stats.winRate, 1)}%`, sub: `${stats.closedCount - Math.round(stats.closedCount * stats.winRate / 100)}L / ${Math.round(stats.closedCount * stats.winRate / 100)}W` },
    { label: 'Total RR', value: `${fmt(stats.totalRR, 2)}R`, sub: `Avg RR: ${fmt(stats.avgRR, 2)}R` },
    { label: 'Avg Win', value: `$${fmt(stats.avgWin)}`, sub: `Largest: $${fmt(stats.largestWin)}` },
    { label: 'Avg Loss', value: `$${fmt(stats.avgLoss)}`, sub: `Largest: $${fmt(Math.abs(stats.largestLoss))}` },
    { label: 'Current Streak', value: streakText, sub: `Best: ${stats.bestWinStreak}W / ${stats.bestLossStreak}L` },
    { label: 'Open Trades', value: stats.openCount, sub: `Total: ${stats.totalTrades}` }
  ];
  $('stats-grid').innerHTML = cards.map(c => `
    <div class="card stat-card">
      <div class="stat-card-label">${c.label}</div>
      <div class="stat-card-value">${c.value}</div>
      <div class="stat-card-sub">${c.sub}</div>
    </div>
  `).join('');

  renderCharts(stats);
  renderTradesTable(allTrades);
}

// ─── CHARTS ───
function destroyChart(key) { if (chartInstances[key]) { chartInstances[key].destroy(); delete chartInstances[key]; } }

function renderCharts(stats) {
  const gridLines = { color: 'rgba(59,130,246,0.06)' };
  const tickColor = '#555e73';
  const defaultOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

  // Equity Curve
  destroyChart('equity');
  const eqLabels = stats.equityCurve.map(e => fmtDate(e.date));
  const eqData = stats.equityCurve.map(e => e.equity);
  chartInstances.equity = new Chart($('chart-equity'), {
    type: 'line',
    data: {
      labels: eqLabels,
      datasets: [{
        data: eqData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)',
        borderWidth: 2, fill: true, tension: 0.3, pointRadius: eqData.length > 30 ? 0 : 3,
        pointBackgroundColor: '#3b82f6'
      }]
    },
    options: { ...defaultOpts, scales: { x: { display: false }, y: { grid: gridLines, ticks: { color: tickColor, callback: v => '$' + v } } } }
  });

  // Win/Loss Donut
  destroyChart('winloss');
  const wins = Math.round((stats.closedCount * stats.winRate) / 100);
  const losses = stats.closedCount - wins;
  chartInstances.winloss = new Chart($('chart-winloss'), {
    type: 'doughnut',
    data: {
      labels: ['Wins', 'Losses'],
      datasets: [{ data: [wins, losses], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0, spacing: 4 }]
    },
    options: { ...defaultOpts, cutout: '72%', plugins: { legend: { display: true, position: 'bottom', labels: { color: tickColor, padding: 16, usePointStyle: true } } } }
  });

  // Strategy
  destroyChart('strategy');
  chartInstances.strategy = new Chart($('chart-strategy'), {
    type: 'bar',
    data: {
      labels: stats.strategyPerf.map(s => s.name),
      datasets: [{
        data: stats.strategyPerf.map(s => s.pnl),
        backgroundColor: stats.strategyPerf.map(s => s.pnl >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'),
        borderRadius: 6, barThickness: 28
      }]
    },
    options: { ...defaultOpts, scales: { x: { grid: { display: false }, ticks: { color: tickColor } }, y: { grid: gridLines, ticks: { color: tickColor, callback: v => '$' + v } } } }
  });

  // Direction
  destroyChart('direction');
  chartInstances.direction = new Chart($('chart-direction'), {
    type: 'doughnut',
    data: {
      labels: ['Long', 'Short'],
      datasets: [{ data: [stats.longShort.long.count, stats.longShort.short.count], backgroundColor: ['#3b82f6', '#f59e0b'], borderWidth: 0, spacing: 4 }]
    },
    options: { ...defaultOpts, cutout: '72%', plugins: { legend: { display: true, position: 'bottom', labels: { color: tickColor, padding: 16, usePointStyle: true } } } }
  });

  // Monthly
  destroyChart('monthly');
  const months = Object.keys(stats.monthlyPnL).sort();
  chartInstances.monthly = new Chart($('chart-monthly'), {
    type: 'bar',
    data: {
      labels: months.map(m => { const [y, mo] = m.split('-'); return new Date(y, mo - 1).toLocaleDateString('en', { month: 'short', year: '2-digit' }); }),
      datasets: [{
        data: months.map(m => stats.monthlyPnL[m]),
        backgroundColor: months.map(m => stats.monthlyPnL[m] >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'),
        borderRadius: 6, barThickness: 28
      }]
    },
    options: { ...defaultOpts, scales: { x: { grid: { display: false }, ticks: { color: tickColor } }, y: { grid: gridLines, ticks: { color: tickColor, callback: v => '$' + v } } } }
  });
}

// ─── TRADES TABLE ───
function renderTradesTable(trades) {
  const tbody = $('trades-tbody');
  const isAdmin = currentUser && currentUser.isAdmin;
  const owner = isAdmin || isOwner(currentProfileId);
  if (!trades.length) {
    tbody.innerHTML = '';
    $('empty-trades').style.display = '';
    return;
  }
  $('empty-trades').style.display = 'none';
  tbody.innerHTML = trades.map(t => `
    <tr>
      <td class="symbol-cell">
        ${t.symbol}
        ${t.tradingview_url ? `<a href="${t.tradingview_url}" target="_blank" title="View Chart" style="color:var(--text-muted);font-size:10px;margin-left:4px;text-decoration:none">🔗</a>` : ''}
      </td>
      <td><span class="tag tag-${t.direction.toLowerCase()}">${t.direction}</span></td>
      <td>${t.market}</td>
      <td style="color:var(--text-secondary)">${t.category || '—'}</td>
      <td>${t.strategy}</td>
      <td>${fmtDate(t.entry_date)}</td>
      <td>${t.entry_price != null ? '$' + fmt(t.entry_price) : '—'}</td>
      <td>${t.exit_price != null ? '$' + fmt(t.exit_price) : '—'}</td>
      <td>${t.is_risk_unit_mode ? fmt(t.risk_amount_r, 1) + 'R' : fmt(t.quantity, 0)}</td>
      <td>${fmtPnL(t.pnl)}</td>
      <td>${fmtRR(t.rr_ratio)}</td>
      <td>${fmtPct(t.pnl_pct)}</td>
      <td><span class="tag tag-${t.status.toLowerCase()}">${t.status}</span></td>
      <td>${qualityDots(t.setup_quality)}</td>
      <td>
        <div class="trade-actions" style="${owner ? '' : 'display:none'}">
          <button class="trade-action-btn" onclick="editTrade(${t.id})" title="Edit">✎</button>
          <button class="trade-action-btn delete" onclick="deleteTrade(${t.id},'${t.symbol}')" title="Delete">✕</button>
        </div>
      </td>
    </tr>
    ${t.notes ? `
    <tr class="trade-notes-row" style="background: rgba(255,255,255,0.02);">
      <td colspan="15" style="padding: 8px 16px; font-size: 0.85rem; color: var(--text-secondary); border-top: none; border-bottom: 1px solid var(--border-color); white-space: pre-wrap;">
        <strong style="color:var(--text-muted)">Notes:</strong> ${t.notes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </td>
    </tr>
    ` : ''}
  `).join('');
}

function filterTrades(status, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (status === 'all') { renderTradesTable(allTrades); return; }
  renderTradesTable(allTrades.filter(t => t.status === status));
}

// ─── TRADE MODAL ───
async function openTradeModal() {
  if (!currentUser?.isAdmin && !isOwner(currentProfileId)) { toast('Only the owner or admin can add trades', 'error'); return; }
  editingTradeId = null;
  await loadLookups();
  $('modal-trade-title').textContent = 'New Trade';
  $('btn-save-trade').textContent = 'Save Trade';
  $('trade-symbol').value = '';
  $('trade-direction').value = 'Long';
  $('trade-strategy').value = 'Manual';
  $('trade-category').value = '';
  $('trade-entry-date').value = new Date().toISOString().slice(0, 16);
  $('trade-exit-date').value = '';
  $('trade-entry-price').value = '';
  $('trade-exit-price').value = '';
  $('trade-quantity').value = '';
  $('trade-risk-mode').checked = false;
  toggleRiskMode(false);
  $('trade-commission').value = '';
  $('trade-sl').value = '';
  $('trade-tp').value = '';
  $('trade-emotion').value = 'Calm';
  $('trade-setup-q').value = '3';
  $('trade-notes').value = '';
  $('trade-tv-url').value = '';
  openModal('modal-trade');
  setTimeout(() => $('trade-symbol').focus(), 100);
}

async function editTrade(id) {
  if (!currentUser?.isAdmin && !isOwner(currentProfileId)) { toast('Only the owner or admin can edit trades', 'error'); return; }
  try {
    const res = await fetch(`${API}/api/trades/${id}`);
    const json = await res.json();
    if (!json.success) { toast('Trade not found', 'error'); return; }
    await loadLookups();
    const t = json.data;
    editingTradeId = id;
    $('modal-trade-title').textContent = 'Edit Trade';
    $('btn-save-trade').textContent = 'Update Trade';
    $('trade-symbol').value = t.symbol;
    $('trade-direction').value = t.direction;
    $('trade-market').value = t.market;
    $('trade-category').value = t.category || '';
    $('trade-strategy').value = t.strategy;
    $('trade-entry-date').value = t.entry_date ? t.entry_date.replace(' ', 'T').slice(0, 16) : '';
    $('trade-exit-date').value = t.exit_date ? t.exit_date.replace(' ', 'T').slice(0, 16) : '';
    $('trade-entry-price').value = t.entry_price;
    $('trade-exit-price').value = t.exit_price || '';
    $('trade-quantity').value = t.is_risk_unit_mode ? (t.risk_amount_r || '') : (t.quantity || '');
    $('trade-risk-mode').checked = !!t.is_risk_unit_mode;
    toggleRiskMode(!!t.is_risk_unit_mode);
    $('trade-commission').value = t.commission || '';
    $('trade-sl').value = t.stop_loss || '';
    $('trade-tp').value = t.take_profit || '';
    $('trade-emotion').value = t.emotional_state;
    $('trade-setup-q').value = t.setup_quality;
    $('trade-notes').value = t.notes || '';
    $('trade-tv-url').value = t.tradingview_url || '';
    openModal('modal-trade');
  } catch (e) { toast('Failed to load trade', 'error'); }
}

async function saveTrade() {
  const symbol = $('trade-symbol').value.trim();
  const entryPrice = $('trade-entry-price').value;
  const quantityOrR = $('trade-quantity').value;
  const entryDate = $('trade-entry-date').value;
  const isRiskMode = $('trade-risk-mode').checked;

  if (!symbol || !entryPrice || !quantityOrR || !entryDate) {
    toast('Please fill required fields (Symbol, Entry Price, Qty/R, Entry Date)', 'error');
    return;
  }
  const body = {
    profile_id: currentProfileId,
    symbol,
    direction: $('trade-direction').value,
    market: $('trade-market').value,
    strategy: $('trade-strategy').value,
    entry_date: entryDate,
    exit_date: $('trade-exit-date').value || null,
    entry_price: parseFloat(entryPrice),
    exit_price: $('trade-exit-price').value ? parseFloat($('trade-exit-price').value) : null,
    quantity: isRiskMode ? 0 : parseFloat(quantityOrR),
    is_risk_unit_mode: isRiskMode,
    risk_amount_r: isRiskMode ? parseFloat(quantityOrR) : null,
    commission: $('trade-commission').value ? parseFloat($('trade-commission').value) : 0,
    stop_loss: $('trade-sl').value ? parseFloat($('trade-sl').value) : null,
    take_profit: $('trade-tp').value ? parseFloat($('trade-tp').value) : null,
    emotional_state: $('trade-emotion').value,
    setup_quality: parseInt($('trade-setup-q').value),
    notes: $('trade-notes').value,
    category: $('trade-category').value,
    tradingview_url: $('trade-tv-url').value.trim()
  };
  try {
    const url = editingTradeId ? `${API}/api/trades/${editingTradeId}` : `${API}/api/trades`;
    const method = editingTradeId ? 'PUT' : 'POST';
    const json = await apiFetch(url, { method, body: JSON.stringify(body) });
    if (!json.success) { toast(json.error, 'error'); return; }
    toast(editingTradeId ? 'Trade updated' : 'Trade saved');
    closeModal('modal-trade');
    openDashboard(currentProfileId);
  } catch (e) { toast('Failed to save trade', 'error'); }
}

function deleteTrade(id, symbol) {
  if (!currentUser?.isAdmin && !isOwner(currentProfileId)) { toast('Only the owner or admin can delete trades', 'error'); return; }
  deleteTarget = { type: 'trade', id };
  $('confirm-message').textContent = `Delete ${symbol} trade? This cannot be undone.`;
  openModal('modal-confirm');
}

async function confirmDeleteAction() {
  if (!deleteTarget) return;
  try {
    const url = deleteTarget.type === 'profile'
      ? `${API}/api/profiles/${deleteTarget.id}`
      : `${API}/api/trades/${deleteTarget.id}`;
    const json = await apiFetch(url, { method: 'DELETE' });
    if (!json.success) { toast(json.error, 'error'); return; }
    toast('Deleted successfully');
    closeModal('modal-confirm');
    if (deleteTarget.type === 'profile') { showProfiles(); }
    else { openDashboard(currentProfileId); }
    deleteTarget = null;
  } catch (e) { toast('Failed to delete', 'error'); }
}

// ─── KEYBOARD SHORTCUTS ───
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  }
});

// ─── INIT ───
updateAuthUI();
loadProfiles();
