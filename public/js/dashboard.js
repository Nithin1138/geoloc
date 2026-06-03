/**
 * IP Geolocation API — Dashboard Logic
 */

let currentKey = '';
let keyVisible = false;
let refreshInterval = null;

// ─── Init: Check for stored key ──────────────────────────────
(function init() {
  const storedKey = sessionStorage.getItem('geoip_api_key');
  if (storedKey) {
    document.getElementById('loginKeyInput').value = storedKey;
    login();
  }

  // Mobile menu
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const navLinks = document.getElementById('navLinks');
  mobileMenuBtn.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    mobileMenuBtn.classList.toggle('open');
  });

  // Enter key to login
  document.getElementById('loginKeyInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });
})();

// ─── Login ───────────────────────────────────────────────────
async function login() {
  const input = document.getElementById('loginKeyInput');
  const value = input.value.trim();
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  const emailKeysList = document.getElementById('emailKeysList');
  const keysContainer = document.getElementById('keysContainer');

  if (!value) {
    errorEl.textContent = 'Please enter your Email or API Key';
    errorEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Verifying...';
  errorEl.style.display = 'none';
  emailKeysList.style.display = 'none';
  keysContainer.innerHTML = '';

  const isEmail = value.includes('@');

  if (isEmail) {
    try {
      const res = await fetch(`/keys/list?email=${encodeURIComponent(value)}`);
      const data = await res.json();

      if (!data.success || !data.keys || data.keys.length === 0) {
        errorEl.textContent = 'No API keys found for this email address.';
        errorEl.style.display = 'block';
        return;
      }

      // Display matching keys
      emailKeysList.style.display = 'block';
      data.keys.forEach(keyRecord => {
        const keyItem = document.createElement('div');
        keyItem.style.background = 'rgba(255,255,255,0.04)';
        keyItem.style.border = '1px solid var(--border-primary)';
        keyItem.style.borderRadius = '8px';
        keyItem.style.padding = '10px 14px';
        keyItem.style.cursor = 'pointer';
        keyItem.style.display = 'flex';
        keyItem.style.justifyContent = 'space-between';
        keyItem.style.alignItems = 'center';
        keyItem.style.transition = 'background 0.2s';
        
        keyItem.onmouseover = () => keyItem.style.background = 'rgba(255,255,255,0.08)';
        keyItem.onmouseout = () => keyItem.style.background = 'rgba(255,255,255,0.04)';
        
        const planBadge = keyRecord.plan.toUpperCase();
        
        keyItem.innerHTML = `
          <div>
            <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary); font-family:var(--font-mono)">${keyRecord.key.substring(0, 12)}...</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">Plan: ${planBadge} | Usage: ${keyRecord.usage.today}/${keyRecord.limits.perDay}</div>
          </div>
          <span class="btn btn-sm btn-outline" style="padding:4px 8px; border-radius:6px; font-size:0.75rem;">Select</span>
        `;
        
        keyItem.onclick = () => {
          currentKey = keyRecord.key;
          sessionStorage.setItem('geoip_api_key', keyRecord.key);
          
          // Re-fetch stats using requireApiKey to get complete stats detail object
          fetch('/keys/stats', { headers: { 'X-Api-Key': keyRecord.key } })
            .then(r => r.json())
            .then(response => {
              if (response.success) {
                showDashboard(response.data);
              } else {
                errorEl.textContent = 'Failed to load key stats';
                errorEl.style.display = 'block';
              }
            });
        };
        keysContainer.appendChild(keyItem);
      });

    } catch (err) {
      errorEl.textContent = 'Network error — try again';
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Access Dashboard';
    }
  } else {
    // Treat as direct API key verification
    try {
      const res = await fetch('/keys/stats', {
        headers: { 'X-Api-Key': value }
      });
      const data = await res.json();

      if (!data.success) {
        errorEl.textContent = data.error || 'Invalid API key';
        errorEl.style.display = 'block';
        return;
      }

      currentKey = value;
      sessionStorage.setItem('geoip_api_key', value);
      showDashboard(data.data);

    } catch (err) {
      errorEl.textContent = 'Network error — try again';
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Access Dashboard';
    }
  }
}

// ─── Show Dashboard ──────────────────────────────────────────
function showDashboard(stats) {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('dashContainer').classList.add('active');
  document.getElementById('navLogout').style.display = '';

  updateStats(stats);
  updateQuickStart();

  // Auto-refresh every 30 seconds
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(refreshStats, 30000);
}

// ─── Update Stats Display ────────────────────────────────────
function updateStats(stats) {
  const plan = stats.plan.charAt(0).toUpperCase() + stats.plan.slice(1);

  // Plan badge
  document.getElementById('dashPlanBadge').textContent = plan.toUpperCase();

  // Key display (masked by default)
  if (!keyVisible) {
    document.getElementById('dashKeyText').textContent = maskKey(currentKey);
  } else {
    document.getElementById('dashKeyText').textContent = currentKey;
  }

  // Usage numbers
  document.getElementById('dashTodayCount').textContent = stats.usage.today.toLocaleString();
  document.getElementById('dashMonthCount').textContent = stats.usage.thisMonth.toLocaleString();
  document.getElementById('dashTotalCount').textContent = stats.usage.allTime.toLocaleString();

  // Limits
  document.getElementById('dashDailyLimit').textContent = stats.limits.perDay.toLocaleString();
  document.getElementById('dashMonthlyLimit').textContent = stats.limits.perMonth.toLocaleString();

  // Remaining
  document.getElementById('dashRemainingToday').textContent = stats.remaining.today.toLocaleString();

  // Progress bars
  const dailyPct = (stats.usage.today / stats.limits.perDay) * 100;
  const monthlyPct = (stats.usage.thisMonth / stats.limits.perMonth) * 100;

  const dailyFill = document.getElementById('dashDailyProgress');
  dailyFill.style.width = `${Math.min(dailyPct, 100)}%`;
  dailyFill.className = 'dash-progress-fill' +
    (dailyPct > 90 ? ' danger' : dailyPct > 70 ? ' warning' : '');

  const monthlyFill = document.getElementById('dashMonthlyProgress');
  monthlyFill.style.width = `${Math.min(monthlyPct, 100)}%`;
  monthlyFill.className = 'dash-progress-fill' +
    (monthlyPct > 90 ? ' danger' : monthlyPct > 70 ? ' warning' : '');

  // Plan details
  document.getElementById('dashPlanName').textContent = plan;
  document.getElementById('dashPlanDaily').textContent = stats.limits.perDay.toLocaleString();
  document.getElementById('dashPlanMonthly').textContent = stats.limits.perMonth.toLocaleString();
  document.getElementById('dashStatus').textContent = stats.active ? 'Active' : 'Inactive';
  document.getElementById('dashStatus').style.color =
    stats.active ? 'var(--accent-emerald)' : 'var(--accent-rose)';

  // Created date
  if (stats.created) {
    document.getElementById('dashCreatedDate').textContent =
      new Date(stats.created).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
  }
}

// ─── Refresh Stats ───────────────────────────────────────────
async function refreshStats() {
  if (!currentKey) return;
  try {
    const res = await fetch('/keys/stats', {
      headers: { 'X-Api-Key': currentKey }
    });
    const data = await res.json();
    if (data.success) updateStats(data.data);
  } catch (err) {
    // Silent fail on auto-refresh
  }
}

// ─── Key Visibility Toggle ───────────────────────────────────
function toggleKeyVisibility() {
  keyVisible = !keyVisible;
  document.getElementById('dashKeyText').textContent =
    keyVisible ? currentKey : maskKey(currentKey);
  document.getElementById('toggleKeyLabel').textContent =
    keyVisible ? 'Hide' : 'Show';
  
  const eyeIcon = document.getElementById('eyeIcon');
  if (keyVisible) {
    // eye-off icon path
    eyeIcon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
  } else {
    // eye icon path
    eyeIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  }
}

// ─── Mask Key ────────────────────────────────────────────────
function maskKey(key) {
  if (!key) return '••••••••••••••••••';
  return key.substring(0, 8) + '••••••••' + key.substring(key.length - 4);
}

// ─── Copy Key ────────────────────────────────────────────────
function copyDashKey() {
  navigator.clipboard.writeText(currentKey).then(() => {
    showToast('API key copied!', 'success');
  });
}

// ─── Update Quick Start with actual key ──────────────────────
function updateQuickStart() {
  const displayKey = currentKey.substring(0, 12) + '...';
  const origin = window.location.origin;
  document.getElementById('dashQuickStart').innerHTML =
    `<span class="code-comment"># Basic IP lookup</span>\n` +
    `<span class="code-keyword">curl</span> -H <span class="code-string">"X-Api-Key: ${displayKey}"</span> <span class="code-url">${origin}/api/ip/8.8.8.8</span>\n\n` +
    `<span class="code-comment"># Look up your own IP</span>\n` +
    `<span class="code-keyword">curl</span> -H <span class="code-string">"X-Api-Key: ${displayKey}"</span> <span class="code-url">${origin}/api/ip/me</span>\n\n` +
    `<span class="code-comment"># Country only (lightweight)</span>\n` +
    `<span class="code-keyword">curl</span> -H <span class="code-string">"X-Api-Key: ${displayKey}"</span> <span class="code-url">${origin}/api/ip/8.8.8.8/country</span>`;
}

// ─── Logout ──────────────────────────────────────────────────
function logout() {
  currentKey = '';
  keyVisible = false;
  sessionStorage.removeItem('geoip_api_key');
  if (refreshInterval) clearInterval(refreshInterval);

  document.getElementById('loginSection').style.display = '';
  document.getElementById('dashContainer').classList.remove('active');
  document.getElementById('navLogout').style.display = 'none';
  document.getElementById('loginKeyInput').value = '';
  
  // Reset the email key selector container
  const emailKeysList = document.getElementById('emailKeysList');
  const keysContainer = document.getElementById('keysContainer');
  if (emailKeysList) emailKeysList.style.display = 'none';
  if (keysContainer) keysContainer.innerHTML = '';
}

// ─── Toast ───────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3500);
}
