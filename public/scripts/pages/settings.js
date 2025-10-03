import { initCommon, checkAuth, isDarkModeEnabled, setDarkModeEnabled, showToast, safeGet } from "./common.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const user = await checkAuth();
    initCommon();
    hydrateAccountPanel(user);
    syncThemeStatus();
    wireSettingsActions();
  } catch (error) {
    // checkAuth redirects on failure
  }
});

function wireSettingsActions() {
  const themeBtn = document.getElementById("toggleThemeBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const nextState = !isDarkModeEnabled();
      setDarkModeEnabled(nextState);
      syncThemeStatus();
      showToast(`Switched to ${nextState ? 'Dark' : 'Light'} Mode`);
    });
  }

  const resetBtn = document.getElementById("requestPasswordReset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      showToast("Password reset email has been queued (mock).", true);
    });
  }
}

function syncThemeStatus() {
  const status = document.getElementById("themeStatus");
  if (!status) return;
  status.textContent = `Currently in ${isDarkModeEnabled() ? 'Dark' : 'Light'} Mode`;
}

function hydrateAccountPanel(user) {
  const emailField = document.getElementById("settingsEmail");
  if (emailField) emailField.textContent = safeGet(user, ['email'], 'admin@renn.ai');
}
