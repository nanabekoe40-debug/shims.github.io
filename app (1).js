// js/app.js (full)
// Demo front-end logic for profiles + daily monitoring (localStorage-backed demo)

// --- Utility & storage keys
const STORAGE_KEY_PROFILES = 'shims_demo_profiles';
const STORAGE_KEY_SUBMISSIONS = 'shims_demo_submissions';

// --- Load sample profiles (from data/sample_profiles.json) or localStorage if present
async function loadProfiles() {
  const stored = localStorage.getItem(STORAGE_KEY_PROFILES);
  if (stored) {
    try { return JSON.parse(stored); } catch(e){ console.error(e); }
  }
  // fetch sample file
  const r = await fetch('data/sample_profiles.json');
  if (!r.ok) throw new Error('Failed to load sample_profiles.json');
  const profiles = await r.json();
  localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
  return profiles;
}

// --- Render profiles to grid
function renderProfiles(profiles) {
  const container = document.getElementById('profiles-grid');
  container.innerHTML = '';
  profiles.forEach(p => {
    const el = document.createElement('div');
    el.className = 'profile-card';
    el.id = `profile-${p.id}`;
    el.innerHTML = `
      <h4>${escapeHtml(p.name)} <small class="muted">(${escapeHtml(p.genotype)})</small></h4>
      <p><strong>Last crisis:</strong> ${escapeHtml(p.last_crisis || '—')}</p>
      <p><strong>Med schedule:</strong> ${escapeHtml(p.medication || '—')}</p>
      <p><strong>Risk:</strong> <em class="risk-text">${escapeHtml(p.risk)}</em></p>
      <p class="muted" style="margin-top:8px"><small>Emergency contact: ${escapeHtml(p.contact)}</small></p>
    `;
    container.appendChild(el);
  });
}

// --- Monitoring risk engine (DEMO only)
// Scoring idea (simple): higher pain + poor hydration + high fatigue + fever/temperature + exposure + infection symptoms => higher risk
function computeRiskScore({pain, hydration, fatigue, temperature, exposure, symptomsCount}) {
  // digit-by-digit arithmetic to avoid mistakes:
  // base = pain (0-10)
  let score = 0;
  score += Number(pain); // 0..10

  // hydration: good=0, moderate=1, poor=2
  const hydrationMap = { good: 0, moderate: 1, poor: 2 };
  score += hydrationMap[hydration] || 0;

  // fatigue: low=0, moderate=1, high=2
  const fatigueMap = { low: 0, moderate: 1, high: 2 };
  score += fatigueMap[fatigue] || 0;

  // temperature: add 1 if >=37.5; add 2 if >=38.0
  const tempNum = Number(temperature);
  if (!Number.isNaN(tempNum) && tempNum >= 38.0) score += 2;
  else if (!Number.isNaN(tempNum) && tempNum >= 37.5) score += 1;

  // exposure boolean
  if (exposure) score += 1;

  // infection symptoms count
  score += Number(symptomsCount); // each symptom adds 1

  // convert numeric score to category
  // thresholds (demo): 0-5 => Low; 6-9 => Moderate; >=10 => High
  let category = 'Low';
  if (score >= 10) category = 'High';
  else if (score >= 6) category = 'Moderate';
  // return both
  return { score, category };
}

// --- Submissions (localStorage)
function getSubmissions() {
  const raw = localStorage.getItem(STORAGE_KEY_SUBMISSIONS);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch(e){ return []; }
}
function saveSubmission(sub) {
  const arr = getSubmissions();
  arr.unshift(sub); // newest first
  // keep last 50
  const truncated = arr.slice(0, 50);
  localStorage.setItem(STORAGE_KEY_SUBMISSIONS, JSON.stringify(truncated));
}

// --- UI rendering for submissions
function renderSubmissions() {
  const list = document.getElementById('submissions-list');
  const subs = getSubmissions();
  if (!list) return;
  list.innerHTML = '';
  if (subs.length === 0) {
    list.innerHTML = `<p class="muted">No submissions yet.</p>`;
    return;
  }
  subs.forEach(s => {
    const el = document.createElement('div');
    el.className = 'submission-card';
    const riskClass = s.riskCategory === 'High' ? 'risk-high' : (s.riskCategory === 'Moderate' ? 'risk-moderate' : 'risk-low');
    el.innerHTML = `
      <div class="meta">${new Date(s.timestamp).toLocaleString()}</div>
      <h4 style="margin:0">${escapeHtml(s.studentId)} <span class="risk-pill ${riskClass}">${escapeHtml(s.riskCategory)}</span></h4>
      <p style="margin:8px 0"><strong>Score:</strong> ${escapeHtml(String(s.score))} • <strong>Pain:</strong> ${escapeHtml(String(s.pain))} • <strong>Temp:</strong> ${escapeHtml(String(s.temperature))}°C</p>
      <p class="muted" style="margin:0">${escapeHtml(s.notes || '')}</p>
    `;
    list.appendChild(el);
  });
}

// Simple escape for inserted text
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

// --- Attempt to update profile risk in local profiles
function updateProfileRisk(studentId, riskCategory) {
  // normalize id: either exact id "s001" or match by name (case-insensitive)
  const rawProfiles = localStorage.getItem(STORAGE_KEY_PROFILES);
  if (!rawProfiles) return;
  try {
    const profiles = JSON.parse(rawProfiles);
    let changed = false;
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      if ((p.id && p.id.toLowerCase() === studentId.toLowerCase()) || (p.name && p.name.toLowerCase() === studentId.toLowerCase())) {
        profiles[i].risk = riskCategory;
        if (riskCategory === 'High') profiles[i].last_crisis = new Date().toISOString().slice(0,10);
        changed = true;
        break;
      }
    }
    if (changed) {
      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
      // re-render
      renderProfiles(profiles);
    }
  } catch (e) { console.error(e); }
}

// --- Form handler
function wireMonitoringForm() {
  const form = document.getElementById('monitoring-form');
  const clearBtn = document.getElementById('clear-logs');

  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = new FormData(form);
    const studentId = (data.get('studentId') || '').trim();
    const pain = Number(data.get('pain') || 0);
    const hydration = data.get('hydration') || 'good';
    const fatigue = data.get('fatigue') || 'low';
    const temperature = data.get('temperature') || '';
    const exposure = !!document.getElementById('exposure').checked;
    const symptoms = [];
    for (const el of form.querySelectorAll('input[name="symptoms"]:checked')) symptoms.push(el.value);
    const notes = (data.get('notes') || '').trim();

    // Compute risk
    const { score, category } = computeRiskScore({
      pain, hydration, fatigue, temperature, exposure, symptomsCount: symptoms.length
    });

    const submission = {
      id: `sub_${Date.now()}`,
      studentId,
      pain, hydration, fatigue, temperature, exposure, symptoms,
      notes, score,
      riskCategory: category,
      timestamp: Date.now()
    };

    // persist submission
    saveSubmission(submission);
    renderSubmissions();

    // update matched profile risk
    updateProfileRisk(studentId, category);

    // simple toast / feedback
    alert(`Submission saved. Risk: ${category} (score ${score}). Demo-only storage.`);
    form.reset();
    // set defaults back
    form.querySelector('#pain').value = 2;
    form.querySelector('#temperature').value = 36.7;
    form.querySelector('#hydration').value = 'good';
    form.querySelector('#fatigue').value = 'low';
  });

  clearBtn.addEventListener('click', () => {
    if (!confirm('Clear demo submissions from this browser?')) return;
    localStorage.removeItem(STORAGE_KEY_SUBMISSIONS);
    renderSubmissions();
  });
}

// --- Initialization
async function initApp() {
  try {
    const profiles = await loadProfiles();
    renderProfiles(profiles);
  } catch (e) {
    console.error('Could not load profiles', e);
    const pg = document.getElementById('profiles-grid');
    if (pg) pg.innerHTML = `<p class="muted">Demo profiles unavailable.</p>`;
  }
  renderSubmissions();
  wireMonitoringForm();
}

document.addEventListener('DOMContentLoaded', initApp);
