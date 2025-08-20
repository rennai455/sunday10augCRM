document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const toggleButtons = document.querySelectorAll('#sidebar-toggle-btn, #fab-sidebar-toggle-2');
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);

  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea',
    'input',
    'select',
    '[tabindex]:not([tabindex="-1"])'
  ];

  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const focusable = sidebar.querySelectorAll(focusableSelectors.join(','));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      closeSidebar();
    }
  }

  function openSidebar() {
    sidebar.classList.add('open');
    toggleButtons.forEach(btn => btn.setAttribute('aria-expanded', 'true'));
    if (window.matchMedia('(max-width: 768px)').matches) {
      overlay.classList.add('active');
      document.body.classList.add('sidebar-open');
      sidebar.addEventListener('keydown', trapFocus);
      const first = sidebar.querySelector(focusableSelectors.join(','));
      first && first.focus();
    }
    document.addEventListener('keydown', handleKeydown);
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    toggleButtons.forEach(btn => btn.setAttribute('aria-expanded', 'false'));
    overlay.classList.remove('active');
    document.body.classList.remove('sidebar-open');
    sidebar.removeEventListener('keydown', trapFocus);
    document.removeEventListener('keydown', handleKeydown);
  }

  toggleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (sidebar.classList.contains('open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  });

  overlay.addEventListener('click', closeSidebar);

  // Set active link based on current path
  const currentPath = window.location.pathname;
  const links = sidebar.querySelectorAll('a[data-path]');
  links.forEach(link => {
    const linkPath = link.getAttribute('data-path');
    if (linkPath === currentPath) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
    }
  });
});
