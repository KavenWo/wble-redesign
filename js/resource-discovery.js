/* ==========================================================================
   Resource Discovery Module
   ==========================================================================
   Scans WBLE course content and normalizes resource metadata for download
   tools. It cleans titles, infers categories, and extracts the source details
   needed to build student-friendly download lists.
   ========================================================================== */

function normalizeResourceText(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

// Strip repeated course-code prefixes so the download UI and archive filenames
// focus on the meaningful resource title students actually recognize.
function cleanDiscoveredFileName(name) {
  return normalizeResourceText(name)
    .replace(/^[A-Z]{2,}\d{3,}(?:_[A-Z]{2,}\d{3,})*\s*/u, "")
    .replace(/^[A-Z]{2,}\d{3,}(?:\s*\/\s*[A-Z]{2,}\d{3,})*\s*/u, "")
    .replace(/_/g, " ")
    .trim();
}

function classifyDiscoveredCategory(name, item) {
  const normalizedName = (name ?? "").toLowerCase();

  const rules = [
    { type: "assignment", keywords: ["assignment", "submission link"] },
    { type: "assessment", keywords: ["test", "quiz", "exam", "solution"] },
    { type: "lecture", keywords: ["topic", "chap", "chapter", "lecture", "bab", "nota"] },
    { type: "lab", keywords: ["practical", "lab", "experiment"] },
    { type: "tutorial", keywords: ["tutorial", "tut"] },
    { type: "cover", keywords: ["cover page"] },
    { type: "reference", keywords: ["formula", "chart", "reference"] },
    { type: "results", keywords: ["marks", "grade", "coursework"] }
  ];

  for (const rule of rules) {
    if (rule.keywords.some((keyword) => {
      if (keyword.length <= 3) {
        return new RegExp(`\\b${keyword}\\b`, "i").test(normalizedName);
      }

      return normalizedName.includes(keyword);
    })) {
      return rule.type;
    }
  }

  if (item?.classList.contains("assignment")) {
    return "assignment";
  }

  return "file";
}

function getSourceText(item, linkText, href) {
  const hiddenText = item?.querySelector(".accesshide")?.textContent ?? "";
  const iconSource = item?.querySelector(".activityicon")?.getAttribute("src") ?? "";

  return `${hiddenText} ${iconSource} ${linkText} ${href}`.toLowerCase();
}

// We intentionally keep the first pass strict: only formats that behave like
// real downloadable files should enter the ZIP flow.
function detectFormat(sourceText) {
  if (sourceText.includes("powerpoint")) {
    return "PPT";
  }

  const formats = ["pdf", "docx", "pptx", "ppt", "xlsx", "xls", "zip", "doc", "rar", "7z"];

  for (const format of formats) {
    if (sourceText.includes(format)) {
      return format.toUpperCase();
    }
  }

  if (sourceText.includes("youtube") || sourceText.includes("youtu.be")) {
    return "VIDEO";
  }

  if (sourceText.includes("teams") || sourceText.includes("zoom")) {
    return "MEETING";
  }

  if (sourceText.includes("assignment")) {
    return "PORTAL";
  }

  return "LINK";
}

function isSamePortalHost(url) {
  return url.hostname === "ewble-sl.utar.edu.my";
}

// Treat Moodle resource URLs as authenticated entry points to real files, but
// keep obvious portal tools and external/video links out of bulk download.
function resolveDownloadability(url, format, item) {
  if (!isSamePortalHost(url)) {
    return { downloadable: false, reason: "external-link" };
  }

  if (["VIDEO", "MEETING", "LINK", "PORTAL"].includes(format)) {
    return { downloadable: false, reason: `unsupported-${format.toLowerCase()}` };
  }

  if (
    item?.classList.contains("forum") ||
    item?.classList.contains("page") ||
    item?.classList.contains("quiz") ||
    item?.classList.contains("url")
  ) {
    return { downloadable: false, reason: "unsupported-activity" };
  }

  if (
    url.pathname.includes("/mod/resource/view.php") ||
    url.pathname.includes("/file.php/")
  ) {
    return { downloadable: true, reason: null };
  }

  return { downloadable: false, reason: "unknown-resource-type" };
}

function slugifyPathSegment(value, fallback) {
  const normalized = normalizeResourceText(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 80);
}

function getCourseFolderName() {
  const activeBreadcrumb = document.querySelector(".breadcrumb li:last-child, .navbar a:last-child");
  const courseHeading = document.querySelector("#page-header .headermain, #page-header h1, .headingblock");
  const title = normalizeResourceText(courseHeading?.textContent) || normalizeResourceText(activeBreadcrumb?.textContent);

  return slugifyPathSegment(title, "Course Files");
}

function buildResourceRecord(item, link, source) {
  const rawTitle = normalizeResourceText(link.textContent);

  if (!rawTitle) {
    return null;
  }

  let url;

  try {
    url = new URL(link.href, window.location.href);
  } catch {
    return null;
  }

  const category = classifyDiscoveredCategory(rawTitle, item);
  const title = cleanDiscoveredFileName(rawTitle) || rawTitle;
  const sourceText = getSourceText(item, rawTitle, url.href);
  const format = detectFormat(sourceText);
  const { downloadable, reason } = resolveDownloadability(url, format, item);

  return {
    title,
    href: url.href,
    format,
    category,
    source,
    downloadable,
    skipReason: reason
  };
}

// Weekly activities remain the primary source of course files, so we discover
// them directly from the Moodle section rows before layering on later UX.
function discoverWeeklyActivityResources() {
  const items = Array.from(document.querySelectorAll('tr.section.main[id^="section-"] li.activity'));
  const resources = [];

  items.forEach((item) => {
    const link = item.querySelector("a[href]");

    if (!link) {
      return;
    }

    const record = buildResourceRecord(item, link, "activity");

    if (record) {
      resources.push(record);
    }
  });

  return resources;
}

function discoverSummaryResources() {
  const links = Array.from(document.querySelectorAll('tr.section.main[id^="section-"] .summary a[href]'));
  const resources = [];

  links.forEach((link) => {
    const record = buildResourceRecord(link.closest("li, div, p, td, span"), link, "summary");

    if (record) {
      resources.push(record);
    }
  });

  return resources;
}

// The page can expose the same resource through both the weekly card and the
// summary area. Dedupe by URL and title so one file only enters the ZIP once.
function dedupeResources(resources) {
  const seen = new Set();

  return resources.filter((resource) => {
    const key = `${resource.href}::${resource.title}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

window.PortalCleanerResourceDiscovery = {
  // Provide content.js with a single normalized result so UI rendering never
  // needs to know how Moodle activity rows and summary links differ.
  discoverDownloadableResources() {
    const discovered = dedupeResources([
      ...discoverWeeklyActivityResources(),
      ...discoverSummaryResources()
    ]);

    return {
      courseFolderName: getCourseFolderName(),
      downloadable: discovered.filter((resource) => resource.downloadable),
      skipped: discovered.filter((resource) => !resource.downloadable)
    };
  },
  slugifyPathSegment
};
