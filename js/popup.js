/* ==========================================================================
   Popup Module
   ==========================================================================
   Powers the extension popup toggle. It loads the saved cleaner state,
   persists user changes, and notifies the background worker so the current
   WBLE tab can react immediately.
   ========================================================================== */

const STORAGE_KEY = "cleanerEnabled";
const toggle = document.getElementById("toggleCleaner");
const oneDriveStatus = document.getElementById("oneDriveStatus");
const oneDriveAction = document.getElementById("oneDriveAction");
const oneDriveSignOut = document.getElementById("oneDriveSignOut");

function sendRuntimeMessage(message) {
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

      resolve(response ?? { ok: false, reason: "empty-response" });
    });
  });
}

function setOneDriveStatus(message, tone) {
  if (!oneDriveStatus) {
    return;
  }

  oneDriveStatus.textContent = message;
  oneDriveStatus.dataset.tone = tone;
}

async function refreshOneDriveState() {
  if (!oneDriveAction || !oneDriveSignOut) {
    return;
  }

  const state = await sendRuntimeMessage({ type: "portal-cleaner-onedrive-get-state" });

  if (!state.ok) {
    setOneDriveStatus(state.error || "Could not check Microsoft setup.", "error");
    oneDriveAction.disabled = true;
    oneDriveSignOut.disabled = true;
    return;
  }

  if (!state.configured) {
    setOneDriveStatus("Add your Microsoft app client ID first.", "warning");
    oneDriveAction.disabled = true;
    oneDriveSignOut.disabled = true;
    return;
  }

  if (state.signedIn) {
    setOneDriveStatus("Ready to convert PPT/PPTX files.", "success");
    oneDriveAction.textContent = "Refresh";
    oneDriveAction.disabled = false;
    oneDriveSignOut.disabled = false;
    return;
  }

  setOneDriveStatus("Sign in once to enable PDF conversion.", "warning");
  oneDriveAction.textContent = "Sign in";
  oneDriveAction.disabled = false;
  oneDriveSignOut.disabled = true;
}

// Initialize the popup from saved extension state.
chrome.storage.sync.get({ [STORAGE_KEY]: true }, (result) => {
  toggle.checked = Boolean(result[STORAGE_KEY]);
});

refreshOneDriveState();

// Persist the toggle so the content script can react on every WBLE page.
toggle.addEventListener("change", () => {
  chrome.storage.sync.set({
    [STORAGE_KEY]: toggle.checked
  });

  chrome.runtime.sendMessage({
    type: "portal-cleaner-toggle-changed",
    enabled: toggle.checked
  });
});

oneDriveAction?.addEventListener("click", async () => {
  oneDriveAction.disabled = true;
  setOneDriveStatus("Opening Microsoft sign-in...", "warning");

  const response = await sendRuntimeMessage({
    type: "portal-cleaner-onedrive-get-token",
    interactive: true
  });

  if (!response.ok) {
    const message =
      response.reason === "microsoft-consent-blocked"
        ? "This Microsoft account or organization blocked consent."
        : response.reason === "sign-in-cancelled"
          ? "Microsoft sign-in was cancelled."
          : response.error || "Microsoft sign-in failed.";
    setOneDriveStatus(message, response.reason === "sign-in-cancelled" ? "warning" : "error");
    oneDriveAction.disabled = false;
    return;
  }

  await refreshOneDriveState();
});

oneDriveSignOut?.addEventListener("click", async () => {
  oneDriveSignOut.disabled = true;
  await sendRuntimeMessage({ type: "portal-cleaner-onedrive-sign-out" });
  await refreshOneDriveState();
});
