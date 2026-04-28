function isWbleTab(tab) {
  return typeof tab?.url === "string" && tab.url.startsWith("https://ewble-sl.utar.edu.my/");
}

// The popup cannot directly control page lifecycle behavior, so it sends a
// message here. The background worker decides whether we should refresh the
// active WBLE tab or ask the content-side controller to enable live.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "portal-cleaner-toggle-changed") {
    return;
  }

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
});
