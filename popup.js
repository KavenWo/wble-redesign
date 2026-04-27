const STORAGE_KEY = "cleanerEnabled";
const toggle = document.getElementById("toggleCleaner");

// Initialize the popup from saved extension state.
chrome.storage.sync.get({ [STORAGE_KEY]: true }, (result) => {
  toggle.checked = Boolean(result[STORAGE_KEY]);
});

// Persist the toggle so the content script can react on every WBLE page.
toggle.addEventListener("change", () => {
  chrome.storage.sync.set({
    [STORAGE_KEY]: toggle.checked
  });
});
