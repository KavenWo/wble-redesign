/* ==========================================================================
   Background Module
   ==========================================================================
   Coordinates extension-wide toggle behavior from the service worker. It
   decides whether the active WBLE tab should refresh, and owns the Microsoft
   OAuth flow needed for OneDrive-based PowerPoint conversion.
   ========================================================================== */

const MICROSOFT_CLIENT_ID = "d0480012-0060-4089-a572-b3d8a1925bc3";
const MICROSOFT_AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const MICROSOFT_SCOPES = ["Files.ReadWrite.AppFolder", "offline_access"];
const MICROSOFT_AUTH_STORAGE_KEY = "oneDriveAuth";
const TOKEN_EXPIRY_BUFFER_MS = 120000;

function isWbleTab(tab) {
  return typeof tab?.url === "string" && tab.url.startsWith("https://ewble-sl.utar.edu.my/");
}

function isMicrosoftConfigured() {
  return MICROSOFT_CLIENT_ID !== "YOUR_MICROSOFT_ENTRA_CLIENT_ID";
}

function base64UrlEncode(bytes) {
  // Microsoft requires PKCE code challenges to use base64url encoding without
  // padding, not the plain btoa output.
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createRandomVerifier(length) {
  // Used for both PKCE verifier and OAuth state. Keep it URL-safe because both
  // values travel through Microsoft's authorize URL.
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => possible[byte % possible.length]).join("");
}

async function createCodeChallenge(verifier) {
  // Authorization-code-with-PKCE lets this public extension avoid shipping a
  // client secret while still exchanging a one-time code for tokens.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function getRedirectUri() {
  // Brave/Chrome both use the chromiumapp.org redirect URI shape. It must match
  // the URI registered in Microsoft Entra for this exact extension ID.
  return chrome.identity.getRedirectURL();
}

function getStoredAuth() {
  // Tokens are local to this browser profile and are never synced through
  // chrome.storage.sync.
  return chrome.storage.local.get({ [MICROSOFT_AUTH_STORAGE_KEY]: null })
    .then((result) => result[MICROSOFT_AUTH_STORAGE_KEY]);
}

function setStoredAuth(auth) {
  return chrome.storage.local.set({ [MICROSOFT_AUTH_STORAGE_KEY]: auth });
}

function clearStoredAuth() {
  return chrome.storage.local.remove(MICROSOFT_AUTH_STORAGE_KEY);
}

function buildTokenBody(params) {
  // Both authorization-code and refresh-token exchanges share the same public
  // client metadata, so centralize it to avoid mismatched scopes/redirect URIs.
  const body = new URLSearchParams();
  body.set("client_id", MICROSOFT_CLIENT_ID);
  body.set("scope", MICROSOFT_SCOPES.join(" "));
  body.set("redirect_uri", getRedirectUri());

  Object.entries(params).forEach(([key, value]) => {
    body.set(key, value);
  });

  return body;
}

async function exchangeToken(body) {
  // Microsoft token errors carry useful text such as admin-consent requirements;
  // preserve those messages for the popup and course-page fallback UI.
  const response = await fetch(`${MICROSOFT_AUTHORITY}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `Microsoft token request failed with HTTP ${response.status}.`);
  }

  const expiresInMs = Number(payload.expires_in ?? 3600) * 1000;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + expiresInMs,
    scopes: payload.scope,
    tokenType: payload.token_type
  };
}

async function refreshAccessToken(storedAuth) {
  // Silent refresh is what prevents students from seeing the Microsoft login
  // prompt every time they convert a deck.
  if (!storedAuth?.refreshToken) {
    throw new Error("No Microsoft refresh token is available.");
  }

  const refreshed = await exchangeToken(buildTokenBody({
    grant_type: "refresh_token",
    refresh_token: storedAuth.refreshToken
  }));

  const nextAuth = {
    ...storedAuth,
    ...refreshed,
    refreshToken: refreshed.refreshToken || storedAuth.refreshToken
  };

  await setStoredAuth(nextAuth);
  return nextAuth;
}

async function launchMicrosoftSignIn() {
  // Force account selection so a student who hits a university admin-approval
  // wall can retry with a personal Microsoft account from the same dialog.
  const verifier = createRandomVerifier(64);
  const challenge = await createCodeChallenge(verifier);
  const state = createRandomVerifier(32);
  const authUrl = new URL(`${MICROSOFT_AUTHORITY}/authorize`);

  authUrl.searchParams.set("client_id", MICROSOFT_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", getRedirectUri());
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", MICROSOFT_SCOPES.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("prompt", "select_account");

  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.href,
    interactive: true
  });

  if (!redirectUrl) {
    throw new Error("Microsoft sign-in was cancelled.");
  }

  const redirected = new URL(redirectUrl);
  const returnedState = redirected.searchParams.get("state");
  const code = redirected.searchParams.get("code");
  const authError = redirected.searchParams.get("error");
  const authErrorDescription = redirected.searchParams.get("error_description");

  if (authError) {
    throw new Error(authErrorDescription || authError);
  }

  if (!code || returnedState !== state) {
    throw new Error("Microsoft sign-in returned an invalid authorization response.");
  }

  const auth = await exchangeToken(buildTokenBody({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier
  }));

  await setStoredAuth(auth);
  return auth;
}

async function getAccessToken(interactive) {
  // The rest of the extension asks for tokens through this one function so we
  // can prefer cached tokens, then refresh tokens, then interactive login.
  if (!isMicrosoftConfigured()) {
    throw new Error("Microsoft app registration is not configured yet. Replace YOUR_MICROSOFT_ENTRA_CLIENT_ID in js/background.js.");
  }

  const storedAuth = await getStoredAuth();

  if (storedAuth?.accessToken && storedAuth.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
    return storedAuth.accessToken;
  }

  if (storedAuth?.refreshToken) {
    try {
      const refreshed = await refreshAccessToken(storedAuth);
      return refreshed.accessToken;
    } catch {
      await clearStoredAuth();
    }
  }

  if (!interactive) {
    throw new Error("Microsoft sign-in is required.");
  }

  const auth = await launchMicrosoftSignIn();
  return auth.accessToken;
}

async function getAuthState() {
  // Popup-only state snapshot. Do not expose access tokens here; UI only needs
  // readiness/configuration metadata.
  const storedAuth = await getStoredAuth();

  return {
    ok: true,
    configured: isMicrosoftConfigured(),
    signedIn: Boolean(storedAuth?.refreshToken || storedAuth?.accessToken),
    expiresAt: storedAuth?.expiresAt ?? null,
    scopes: storedAuth?.scopes ?? MICROSOFT_SCOPES.join(" "),
    redirectUri: getRedirectUri()
  };
}

function normalizeError(error) {
  // Convert brittle Microsoft/Chrome error text into stable reason codes that
  // content.js and popup.js can turn into student-friendly messages.
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error.");
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("cancel")) {
    return { reason: "sign-in-cancelled", error: message };
  }

  if (
    lowerMessage.includes("consent") ||
    lowerMessage.includes("admin") ||
    lowerMessage.includes("not authorized") ||
    lowerMessage.includes("unauthorized_client")
  ) {
    return { reason: "microsoft-consent-blocked", error: message };
  }

  if (lowerMessage.includes("not configured")) {
    return { reason: "microsoft-not-configured", error: message };
  }

  return { reason: "microsoft-auth-failed", error: message };
}

function handleToggleChanged(message, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs.find(isWbleTab);

    if (!activeTab?.id) {
      sendResponse({ ok: false, reason: "no-matching-tab" });
      return;
    }

    // Enabling can stay seamless: the content-side controller is still present
    // on the page, so we can tell it to start the redesign immediately.
    if (message.enabled) {
      chrome.tabs.sendMessage(activeTab.id, { type: "portal-cleaner-enable-current-tab" }, () => {
        void chrome.runtime.lastError;
      });
      sendResponse({ ok: true, action: "enabled-live" });
      return;
    }

    // Disabling intentionally takes the safer route. We refresh the page so the
    // next load happens with the saved "off" state and the redesign app never
    // mounts in the first place.
    chrome.tabs.reload(activeTab.id);
    sendResponse({ ok: true, action: "reloaded-tab" });
  });

  // Returning true keeps the response channel open while tabs.query finishes.
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Runtime messages are the service worker's public API for the extension UI:
  // toggle control, token retrieval, auth state, and sign-out.
  if (!message?.type) {
    return false;
  }

  if (message.type === "portal-cleaner-toggle-changed") {
    return handleToggleChanged(message, sendResponse);
  }

  if (message.type === "portal-cleaner-onedrive-get-token") {
    getAccessToken(message.interactive !== false)
      .then((accessToken) => {
        sendResponse({ ok: true, accessToken });
      })
      .catch((error) => {
        sendResponse({ ok: false, ...normalizeError(error) });
      });
    return true;
  }

  if (message.type === "portal-cleaner-onedrive-get-state") {
    getAuthState()
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ ok: false, ...normalizeError(error) });
      });
    return true;
  }

  if (message.type === "portal-cleaner-onedrive-sign-out") {
    clearStoredAuth()
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({ ok: false, ...normalizeError(error) });
      });
    return true;
  }

  return false;
});
