(function initLoginPage() {
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    if (!form) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const errorDiv = document.getElementById('login-error');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const emailField = form.elements.namedItem('email');
      const passwordField = form.elements.namedItem('password');
      const email = emailField ? emailField.value.trim() : '';
      const password = passwordField ? passwordField.value : '';
      if (!email || !password) return;

      if (errorDiv) {
        errorDiv.classList.add('hidden');
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';
      }

      try {
        let csrfToken;
        try {
          const tokenResponse = await fetch('/api/csrf-token', {
            credentials: 'include',
          });
          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            if (tokenData && tokenData.csrfToken) {
              csrfToken = tokenData.csrfToken;
            }
          }
        } catch (tokenError) {
          console.warn('Failed to obtain CSRF token', tokenError);
        }

        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: Object.assign(
            { 'Content-Type': 'application/json' },
            csrfToken ? { 'x-csrf-token': csrfToken } : {}
          ),
          body: JSON.stringify({ email, password }),
          credentials: 'include',
        });

        if (response.ok) {
          window.location.href = '/dashboard.html';
          return;
        }

        if (response.status >= 400 && response.status < 500) {
          const data = await response.json().catch(() => ({}));
          if (errorDiv) {
            errorDiv.textContent = data.message || 'Invalid credentials.';
            errorDiv.classList.remove('hidden');
          }
          return;
        }

        throw new Error('Unexpected login error');
      } catch (_err) {
        if (errorDiv) {
          errorDiv.textContent = 'Login failed. Please try again.';
          errorDiv.classList.remove('hidden');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Login';
        }
      }
    });
  });
})();
