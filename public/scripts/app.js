import { toggleDarkMode, initDarkMode } from './modules/darkMode.js';
import { initSidebar } from './modules/sidebar.js';
import { initDashboard } from './modules/dashboard.js';

window.toggleDarkMode = toggleDarkMode;

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  initSidebar();
  initDashboard();
});
