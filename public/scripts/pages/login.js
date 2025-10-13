document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const errorBox = document.getElementById('loginError');
  const totpBlock = document.getElementById('totpBlock');
  const totpHint = document.getElementById('totpHint');
  const forgotLink = document.getElementById('forgotLink');

  async function submitLogin({ email, password, totp, recoveryCode }) {
    const payload = { email, password };
    if (totp) payload.totp = totp;
    if (recoveryCode) payload.recoveryCode = recoveryCode;

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return res;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');

    const email = form.email.value.trim();
    const password = form.password.value;
    const totp = form.totp?.value.trim();
    const recoveryCode = form.recoveryCode?.value.trim();

    try {
      const res = await submitLogin({ email, password, totp, recoveryCode });
      if (res.ok) {
        window.location.href = '/dashboard.html';
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.code === 'TOTP_REQUIRED') {
        totpBlock.classList.remove('hidden');
        totpHint.classList.remove('hidden');
        errorBox.textContent = 'Two-factor authentication required';
        errorBox.classList.remove('hidden');
        return;
      }
      throw new Error(data?.message || 'Login failed');
    } catch (err) {
      errorBox.textContent = 'Invalid credentials';
      errorBox.classList.remove('hidden');
    }
  });

  forgotLink?.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!email) {
      errorBox.textContent = 'Enter your email above first';
      errorBox.classList.remove('hidden');
      return;
    }
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        errorBox.textContent = 'If the email exists, a reset link will be sent';
        errorBox.classList.remove('hidden');
      } else {
        throw new Error('Reset failed');
      }
    } catch (_) {
      errorBox.textContent = 'Unable to request reset';
      errorBox.classList.remove('hidden');
    }
  });
});
