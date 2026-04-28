const ROOT_CLASS = "portal-cleaner-active";
const DISABLED_CLASS = "portal-cleaner-disabled";
// These guards keep the redesign app from re-running the same setup logic if
// the controller toggles it on more than once during a single page session.
let pageEnhancementsApplied = false;
let domReadyHookRegistered = false;

// Applies a single root class so CSS can be turned on/off without touching
// individual elements all over the page.
function setCleanerState(enabled) {
  document.documentElement.classList.toggle(ROOT_CLASS, enabled);
  document.documentElement.classList.toggle(DISABLED_CLASS, !enabled);
}

// Small proof-of-feasibility tweak: rename the default login heading to
// something a bit clearer without changing the actual login flow.
function relabelLoginPage() {
  if (document.documentElement.dataset.portalCleanerPage !== "login") {
    return;
  }

  const heading = document.querySelector(".loginpanel h2, .loginpanel .login-heading");

  if (!heading) {
    return;
  }

  heading.textContent = "Login to WBLE";
}

// Some legacy login responses render stray text nodes before the real page
// wrapper. Keep them in the DOM for reversibility, but tuck them away so they
// do not leak into the visual layout.
function hideLegacyLoginBodyText() {
  if (document.documentElement.dataset.portalCleanerPage !== "login") {
    return;
  }

  const page = document.getElementById("page");

  if (!page) {
    return;
  }

  const leadingNodes = Array.from(document.body.childNodes);

  for (const node of leadingNodes) {
    if (node === page) {
      break;
    }

    if (node.nodeType !== Node.TEXT_NODE) {
      continue;
    }

    const text = node.textContent?.trim() ?? "";

    if (!text || !/^[\d\s]+$/.test(text)) {
      continue;
    }

    if (text === "0102") {
      const hiddenText = document.createElement("span");
      hiddenText.className = "portal-cleaner-original-content";
      hiddenText.dataset.portalCleanerLegacyText = "login-body-prefix";
      hiddenText.textContent = text;
      node.parentNode?.replaceChild(hiddenText, node);
    }
  }
}

// The login page has duplicate "You are not logged in (Login)" status blocks in
// both the header and footer. Rename the useful header copy and mark the
// redundant footer copy so CSS can hide it safely.
function normalizeLoginChrome() {
  if (document.documentElement.dataset.portalCleanerPage !== "login") {
    return;
  }

  const headerLoginInfo = document.querySelector("#header .logininfo");

  if (headerLoginInfo && headerLoginInfo.dataset.portalCleanerNormalized !== "true") {
    headerLoginInfo.dataset.portalCleanerNormalized = "true";
    headerLoginInfo.textContent = "Student and staff login portal";
  }

  const footerLoginInfo = document.querySelector("#footer .logininfo");

  if (footerLoginInfo) {
    footerLoginInfo.dataset.portalCleanerRole = "redundant-login-status";
  }
}

// The legacy login page includes explanatory copy and a secondary support
// block that add visual noise without helping users complete the task. Keep
// the form intact, but trim the surrounding content to a single clear heading.
function simplifyLoginContent() {
  if (document.documentElement.dataset.portalCleanerPage !== "login") {
    return;
  }

  const loginPanel = document.querySelector(".loginpanel");

  if (!loginPanel) {
    return;
  }

  const contentToHide = loginPanel.querySelectorAll(".loginsub .desc, .forgotsub");

  contentToHide.forEach((element) => {
    if (element.dataset.portalCleanerSimplified === "true") {
      return;
    }

    element.dataset.portalCleanerSimplified = "true";
    element.classList.add("portal-cleaner-original-content");
  });
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

// Once the redesign app enhances a news block, it treats the card behavior
// as permanently active for that page session. 
// Turning the extension off, causes a full page refresh.
function applyNewsBlockAccessibility() {
  const posts = document.querySelectorAll('.block_news_items.sideblock li.post[data-portal-cleaner-enhanced="true"]');

  posts.forEach((post) => {
    post.tabIndex = 0;
    post.setAttribute("role", "link");

    if (post.dataset.portalCleanerAriaLabel) {
      post.setAttribute("aria-label", post.dataset.portalCleanerAriaLabel);
    }
  });
}

// Turns each Latest News post into a full clickable card while preserving the
// original anchor target in the DOM for a reversible enhancement.
function enhanceNewsBlock() {
  const posts = document.querySelectorAll(".block_news_items.sideblock li.post");

  posts.forEach((post) => {
    if (post.dataset.portalCleanerEnhanced === "true") {
      return;
    }

    const info = post.querySelector(".info");
    const moreLink = info?.querySelector("a");

    if (!info || !moreLink?.href) {
      return;
    }

    post.dataset.portalCleanerEnhanced = "true";
    post.dataset.portalCleanerHref = moreLink.href;
    post.dataset.portalCleanerAriaLabel = `Open news item: ${(info.textContent ?? "").replace(/\s+/g, " ").trim()}`;

    moreLink.classList.add("portal-cleaner-original-content");
    moreLink.setAttribute("tabindex", "-1");
    moreLink.setAttribute("aria-hidden", "true");

    const openPost = () => {
      window.location.href = moreLink.href;
    };

    post.addEventListener("click", (event) => {
      if (event.target instanceof HTMLAnchorElement) {
        return;
      }

      openPost();
    });

    post.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPost();
      }
    });
  });

  applyNewsBlockAccessibility();
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
  hideLegacyLoginBodyText();
  normalizeLoginChrome();
  simplifyLoginContent();
  enhanceCourseListBlock();
  enhanceNewsBlock();
  rebuildHeader();
}

function ensureEnhancementsApplied() {
  if (pageEnhancementsApplied) {
    return;
  }

  // The current migration keeps enhancement application one-way:
  // once the redesign has mounted for this page session 
  // turning it off is handled by a full refresh
  pageEnhancementsApplied = true;
  enhancePage();
}

function registerDomReadyHook() {
  if (domReadyHookRegistered) {
    return;
  }

  domReadyHookRegistered = true;

  // Run again after the DOM is ready so selectors that are not available at
  // document_start can still be enhanced safely.
  window.addEventListener("DOMContentLoaded", ensureEnhancementsApplied, { once: true });
}

window.PortalCleanerApp = {
  start(enabled) {
    // The controller always sets the root CSS state first so styling stays in
    // sync with the saved preference, even before the rest of the DOM finishes
    // loading.
    setCleanerState(Boolean(enabled));

    if (!enabled) {
      return;
    }

    // When enabled, this behaves like mounting the redesign app for the current
    // page session. We apply what we can immediately, then retry once the DOM is
    // fully ready for selectors that are unavailable at document_start.
    ensureEnhancementsApplied();
    registerDomReadyHook();
  }
};
