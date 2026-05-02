/* ==========================================================================
   File Tools Module
   ==========================================================================
   Owns the lightweight "Files" tool and modal. It keeps course-file actions
   out of content.js so page bootstrapping stays focused on orchestration.
   ========================================================================== */

(function initPortalCleanerFileTools() {
  const TOOL_CONTAINER_ID = "portal-cleaner-file-tools";
  const MODAL_ID = "portal-cleaner-files-modal";
  const MODAL_OPEN_CLASS = "portal-cleaner-files-modal-open";

  // Returns only resources that the OneDrive converter can safely turn into
  // PDFs. Keeping this delegated prevents the UI and converter from drifting.
  function getConvertibleResources(resources) {
    return resources.filter((resource) => {
      if (window.PortalCleanerOneDriveConverter?.isConvertible) {
        return window.PortalCleanerOneDriveConverter.isConvertible(resource);
      }

      return ["PPT", "PPTX"].includes(String(resource?.format ?? "").toUpperCase());
    });
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

  // Groups discovered files into the same broad buckets used by weekly cards
  // so the modal remains familiar instead of becoming a raw Moodle link list.
  function groupResourcesByCategory(resources) {
    const groups = new Map();

    resources.forEach((resource) => {
      const type = resource.category || "file";
      const presentation = getCategoryPresentation(type);

      if (!groups.has(presentation.type)) {
        groups.set(presentation.type, {
          presentation,
          resources: []
        });
      }

      groups.get(presentation.type).resources.push(resource);
    });

    return Array.from(groups.values())
      .sort((left, right) => getFileTypeSortRank(left.presentation.type) - getFileTypeSortRank(right.presentation.type));
  }

  function getResourceSelectionKey(resource) {
    return resource?.href || `${resource?.title ?? "file"}:${resource?.format ?? ""}`;
  }

  // Keeps selection state stable across modal re-renders. New resources default
  // to unselected so students intentionally choose what enters the archive.
  function syncSelectionState(modal, resources) {
    const currentKeys = new Set(resources.map(getResourceSelectionKey));

    if (!modal.portalCleanerSelectedResourceKeys) {
      modal.portalCleanerSelectedResourceKeys = new Set();
      modal.portalCleanerSelectionKnownKeys = currentKeys;
      return;
    }

    modal.portalCleanerSelectedResourceKeys.forEach((key) => {
      if (!currentKeys.has(key)) {
        modal.portalCleanerSelectedResourceKeys.delete(key);
      }
    });

    modal.portalCleanerSelectionKnownKeys = currentKeys;
  }

  function getSelectedResources(modal, resources) {
    const selectedKeys = modal.portalCleanerSelectedResourceKeys ?? new Set();

    return resources.filter((resource) => selectedKeys.has(getResourceSelectionKey(resource)));
  }

  function updateSelectionSummary(modal) {
    const discovery = modal.portalCleanerDiscovery;
    const resources = discovery?.downloadable ?? [];
    const selectedCount = getSelectedResources(modal, resources).length;
    const totalCount = resources.length;
    const selectedConvertibleCount = getConvertibleResources(getSelectedResources(modal, resources)).length;
    const hasConvertibleResources = getConvertibleResources(resources).length > 0;
    const summary = modal.querySelector(".portal-cleaner-files-summary");
    const zipButton = modal.querySelector(".portal-cleaner-files-download-button");
    const convertOption = modal.querySelector(".portal-cleaner-files-convert-option");
    const selectAllOption = modal.querySelector(".portal-cleaner-files-select-all-option");
    const skippedCount = discovery?.skipped?.length ?? 0;

    if (summary) {
      summary.textContent = `${selectedCount} of ${totalCount} downloadable file${totalCount === 1 ? "" : "s"} selected. ${selectedConvertibleCount} selected slide deck${selectedConvertibleCount === 1 ? "" : "s"} can be converted to PDF.${skippedCount > 0 ? ` ${skippedCount} non-file link${skippedCount === 1 ? " was" : "s were"} skipped.` : ""}`;
    }

    if (zipButton) {
      zipButton.disabled = selectedCount === 0;
      zipButton.textContent = selectedCount === totalCount ? "Download all files" : "Download selected files";
    }

    if (convertOption) {
      convertOption.disabled = selectedConvertibleCount === 0;
    }

    const convertOptionLabel = convertOption?.closest(".portal-cleaner-files-option");

    if (convertOptionLabel) {
      convertOptionLabel.hidden = !hasConvertibleResources;
    }

    if (selectAllOption) {
      selectAllOption.checked = totalCount > 0 && selectedCount === totalCount;
      selectAllOption.indeterminate = selectedCount > 0 && selectedCount < totalCount;
    }
  }

  function setAllResourcesSelected(modal, resources, shouldSelect) {
    if (shouldSelect) {
      modal.portalCleanerSelectedResourceKeys = new Set(resources.map(getResourceSelectionKey));
    } else {
      modal.portalCleanerSelectedResourceKeys = new Set();
    }

    modal.querySelectorAll(".portal-cleaner-files-item").forEach((item) => {
      const itemInput = item.querySelector(".portal-cleaner-files-item-select");
      item.dataset.portalCleanerSelected = shouldSelect ? "true" : "false";

      if (itemInput) {
        itemInput.checked = shouldSelect;
      }
    });

    updateAllCategorySelectionControls(modal);
    updateSelectionSummary(modal);
  }

  function updateCategorySelectionControl(modal, groupType) {
    const groupNode = modal.querySelector(`.portal-cleaner-files-group[data-portal-cleaner-file-group="${groupType}"]`);
    const categoryInput = groupNode?.querySelector(".portal-cleaner-files-category-select");
    const itemInputs = Array.from(groupNode?.querySelectorAll(".portal-cleaner-files-item-select") ?? []);
    const selectedCount = itemInputs.filter((input) => input.checked).length;

    if (!categoryInput) {
      return;
    }

    // Native checkbox indeterminate state gives a clear "some selected" cue
    // while preserving keyboard and screen-reader behavior.
    categoryInput.checked = itemInputs.length > 0 && selectedCount === itemInputs.length;
    categoryInput.indeterminate = selectedCount > 0 && selectedCount < itemInputs.length;
  }

  function updateAllCategorySelectionControls(modal) {
    modal.querySelectorAll(".portal-cleaner-files-group").forEach((groupNode) => {
      updateCategorySelectionControl(modal, groupNode.dataset.portalCleanerFileGroup);
    });
  }

  function updateStatus(modal, selector, message, tone) {
    const status = modal?.querySelector(selector);

    if (!status) {
      return;
    }

    status.textContent = message;
    status.dataset.portalCleanerTone = tone ?? "neutral";
  }

  function updateZipStatus(modal, message, tone) {
    updateStatus(modal, ".portal-cleaner-files-zip-status", message, tone);
  }

  function updateConversionStatus(modal, message, tone) {
    updateStatus(modal, ".portal-cleaner-files-conversion-status", message, tone);
  }

  // Triggers exactly one browser download for the final ZIP. This is the only
  // download prompt the combined PPTX-to-PDF flow should create.
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

  // Normalizes auth/config/conversion errors into short UI messages that can
  // be reused by both hard failures and graceful fallback warnings.
  function getConversionErrorMessage(error) {
    const reason = error?.reason ?? error?.details?.reason;

    return reason === "microsoft-not-configured"
      ? "Microsoft app registration is not configured yet. Copy local-config.example.js to local-config.js and set microsoftClientId."
      : reason === "microsoft-consent-blocked"
        ? "Microsoft sign-in was blocked by this account or organization. UTAR/work accounts may need admin approval; try a personal Microsoft account."
        : reason === "sign-in-cancelled"
          ? "Microsoft sign-in was cancelled."
          : `Slide conversion failed: ${error instanceof Error ? error.message : "unknown error"}.`;
  }

  // Adapts successful archive-mode conversion results into ZIP-ready file
  // entries. Failed conversions are intentionally excluded and handled later.
  function createConvertedPdfFiles(conversionResponse, convertibleResources) {
    return (conversionResponse?.results ?? [])
      .map((result, index) => {
        if (!result.ok || !result.bytes?.length) {
          return null;
        }

        const resource = convertibleResources[index];
        const path =
          window.PortalCleanerZipBuilder?.createArchivePath?.(resource, result.pdfFileName) ??
          result.pdfFileName;

        return {
          path,
          bytes: result.bytes
        };
      })
      .filter(Boolean);
  }

  // Main packaging orchestrator for "Download all files". When conversion is
  // enabled, it replaces successful PPT/PPTX files with generated PDFs and
  // falls back to the original slide decks for anything that fails.
  async function buildArchiveWithOptionalConversion(resources, shouldConvert, callbacks) {
    if (!shouldConvert) {
      return window.PortalCleanerZipBuilder?.buildArchive(resources);
    }

    if (!window.PortalCleanerZipBuilder?.collectResourceFiles || !window.PortalCleanerZipBuilder?.buildArchiveFromFiles) {
      return {
        ok: false,
        reason: "zip-builder-missing-prebuilt-file-support",
        results: []
      };
    }

    if (!window.PortalCleanerOneDriveConverter?.convertResourcesForArchive) {
      return {
        ok: false,
        reason: "converter-missing-archive-support",
        results: []
      };
    }

    const convertibleResources = getConvertibleResources(resources);
    const convertibleSet = new Set(convertibleResources);
    // Converted decks should appear as PDFs, so keep them out of the normal
    // WBLE fetch list unless conversion fails and we need the original file.
    const normalResources = resources.filter((resource) => !convertibleSet.has(resource));

    callbacks?.onConversionStart?.(convertibleResources);
    let conversionResponse;
    let conversionError = null;

    try {
      conversionResponse = await window.PortalCleanerOneDriveConverter.convertResourcesForArchive(convertibleResources, {
        onOverallStatus: callbacks?.onOverallStatus,
        onFileStatus: callbacks?.onFileStatus
      });
    } catch (error) {
      // If Microsoft auth/config fails before per-file results exist, preserve
      // the one-ZIP promise by falling back to the original PPT/PPTX downloads.
      conversionError = error;
      conversionResponse = {
        ok: false,
        results: [],
        successCount: 0,
        failureCount: convertibleResources.length,
        cleanupWarningCount: 0
      };
      callbacks?.onConversionError?.(error);
    }

    const conversionResults = conversionResponse?.results ?? [];
    const convertedPdfFiles = createConvertedPdfFiles(conversionResponse, convertibleResources);
    // Per-file conversion failures fall back to the original deck so students
    // still receive every possible course file in the final archive.
    const failedConversionResources = convertibleResources.filter((resource, index) => !conversionResults[index]?.ok);
    const resourcesToFetch = normalResources.concat(failedConversionResources);

    callbacks?.onFetchStart?.(resourcesToFetch, convertedPdfFiles, failedConversionResources);
    const fetched = await window.PortalCleanerZipBuilder.collectResourceFiles(resourcesToFetch);
    const combinedResults = [
      ...conversionResults.map((result) => ({
        ...result,
        fileName: result.pdfFileName,
        converted: true
      })),
      ...fetched.results
    ];

    return {
      ...window.PortalCleanerZipBuilder.buildArchiveFromFiles(fetched.files.concat(convertedPdfFiles), combinedResults),
      conversionResponse,
      conversionError,
      fallbackCount: failedConversionResources.length
    };
  }

  // Builds the per-slide progress list before conversion starts so later
  // callbacks can update stable rows by their original resource index.
  function renderConversionProgressList(modal, resources) {
    const list = modal?.querySelector(".portal-cleaner-files-conversion-list");

    if (!list) {
      return;
    }

    list.textContent = "";

    resources.forEach((resource, index) => {
      const item = document.createElement("li");
      item.className = "portal-cleaner-files-conversion-item";
      item.dataset.portalCleanerConversionIndex = String(index);
      item.dataset.portalCleanerTone = "neutral";

      const title = document.createElement("span");
      title.className = "portal-cleaner-files-conversion-item-title";
      title.textContent = resource.title;
      item.appendChild(title);

      const state = document.createElement("span");
      state.className = "portal-cleaner-files-conversion-item-state";
      state.textContent = "Queued";
      item.appendChild(state);

      list.appendChild(item);
    });
  }

  // Updates one conversion progress row and maps converter states to the modal
  // tone system used by CSS for success, warning, and error colors.
  function updateConversionProgressItem(modal, index, state, message) {
    const item = modal?.querySelector(`.portal-cleaner-files-conversion-item[data-portal-cleaner-conversion-index="${index}"]`);
    const stateNode = item?.querySelector(".portal-cleaner-files-conversion-item-state");

    if (!item || !stateNode) {
      return;
    }

    item.dataset.portalCleanerTone =
      state === "failed" ? "error" :
        state === "cleanup-warning" ? "warning" :
          state === "done" ? "success" :
            "neutral";
    stateNode.textContent = message;
  }

  function createFileToolIcon() {
    const icon = document.createElement("span");
    icon.className = "portal-cleaner-file-tool-icon";
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function openModal(modal) {
    modal.hidden = false;
    document.documentElement.classList.add(MODAL_OPEN_CLASS);
    modal.querySelector(".portal-cleaner-files-close")?.focus();
  }

  function closeModal(modal) {
    modal.hidden = true;
    document.documentElement.classList.remove(MODAL_OPEN_CLASS);
    document.querySelector(".portal-cleaner-file-tool-button")?.focus();
  }

  // Renders the browsable file inventory inside the modal. This is display-only;
  // download behavior always reads from the latest discovery snapshot.
  function renderFileList(modal, resources) {
    const list = modal.querySelector(".portal-cleaner-files-list");
    const groups = groupResourcesByCategory(resources);
    const selectedKeys = modal.portalCleanerSelectedResourceKeys ?? new Set();

    list.textContent = "";

    groups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "portal-cleaner-files-group";
      section.dataset.portalCleanerFileGroup = group.presentation.type;

      const header = document.createElement("div");
      header.className = "portal-cleaner-files-group-header";

      const heading = document.createElement("h3");
      heading.className = `portal-cleaner-files-group-title portal-cleaner-file-tag portal-cleaner-file-tag-${group.presentation.type}`;
      heading.textContent = group.presentation.label;
      header.appendChild(heading);

      const categoryLabel = document.createElement("label");
      categoryLabel.className = "portal-cleaner-files-select-label portal-cleaner-files-category-select-label";
      categoryLabel.title = `Select all ${group.presentation.label} files`;

      const categoryInput = document.createElement("input");
      categoryInput.type = "checkbox";
      categoryInput.className = "portal-cleaner-files-select portal-cleaner-files-category-select";
      categoryInput.setAttribute("aria-label", `Select all ${group.presentation.label} files`);
      categoryLabel.appendChild(categoryInput);

      header.appendChild(categoryLabel);
      section.appendChild(header);

      const groupList = document.createElement("ul");
      groupList.className = "portal-cleaner-files-group-list";

      group.resources.forEach((resource) => {
        const resourceKey = getResourceSelectionKey(resource);
        const item = document.createElement("li");
        item.className = "portal-cleaner-files-item";
        item.dataset.portalCleanerResourceKey = resourceKey;
        item.dataset.portalCleanerSelected = selectedKeys.has(resourceKey) ? "true" : "false";

        const icon = document.createElement("span");
        icon.className = "portal-cleaner-files-item-icon";

        if (resource.iconSource) {
          const image = document.createElement("img");
          image.src = resource.iconSource;
          image.alt = "";
          image.loading = "lazy";
          icon.appendChild(image);
        } else {
          icon.textContent = resource.format;
        }

        item.appendChild(icon);

        const title = document.createElement("span");
        title.className = "portal-cleaner-files-item-title";
        title.textContent = resource.title;
        item.appendChild(title);

        const meta = document.createElement("span");
        meta.className = "portal-cleaner-files-item-meta";
        meta.textContent = resource.format;
        item.appendChild(meta);

        const itemSelectLabel = document.createElement("label");
        itemSelectLabel.className = "portal-cleaner-files-select-label portal-cleaner-files-item-select-label";
        itemSelectLabel.title = `Select ${resource.title}`;

        const itemSelect = document.createElement("input");
        itemSelect.type = "checkbox";
        itemSelect.className = "portal-cleaner-files-select portal-cleaner-files-item-select";
        itemSelect.checked = selectedKeys.has(resourceKey);
        itemSelect.setAttribute("aria-label", `Select ${resource.title}`);
        itemSelect.addEventListener("change", () => {
          if (itemSelect.checked) {
            modal.portalCleanerSelectedResourceKeys.add(resourceKey);
            item.dataset.portalCleanerSelected = "true";
          } else {
            modal.portalCleanerSelectedResourceKeys.delete(resourceKey);
            item.dataset.portalCleanerSelected = "false";
          }

          updateCategorySelectionControl(modal, group.presentation.type);
          updateSelectionSummary(modal);
        });
        itemSelectLabel.appendChild(itemSelect);
        item.appendChild(itemSelectLabel);

        groupList.appendChild(item);
      });

      categoryInput.addEventListener("change", () => {
        const shouldSelect = categoryInput.checked;

        // Category selection writes through each child checkbox so DOM state,
        // modal state, and visible selected-card styling stay synchronized.
        group.resources.forEach((resource) => {
          const resourceKey = getResourceSelectionKey(resource);
          const item = Array.from(groupList.querySelectorAll(".portal-cleaner-files-item"))
            .find((candidate) => candidate.dataset.portalCleanerResourceKey === resourceKey);
          const itemInput = item?.querySelector(".portal-cleaner-files-item-select");

          if (shouldSelect) {
            modal.portalCleanerSelectedResourceKeys.add(resourceKey);
          } else {
            modal.portalCleanerSelectedResourceKeys.delete(resourceKey);
          }

          if (item) {
            item.dataset.portalCleanerSelected = shouldSelect ? "true" : "false";
          }

          if (itemInput) {
            itemInput.checked = shouldSelect;
          }
        });

        updateCategorySelectionControl(modal, group.presentation.type);
        updateSelectionSummary(modal);
      });

      section.appendChild(groupList);
      list.appendChild(section);
      updateCategorySelectionControl(modal, group.presentation.type);
    });
  }

  // Binds modal actions once and keeps the current discovery snapshot fresh.
  // Moodle can finish rendering in waves, so repeated enhancement should update
  // data without stacking duplicate click listeners.
  function bindModalActions(modal, discovery) {
    modal.portalCleanerDiscovery = discovery;

    if (modal.dataset.portalCleanerFilesBound === "true") {
      return;
    }

    modal.dataset.portalCleanerFilesBound = "true";

    const zipButton = modal.querySelector(".portal-cleaner-files-download-button");
    const convertOption = modal.querySelector(".portal-cleaner-files-convert-option");
    const selectAllOption = modal.querySelector(".portal-cleaner-files-select-all-option");
    const getCurrentDiscovery = () => modal.portalCleanerDiscovery ?? discovery;

    selectAllOption?.addEventListener("change", () => {
      const currentDiscovery = getCurrentDiscovery();
      setAllResourcesSelected(modal, currentDiscovery.downloadable, selectAllOption.checked);
    });

    zipButton?.addEventListener("click", async () => {
      const currentDiscovery = getCurrentDiscovery();
      const selectedResources = getSelectedResources(modal, currentDiscovery.downloadable);
      const convertibleResources = getConvertibleResources(selectedResources);
      const shouldConvert = Boolean(convertOption?.checked && convertibleResources.length > 0);

      if (zipButton.disabled || selectedResources.length === 0) {
        updateZipStatus(modal, "Select at least one file to download.", "warning");
        return;
      }

      zipButton.disabled = true;
      if (convertOption) {
        convertOption.disabled = true;
      }
      renderConversionProgressList(modal, shouldConvert ? convertibleResources : []);
      updateConversionStatus(modal, "", "neutral");
      updateZipStatus(
        modal,
        shouldConvert
          ? `Converting ${convertibleResources.length} slide deck${convertibleResources.length === 1 ? "" : "s"} before packaging...`
          : `Packaging ${selectedResources.length} selected file${selectedResources.length === 1 ? "" : "s"} into one ZIP...`,
        "neutral"
      );

      try {
        const response = await buildArchiveWithOptionalConversion(selectedResources, shouldConvert, {
          onConversionStart(resources) {
            updateConversionStatus(modal, `Waiting for Microsoft sign-in to convert ${resources.length} slide deck${resources.length === 1 ? "" : "s"}...`, "neutral");
          },
          onOverallStatus(state, message) {
            updateConversionStatus(modal, message, "neutral");
          },
          onFileStatus(index, state, message) {
            updateConversionProgressItem(modal, index, state, message);
            updateConversionStatus(modal, message, state === "failed" ? "error" : state === "cleanup-warning" ? "warning" : "neutral");
          },
          onConversionError(error) {
            updateConversionStatus(modal, `${getConversionErrorMessage(error)} Keeping slide decks as original files.`, "warning");
          },
          onFetchStart(resourcesToFetch, convertedPdfFiles, failedConversionResources) {
            const convertedCount = convertedPdfFiles.length;
            const fallbackCount = failedConversionResources.length;
            const fallbackSuffix = fallbackCount > 0 ? ` ${fallbackCount} failed deck${fallbackCount === 1 ? " is" : "s are"} being kept as original files.` : "";
            updateZipStatus(
              modal,
              `Packaging ${convertedCount} converted PDF${convertedCount === 1 ? "" : "s"} with ${resourcesToFetch.length} other file${resourcesToFetch.length === 1 ? "" : "s"}...${fallbackSuffix}`,
              fallbackCount > 0 ? "warning" : "neutral"
            );
          }
        });

        if (!response) {
          updateZipStatus(modal, "ZIP builder is not available on this page.", "error");
          return;
        }

        if (!response.ok) {
          const failedCount = response?.results?.filter((result) => !result.ok).length ?? 0;
          const failureContext = failedCount > 0 ? ` ${failedCount} file request${failedCount === 1 ? "" : "s"} failed.` : "";
          updateZipStatus(modal, `ZIP download could not be created.${failureContext}`, "error");
          return;
        }

        triggerZipDownload(response.blob, currentDiscovery.courseFolderName);
        const successCount = response.fileCount ?? response.results.filter((result) => result.ok).length;
        const failureCount = response.results.filter((result) => !result.ok && !result.converted).length;
        const convertedCount = response.conversionResponse?.successCount ?? 0;
        const fallbackCount = response.fallbackCount ?? 0;
        const cleanupWarningCount = response.conversionResponse?.cleanupWarningCount ?? 0;
        const archiveName = `${discovery.courseFolderName}.zip`;
        const convertedSuffix = convertedCount > 0 ? ` ${convertedCount} slide deck${convertedCount === 1 ? " was" : "s were"} converted to PDF.` : "";
        const fallbackSuffix = fallbackCount > 0 ? ` ${fallbackCount} deck${fallbackCount === 1 ? " was" : "s were"} kept as original.` : "";
        const cleanupSuffix = cleanupWarningCount > 0 ? ` ${cleanupWarningCount} temporary OneDrive file${cleanupWarningCount === 1 ? "" : "s"} may remain.` : "";
        const failureSuffix = failureCount > 0 ? ` ${failureCount} file${failureCount === 1 ? "" : "s"} could not be added.` : "";
        updateZipStatus(
          modal,
          `${successCount} file${successCount === 1 ? "" : "s"} packed into ${archiveName}.${convertedSuffix}${fallbackSuffix}${cleanupSuffix}${failureSuffix}`,
          failureCount > 0 || fallbackCount > 0 || cleanupWarningCount > 0 ? "warning" : "success"
        );
      } catch (error) {
        updateZipStatus(modal, shouldConvert ? getConversionErrorMessage(error) : `ZIP download failed: ${error instanceof Error ? error.message : "unknown error"}.`, "error");
      } finally {
        updateSelectionSummary(modal);
        if (convertOption) {
          convertOption.disabled = convertibleResources.length === 0;
        }
      }
    });
  }

  // Creates or refreshes the modal. The modal lives under body so Moodle's
  // legacy table layout cannot clip it, but it is opened from the course pill.
  function ensureModal(discovery) {
    let modal = document.getElementById(MODAL_ID);

    if (!modal) {
      modal = document.createElement("div");
      modal.id = MODAL_ID;
      modal.className = "portal-cleaner-files-modal";
      modal.hidden = true;
      modal.innerHTML = `
        <div class="portal-cleaner-files-backdrop" data-portal-cleaner-files-close="true"></div>
        <section class="portal-cleaner-files-dialog" role="dialog" aria-modal="true" aria-labelledby="portal-cleaner-files-title">
          <header class="portal-cleaner-files-header">
            <div>
              <h2 id="portal-cleaner-files-title" class="portal-cleaner-files-title">Files</h2>
              <p class="portal-cleaner-files-summary"></p>
            </div>
            <button type="button" class="portal-cleaner-files-close" aria-label="Close files">x</button>
          </header>
          <div class="portal-cleaner-files-actions">
            <div class="portal-cleaner-files-action">
              <button type="button" class="portal-cleaner-files-action-button portal-cleaner-files-download-button">Download all files</button>
              <p class="portal-cleaner-files-zip-status" aria-live="polite"></p>
            </div>
            <div class="portal-cleaner-files-action">
              <label class="portal-cleaner-files-option">
                <input type="checkbox" class="portal-cleaner-files-convert-option">
                <span>Convert PPT/PPTX to PDF before zipping</span>
              </label>
              <label class="portal-cleaner-files-option">
                <input type="checkbox" class="portal-cleaner-files-select-all-option">
                <span>Select all files</span>
              </label>
              <p class="portal-cleaner-files-conversion-status" aria-live="polite"></p>
            </div>
          </div>
          <ul class="portal-cleaner-files-conversion-list"></ul>
          <div class="portal-cleaner-files-list"></div>
        </section>
      `;

      modal.addEventListener("click", (event) => {
        if (event.target?.dataset?.portalCleanerFilesClose === "true") {
          closeModal(modal);
        }
      });

      modal.querySelector(".portal-cleaner-files-close")?.addEventListener("click", () => {
        closeModal(modal);
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !modal.hidden) {
          closeModal(modal);
        }
      });

      document.body.appendChild(modal);
    }

    const zipButton = modal.querySelector(".portal-cleaner-files-download-button");
    const convertOption = modal.querySelector(".portal-cleaner-files-convert-option");
    const convertAction = convertOption?.closest(".portal-cleaner-files-action");

    syncSelectionState(modal, discovery.downloadable);
    zipButton.disabled = getSelectedResources(modal, discovery.downloadable).length === 0;
    if (convertAction) {
      convertAction.hidden = discovery.downloadable.length === 0;
    }

    bindModalActions(modal, discovery);
    renderFileList(modal, discovery.downloadable);
    updateSelectionSummary(modal);

    return modal;
  }

  // Public entrypoint called by content.js after resource discovery. It keeps
  // content.js aligned with the README architecture: discover, then delegate.
  function render(discovery) {
    const firstWeekContent = document.querySelector('tr.section.main[id^="section-"] > td.content');

    if (!firstWeekContent) {
      return;
    }

    let container = document.getElementById(TOOL_CONTAINER_ID);
    const modal = ensureModal(discovery);
    const downloadableCount = discovery.downloadable.length;
    const convertibleCount = getConvertibleResources(discovery.downloadable).length;

    if (!container) {
      container = document.createElement("div");
      container.id = TOOL_CONTAINER_ID;
      container.className = "portal-cleaner-file-tools";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "portal-cleaner-file-tool-button";
      button.appendChild(createFileToolIcon());

      const label = document.createElement("span");
      label.className = "portal-cleaner-file-tool-label";
      label.textContent = "Files";
      button.appendChild(label);

      const count = document.createElement("span");
      count.className = "portal-cleaner-file-tool-count";
      button.appendChild(count);

      button.addEventListener("click", () => {
        openModal(modal);
      });

      container.appendChild(button);
      firstWeekContent.prepend(container);
    }

    const count = container.querySelector(".portal-cleaner-file-tool-count");
    count.textContent = String(downloadableCount);
    count.title = `${downloadableCount} downloadable file${downloadableCount === 1 ? "" : "s"}${convertibleCount > 0 ? `, ${convertibleCount} convertible slide deck${convertibleCount === 1 ? "" : "s"}` : ""}`;
  }

  window.PortalCleanerFileTools = {
    render
  };
})();
