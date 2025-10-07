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
    const html = timeline
      .map((ev) => `
        <div class="timeline-entry">
          <small>${new Date(ev.created_at || ev.createdAt).toLocaleString()}</small>
          <div><strong>${String(ev.type || '').toUpperCase()}</strong>${ev.message ? `: ${ev.message}` : ''}</div>
        </div>`)
      .join('');
    document.getElementById('leadTimeline').innerHTML = html || '<p>No timeline yet.</p>';
  } catch (err) {
    showToast('Failed to load lead timeline', true);
  }
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
    await loadTimeline(id);
  } catch {}
});

