const els = {
  pageMeta: document.getElementById("pageMeta"),
  scanBtn: document.getElementById("scanBtn"),
  sendSelectedBtn: document.getElementById("sendSelectedBtn"),
  sendPageBtn: document.getElementById("sendPageBtn"),
  hideUnsupported: document.getElementById("hideUnsupported"),
  enableToast: document.getElementById("enableToast"),
  selectAll: document.getElementById("selectAll"),
  status: document.getElementById("status"),
  list: document.getElementById("list")
};

let lastScan = null;
let rendered = [];
let currentTab = null;

function setStatus(text) {
  els.status.textContent = text || "";
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs?.[0] || null);
    });
  });
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) resolve({ ok: false, error: err.message });
      else resolve(resp);
    });
  });
}

function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) resolve({ ok: false, error: err.message });
      else resolve(resp);
    });
  });
}

function storageArea() {
  return chrome.storage?.session || chrome.storage?.local;
}

function settingsArea() {
  return chrome.storage?.sync || chrome.storage?.local;
}

function getSetting(key, fallback) {
  const s = settingsArea();
  return new Promise((resolve) => {
    s.get([key], (data) => resolve(data?.[key] ?? fallback));
  });
}

function setSetting(key, value) {
  const s = settingsArea();
  return new Promise((resolve) => s.set({ [key]: value }, resolve));
}

async function loadCachedScan(tabId) {
  const resp = await sendToBackground({ type: "GET_CACHED_SCAN", tabId });
  if (!resp?.ok || !resp.cached?.result) return null;
  return resp.cached.result;
}

function maybeRenderCachedForCurrentTab(changed) {
  // Storage change objects are keyed by `scan:<tabId>`
  if (!currentTab?.id) return;
  const key = `scan:${currentTab.id}`;
  const entry = changed?.[key]?.newValue;
  if (entry?.result) {
    renderList(entry.result);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function computeSelected() {
  const selected = [];
  for (const it of rendered) {
    const cb = document.querySelector(`input[data-url="${CSS.escape(it.url)}"]`);
    if (cb?.checked) selected.push(it);
  }
  return selected;
}

function updateButtons() {
  const list = (lastScan?.items || []).filter((it) => !shouldHide(it));
  const selected = computeSelected();
  els.sendSelectedBtn.disabled = selected.length === 0;
}

function shouldHide(item) {
  return els.hideUnsupported.checked && item.unsupported;
}

function isMediaLike(item) {
  return ["video", "audio", "source", "meta"].includes(item.type);
}

function sendUrlForItem(item) {
  const pageUrl = currentTab?.url || lastScan?.page?.url || "";
  if (!pageUrl) return item.url;
  // If the detected URL is a blob/data stream, FireFetch needs the page URL.
  if (item.unsupported || item.url.startsWith("blob:") || item.url.startsWith("data:")) {
    return pageUrl;
  }
  return item.url;
}

function renderList(scanResult) {
  lastScan = scanResult;
  rendered = scanResult?.items || [];

  const pageTitle = scanResult?.page?.title || "";
  const pageUrl = scanResult?.page?.url || "";
  els.pageMeta.textContent = pageTitle ? `${pageTitle} — ${pageUrl}` : pageUrl;

  const visible = rendered.filter((it) => !shouldHide(it));

  els.list.innerHTML = visible
    .map((it) => {
      const pill = it.ext ? `${it.type} · .${it.ext}` : it.type;
      const label = it.label || it.filename || it.url;
      const warn = it.unsupported
        ? `<div class="warn">This looks like a stream URL (blob/data). Chrome can't download it directly — use “Send to FireFetch” (we'll send the page URL).</div>`
        : "";

      return `
        <div class="item ${it.unsupported ? "unsupported" : ""}">
          <div>
            <input type="checkbox" data-url="${escapeHtml(it.url)}" ${
              it.unsupported ? (isMediaLike(it) ? "checked" : "") : "checked"
            } />
          </div>
          <div>
            <div class="rowTop">
              <span class="pill">${escapeHtml(pill)}</span>
              <span class="label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
            </div>
            <div class="url">${escapeHtml(it.url)}</div>
            ${warn}
          </div>
        </div>
      `;
    })
    .join("");

  // Checkbox handlers
  for (const cb of els.list.querySelectorAll("input[type=checkbox][data-url]")) {
    cb.addEventListener("change", () => {
      updateSelectAllCheckbox();
      updateButtons();
    });
  }

  updateSelectAllCheckbox();
  updateButtons();
  setStatus(`${visible.length} item(s)`);
}

function updateSelectAllCheckbox() {
  const visible = rendered.filter((it) => !shouldHide(it));
  if (visible.length === 0) {
    els.selectAll.checked = false;
    els.selectAll.indeterminate = false;
    return;
  }
  const selected = computeSelected();
  const selectedVisible = selected.filter((it) => visible.some((v) => v.url === it.url));
  if (selectedVisible.length === 0) {
    els.selectAll.checked = false;
    els.selectAll.indeterminate = false;
    return;
  }
  if (selectedVisible.length === visible.length) {
    els.selectAll.checked = true;
    els.selectAll.indeterminate = false;
    return;
  }
  els.selectAll.checked = false;
  els.selectAll.indeterminate = true;
}

function setAllVisibleSelected(checked) {
  const visible = rendered.filter((it) => !shouldHide(it));
  for (const it of visible) {
    const cb = document.querySelector(`input[data-url="${CSS.escape(it.url)}"]`);
    if (cb) cb.checked = checked;
  }
  updateSelectAllCheckbox();
  updateButtons();
}

async function scanActiveTab() {
  setStatus("Scanning…");
  els.scanBtn.disabled = true;

  const tab = await getActiveTab();
  currentTab = tab;
  if (!tab?.id) {
    setStatus("No active tab");
    els.scanBtn.disabled = false;
    return;
  }

  // If a fresh scan is already available from background auto-scan, show it immediately.
  const cached = await loadCachedScan(tab.id);
  if (cached?.page?.url) {
    renderList(cached);
    // Still trigger a scan to keep it fresh (esp. during SPA transitions).
    await sendToBackground({ type: "TRIGGER_SCAN", tabId: tab.id });
    els.scanBtn.disabled = false;
    return;
  }

  const resp = await sendToTab(tab.id, { type: "SCAN_PAGE" });
  if (!resp?.ok) {
    // Don't keep stale results around if scan fails.
    lastScan = null;
    rendered = [];
    els.list.innerHTML = "";
    els.pageMeta.textContent = tab?.url || "";
    updateButtons();
    setStatus(`Scan failed: ${resp?.error || "unknown error"}`);
    els.scanBtn.disabled = false;
    return;
  }

  renderList(resp.result);
  els.scanBtn.disabled = false;
}

async function ensureFreshTabContext() {
  const tab = await getActiveTab();
  currentTab = tab;
  const tabUrl = tab?.url || "";
  const scanUrl = lastScan?.page?.url || "";
  // If the user navigated since our last scan, re-scan before sending.
  if (tabUrl && scanUrl && tabUrl !== scanUrl) {
    await scanActiveTab();
  }
  return currentTab;
}

async function sendItemsToFireFetch(items) {
  await ensureFreshTabContext();
  const pageTitle = lastScan?.page?.title || "";
  const mapped = items
    .map((it) => ({
      url: sendUrlForItem(it),
      title: it.filename || it.label || pageTitle || ""
    }))
    .filter((x) => x.url && typeof x.url === "string");

  // Dedupe (especially important when multiple blob URLs map to the same page URL)
  const seen = new Set();
  const unique = [];
  for (const m of mapped) {
    if (seen.has(m.url)) continue;
    seen.add(m.url);
    unique.push(m);
  }

  if (unique.length === 0) return;

  setStatus(`Fetching info + sending ${unique.length} URL(s) to FireFetch…`);
  const resp = await sendToBackground({
    type: "FIREFETCH_ENQUEUE_WITH_INFO",
    items: unique.map((u) => ({
      url: u.url,
      title: u.title,
      format: "best"
    }))
  });

  if (!resp?.ok) {
    setStatus(`Send failed: ${resp?.error || "unknown error"}`);
    return;
  }

  const failures = (resp.results || []).filter((r) => !r.ok);
  if (failures.length) {
    // Most common: FireFetch not running.
    setStatus(`Sent with errors (${failures.length}). Is FireFetch running (localhost:3000+)?`);
  } else {
    setStatus(`Sent to FireFetch (${unique.length})`);
  }
}

// UI wire-up
els.scanBtn.addEventListener("click", scanActiveTab);
els.hideUnsupported.addEventListener("change", () => {
  if (lastScan) renderList(lastScan);
});
els.selectAll.addEventListener("change", () => setAllVisibleSelected(els.selectAll.checked));

els.enableToast.addEventListener("change", async () => {
  await setSetting("ff:toastEnabled", Boolean(els.enableToast.checked));
  setStatus(els.enableToast.checked ? "Popup enabled" : "Popup disabled");
});

els.sendSelectedBtn.addEventListener("click", async () => {
  await sendItemsToFireFetch(computeSelected());
});

els.sendPageBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  currentTab = tab;
  const url = tab?.url || "";
  if (!url || url.startsWith("chrome://") || url.startsWith("edge://")) {
    setStatus("Can't send this page URL");
    return;
  }
  await sendItemsToFireFetch([
    { url, type: "page", label: tab?.title || "page", filename: "", ext: "", unsupported: false }
  ]);
});

// Auto-scan on open
scanActiveTab();

// Load settings on open
(async () => {
  try {
    els.enableToast.checked = await getSetting("ff:toastEnabled", false);
  } catch {
    // ignore
  }
})();

// Live-update the popup when background auto-scan stores new results for this tab.
try {
  const s = storageArea();
  if (s && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      const expected =
        chrome.storage?.session && s === chrome.storage.session ? "session" : "local";
      if (areaName !== expected) return;
      maybeRenderCachedForCurrentTab(changes);
    });
  }
} catch {
  // ignore
}


