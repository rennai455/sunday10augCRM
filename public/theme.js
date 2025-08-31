document.addEventListener('DOMContentLoaded', () => {
  const stored = localStorage.getItem('theme');
  if (stored) {
    document.documentElement.dataset.theme = stored;
  }
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('theme', next);
    });
  }
});
