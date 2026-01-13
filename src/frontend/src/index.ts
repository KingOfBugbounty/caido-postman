import type { Caido } from "caido:plugin";
import type { API } from "../../backend/src";
import "./styles.css";

const postmanLogoSmall = `<svg viewBox="0 0 24 24" width="20" height="20" style="vertical-align: middle;"><circle cx="12" cy="12" r="12" fill="#FF6C37"/><circle cx="12" cy="12" r="4" fill="#fff"/></svg>`;

interface FilteredRequest {
  id: string;
  method: string;
  url: string;
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string;
  statusCode: number;
  hasAuth: boolean;
  authType: string;
  timestamp: string;
  validationStatus?: "pending" | "active" | "inactive" | "error";
  validationCode?: number;
}

interface PostmanConfig {
  apiKey: string;
  workspaceId: string;
  collectionId?: string;
}

interface PostmanCollection {
  id: string;
  uid: string;
  name: string;
  owner: string;
}

interface PostmanRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  collectionName: string;
  validationStatus?: "pending" | "testing" | "success" | "failed" | "error";
  validationCode?: number;
  validationTime?: number;
  validationAuth?: boolean;
  resolvedUrl?: string;
  // Import response data
  importStatus?: "idle" | "importing" | "done" | "error";
  importResponse?: {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
    time: number;
  };
  importError?: string;
}

let postmanConfig: PostmanConfig = { apiKey: "", workspaceId: "" };
let currentRequests: FilteredRequest[] = [];
let postmanRequests: PostmanRequest[] = [];
let postmanCollections: PostmanCollection[] = [];
let selectedCollection: PostmanCollection | null = null;
let myCollectionsVisible = false;
let caidoInstance: Caido<API>;

// Custom CSS for elements not easily handled by Tailwind
const CSS = `
/* Animation for spinner */
@keyframes spin { to { transform: rotate(360deg); } }
.cp-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  display: inline-block;
}
.cp-spinner-sm {
  width: 10px;
  height: 10px;
  border-width: 1px;
}

/* Row expansion */
.cp-row-details { display: none; }
.cp-row-details.expanded { display: table-row; }

/* Token highlighting */
.cp-token {
  background: hsl(var(--c-success-900) / 0.3);
  color: hsl(var(--c-success-400));
  padding: 2px 6px;
  border-radius: 3px;
}
`;

function injectStyles() {
  if (document.getElementById("cp-styles")) return;
  const style = document.createElement("style");
  style.id = "cp-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

// Highlight tokens in text
function highlightTokens(text: string): string {
  if (!text) return "";
  return text
    .replace(/(Bearer\s+[A-Za-z0-9\-_\.]+)/gi, '<span class="cp-token">$1</span>')
    .replace(/(eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)/g, '<span class="cp-token">$1</span>')
    .replace(/([A-Za-z0-9]{32,})/g, '<span class="cp-token">$1</span>');
}

// Format headers for display
function formatHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([k, v]) => `<strong>${k}:</strong> ${highlightTokens(v)}`)
    .join("\n");
}

// Format body for display
function formatBody(body: string): string {
  if (!body || body === "") return "<em>No body</em>";
  try {
    const parsed = JSON.parse(body);
    return highlightTokens(JSON.stringify(parsed, null, 2));
  } catch {
    return highlightTokens(body);
  }
}

// Postman API functions - using backend to avoid CORS
async function testPostmanAPI(apiKey: string): Promise<{ success: boolean; message: string; user?: any; workspaces?: any[]; apiUsage?: {limit: number, usage: number} }> {
  try {
    // Use backend functions to avoid CORS
    const workspaces = await caidoInstance.backend.fetchMyWorkspaces(apiKey);
    const apiUsage = await caidoInstance.backend.getPostmanApiUsage(apiKey);

    if (workspaces.length === 0 && !apiUsage) {
      return { success: false, message: "Invalid API Key or connection failed" };
    }

    return {
      success: true,
      message: `Connected successfully (${workspaces.length} workspaces)`,
      workspaces,
      apiUsage: apiUsage || undefined
    };
  } catch (error) {
    return { success: false, message: `Connection error: ${error}` };
  }
}

async function fetchPostmanCollections(apiKey: string): Promise<PostmanCollection[]> {
  try {
    // Use backend to avoid CORS
    const collections = await caidoInstance.backend.fetchMyCollections(apiKey);
    return collections.map((c: any) => ({
      id: c.id,
      uid: c.uid,
      name: c.name,
      owner: c.owner
    }));
  } catch { return []; }
}

// Search is now done via backend to avoid CORS issues
// See searchPublicBtn.onclick for the implementation using caidoInstance.backend.searchPostmanPublicNetwork

async function createPostmanCollection(apiKey: string, name: string): Promise<string | null> {
  try {
    const response = await fetch("https://api.getpostman.com/collections", {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        collection: {
          info: { name, schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
          item: []
        }
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.collection?.uid || null;
  } catch { return null; }
}

async function addToPostmanCollection(apiKey: string, collectionId: string, request: FilteredRequest): Promise<boolean> {
  try {
    const getResponse = await fetch(`https://api.getpostman.com/collections/${collectionId}`, { headers: { "X-Api-Key": apiKey } });
    if (!getResponse.ok) return false;

    const collectionData = await getResponse.json();
    const urlParts = new URL(request.url);

    const newItem = {
      name: `${request.method} ${request.path}`,
      request: {
        method: request.method,
        header: Object.entries(request.headers).map(([key, value]) => ({ key, value })),
        url: {
          raw: request.url,
          protocol: urlParts.protocol.replace(":", ""),
          host: urlParts.hostname.split("."),
          path: urlParts.pathname.split("/").filter((p: string) => p),
          query: urlParts.search ? urlParts.search.substring(1).split("&").map(q => {
            const [key, value] = q.split("=");
            return { key, value: value || "" };
          }) : []
        },
        body: request.body ? { mode: "raw", raw: request.body, options: { raw: { language: "json" } } } : undefined
      }
    };

    collectionData.collection.item.push(newItem);

    const updateResponse = await fetch(`https://api.getpostman.com/collections/${collectionId}`, {
      method: "PUT",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(collectionData)
    });

    return updateResponse.ok;
  } catch { return false; }
}

// Known API base URLs for variable resolution
const KNOWN_BASE_URLS: Record<string, Record<string, string>> = {
  "dhl": { "baseUrl": "https://express.api.dhl.com", "base_url": "https://express.api.dhl.com", "api-eu": "https://api-eu.dhl.com" },
  "stripe": { "baseUrl": "https://api.stripe.com", "base_url": "https://api.stripe.com" },
  "github": { "baseUrl": "https://api.github.com", "base_url": "https://api.github.com" },
  "twitter": { "baseUrl": "https://api.twitter.com", "base_url": "https://api.twitter.com", "api_url": "https://api.twitter.com" },
  "slack": { "baseUrl": "https://slack.com/api", "base_url": "https://slack.com/api" },
  "spotify": { "baseUrl": "https://api.spotify.com", "base_url": "https://api.spotify.com" },
  "paypal": { "baseUrl": "https://api-m.sandbox.paypal.com", "base_url": "https://api-m.sandbox.paypal.com", "paypal_api_base_url": "https://api-m.sandbox.paypal.com" },
  "uber": { "baseUrl": "https://api.uber.com", "base_url": "https://api.uber.com", "uber_api_host": "https://api.uber.com" },
  "twilio": { "baseUrl": "https://api.twilio.com", "base_url": "https://api.twilio.com" },
  "shopify": { "baseUrl": "https://{{shop}}.myshopify.com", "base_url": "https://example.myshopify.com" },
  "postman": { "baseUrl": "https://api.getpostman.com", "base_url": "https://api.getpostman.com" },
  "default": { "baseUrl": "https://api.example.com", "base_url": "https://api.example.com" }
};

let currentSearchContext = "default";

function resolveUrl(url: string): string {
  if (!url) return "";
  let resolved = url;
  const contextUrls = KNOWN_BASE_URLS[currentSearchContext] || KNOWN_BASE_URLS["default"];

  resolved = resolved.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    const key = varName.toLowerCase().trim();
    return contextUrls[key] || contextUrls["baseUrl"] || "";
  });

  resolved = resolved.replace(/\[([^\]]+)\]/g, (match, varName) => {
    const key = varName.toLowerCase().trim();
    return contextUrls[key] || contextUrls["baseUrl"] || "";
  });

  resolved = resolved.replace(/:([a-zA-Z_]+)/g, "test_$1");
  resolved = resolved.replace(/([^:])\/\//g, "$1/");

  return resolved;
}

async function testEndpoint(request: PostmanRequest): Promise<{status: number, time: number, authValid: boolean, resolvedUrl: string}> {
  const startTime = Date.now();
  const resolvedUrl = resolveUrl(request.url);

  try {
    if (!resolvedUrl || !resolvedUrl.startsWith("http")) {
      return { status: 0, time: 0, authValid: false, resolvedUrl };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const cleanHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (value && !value.includes("{{") && !value.includes("[")) {
        cleanHeaders[key] = value;
      }
    }

    const fetchOptions: RequestInit = {
      method: request.method,
      headers: cleanHeaders,
      signal: controller.signal,
      mode: "cors"
    };

    if (request.body && request.method !== "GET" && request.method !== "HEAD") {
      let cleanBody = request.body.replace(/\{\{[^}]+\}\}/g, "test");
      fetchOptions.body = cleanBody;
    }

    const response = await fetch(resolvedUrl, fetchOptions);
    clearTimeout(timeout);

    const time = Date.now() - startTime;
    const authValid = response.status !== 401 && response.status !== 403;

    return { status: response.status, time, authValid, resolvedUrl };
  } catch (error: any) {
    const time = Date.now() - startTime;
    if (error.name === "AbortError") {
      return { status: 408, time, authValid: false, resolvedUrl };
    }
    return { status: 0, time, authValid: false, resolvedUrl };
  }
}

function renderPostmanRequests(container: HTMLElement) {
  const resultsTable = container.querySelector("#resultsTable") as HTMLDivElement;
  const resultCount = container.querySelector("#resultCount") as HTMLSpanElement;
  const validateBtn = container.querySelector("#validateBtn") as HTMLButtonElement;

  resultCount.textContent = `(${postmanRequests.length})`;

  if (postmanRequests.length === 0) {
    resultsTable.innerHTML = '<div class="p-10 text-center text-secondary-500">No requests found in Postman collections.</div>';
    validateBtn.classList.add("hidden");
    return;
  }

  validateBtn.classList.remove("hidden");
  validateBtn.textContent = "Auto Test All";

  const total = postmanRequests.length;
  const success = postmanRequests.filter(r => r.validationStatus === "success").length;
  const failed = postmanRequests.filter(r => r.validationStatus === "failed" || r.validationStatus === "error").length;
  const withAuth = postmanRequests.filter(r =>
    r.headers["Authorization"] || r.headers["authorization"] ||
    r.headers["X-Api-Key"] || r.headers["x-api-key"]
  ).length;
  const tested = postmanRequests.filter(r => r.validationStatus && r.validationStatus !== "pending").length;

  const statsEl = container.querySelector("#statsContainer") as HTMLElement;
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="px-5 py-3 bg-surface-700 rounded-lg border border-surface-600 text-center min-w-[80px]">
        <div class="text-2xl font-semibold text-info-400">${total}</div>
        <div class="text-xs text-secondary-400 uppercase mt-1">Total</div>
      </div>
      <div class="px-5 py-3 bg-surface-700 rounded-lg border border-surface-600 text-center min-w-[80px]">
        <div class="text-2xl font-semibold text-success-400">${success}</div>
        <div class="text-xs text-secondary-400 uppercase mt-1">Active (2xx)</div>
      </div>
      <div class="px-5 py-3 bg-surface-700 rounded-lg border border-surface-600 text-center min-w-[80px]">
        <div class="text-2xl font-semibold text-danger-400">${failed}</div>
        <div class="text-xs text-secondary-400 uppercase mt-1">Failed</div>
      </div>
      <div class="px-5 py-3 bg-surface-700 rounded-lg border border-surface-600 text-center min-w-[80px]">
        <div class="text-2xl font-semibold text-primary-500">${withAuth}</div>
        <div class="text-xs text-secondary-400 uppercase mt-1">With Auth</div>
      </div>
      <div class="px-5 py-3 bg-surface-700 rounded-lg border border-surface-600 text-center min-w-[80px]">
        <div class="text-2xl font-semibold text-info-400">${tested}/${total}</div>
        <div class="text-xs text-secondary-400 uppercase mt-1">Tested</div>
      </div>
    `;
  }

  resultsTable.innerHTML = `
    <div class="max-h-[500px] overflow-y-auto overflow-x-auto border border-surface-600 rounded-lg">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th class="px-2 py-2.5 text-left text-xs uppercase text-secondary-400 font-semibold bg-surface-700 sticky top-0 z-10" style="width:70px">Method</th>
            <th class="px-2 py-2.5 text-left text-xs uppercase text-secondary-400 font-semibold bg-surface-700 sticky top-0 z-10" style="width:200px">Name</th>
            <th class="px-2 py-2.5 text-left text-xs uppercase text-secondary-400 font-semibold bg-surface-700 sticky top-0 z-10">URL</th>
            <th class="px-2 py-2.5 text-left text-xs uppercase text-secondary-400 font-semibold bg-surface-700 sticky top-0 z-10" style="width:50px">Auth</th>
            <th class="px-2 py-2.5 text-left text-xs uppercase text-secondary-400 font-semibold bg-surface-700 sticky top-0 z-10" style="width:90px">Status</th>
            <th class="px-2 py-2.5 text-left text-xs uppercase text-secondary-400 font-semibold bg-surface-700 sticky top-0 z-10" style="width:180px">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${postmanRequests.map((r, idx) => {
            const hasAuth = r.headers["Authorization"] || r.headers["authorization"] ||
                            r.headers["X-Api-Key"] || r.headers["x-api-key"];

            let statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-primary-900/30 text-primary-400">-</span>';
            if (r.validationStatus === "testing") {
              statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-info-900/30 text-info-400"><span class="cp-spinner cp-spinner-sm"></span></span>';
            } else if (r.validationStatus === "success") {
              statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-success-900/30 text-success-400">${r.validationCode}</span>`;
            } else if (r.validationStatus === "failed") {
              statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-danger-900/30 text-danger-400">${r.validationCode || 'err'}</span>`;
            } else if (r.validationStatus === "error") {
              statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-surface-500/50 text-secondary-400">CORS</span>';
            }

            const timeStr = r.validationTime ? `<span class="text-xs text-secondary-500">${r.validationTime}ms</span>` : '';
            const displayUrl = r.resolvedUrl || resolveUrl(r.url) || r.url;

            const methodClass = {
              'GET': 'bg-success-900/30 text-success-400',
              'POST': 'bg-primary-900/30 text-primary-400',
              'PUT': 'bg-info-900/30 text-info-400',
              'DELETE': 'bg-danger-900/30 text-danger-400',
              'PATCH': 'bg-secondary-900/30 text-secondary-300'
            }[r.method] || 'bg-surface-600 text-surface-0';

            return `
            <tr class="border-b border-surface-600 hover:bg-surface-700" data-idx="${idx}">
              <td class="px-2 py-2.5"><span class="px-2 py-0.5 rounded text-xs font-semibold ${methodClass}">${r.method}</span></td>
              <td class="px-2 py-2.5 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap" title="${r.name}">${r.name}</td>
              <td class="px-2 py-2.5 max-w-[350px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs" title="${displayUrl}">${displayUrl}</td>
              <td class="px-2 py-2.5">${hasAuth ? '<span class="px-2 py-0.5 rounded text-xs bg-primary-900/30 text-primary-400">AUTH</span>' : '-'}</td>
              <td class="px-2 py-2.5">${statusBadge} ${timeStr}</td>
              <td class="px-2 py-2.5">
                <button class="px-2.5 py-1 text-xs rounded bg-surface-600 text-surface-0 hover:bg-surface-500 mr-1 view-postman-btn" data-idx="${idx}">View</button>
                <button class="px-2.5 py-1 text-xs rounded bg-primary-700 text-surface-0 hover:bg-primary-600 mr-1 test-single-btn" data-idx="${idx}">Test</button>
                <button class="px-2.5 py-1 text-xs rounded bg-success-600 text-white hover:bg-success-500 import-btn ${r.importStatus === 'importing' ? 'opacity-50' : ''}" data-idx="${idx}" title="Send to Replay">${r.importStatus === 'importing' ? '...' : r.importStatus === 'done' ? 'Replay' : 'Replay'}</button>
              </td>
            </tr>
            <tr class="cp-row-details border-b border-surface-600" id="postman-details-${idx}">
              <td colspan="6" class="p-0">
                <div class="m-2 p-3 bg-surface-700 rounded-lg font-mono text-xs max-h-[400px] overflow-auto">
                  <div class="font-semibold text-primary-400 mb-2">Collection: ${r.collectionName}</div>
                  <div class="font-semibold text-primary-400 mt-2">Original URL</div>
                  <pre class="m-0 whitespace-pre-wrap break-all text-secondary-500">${r.url}</pre>
                  ${r.resolvedUrl ? `<div class="font-semibold text-primary-400 mt-2">Resolved URL</div><pre class="m-0 whitespace-pre-wrap break-all text-success-400">${r.resolvedUrl}</pre>` : ''}
                  <div class="font-semibold text-primary-400 mt-3">Request Headers</div>
                  <pre class="m-0 whitespace-pre-wrap break-all text-secondary-300">${formatHeaders(r.headers) || '<em>No headers</em>'}</pre>
                  <div class="font-semibold text-primary-400 mt-3">Request Body</div>
                  <pre class="m-0 whitespace-pre-wrap break-all text-secondary-300">${formatBody(r.body)}</pre>
                  ${r.importStatus === 'done' ? `
                    <div class="mt-4 pt-3 border-t border-surface-500">
                      <div class="font-semibold text-success-400 mb-2 flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                        Request sent to Replay tab - Click "Replay" to open
                      </div>
                    </div>
                  ` : ''}
                  ${r.importError ? `
                    <div class="mt-4 pt-3 border-t border-surface-500">
                      <div class="font-semibold text-danger-400 mb-2">ERROR</div>
                      <pre class="m-0 whitespace-pre-wrap break-all text-danger-400">${r.importError}</pre>
                    </div>
                  ` : ''}
                </div>
              </td>
            </tr>
          `}).join("")}
        </tbody>
      </table>
    </div>
  `;

  // Add event listeners
  resultsTable.querySelectorAll(".view-postman-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = (e.target as HTMLElement).getAttribute("data-idx");
      const detailsRow = document.getElementById(`postman-details-${idx}`);
      if (detailsRow) {
        detailsRow.classList.toggle("expanded");
        (e.target as HTMLButtonElement).textContent = detailsRow.classList.contains("expanded") ? "Hide" : "View";
      }
    });
  });

  resultsTable.querySelectorAll(".test-single-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const idx = parseInt((e.target as HTMLElement).getAttribute("data-idx") || "0");
      const request = postmanRequests[idx];

      if (request) {
        request.validationStatus = "testing";
        renderPostmanRequests(container);

        const result = await testEndpoint(request);

        if (result.status === 0) {
          request.validationStatus = "error";
        } else if (result.status >= 200 && result.status < 300) {
          request.validationStatus = "success";
        } else {
          request.validationStatus = "failed";
        }
        request.validationCode = result.status;
        request.validationTime = result.time;
        request.validationAuth = result.authValid;
        request.resolvedUrl = result.resolvedUrl;

        renderPostmanRequests(container);
      }
    });
  });

  // Import button - send request to Caido Replay
  resultsTable.querySelectorAll(".import-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const button = e.currentTarget as HTMLButtonElement;
      const idx = parseInt(button.getAttribute("data-idx") || "0");
      const request = postmanRequests[idx];

      if (request && request.importStatus !== 'importing') {
        request.importStatus = "importing";
        request.importError = undefined;
        renderPostmanRequests(container);

        // Resolve the URL
        const resolvedUrl = request.resolvedUrl || resolveUrl(request.url);
        request.resolvedUrl = resolvedUrl;

        try {
          // Parse URL to build raw HTTP request
          const parsedUrl = new URL(resolvedUrl);
          const host = parsedUrl.hostname;
          const isTLS = parsedUrl.protocol === "https:";
          const port = parsedUrl.port ? parseInt(parsedUrl.port) : (isTLS ? 443 : 80);
          const path = parsedUrl.pathname + parsedUrl.search;

          // Clean headers - remove Postman variables
          const cleanHeaders: Record<string, string> = {};
          for (const [key, value] of Object.entries(request.headers)) {
            if (value && !value.includes("{{") && !value.includes("[")) {
              cleanHeaders[key] = value;
            }
          }

          // Clean body
          let cleanBody = request.body || "";
          cleanBody = cleanBody.replace(/\{\{[^}]+\}\}/g, "test");

          // Build raw HTTP request
          let rawRequest = `${request.method} ${path || "/"} HTTP/1.1\r\n`;
          rawRequest += `Host: ${host}${port !== 443 && port !== 80 ? ":" + port : ""}\r\n`;

          for (const [key, value] of Object.entries(cleanHeaders)) {
            if (key.toLowerCase() !== "host") {
              rawRequest += `${key}: ${value}\r\n`;
            }
          }

          // Add Content-Length for POST/PUT/PATCH
          if (cleanBody && request.method !== "GET" && request.method !== "HEAD") {
            rawRequest += `Content-Length: ${new TextEncoder().encode(cleanBody).length}\r\n`;
          }

          rawRequest += "\r\n";

          if (cleanBody && request.method !== "GET" && request.method !== "HEAD") {
            rawRequest += cleanBody;
          }

          console.log("[CaidoPostman] Creating replay session for:", request.method, resolvedUrl);
          console.log("[CaidoPostman] Host:", host, "Port:", port, "TLS:", isTLS);

          // Create RequestSource with connectionInfo
          const requestSource = {
            raw: rawRequest,
            connectionInfo: {
              host: host,
              port: port,
              isTLS: isTLS
            }
          };

          // Create a new replay session with the raw request
          const session = await caidoInstance.replay.createSession(requestSource);

          if (session) {
            // Open the replay tab and select it
            await caidoInstance.replay.openTab(session.id, { select: true });

            // Navigate to the Replay page
            await caidoInstance.navigation.goTo("/replay");

            request.importStatus = "done";
            button.textContent = "Opened";
          } else {
            // Session might be created but returns void - try to navigate anyway
            await caidoInstance.navigation.goTo("/replay");
            request.importStatus = "done";
            button.textContent = "Opened";
          }
        } catch (err) {
          console.error("[CaidoPostman] Import error:", err);
          request.importStatus = "error";
          request.importError = String(err);
        }

        renderPostmanRequests(container);
      }
    });
  });
}

function renderResults(container: HTMLElement) {
  const resultsTable = container.querySelector("#resultsTable") as HTMLDivElement;
  const resultCount = container.querySelector("#resultCount") as HTMLSpanElement;
  const sendAllBtn = container.querySelector("#sendAllBtn") as HTMLButtonElement;
  const validateBtn = container.querySelector("#validateBtn") as HTMLButtonElement;

  resultCount.textContent = `(${currentRequests.length})`;

  if (currentRequests.length === 0) {
    resultsTable.innerHTML = '<div class="p-10 text-center text-secondary-500">No requests found. Try a different domain or filters.</div>';
    sendAllBtn.classList.add("hidden");
    validateBtn.classList.add("hidden");
    return;
  }

  sendAllBtn.classList.remove("hidden");
  validateBtn.classList.remove("hidden");

  resultsTable.innerHTML = `
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr>
          <th class="px-2 py-2.5 text-left text-xs uppercase text-secondary-400 font-semibold bg-surface-700">Method</th>
          <th class="px-2 py-2.5 text-left text-xs uppercase text-secondary-400 font-semibold bg-surface-700">Path</th>
          <th class="px-2 py-2.5 text-left text-xs uppercase text-secondary-400 font-semibold bg-surface-700">Original</th>
          <th class="px-2 py-2.5 text-left text-xs uppercase text-secondary-400 font-semibold bg-surface-700">Auth</th>
          <th class="px-2 py-2.5 text-left text-xs uppercase text-secondary-400 font-semibold bg-surface-700">Validation</th>
          <th class="px-2 py-2.5 text-left text-xs uppercase text-secondary-400 font-semibold bg-surface-700">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${currentRequests.map((r, idx) => {
          const methodClass = {
            'GET': 'bg-success-900/30 text-success-400',
            'POST': 'bg-primary-900/30 text-primary-400',
            'PUT': 'bg-info-900/30 text-info-400',
            'DELETE': 'bg-danger-900/30 text-danger-400',
            'PATCH': 'bg-secondary-900/30 text-secondary-300'
          }[r.method] || 'bg-surface-600 text-surface-0';

          return `
          <tr class="border-b border-surface-600 hover:bg-surface-700" data-idx="${idx}">
            <td class="px-2 py-2.5"><span class="px-2 py-0.5 rounded text-xs font-semibold ${methodClass}">${r.method}</span></td>
            <td class="px-2 py-2.5 max-w-[250px] overflow-hidden text-ellipsis whitespace-nowrap" title="${r.url}">${r.path}</td>
            <td class="px-2 py-2.5"><span class="px-2 py-0.5 rounded text-xs font-semibold ${r.statusCode === 200 ? 'bg-success-900/30 text-success-400' : 'bg-danger-900/30 text-danger-400'}">${r.statusCode}</span></td>
            <td class="px-2 py-2.5">${r.hasAuth && r.authType ? `<span class="px-2 py-0.5 rounded text-xs bg-primary-900/30 text-primary-400">${r.authType}</span>` : '-'}</td>
            <td class="px-2 py-2.5">
              <span class="px-2 py-0.5 rounded text-xs font-semibold ${
                r.validationStatus === 'active' ? 'bg-success-900/30 text-success-400' :
                r.validationStatus === 'inactive' ? 'bg-danger-900/30 text-danger-400' :
                r.validationStatus === 'error' ? 'bg-surface-500/50 text-secondary-400' : 'bg-primary-900/30 text-primary-400'
              }">
                ${r.validationStatus === 'active' ? r.validationCode :
                  r.validationStatus === 'inactive' ? r.validationCode :
                  r.validationStatus === 'error' ? 'Error' : 'Pending'}
              </span>
            </td>
            <td class="px-2 py-2.5">
              <button class="px-2.5 py-1 text-xs rounded bg-surface-600 text-surface-0 hover:bg-surface-500 mr-1 view-btn" data-idx="${idx}">View</button>
              <button class="px-2.5 py-1 text-xs rounded bg-primary-700 text-surface-0 hover:bg-primary-600 send-btn" data-idx="${idx}">Send</button>
            </td>
          </tr>
          <tr class="cp-row-details border-b border-surface-600" id="details-${idx}">
            <td colspan="6" class="p-0">
              <div class="m-2 p-3 bg-surface-700 rounded-lg font-mono text-xs max-h-[300px] overflow-auto">
                <div class="font-semibold text-primary-400 mb-2">Headers</div>
                <pre class="m-0 whitespace-pre-wrap break-all text-secondary-300">${formatHeaders(r.headers)}</pre>
                <div class="font-semibold text-primary-400 mt-3">Body</div>
                <pre class="m-0 whitespace-pre-wrap break-all text-secondary-300">${formatBody(r.body)}</pre>
              </div>
            </td>
          </tr>
        `}).join("")}
      </tbody>
    </table>
  `;

  resultsTable.querySelectorAll(".view-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = (e.target as HTMLElement).getAttribute("data-idx");
      const detailsRow = document.getElementById(`details-${idx}`);
      if (detailsRow) {
        detailsRow.classList.toggle("expanded");
        (e.target as HTMLButtonElement).textContent = detailsRow.classList.contains("expanded") ? "Hide" : "View";
      }
    });
  });

  resultsTable.querySelectorAll(".send-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const idx = parseInt((e.target as HTMLElement).getAttribute("data-idx") || "0");
      const request = currentRequests[idx];
      if (request) {
        (e.target as HTMLButtonElement).disabled = true;
        (e.target as HTMLButtonElement).textContent = "...";

        if (!postmanConfig.collectionId) {
          const collectionName = "Caido - " + request.host + " - " + new Date().toISOString().split("T")[0];
          postmanConfig.collectionId = await createPostmanCollection(postmanConfig.apiKey, collectionName) || undefined;
        }

        if (postmanConfig.collectionId) {
          const success = await addToPostmanCollection(postmanConfig.apiKey, postmanConfig.collectionId, request);
          (e.target as HTMLButtonElement).textContent = success ? "Done" : "Fail";
        } else {
          (e.target as HTMLButtonElement).textContent = "Fail";
        }
      }
    });
  });
}

// No hardcoded collections - all searches are now dynamic via Postman API Network

export function init(caido: Caido<API>) {
  try {
    caidoInstance = caido;
    injectStyles();

  const container = document.createElement("div");
  container.className = "p-5 font-sans text-surface-0 h-full overflow-y-auto box-border";
  container.innerHTML = `
    <!-- Header -->
    <div class="flex items-center gap-4 mb-6 pb-4 border-b border-surface-600">
      <div class="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="white"><circle cx="12" cy="12" r="5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="white" stroke-width="2"/></svg>
      </div>
      <div>
        <h1 class="m-0 text-2xl font-semibold text-surface-0">Caido Postman</h1>
        <span class="text-primary-500 text-sm">by @OFJAAAH</span>
      </div>
      <div id="connectedBadge" class="hidden ml-auto inline-flex items-center gap-1.5 px-3 py-1 bg-success-900/30 text-success-400 rounded-full text-xs">Connected</div>
    </div>

    <!-- Connect Section -->
    <div class="bg-surface-800 border border-surface-600 rounded-lg mb-4" id="connectSection">
      <div class="px-4 py-3 bg-surface-700 font-semibold flex items-center gap-2 rounded-t-lg text-surface-0">${postmanLogoSmall} Connect to Postman</div>
      <div class="p-4">
        <div class="mb-4">
          <label class="block mb-1.5 text-sm text-secondary-400 font-medium">Postman API Key</label>
          <input type="text" id="apiKeyInput" placeholder="PMAK-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" class="w-full px-3 py-2.5 bg-surface-700 border border-surface-500 rounded-md text-surface-0 text-sm focus:outline-none focus:border-primary-500 transition-colors" />
          <small class="block mt-1 text-xs text-secondary-500">Get your API key from <a href="https://go.postman.co/settings/me/api-keys" target="_blank" class="text-primary-500 no-underline hover:underline">Postman Settings</a></small>
        </div>
        <div class="flex gap-2">
          <button id="connectBtn" class="px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer inline-flex items-center gap-2 bg-primary-700 text-surface-0 border border-primary-700 hover:bg-primary-600 transition-colors">${postmanLogoSmall} Connect to Postman</button>
          <button id="logoutBtn" class="hidden px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer bg-secondary-400 text-surface-0 border border-secondary-400 hover:bg-secondary-300 transition-colors">Logout</button>
        </div>
        <div id="connectStatus"></div>
      </div>
    </div>

    <!-- Filter Section -->
    <div class="hidden bg-surface-800 border border-surface-600 rounded-lg mb-4" id="filterSection">
      <div class="px-4 py-3 bg-surface-700 font-semibold flex items-center gap-2 rounded-t-lg text-surface-0">Search Postman Public API Network</div>
      <div class="p-4">
        <div class="flex gap-4 flex-wrap mb-4">
          <div class="flex-[2] min-w-[120px]">
            <label class="block mb-1.5 text-sm text-secondary-400 font-medium">API Name / Company</label>
            <input type="text" id="domainInput" placeholder="dhl, stripe, github, twitter..." class="w-full px-3 py-2.5 bg-surface-700 border border-surface-500 rounded-md text-surface-0 text-sm focus:outline-none focus:border-primary-500 transition-colors" />
          </div>
          <div class="flex-1 min-w-[120px]">
            <label class="block mb-1.5 text-sm text-secondary-400 font-medium">Filter by Domain</label>
            <input type="text" id="domainFilterInput" placeholder="api.dhl.com..." class="w-full px-3 py-2.5 bg-surface-700 border border-surface-500 rounded-md text-surface-0 text-sm focus:outline-none focus:border-primary-500 transition-colors" />
          </div>
          <div class="flex-1 min-w-[120px]">
            <label class="block mb-1.5 text-sm text-secondary-400 font-medium">Method</label>
            <select id="methodSelect" class="w-full px-3 py-2.5 bg-surface-700 border border-surface-500 rounded-md text-surface-0 text-sm focus:outline-none focus:border-primary-500 transition-colors">
              <option value="ALL">All</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
        </div>
        <div class="flex gap-2 flex-wrap mb-3">
          <button id="searchPublicBtn" class="px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer inline-flex items-center gap-2 bg-primary-700 text-surface-0 border border-primary-700 hover:bg-primary-600 transition-colors">Search Public APIs</button>
          <button id="fetchCollectionsBtn" class="px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer inline-flex items-center gap-2 bg-success-600 text-white border border-success-600 hover:bg-success-500 transition-colors">${postmanLogoSmall} My Collections</button>
        </div>
        <div class="text-xs text-secondary-500 mb-2">
          <strong>Tip:</strong> Search any API (e.g., slack, paypal, stripe, uber, google, aws, azure, facebook, etc.)
        </div>
        <div id="fetchStatus"></div>
      </div>
    </div>

    <!-- My Collections Section -->
    <div class="hidden bg-surface-800 border border-surface-600 rounded-lg mb-4" id="myCollectionsSection">
      <div class="px-4 py-3 bg-surface-700 font-semibold flex items-center gap-2 rounded-t-lg text-surface-0">
        ${postmanLogoSmall} My Collections
        <span id="collectionsCount" class="text-secondary-400 text-sm font-normal">(0)</span>
        <button id="closeCollectionsBtn" class="ml-auto px-2 py-1 text-xs rounded bg-surface-600 text-secondary-400 hover:bg-surface-500 hover:text-surface-0 transition-colors">Close</button>
        <button id="refreshCollectionsBtn" class="px-2 py-1 text-xs rounded bg-primary-700 text-surface-0 hover:bg-primary-600 transition-colors">Refresh</button>
      </div>
      <div class="p-4">
        <div id="collectionsLoadingStatus" class="hidden mb-3"></div>
        <div id="collectionsList" class="max-h-[300px] overflow-y-auto">
          <div class="text-center text-secondary-500 py-4">Loading your collections...</div>
        </div>
      </div>
    </div>

    <!-- Results Section -->
    <div class="hidden bg-surface-800 border border-surface-600 rounded-lg mb-4" id="resultsSection">
      <div class="px-4 py-3 bg-surface-700 font-semibold flex items-center gap-2 rounded-t-lg text-surface-0">
        Results <span id="resultCount" class="text-secondary-400">(0)</span>
        <div class="ml-auto flex gap-2">
          <button id="validateBtn" class="hidden px-3 py-1.5 text-xs rounded-md bg-success-500 text-white hover:bg-success-600 transition-colors">Auto Test All</button>
          <button id="sendAllBtn" class="hidden px-3 py-1.5 text-xs rounded-md bg-primary-700 text-surface-0 hover:bg-primary-600 inline-flex items-center gap-1 transition-colors">${postmanLogoSmall} Send All</button>
        </div>
      </div>
      <div class="p-4">
        <div id="statsContainer" class="flex gap-4 mb-4 flex-wrap"></div>
        <div id="resultsTable"></div>
      </div>
    </div>
  `;

  // Get elements
  const apiKeyInput = container.querySelector("#apiKeyInput") as HTMLInputElement;
  const connectBtn = container.querySelector("#connectBtn") as HTMLButtonElement;
  const logoutBtn = container.querySelector("#logoutBtn") as HTMLButtonElement;
  const connectStatus = container.querySelector("#connectStatus") as HTMLDivElement;
  const connectedBadge = container.querySelector("#connectedBadge") as HTMLDivElement;
  const filterSection = container.querySelector("#filterSection") as HTMLDivElement;
  const resultsSection = container.querySelector("#resultsSection") as HTMLDivElement;
  const domainInput = container.querySelector("#domainInput") as HTMLInputElement;
  const domainFilterInput = container.querySelector("#domainFilterInput") as HTMLInputElement;
  const methodSelect = container.querySelector("#methodSelect") as HTMLSelectElement;
  const searchPublicBtn = container.querySelector("#searchPublicBtn") as HTMLButtonElement;
  const fetchCollectionsBtn = container.querySelector("#fetchCollectionsBtn") as HTMLButtonElement;
  const fetchStatus = container.querySelector("#fetchStatus") as HTMLDivElement;
  const sendAllBtn = container.querySelector("#sendAllBtn") as HTMLButtonElement;
  const validateBtn = container.querySelector("#validateBtn") as HTMLButtonElement;

  // My Collections elements
  const myCollectionsSection = container.querySelector("#myCollectionsSection") as HTMLDivElement;
  const collectionsCount = container.querySelector("#collectionsCount") as HTMLSpanElement;
  const closeCollectionsBtn = container.querySelector("#closeCollectionsBtn") as HTMLButtonElement;
  const refreshCollectionsBtn = container.querySelector("#refreshCollectionsBtn") as HTMLButtonElement;
  const collectionsLoadingStatus = container.querySelector("#collectionsLoadingStatus") as HTMLDivElement;
  const collectionsList = container.querySelector("#collectionsList") as HTMLDivElement;

  // Function to render collections list
  function renderCollectionsList() {
    collectionsCount.textContent = `(${postmanCollections.length})`;

    if (postmanCollections.length === 0) {
      collectionsList.innerHTML = '<div class="text-center text-secondary-500 py-4">No collections found in your Postman account.</div>';
      return;
    }

    collectionsList.innerHTML = `
      <div class="space-y-2">
        ${postmanCollections.map((col, idx) => `
          <div class="flex items-center justify-between p-3 bg-surface-700 rounded-lg border border-surface-600 hover:border-primary-500 transition-colors cursor-pointer collection-item ${selectedCollection?.uid === col.uid ? 'border-primary-500 bg-surface-600' : ''}" data-idx="${idx}">
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <div class="w-8 h-8 bg-primary-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                ${postmanLogoSmall}
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-medium text-surface-0 truncate" title="${col.name}">${col.name}</div>
                <div class="text-xs text-secondary-500">ID: ${col.uid}</div>
              </div>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button class="px-3 py-1.5 text-xs rounded bg-primary-700 text-surface-0 hover:bg-primary-600 transition-colors load-collection-btn" data-uid="${col.uid}" data-name="${col.name}">
                Load Requests
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Add click handlers for collection items
    collectionsList.querySelectorAll('.collection-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Don't trigger if clicking the Load button
        if (target.classList.contains('load-collection-btn')) return;

        const idx = parseInt(item.getAttribute('data-idx') || '0');
        selectedCollection = postmanCollections[idx] || null;
        renderCollectionsList();
      });
    });

    // Add click handlers for Load buttons
    collectionsList.querySelectorAll('.load-collection-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const button = e.currentTarget as HTMLButtonElement;
        const uid = button.getAttribute('data-uid') || '';
        const name = button.getAttribute('data-name') || 'Collection';

        button.disabled = true;
        button.innerHTML = '<span class="cp-spinner cp-spinner-sm"></span>';

        collectionsLoadingStatus.classList.remove('hidden');
        collectionsLoadingStatus.innerHTML = `<div class="p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">Loading requests from "${name}"...</div>`;

        try {
          const collectionData = await caidoInstance.backend.fetchPostmanCollection(uid, postmanConfig.apiKey);

          if (collectionData && collectionData.requests) {
            postmanRequests = collectionData.requests.map((req: any) => ({
              id: req.id,
              name: req.name,
              method: req.method,
              url: req.url,
              headers: req.headers,
              body: req.body,
              collectionName: collectionData.name
            }));

            // Apply method filter if selected
            const methodFilter = methodSelect.value;
            if (methodFilter !== "ALL") {
              postmanRequests = postmanRequests.filter(r => r.method === methodFilter);
            }

            collectionsLoadingStatus.innerHTML = `<div class="p-3 rounded-md text-sm bg-success-900/30 border border-success-500 text-success-400">Loaded ${postmanRequests.length} requests from "${name}"</div>`;

            // Show results section and render
            resultsSection.classList.remove('hidden');
            renderPostmanRequests(container);

            // Update selected collection
            selectedCollection = postmanCollections.find(c => c.uid === uid) || null;
            renderCollectionsList();
          } else {
            collectionsLoadingStatus.innerHTML = `<div class="p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">No requests found in "${name}"</div>`;
          }
        } catch (err) {
          collectionsLoadingStatus.innerHTML = `<div class="p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">Error loading collection: ${err}</div>`;
        }

        button.disabled = false;
        button.textContent = 'Load Requests';
      });
    });
  }

  // Function to load user's collections
  async function loadMyCollections() {
    collectionsLoadingStatus.classList.remove('hidden');
    collectionsLoadingStatus.innerHTML = '<div class="p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">Loading your collections...</div>';
    collectionsList.innerHTML = '<div class="text-center text-secondary-500 py-4"><span class="cp-spinner"></span> Loading...</div>';

    try {
      const collections = await caidoInstance.backend.fetchMyCollections(postmanConfig.apiKey);
      postmanCollections = collections.map((c: any) => ({
        id: c.id,
        uid: c.uid,
        name: c.name,
        owner: c.owner || ''
      }));

      collectionsLoadingStatus.classList.add('hidden');
      renderCollectionsList();
    } catch (err) {
      collectionsLoadingStatus.innerHTML = `<div class="p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">Error: ${err}</div>`;
      collectionsList.innerHTML = '<div class="text-center text-danger-400 py-4">Failed to load collections</div>';
    }
  }

  // Load saved API key
  const savedKey = localStorage.getItem("postman-api-key");
  if (savedKey) apiKeyInput.value = savedKey;

  // Connect button
  connectBtn.onclick = async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      connectStatus.innerHTML = '<div class="mt-4 p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">Please enter your API Key</div>';
      return;
    }

    connectBtn.disabled = true;
    connectBtn.innerHTML = '<span class="cp-spinner"></span> Connecting...';
    connectStatus.innerHTML = '<div class="mt-4 p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">Connecting to Postman...</div>';

    const result = await testPostmanAPI(apiKey);

    if (result.success) {
      postmanConfig.apiKey = apiKey;
      localStorage.setItem("postman-api-key", apiKey);

      let usageWarning = "";
      if (result.apiUsage) {
        const { limit, usage } = result.apiUsage;
        const percent = Math.round((usage / limit) * 100);
        if (usage >= limit) {
          usageWarning = `<div class="mt-2 p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">API LIMIT REACHED: ${usage}/${limit} requests (${percent}%)</div>`;
        } else if (percent > 80) {
          usageWarning = `<div class="mt-2 p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">API Usage: ${usage}/${limit} (${percent}%)</div>`;
        }
      }

      connectStatus.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-success-900/30 border border-success-500 text-success-400">${result.message}</div>${usageWarning}`;
      connectedBadge.classList.remove("hidden");
      filterSection.classList.remove("hidden");
      resultsSection.classList.remove("hidden");
      connectBtn.classList.add("hidden");
      logoutBtn.classList.remove("hidden");
      apiKeyInput.disabled = true;
    } else {
      connectStatus.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">${result.message}</div>`;
      connectBtn.disabled = false;
      connectBtn.innerHTML = `${postmanLogoSmall} Connect to Postman`;
    }
  };

  // Logout button
  logoutBtn.onclick = () => {
    postmanConfig = { apiKey: "", workspaceId: "" };
    postmanRequests = [];
    postmanCollections = [];
    currentRequests = [];
    selectedCollection = null;
    myCollectionsVisible = false;
    localStorage.removeItem("postman-api-key");

    apiKeyInput.value = "";
    apiKeyInput.disabled = false;
    connectStatus.innerHTML = "";
    connectedBadge.classList.add("hidden");
    filterSection.classList.add("hidden");
    resultsSection.classList.add("hidden");
    myCollectionsSection.classList.add("hidden");
    connectBtn.classList.remove("hidden");
    connectBtn.disabled = false;
    connectBtn.innerHTML = `${postmanLogoSmall} Connect to Postman`;
    logoutBtn.classList.add("hidden");
    fetchCollectionsBtn.innerHTML = `${postmanLogoSmall} My Collections`;
    fetchCollectionsBtn.classList.remove('bg-secondary-600', 'border-secondary-600', 'hover:bg-secondary-500');
    fetchCollectionsBtn.classList.add('bg-success-600', 'border-success-600', 'hover:bg-success-500');

    const resultsTable = container.querySelector("#resultsTable") as HTMLDivElement;
    const resultCount = container.querySelector("#resultCount") as HTMLSpanElement;
    if (resultsTable) resultsTable.innerHTML = "";
    if (resultCount) resultCount.textContent = "(0)";
    if (fetchStatus) fetchStatus.innerHTML = "";
    if (collectionsList) collectionsList.innerHTML = "";
    if (collectionsCount) collectionsCount.textContent = "(0)";
  };

  // Search Public APIs
  searchPublicBtn.onclick = async () => {
    const query = domainInput.value.trim().toLowerCase();
    const domainFilter = domainFilterInput.value.trim().toLowerCase();

    if (!query) {
      fetchStatus.innerHTML = '<div class="mt-4 p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">Please enter a search query</div>';
      return;
    }

    currentSearchContext = query.split(/[^a-z]/)[0] || "default";

    searchPublicBtn.disabled = true;
    searchPublicBtn.innerHTML = '<span class="cp-spinner"></span> Searching...';
    fetchStatus.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">Searching Postman Public API Network for "${query}"...</div>`;

    try {
      postmanRequests = [];
      let collectionsLoaded = 0;

      // Search Postman Public API Network via backend (avoids CORS)
      console.log("[CaidoPostman] Calling backend search...");
      const searchResults = await caidoInstance.backend.searchPostmanPublicNetwork(query);
      console.log("[CaidoPostman] Search results:", searchResults.length, "collections found");

      const collectionsToLoad = searchResults.map((r: any) => ({ id: r.id, name: r.name }));

      console.log("[CaidoPostman] Total collections to load:", collectionsToLoad.length);

      if (collectionsToLoad.length === 0) {
        fetchStatus.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">No collections found for "${query}". Try different keywords like: stripe, paypal, uber, github, twitter, slack</div>`;
        searchPublicBtn.disabled = false;
        searchPublicBtn.innerHTML = 'Search Public APIs';
        return;
      }

      fetchStatus.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">Found ${collectionsToLoad.length} collections. Loading requests...</div>`;

      // Fetch each collection via backend
      for (const col of collectionsToLoad) {
        try {
          console.log("[CaidoPostman] Fetching collection:", col.id);
          const collectionData = await caidoInstance.backend.fetchPostmanCollection(col.id, postmanConfig.apiKey);

          if (collectionData && collectionData.requests) {
            collectionsLoaded++;
            for (const req of collectionData.requests) {
              postmanRequests.push({
                id: req.id,
                name: req.name,
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: req.body,
                collectionName: collectionData.name
              });
            }
            fetchStatus.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">Loading... ${collectionsLoaded}/${collectionsToLoad.length} collections (${postmanRequests.length} requests)</div>`;
          }
        } catch (e) {
          console.log("[CaidoPostman] Error fetching collection:", col.id, e);
        }
      }

      const methodFilter = methodSelect.value;
      if (methodFilter !== "ALL") {
        postmanRequests = postmanRequests.filter(r => r.method === methodFilter);
      }

      if (domainFilter) {
        postmanRequests = postmanRequests.filter(r => {
          const url = (r.resolvedUrl || r.url).toLowerCase();
          return url.includes(domainFilter) || r.name.toLowerCase().includes(domainFilter);
        });
      }

      fetchStatus.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-success-900/30 border border-success-500 text-success-400">Found ${postmanRequests.length} requests from ${collectionsLoaded} collections</div>`;

      if (postmanRequests.length > 0) {
        renderPostmanRequests(container);
      } else {
        const resultsTable = container.querySelector("#resultsTable") as HTMLDivElement;
        resultsTable.innerHTML = `<div class="p-10 text-center text-secondary-500">No requests found for "${query}"</div>`;
      }

    } catch (err) {
      fetchStatus.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">Error: ${err}</div>`;
    }

    searchPublicBtn.disabled = false;
    searchPublicBtn.innerHTML = 'Search Public APIs';
  };

  // Toggle My Collections section
  fetchCollectionsBtn.onclick = async () => {
    myCollectionsVisible = !myCollectionsVisible;

    if (myCollectionsVisible) {
      myCollectionsSection.classList.remove('hidden');
      fetchCollectionsBtn.innerHTML = `${postmanLogoSmall} Hide Collections`;
      fetchCollectionsBtn.classList.remove('bg-success-600', 'border-success-600', 'hover:bg-success-500');
      fetchCollectionsBtn.classList.add('bg-secondary-600', 'border-secondary-600', 'hover:bg-secondary-500');

      // Load collections if not already loaded
      if (postmanCollections.length === 0) {
        await loadMyCollections();
      }
    } else {
      myCollectionsSection.classList.add('hidden');
      fetchCollectionsBtn.innerHTML = `${postmanLogoSmall} My Collections`;
      fetchCollectionsBtn.classList.remove('bg-secondary-600', 'border-secondary-600', 'hover:bg-secondary-500');
      fetchCollectionsBtn.classList.add('bg-success-600', 'border-success-600', 'hover:bg-success-500');
    }
  };

  // Close collections section
  closeCollectionsBtn.onclick = () => {
    myCollectionsVisible = false;
    myCollectionsSection.classList.add('hidden');
    fetchCollectionsBtn.innerHTML = `${postmanLogoSmall} My Collections`;
    fetchCollectionsBtn.classList.remove('bg-secondary-600', 'border-secondary-600', 'hover:bg-secondary-500');
    fetchCollectionsBtn.classList.add('bg-success-600', 'border-success-600', 'hover:bg-success-500');
  };

  // Refresh collections
  refreshCollectionsBtn.onclick = async () => {
    refreshCollectionsBtn.disabled = true;
    refreshCollectionsBtn.innerHTML = '<span class="cp-spinner cp-spinner-sm"></span>';
    postmanCollections = [];
    selectedCollection = null;
    await loadMyCollections();
    refreshCollectionsBtn.disabled = false;
    refreshCollectionsBtn.textContent = 'Refresh';
  };

  // Validate All button
  validateBtn.onclick = async () => {
    if (postmanRequests.length > 0) {
      validateBtn.disabled = true;
      let tested = 0;

      const batchSize = 5;
      for (let i = 0; i < postmanRequests.length; i += batchSize) {
        const batch = postmanRequests.slice(i, i + batchSize);
        batch.forEach(r => r.validationStatus = "testing");
        renderPostmanRequests(container);
        validateBtn.innerHTML = `<span class="cp-spinner"></span> ${tested}/${postmanRequests.length}`;

        const results = await Promise.all(batch.map(r => testEndpoint(r)));

        batch.forEach((r, idx) => {
          const result = results[idx];
          if (result.status === 0) {
            r.validationStatus = "error";
          } else if (result.status >= 200 && result.status < 300) {
            r.validationStatus = "success";
          } else {
            r.validationStatus = "failed";
          }
          r.validationCode = result.status;
          r.validationTime = result.time;
          r.validationAuth = result.authValid;
          r.resolvedUrl = result.resolvedUrl;
          tested++;
        });

        renderPostmanRequests(container);
      }

      validateBtn.disabled = false;
      validateBtn.innerHTML = "Auto Test All";
      return;
    }

    if (currentRequests.length === 0) return;

    validateBtn.disabled = true;
    validateBtn.innerHTML = '<span class="cp-spinner"></span> Validating...';

    for (let i = 0; i < currentRequests.length; i++) {
      const request = currentRequests[i];
      try {
        const result = await caidoInstance.backend.replayRequest(request.id);
        if (result.success) {
          currentRequests[i].validationStatus = result.statusCode === 200 ? "active" : "inactive";
          currentRequests[i].validationCode = result.statusCode;
        } else {
          currentRequests[i].validationStatus = "error";
        }
      } catch {
        currentRequests[i].validationStatus = "error";
      }
      renderResults(container);
    }

    validateBtn.disabled = false;
    validateBtn.innerHTML = "Validate All";
  };

  // Send All button
  sendAllBtn.onclick = async () => {
    if (currentRequests.length === 0) return;

    sendAllBtn.disabled = true;
    sendAllBtn.innerHTML = '<span class="cp-spinner"></span> Sending...';

    let sent = 0;
    let failed = 0;

    if (!postmanConfig.collectionId) {
      const domain = domainInput.value.trim() || "requests";
      const collectionName = "Caido - " + domain + " - " + new Date().toISOString().split("T")[0];
      postmanConfig.collectionId = await createPostmanCollection(postmanConfig.apiKey, collectionName) || undefined;
    }

    if (postmanConfig.collectionId) {
      for (const request of currentRequests) {
        const success = await addToPostmanCollection(postmanConfig.apiKey, postmanConfig.collectionId, request);
        if (success) sent++;
        else failed++;
      }
    }

    sendAllBtn.innerHTML = failed === 0 ? `Sent ${sent}` : `${sent} sent, ${failed} failed`;
    setTimeout(() => {
      sendAllBtn.innerHTML = `${postmanLogoSmall} Send All`;
      sendAllBtn.disabled = false;
    }, 3000);
  };

  // Register page
  caido.navigation.addPage("/postman", {
    body: container,
    topbar: () => {
      const el = document.createElement("div");
      el.innerHTML = `<span class="flex items-center gap-2">${postmanLogoSmall} Postman Integration</span>`;
      return el;
    }
  });

  caido.sidebar.registerItem("Postman", "/postman", { icon: "rocket", group: "Tools" });
  } catch (error) {
    console.error("[CaidoPostman] Init error:", error);
  }
}
