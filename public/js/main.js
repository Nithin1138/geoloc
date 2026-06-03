/**
 * IP Geolocation API — Landing Page Interactions
 */

// ─── Navbar Scroll Effect ─────────────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 50);
});

// ─── Mobile Menu Toggle ───────────────────────────────────────
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const navLinks = document.getElementById('navLinks');

mobileMenuBtn.addEventListener('click', () => {
  navLinks.classList.toggle('open');
  mobileMenuBtn.classList.toggle('open');
});

// Close menu on link click
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    mobileMenuBtn.classList.remove('open');
  });
});

// ─── Live Demo ────────────────────────────────────────────────
const demoInput = document.getElementById('demoIpInput');
const demoBtn = document.getElementById('demoLookupBtn');
const demoOutput = document.getElementById('demoOutput');
const quickIps = document.querySelectorAll('.demo-quick-ips button');

async function lookupIP(ip) {
  demoOutput.innerHTML = '<span class="code-comment">// Loading...</span>';
  demoBtn.disabled = true;
  demoBtn.innerHTML = '<span class="spinner"></span>';

  try {
    const res = await fetch(`/api/ip/${ip}`, {
      headers: { 'X-Api-Key': 'test_free_geo123' }
    });
    const data = await res.json();
    demoOutput.innerHTML = syntaxHighlight(JSON.stringify(data, null, 2));
  } catch (err) {
    demoOutput.innerHTML = `<span class="code-comment">// Error: ${err.message}</span>`;
  } finally {
    demoBtn.disabled = false;
    demoBtn.textContent = 'Lookup';
  }
}

demoBtn.addEventListener('click', () => {
  const ip = demoInput.value.trim();
  if (ip) lookupIP(ip);
});

demoInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const ip = demoInput.value.trim();
    if (ip) lookupIP(ip);
  }
});

quickIps.forEach(btn => {
  btn.addEventListener('click', () => {
    const ip = btn.dataset.ip;
    demoInput.value = ip;
    lookupIP(ip);
  });
});

// ─── JSON Syntax Highlighter ──────────────────────────────────
function syntaxHighlight(json) {
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'code-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'code-key';
          match = match.replace(/:$/, '');
          return `<span class="${cls}">${match}</span>:`;
        } else {
          cls = 'code-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'code-bool';
      } else if (/null/.test(match)) {
        cls = 'code-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

// ─── Code Example Tabs ───────────────────────────────────────
const codeTabs = document.querySelectorAll('.code-tab');
const codePanels = document.querySelectorAll('.code-panel');

codeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    codeTabs.forEach(t => t.classList.remove('active'));
    codePanels.forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.querySelector(`.code-panel[data-panel="${target}"]`).classList.add('active');
  });
});

// ─── Scroll Reveal Animation ─────────────────────────────────
const revealElements = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
);

revealElements.forEach(el => revealObserver.observe(el));

// ─── Toast Notification ──────────────────────────────────────
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Make globally available
window.showToast = showToast;
