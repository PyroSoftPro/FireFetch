// Content script: scans the page for likely downloadable media/files.

const COMMON_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "mkv",
  "mov",
  "avi",
  "m3u8",
  "mp3",
  "m4a",
  "aac",
  "wav",
  "flac",
  "ogg",
  "opus",
  "pdf",
  "zip",
  "rar",
  "7z",
  "gz",
  "tar",
  "iso",
  "exe",
  "msi",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "json",
  "csv"
]);

function normalizeUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Skip unsupported URL schemes.
  if (
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("javascript:")
  ) {
    return { url: trimmed, unsupported: true };
  }
  try {
    const u = new URL(trimmed, document.baseURI);
    return { url: u.toString(), unsupported: false };
  } catch {
    return null;
  }
}

function guessFilenameFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    if (!last) return "";
    // Avoid crazy long names.
    return decodeURIComponent(last).slice(0, 160);
  } catch {
    return "";
  }
}

function extFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    const m = last.match(/\.([a-z0-9]{1,8})(?:$|\?)/i);
    return (m?.[1] || "").toLowerCase();
  } catch {
    return "";
  }
}

function addItem(map, candidate) {
  if (!candidate) return;
  const n = normalizeUrl(candidate.url);
  if (!n) return;

  const url = n.url;
  const existing = map.get(url);

  const item = {
    url,
    type: candidate.type || "unknown",
    label: candidate.label || "",
    filename: candidate.filename || guessFilenameFromUrl(url),
    ext: candidate.ext || extFromUrl(url),
    unsupported: Boolean(candidate.unsupported || n.unsupported),
    source: candidate.source || ""
  };

  if (!existing) {
    map.set(url, item);
    return;
  }

  // Merge with existing; prefer more specific info.
  existing.type = existing.type !== "unknown" ? existing.type : item.type;
  existing.label = existing.label || item.label;
  existing.filename = existing.filename || item.filename;
  existing.ext = existing.ext || item.ext;
  existing.unsupported = existing.unsupported || item.unsupported;
  existing.source = existing.source || item.source;
}

function scanPage() {
  const items = new Map();

  // <video> / <audio> tags
  for (const el of document.querySelectorAll("video, audio")) {
    const tag = el.tagName.toLowerCase();
    const title = (el.getAttribute("title") || "").trim();

    // Direct sources
    const srcs = new Set();
    if (el.currentSrc) srcs.add(el.currentSrc);
    if (el.src) srcs.add(el.src);
    const attrSrc = el.getAttribute("src");
    if (attrSrc) srcs.add(attrSrc);

    for (const s of srcs) {
      addItem(items, {
        url: s,
        type: tag,
        label: title || `${tag} src`,
        source: `<${tag}>`
      });
    }

    // <source> children
    for (const srcEl of el.querySelectorAll("source")) {
      const s = srcEl.getAttribute("src");
      const mime = (srcEl.getAttribute("type") || "").trim();
      if (!s) continue;
      addItem(items, {
        url: s,
        type: tag,
        label: mime ? `${tag} source (${mime})` : `${tag} source`,
        source: `<${tag}><source>`
      });
    }
  }

  // Standalone <source> tags (rare but possible)
  for (const srcEl of document.querySelectorAll("source")) {
    const s = srcEl.getAttribute("src");
    const mime = (srcEl.getAttribute("type") || "").trim();
    if (!s) continue;
    addItem(items, {
      url: s,
      type: "source",
      label: mime ? `source (${mime})` : "source",
      source: "<source>"
    });
  }

  // <a href> links that look like files
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (!href) continue;
    const text = (a.textContent || "").trim().slice(0, 120);
    const dl = (a.getAttribute("download") || "").trim();

    const normalized = normalizeUrl(href);
    if (!normalized) continue;
    const ext = extFromUrl(normalized.url);
    const looksFile = COMMON_EXTENSIONS.has(ext);
    const looksMedia =
      a.getAttribute("href")?.includes(".m3u8") || COMMON_EXTENSIONS.has(ext);

    if (!looksFile && !looksMedia) continue;

    addItem(items, {
      url: normalized.url,
      type: "link",
      label: text || "link",
      filename: dl || "",
      ext,
      source: "<a>"
    });
  }

  // Common meta tags for video
  const metaProps = ["og:video", "og:video:url", "twitter:player", "og:audio"];
  for (const prop of metaProps) {
    const meta = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
    const content = meta?.getAttribute("content");
    if (!content) continue;
    addItem(items, {
      url: content,
      type: "meta",
      label: `meta ${prop}`,
      source: "<meta>"
    });
  }

  // Sort: supported first, then by type/ext/label.
  const list = Array.from(items.values());
  list.sort((a, b) => {
    if (a.unsupported !== b.unsupported) return a.unsupported ? 1 : -1;
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if (a.ext !== b.ext) return a.ext.localeCompare(b.ext);
    return (a.label || a.url).localeCompare(b.label || b.url);
  });

  return {
    page: { title: document.title || "", url: location.href },
    items: list
  };
}

function isYouTubeWatchPage() {
  const host = location.hostname.toLowerCase();
  if (!(host === "www.youtube.com" || host === "m.youtube.com" || host.endsWith(".youtube.com"))) return false;
  // Primary watch page; also handle shorts.
  return location.pathname === "/watch" || location.pathname.startsWith("/shorts/");
}

function findYouTubeActionBarContainer() {
  // Watch page: action bar buttons live under ytd-watch-metadata.
  // Common containers:
  // - #top-level-buttons-computed (desktop)
  // - ytd-menu-renderer within #actions
  return (
    document.querySelector("#top-level-buttons-computed") ||
    document.querySelector("ytd-watch-metadata #actions ytd-menu-renderer #top-level-buttons-computed") ||
    document.querySelector("ytd-watch-metadata #actions ytd-menu-renderer") ||
    null
  );
}

function ensureYouTubeFireFetchStyles() {
  const id = "firefetch-yt-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .firefetch-yt-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0 12px;
      height: 36px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: linear-gradient(135deg, rgba(255,107,53,0.18), rgba(255,138,61,0.10));
      color: rgba(255, 255, 255, 0.92);
      font-weight: 700;
      font-family: Roboto, "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif;
      cursor: pointer;
      user-select: none;
      margin-left: 8px;
    }
    .firefetch-yt-btn:hover {
      background: linear-gradient(135deg, rgba(255,107,53,0.26), rgba(255,138,61,0.14));
      border-color: rgba(255, 107, 53, 0.30);
    }
    .firefetch-yt-btn:active {
      transform: translateY(1px);
    }
    .firefetch-yt-btn .firefetch-yt-emoji {
      font-size: 16px;
      line-height: 1;
    }
  `;
  document.documentElement.appendChild(style);
}

async function sendCurrentPageToFireFetch() {
  try {
    const url = location.href;
    await chrome.runtime.sendMessage({
      type: "FIREFETCH_ENQUEUE_WITH_INFO",
      items: [{ url, format: "best", title: document.title || "" }]
    });
    return true;
  } catch {
    return false;
  }
}

let ytInjectInFlight = false;
function injectYouTubeFireFetchButton() {
  if (!isYouTubeWatchPage()) return;
  if (ytInjectInFlight) return;
  ytInjectInFlight = true;

  try {
    ensureYouTubeFireFetchStyles();

    const container = findYouTubeActionBarContainer();
    if (!container) return;

    // Avoid duplicates across SPA navigations.
    if (document.getElementById("firefetch-yt-btn")) return;

    const btn = document.createElement("button");
    btn.id = "firefetch-yt-btn";
    btn.className = "firefetch-yt-btn";
    btn.type = "button";
    btn.title = "Send this page to FireFetch";
    btn.innerHTML = `<span class="firefetch-yt-emoji">🔥</span><span>FireFetch</span>`;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.disabled = true;
      const prev = btn.innerHTML;
      btn.innerHTML = `<span class="firefetch-yt-emoji">🔥</span><span>Sending…</span>`;
      const ok = await sendCurrentPageToFireFetch();
      btn.innerHTML = ok
        ? `<span class="firefetch-yt-emoji">🔥</span><span>Queued</span>`
        : `<span class="firefetch-yt-emoji">🔥</span><span>Failed</span>`;
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = prev;
      }, 1500);
    });

    // Insert next to existing buttons. If container is #top-level-buttons-computed, append there.
    container.appendChild(btn);
  } finally {
    ytInjectInFlight = false;
  }
}

function setupYouTubeInjector() {
  if (!isYouTubeWatchPage()) return;

  // Initial attempt
  injectYouTubeFireFetchButton();

  // YouTube is an SPA; observe DOM changes around the watch page.
  const obs = new MutationObserver(() => injectYouTubeFireFetchButton());
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // Also listen to YouTube's navigation events if present.
  window.addEventListener("yt-navigate-finish", () => {
    // Clean up any stale button (YouTube may replace the whole action bar)
    document.getElementById("firefetch-yt-btn")?.remove();
    setTimeout(() => injectYouTubeFireFetchButton(), 350);
  });
}

function ensureToastRoot() {
  const existing = document.getElementById("firefetch-toast-root");
  if (existing) return existing;
  const host = document.createElement("div");
  host.id = "firefetch-toast-root";
  host.style.position = "fixed";
  host.style.top = "16px";
  host.style.right = "16px";
  host.style.zIndex = "2147483647";
  host.style.pointerEvents = "none";
  document.documentElement.appendChild(host);
  return host;
}

function renderToast({ count }) {
  const root = ensureToastRoot();
  // Use shadow DOM to avoid CSS collisions.
  let shadowHost = root.querySelector("#firefetch-toast-shadow");
  if (!shadowHost) {
    shadowHost = document.createElement("div");
    shadowHost.id = "firefetch-toast-shadow";
    root.appendChild(shadowHost);
    shadowHost.attachShadow({ mode: "open" });
  }

  const shadow = shadowHost.shadowRoot;
  shadow.innerHTML = `
    <style>
      .wrap { pointer-events: auto; font-family: "Segoe UI Variable","Segoe UI",Inter,system-ui,-apple-system,sans-serif; }
      .card {
        width: 330px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.14);
        background: linear-gradient(135deg, rgba(70, 10, 18, 0.88), rgba(15, 17, 23, 0.86));
        backdrop-filter: blur(18px) saturate(1.25);
        box-shadow: 0 18px 50px rgba(0,0,0,0.55);
        color: rgba(255,255,255,0.92);
        padding: 12px 12px 10px;
      }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .title { font-weight: 820; letter-spacing: 0.2px; }
      .title .brand {
        background: linear-gradient(135deg, #ff6b35 0%, #ff8a3d 100%);
        -webkit-background-clip: text; background-clip: text; color: transparent;
        filter: drop-shadow(0 10px 22px rgba(255,107,53,0.26));
      }
      .close {
        width: 30px; height: 30px; border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.86);
        cursor: pointer;
      }
      .close:hover { background: rgba(255,255,255,0.10); }
      .meta { margin-top: 6px; color: rgba(255,255,255,0.66); font-size: 12px; line-height: 1.3; }
      .actions { display: flex; gap: 10px; margin-top: 10px; }
      .btn {
        flex: 1;
        padding: 10px 12px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.92);
        font-weight: 700;
        cursor: pointer;
      }
      .btn.primary {
        background: linear-gradient(135deg, #ff6b35 0%, #ff8a3d 100%);
        border-color: rgba(255,107,53,0.30);
        color: white;
      }
      .btn:hover { transform: translateY(-1px); filter: brightness(1.03); }
      .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; filter: none; }
    </style>
    <div class="wrap">
      <div class="card" role="dialog" aria-label="FireFetch detected media">
        <div class="top">
          <div class="title"><span class="brand">FireFetch</span> detected media</div>
          <button class="close" title="Dismiss" aria-label="Dismiss">✕</button>
        </div>
        <div class="meta">${count} item(s) detected on this page.</div>
        <div class="actions">
          <button class="btn primary" id="ffSendPage">Send page</button>
          <button class="btn" id="ffSendDetected">Send detected</button>
        </div>
      </div>
    </div>
  `;

  const closeBtn = shadow.querySelector(".close");
  closeBtn?.addEventListener("click", () => {
    root.remove();
  });

  const sendPageBtn = shadow.getElementById("ffSendPage");
  const sendDetectedBtn = shadow.getElementById("ffSendDetected");

  async function sendToFireFetch(urls) {
    try {
      await chrome.runtime.sendMessage({
        type: "FIREFETCH_ENQUEUE_WITH_INFO",
        items: urls.map((u) => ({ url: u, format: "best", title: document.title || "" }))
      });
    } catch {
      // ignore
    }
  }

  sendPageBtn?.addEventListener("click", async () => {
    await sendToFireFetch([location.href]);
    root.remove();
  });

  sendDetectedBtn?.addEventListener("click", async () => {
    const scan = scanPage();
    const pageUrl = scan?.page?.url || location.href;
    const mapped = (scan.items || []).map((it) => {
      if (it.unsupported || String(it.url).startsWith("blob:") || String(it.url).startsWith("data:")) return pageUrl;
      return it.url;
    });
    const uniq = [];
    const seen = new Set();
    for (const u of mapped) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      uniq.push(u);
      if (uniq.length >= 25) break;
    }
    await sendToFireFetch(uniq.length ? uniq : [pageUrl]);
    root.remove();
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "SCAN_PAGE") {
    try {
      const result = scanPage();
      sendResponse({ ok: true, result });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  }

  if (msg.type === "SHOW_FIREFETCH_TOAST") {
    try {
      const count = Number(msg.count) || 0;
      if (count > 0) renderToast({ count });
    } catch {
      // ignore
    }
    return;
  }
});

// YouTube button injection (runs only on YT pages)
try {
  setupYouTubeInjector();
} catch {
  // ignore
}


