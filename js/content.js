/* ==========================================================================
   Content Module
   ==========================================================================
   Boots the page-side redesign experience on WBLE. It manages root state,
   login-page cleanup, and the DOM enhancements that reshape the portal UI
   once the cleaner mode is active.
   ========================================================================== */

const ROOT_CLASS = "portal-cleaner-active";
const DISABLED_CLASS = "portal-cleaner-disabled";
const BULK_DOWNLOAD_CONTAINER_ID = "portal-cleaner-download-panel";
const COURSE_TOOLS_CONTAINER_ID = "portal-cleaner-course-tools";
const COURSE_TOOL_SOURCE_SELECTOR = ".block_participants.sideblock, .block_activity_modules.sideblock, .block_admin.sideblock";
const COURSE_TOOL_HIDDEN_SOURCE = "utility-source";
const COURSE_TOOL_HIDDEN_PROFILE = "profile-link";
// We only guard the DOMContentLoaded hook itself. The enhancement functions are
// written to be idempotent, so rerunning them is safer than prematurely
// deciding the page is "done" before Moodle has rendered the target nodes.
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

function getCourseToolIcon(label) {
  const normalized = label.toLowerCase();
  const icons = {
    participants: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87'/%3E%3Cpath d='M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E",
    assignments: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2'/%3E%3Crect x='8' y='2' width='8' height='4' rx='1'/%3E%3Cpath d='M9 14l2 2 4-4'/%3E%3C/svg%3E",
    forums: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z'/%3E%3C/svg%3E",
    resources: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpath d='M14 2v6h6'/%3E%3Cpath d='M16 13H8'/%3E%3Cpath d='M16 17H8'/%3E%3C/svg%3E",
    grades: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 3v18h18'/%3E%3Cpath d='M18 17V9'/%3E%3Cpath d='M13 17V5'/%3E%3Cpath d='M8 17v-3'/%3E%3C/svg%3E",
    default: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4.75 6.75A2.75 2.75 0 0 1 7.5 4h9A2.75 2.75 0 0 1 19.25 6.75v10.5A2.75 2.75 0 0 1 16.5 20h-9a2.75 2.75 0 0 1-2.75-2.75V6.75Z'/%3E%3Cpath d='M8.5 8.25h7M8.5 12h7M8.5 15.75h4.5'/%3E%3C/svg%3E"
  };

  return icons[normalized] ?? icons.default;
}

function collectCourseToolLinks(sourceBlocks) {
  const seenTargets = new Set();
  const tools = [];

  sourceBlocks.forEach((block) => {
    const links = block.querySelectorAll(".content .list a[href]");

    links.forEach((link) => {
      const label = (link.textContent ?? "").replace(/\s+/g, " ").trim();

      if (!label) {
        return;
      }

      if (label.toLowerCase() === "profile") {
        link.closest("li")?.setAttribute("data-portal-cleaner-hidden", COURSE_TOOL_HIDDEN_PROFILE);
        return;
      }

      const target = link.href;
      const dedupeKey = `${label.toLowerCase()}|${target}`;

      if (seenTargets.has(dedupeKey)) {
        return;
      }

      seenTargets.add(dedupeKey);
      tools.push({ label, target });
    });
  });

  return tools;
}

function createCourseToolItem(tool) {
  const item = document.createElement("li");
  item.className = "portal-cleaner-tool-item";

  const link = document.createElement("a");
  link.className = "portal-cleaner-tool-link";
  link.href = tool.target;

  // The visual icon is CSS-masked so future labels can fall back gracefully
  // without depending on Moodle's old GIF assets.
  const icon = document.createElement("span");
  icon.className = "portal-cleaner-tool-icon";
  icon.style.setProperty("--portal-cleaner-tool-icon", `url("${getCourseToolIcon(tool.label)}")`);
  link.appendChild(icon);

  const title = document.createElement("span");
  title.className = "portal-cleaner-tool-title";
  title.textContent = tool.label;
  link.appendChild(title);

  item.appendChild(link);
  return item;
}

// Moodle can render different People, Activities, and Administration contents
// per course. Build one right-column panel from whatever links exist today,
// then hide the original source blocks through CSS markers.
function enhanceCourseUtilityNavigation() {
  const rightColumn = document.querySelector("#right-column > div, #region-post > div, .side-post > div");
  const sourceBlocks = Array.from(document.querySelectorAll(COURSE_TOOL_SOURCE_SELECTOR));

  if (!rightColumn || sourceBlocks.length === 0) {
    return;
  }

  const tools = collectCourseToolLinks(sourceBlocks);
  sourceBlocks.forEach((block) => {
    block.dataset.portalCleanerHidden = COURSE_TOOL_HIDDEN_SOURCE;
  });

  const existingPanel = document.getElementById(COURSE_TOOLS_CONTAINER_ID);

  if (tools.length === 0) {
    existingPanel?.setAttribute("data-portal-cleaner-hidden", COURSE_TOOL_HIDDEN_SOURCE);
    return;
  }

  if (existingPanel) {
    return;
  }

  const panel = document.createElement("div");
  panel.id = COURSE_TOOLS_CONTAINER_ID;
  panel.className = "portal-cleaner-utility-nav sideblock";

  const header = document.createElement("div");
  header.className = "header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "title";

  const heading = document.createElement("h2");
  heading.textContent = "Course tools";
  titleWrap.appendChild(heading);
  header.appendChild(titleWrap);
  panel.appendChild(header);

  const content = document.createElement("div");
  content.className = "content";

  const list = document.createElement("ul");
  list.className = "portal-cleaner-tool-list list";
  tools.forEach((tool) => list.appendChild(createCourseToolItem(tool)));

  content.appendChild(list);
  panel.appendChild(content);
  rightColumn.prepend(panel);
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

/**
 * Identifies and hides table rows that are used purely for spacing (empty content).
 * Scans for text, images, links, or inputs to ensure we don't hide functional rows.
 */
function removeEmptyTableRows() {
  const tables = document.querySelectorAll(".MsoNormalTable, .generaltable");

  tables.forEach((table) => {
    const rows = Array.from(table.rows);

    rows.forEach((row) => {
      // Skip the first row as it often acts as a header
      if (row === table.rows[0]) {
        return;
      }

      const cells = Array.from(row.cells);
      const isEmpty = cells.every((cell) => {
        // Robust check for any visual or interactive elements
        const hasInteractive = cell.querySelector("a, button, input, select, textarea, label") !== null;
        const hasMedia = cell.querySelector("img, svg, canvas, video, audio, iframe, object, embed") !== null;
        const hasStructural = cell.querySelector("table, ul, ol, dl") !== null;

        // Check for actual text, ignoring common invisible or formatting characters
        // includes nbsp, zero-width space, etc.
        const cleanText = cell.textContent.replace(/[\u00A0\u200B-\u200D\uFEFF]/g, "").trim();

        return cleanText.length === 0 && !hasInteractive && !hasMedia && !hasStructural;
      });

      if (isEmpty) {
        row.style.display = "none";
        row.dataset.portalCleanerEmptyRow = "true";
      }
    });
  });
}

/**
 * Removes "spacer" elements (empty divs, p, br) that are commonly used in legacy
 * content for manual padding. This allows the cleaner's CSS to take over 
 * and provide consistent, modern spacing.
 */
function cleanupLegacySpacers() {
  const containers = document.querySelectorAll(".summary, .info, .content");

  containers.forEach((container) => {
    const children = Array.from(container.children);

    children.forEach((child) => {
      // Ignore functional structural elements
      if (child.tagName === "TABLE" || child.tagName === "UL" || child.tagName === "OL") {
        return;
      }

      // Check for actual text content
      const cleanText = child.textContent.replace(/[\u00A0\s\u200B-\u200D\uFEFF]/g, "").trim();
      if (cleanText.length > 0) {
        return;
      }

      // Check for media or interactive elements
      if (child.querySelector("img, svg, canvas, video, audio, iframe, a, button, input")) {
        return;
      }

      // If it's a common container tag and is now confirmed empty of meaningful content
      const spacerTags = ["DIV", "P", "SPAN", "BR", "FONT"];
      if (spacerTags.includes(child.tagName)) {
        child.style.display = "none";
        child.dataset.portalCleanerSpacer = "true";
      }
    });
  });
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

function updateBulkDownloadStatus(panel, message, tone) {
  const status = panel?.querySelector(".portal-cleaner-download-status");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.dataset.portalCleanerTone = tone ?? "neutral";
}

function triggerZipDownload(blob, courseFolderName) {
  const archiveBaseName =
    window.PortalCleanerResourceDiscovery?.slugifyPathSegment(courseFolderName, "Course Files") ??
    "Course Files";
  const downloadLink = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);

  downloadLink.href = objectUrl;
  downloadLink.download = `${archiveBaseName}.zip`;
  downloadLink.style.display = "none";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

// Render one additive bulk-download panel near the weekly resources without
// disturbing the original Moodle markup underneath.
function renderBulkDownloadPanel(discovery) {
  const firstWeekContent = document.querySelector('tr.section.main[id^="section-"] > td.content');

  if (!firstWeekContent) {
    return;
  }

  let panel = document.getElementById(BULK_DOWNLOAD_CONTAINER_ID);

  if (!panel) {
    panel = document.createElement("section");
    panel.id = BULK_DOWNLOAD_CONTAINER_ID;
    panel.className = "portal-cleaner-download-panel";

    const textWrap = document.createElement("div");
    textWrap.className = "portal-cleaner-download-copy";

    const title = document.createElement("h3");
    title.className = "portal-cleaner-download-title";
    title.textContent = "Bulk download";
    textWrap.appendChild(title);

    const description = document.createElement("p");
    description.className = "portal-cleaner-download-description";
    textWrap.appendChild(description);

    const actions = document.createElement("div");
    actions.className = "portal-cleaner-download-actions";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "portal-cleaner-download-button";
    button.textContent = "Download all files";
    actions.appendChild(button);

    const status = document.createElement("p");
    status.className = "portal-cleaner-download-status";
    status.setAttribute("aria-live", "polite");
    actions.appendChild(status);

    panel.appendChild(textWrap);
    panel.appendChild(actions);
    firstWeekContent.prepend(panel);
  }

  const description = panel.querySelector(".portal-cleaner-download-description");
  const button = panel.querySelector(".portal-cleaner-download-button");

  if (!description || !(button instanceof HTMLButtonElement)) {
    return;
  }

  const downloadableCount = discovery.downloadable.length;
  const skippedCount = discovery.skipped.length;
  description.textContent = downloadableCount > 0
    ? `Package ${downloadableCount} course file${downloadableCount === 1 ? "" : "s"} into one ZIP download. ${skippedCount > 0 ? `${skippedCount} non-file link${skippedCount === 1 ? " was" : "s were"} skipped.` : ""}`
    : `No downloadable course files were found on this page. ${skippedCount > 0 ? `${skippedCount} non-file link${skippedCount === 1 ? " was" : "s were"} skipped.` : ""}`;

  button.disabled = downloadableCount === 0;

  if (panel.dataset.portalCleanerDownloadBound === "true") {
    return;
  }

  panel.dataset.portalCleanerDownloadBound = "true";

  button.addEventListener("click", async () => {
    if (button.disabled) {
      return;
    }

    button.disabled = true;
    updateBulkDownloadStatus(panel, `Packaging ${discovery.downloadable.length} file${discovery.downloadable.length === 1 ? "" : "s"} into one ZIP...`, "neutral");

    try {
      const response = await window.PortalCleanerZipBuilder?.buildArchive(discovery.downloadable);

      if (!response) {
        updateBulkDownloadStatus(panel, "ZIP builder is not available on this page.", "error");
        return;
      }

      if (!response.ok) {
        const failedCount = response?.results?.filter((result) => !result.ok).length ?? 0;
        const failureContext = failedCount > 0 ? ` ${failedCount} file request${failedCount === 1 ? "" : "s"} failed.` : "";
        updateBulkDownloadStatus(panel, `ZIP download could not be created.${failureContext}`, "error");
        return;
      }

      triggerZipDownload(response.blob, discovery.courseFolderName);
      const successCount = response.results.filter((result) => result.ok).length;
      const failureCount = response.results.length - successCount;
      const archiveName = `${discovery.courseFolderName}.zip`;
      const suffix = failureCount > 0 ? ` ${failureCount} file${failureCount === 1 ? "" : "s"} could not be added.` : "";
      updateBulkDownloadStatus(panel, `${successCount} file${successCount === 1 ? "" : "s"} packed into ${archiveName}.${suffix}`, failureCount > 0 ? "warning" : "success");
    } catch (error) {
      updateBulkDownloadStatus(panel, `ZIP download failed: ${error instanceof Error ? error.message : "unknown error"}.`, "error");
    } finally {
      button.disabled = false;
    }
  });
}

// Discovery stays outside content.js so future selection UI can reuse the same
// resource classification rules without duplicating DOM parsing logic here.
function enhanceBulkDownloadTools() {
  if (document.documentElement.dataset.portalCleanerPage !== "portal") {
    return;
  }

  if (!window.PortalCleanerResourceDiscovery) {
    return;
  }

  const discovery = window.PortalCleanerResourceDiscovery.discoverDownloadableResources();

  if (discovery.downloadable.length === 0 && discovery.skipped.length === 0) {
    return;
  }

  renderBulkDownloadPanel(discovery);
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
  enhanceCourseUtilityNavigation();
  enhanceNewsBlock();
  rebuildHeader();
  removeEmptyTableRows();
  cleanupLegacySpacers();
  window.PortalCleanerWeekly?.enhance();
  enhanceBulkDownloadTools();
}

function ensureEnhancementsApplied() {
  // Re-run the enhancement pass whenever we have a good lifecycle point.
  // Some WBLE nodes are not available yet at document_start during a reload,
  // so the DOMContentLoaded pass needs to be allowed to try again.
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
