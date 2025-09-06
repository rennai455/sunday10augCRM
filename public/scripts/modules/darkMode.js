export function toggleDarkMode() {
  const body = document.body;
  const isDark = body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark ? '1' : '0');

  const button = document.getElementById('dark-mode-toggle');
  if (button) {
    button.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  }
}

export function initDarkMode() {
  if (localStorage.getItem('darkMode') === '1') {
    document.body.classList.add('dark-mode');
    const button = document.getElementById('dark-mode-toggle');
    if (button) {
      button.textContent = 'Light Mode';
    }
  }
}
