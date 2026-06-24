/* ==========================================================================
   OneDrive Auth Client Module
   ==========================================================================
   Content and popup pages cannot safely own the full Microsoft OAuth flow.
   This small client proxies auth requests to the extension service worker,
   where chrome.identity.launchWebAuthFlow is available.
   ========================================================================== */

(function initPortalCleanerOneDriveAuth() {
  // Wrap runtime messaging so feature code can use async/await and receive a
  // normalized failure object instead of handling chrome.runtime.lastError each
  // time it needs Microsoft auth state.
  function sendAuthMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            reason: "runtime-message-failed",
            error: chrome.runtime.lastError.message
          });
          return;
        }

        resolve(response ?? { ok: false, reason: "empty-auth-response" });
      });
    });
  }

  async function getAccessToken(options = {}) {
    const response = await sendAuthMessage({
      type: "portal-cleaner-onedrive-get-token",
      interactive: options.interactive !== false
    });

    if (!response.ok) {
      // Preserve the service worker's machine-readable reason. The conversion
      // UI uses this to distinguish cancelled sign-in, blocked tenant consent,
      // and missing app registration setup.
      const error = new Error(response.error || response.reason || "Microsoft sign-in failed.");
      error.reason = response.reason;
      error.details = response;
      throw error;
    }

    return response.accessToken;
  }

  function getAuthState() {
    // Used by the popup to show whether the extension is configured and whether
    // Microsoft sign-in has already happened for this browser profile.
    return sendAuthMessage({ type: "portal-cleaner-onedrive-get-state" });
  }

  function signOut() {
    // This clears only the extension's cached Microsoft tokens. It does not sign
    // the student out of Microsoft in the browser itself.
    return sendAuthMessage({ type: "portal-cleaner-onedrive-sign-out" });
  }

  window.PortalCleanerOneDriveAuth = {
    getAccessToken,
    getAuthState,
    signOut
  };
})();
