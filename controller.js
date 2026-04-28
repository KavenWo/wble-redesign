const STORAGE_KEY = "cleanerEnabled";

// This file is intentionally small: it acts as the runtime controller that
// decides whether the redesign app in content.js should be active on this page.
// Keeping this separate lets content.js focus on UI behavior instead of toggle
// orchestration.
function applyCleanerState(enabled) {
  if (!window.PortalCleanerApp) {
    return;
  }

  window.PortalCleanerApp.start(Boolean(enabled));
}

// On every page load, read the persisted user preference and either start the
// redesign app or leave the page in original-mode styling.
chrome.storage.sync.get({ [STORAGE_KEY]: true }, (result) => {
  applyCleanerState(result[STORAGE_KEY]);
});

// Keep the current page aligned with the saved preference. 
// Live updates are only applied when redesign is turned on. 
// Turning it off is intentionally handled by a full page refresh 
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes[STORAGE_KEY]) {
    return;
  }

  if (!changes[STORAGE_KEY].newValue) {
    return;
  }

  applyCleanerState(true);
});

// When the popup enables the redesign on an already-open WBLE tab, the
// background worker sends this message so we can apply the redesign live
// without asking the user to refresh first.
chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "portal-cleaner-enable-current-tab") {
    return;
  }

  applyCleanerState(true);
});
