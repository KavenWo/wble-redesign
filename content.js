const ROOT_CLASS = "portal-cleaner-active";
const DISABLED_CLASS = "portal-cleaner-disabled";
const STORAGE_KEY = "cleanerEnabled";

// Applies a single root class so CSS can be turned on/off without touching
// individual elements all over the page.
function setCleanerState(enabled) {
  document.documentElement.classList.toggle(ROOT_CLASS, enabled);
  document.documentElement.classList.toggle(DISABLED_CLASS, !enabled);
}

// Small proof-of-feasibility tweak: rename the default login heading to
// something a bit clearer without changing the actual login flow.
function relabelLoginPage() {
  const heading = document.querySelector("h1, h2, .login-heading");

  if (!heading) {
    return;
  }

  const text = heading.textContent?.trim() ?? "";

  if (text.includes("Returning to this web site?")) {
    heading.textContent = "Sign in to WBLE";
  }
}

function splitCourseLabel(text) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  const patterns = [
    /^(?<code>[A-Z]{2,}\d{3,}(?:\s*\/\s*[A-Z]{2,}\d{3,})*)\s+(?<title>.+)$/u,
    /^(?<code>[A-Z]{2,}\d{3,}-\d{4,}(?:-[A-Z]+)?)\s+(?<title>.+)$/u
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (match?.groups?.title) {
      return {
        code: match.groups.code.trim(),
        title: match.groups.title.trim()
      };
    }
  }

  return {
    code: "",
    title: normalized
  };
}

// Converts the noisy "CODE TITLE" course labels into a clearer two-line layout
// where the title is scanned first and the code becomes supporting metadata.
function enhanceCourseListBlock() {
  const container = document.querySelector(".block_course_list.sideblock");
  const list = container?.querySelector(".content .list");
  const links = list?.querySelectorAll("a");

  if (!links) return;

  links.forEach((link) => {
    if (link.dataset.portalCleanerEnhanced === "true") return;

    const parts = splitCourseLabel(link.textContent ?? "");
    if (!parts) return;

    const listItem = link.closest("li");
    const originalText = link.textContent;
    link.textContent = "";

    const originalTextSpan = document.createElement("span");
    originalTextSpan.className = "portal-cleaner-original-content";
    originalTextSpan.textContent = originalText;
    link.appendChild(originalTextSpan);

    link.classList.add("portal-cleaner-course-link");

    // Add a new icon container inside the link
    const iconSpan = document.createElement("span");
    iconSpan.className = "portal-cleaner-course-icon";
    link.appendChild(iconSpan);

    const textContainer = document.createElement("div");
    textContainer.className = "portal-cleaner-course-info";

    const titleSpan = document.createElement("span");
    titleSpan.className = "portal-cleaner-course-title";
    titleSpan.textContent = parts.title;
    textContainer.appendChild(titleSpan);

    if (parts.code) {
      const codeSpan = document.createElement("span");
      codeSpan.className = "portal-cleaner-course-code";
      codeSpan.textContent = parts.code;
      textContainer.appendChild(codeSpan);
      // Attach data attribute to the <li> for CSS-based reordering
      if (listItem) listItem.dataset.portalCleanerHasCode = "true";
    } else {
      if (listItem) listItem.dataset.portalCleanerHasCode = "false";
    }

    link.appendChild(textContainer);
    link.dataset.portalCleanerEnhanced = "true";
  });

  setupCourseToggle();
}

/**
 * Injects a toggle button for "Other Portals" (courses without codes) to keep 
 * the sidebar clean while allowing access when needed.
 */
function setupCourseToggle() {
  const container = document.querySelector(".block_course_list.sideblock .content");
  const list = container?.querySelector(".list");
  if (!list || list.dataset.portalCleanerToggleInitialized === "true") return;

  const otherCourses = list.querySelectorAll('li[data-portal-cleaner-has-code="false"]');
  if (otherCourses.length === 0) return;

  const toggle = document.createElement("div");
  toggle.className = "portal-cleaner-course-toggle";

  const icon = document.createElement("span");
  icon.className = "portal-cleaner-toggle-icon";
  toggle.appendChild(icon);

  toggle.onclick = () => {
    const isExpanded = list.classList.toggle("portal-cleaner-expanded");
    toggle.classList.toggle("active", isExpanded);
  };

  container.appendChild(toggle);
  list.dataset.portalCleanerToggleInitialized = "true";
}

// Marks the current page type on <html> so CSS can target login pages more
// safely than relying only on broad global selectors.
function addPageMarkers() {
  if (window.location.pathname.includes("/login/")) {
    document.documentElement.dataset.portalCleanerPage = "login";
  } else {
    document.documentElement.dataset.portalCleanerPage = "portal";
  }
}

// Rebuilds the old table-based WBLE header into a simpler custom header while
// reusing the portal's existing profile and logout links.
function rebuildHeader() {
  const header = document.querySelector("#header, #header-home");
  const loginInfo = document.querySelector(".logininfo");

  if (!header || !loginInfo || header.querySelector(".portal-cleaner-header-new")) return;

  const links = loginInfo.querySelectorAll("a");
  if (links.length < 2) return;

  const profileUrl = links[0].href;
  const userName = links[0].textContent?.trim() ?? "";
  const logoutUrl = links[1].href;

  const newHeader = document.createElement("div");
  newHeader.className = "portal-cleaner-header-new";

  const container = document.createElement("div");
  container.className = "portal-cleaner-header-container";

  // Left: Logo
  const logoLink = document.createElement("a");
  logoLink.href = "https://ewble-sl.utar.edu.my/";
  logoLink.className = "portal-cleaner-header-logo";
  const logoImg = document.createElement("img");
  logoImg.src = "https://upload.wikimedia.org/wikipedia/commons/b/b0/UTAR_LOGO_30122025.png";
  logoImg.alt = "UTAR Logo";
  logoLink.appendChild(logoImg);
  container.appendChild(logoLink);

  // Right: User Actions
  const userActions = document.createElement("div");
  userActions.className = "portal-cleaner-header-actions";

  const nameLink = document.createElement("a");
  nameLink.href = profileUrl;
  nameLink.className = "portal-cleaner-header-name";
  nameLink.textContent = userName;
  userActions.appendChild(nameLink);

  const logoutBtn = document.createElement("a");
  logoutBtn.href = logoutUrl;
  logoutBtn.className = "portal-cleaner-header-logout";
  logoutBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
    Logout
  `;
  userActions.appendChild(logoutBtn);

  container.appendChild(userActions);
  newHeader.appendChild(container);
  header.appendChild(newHeader);
}

// Central hook for lightweight page-specific enhancements. Keep this as the
// single place that wires together per-page UI upgrades.
function enhancePage() {
  addPageMarkers();
  relabelLoginPage();
  enhanceCourseListBlock();
  rebuildHeader();
}

// Default to enabled for the first-run experience, then apply any saved user
// preference from the popup toggle.
chrome.storage.sync.get({ [STORAGE_KEY]: true }, (result) => {
  setCleanerState(Boolean(result[STORAGE_KEY]));
  enhancePage();
});

// Keeps the current tab in sync when the popup toggle is changed.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes[STORAGE_KEY]) {
    return;
  }

  setCleanerState(Boolean(changes[STORAGE_KEY].newValue));
});

// Run again after the DOM is ready so selectors that are not available at
// document_start can still be enhanced safely.
window.addEventListener("DOMContentLoaded", enhancePage);
