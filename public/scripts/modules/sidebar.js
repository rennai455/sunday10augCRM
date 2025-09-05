export function initSidebar() {
  const sidebarBtn = document.getElementById('sidebar-toggle-btn');
  const fabBtn = document.getElementById('fab-sidebar-toggle-2');
  const sidebar = document.getElementById('sidebar');
  function toggleSidebar() {
    if (sidebar) {
      sidebar.classList.toggle('show');
    }
  }
  if (sidebarBtn) sidebarBtn.addEventListener('click', toggleSidebar);
  if (fabBtn) fabBtn.addEventListener('click', toggleSidebar);
}
