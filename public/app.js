/* ── Garmin Golf Analytics — App Logic ── */

const API = '/api';
let chatHistory = [];

// ─── Tab Navigation ─────────────────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');

    // Lazy load data for tabs
    const tabName = tab.dataset.tab;
    if (tabName === 'sessions') loadSessions();
    if (tabName === 'clubs') loadClubStats();
    if (tabName === 'features') loadFeatures();
  });
});

// ─── Dashboard ──────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const resp = await fetch(`${API}/dashboard`);
    const data = await resp.json();

    document.getElementById('totalSessions').textContent = data.sessions;
    document.getElementById('totalShots').textContent = data.total_shots.toLocaleString();
    document.getElementById('clubCount').textContent = data.clubs.length;
    document.getElementById('latestSession').textContent = data.latest_session || '—';

    // Personal bests table
    if (data.personal_bests && data.personal_bests.length > 0) {
      const html = `<table>
        <thead><tr><th>Club</th><th class="num">Best Carry</th><th class="num">Best Total</th></tr></thead>
        <tbody>${data.personal_bests.map(pb => `
          <tr>
            <td>${pb.club_type}</td>
            <td class="num highlight">${pb.best_carry}y</td>
            <td class="num">${pb.best_total}y</td>
          </tr>
        `).join('')}</tbody>
      </table>`;
      document.getElementById('personalBests').innerHTML = html;
    }
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}

// ─── Sessions ───────────────────────────────────────────────────────
async function loadSessions() {
  try {
    const resp = await fetch(`${API}/sessions`);
    const sessions = await resp.json();

    if (sessions.length === 0) {
      document.getElementById('sessionList').innerHTML =
        '<p class="placeholder">No sessions yet. Upload CSV files in the Upload tab.</p>';
      return;
    }

    document.getElementById('sessionList').innerHTML = sessions.map(s => `
      <div class="session-card" onclick="loadSessionDetail(${s.id})">
        <div class="session-info">
          <h3>${formatDate(s.session_date)}</h3>
          <div class="session-meta">${s.shot_count} shots · ${s.player}</div>
        </div>
        <div class="session-clubs">
          ${s.clubs_used.map(c => `<span class="club-tag">${c}</span>`).join('')}
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('sessionList').innerHTML = '<p class="placeholder">Error loading sessions</p>';
  }
}

async function loadSessionDetail(id) {
  try {
    const resp = await fetch(`${API}/sessions/${id}`);
    const data = await resp.json();

    document.getElementById('sessionList').classList.add('hidden');
    document.getElementById('sessionDetail').classList.remove('hidden');

    const shots = data.shots;
    const clubs = [...new Set(shots.map(s => s.club_type))];

    let html = `<h2>${formatDate(data.session.session_date)} — ${data.session.shot_count} Shots</h2>`;

    for (const club of clubs) {
      const clubShots = shots.filter(s => s.club_type === club);
      const avg = (arr, key) => {
        const vals = arr.map(s => s[key]).filter(v => v != null);
        return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
      };

      html += `
        <div class="club-card" style="margin-top: 16px;">
          <div class="club-card-header">
            <h3>${club}</h3>
            <span class="club-card-shots">${clubShots.length} shots</span>
          </div>
          <div class="club-metrics">
            <div class="metric"><div class="metric-val">${avg(clubShots, 'carry_distance')}y</div><div class="metric-label">Avg Carry</div></div>
            <div class="metric"><div class="metric-val">${avg(clubShots, 'total_distance')}y</div><div class="metric-label">Avg Total</div></div>
            <div class="metric"><div class="metric-val">${avg(clubShots, 'ball_speed')}</div><div class="metric-label">Ball Speed</div></div>
            <div class="metric"><div class="metric-val">${avg(clubShots, 'smash_factor')}</div><div class="metric-label">Smash Factor</div></div>
            <div class="metric"><div class="metric-val">${avg(clubShots, 'spin_rate')}</div><div class="metric-label">Spin (RPM)</div></div>
            <div class="metric"><div class="metric-val">${avg(clubShots, 'launch_angle')}°</div><div class="metric-label">Launch Angle</div></div>
          </div>
          <div class="table-wrap" style="margin-top: 12px;">
            <table>
              <thead><tr>
                <th>#</th><th class="num">Club Spd</th><th class="num">Ball Spd</th>
                <th class="num">Smash</th><th class="num">Carry</th><th class="num">Total</th>
                <th class="num">Launch</th><th class="num">Spin</th><th class="num">Deviation</th>
              </tr></thead>
              <tbody>${clubShots.map(s => `<tr>
                <td>${s.shot_number}</td>
                <td class="num">${s.club_speed?.toFixed(1) ?? '—'}</td>
                <td class="num">${s.ball_speed?.toFixed(1) ?? '—'}</td>
                <td class="num">${s.smash_factor?.toFixed(3) ?? '—'}</td>
                <td class="num highlight">${s.carry_distance?.toFixed(1) ?? '—'}y</td>
                <td class="num">${s.total_distance?.toFixed(1) ?? '—'}y</td>
                <td class="num">${s.launch_angle?.toFixed(1) ?? '—'}°</td>
                <td class="num">${s.spin_rate?.toFixed(0) ?? '—'}</td>
                <td class="num">${s.carry_deviation_distance?.toFixed(1) ?? '—'}y</td>
              </tr>`).join('')}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    document.getElementById('sessionDetailContent').innerHTML = html;
  } catch (e) {
    document.getElementById('sessionDetailContent').innerHTML = '<p class="placeholder">Error loading session</p>';
  }
}

document.getElementById('backToSessions').addEventListener('click', () => {
  document.getElementById('sessionList').classList.remove('hidden');
  document.getElementById('sessionDetail').classList.add('hidden');
});

// ─── Club Stats ─────────────────────────────────────────────────────
async function loadClubStats() {
  try {
    const resp = await fetch(`${API}/clubs/stats`);
    const stats = await resp.json();

    if (stats.length === 0) {
      document.getElementById('clubStats').innerHTML = '<p class="placeholder">No data yet. Import sessions first.</p>';
      return;
    }

    document.getElementById('clubStats').innerHTML = stats.map(s => `
      <div class="club-card">
        <div class="club-card-header">
          <h3>${s.club_type}</h3>
          <span class="club-card-shots">${s.shot_count} shots</span>
        </div>
        <div class="club-metrics">
          <div class="metric"><div class="metric-val">${s.avg_carry}y</div><div class="metric-label">Avg Carry</div></div>
          <div class="metric"><div class="metric-val">${s.avg_total}y</div><div class="metric-label">Avg Total</div></div>
          <div class="metric"><div class="metric-val">${s.avg_ball_speed}</div><div class="metric-label">Ball Speed</div></div>
          <div class="metric"><div class="metric-val">${s.avg_club_speed}</div><div class="metric-label">Club Speed</div></div>
          <div class="metric"><div class="metric-val">${s.avg_smash_factor}</div><div class="metric-label">Smash Factor</div></div>
          <div class="metric"><div class="metric-val">${s.avg_launch_angle}°</div><div class="metric-label">Launch Angle</div></div>
          <div class="metric"><div class="metric-val">${s.avg_spin_rate}</div><div class="metric-label">Spin Rate</div></div>
          <div class="metric"><div class="metric-val">${s.avg_attack_angle}°</div><div class="metric-label">Attack Angle</div></div>
          <div class="metric"><div class="metric-val">±${s.avg_dispersion}y</div><div class="metric-label">Dispersion</div></div>
          <div class="metric"><div class="metric-val">${s.min_carry}–${s.max_carry}y</div><div class="metric-label">Carry Range</div></div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('clubStats').innerHTML = '<p class="placeholder">Error loading club data</p>';
  }
}

// ─── AI Chat ────────────────────────────────────────────────────────
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
const chatMessages = document.getElementById('chatMessages');

async function sendChat(message) {
  if (!message.trim()) return;

  // Remove welcome
  const welcome = chatMessages.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  // Add user bubble
  addChatBubble(message, 'user');
  chatInput.value = '';
  chatSend.disabled = true;

  // Loading indicator
  const loadingEl = addChatBubble('Thinking...', 'assistant loading');

  try {
    const resp = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: chatHistory.slice(-10), // Last 10 messages for context
      }),
    });
    const data = await resp.json();

    loadingEl.remove();
    addChatBubble(data.response, 'assistant');

    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: data.response });
  } catch (e) {
    loadingEl.remove();
    addChatBubble('⚠️ Could not reach the AI server. Make sure Ollama is running.', 'assistant');
  }

  chatSend.disabled = false;
  chatInput.focus();
}

function addChatBubble(text, classes) {
  const div = document.createElement('div');
  div.className = `chat-bubble ${classes}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

chatSend.addEventListener('click', () => sendChat(chatInput.value));
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat(chatInput.value);
  }
});

function askSuggestion(btn) {
  sendChat(btn.textContent);
}

// ─── File Upload ────────────────────────────────────────────────────
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  uploadFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => uploadFiles(fileInput.files));

async function uploadFiles(files) {
  if (!files.length) return;
  const formData = new FormData();
  for (const f of files) formData.append('files', f);

  const resultsDiv = document.getElementById('uploadResults');
  resultsDiv.classList.remove('hidden');
  resultsDiv.innerHTML = '<p class="placeholder">Uploading...</p>';

  try {
    const resp = await fetch(`${API}/upload`, { method: 'POST', body: formData });
    const data = await resp.json();

    resultsDiv.innerHTML = data.results.map(r => {
      if (r.error) return `<div class="upload-result error">❌ ${r.file}: ${r.error}</div>`;
      if (r.skipped) return `<div class="upload-result success">⏭️ ${r.file}: Already imported</div>`;
      return `<div class="upload-result success">✅ ${r.file}: ${r.imported} shots imported</div>`;
    }).join('');

    // Refresh dashboard data
    loadDashboard();
  } catch (e) {
    resultsDiv.innerHTML = '<div class="upload-result error">❌ Upload failed. Check server connection.</div>';
  }
}

// ─── Features ───────────────────────────────────────────────────────
async function loadFeatures() {
  try {
    const resp = await fetch(`${API}/features`);
    const features = await resp.json();

    if (features.length === 0) {
      document.getElementById('featureList').innerHTML =
        '<p class="placeholder">No feature requests yet. Agents can propose features via the MCP tools, or you can add them above.</p>';
      return;
    }

    document.getElementById('featureList').innerHTML = features.map(f => `
      <div class="feature-card">
        <div>
          <div class="feature-name">${f.feature_name}</div>
          <div class="feature-desc">${f.description}</div>
          <div class="feature-desc" style="margin-top: 4px; font-size: 11px; color: var(--text-muted);">
            Proposed by ${f.proposed_by} · ${formatDate(f.proposed_at)}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="feature-badge ${f.status}">${f.status}</span>
          ${f.status === 'proposed' ? `<button class="btn btn-sm btn-primary" onclick="implementFeature(${f.id})">Auto-Implement</button>` : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('featureList').innerHTML = '<p class="placeholder">Error loading features</p>';
  }
}

document.getElementById('featureSubmit').addEventListener('click', async () => {
  const name = document.getElementById('featureName').value.trim();
  const desc = document.getElementById('featureDesc').value.trim();
  if (!name || !desc) return alert('Please fill in both fields');

  try {
    await fetch(`${API}/features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_name: name, description: desc, proposed_by: 'user' }),
    });
    document.getElementById('featureName').value = '';
    document.getElementById('featureDesc').value = '';
    loadFeatures();
  } catch (e) {
    alert('Error submitting feature');
  }
});

async function implementFeature(id) {
  if (!confirm('Auto-implement this feature using Ollama? This requires Ollama to be running.')) return;

  try {
    const resp = await fetch(`${API}/features/${id}/implement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await resp.json();
    if (data.status === 'deployed') {
      alert('Feature implemented successfully! Restart the server to activate.');
    } else {
      alert(`Implementation failed: ${data.error}`);
    }
    loadFeatures();
  } catch (e) {
    alert('Error during implementation');
  }
}

// ─── Ollama Status ──────────────────────────────────────────────────
async function checkOllama() {
  const dot = document.querySelector('.status-dot');
  const text = document.querySelector('.status-text');

  try {
    const resp = await fetch(`${API}/ollama/status`);
    const data = await resp.json();

    if (data.available) {
      dot.className = 'status-dot online';
      text.textContent = `AI: ${data.models[0] || 'Ready'}`;
    } else {
      dot.className = 'status-dot offline';
      text.textContent = 'AI: Offline';
    }
  } catch {
    dot.className = 'status-dot offline';
    text.textContent = 'AI: Offline';
  }
}

// ─── Utilities ──────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─── Init ───────────────────────────────────────────────────────────
loadDashboard();
checkOllama();
