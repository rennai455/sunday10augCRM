document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('csrf-token').value = 'demo-csrf-token-12345';
    const rememberedEmail = localStorage.getItem('rememberEmail');
    if (rememberedEmail) {
        document.getElementById('email').value = rememberedEmail;
        document.getElementById('remember-me').checked = true;
    }
});

function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.getElementById('eye-icon');
    const eyeOffIcon = document.getElementById('eye-off-icon');
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.classList.add('hidden');
        eyeOffIcon.classList.remove('hidden');
    } else {
        passwordInput.type = 'password';
        eyeIcon.classList.remove('hidden');
        eyeOffIcon.classList.add('hidden');
    }
}

function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    const submitBtn = document.getElementById('submit-btn');

    document.getElementById('email').classList.remove('border-red-500');
    document.getElementById('password').classList.remove('border-red-500');
    const existingError = document.querySelector('.text-red-600');
    if (existingError) existingError.remove();

    submitBtn.disabled = true;
    submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Signing in...`;

    setTimeout(() => {
        if (email === 'demo@renn.ai' && password === 'demo123') {
            const fakePayload = {
                exp: Math.floor(Date.now() / 1000) + 60 * 60,
                email: email
            };
            const fakeToken = [
                btoa(JSON.stringify({alg: "HS256", typ: "JWT"})),
                btoa(JSON.stringify(fakePayload)),
                'signature'
            ].join('.');
            localStorage.setItem('authToken', fakeToken);
            if (rememberMe) {
                localStorage.setItem('rememberEmail', email);
            } else {
                localStorage.removeItem('rememberEmail');
            }
            window.location.href = '/dashboard.html';
        } else {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Sign In';
            document.getElementById('email').classList.add('border-red-500');
            document.getElementById('password').classList.add('border-red-500');
            const errorDiv = document.createElement('div');
            errorDiv.className = 'mt-4 text-red-600 text-sm';
            errorDiv.textContent = 'Invalid credentials. Use demo@renn.ai / demo123';
            const form = document.getElementById('loginForm');
            if (!form.querySelector('.text-red-600')) {
                form.appendChild(errorDiv);
            }
        }
    }, 1000);
}
