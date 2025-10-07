import { initCommon, checkAuth, showToast } from './common.js';

function getLeadIdFromQuery() {
  const url = new URL(window.location.href);
  const id = url.searchParams.get('id');
  return id ? Number(id) : null;
}

async function loadTimeline(leadId) {
  try {
    const res = await fetch(`/api/leads/${leadId}/timeline`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed timeline');
    const data = await res.json();
    const timeline = Array.isArray(data?.events) ? data.events : Array.isArray(data) ? data : [];
    renderTimeline(timeline);
  } catch (err) {
    showToast('Failed to load lead timeline', true);
  }
}

async function loadLead(leadId) {
  try {
    const res = await fetch(`/api/leads/${leadId}`, { credentials: 'include' });
    if (!res.ok) return;
    const lead = await res.json();
    document.getElementById('leadWebsite').textContent = lead?.website || '—';
    const kw = Array.isArray(lead?.keywords) ? lead.keywords.join(', ') : '';
    document.getElementById('leadKeywords').textContent = kw || '—';
    document.getElementById('leadSource').textContent = lead?.source || '—';
    document.getElementById('leadUtmSource').textContent = lead?.utm_source || '—';
    document.getElementById('leadUtmMedium').textContent = lead?.utm_medium || '—';
    document.getElementById('leadUtmCampaign').textContent = lead?.utm_campaign || '—';
    document.getElementById('leadUtmTerm').textContent = lead?.utm_term || '—';
    document.getElementById('leadUtmContent').textContent = lead?.utm_content || '—';
  } catch {}
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await checkAuth();
    initCommon();
    const id = getLeadIdFromQuery();
    if (!id) {
      showToast('No lead id provided', true);
      return;
    }
    await loadLead(id);
    await loadTimeline(id);
    await loadDealCoach(id);
  } catch {}
});

async function loadDealCoach(leadId) {
  try {
    const res = await fetch(`/api/leads/${leadId}/suggestion`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const sugEl = document.getElementById('dealCoachSuggestion');
    const reaEl = document.getElementById('dealCoachReason');
    const box = document.getElementById('dealCoach');
    if (!sugEl || !reaEl || !box) return;
    sugEl.textContent = data?.suggestion || '';
    reaEl.textContent = data?.reason || '';
    box.classList.remove('hidden');

    const btn = document.getElementById('logFollowup');
    if (btn) {
      btn.addEventListener('click', async () => {
        try {
          const csrf = await getCSRF();
          const body = {
            type: 'followup',
            message: 'Manual follow-up logged via Deal Coach',
            metadata: { suggestion: data?.suggestion || '' },
          };
          const res2 = await fetch(`/api/leads/${leadId}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf || '' },
            credentials: 'include',
            body: JSON.stringify(body),
          });
          if (!res2.ok) throw new Error('Failed to log');
          showToast('Follow-up logged');
          await loadTimeline(leadId);
        } catch (err) {
          showToast('Failed to log follow-up', true);
        }
      });
    }
  } catch (err) {
    console.warn('Deal coach failed', err);
  }
}

async function getCSRF() {
  try {
    const res = await fetch('/api/csrf-token', { credentials: 'include' });
    const data = await res.json();
    return data?.csrfToken || '';
  } catch (e) {
    return '';
  }
}

function renderTimeline(events = []) {
  const container = document.getElementById('leadTimeline');
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(events) || events.length === 0) {
    container.innerHTML = '<p>No activity recorded.</p>';
    return;
  }
  for (const ev of events) {
    const entry = document.createElement('div');
    entry.className = 'timeline-entry';
    const when = ev.created_at || ev.createdAt || null;
    const ts = when ? new Date(when).toLocaleString() : '';
    const typeText = escapeHtml(String(ev.type || ''));
    const msgText = escapeHtml(String(ev.message || ''));
    const isStatus = String(ev.type || '').toLowerCase() === 'status';
    const messageHtml = isStatus ? `<span class="status-event">${msgText}</span>` : msgText;
    entry.innerHTML = `
      <strong>${typeText}</strong> — ${messageHtml}<br>
      <small>${escapeHtml(ts)}</small>
    `;
    container.appendChild(entry);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
