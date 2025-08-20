(function() {
  const root = document.documentElement;
  const toggle = document.querySelector('[data-theme-toggle]');
  const stored = localStorage.getItem('theme') || 'light';

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (toggle) {
      toggle.setAttribute('aria-pressed', theme === 'dark');
    }
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  setTheme(stored);

  if (toggle) {
    toggle.addEventListener('click', () => {
      const newTheme = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      setTheme(newTheme);
    });
  }
})();
