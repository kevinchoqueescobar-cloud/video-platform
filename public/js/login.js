// ===== LOGIN PAGE =====

const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginBtn = document.getElementById('loginBtn');
const loginSpinner = document.getElementById('loginSpinner');
const togglePass = document.getElementById('togglePass');
const passwordInput = document.getElementById('password');

// Check if already logged in
fetch('/api/me').then(r => {
  if (r.ok) return r.json();
}).then(user => {
  if (user && user.role) {
    window.location.href = user.role === 'admin' ? '/admin.html' : '/client.html';
  }
}).catch(() => {});

// Toggle password visibility
togglePass.addEventListener('click', () => {
  const isPass = passwordInput.type === 'password';
  passwordInput.type = isPass ? 'text' : 'password';
  togglePass.textContent = isPass ? '🙈' : '👁';
});

// Login form submit
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    showError('Por favor completa todos los campos.');
    return;
  }

  setLoading(true);
  hideError();

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Error al iniciar sesión');
      return;
    }

    // Redirect based on role
    window.location.href = data.role === 'admin' ? '/admin.html' : '/client.html';
  } catch (err) {
    showError('Error de conexión. Intenta nuevamente.');
  } finally {
    setLoading(false);
  }
});

function setLoading(loading) {
  loginBtn.disabled = loading;
  loginBtn.querySelector('span').textContent = loading ? 'Iniciando...' : 'Iniciar Sesión';
  loginSpinner.classList.toggle('hidden', !loading);
}

function showError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove('hidden');
}

function hideError() {
  loginError.classList.add('hidden');
}
