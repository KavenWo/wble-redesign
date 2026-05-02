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

  function normalizeExtension(format) {
    // Resource discovery stores formats as labels. Keep the real file extension
    // explicit because Graph conversion depends on OneDrive recognizing the
    // uploaded item as a PowerPoint file.
    const normalized = String(format ?? "").toLowerCase();
    return normalized === "ppt" ? "ppt" : "pptx";
  }

  function createJobId() {
    // Temporary OneDrive filenames include entropy so repeated conversions of
    // similarly named lecture decks cannot overwrite each other.
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function sanitizeFileName(title, format, index) {
    // Reuse the resource-discovery filename rules so downloaded PDFs match the
    // existing ZIP names students already see.
    const fallback = `slides-${index + 1}`;
    const extension = normalizeExtension(format);
    const safeTitle = window.PortalCleanerResourceDiscovery?.slugifyPathSegment(title, fallback) ?? fallback;
    const withoutOfficeExtension = safeTitle.replace(/\.(pptx?|pdf)$/iu, "");

    return `${withoutOfficeExtension || fallback}.${extension}`;
  }

  function createPdfFileName(sourceFileName) {
    return sourceFileName.replace(/\.(pptx?|pdf)$/iu, "") + ".pdf";
  }

  function createGraphPathFileName(sourceFileName) {
    // The Graph-facing name is intentionally more unique than the final local
    // PDF name because it only exists briefly in the student's OneDrive app
    // folder.
    return `wble-${Date.now()}-${createJobId()}-${sourceFileName}`;
  }

  async function graphFetch(pathOrUrl, options = {}) {
    // Centralize Microsoft Graph auth and transient retry behavior. Conversion
    // runs sequentially, but Graph can still throttle or temporarily fail.
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

  async function parseGraphError(response, fallback) {
    // Graph usually returns useful JSON errors. Preserve those messages so the
    // UI can show actionable consent/quota/conversion failures.
    try {
      const payload = await response.json();
      return payload?.error?.message || payload?.error_description || fallback;
    } catch {
      return fallback;
    }
  }

  async function fetchWbleResource(resource) {
    // Keep WBLE downloads in the page context with the active Moodle cookies,
    // matching the existing ZIP builder behavior.
    const response = await fetch(resource.href, {
      credentials: "include",
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`WBLE download failed with HTTP ${response.status}.`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async function simpleUpload(graphFileName, bytes) {
    // Microsoft Graph simple upload is limited to small files. Larger lecture
    // decks must use an upload session below.
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

  async function createUploadSession(graphFileName) {
    // Upload sessions let OneDrive accept large PPT/PPTX files in chunks and
    // are the safer path for image-heavy lecture decks.
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

  function uploadToOneDrive(graphFileName, bytes) {
    // Route by size so small slides stay fast while large decks remain reliable.
    if (bytes.length <= SIMPLE_UPLOAD_LIMIT_BYTES) {
      return simpleUpload(graphFileName, bytes);
    }

    return uploadWithSession(graphFileName, bytes);
  }

  async function exportDriveItemToPdf(itemId) {
    // This is the high-fidelity step: Microsoft renders the PowerPoint file
    // from OneDrive and returns the PDF bytes.
    const response = await graphFetch(`/me/drive/items/${encodeURIComponent(itemId)}/content?format=pdf`, {
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(await parseGraphError(response, `Microsoft conversion failed with HTTP ${response.status}.`));
    }

    return response.blob();
  }

  async function deleteDriveItem(itemId) {
    // Cleanup is best-effort but important for privacy. A 404 still counts as
    // clean because the temporary item is already gone.
    const response = await graphFetch(`/me/drive/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE"
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(await parseGraphError(response, `OneDrive cleanup failed with HTTP ${response.status}.`));
    }
  }

  function triggerPdfDownload(blob, fileName) {
    // Use a local object URL so the generated PDF behaves like a normal browser
    // download and never needs to pass through an external backend.
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

  function isConvertible(resource) {
    // Keep v1 deliberately narrow. Other Office formats can be added after the
    // PowerPoint path proves stable for engineering lecture slides.
    return ["PPT", "PPTX"].includes(String(resource?.format ?? "").toUpperCase());
  }

  async function convertResource(resource, index, callbacks) {
    const sourceFileName = sanitizeFileName(resource.title, resource.format, index);
    const pdfFileName = createPdfFileName(sourceFileName);
    const graphFileName = createGraphPathFileName(sourceFileName);
    let itemId = null;
    let cleanupWarning = null;

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

      callbacks?.onFileStatus?.(index, "saving", `Saving ${pdfFileName}...`);
      triggerPdfDownload(pdfBlob, pdfFileName);
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
        ? `${pdfFileName} downloaded, but a temporary OneDrive file may remain.`
        : `${pdfFileName} downloaded.`
    );

    return {
      ok: true,
      title: resource.title,
      sourceFileName,
      pdfFileName,
      cleanupWarning
    };
  }

  async function convertResources(resources, callbacks = {}) {
    // Sequential conversion keeps progress readable and reduces the chance of
    // OneDrive quota spikes or Graph throttling during a bulk lecture download.
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
        const result = await convertResource(resource, index, callbacks);
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

  window.PortalCleanerOneDriveConverter = {
    convertResources,
    isConvertible
  };
})();
