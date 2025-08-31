(function() {
  const root = document.documentElement;
  const storageKey = 'theme';
  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem(storageKey, theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
  }
  window.toggleTheme = function() {
    const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    setTheme(current === 'dark' ? 'light' : 'dark');
  };
  const saved = localStorage.getItem(storageKey);
  setTheme(saved === 'dark' ? 'dark' : 'light');
})();
