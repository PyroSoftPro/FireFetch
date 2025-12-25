// MV3 service worker (module)

const SCAN_STORE_PREFIX = "scan:";
const NOTIFY_STORE_PREFIX = "notify:";
const SCAN_DEBOUNCE_MS = 800;
const lastScanAtByTab = new Map();

function isScannableUrl(url) {
  if (!url || typeof url !== "string") return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

function storageSet(obj) {
  // Prefer session storage (clears on browser restart) when available.
  const s = chrome.storage?.session || chrome.storage?.local;
  return new Promise((resolve) => s.set(obj, resolve));
}

function storageGet(keys) {
  const s = chrome.storage?.session || chrome.storage?.local;
  return new Promise((resolve) => s.get(keys, resolve));
}

function settingsGet(keys) {
  const s = chrome.storage?.sync || chrome.storage?.local;
  return new Promise((resolve) => s.get(keys, resolve));
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

async function scanAndStore(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || !isScannableUrl(tab.url)) return;

    const last = lastScanAtByTab.get(tabId) || 0;
    const now = Date.now();
    if (now - last < SCAN_DEBOUNCE_MS) return;
    lastScanAtByTab.set(tabId, now);

    const resp = await sendToTab(tabId, { type: "SCAN_PAGE" });
    if (!resp?.ok || !resp?.result) return;

    // Optional: show in-page toast when media/files are detected.
    const { ["ff:toastEnabled"]: toastEnabled } = await settingsGet(["ff:toastEnabled"]);
    if (toastEnabled && Array.isArray(resp.result.items) && resp.result.items.length > 0) {
      const notifyKey = `${NOTIFY_STORE_PREFIX}${tabId}`;
      const prev = await storageGet([notifyKey]);
      const lastNotifiedUrl = prev?.[notifyKey]?.url || "";

      if (tab.url && tab.url !== lastNotifiedUrl) {
        // Ask the content script to display a toast.
        chrome.tabs.sendMessage(tabId, {
          type: "SHOW_FIREFETCH_TOAST",
          pageUrl: tab.url,
          count: resp.result.items.length
        });
        await storageSet({ [notifyKey]: { url: tab.url, at: new Date().toISOString() } });
      }
    }

    await storageSet({
      [`${SCAN_STORE_PREFIX}${tabId}`]: {
        at: new Date().toISOString(),
        tabUrl: tab.url,
        result: resp.result
      }
    });
  } catch {
    // ignore
  }
}

// Scan when a tab finishes loading.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && isScannableUrl(tab?.url)) {
    scanAndStore(tabId);
  }
});

// Scan on SPA navigations (history.pushState / replaceState).
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0 && isScannableUrl(details.url)) {
    scanAndStore(details.tabId);
  }
});

// Also scan on committed navigations (regular page loads).
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0 && isScannableUrl(details.url)) {
    scanAndStore(details.tabId);
  }
});

// Clean up stored scans when a tab closes.
chrome.tabs.onRemoved.addListener((tabId) => {
  lastScanAtByTab.delete(tabId);
  const s = chrome.storage?.session || chrome.storage?.local;
  s.remove(`${SCAN_STORE_PREFIX}${tabId}`);
  s.remove(`${NOTIFY_STORE_PREFIX}${tabId}`);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "FIREFETCH_QUEUE_URLS") {
      const items = Array.isArray(msg.items) ? msg.items : [];
      const firefetchBase = msg.baseUrl || "http://localhost:3000";
      const endpoint = `${firefetchBase.replace(/\/$/, "")}/api/download`;

      const results = [];
      for (const item of items) {
        if (!item || typeof item.url !== "string" || !item.url.trim()) continue;
        const url = item.url.trim();
        const format = typeof item.format === "string" && item.format ? item.format : "best";
        const title = typeof item.title === "string" && item.title ? item.title : undefined;

        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url,
              format,
              title
            })
          });

          if (!resp.ok) {
            const text = await resp.text().catch(() => "");
            results.push({
              url,
              ok: false,
              error: `HTTP ${resp.status} ${resp.statusText}${text ? `: ${text}` : ""}`
            });
            continue;
          }

          const json = await resp.json().catch(() => null);
          if (json?.success) {
            results.push({ url, ok: true, downloadId: json.downloadId });
          } else {
            results.push({ url, ok: false, error: json?.error || "Unknown error" });
          }
        } catch (e) {
          results.push({ url, ok: false, error: String(e?.message || e) });
        }
      }

      sendResponse({ ok: true, results });
      return;
    }

    if (msg.type === "FIREFETCH_ENQUEUE_WITH_INFO") {
      const items = Array.isArray(msg.items) ? msg.items : [];
      const firefetchBase = msg.baseUrl || "http://localhost:3000";
      const base = firefetchBase.replace(/\/$/, "");
      const infoEndpoint = `${base}/api/video-info`;
      const downloadEndpoint = `${base}/api/download`;

      const results = [];

      for (const item of items) {
        if (!item || typeof item.url !== "string" || !item.url.trim()) continue;
        const url = item.url.trim();
        const preferredFormat =
          typeof item.format === "string" && item.format ? item.format : "best";

        let info = null;
        try {
          const infoResp = await fetch(infoEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url })
          });
          if (infoResp.ok) {
            info = await infoResp.json().catch(() => null);
          }
        } catch {
          // ignore; we'll fall back to basic enqueue
        }

        const title =
          (typeof info?.title === "string" && info.title) ||
          (typeof item.title === "string" && item.title) ||
          undefined;
        const thumbnail =
          (typeof info?.thumbnail === "string" && info.thumbnail) || undefined;
        const webpage_url =
          (typeof info?.webpage_url === "string" && info.webpage_url) || undefined;
        const extractor =
          (typeof info?.extractor === "string" && info.extractor) || undefined;

        const finalUrl = webpage_url || url;

        try {
          const resp = await fetch(downloadEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: finalUrl,
              format: preferredFormat,
              title,
              thumbnail,
              webpage_url,
              extractor
            })
          });

          if (!resp.ok) {
            const text = await resp.text().catch(() => "");
            results.push({
              url,
              ok: false,
              error: `HTTP ${resp.status} ${resp.statusText}${text ? `: ${text}` : ""}`
            });
            continue;
          }

          const json = await resp.json().catch(() => null);
          if (json?.success) {
            results.push({
              url,
              ok: true,
              downloadId: json.downloadId,
              title,
              thumbnail
            });
          } else {
            results.push({ url, ok: false, error: json?.error || "Unknown error" });
          }
        } catch (e) {
          results.push({ url, ok: false, error: String(e?.message || e) });
        }
      }

      sendResponse({ ok: true, results });
      return;
    }

    if (msg.type === "GET_CACHED_SCAN") {
      const tabId = Number(msg.tabId);
      if (!Number.isFinite(tabId)) {
        sendResponse({ ok: false, error: "Invalid tabId" });
        return;
      }
      const key = `${SCAN_STORE_PREFIX}${tabId}`;
      const data = await storageGet([key]);
      sendResponse({ ok: true, cached: data?.[key] || null });
      return;
    }

    if (msg.type === "TRIGGER_SCAN") {
      const tabId = Number(msg.tabId);
      if (!Number.isFinite(tabId)) {
        sendResponse({ ok: false, error: "Invalid tabId" });
        return;
      }
      await scanAndStore(tabId);
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "PING") {
      sendResponse({ ok: true });
      return;
    }
  })();

  // Keep the message channel open for async sendResponse.
  return true;
});


