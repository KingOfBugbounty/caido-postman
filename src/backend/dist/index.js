// src/backend/src/index.ts
import { RequestSpec } from "caido:utils";
function detectAuthentication(headers) {
  const headerMap = {};
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
async function filterHistory(sdk, domain, statusCodeStr, methodFilter) {
  sdk.console.log("=== Caido Postman: Filtering history ===");
  sdk.console.log("Domain: " + (domain || "(all)"));
  const statusCode = statusCodeStr && statusCodeStr !== "" ? parseInt(statusCodeStr, 10) : 0;
  const requests = [];
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
        const headers = {};
        for (const [key, values] of Object.entries(headersObj)) {
          if (key && values) {
            headers[key] = Array.isArray(values) ? values.join(", ") : String(values);
          }
        }
        const authInfo = detectAuthentication(headers);
        let body = null;
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
        if (isTls && port !== 443 || !isTls && port !== 80) {
          url += ":" + port;
        }
        url += path;
        if (query_str) {
          url += "?" + query_str;
        }
        const id = request.getId() || `req-${Date.now()}-${Math.random()}`;
        let timestamp;
        try {
          timestamp = request.getCreatedAt()?.toISOString() || (/* @__PURE__ */ new Date()).toISOString();
        } catch {
          timestamp = (/* @__PURE__ */ new Date()).toISOString();
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
async function replayRequest(sdk, requestId) {
  sdk.console.log("Replaying request: " + requestId);
  try {
    const requestResponse = await sdk.requests.get(requestId);
    if (!requestResponse) {
      return { success: false, error: "Request not found" };
    }
    const originalRequest = requestResponse.request || requestResponse;
    if (!originalRequest || typeof originalRequest.toSpec !== "function") {
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
async function importAndSendRequest(sdk, method, url, headersJson, body) {
  sdk.console.log("=== Importing and sending request ===");
  sdk.console.log("Method: " + method);
  sdk.console.log("URL: " + url);
  const startTime = Date.now();
  try {
    if (!url || !url.startsWith("http")) {
      return { success: false, error: "Invalid URL: " + url };
    }
    let headers = {};
    try {
      if (headersJson && headersJson !== "{}") {
        headers = JSON.parse(headersJson);
      }
    } catch {
      sdk.console.log("Failed to parse headers");
    }
    const spec = new RequestSpec(url);
    spec.setMethod(method);
    for (const [key, value] of Object.entries(headers)) {
      if (key && value && key.toLowerCase() !== "host") {
        spec.setHeader(key, value);
      }
    }
    if (body && method !== "GET" && method !== "HEAD") {
      spec.setBody(body);
    }
    sdk.console.log("Sending request via Caido...");
    const result = await sdk.requests.send(spec);
    const responseTime = Date.now() - startTime;
    const response = result.response;
    const statusCode = response.getCode();
    sdk.console.log("Response: " + statusCode + " (" + responseTime + "ms)");
    const respHeaders = {};
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
    let responseBody = "";
    try {
      const bodyObj = response.getBody();
      if (bodyObj) {
        const fullBody = bodyObj.toText() || "";
        responseBody = fullBody.length > 1e4 ? fullBody.substring(0, 1e4) + "...(truncated)" : fullBody;
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
async function searchPostmanPublicNetwork(sdk, query) {
  sdk.console.log("=== Searching Postman Public Network for: " + query + " (UNLIMITED) ===");
  const results = [];
  const PAGE_SIZE = 25;
  const MAX_PAGES = 2e3;
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
        let allItems = [];
        let totalInPage = 0;
        if (data.data) {
          if (Array.isArray(data.data)) {
            allItems = data.data;
            totalInPage = allItems.length;
          } else {
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
        if (totalInPage < PAGE_SIZE) {
          hasMoreResults = false;
        }
        if (totalInPage === 0) {
          hasMoreResults = false;
          break;
        }
        for (const item of allItems) {
          const doc = item.document || item;
          if (doc) {
            let itemId = "";
            if (typeof doc.id === "string") {
              itemId = doc.id;
            } else if (doc.id && typeof doc.id === "object") {
              itemId = doc.id.toString();
            } else if (doc.entityId) {
              itemId = String(doc.entityId);
            }
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
            if (!collectionId) continue;
            const name = doc.name || doc.url || doc.summary || "Item";
            const owner = doc.publisherName || doc.publisherHandle || doc.workspaceName || doc.teamName || "Public";
            sdk.console.log(`Found: ${name} (ID: ${collectionId})`);
            if (!results.find((r) => r.id === collectionId)) {
              results.push({
                id: collectionId,
                name: String(name),
                owner: String(owner)
              });
            }
          }
        }
        currentPage++;
        if (hasMoreResults) {
          await new Promise((resolve) => setTimeout(resolve, 200));
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
async function fetchPostmanCollection(sdk, collectionId, apiKey) {
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
        let extractAuth = function(authObj) {
          if (!authObj || !authObj.type) return void 0;
          const authData = {};
          const authType = authObj.type;
          if (authObj[authType] && Array.isArray(authObj[authType])) {
            for (const param of authObj[authType]) {
              if (param.key && param.value) {
                authData[param.key] = param.value;
              }
            }
          }
          return { type: authType, data: authData };
        }, extractItems = function(items, folder = "", parentAuth) {
          for (const item of items || []) {
            if (item.request) {
              let url = "";
              let queryParams = [];
              if (typeof item.request.url === "string") {
                url = item.request.url;
              } else if (item.request.url) {
                url = item.request.url.raw || "";
                if (item.request.url.query && Array.isArray(item.request.url.query)) {
                  for (const q of item.request.url.query) {
                    if (q.key && !q.disabled) {
                      queryParams.push({ key: q.key, value: q.value || "" });
                    }
                  }
                }
                if (!url && item.request.url.host) {
                  const protocol = item.request.url.protocol || "https";
                  const host = Array.isArray(item.request.url.host) ? item.request.url.host.join(".") : item.request.url.host;
                  const path = Array.isArray(item.request.url.path) ? item.request.url.path.join("/") : item.request.url.path || "";
                  url = `${protocol}://${host}/${path}`;
                }
              }
              const headers = {};
              if (item.request.header && Array.isArray(item.request.header)) {
                for (const h of item.request.header) {
                  if (h.key) {
                    headers[h.key] = h.value || "";
                  }
                }
              }
              let body = "";
              if (item.request.body) {
                if (item.request.body.raw) {
                  body = item.request.body.raw;
                } else if (item.request.body.urlencoded && Array.isArray(item.request.body.urlencoded)) {
                  body = item.request.body.urlencoded.filter((p) => !p.disabled).map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value || "")}`).join("&");
                } else if (item.request.body.formdata && Array.isArray(item.request.body.formdata)) {
                  body = JSON.stringify(
                    item.request.body.formdata.filter((p) => !p.disabled).map((p) => ({ key: p.key, value: p.value, type: p.type }))
                  );
                } else if (item.request.body.graphql) {
                  body = JSON.stringify(item.request.body.graphql);
                }
              }
              const auth = extractAuth(item.request.auth) || parentAuth || collectionAuth;
              const description = typeof item.request.description === "string" ? item.request.description : item.request.description?.content || "";
              const urlLower = url.toLowerCase();
              const isInvalidUrl = urlLower.includes("localhost") || urlLower.includes("127.0.0.1") || urlLower.includes("0.0.0.0") || urlLower.includes("::1") || urlLower.includes("example.com") || urlLower.includes("example.org") || urlLower.includes("example.net") || urlLower.includes("httpbin.org") || urlLower.includes("jsonplaceholder") || urlLower.includes("reqres.in") || urlLower.includes("postman-echo") || urlLower.includes("{{") || // Skip unresolved variables
              !url;
              if (!isInvalidUrl) {
                requests.push({
                  id: item.id || `req-${requests.length}`,
                  name: folder ? `${folder}/${item.name}` : item.name,
                  method: item.request.method || "GET",
                  url,
                  headers,
                  body,
                  queryParams: queryParams.length > 0 ? queryParams : void 0,
                  auth,
                  description
                });
              }
            }
            if (item.item) {
              const folderAuth = extractAuth(item.auth) || parentAuth || collectionAuth;
              extractItems(item.item, folder ? `${folder}/${item.name}` : item.name, folderAuth);
            }
          }
        };
        const requests = [];
        const collectionAuth = extractAuth(data.collection.auth);
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
async function fetchMyCollections(sdk, apiKey) {
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
      const collections = (data.collections || []).map((c) => ({
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
async function fetchMyWorkspaces(sdk, apiKey) {
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
      const workspaces = (data.workspaces || []).map((w) => ({
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
async function getPostmanApiUsage(sdk, apiKey) {
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
          limit: data.operations.limit || 1e3,
          usage: data.operations.usage || 0
        };
      }
    }
  } catch (error) {
    sdk.console.log("Error fetching API usage: " + error);
  }
  return null;
}
function init(sdk) {
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
export {
  init
};
