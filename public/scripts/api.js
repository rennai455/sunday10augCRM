export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch (err) {
    console.error('Logout failed', err);
  } finally {
    window.location.href = '/Login.html';
  }
}
