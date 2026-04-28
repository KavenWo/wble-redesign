function getWeeklyOutlineRows() {
  return Array.from(document.querySelectorAll('tr.section.main[id^="section-"]'));
}

function getWeekNumberFromRow(row) {
  const match = row.id.match(/^section-(\d+)$/);

  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

function rowHasMeaningfulSummary(row) {
  const summary = row.querySelector("td.content > .summary");

  if (!summary) {
    return false;
  }

  const summaryClone = summary.cloneNode(true);
  summaryClone.querySelectorAll(".portal-cleaner-summary-links, .portal-cleaner-summary-card").forEach((node) => {
    node.remove();
  });

  const text = (summaryClone.textContent ?? "").replace(/\s+/g, " ").trim();
  const links = summary.querySelectorAll("a[href]").length;

  return text.length > 0 || links > 0;
}

function shortenWeekDateLabel(label) {
  const monthMap = new Map([
    ["january", "Jan"],
    ["february", "Feb"],
    ["march", "Mar"],
    ["april", "Apr"],
    ["may", "May"],
    ["june", "Jun"],
    ["july", "Jul"],
    ["august", "Aug"],
    ["september", "Sep"],
    ["october", "Oct"],
    ["november", "Nov"],
    ["december", "Dec"]
  ]);

  return label.replace(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/giu,
    (month) => monthMap.get(month.toLowerCase()) ?? month
  ).replace(/\s+/g, " ").trim();
}

// Rebuild each weekly date header so the week number becomes the first thing
// students see while keeping the original date range intact.
function enhanceWeekHeaders() {
  const rows = getWeeklyOutlineRows();

  rows.forEach((row) => {
    const weekNumber = getWeekNumberFromRow(row);

    if (!weekNumber || weekNumber === 0) {
      return;
    }

    const weekDates = row.querySelector(".weekdates");

    if (!weekDates) {
      return;
    }

    if (weekDates.dataset.portalCleanerWeeklyEnhanced === "true") {
      return;
    }

    const originalLabel = (weekDates.textContent ?? "").replace(/\s+/g, " ").trim();
    const compactLabel = shortenWeekDateLabel(originalLabel);
    weekDates.textContent = "";

    const badge = document.createElement("span");
    badge.className = "portal-cleaner-week-badge";
    badge.textContent = `W${weekNumber}`;
    weekDates.appendChild(badge);

    const label = document.createElement("span");
    label.className = "portal-cleaner-week-label";
    label.textContent = compactLabel;
    weekDates.appendChild(label);

    if (row.classList.contains("current")) {
      const currentMarker = document.createElement("span");
      currentMarker.className = "portal-cleaner-week-current";
      currentMarker.textContent = "NOW";
      weekDates.appendChild(currentMarker);
    }

    row.dataset.portalCleanerWeek = String(weekNumber);
    weekDates.dataset.portalCleanerWeeklyEnhanced = "true";
  });
}

// Course file names vary a lot, so we bucket them by broad intent instead of
// trying to fully normalize every naming convention.
function classifyFileType(name, item) {
  const normalizedName = name.toLowerCase();

  const rules = [
    {
      type: "assignment",
      label: "Assignment",
      icon: "Submitting",
      keywords: ["assignment", "submission link"]
    },
    {
      type: "assessment",
      label: "Assessment",
      icon: "Checked",
      keywords: ["test", "quiz", "exam", "solution"]
    },
    {
      type: "lecture",
      label: "Lecture",
      icon: "Lecture",
      keywords: ["topic", "chap", "chapter", "lecture", "bab", "nota"]
    },
    {
      type: "lab",
      label: "Lab",
      icon: "Lab",
      keywords: ["practical", "lab", "experiment"]
    },
    {
      type: "tutorial",
      label: "Tutorial",
      icon: "Guide",
      keywords: ["tutorial", "tut"]
    },
    {
      type: "cover",
      label: "Cover",
      icon: "Cover",
      keywords: ["cover page"]
    },
    {
      type: "reference",
      label: "Reference",
      icon: "Reference",
      keywords: ["formula", "chart", "reference"]
    },
    {
      type: "results",
      label: "Results",
      icon: "Results",
      keywords: ["marks", "grade", "coursework"]
    }
  ];

  for (const rule of rules) {
    if (rule.keywords.some((keyword) => {
      if (keyword.length <= 3) {
        const regex = new RegExp(`\\b${keyword}\\b`, "i");
        return regex.test(normalizedName);
      }
      return normalizedName.includes(keyword);
    })) {
      return rule;
    }
  }

  if (item.classList.contains("assignment")) {
    return {
      type: "assignment",
      label: "Assignment",
      icon: "Submitting"
    };
  }

  return {
    type: "file",
    label: "File",
    icon: "File"
  };
}

// Weekly file cards should show the meaningful title, not the repeated course
// code prefix that is already implied by the current page.
function cleanFileName(name) {
  return name
    .replace(/^[A-Z]{2,}\d{3,}(?:_[A-Z]{2,}\d{3,})*\s*/u, "")
    .replace(/^[A-Z]{2,}\d{3,}(?:\s*\/\s*[A-Z]{2,}\d{3,})*\s*/u, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The original markup exposes file type through hidden text and icon URLs, so
// we derive a compact format label from those existing hints.
function getFileFormat(item, linkText) {
  const hiddenText = item.querySelector(".accesshide")?.textContent ?? "";
  const iconSource = item.querySelector(".activityicon")?.getAttribute("src") ?? "";
  const sourceText = `${hiddenText} ${iconSource} ${linkText}`.toLowerCase();
  const formats = ["pdf", "docx", "pptx", "ppt", "xlsx", "xls", "zip", "web"];

  for (const format of formats) {
    if (sourceText.includes(format)) {
      return format.toUpperCase();
    }
  }

  if (sourceText.includes("assignment")) {
    return "Portal";
  }

  return "File";
}

function getFormatFromSourceText(sourceText) {
  const normalizedSource = sourceText.toLowerCase();
  const formats = ["pdf", "docx", "pptx", "ppt", "xlsx", "xls", "zip", "mp4", "mp3", "web"];

  for (const format of formats) {
    if (normalizedSource.includes(format)) {
      return format.toUpperCase();
    }
  }

  if (normalizedSource.includes("youtube") || normalizedSource.includes("youtu.be")) {
    return "Video";
  }

  if (normalizedSource.includes("teams")) {
    return "Teams";
  }

  return "Link";
}

function resolveSummaryLinkCategory(label, href, fileFormat) {
  const category = classifyFileType(label, document.createElement("span"));

  if (category.type !== "file") {
    return category;
  }

  const normalizedFormat = fileFormat.toLowerCase();

  if (
    normalizedFormat === "link" ||
    normalizedFormat === "web" ||
    normalizedFormat === "video" ||
    normalizedFormat === "teams"
  ) {
    return {
      type: "reference",
      label: "Link",
      icon: "Reference"
    };
  }

  return category;
}

function getCategoryPresentation(type) {
  const categories = {
    lecture: { type: "lecture", label: "Lecture" },
    tutorial: { type: "tutorial", label: "Tutorial" },
    lab: { type: "lab", label: "Lab" },
    assignment: { type: "assignment", label: "Assignment" },
    cover: { type: "cover", label: "Cover" },
    reference: { type: "reference", label: "Reference" },
    assessment: { type: "assessment", label: "Assessment" },
    results: { type: "results", label: "Results" },
    file: { type: "file", label: "Files" }
  };

  return categories[type] ?? categories.file;
}

function buildFileCardContent(options) {
  const content = document.createElement("span");
  content.className = "portal-cleaner-file-card-content";

  const header = document.createElement("span");
  header.className = "portal-cleaner-file-card-header";

  if (options.showCategory !== false) {
    const tag = document.createElement("span");
    tag.className = `portal-cleaner-file-tag portal-cleaner-file-tag-${options.category.type}`;
    tag.textContent = options.category.label;
    header.appendChild(tag);
  }

  const formatMeta = document.createElement("span");
  formatMeta.className = "portal-cleaner-file-format";
  formatMeta.textContent = options.fileFormat;
  header.appendChild(formatMeta);

  const title = document.createElement("span");
  title.className = "portal-cleaner-file-title";
  title.textContent = options.title;

  content.appendChild(header);
  content.appendChild(title);

  return content;
}

function getFileTypeSortRank(type) {
  const order = [
    "lecture",
    "tutorial",
    "lab",
    "reference",
    "cover",
    "assessment",
    "results",
    "assignment",
    "file"
  ];
  const rank = order.indexOf(type);

  return rank === -1 ? order.length : rank;
}

// Some Moodle label content is wrapped in empty spacer elements before the real
// content. Treat those wrappers as disposable so they do not distort layout.
function isEmptyLabelNode(node) {
  if (!(node instanceof HTMLElement)) {
    return false;
  }

  const hasProtectedChild = node.querySelector("table, a, img, ul, ol, li");
  const compactText = (node.textContent ?? "").replace(/\s+/g, "").trim();

  return !hasProtectedChild && compactText.length === 0;
}

// Label blocks often contain copied rich-text markup with empty wrappers and
// one-off table containers. Normalize that structure so schedule tables render
// more like the simpler "good" label examples.
function normalizeLabelMarkup(labelElement) {
  const descendants = Array.from(labelElement.querySelectorAll("div, p, span, font"));

  descendants.forEach((node) => {
    if (isEmptyLabelNode(node)) {
      node.remove();
    }
  });

  const wrappers = Array.from(labelElement.querySelectorAll("div, p, span"));

  wrappers.forEach((wrapper) => {
    const elementChildren = Array.from(wrapper.children);
    const tableChildren = elementChildren.filter((child) => child.tagName === "TABLE");
    const nonTableChildren = elementChildren.filter((child) => child.tagName !== "TABLE" && child.tagName !== "BR");
    const textNodes = Array.from(wrapper.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
    const nonWhitespaceText = textNodes.some((node) => (node.textContent ?? "").trim().length > 0);

    if (tableChildren.length !== 1 || nonTableChildren.length > 0 || nonWhitespaceText) {
      return;
    }

    const table = tableChildren[0];
    wrapper.parentNode?.insertBefore(table, wrapper);
    wrapper.remove();
  });

  Array.from(labelElement.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && node.nodeName === "BR") {
      node.remove();
      return;
    }

    if (node.nodeType === Node.TEXT_NODE && !(node.textContent ?? "").trim()) {
      node.remove();
    }
  });
}

// Non-link label rows are still important content, so mark them explicitly and
// let layout place them above the downloadable resources.
function enhanceWeeklyLabels() {
  const rows = getWeeklyOutlineRows();

  rows.forEach((row) => {
    const labels = row.querySelectorAll("li.activity.label");

    labels.forEach((item) => {
      if (item.dataset.portalCleanerLabelEnhanced === "true") {
        return;
      }

      const labelElement = item.querySelector(".label");

      if (labelElement) {
        normalizeLabelMarkup(labelElement);
        
        // Hide completely empty labels to prevent grid gaps
        const text = (labelElement.textContent ?? "").replace(/\s+/g, "").trim();
        const hasMeaningfulContent = labelElement.querySelector("img, table, a, iframe, video, audio");
        
        if (text.length === 0 && !hasMeaningfulContent) {
          item.style.display = "none";
          item.dataset.portalCleanerSpacer = "true";
          return;
        }
      }

      item.dataset.portalCleanerLabelEnhanced = "true";
      item.dataset.portalCleanerLayout = "wide";
      item.dataset.portalCleanerContentRole = "label";
    });
  });
}

// Turn each activity row into a clearer card while preserving the original
// link target and hiding the legacy text non-destructively.
function enhanceWeeklyActivities() {
  const rows = getWeeklyOutlineRows();

  rows.forEach((row) => {
    const weekNumber = getWeekNumberFromRow(row);
    const weekLabel = weekNumber && weekNumber > 0 ? `Week ${weekNumber}` : "Course resources";

    const activities = row.querySelectorAll("li.activity");

    activities.forEach((item) => {
      if (item.dataset.portalCleanerCardEnhanced === "true") {
        return;
      }

      const link = item.querySelector("a");
      const labelSpan = link?.querySelector("span");

      if (!link || !labelSpan) {
        return;
      }

      const originalName = (labelSpan.childNodes[0]?.textContent ?? labelSpan.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();

      if (!originalName) {
        return;
      }

      const category = classifyFileType(originalName, item);
      const cleanedName = cleanFileName(originalName) || originalName;
      const fileFormat = getFileFormat(item, originalName);

      item.dataset.portalCleanerFileType = category.type;
      item.dataset.portalCleanerCardEnhanced = "true";
      item.dataset.portalCleanerWeek = weekNumber ? String(weekNumber) : "0";
      item.dataset.portalCleanerContentRole = "file";

      if (item.classList.contains("assignment") || item.classList.contains("forum") || category.type === "assignment") {
        item.dataset.portalCleanerLayout = "wide";
      } else {
        item.dataset.portalCleanerLayout = "compact";
      }

      link.classList.add("portal-cleaner-file-card");

      const hiddenDetails = Array.from(labelSpan.querySelectorAll(".accesshide"));

      const originalTextSpan = document.createElement("span");
      originalTextSpan.className = "portal-cleaner-original-content";
      originalTextSpan.textContent = originalName;

      labelSpan.textContent = "";
      labelSpan.appendChild(originalTextSpan);

      hiddenDetails.forEach((node) => {
        originalTextSpan.appendChild(node);
      });

      const content = buildFileCardContent({
        category,
        fileFormat,
        title: cleanedName,
        meta: weekLabel,
        showCategory: false
      });
      labelSpan.appendChild(content);
    });
  });
}

// Keep weekly resources easier to scan by clustering the same file category
// into their own grid blocks, so each category starts on a fresh row.
function groupWeeklyFilesByCategory() {
  const rows = getWeeklyOutlineRows();

  rows.forEach((row) => {
    const list = row.querySelector("td.content > ul.section.img-text");

    if (!list || list.dataset.portalCleanerGrouped === "true") {
      return;
    }

    const items = Array.from(list.children).filter((item) => item instanceof HTMLLIElement);
    const labels = items.filter((item) => item.dataset.portalCleanerContentRole === "label");
    const files = items.filter((item) => item.dataset.portalCleanerContentRole === "file");

    if (files.length === 0) {
      list.dataset.portalCleanerGrouped = "true";
      return;
    }

    files.sort((left, right) => {
      const leftRank = getFileTypeSortRank(left.dataset.portalCleanerFileType ?? "");
      const rightRank = getFileTypeSortRank(right.dataset.portalCleanerFileType ?? "");

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return 0;
    });

    labels.forEach((item) => {
      item.dataset.portalCleanerGroupStart = "false";
      list.appendChild(item);
    });

    let currentFileType = "";
    let currentGroup = null;

    files.forEach((item) => {
      const fileType = item.dataset.portalCleanerFileType ?? "";

      if (fileType !== currentFileType || !currentGroup) {
        currentFileType = fileType;
        currentGroup = document.createElement("li");
        currentGroup.className = "portal-cleaner-file-group";
        currentGroup.dataset.portalCleanerFileType = fileType;

        const groupHeader = document.createElement("div");
        const presentation = getCategoryPresentation(fileType);
        groupHeader.className = `portal-cleaner-file-group-header portal-cleaner-file-tag portal-cleaner-file-tag-${presentation.type}`;
        groupHeader.textContent = presentation.label;
        currentGroup.appendChild(groupHeader);

        const groupGrid = document.createElement("div");
        groupGrid.className = "portal-cleaner-file-group-grid";
        currentGroup.appendChild(groupGrid);
        list.appendChild(currentGroup);
      }

      item.dataset.portalCleanerGroupStart = "false";
      currentGroup.querySelector(".portal-cleaner-file-group-grid")?.appendChild(item);
    });

    list.dataset.portalCleanerGrouped = "true";
  });
}

function extractSummaryLinkLabel(link) {
  const rowText = (link.parentElement?.textContent ?? link.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const linkText = (link.textContent ?? "").replace(/\s+/g, " ").trim();

  if (rowText) {
    const trimmedRowText = rowText.replace(linkText, "").replace(/[:\-]\s*$/, "").trim();

    if (trimmedRowText) {
      return trimmedRowText;
    }
  }

  return linkText || "Open link";
}

function extractSummaryAnnouncementText(summary) {
  const summaryClone = summary.cloneNode(true);

  summaryClone.querySelectorAll("a, .portal-cleaner-summary-links, .portal-cleaner-summary-card").forEach((node) => {
    node.remove();
  });

  return (summaryClone.textContent ?? "").replace(/\s+/g, " ").trim();
}

function enhanceWeeklySummaries() {
  const rows = getWeeklyOutlineRows();

  rows.forEach((row) => {
    const summary = row.querySelector("td.content > .summary");
    const contentCell = row.querySelector("td.content");

    if (!summary || !contentCell || summary.dataset.portalCleanerSummaryEnhanced === "true") {
      return;
    }

    const links = Array.from(summary.querySelectorAll("a[href]"));
    summary.dataset.portalCleanerSummaryEnhanced = "true";

    if (links.length > 0) {
      let activityList = contentCell.querySelector("ul.section.img-text");

      if (!activityList) {
        activityList = document.createElement("ul");
        activityList.className = "section img-text";
        contentCell.appendChild(activityList);
      }

      links.forEach((link) => {
        if (link.dataset.portalCleanerSummaryLinkEnhanced === "true") {
          return;
        }

        const href = link.getAttribute("href") ?? "";
        const label = cleanFileName(extractSummaryLinkLabel(link));
        const fileFormat = getFormatFromSourceText(`${href} ${link.textContent ?? ""}`);
        const category = resolveSummaryLinkCategory(label, href, fileFormat);
        const item = document.createElement("li");
        const card = document.createElement("a");

        item.className = "activity resource portal-cleaner-summary-activity";
        item.dataset.portalCleanerFileType = category.type;
        item.dataset.portalCleanerCardEnhanced = "true";
        item.dataset.portalCleanerWeek = row.dataset.portalCleanerWeek ?? "0";
        item.dataset.portalCleanerContentRole = "file";
        item.dataset.portalCleanerLayout =
          category.type === "assignment" ? "wide" : "compact";

        card.className = "portal-cleaner-file-card portal-cleaner-summary-link-card";
        card.href = link.href;
        card.appendChild(buildFileCardContent({
          category,
          fileFormat,
          title: label,
          showCategory: false
        }));

        link.dataset.portalCleanerSummaryLinkEnhanced = "true";
        link.classList.add("portal-cleaner-original-content");
        item.appendChild(card);
        activityList.appendChild(item);
      });
    }

    const announcementText = extractSummaryAnnouncementText(summary);

    if (announcementText) {
      summary.dataset.portalCleanerHasAnnouncement = "true";
    }
  });
}

// Store light structural metadata on each week row so CSS can distinguish
// current, past, future, and empty states without extra DOM movement.
function markWeeklyOutlineState() {
  const rows = getWeeklyOutlineRows();
  const currentWeek = rows.find((row) => row.classList.contains("current"));
  const currentWeekNumber = currentWeek ? getWeekNumberFromRow(currentWeek) : null;

  rows.forEach((row) => {
    const weekNumber = getWeekNumberFromRow(row);

    if (!weekNumber || weekNumber === 0) {
      return;
    }

    const activityList = row.querySelector("td.content > ul.section");
    const hasItems = Boolean(activityList?.querySelector("li.activity")) || rowHasMeaningfulSummary(row);

    row.dataset.portalCleanerWeek = String(weekNumber);
    row.dataset.portalCleanerEmpty = hasItems ? "false" : "true";

    if (currentWeekNumber && weekNumber < currentWeekNumber) {
      row.dataset.portalCleanerRelative = "past";
    } else if (currentWeekNumber && weekNumber === currentWeekNumber) {
      row.dataset.portalCleanerRelative = "current";
    } else if (currentWeekNumber && weekNumber > currentWeekNumber) {
      row.dataset.portalCleanerRelative = "future";
    } else {
      row.dataset.portalCleanerRelative = "unknown";
    }
  });
}

window.PortalCleanerWeekly = {
  enhance() {
    // Keep the enhancement order stable because later steps reuse the metadata
    // and header structure created by the earlier passes.
    enhanceWeekHeaders();
    markWeeklyOutlineState();
    enhanceWeeklySummaries();
    enhanceWeeklyLabels();
    enhanceWeeklyActivities();
    groupWeeklyFilesByCategory();
  }
};
