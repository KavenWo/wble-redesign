/* ==========================================================================
   ZIP Builder Module
   ==========================================================================
   Creates ZIP archives directly in the page context so authenticated Moodle
   downloads can reuse the active browser session. It handles byte assembly,
   CRC calculation, and archive packaging for bulk resource downloads.
   ========================================================================== */

// Build ZIP archives on the page side so authenticated Moodle fetches can use
// the active site session instead of the extension worker context.
(function initPortalCleanerZipBuilder() {
  const CATEGORY_FOLDER_NAMES = {
    lecture: "Lecture",
    tutorial: "Tutorial",
    lab: "Lab",
    assignment: "Assignment",
    cover: "Cover",
    reference: "Reference",
    assessment: "Assessment",
    results: "Results"
  };

  function encodeUtf8(value) {
    return new TextEncoder().encode(value);
  }

  function concatUint8Arrays(chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;

    chunks.forEach((chunk) => {
      merged.set(chunk, offset);
      offset += chunk.length;
    });

    return merged;
  }

  const crc32Table = (() => {
    const table = new Uint32Array(256);

    for (let index = 0; index < 256; index += 1) {
      let value = index;

      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      }

      table[index] = value >>> 0;
    }

    return table;
  })();

  // Computes the checksum required by the ZIP file format for each stored file.
  function computeCrc32(bytes) {
    let crc = 0xFFFFFFFF;

    for (const byte of bytes) {
      crc = crc32Table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // Encodes timestamps using the DOS date/time fields expected by ZIP headers.
  function createDosDateTimeParts(date) {
    const safeYear = Math.max(1980, date.getFullYear());
    const dosTime =
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2);
    const dosDate =
      ((safeYear - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate();

    return {
      dosTime: dosTime & 0xFFFF,
      dosDate: dosDate & 0xFFFF
    };
  }

  function setUint16(view, offset, value) {
    view.setUint16(offset, value, true);
  }

  function setUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  // Preserve readable names inside the archive while still producing
  // filesystem-safe entries across Windows and macOS unzip tools.
  function sanitizeFileName(title, format, index) {
    const fallback = `file-${index + 1}`;
    const safeTitle = window.PortalCleanerResourceDiscovery?.slugifyPathSegment(title, fallback) ?? fallback;
    const normalizedFormat = String(format ?? "").toLowerCase();
    const extension = /^[a-z0-9]{2,5}$/i.test(normalizedFormat) ? normalizedFormat : "bin";

    if (safeTitle.toLowerCase().endsWith(`.${extension}`)) {
      return safeTitle;
    }

    return `${safeTitle}.${extension}`;
  }

  // Builds the final ZIP entry path for a resource. Known categories get
  // folder prefixes, while generic "file" resources stay at the archive root
  // so uncategorized material remains visible to students.
  function createArchivePath(resource, fileName) {
    const category = String(resource?.category ?? "file").toLowerCase();
    const folderName = CATEGORY_FOLDER_NAMES[category];

    if (!folderName) {
      return fileName;
    }

    return `${folderName}/${fileName}`;
  }

  // Deduplicates archive paths. Conversion can turn similarly named PPT/PPTX
  // files into identical PDF names, and ZIP tools may hide shadowed entries.
  function createUniquePath(path, usedPaths) {
    const normalizedPath = String(path || "file").trim() || "file";
    const dotIndex = normalizedPath.lastIndexOf(".");
    const baseName = dotIndex > 0 ? normalizedPath.slice(0, dotIndex) : normalizedPath;
    const extension = dotIndex > 0 ? normalizedPath.slice(dotIndex) : "";
    let candidate = normalizedPath;
    let suffix = 2;

    while (usedPaths.has(candidate.toLowerCase())) {
      candidate = `${baseName} (${suffix})${extension}`;
      suffix += 1;
    }

    usedPaths.add(candidate.toLowerCase());
    return candidate;
  }

  // Builds an uncompressed ZIP blob from prepared file entries. We store files
  // instead of compressing them to keep the implementation dependency-free.
  function buildStoredZip(files) {
    const localFileChunks = [];
    const centralDirectoryChunks = [];
    let currentOffset = 0;
    const now = createDosDateTimeParts(new Date());

    files.forEach((file) => {
      const fileNameBytes = encodeUtf8(file.path);
      const localHeader = new ArrayBuffer(30);
      const localView = new DataView(localHeader);

      setUint32(localView, 0, 0x04034B50);
      setUint16(localView, 4, 20);
      setUint16(localView, 6, 0x0800);
      setUint16(localView, 8, 0);
      setUint16(localView, 10, now.dosTime);
      setUint16(localView, 12, now.dosDate);
      setUint32(localView, 14, file.crc32);
      setUint32(localView, 18, file.bytes.length);
      setUint32(localView, 22, file.bytes.length);
      setUint16(localView, 26, fileNameBytes.length);
      setUint16(localView, 28, 0);

      const localHeaderBytes = new Uint8Array(localHeader);
      localFileChunks.push(localHeaderBytes, fileNameBytes, file.bytes);

      const centralHeader = new ArrayBuffer(46);
      const centralView = new DataView(centralHeader);
      setUint32(centralView, 0, 0x02014B50);
      setUint16(centralView, 4, 20);
      setUint16(centralView, 6, 20);
      setUint16(centralView, 8, 0x0800);
      setUint16(centralView, 10, 0);
      setUint16(centralView, 12, now.dosTime);
      setUint16(centralView, 14, now.dosDate);
      setUint32(centralView, 16, file.crc32);
      setUint32(centralView, 20, file.bytes.length);
      setUint32(centralView, 24, file.bytes.length);
      setUint16(centralView, 28, fileNameBytes.length);
      setUint16(centralView, 30, 0);
      setUint16(centralView, 32, 0);
      setUint16(centralView, 34, 0);
      setUint16(centralView, 36, 0);
      setUint32(centralView, 38, 0);
      setUint32(centralView, 42, currentOffset);

      centralDirectoryChunks.push(new Uint8Array(centralHeader), fileNameBytes);
      currentOffset += localHeaderBytes.length + fileNameBytes.length + file.bytes.length;
    });

    const centralDirectory = concatUint8Arrays(centralDirectoryChunks);
    const endRecord = new ArrayBuffer(22);
    const endView = new DataView(endRecord);
    setUint32(endView, 0, 0x06054B50);
    setUint16(endView, 4, 0);
    setUint16(endView, 6, 0);
    setUint16(endView, 8, files.length);
    setUint16(endView, 10, files.length);
    setUint32(endView, 12, centralDirectory.length);
    setUint32(endView, 16, currentOffset);
    setUint16(endView, 20, 0);

    return new Blob([
      concatUint8Arrays(localFileChunks),
      centralDirectory,
      new Uint8Array(endRecord)
    ], { type: "application/zip" });
  }

  // Shared archive path for both fetched WBLE resources and generated PDFs.
  // Callers can assemble mixed file sources, then hand them here for ZIP I/O.
  function buildArchiveFromFiles(files, results = []) {
    const usedPaths = new Set();
    const archiveFiles = files
      .filter((file) => file?.bytes?.length > 0)
      .map((file) => {
        const path = createUniquePath(file.path, usedPaths);

        return {
          path,
          bytes: file.bytes,
          crc32: computeCrc32(file.bytes)
        };
      });

    if (archiveFiles.length === 0) {
      return {
        ok: false,
        reason: "no-files-fetched",
        results
      };
    }

    return {
      ok: true,
      fileCount: archiveFiles.length,
      results,
      blob: buildStoredZip(archiveFiles)
    };
  }

  // Fetches original WBLE resources and returns ZIP-ready file entries plus
  // per-resource status. It does not build the ZIP so callers can mix sources.
  async function collectResourceFiles(resources) {
    const files = [];
    const results = [];

    for (let index = 0; index < resources.length; index += 1) {
      const resource = resources[index];

      try {
        const response = await fetch(resource.href, {
          credentials: "include",
          redirect: "follow"
        });

        if (!response.ok) {
          results.push({
            ok: false,
            title: resource.title,
            href: resource.href,
            error: `http-${response.status}`
          });
          continue;
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        const fileName = sanitizeFileName(resource.title, resource.format, index);
        const path = createArchivePath(resource, fileName);
        files.push({
          path,
          bytes
        });
        results.push({
          ok: true,
          title: resource.title,
          href: resource.href,
          fileName,
          path
        });
      } catch (error) {
        results.push({
          ok: false,
          title: resource.title,
          href: resource.href,
          error: error instanceof Error ? error.message : "fetch-failed"
        });
      }
    }

    return { files, results };
  }

  // Backward-compatible one-step ZIP builder for callers that only need to
  // package original WBLE files without converted/generated entries.
  async function buildArchive(resources) {
    const { files, results } = await collectResourceFiles(resources);

    return buildArchiveFromFiles(files, results);
  }

  window.PortalCleanerZipBuilder = {
    buildArchive,
    buildArchiveFromFiles,
    collectResourceFiles,
    createArchivePath,
    sanitizeFileName
  };
})();
