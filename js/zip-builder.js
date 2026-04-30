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

  function computeCrc32(bytes) {
    let crc = 0xFFFFFFFF;

    for (const byte of bytes) {
      crc = crc32Table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

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

  // Fetch resources through the logged-in page context, collect the successful
  // responses, and then package them into one ZIP archive for a single save.
  async function buildArchive(resources) {
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
        files.push({
          path: fileName,
          bytes,
          crc32: computeCrc32(bytes)
        });
        results.push({
          ok: true,
          title: resource.title,
          href: resource.href,
          fileName
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

    if (files.length === 0) {
      return {
        ok: false,
        reason: "no-files-fetched",
        results
      };
    }

    return {
      ok: true,
      results,
      blob: buildStoredZip(files)
    };
  }

  window.PortalCleanerZipBuilder = {
    buildArchive,
    sanitizeFileName
  };
})();
