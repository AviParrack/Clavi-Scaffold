(function () {
  'use strict';

  // ── 1. Config & State ──────────────────────────────────────────────

  const CONFIG = {
    HOVER_DELAY: 100,
    VELOCITY_THRESHOLD: 100,
    EXPAND_SCALE: 1.6,
    HOVER_BOOST: 8,
    MAX_PROPAGATION_DEPTH: 6,
  };

  const STATE = {
    files: [],           // { file, title, ext, typeInfo, size, objectUrl }
    cells: [],           // DOM elements
    layout: [],          // { x, y, width, height }
    sortedIndices: [],   // sorted position → original index
    stablePositions: [], // base layout for chaotic hit detection
    mode: 'stable',      // 'stable' | 'chaotic'
    sort: 'name',        // 'name' | 'type' | 'size' | 'hue' | 'brightness'
    sortReversed: false,
    hoveredIndex: -1,
    hoverTimer: null,
    lastMousePos: { x: 0, y: 0 },
    mouseVelocity: 0,
    viewerOpen: false,
    viewerFileIndex: -1,
    totalDepth: 1,
  };

  // ── 2. File Type Detection ─────────────────────────────────────────

  const FILE_TYPES = {
    // Documents
    pdf:  { type: 'pdf',   label: 'PDF',   color: '#e74c3c' },
    // Images
    png:  { type: 'image', label: 'PNG',   color: '#3498db' },
    jpg:  { type: 'image', label: 'JPG',   color: '#3498db' },
    jpeg: { type: 'image', label: 'JPEG',  color: '#3498db' },
    gif:  { type: 'image', label: 'GIF',   color: '#3498db' },
    webp: { type: 'image', label: 'WEBP',  color: '#3498db' },
    svg:  { type: 'image', label: 'SVG',   color: '#3498db' },
    bmp:  { type: 'image', label: 'BMP',   color: '#3498db' },
    ico:  { type: 'image', label: 'ICO',   color: '#3498db' },
    // Video
    mp4:  { type: 'video', label: 'MP4',   color: '#9b59b6' },
    webm: { type: 'video', label: 'WEBM',  color: '#9b59b6' },
    ogv:  { type: 'video', label: 'OGV',   color: '#9b59b6' },
    mov:  { type: 'video', label: 'MOV',   color: '#9b59b6' },
    // Audio
    mp3:  { type: 'audio', label: 'MP3',   color: '#e67e22' },
    wav:  { type: 'audio', label: 'WAV',   color: '#e67e22' },
    ogg:  { type: 'audio', label: 'OGG',   color: '#e67e22' },
    flac: { type: 'audio', label: 'FLAC',  color: '#e67e22' },
    aac:  { type: 'audio', label: 'AAC',   color: '#e67e22' },
    // Text / code
    txt:  { type: 'text',  label: 'TXT',   color: '#2ecc71' },
    md:   { type: 'markdown', label: 'MD', color: '#2ecc71' },
    json: { type: 'text',  label: 'JSON',  color: '#2ecc71' },
    xml:  { type: 'text',  label: 'XML',   color: '#2ecc71' },
    csv:  { type: 'text',  label: 'CSV',   color: '#2ecc71' },
    js:   { type: 'text',  label: 'JS',    color: '#2ecc71' },
    ts:   { type: 'text',  label: 'TS',    color: '#2ecc71' },
    css:  { type: 'text',  label: 'CSS',   color: '#2ecc71' },
    html: { type: 'text',  label: 'HTML',  color: '#2ecc71' },
    py:   { type: 'text',  label: 'PY',    color: '#2ecc71' },
    rb:   { type: 'text',  label: 'RB',    color: '#2ecc71' },
    java: { type: 'text',  label: 'JAVA',  color: '#2ecc71' },
    c:    { type: 'text',  label: 'C',     color: '#2ecc71' },
    cpp:  { type: 'text',  label: 'C++',   color: '#2ecc71' },
    h:    { type: 'text',  label: 'H',     color: '#2ecc71' },
    rs:   { type: 'text',  label: 'RS',    color: '#2ecc71' },
    go:   { type: 'text',  label: 'GO',    color: '#2ecc71' },
    sh:   { type: 'text',  label: 'SH',    color: '#2ecc71' },
    yaml: { type: 'text',  label: 'YAML',  color: '#2ecc71' },
    yml:  { type: 'text',  label: 'YML',   color: '#2ecc71' },
    toml: { type: 'text',  label: 'TOML',  color: '#2ecc71' },
    ini:  { type: 'text',  label: 'INI',   color: '#2ecc71' },
    log:  { type: 'text',  label: 'LOG',   color: '#2ecc71' },
  };

  const FALLBACK_TYPE = { type: 'other', label: 'FILE', color: '#95a5a6' };

  function getFileType(ext) {
    return FILE_TYPES[ext.toLowerCase()] || FALLBACK_TYPE;
  }

  // ── 2b. Color Helpers ──────────────────────────────────────────────

  // Returns { h: 0–360, s: 0–1, l: 0–1 } from r,g,b in 0–255
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: h * 360, s: s, l: l };
  }

  // Compute average hue (circular mean) and brightness from canvas pixel data
  function computeColorStats(ctx, w, h) {
    var data = ctx.getImageData(0, 0, w, h).data;
    var sinSum = 0, cosSum = 0;
    var brightnessSum = 0;
    var count = 0;
    // Sample every 4th pixel for speed
    var step = 4;
    for (var i = 0; i < data.length; i += 4 * step) {
      var r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 128) continue; // skip mostly-transparent pixels
      var hsl = rgbToHsl(r, g, b);
      // For circular mean of hue, use sin/cos
      var rad = hsl.h * Math.PI / 180;
      sinSum += Math.sin(rad);
      cosSum += Math.cos(rad);
      brightnessSum += hsl.l;
      count++;
    }
    if (count === 0) return { hue: 0, brightness: 0 };
    var avgHue = Math.atan2(sinSum / count, cosSum / count) * 180 / Math.PI;
    if (avgHue < 0) avgHue += 360;
    return { hue: avgHue, brightness: brightnessSum / count };
  }

  // ── 3. Filename Parsing ────────────────────────────────────────────

  function parseFilename(name) {
    const dotIdx = name.lastIndexOf('.');
    const base = dotIdx > 0 ? name.substring(0, dotIdx) : name;
    const ext = dotIdx > 0 ? name.substring(dotIdx + 1) : '';
    const title = base.replace(/[_\-]/g, ' ');
    return { title, ext };
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  // ── 3b. Lightweight Markdown Renderer ────────────────────────────

  function renderMarkdown(src) {
    // Work line-by-line, accumulating into HTML
    var html = '';
    var lines = src.replace(/\r\n/g, '\n').split('\n');
    var i = 0;
    var inList = false;   // 'ul' | 'ol' | false
    var inCode = false;
    var codeLang = '';
    var codeLines = [];

    function esc(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function inline(s) {
      s = esc(s);
      // images before links
      s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%">');
      // links
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
      // bold+italic
      s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
      s = s.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
      // bold
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
      // italic
      s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
      s = s.replace(/_(.+?)_/g, '<em>$1</em>');
      // inline code
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      // strikethrough
      s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
      return s;
    }

    function closeList() {
      if (inList === 'ul') html += '</ul>';
      else if (inList === 'ol') html += '</ol>';
      inList = false;
    }

    while (i < lines.length) {
      var line = lines[i];

      // Fenced code blocks
      if (/^```/.test(line)) {
        if (!inCode) {
          closeList();
          inCode = true;
          codeLang = line.slice(3).trim();
          codeLines = [];
          i++; continue;
        } else {
          html += '<pre><code' + (codeLang ? ' class="language-' + esc(codeLang) + '"' : '') + '>' + esc(codeLines.join('\n')) + '</code></pre>';
          inCode = false;
          codeLang = '';
          i++; continue;
        }
      }
      if (inCode) { codeLines.push(line); i++; continue; }

      // Blank line
      if (/^\s*$/.test(line)) { closeList(); i++; continue; }

      // Headings
      var hm = line.match(/^(#{1,6})\s+(.*)$/);
      if (hm) {
        closeList();
        var level = hm[1].length;
        html += '<h' + level + '>' + inline(hm[2]) + '</h' + level + '>';
        i++; continue;
      }

      // Horizontal rule
      if (/^(\*\*\*|---|___)/.test(line.trim())) {
        closeList();
        html += '<hr>';
        i++; continue;
      }

      // Blockquote
      if (/^>\s?/.test(line)) {
        closeList();
        var quoteLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        html += '<blockquote>' + renderMarkdown(quoteLines.join('\n')) + '</blockquote>';
        continue;
      }

      // Unordered list
      var ulm = line.match(/^[\s]*[-*+]\s+(.*)$/);
      if (ulm) {
        if (inList !== 'ul') { closeList(); html += '<ul>'; inList = 'ul'; }
        html += '<li>' + inline(ulm[1]) + '</li>';
        i++; continue;
      }

      // Ordered list
      var olm = line.match(/^[\s]*\d+[.)]\s+(.*)$/);
      if (olm) {
        if (inList !== 'ol') { closeList(); html += '<ol>'; inList = 'ol'; }
        html += '<li>' + inline(olm[1]) + '</li>';
        i++; continue;
      }

      // Paragraph
      closeList();
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !/^```/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !/^[-*+]\s/.test(lines[i]) && !/^\d+[.)]\s/.test(lines[i]) && !/^(\*\*\*|---|___)/.test(lines[i].trim())) {
        para.push(lines[i]);
        i++;
      }
      html += '<p>' + inline(para.join(' ')) + '</p>';
      continue;
    }

    closeList();
    // Close unclosed code fence
    if (inCode) {
      html += '<pre><code>' + esc(codeLines.join('\n')) + '</code></pre>';
    }
    return html;
  }

  // ── 4. Drop Zone ───────────────────────────────────────────────────

  const dropZone = document.getElementById('drop-zone');

  // Chromium on file:// can't read dropped folder contents (readEntries is blocked).
  // Detect and switch to browse-only UI.
  var needsBrowseOnly = location.protocol === 'file:' && !!window.chrome;

  function setupDropZone() {
    var folderInput = document.getElementById('folder-input');

    // Browse buttons (primary UI on Chrome+file://, fallback elsewhere)
    document.getElementById('btn-browse').addEventListener('click', function () {
      folderInput.click();
    });
    document.getElementById('btn-browse-main').addEventListener('click', function () {
      folderInput.click();
    });
    folderInput.addEventListener('change', function () {
      if (folderInput.files.length > 0) {
        ingestFiles(Array.from(folderInput.files));
      }
      folderInput.value = '';
    });

    // Swap to browse-only UI when drag-and-drop folders won't work
    if (needsBrowseOnly) {
      dropZone.classList.add('browse-only');
      return;
    }

    // ── Full drag-and-drop setup ──
    let dragCounter = 0;

    document.addEventListener('dragover', function (e) { e.preventDefault(); }, false);
    document.addEventListener('drop', function (e) { e.preventDefault(); }, false);

    dropZone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      dropZone.classList.add('active');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        dropZone.classList.remove('active');
      }
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      dropZone.classList.remove('active');

      const items = e.dataTransfer.items;
      if (!items || items.length === 0) return;
      extractFiles(items).then(ingestFiles);
    });
  }

  function extractFiles(items) {
    const fileList = [];
    const promises = [];

    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry
        ? items[i].webkitGetAsEntry()
        : null;
      if (entry) {
        promises.push(traverseEntry(entry, fileList));
      } else if (items[i].kind === 'file') {
        const f = items[i].getAsFile();
        if (f && !f.name.startsWith('.')) fileList.push(f);
      }
    }

    return Promise.all(promises).then(() => fileList);
  }

  function traverseEntry(entry, fileList) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((f) => {
          if (!f.name.startsWith('.')) fileList.push(f);
          resolve();
        }, function (err) {
          console.warn('Failed to read file entry:', entry.fullPath, err);
          resolve();
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        readAllEntries(reader, fileList).then(resolve);
      } else {
        resolve();
      }
    });
  }

  function readAllEntries(reader, fileList) {
    return new Promise((resolve) => {
      const batch = [];
      (function readBatch() {
        reader.readEntries((entries) => {
          if (entries.length === 0) {
            Promise.all(batch).then(resolve);
            return;
          }
          for (const entry of entries) {
            batch.push(traverseEntry(entry, fileList));
          }
          readBatch(); // Chrome returns max 100 per batch
        }, function (err) {
          console.warn('readEntries failed:', err);
          Promise.all(batch).then(resolve);
        });
      })();
    });
  }

  // ── 5. Ingestion ───────────────────────────────────────────────────

  const grid = document.getElementById('grid');
  const fileCount = document.getElementById('file-count');

  function ingestFiles(rawFiles) {
    // Clean up previous state
    resetState();

    STATE.files = rawFiles.map((file) => {
      const { title, ext } = parseFilename(file.name);
      return {
        file,
        title,
        ext,
        typeInfo: getFileType(ext),
        size: file.size,
        objectUrl: null,  // full-res, created lazily for viewer
        thumbUrl: null,   // small canvas thumbnail, created async
        snippet: null,    // text preview, loaded async
        aspectRatio: null, // width/height, set async for images
        avgHue: null,     // 0–360, set async for images
        avgBrightness: null, // 0–1, set async for images
      };
    });

    if (STATE.files.length === 0) return;

    STATE.totalDepth = Math.ceil(Math.log2(STATE.files.length)) + 1;

    // Show/hide color sort buttons based on whether images exist
    var hasImages = STATE.files.some(function (f) { return f.typeInfo.type === 'image'; });
    document.querySelectorAll('.sort-btn.color-sort').forEach(function (b) {
      b.classList.toggle('visible', hasImages);
    });

    // Transition UI: hide drop zone, show toolbar + grid
    dropZone.classList.add('hidden');
    fileCount.textContent = STATE.files.length + ' files';

    buildGrid();
    loadSnippets();
    loadThumbnails();
  }

  function resetState() {
    // Revoke any object URLs and thumbnails
    STATE.files.forEach((f) => {
      if (f.objectUrl) URL.revokeObjectURL(f.objectUrl);
      if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
    });

    STATE.files = [];
    STATE.cells = [];
    STATE.layout = [];
    STATE.sortedIndices = [];
    STATE.stablePositions = [];
    STATE.hoveredIndex = -1;
    STATE.viewerOpen = false;
    STATE.viewerFileIndex = -1;

    if (STATE.hoverTimer) {
      clearTimeout(STATE.hoverTimer);
      STATE.hoverTimer = null;
    }

    // Clear grid DOM
    const existing = grid.querySelectorAll('.cell');
    existing.forEach((el) => el.remove());

    // Clear viewer
    closeViewer();
  }

  function stripFrontMatter(text) {
    // YAML front matter: starts with --- on first line, ends with ---
    var m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    if (m) return text.slice(m[0].length);
    // TOML front matter: +++ ... +++
    var t = text.match(/^\+\+\+\r?\n[\s\S]*?\r?\n\+\+\+\r?\n?/);
    if (t) return text.slice(t[0].length);
    return text;
  }

  function stripMarkdownSyntax(text) {
    return text
      // headings: ## Foo → Foo
      .replace(/^#{1,6}\s+/gm, '')
      // bold/italic: ***x***, **x**, *x*, __x__, _x_
      .replace(/\*{1,3}(.+?)\*{1,3}/g, '$1')
      .replace(/_{1,3}(.+?)_{1,3}/g, '$1')
      // strikethrough
      .replace(/~~(.+?)~~/g, '$1')
      // inline code
      .replace(/`([^`]+)`/g, '$1')
      // images ![alt](url) → alt
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // links [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // list markers: - item, * item, + item, 1. item
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+[.)]\s+/gm, '')
      // blockquote markers
      .replace(/^>\s?/gm, '')
      // horizontal rules
      .replace(/^(\*\*\*|---|___)\s*$/gm, '')
      // collapse multiple blank lines
      .replace(/\n{3,}/g, '\n\n');
  }

  function loadSnippets() {
    var READ_LEN = 1500;
    var SNIPPET_LEN = 300;
    STATE.files.forEach(function (entry, i) {
      var t = entry.typeInfo.type;
      if (t !== 'text' && t !== 'markdown') return;

      var slice = entry.file.slice(0, READ_LEN);
      var reader = new FileReader();
      reader.onload = function () {
        var raw = reader.result;
        if (t === 'markdown') {
          raw = stripFrontMatter(raw);
          raw = stripMarkdownSyntax(raw);
        }
        raw = raw.replace(/^\s+/, '');
        entry.snippet = raw.slice(0, SNIPPET_LEN);
        var cell = STATE.cells[i];
        if (cell) {
          var el = cell.querySelector('.cell-snippet');
          if (el) el.textContent = entry.snippet;
        }
      };
      reader.readAsText(slice);
    });
  }

  // Generate small canvas thumbnails for image files, processed in batches
  var THUMB_MAX = 200;     // max thumbnail dimension in px
  var THUMB_QUALITY = 0.6; // JPEG quality
  var THUMB_BATCH = 4;     // concurrent loads

  function loadThumbnails() {
    var queue = [];
    STATE.files.forEach(function (entry, i) {
      if (entry.typeInfo.type === 'image') queue.push(i);
    });

    function processNext() {
      if (queue.length === 0) return;
      var batch = queue.splice(0, THUMB_BATCH);
      var pending = batch.length;

      batch.forEach(function (idx) {
        var entry = STATE.files[idx];
        if (!entry) { if (--pending === 0) processNext(); return; }

        var tempUrl = URL.createObjectURL(entry.file);
        var img = new Image();
        img.onload = function () {
          // Compute scaled dimensions
          var w = img.naturalWidth;
          var h = img.naturalHeight;
          if (w === 0 || h === 0) { cleanup(); return; }

          // Store aspect ratio for layout
          entry.aspectRatio = w / h;

          var scale = Math.min(THUMB_MAX / w, THUMB_MAX / h, 1);
          var tw = Math.round(w * scale);
          var th = Math.round(h * scale);

          // Draw to canvas
          var canvas = document.createElement('canvas');
          canvas.width = tw;
          canvas.height = th;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, tw, th);

          // Compute average color stats from thumbnail pixels
          var stats = computeColorStats(ctx, tw, th);
          entry.avgHue = stats.hue;
          entry.avgBrightness = stats.brightness;

          // Export as blob URL
          canvas.toBlob(function (blob) {
            if (blob) {
              entry.thumbUrl = URL.createObjectURL(blob);
              // Apply to cell
              var cell = STATE.cells[idx];
              if (cell) {
                cell.style.backgroundImage = 'url(' + entry.thumbUrl + ')';
              }
            }
            cleanup();
          }, 'image/jpeg', THUMB_QUALITY);
        };
        img.onerror = function () { cleanup(); };

        function cleanup() {
          URL.revokeObjectURL(tempUrl);
          if (--pending === 0) {
            // Re-sort if using color-based sort (values just became available)
            if (STATE.sort === 'hue' || STATE.sort === 'brightness') {
              STATE.sortedIndices = computeSortedIndices(STATE.sort);
            }
            // Re-layout with updated aspect ratios
            STATE.hoveredIndex = -1;
            applyLayout(true);
            processNext();
          }
        }

        img.src = tempUrl;
      });
    }

    processNext();
  }

  // ── 6. Layout Engine ───────────────────────────────────────────────

  function getWeight(entry) {
    // Continuous weight from title length (range ~1.0 – 2.5)
    var t = Math.min(entry.title.length, 60) / 60;
    var titleW = 1.0 + t * 1.5;
    // File size adds variation via log scale (range ~1.0 – 1.6)
    var sizeW = 1.0 + Math.log10(Math.max(entry.size, 100) / 100) * 0.1;
    var base = titleW * sizeW;
    // For images, scale by aspect ratio so wider images get wider cells
    if (entry.aspectRatio) {
      base *= Math.max(0.4, Math.min(3.0, entry.aspectRatio));
    }
    return base;
  }

  function computeLayout(hoveredIdx) {
    var W = grid.clientWidth;
    var H = grid.clientHeight;
    var files = STATE.files;
    var sortedIndices = STATE.sortedIndices;
    var N = sortedIndices.length;
    if (N === 0) return [];

    // Compute continuous weights
    var baseWeights = files.map(function (f) { return getWeight(f); });

    // Build ordered item list
    var items = sortedIndices.map(function (i) { return { index: i, weight: baseWeights[i] }; });

    // ── Even distribution with uniform row height ──
    // Target roughly square cells: ideal side = sqrt(total area / N)
    var idealSide = Math.sqrt(W * H / N);
    var cols = Math.max(1, Math.round(W / idealSide));
    var numRows = Math.ceil(N / cols);
    // Uniform row height, capped to available space
    var rowH = Math.min(H / numRows, idealSide * 1.3);

    // Distribute items evenly across rows
    var rows = [];
    var ptr = 0;
    for (var r = 0; r < numRows; r++) {
      var rowSize = Math.ceil((N - ptr) / (numRows - r));
      var rowItems = items.slice(ptr, ptr + rowSize);
      var rowWeight = rowItems.reduce(function (s, it) { return s + it.weight; }, 0);
      rows.push({ items: rowItems, totalWeight: rowWeight });
      ptr += rowSize;
    }

    // ── Lay out rows with hover expansion ──
    var newLayout = [];
    var y = 0;

    rows.forEach(function (row) {
      var x = 0;
      var rowHasHovered = row.items.some(function (item) { return item.index === hoveredIdx; });

      var adjustedItems = row.items.map(function (item) {
        if (item.index === hoveredIdx) {
          return { index: item.index, weight: item.weight, adjustedWeight: item.weight * CONFIG.EXPAND_SCALE };
        } else if (rowHasHovered) {
          var shrinkFactor = 1 - (CONFIG.EXPAND_SCALE - 1) * 0.3;
          return { index: item.index, weight: item.weight, adjustedWeight: item.weight * shrinkFactor };
        }
        return { index: item.index, weight: item.weight, adjustedWeight: item.weight };
      });

      var rowTotalWeight = adjustedItems.reduce(function (a, b) { return a + b.adjustedWeight; }, 0);

      adjustedItems.forEach(function (item) {
        var cellWidth = (item.adjustedWeight / rowTotalWeight) * W;
        newLayout[item.index] = { x: x, y: y, width: cellWidth, height: rowH };
        x += cellWidth;
      });

      y += rowH;
    });

    return newLayout;
  }

  function computeChaoticLayout(hoveredIdx) {
    const containerWidth = grid.clientWidth;
    const containerHeight = grid.clientHeight;
    const bounds = { x: 0, y: 0, width: containerWidth, height: containerHeight };
    const results = [];

    const totalDepth = STATE.totalDepth;
    const weightStartDepth = Math.max(0, totalDepth - CONFIG.MAX_PROPAGATION_DEPTH);

    function subdivide(indices, rect, axis, depth) {
      if (indices.length === 0) return;

      if (indices.length === 1) {
        results[indices[0]] = { ...rect };
        return;
      }

      const applyWeights = depth >= weightStartDepth && hoveredIdx >= 0;

      const weights = indices.map((i) => {
        if (applyWeights && i === hoveredIdx) return CONFIG.HOVER_BOOST;
        return 1;
      });
      const totalWeight = weights.reduce((a, b) => a + b, 0);

      let accumWeight = 0;
      let splitIdx = 0;
      const halfWeight = totalWeight / 2;

      for (let i = 0; i < indices.length; i++) {
        accumWeight += weights[i];
        if (accumWeight >= halfWeight) {
          splitIdx = i;
          break;
        }
      }

      splitIdx = Math.max(0, Math.min(splitIdx, indices.length - 2));

      const leftIndices = indices.slice(0, splitIdx + 1);
      const rightIndices = indices.slice(splitIdx + 1);

      const leftWeight = leftIndices.reduce((sum, idx) => {
        if (applyWeights && idx === hoveredIdx) return sum + CONFIG.HOVER_BOOST;
        return sum + 1;
      }, 0);
      const rightWeight = rightIndices.reduce((sum, idx) => {
        if (applyWeights && idx === hoveredIdx) return sum + CONFIG.HOVER_BOOST;
        return sum + 1;
      }, 0);
      const ratio = leftWeight / (leftWeight + rightWeight);

      let leftRect, rightRect;

      if (axis === 0) {
        const splitX = rect.x + rect.width * ratio;
        leftRect = { x: rect.x, y: rect.y, width: splitX - rect.x, height: rect.height };
        rightRect = { x: splitX, y: rect.y, width: rect.x + rect.width - splitX, height: rect.height };
      } else {
        const splitY = rect.y + rect.height * ratio;
        leftRect = { x: rect.x, y: rect.y, width: rect.width, height: splitY - rect.y };
        rightRect = { x: rect.x, y: splitY, width: rect.width, height: rect.y + rect.height - splitY };
      }

      subdivide(leftIndices, leftRect, 1 - axis, depth + 1);
      subdivide(rightIndices, rightRect, 1 - axis, depth + 1);
    }

    subdivide([...STATE.sortedIndices], bounds, 0, 0);
    return results;
  }

  function computeSortedIndices(sortBy) {
    const indices = STATE.files.map((_, i) => i);
    if (sortBy === 'name') {
      indices.sort((a, b) => STATE.files[a].title.localeCompare(STATE.files[b].title));
    } else if (sortBy === 'type') {
      indices.sort((a, b) => {
        const cmp = STATE.files[a].ext.localeCompare(STATE.files[b].ext);
        return cmp !== 0 ? cmp : STATE.files[a].title.localeCompare(STATE.files[b].title);
      });
    } else if (sortBy === 'size') {
      indices.sort((a, b) => STATE.files[b].size - STATE.files[a].size);
    } else if (sortBy === 'hue') {
      indices.sort((a, b) => {
        var ha = STATE.files[a].avgHue, hb = STATE.files[b].avgHue;
        // Non-images (null hue) go to end
        if (ha == null && hb == null) return STATE.files[a].title.localeCompare(STATE.files[b].title);
        if (ha == null) return 1;
        if (hb == null) return -1;
        return ha - hb;
      });
    } else if (sortBy === 'brightness') {
      indices.sort((a, b) => {
        var ba = STATE.files[a].avgBrightness, bb = STATE.files[b].avgBrightness;
        if (ba == null && bb == null) return STATE.files[a].title.localeCompare(STATE.files[b].title);
        if (ba == null) return 1;
        if (bb == null) return -1;
        return ba - bb;
      });
    }
    if (STATE.sortReversed) indices.reverse();
    return indices;
  }

  function applyLayout(animated) {
    if (STATE.mode === 'stable') {
      STATE.layout = computeLayout(STATE.hoveredIndex);
    } else {
      STATE.layout = computeChaoticLayout(STATE.hoveredIndex);
    }

    if (STATE.mode === 'chaotic') {
      STATE.stablePositions = computeChaoticLayout(-1);
    }

    const transitionDuration = STATE.mode === 'chaotic' ? '0.6s' : '0.5s';
    const transitionEasing = STATE.mode === 'chaotic'
      ? 'cubic-bezier(0.25, 0.1, 0.25, 1)'
      : 'ease-out';

    STATE.cells.forEach((cell, i) => {
      const pos = STATE.layout[i];
      if (!pos) return;

      cell.style.transition = animated
        ? 'left ' + transitionDuration + ' ' + transitionEasing +
          ', top ' + transitionDuration + ' ' + transitionEasing +
          ', width ' + transitionDuration + ' ' + transitionEasing +
          ', height ' + transitionDuration + ' ' + transitionEasing +
          ', background 0.15s ease-out'
        : 'none';
      cell.style.left = pos.x + 'px';
      cell.style.top = pos.y + 'px';
      cell.style.width = pos.width + 'px';
      cell.style.height = pos.height + 'px';

      // Responsive font size based on cell dimensions
      var minDim = Math.min(pos.width, pos.height);
      var area = pos.width * pos.height;
      // Scale with sqrt(area) but also cap by the shorter side
      var fromArea = Math.sqrt(area) * 0.11;
      var fromMin = minDim * 0.22;
      var fontSize = Math.max(9, Math.min(28, Math.min(fromArea, fromMin)));
      // Responsive padding: scale with cell size
      var padH = minDim < 80 ? 3 : minDim < 120 ? 8 : 10;
      var padV = minDim < 80 ? 4 : minDim < 120 ? 6 : 8;
      cell.style.setProperty('--cell-pad', padV + 'px ' + padH + 'px');
      var lineH = fontSize * 1.3;
      var maxLines = Math.max(1, Math.floor((pos.height - padV * 2) / lineH));
      cell.style.fontSize = fontSize + 'px';
      cell.style.setProperty('--line-clamp', maxLines);
      // Only shrink title on hover if font is large enough to stay readable
      cell.style.setProperty('--hover-title-size', fontSize >= 14 ? '0.7em' : '1em');
      cell.style.setProperty('--hover-line-clamp', fontSize >= 14 ? '1' : maxLines);
    });
  }

  // ── 7. Interaction ─────────────────────────────────────────────────

  function handleMouseMove(e) {
    const dx = e.clientX - STATE.lastMousePos.x;
    const dy = e.clientY - STATE.lastMousePos.y;
    STATE.mouseVelocity = Math.sqrt(dx * dx + dy * dy) * 10;
    STATE.lastMousePos = { x: e.clientX, y: e.clientY };
  }

  function findCellAtPoint(x, y) {
    const baseLayout = STATE.mode === 'stable' ? computeLayout(-1) : STATE.stablePositions;
    const gridRect = grid.getBoundingClientRect();
    const localX = x - gridRect.left;
    const localY = y - gridRect.top;

    for (let i = 0; i < baseLayout.length; i++) {
      const pos = baseLayout[i];
      if (pos && localX >= pos.x && localX < pos.x + pos.width &&
          localY >= pos.y && localY < pos.y + pos.height) {
        return i;
      }
    }
    return -1;
  }

  function handleCellHover(index) {
    if (index === STATE.hoveredIndex) return;

    if (STATE.hoverTimer) {
      clearTimeout(STATE.hoverTimer);
      STATE.hoverTimer = null;
    }

    if (index === -1) {
      STATE.hoveredIndex = -1;
      applyLayout(true);
      return;
    }

    if (STATE.mouseVelocity > CONFIG.VELOCITY_THRESHOLD) return;

    STATE.hoverTimer = setTimeout(() => {
      STATE.hoveredIndex = index;
      applyLayout(true);
    }, CONFIG.HOVER_DELAY);
  }

  // ── 8. Viewer ──────────────────────────────────────────────────────

  const viewer = document.getElementById('viewer');
  const viewerTitle = document.getElementById('viewer-title');
  const viewerContent = document.getElementById('viewer-content');
  const viewerClose = document.getElementById('viewer-close');
  const heroEl = document.getElementById('hero');

  function openViewer(fileIndex) {
    const entry = STATE.files[fileIndex];
    if (!entry) return;

    STATE.viewerFileIndex = fileIndex;

    // Lazy object URL
    if (!entry.objectUrl) {
      entry.objectUrl = URL.createObjectURL(entry.file);
    }

    // Update header
    viewerTitle.textContent = entry.title + ' — ' + entry.typeInfo.label + ', ' + formatFileSize(entry.size);

    // Detach hero (preserve in memory), clear previous content
    if (heroEl.parentNode) heroEl.remove();
    viewerContent.innerHTML = '';

    // Render by type
    const url = entry.objectUrl;

    switch (entry.typeInfo.type) {
      case 'pdf': {
        const iframe = document.createElement('iframe');
        iframe.className = 'viewer-frame';
        iframe.src = url;
        viewerContent.appendChild(iframe);
        break;
      }
      case 'image': {
        const img = document.createElement('img');
        img.className = 'viewer-image';
        img.src = url;
        img.alt = entry.title;
        viewerContent.appendChild(img);
        break;
      }
      case 'video': {
        const video = document.createElement('video');
        video.className = 'viewer-video';
        video.src = url;
        video.controls = true;
        viewerContent.appendChild(video);
        break;
      }
      case 'audio': {
        const audio = document.createElement('audio');
        audio.className = 'viewer-audio';
        audio.src = url;
        audio.controls = true;
        viewerContent.appendChild(audio);
        break;
      }
      case 'markdown': {
        const div = document.createElement('div');
        div.className = 'viewer-markdown';
        div.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';
        viewerContent.appendChild(div);

        const mdReader = new FileReader();
        mdReader.onload = function () {
          var src = mdReader.result;
          var fmHtml = '';
          var fmMatch = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
          if (!fmMatch) fmMatch = src.match(/^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+\r?\n?/);
          if (fmMatch) {
            var lines = fmMatch[1].split(/\r?\n/);
            fmHtml = '<div class="viewer-frontmatter">' +
              lines.map(function (l) { return '<div>' + escapeHtml(l) + '</div>'; }).join('') +
              '</div>';
            src = src.slice(fmMatch[0].length);
          }
          div.innerHTML = fmHtml + renderMarkdown(src);
        };
        mdReader.readAsText(entry.file);
        break;
      }
      case 'text': {
        const pre = document.createElement('pre');
        pre.className = 'viewer-text';
        pre.textContent = 'Loading...';
        viewerContent.appendChild(pre);

        const txtReader = new FileReader();
        txtReader.onload = function () { pre.textContent = txtReader.result; };
        txtReader.readAsText(entry.file);
        break;
      }
      default: {
        const div = document.createElement('div');
        div.className = 'viewer-fallback';
        div.innerHTML =
          '<div>No preview available for <strong>.' + entry.ext + '</strong></div>' +
          '<a href="' + url + '" download="' + entry.file.name + '">Download file</a>';
        viewerContent.appendChild(div);
        break;
      }
    }

    // Show header, enable resize
    viewer.classList.add('file-open');
    document.getElementById('resize-handle').classList.add('visible');
    STATE.viewerOpen = true;
  }

  function closeViewer() {
    STATE.viewerOpen = false;
    STATE.viewerFileIndex = -1;

    // Clear file content, restore hero
    viewerContent.innerHTML = '';
    viewerTitle.textContent = '';
    viewer.classList.remove('file-open');
    document.getElementById('resize-handle').classList.remove('visible');

    // Re-insert the preserved hero element
    viewerContent.appendChild(heroEl);
  }

  // ── 9. Cell Creation / Grid Build ──────────────────────────────────

  function buildGrid() {
    STATE.cells = [];
    STATE.sortedIndices = computeSortedIndices(STATE.sort);

    STATE.files.forEach((entry, i) => {
      const cell = document.createElement('div');
      const isImage = entry.typeInfo.type === 'image';
      const isTextual = entry.typeInfo.type === 'text' || entry.typeInfo.type === 'markdown';
      cell.className = 'cell' + (isImage ? ' cell-image' : '');

      cell.innerHTML =
        '<div class="cell-content">' +
          '<span class="cell-title">' + escapeHtml(entry.title) + '</span>' +
          '<span class="cell-meta">' + formatFileSize(entry.size) + '</span>' +
          '<span class="cell-type-badge" style="color:' + entry.typeInfo.color + '">' + entry.typeInfo.label + '</span>' +
          (isTextual ? '<span class="cell-snippet">' + (entry.snippet ? escapeHtml(entry.snippet) : '') + '</span>' : '') +
        '</div>';

      cell.addEventListener('click', () => openViewer(i));

      STATE.cells.push(cell);
      grid.appendChild(cell);
    });

    // Initialize stable positions
    STATE.stablePositions = computeChaoticLayout(-1);

    // Initial layout without animation
    applyLayout(false);

    // Mouse tracking on grid
    grid.addEventListener('mousemove', onGridMouseMove);
    grid.addEventListener('mouseleave', onGridMouseLeave);
  }

  function onGridMouseMove(e) {
    handleMouseMove(e);
    const idx = findCellAtPoint(e.clientX, e.clientY);
    handleCellHover(idx);
  }

  function onGridMouseLeave() {
    if (STATE.hoverTimer) {
      clearTimeout(STATE.hoverTimer);
      STATE.hoverTimer = null;
    }
    STATE.hoveredIndex = -1;
    applyLayout(true);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── 10. Controls & Bootstrap ───────────────────────────────────────

  function setupControls() {
    // Mode toggle
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode === STATE.mode) return;
        STATE.mode = mode;
        STATE.hoveredIndex = -1;

        document.querySelectorAll('.mode-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.mode === mode);
        });

        if (mode === 'chaotic') {
          STATE.stablePositions = computeChaoticLayout(-1);
        }
        applyLayout(true);
      });
    });

    // Sort toggle (click active button again to reverse)
    document.querySelectorAll('.sort-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sortBy = btn.dataset.sort;
        if (sortBy === STATE.sort) {
          // Toggle reverse
          STATE.sortReversed = !STATE.sortReversed;
        } else {
          STATE.sort = sortBy;
          STATE.sortReversed = false;
        }
        STATE.hoveredIndex = -1;

        document.querySelectorAll('.sort-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.sort === sortBy);
          b.classList.remove('reversed');
        });
        if (STATE.sortReversed) btn.classList.add('reversed');

        STATE.sortedIndices = computeSortedIndices(sortBy);
        if (STATE.mode === 'chaotic') {
          STATE.stablePositions = computeChaoticLayout(-1);
        }
        applyLayout(true);
      });
    });

    // Reset button
    document.getElementById('btn-reset').addEventListener('click', () => {
      resetState();
      dropZone.classList.remove('hidden');

      // Reset mode/sort buttons
      STATE.mode = 'stable';
      STATE.sort = 'name';
      STATE.sortReversed = false;
      document.querySelectorAll('.mode-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.mode === 'stable');
      });
      document.querySelectorAll('.sort-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.sort === 'name');
        b.classList.remove('reversed');
      });
      document.querySelectorAll('.sort-btn.color-sort').forEach((b) => {
        b.classList.remove('visible');
      });

      // Remove grid listeners
      grid.removeEventListener('mousemove', onGridMouseMove);
      grid.removeEventListener('mouseleave', onGridMouseLeave);
    });

    // Viewer close
    viewerClose.addEventListener('click', closeViewer);

    // Resize handle (drag to adjust viewer/grid partition)
    var handle = document.getElementById('resize-handle');
    var dragging = false;

    handle.addEventListener('mousedown', (e) => {
      if (!STATE.viewerOpen) return;
      e.preventDefault();
      dragging = true;
      handle.classList.add('dragging');
      document.body.classList.add('resizing');
      // Disable viewer transition during drag
      viewer.style.transition = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      var newWidth = Math.max(120, Math.min(window.innerWidth - 200, e.clientX));
      viewer.style.width = newWidth + 'px';
      // Live relayout
      STATE.hoveredIndex = -1;
      if (STATE.mode === 'chaotic') {
        STATE.stablePositions = computeChaoticLayout(-1);
      }
      applyLayout(false);
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.classList.remove('resizing');
      // Re-enable transition
      viewer.style.transition = '';
    });

    // Double-click handle to toggle viewer
    handle.addEventListener('dblclick', () => {
      if (STATE.viewerOpen) {
        closeViewer();
      } else if (STATE.viewerFileIndex >= 0) {
        openViewer(STATE.viewerFileIndex);
      }
    });

    // Resize
    window.addEventListener('resize', () => {
      if (STATE.files.length === 0) return;
      STATE.hoveredIndex = -1;
      if (STATE.mode === 'chaotic') {
        STATE.stablePositions = computeChaoticLayout(-1);
      }
      applyLayout(false);
    });
  }

  // ── Init ───────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    setupDropZone();
    setupControls();
  });

})();
