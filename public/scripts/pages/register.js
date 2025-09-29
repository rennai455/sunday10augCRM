(function initRegisterPage() {
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registerForm');
    if (!form) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const errorDiv = document.getElementById('register-error');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const emailField = form.elements.namedItem('email');
      const passwordField = form.elements.namedItem('password');
      const agencyField = form.elements.namedItem('agency');
      const email = emailField ? emailField.value.trim() : '';
      const password = passwordField ? passwordField.value : '';
      const agency = agencyField ? agencyField.value.trim() : '';
      if (!email || !password || !agency) return;

      if (errorDiv) {
        errorDiv.classList.add('hidden');
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Registering...';
      }

      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, agency }),
          credentials: 'include',
        });

        if (response.ok) {
          window.location.href = '/dashboard.html';
          return;
        }

        if (response.status >= 400 && response.status < 500) {
          const data = await response.json().catch(() => ({}));
          if (errorDiv) {
            errorDiv.textContent = data.message || 'Registration failed.';
            errorDiv.classList.remove('hidden');
          }
          return;
        }

        throw new Error('Unexpected registration error');
      } catch (_err) {
        if (errorDiv) {
          errorDiv.textContent = 'Registration failed. Please try again.';
          errorDiv.classList.remove('hidden');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Register';
        }
      }
    });
  });
})();
