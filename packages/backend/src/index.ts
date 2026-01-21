import { SDK, DefineAPI } from "caido:plugin";
import { RequestSpec } from "caido:utils";

// Interfaces
interface PostmanSearchResult {
  id: string;
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
  queryParams?: Array<{ key: string; value: string }>;
  auth?: {
    type: string;
    data: Record<string, string>;
  };
  description?: string;
}

interface PostmanCollectionData {
  id: string;
  name: string;
  requests: PostmanRequest[];
}

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
}

interface ReplayResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

interface ImportResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  error?: string;
  time?: number;
}

// Detect authentication in request
function detectAuthentication(headers: Record<string, string>): { hasAuth: boolean; authType: string } {
  const headerMap: Record<string, string> = {};
  Object.entries(headers).forEach(([k, v]) => {
    headerMap[k.toLowerCase()] = v;
  });

  const authHeader = headerMap["authorization"];
  if (authHeader) {
    if (authHeader.toLowerCase().startsWith("bearer")) {
      return { hasAuth: true, authType: "Bearer Token" };
    }
    if (authHeader.toLowerCase().startsWith("basic")) {
      return { hasAuth: true, authType: "Basic Auth" };
    }
    if (authHeader.toLowerCase().startsWith("digest")) {
      return { hasAuth: true, authType: "Digest Auth" };
    }
    return { hasAuth: true, authType: "Custom Auth" };
  }

  const apiKeyHeaders = ["x-api-key", "api-key", "apikey", "x-auth-token", "x-access-token", "x-token"];
  for (const key of apiKeyHeaders) {
    if (headerMap[key]) {
      return { hasAuth: true, authType: "API Key" };
    }
  }

  const cookie = headerMap["cookie"];
  if (cookie && (cookie.includes("session") || cookie.includes("token") || cookie.includes("auth") || cookie.includes("jwt") || cookie.includes("sid"))) {
    return { hasAuth: true, authType: "Cookie/Session" };
  }

  if (headerMap["x-csrf-token"] || headerMap["x-xsrf-token"]) {
    return { hasAuth: true, authType: "CSRF Token" };
  }

  return { hasAuth: false, authType: "" };
}

// Function: Filter history by domain
async function filterHistory(sdk: SDK, domain: string, statusCodeStr: string, methodFilter: string): Promise<FilteredRequest[]> {
  sdk.console.log("=== Caido Postman: Filtering history ===");
  sdk.console.log("Domain: " + (domain || "(all)"));

  const statusCode = statusCodeStr && statusCodeStr !== "" ? parseInt(statusCodeStr, 10) : 0;
  const requests: FilteredRequest[] = [];

  try {
    let query = sdk.requests.query().first(500);

    if (domain && domain.trim() !== "") {
      query = query.filter(`host.cont:"${domain.trim()}"`);
    }

    const result = await query.execute();
    sdk.console.log("Query returned " + result.items.length + " items");

    for (const item of result.items) {
      try {
        const request = item.request;
        const response = item.response;

        if (!response) continue;

        const responseCode = response.getCode();
        if (statusCode !== 0 && responseCode !== statusCode) continue;

        const method = request.getMethod() || "GET";
        if (methodFilter && methodFilter !== "ALL" && method !== methodFilter) continue;

        const headersObj = request.getHeaders() || {};
        const headers: Record<string, string> = {};
        for (const [key, values] of Object.entries(headersObj)) {
          if (key && values) {
            headers[key] = Array.isArray(values) ? values.join(", ") : String(values);
          }
        }

        const authInfo = detectAuthentication(headers);

        let body: string | null = null;
        try {
          const bodyObj = request.getBody();
          if (bodyObj) {
            body = bodyObj.toText() || null;
          }
        } catch {
          body = null;
        }

        const isTls = request.getTls() || false;
        const host = request.getHost() || "unknown";
        const port = request.getPort() || (isTls ? 443 : 80);
        const path = request.getPath() || "/";
        const query_str = request.getQuery() || "";

        let url = (isTls ? "https" : "http") + "://" + host;
        if ((isTls && port !== 443) || (!isTls && port !== 80)) {
          url += ":" + port;
        }
        url += path;
        if (query_str) {
          url += "?" + query_str;
        }

        const id = request.getId() || `req-${Date.now()}-${Math.random()}`;

        let timestamp: string;
        try {
          timestamp = request.getCreatedAt()?.toISOString() || new Date().toISOString();
        } catch {
          timestamp = new Date().toISOString();
        }

        requests.push({
          id,
          method,
          url,
          host,
          path,
          headers,
          body: body || "",
          statusCode: responseCode,
          hasAuth: authInfo.hasAuth,
          authType: authInfo.authType || "",
          timestamp
        });
      } catch (itemError) {
        sdk.console.log("Error processing item: " + itemError);
        continue;
      }
    }

    requests.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    sdk.console.log("Total filtered requests: " + requests.length);
    return requests;
  } catch (error) {
    sdk.console.log("Error filtering history: " + error);
    return [];
  }
}

// Function: Replay a request
async function replayRequest(sdk: SDK, requestId: string): Promise<ReplayResult> {
  sdk.console.log("Replaying request: " + requestId);

  try {
    const requestResponse = await sdk.requests.get(requestId);

    if (!requestResponse) {
      return { success: false, error: "Request not found" };
    }

    // Handle both possible response structures
    const originalRequest = (requestResponse as any).request || requestResponse;

    if (!originalRequest || typeof originalRequest.toSpec !== 'function') {
      sdk.console.log("Invalid request object structure");
      return { success: false, error: "Invalid request structure" };
    }

    const spec = originalRequest.toSpec();
    const result = await sdk.requests.send(spec);

    const statusCode = result.response.getCode();
    sdk.console.log("Replay result: " + statusCode);

    return { success: true, statusCode };
  } catch (error) {
    sdk.console.log("Error replaying request: " + error);
    return { success: false, error: String(error) };
  }
}

// Function: Import and send a request from Postman
async function importAndSendRequest(sdk: SDK, method: string, url: string, headersJson: string, body: string): Promise<ImportResult> {
  sdk.console.log("=== Importing and sending request ===");
  sdk.console.log("Method: " + method);
  sdk.console.log("URL: " + url);

  const startTime = Date.now();

  try {
    if (!url || !url.startsWith("http")) {
      return { success: false, error: "Invalid URL: " + url };
    }

    let headers: Record<string, string> = {};
    try {
      if (headersJson && headersJson !== "{}") {
        headers = JSON.parse(headersJson);
      }
    } catch {
      sdk.console.log("Failed to parse headers");
    }

    // Create RequestSpec from URL
    const spec = new RequestSpec(url);
    spec.setMethod(method);

    // Set headers
    for (const [key, value] of Object.entries(headers)) {
      if (key && value && key.toLowerCase() !== "host") {
        spec.setHeader(key, value);
      }
    }

    // Set body for non-GET requests
    if (body && method !== "GET" && method !== "HEAD") {
      spec.setBody(body);
    }

    sdk.console.log("Sending request via Caido...");

    // Send the request
    const result = await sdk.requests.send(spec);

    const responseTime = Date.now() - startTime;
    const response = result.response;
    const statusCode = response.getCode();

    sdk.console.log("Response: " + statusCode + " (" + responseTime + "ms)");

    // Get response headers
    const respHeaders: Record<string, string> = {};
    try {
      const headersObj = response.getHeaders();
      for (const [key, values] of Object.entries(headersObj)) {
        if (key && values) {
          respHeaders[key] = Array.isArray(values) ? values.join(", ") : String(values);
        }
      }
    } catch (e) {
      sdk.console.log("Error getting headers: " + e);
    }

    // Get response body
    let responseBody = "";
    try {
      const bodyObj = response.getBody();
      if (bodyObj) {
        const fullBody = bodyObj.toText() || "";
        responseBody = fullBody.length > 10000 ? fullBody.substring(0, 10000) + "...(truncated)" : fullBody;
      }
    } catch (e) {
      sdk.console.log("Error getting body: " + e);
    }

    return {
      success: true,
      statusCode,
      responseBody,
      responseHeaders: respHeaders,
      time: responseTime
    };

  } catch (error) {
    sdk.console.log("Error sending request: " + error);
    return {
      success: false,
      error: String(error),
      time: Date.now() - startTime
    };
  }
}

// Function: Search Postman Public API Network - UNLIMITED PAGINATION
async function searchPostmanPublicNetwork(sdk: SDK, query: string): Promise<PostmanSearchResult[]> {
  sdk.console.log("=== Searching Postman Public Network for: " + query + " (UNLIMITED) ===");
  const results: PostmanSearchResult[] = [];

  const PAGE_SIZE = 25; // Maximum allowed by Postman API (must be < 26)
  const MAX_PAGES = 2000; // Safety limit: 2000 pages * 25 results = 50,000 max results
  let currentPage = 0;
  let hasMoreResults = true;

  while (hasMoreResults && currentPage < MAX_PAGES) {
    const offset = currentPage * PAGE_SIZE;

    try {
      sdk.console.log(`Searching page ${currentPage + 1} (offset: ${offset})...`);

      const spec = new RequestSpec("https://www.postman.com/_api/ws/proxy");
      spec.setMethod("POST");
      spec.setHeader("Content-Type", "application/json");
      spec.setHeader("Accept", "application/json");
      spec.setBody(JSON.stringify({
        service: "search",
        method: "POST",
        path: "/search-all",
        body: {
          queryIndices: ["runtime.collection", "runtime.request", "adp.api", "flow.flow", "apinetwork.team"],
          queryText: query,
          size: PAGE_SIZE,
          from: offset,
          domain: "public"
        }
      }));

      const result = await sdk.requests.send(spec);
      const responseBody = result.response.getBody()?.toText() || "";
      const statusCode = result.response.getCode();

      if (statusCode === 200 && responseBody) {
        const data = JSON.parse(responseBody);

        // The API returns { data: { collection: [...], request: [...], ... } } format
        let allItems: any[] = [];
        let totalInPage = 0;

        if (data.data) {
          if (Array.isArray(data.data)) {
            allItems = data.data;
            totalInPage = allItems.length;
          } else {
            // Collect from all indices: collection, request, api, flow, team
            if (data.data.collection && Array.isArray(data.data.collection)) {
              allItems = allItems.concat(data.data.collection);
            }
            if (data.data.request && Array.isArray(data.data.request)) {
              allItems = allItems.concat(data.data.request);
            }
            if (data.data.api && Array.isArray(data.data.api)) {
              allItems = allItems.concat(data.data.api);
            }
            if (data.data.flow && Array.isArray(data.data.flow)) {
              allItems = allItems.concat(data.data.flow);
            }
            if (data.data.team && Array.isArray(data.data.team)) {
              allItems = allItems.concat(data.data.team);
            }
            totalInPage = allItems.length;
          }
        }

        sdk.console.log(`Page ${currentPage + 1}: Found ${totalInPage} items`);

        // If we got less than PAGE_SIZE, we've reached the end
        if (totalInPage < PAGE_SIZE) {
          hasMoreResults = false;
        }

        // If no results at all, stop
        if (totalInPage === 0) {
          hasMoreResults = false;
          break;
        }

        for (const item of allItems) {
          const doc = item.document || item;

          if (doc) {
            // Extract ID - handle various formats
            let itemId = "";
            if (typeof doc.id === "string") {
              itemId = doc.id;
            } else if (doc.id && typeof doc.id === "object") {
              itemId = doc.id.toString();
            } else if (doc.entityId) {
              itemId = String(doc.entityId);
            }

            // Extract collection ID for requests
            let collectionId = "";
            if (typeof doc.collection === "string") {
              collectionId = doc.collection;
            } else if (doc.collection && typeof doc.collection === "object" && doc.collection.id) {
              collectionId = String(doc.collection.id);
            } else if (doc.collectionId) {
              collectionId = String(doc.collectionId);
            } else {
              collectionId = itemId;
            }

            // Skip if no valid ID
            if (!collectionId) continue;

            const name = doc.name || doc.url || doc.summary || "Item";
            const owner = doc.publisherName || doc.publisherHandle || doc.workspaceName || doc.teamName || "Public";

            // Log for debugging
            sdk.console.log(`Found: ${name} (ID: ${collectionId})`);

            if (!results.find(r => r.id === collectionId)) {
              results.push({
                id: collectionId,
                name: String(name),
                owner: String(owner)
              });
            }
          }
        }

        currentPage++;

        // Small delay to avoid rate limiting
        if (hasMoreResults) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } else {
        sdk.console.log("Search failed with status: " + statusCode);
        if (responseBody) {
          sdk.console.log("Response: " + responseBody.substring(0, 500));
        }
        hasMoreResults = false;
      }
    } catch (err) {
      sdk.console.log("Search error on page " + (currentPage + 1) + ": " + err);
      hasMoreResults = false;
    }
  }

  if (currentPage >= MAX_PAGES) {
    sdk.console.log("WARNING: Reached maximum page limit (" + MAX_PAGES + " pages)");
  }

  sdk.console.log("=== Total found: " + results.length + " collections across " + currentPage + " pages ===");
  return results;
}

// Function: Fetch Postman collection by ID
async function fetchPostmanCollection(sdk: SDK, collectionId: string, apiKey: string): Promise<PostmanCollectionData | null> {
  sdk.console.log("=== Fetching Postman collection: " + collectionId + " ===");

  try {
    const spec = new RequestSpec(`https://api.getpostman.com/collections/${collectionId}`);
    spec.setMethod("GET");
    spec.setHeader("X-Api-Key", apiKey);

    const result = await sdk.requests.send(spec);
    const responseBody = result.response.getBody()?.toText() || "";

    if (result.response.getCode() === 200 && responseBody) {
      const data = JSON.parse(responseBody);

      if (data.collection) {
        const requests: PostmanRequest[] = [];

        // Extract auth from collection or folder level
        function extractAuth(authObj: any): { type: string; data: Record<string, string> } | undefined {
          if (!authObj || !authObj.type) return undefined;

          const authData: Record<string, string> = {};
          const authType = authObj.type;

          if (authObj[authType] && Array.isArray(authObj[authType])) {
            for (const param of authObj[authType]) {
              if (param.key && param.value) {
                authData[param.key] = param.value;
              }
            }
          }

          return { type: authType, data: authData };
        }

        // Get collection-level auth
        const collectionAuth = extractAuth(data.collection.auth);

        function extractItems(items: any[], folder: string = "", parentAuth?: any) {
          for (const item of items || []) {
            if (item.request) {
              // Extract URL - handle both string and object formats
              let url = "";
              let queryParams: Array<{ key: string; value: string }> = [];

              if (typeof item.request.url === "string") {
                url = item.request.url;
              } else if (item.request.url) {
                url = item.request.url.raw || "";

                // Extract query parameters
                if (item.request.url.query && Array.isArray(item.request.url.query)) {
                  for (const q of item.request.url.query) {
                    if (q.key && !q.disabled) {
                      queryParams.push({ key: q.key, value: q.value || "" });
                    }
                  }
                }

                // Build URL from parts if raw is empty
                if (!url && item.request.url.host) {
                  const protocol = item.request.url.protocol || "https";
                  const host = Array.isArray(item.request.url.host) ? item.request.url.host.join(".") : item.request.url.host;
                  const path = Array.isArray(item.request.url.path) ? item.request.url.path.join("/") : (item.request.url.path || "");
                  url = `${protocol}://${host}/${path}`;
                }
              }

              // Extract headers - include ALL headers
              const headers: Record<string, string> = {};
              if (item.request.header && Array.isArray(item.request.header)) {
                for (const h of item.request.header) {
                  if (h.key) {
                    // Include disabled headers too, but mark them
                    headers[h.key] = h.value || "";
                  }
                }
              }

              // Extract body - handle all body types
              let body = "";
              if (item.request.body) {
                if (item.request.body.raw) {
                  body = item.request.body.raw;
                } else if (item.request.body.urlencoded && Array.isArray(item.request.body.urlencoded)) {
                  body = item.request.body.urlencoded
                    .filter((p: any) => !p.disabled)
                    .map((p: any) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value || "")}`)
                    .join("&");
                } else if (item.request.body.formdata && Array.isArray(item.request.body.formdata)) {
                  // For formdata, create a representation
                  body = JSON.stringify(
                    item.request.body.formdata
                      .filter((p: any) => !p.disabled)
                      .map((p: any) => ({ key: p.key, value: p.value, type: p.type }))
                  );
                } else if (item.request.body.graphql) {
                  body = JSON.stringify(item.request.body.graphql);
                }
              }

              // Extract auth - request level > parent level > collection level
              const auth = extractAuth(item.request.auth) || parentAuth || collectionAuth;

              // Extract description
              const description = typeof item.request.description === "string"
                ? item.request.description
                : item.request.description?.content || "";

              // Filter out localhost, example, and invalid URLs
              const urlLower = url.toLowerCase();
              const isInvalidUrl = urlLower.includes("localhost") ||
                                   urlLower.includes("127.0.0.1") ||
                                   urlLower.includes("0.0.0.0") ||
                                   urlLower.includes("::1") ||
                                   urlLower.includes("example.com") ||
                                   urlLower.includes("example.org") ||
                                   urlLower.includes("example.net") ||
                                   urlLower.includes("httpbin.org") ||
                                   urlLower.includes("jsonplaceholder") ||
                                   urlLower.includes("reqres.in") ||
                                   urlLower.includes("postman-echo") ||
                                   urlLower.includes("{{") || // Skip unresolved variables
                                   !url; // Skip empty URLs

              if (!isInvalidUrl) {
                requests.push({
                  id: item.id || `req-${requests.length}`,
                  name: folder ? `${folder}/${item.name}` : item.name,
                  method: item.request.method || "GET",
                  url,
                  headers,
                  body,
                  queryParams: queryParams.length > 0 ? queryParams : undefined,
                  auth,
                  description
                });
              }
            }

            // Recurse into folders
            if (item.item) {
              const folderAuth = extractAuth(item.auth) || parentAuth || collectionAuth;
              extractItems(item.item, folder ? `${folder}/${item.name}` : item.name, folderAuth);
            }
          }
        }

        extractItems(data.collection.item || []);

        sdk.console.log("Extracted " + requests.length + " requests from collection");

        return {
          id: collectionId,
          name: data.collection.info?.name || "Collection",
          requests
        };
      }
    } else {
      sdk.console.log("Failed to fetch collection: " + result.response.getCode());
    }
  } catch (error) {
    sdk.console.log("Error fetching collection: " + error);
  }

  return null;
}

// Function: Fetch user's Postman collections (avoids CORS)
async function fetchMyCollections(sdk: SDK, apiKey: string): Promise<Array<{ uid: string; name: string; id: string }>> {
  sdk.console.log("=== Fetching user's Postman collections ===");

  if (!apiKey) {
    sdk.console.log("No API key provided");
    return [];
  }

  try {
    const spec = new RequestSpec("https://api.getpostman.com/collections");
    spec.setMethod("GET");
    spec.setHeader("X-Api-Key", apiKey);

    const result = await sdk.requests.send(spec);
    const responseBody = result.response.getBody()?.toText() || "";

    if (result.response.getCode() === 200 && responseBody) {
      const data = JSON.parse(responseBody);
      const collections = (data.collections || []).map((c: any) => ({
        uid: c.uid,
        name: c.name,
        id: c.id
      }));
      sdk.console.log("Found " + collections.length + " collections");
      return collections;
    } else {
      sdk.console.log("Failed to fetch collections: " + result.response.getCode());
    }
  } catch (error) {
    sdk.console.log("Error fetching collections: " + error);
  }

  return [];
}

// Function: Fetch user's Postman workspaces (avoids CORS)
async function fetchMyWorkspaces(sdk: SDK, apiKey: string): Promise<Array<{ id: string; name: string; type: string }>> {
  sdk.console.log("=== Fetching user's Postman workspaces ===");

  if (!apiKey) {
    sdk.console.log("No API key provided");
    return [];
  }

  try {
    const spec = new RequestSpec("https://api.getpostman.com/workspaces");
    spec.setMethod("GET");
    spec.setHeader("X-Api-Key", apiKey);

    const result = await sdk.requests.send(spec);
    const responseBody = result.response.getBody()?.toText() || "";

    if (result.response.getCode() === 200 && responseBody) {
      const data = JSON.parse(responseBody);
      const workspaces = (data.workspaces || []).map((w: any) => ({
        id: w.id,
        name: w.name,
        type: w.type
      }));
      sdk.console.log("Found " + workspaces.length + " workspaces");
      return workspaces;
    } else {
      sdk.console.log("Failed to fetch workspaces: " + result.response.getCode());
    }
  } catch (error) {
    sdk.console.log("Error fetching workspaces: " + error);
  }

  return [];
}

// Function: Get Postman API usage (avoids CORS)
async function getPostmanApiUsage(sdk: SDK, apiKey: string): Promise<{ limit: number; usage: number } | null> {
  sdk.console.log("=== Fetching Postman API usage ===");

  if (!apiKey) {
    return null;
  }

  try {
    const spec = new RequestSpec("https://api.getpostman.com/me");
    spec.setMethod("GET");
    spec.setHeader("X-Api-Key", apiKey);

    const result = await sdk.requests.send(spec);
    const responseBody = result.response.getBody()?.toText() || "";

    if (result.response.getCode() === 200 && responseBody) {
      const data = JSON.parse(responseBody);
      if (data.operations) {
        return {
          limit: data.operations.limit || 1000,
          usage: data.operations.usage || 0
        };
      }
    }
  } catch (error) {
    sdk.console.log("Error fetching API usage: " + error);
  }

  return null;
}

// API Definition
export type API = DefineAPI<{
  filterHistory: typeof filterHistory;
  replayRequest: typeof replayRequest;
  importAndSendRequest: typeof importAndSendRequest;
  searchPostmanPublicNetwork: typeof searchPostmanPublicNetwork;
  fetchPostmanCollection: typeof fetchPostmanCollection;
  fetchMyCollections: typeof fetchMyCollections;
  fetchMyWorkspaces: typeof fetchMyWorkspaces;
  getPostmanApiUsage: typeof getPostmanApiUsage;
}>;

export function init(sdk: SDK<API>) {
  sdk.console.log("Caido Postman Integration loading...");

  sdk.api.register("filterHistory", filterHistory);
  sdk.api.register("replayRequest", replayRequest);
  sdk.api.register("importAndSendRequest", importAndSendRequest);
  sdk.api.register("searchPostmanPublicNetwork", searchPostmanPublicNetwork);
  sdk.api.register("fetchPostmanCollection", fetchPostmanCollection);
  sdk.api.register("fetchMyCollections", fetchMyCollections);
  sdk.api.register("fetchMyWorkspaces", fetchMyWorkspaces);
  sdk.api.register("getPostmanApiUsage", getPostmanApiUsage);

  sdk.console.log("Caido Postman Integration loaded - by @OFJAAAH");
}
