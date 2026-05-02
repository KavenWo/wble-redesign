/* ==========================================================================
   OneDrive Converter Module
   ==========================================================================
   Converts WBLE PPT/PPTX downloads to PDFs by using the student's Microsoft
   account and Microsoft Graph. Files are uploaded into the user's OneDrive app
   root, exported as PDF, downloaded locally, then removed from OneDrive.
   ========================================================================== */

(function initPortalCleanerOneDriveConverter() {
  const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
  const SIMPLE_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;
  const UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;
  const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

  function sleep(milliseconds) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, milliseconds);
    });
  }

  // Converts discovery's display format into the real extension Microsoft
  // Graph needs in order to recognize the uploaded item as a PowerPoint file.
  function normalizeExtension(format) {
    const normalized = String(format ?? "").toLowerCase();
    return normalized === "ppt" ? "ppt" : "pptx";
  }

  // Adds entropy to temporary OneDrive filenames so repeated conversions of
  // similarly named lecture decks cannot overwrite each other.
  function createJobId() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // Creates a safe local source filename before upload. This reuses discovery's
  // filename rules so PDFs match the archive names students already see.
  function sanitizeFileName(title, format, index) {
    const fallback = `slides-${index + 1}`;
    const extension = normalizeExtension(format);
    const safeTitle = window.PortalCleanerResourceDiscovery?.slugifyPathSegment(title, fallback) ?? fallback;
    const withoutOfficeExtension = safeTitle.replace(/\.(pptx?|pdf)$/iu, "");

    return `${withoutOfficeExtension || fallback}.${extension}`;
  }

  function createPdfFileName(sourceFileName) {
    return sourceFileName.replace(/\.(pptx?|pdf)$/iu, "") + ".pdf";
  }

  // Creates the temporary filename used in OneDrive. It is intentionally more
  // unique than the final PDF name because it only exists in the app folder.
  function createGraphPathFileName(sourceFileName) {
    return `wble-${Date.now()}-${createJobId()}-${sourceFileName}`;
  }

  // Wrapper for Microsoft Graph calls. It attaches auth, accepts relative Graph
  // paths, and retries transient responses that are common during conversion.
  async function graphFetch(pathOrUrl, options = {}) {
    const token = await window.PortalCleanerOneDriveAuth.getAccessToken({ interactive: true });
    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH_ROOT}${pathOrUrl}`;
    const headers = new Headers(options.headers ?? {});

    headers.set("Authorization", `Bearer ${token}`);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === 3) {
        return response;
      }

      const retryAfter = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
      // Respect Graph's Retry-After header when present; otherwise use a small
      // exponential backoff so students do not have to manually retry every
      // temporary Graph hiccup.
      const delay = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : 600 * (2 ** attempt);

      await sleep(delay);
    }

    throw new Error("Microsoft Graph request could not complete.");
  }

  // Extracts useful Graph error text where available so the UI can show
  // actionable consent, quota, upload, or conversion failures.
  async function parseGraphError(response, fallback) {
    try {
      const payload = await response.json();
      return payload?.error?.message || payload?.error_description || fallback;
    } catch {
      return fallback;
    }
  }

  // Downloads the original slide deck from WBLE in the page context so Moodle's
  // active cookies/session can be reused by the converter.
  async function fetchWbleResource(resource) {
    const response = await fetch(resource.href, {
      credentials: "include",
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`WBLE download failed with HTTP ${response.status}.`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  // Uploads small decks directly to the user's OneDrive app folder. Microsoft
  // Graph limits this endpoint, so larger decks use upload sessions instead.
  async function simpleUpload(graphFileName, bytes) {
    const endpoint = `/me/drive/special/approot:/${encodeURIComponent(graphFileName)}:/content`;
    const response = await graphFetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      },
      body: bytes
    });

    if (!response.ok) {
      throw new Error(await parseGraphError(response, `OneDrive upload failed with HTTP ${response.status}.`));
    }

    return response.json();
  }

  // Starts a chunked upload session for large or image-heavy lecture decks.
  // The session URL is then used directly by uploadWithSession.
  async function createUploadSession(graphFileName) {
    const endpoint = `/me/drive/special/approot:/${encodeURIComponent(graphFileName)}:/createUploadSession`;
    const response = await graphFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        item: {
          "@microsoft.graph.conflictBehavior": "replace"
        }
      })
    });

    if (!response.ok) {
      throw new Error(await parseGraphError(response, `Upload session failed with HTTP ${response.status}.`));
    }

    return response.json();
  }

  // Uploads large decks in chunks and returns the final OneDrive DriveItem.
  // Graph only returns that item after the last chunk is accepted.
  async function uploadWithSession(graphFileName, bytes) {
    const session = await createUploadSession(graphFileName);
    let uploadedItem = null;

    for (let start = 0; start < bytes.length; start += UPLOAD_CHUNK_BYTES) {
      // The final upload-session response contains the created DriveItem. Until
      // then Graph returns 202 to indicate the next byte range it expects.
      const end = Math.min(start + UPLOAD_CHUNK_BYTES, bytes.length) - 1;
      const chunk = bytes.slice(start, end + 1);
      const response = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(chunk.length),
          "Content-Range": `bytes ${start}-${end}/${bytes.length}`
        },
        body: chunk
      });

      if (response.status === 202) {
        continue;
      }

      if (!response.ok && response.status !== 201 && response.status !== 200) {
        throw new Error(await parseGraphError(response, `OneDrive chunk upload failed with HTTP ${response.status}.`));
      }

      uploadedItem = await response.json();
    }

    if (!uploadedItem?.id) {
      throw new Error("OneDrive upload session finished without a file id.");
    }

    return uploadedItem;
  }

  // Routes each deck to the fastest reliable upload path based on size.
  function uploadToOneDrive(graphFileName, bytes) {
    if (bytes.length <= SIMPLE_UPLOAD_LIMIT_BYTES) {
      return simpleUpload(graphFileName, bytes);
    }

    return uploadWithSession(graphFileName, bytes);
  }

  // Asks Microsoft Graph to render the uploaded PowerPoint as a PDF. This keeps
  // conversion fidelity close to what students would get from Microsoft apps.
  async function exportDriveItemToPdf(itemId) {
    const response = await graphFetch(`/me/drive/items/${encodeURIComponent(itemId)}/content?format=pdf`, {
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(await parseGraphError(response, `Microsoft conversion failed with HTTP ${response.status}.`));
    }

    return response.blob();
  }

  // Removes the temporary OneDrive file. Cleanup is best-effort but important
  // for privacy; 404 is fine because the item is already gone.
  async function deleteDriveItem(itemId) {
    const response = await graphFetch(`/me/drive/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE"
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(await parseGraphError(response, `OneDrive cleanup failed with HTTP ${response.status}.`));
    }
  }

  // Legacy standalone PDF download path. The combined ZIP flow bypasses this
  // by requesting archive-mode conversion with download:false.
  function triggerPdfDownload(blob, fileName) {
    const downloadLink = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);

    downloadLink.href = objectUrl;
    downloadLink.download = fileName;
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }

  // Central source of truth for which WBLE resources are safe to send through
  // the PowerPoint-to-PDF converter.
  function isConvertible(resource) {
    return ["PPT", "PPTX"].includes(String(resource?.format ?? "").toUpperCase());
  }

  // Converts a single deck through WBLE -> OneDrive -> Graph PDF export. The
  // legacy standalone flow downloads each PDF; archive mode returns PDF bytes.
  async function convertResource(resource, index, callbacks, options = {}) {
    const shouldDownload = options.download !== false;
    const sourceFileName = sanitizeFileName(resource.title, resource.format, index);
    const pdfFileName = createPdfFileName(sourceFileName);
    const graphFileName = createGraphPathFileName(sourceFileName);
    let itemId = null;
    let cleanupWarning = null;
    let pdfBytes = null;

    callbacks?.onFileStatus?.(index, "downloading", `Downloading ${sourceFileName} from WBLE...`);
    const bytes = await fetchWbleResource(resource);

    try {
      // Track itemId only after upload succeeds so the finally block never tries
      // to delete a non-existent OneDrive item.
      callbacks?.onFileStatus?.(index, "uploading", `Uploading ${sourceFileName} to OneDrive...`);
      const uploadedItem = await uploadToOneDrive(graphFileName, bytes);
      itemId = uploadedItem.id;

      callbacks?.onFileStatus?.(index, "converting", `Converting ${sourceFileName} with Microsoft...`);
      const pdfBlob = await exportDriveItemToPdf(itemId);

      if (shouldDownload) {
        callbacks?.onFileStatus?.(index, "saving", `Saving ${pdfFileName}...`);
        triggerPdfDownload(pdfBlob, pdfFileName);
      } else {
        // Keep the generated PDF in memory only long enough for ZIP packaging.
        // This avoids one browser save prompt per converted slide deck.
        callbacks?.onFileStatus?.(index, "packing", `Preparing ${pdfFileName} for ZIP...`);
        pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
      }
    } finally {
      if (itemId) {
        try {
          // Do not fail the whole conversion after the PDF has already been
          // downloaded. Surface cleanup failures as warnings instead.
          callbacks?.onFileStatus?.(index, "cleanup", `Cleaning up ${sourceFileName} from OneDrive...`);
          await deleteDriveItem(itemId);
        } catch (error) {
          cleanupWarning = error instanceof Error ? error.message : "OneDrive cleanup failed.";
        }
      }
    }

    callbacks?.onFileStatus?.(
      index,
      cleanupWarning ? "cleanup-warning" : "done",
      cleanupWarning
        ? `${pdfFileName} ${shouldDownload ? "downloaded" : "converted"}, but a temporary OneDrive file may remain.`
        : `${pdfFileName} ${shouldDownload ? "downloaded" : "converted"}.`
    );

    return {
      ok: true,
      title: resource.title,
      sourceFileName,
      pdfFileName,
      bytes: pdfBytes,
      cleanupWarning
    };
  }

  // Converts every eligible deck and returns ordered per-file results. This is
  // intentionally sequential to avoid OneDrive quota spikes, Graph throttling,
  // and high memory use from holding multiple PPT/PDF byte arrays at once.
  async function convertResources(resources, callbacks = {}, options = {}) {
    const convertible = resources.filter(isConvertible);
    const results = [];

    if (convertible.length === 0) {
      return {
        ok: false,
        reason: "no-convertible-files",
        results
      };
    }

    callbacks.onOverallStatus?.("auth", "Waiting for Microsoft sign-in...");
    await window.PortalCleanerOneDriveAuth.getAccessToken({ interactive: true });

    for (let index = 0; index < convertible.length; index += 1) {
      const resource = convertible[index];

      try {
        const result = await convertResource(resource, index, callbacks, options);
        results.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Conversion failed.";
        callbacks.onFileStatus?.(index, "failed", `${resource.title}: ${message}`);
        results.push({
          ok: false,
          title: resource.title,
          error: message
        });
      }
    }

    const successCount = results.filter((result) => result.ok).length;
    const cleanupWarningCount = results.filter((result) => result.cleanupWarning).length;

    return {
      ok: successCount > 0,
      results,
      successCount,
      failureCount: results.length - successCount,
      cleanupWarningCount
    };
  }

  // Archive entrypoint used by "Download all files" when the user opts into PDF
  // conversion. It shares the converter path but suppresses individual saves.
  function convertResourcesForArchive(resources, callbacks = {}) {
    return convertResources(resources, callbacks, { download: false });
  }

  window.PortalCleanerOneDriveConverter = {
    convertResources,
    convertResourcesForArchive,
    isConvertible
  };
})();
