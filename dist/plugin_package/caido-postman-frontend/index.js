const A = '<svg viewBox="0 0 24 24" width="20" height="20" style="vertical-align: middle;"><circle cx="12" cy="12" r="12" fill="#FF6C37"/><circle cx="12" cy="12" r="4" fill="#fff"/></svg>';
let w = { apiKey: "", workspaceId: "" }, P = [], u = [], I = [], _ = null, K = !1, E;
const Y = `
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
function ee() {
  if (document.getElementById("cp-styles")) return;
  const o = document.createElement("style");
  o.id = "cp-styles", o.textContent = Y, document.head.appendChild(o);
}
function D(o) {
  return o ? o.replace(/(Bearer\s+[A-Za-z0-9\-_\.]+)/gi, '<span class="cp-token">$1</span>').replace(/(eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)/g, '<span class="cp-token">$1</span>').replace(/([A-Za-z0-9]{32,})/g, '<span class="cp-token">$1</span>') : "";
}
function G(o) {
  return Object.entries(o).map(([a, e]) => `<strong>${a}:</strong> ${D(e)}`).join(`
`);
}
function J(o) {
  if (!o || o === "") return "<em>No body</em>";
  try {
    const a = JSON.parse(o);
    return D(JSON.stringify(a, null, 2));
  } catch {
    return D(o);
  }
}
async function te(o) {
  try {
    const a = await E.backend.fetchMyWorkspaces(o), e = await E.backend.getPostmanApiUsage(o);
    return a.length === 0 && !e ? { success: !1, message: "Invalid API Key or connection failed" } : {
      success: !0,
      message: `Connected successfully (${a.length} workspaces)`,
      workspaces: a,
      apiUsage: e || void 0
    };
  } catch (a) {
    return { success: !1, message: `Connection error: ${a}` };
  }
}
async function Z(o, a) {
  var e;
  try {
    const x = await fetch("https://api.getpostman.com/collections", {
      method: "POST",
      headers: { "X-Api-Key": o, "Content-Type": "application/json" },
      body: JSON.stringify({
        collection: {
          info: { name: a, schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
          item: []
        }
      })
    });
    return x.ok && ((e = (await x.json()).collection) == null ? void 0 : e.uid) || null;
  } catch {
    return null;
  }
}
async function W(o, a, e) {
  try {
    const x = await fetch(`https://api.getpostman.com/collections/${a}`, { headers: { "X-Api-Key": o } });
    if (!x.ok) return !1;
    const l = await x.json(), r = new URL(e.url), p = {
      name: `${e.method} ${e.path}`,
      request: {
        method: e.method,
        header: Object.entries(e.headers).map(([g, S]) => ({ key: g, value: S })),
        url: {
          raw: e.url,
          protocol: r.protocol.replace(":", ""),
          host: r.hostname.split("."),
          path: r.pathname.split("/").filter((g) => g),
          query: r.search ? r.search.substring(1).split("&").map((g) => {
            const [S, t] = g.split("=");
            return { key: S, value: t || "" };
          }) : []
        },
        body: e.body ? { mode: "raw", raw: e.body, options: { raw: { language: "json" } } } : void 0
      }
    };
    return l.collection.item.push(p), (await fetch(`https://api.getpostman.com/collections/${a}`, {
      method: "PUT",
      headers: { "X-Api-Key": o, "Content-Type": "application/json" },
      body: JSON.stringify(l)
    })).ok;
  } catch {
    return !1;
  }
}
const V = {
  dhl: { baseUrl: "https://express.api.dhl.com", base_url: "https://express.api.dhl.com", "api-eu": "https://api-eu.dhl.com" },
  stripe: { baseUrl: "https://api.stripe.com", base_url: "https://api.stripe.com" },
  github: { baseUrl: "https://api.github.com", base_url: "https://api.github.com" },
  twitter: { baseUrl: "https://api.twitter.com", base_url: "https://api.twitter.com", api_url: "https://api.twitter.com" },
  slack: { baseUrl: "https://slack.com/api", base_url: "https://slack.com/api" },
  spotify: { baseUrl: "https://api.spotify.com", base_url: "https://api.spotify.com" },
  paypal: { baseUrl: "https://api-m.sandbox.paypal.com", base_url: "https://api-m.sandbox.paypal.com", paypal_api_base_url: "https://api-m.sandbox.paypal.com" },
  uber: { baseUrl: "https://api.uber.com", base_url: "https://api.uber.com", uber_api_host: "https://api.uber.com" },
  twilio: { baseUrl: "https://api.twilio.com", base_url: "https://api.twilio.com" },
  shopify: { baseUrl: "https://{{shop}}.myshopify.com", base_url: "https://example.myshopify.com" },
  postman: { baseUrl: "https://api.getpostman.com", base_url: "https://api.getpostman.com" },
  default: { baseUrl: "https://api.example.com", base_url: "https://api.example.com" }
};
let X = "default";
function F(o) {
  if (!o) return "";
  let a = o;
  const e = V[X] || V.default;
  return a = a.replace(/\{\{([^}]+)\}\}/g, (x, l) => {
    const r = l.toLowerCase().trim();
    return e[r] || e.baseUrl || "";
  }), a = a.replace(/\[([^\]]+)\]/g, (x, l) => {
    const r = l.toLowerCase().trim();
    return e[r] || e.baseUrl || "";
  }), a = a.replace(/:([a-zA-Z_]+)/g, "test_$1"), a = a.replace(/([^:])\/\//g, "$1/"), a;
}
async function Q(o) {
  const a = Date.now(), e = F(o.url);
  try {
    if (!e || !e.startsWith("http"))
      return { status: 0, time: 0, authValid: !1, resolvedUrl: e };
    const x = new AbortController(), l = setTimeout(() => x.abort(), 1e4), r = {};
    for (const [t, f] of Object.entries(o.headers))
      f && !f.includes("{{") && !f.includes("[") && (r[t] = f);
    const p = {
      method: o.method,
      headers: r,
      signal: x.signal,
      mode: "cors"
    };
    if (o.body && o.method !== "GET" && o.method !== "HEAD") {
      let t = o.body.replace(/\{\{[^}]+\}\}/g, "test");
      p.body = t;
    }
    const C = await fetch(e, p);
    clearTimeout(l);
    const g = Date.now() - a, S = C.status !== 401 && C.status !== 403;
    return { status: C.status, time: g, authValid: S, resolvedUrl: e };
  } catch (x) {
    const l = Date.now() - a;
    return x.name === "AbortError" ? { status: 408, time: l, authValid: !1, resolvedUrl: e } : { status: 0, time: l, authValid: !1, resolvedUrl: e };
  }
}
function R(o) {
  const a = o.querySelector("#resultsTable"), e = o.querySelector("#resultCount"), x = o.querySelector("#validateBtn");
  if (e.textContent = `(${u.length})`, u.length === 0) {
    a.innerHTML = '<div class="p-10 text-center text-secondary-500">No requests found in Postman collections.</div>', x.classList.add("hidden");
    return;
  }
  x.classList.remove("hidden"), x.textContent = "Auto Test All";
  const l = u.length, r = u.filter((t) => t.validationStatus === "success").length, p = u.filter((t) => t.validationStatus === "failed" || t.validationStatus === "error").length, C = u.filter(
    (t) => t.headers.Authorization || t.headers.authorization || t.headers["X-Api-Key"] || t.headers["x-api-key"]
  ).length, g = u.filter((t) => t.validationStatus && t.validationStatus !== "pending").length, S = o.querySelector("#statsContainer");
  S && (S.innerHTML = `
      <div class="px-5 py-3 bg-surface-700 rounded-lg border border-surface-600 text-center min-w-[80px]">
        <div class="text-2xl font-semibold text-info-400">${l}</div>
        <div class="text-xs text-secondary-400 uppercase mt-1">Total</div>
      </div>
      <div class="px-5 py-3 bg-surface-700 rounded-lg border border-surface-600 text-center min-w-[80px]">
        <div class="text-2xl font-semibold text-success-400">${r}</div>
        <div class="text-xs text-secondary-400 uppercase mt-1">Active (2xx)</div>
      </div>
      <div class="px-5 py-3 bg-surface-700 rounded-lg border border-surface-600 text-center min-w-[80px]">
        <div class="text-2xl font-semibold text-danger-400">${p}</div>
        <div class="text-xs text-secondary-400 uppercase mt-1">Failed</div>
      </div>
      <div class="px-5 py-3 bg-surface-700 rounded-lg border border-surface-600 text-center min-w-[80px]">
        <div class="text-2xl font-semibold text-primary-500">${C}</div>
        <div class="text-xs text-secondary-400 uppercase mt-1">With Auth</div>
      </div>
      <div class="px-5 py-3 bg-surface-700 rounded-lg border border-surface-600 text-center min-w-[80px]">
        <div class="text-2xl font-semibold text-info-400">${g}/${l}</div>
        <div class="text-xs text-secondary-400 uppercase mt-1">Tested</div>
      </div>
    `), a.innerHTML = `
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
          ${u.map((t, f) => {
    const M = t.headers.Authorization || t.headers.authorization || t.headers["X-Api-Key"] || t.headers["x-api-key"];
    let d = '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-primary-900/30 text-primary-400">-</span>';
    t.validationStatus === "testing" ? d = '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-info-900/30 text-info-400"><span class="cp-spinner cp-spinner-sm"></span></span>' : t.validationStatus === "success" ? d = `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-success-900/30 text-success-400">${t.validationCode}</span>` : t.validationStatus === "failed" ? d = `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-danger-900/30 text-danger-400">${t.validationCode || "err"}</span>` : t.validationStatus === "error" && (d = '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-surface-500/50 text-secondary-400">CORS</span>');
    const n = t.validationTime ? `<span class="text-xs text-secondary-500">${t.validationTime}ms</span>` : "", L = t.resolvedUrl || F(t.url) || t.url, v = {
      GET: "bg-success-900/30 text-success-400",
      POST: "bg-primary-900/30 text-primary-400",
      PUT: "bg-info-900/30 text-info-400",
      DELETE: "bg-danger-900/30 text-danger-400",
      PATCH: "bg-secondary-900/30 text-secondary-300"
    }[t.method] || "bg-surface-600 text-surface-0";
    return `
            <tr class="border-b border-surface-600 hover:bg-surface-700" data-idx="${f}">
              <td class="px-2 py-2.5"><span class="px-2 py-0.5 rounded text-xs font-semibold ${v}">${t.method}</span></td>
              <td class="px-2 py-2.5 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap" title="${t.name}">${t.name}</td>
              <td class="px-2 py-2.5 max-w-[350px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs" title="${L}">${L}</td>
              <td class="px-2 py-2.5">${M ? '<span class="px-2 py-0.5 rounded text-xs bg-primary-900/30 text-primary-400">AUTH</span>' : "-"}</td>
              <td class="px-2 py-2.5">${d} ${n}</td>
              <td class="px-2 py-2.5">
                <button class="px-2.5 py-1 text-xs rounded bg-surface-600 text-surface-0 hover:bg-surface-500 mr-1 view-postman-btn" data-idx="${f}">View</button>
                <button class="px-2.5 py-1 text-xs rounded bg-primary-700 text-surface-0 hover:bg-primary-600 mr-1 test-single-btn" data-idx="${f}">Test</button>
                <button class="px-2.5 py-1 text-xs rounded bg-success-600 text-white hover:bg-success-500 import-btn ${t.importStatus === "importing" ? "opacity-50" : ""}" data-idx="${f}" title="Send to Replay">${t.importStatus === "importing" ? "..." : (t.importStatus === "done", "Replay")}</button>
              </td>
            </tr>
            <tr class="cp-row-details border-b border-surface-600" id="postman-details-${f}">
              <td colspan="6" class="p-0">
                <div class="m-2 p-3 bg-surface-700 rounded-lg font-mono text-xs max-h-[400px] overflow-auto">
                  <div class="font-semibold text-primary-400 mb-2">Collection: ${t.collectionName}</div>
                  <div class="font-semibold text-primary-400 mt-2">Original URL</div>
                  <pre class="m-0 whitespace-pre-wrap break-all text-secondary-500">${t.url}</pre>
                  ${t.resolvedUrl ? `<div class="font-semibold text-primary-400 mt-2">Resolved URL</div><pre class="m-0 whitespace-pre-wrap break-all text-success-400">${t.resolvedUrl}</pre>` : ""}
                  <div class="font-semibold text-primary-400 mt-3">Request Headers</div>
                  <pre class="m-0 whitespace-pre-wrap break-all text-secondary-300">${G(t.headers) || "<em>No headers</em>"}</pre>
                  <div class="font-semibold text-primary-400 mt-3">Request Body</div>
                  <pre class="m-0 whitespace-pre-wrap break-all text-secondary-300">${J(t.body)}</pre>
                  ${t.importStatus === "done" ? `
                    <div class="mt-4 pt-3 border-t border-surface-500">
                      <div class="font-semibold text-success-400 mb-2 flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                        Request sent to Replay tab - Click "Replay" to open
                      </div>
                    </div>
                  ` : ""}
                  ${t.importError ? `
                    <div class="mt-4 pt-3 border-t border-surface-500">
                      <div class="font-semibold text-danger-400 mb-2">ERROR</div>
                      <pre class="m-0 whitespace-pre-wrap break-all text-danger-400">${t.importError}</pre>
                    </div>
                  ` : ""}
                </div>
              </td>
            </tr>
          `;
  }).join("")}
        </tbody>
      </table>
    </div>
  `, a.querySelectorAll(".view-postman-btn").forEach((t) => {
    t.addEventListener("click", (f) => {
      f.stopPropagation();
      const M = f.target.getAttribute("data-idx"), d = document.getElementById(`postman-details-${M}`);
      d && (d.classList.toggle("expanded"), f.target.textContent = d.classList.contains("expanded") ? "Hide" : "View");
    });
  }), a.querySelectorAll(".test-single-btn").forEach((t) => {
    t.addEventListener("click", async (f) => {
      f.stopPropagation();
      const M = parseInt(f.target.getAttribute("data-idx") || "0"), d = u[M];
      if (d) {
        d.validationStatus = "testing", R(o);
        const n = await Q(d);
        n.status === 0 ? d.validationStatus = "error" : n.status >= 200 && n.status < 300 ? d.validationStatus = "success" : d.validationStatus = "failed", d.validationCode = n.status, d.validationTime = n.time, d.validationAuth = n.authValid, d.resolvedUrl = n.resolvedUrl, R(o);
      }
    });
  }), a.querySelectorAll(".import-btn").forEach((t) => {
    t.addEventListener("click", async (f) => {
      f.stopPropagation();
      const M = f.currentTarget, d = parseInt(M.getAttribute("data-idx") || "0"), n = u[d];
      if (n && n.importStatus !== "importing") {
        n.importStatus = "importing", n.importError = void 0, R(o);
        const L = n.resolvedUrl || F(n.url);
        n.resolvedUrl = L;
        try {
          const v = new URL(L), H = v.hostname, U = v.protocol === "https:", q = v.port ? parseInt(v.port) : U ? 443 : 80, z = v.pathname + v.search, B = {};
          for (const [s, i] of Object.entries(n.headers))
            i && !i.includes("{{") && !i.includes("[") && (B[s] = i);
          let $ = n.body || "";
          $ = $.replace(/\{\{[^}]+\}\}/g, "test");
          let k = `${n.method} ${z || "/"} HTTP/1.1\r
`;
          k += `Host: ${H}${q !== 443 && q !== 80 ? ":" + q : ""}\r
`;
          for (const [s, i] of Object.entries(B))
            s.toLowerCase() !== "host" && (k += `${s}: ${i}\r
`);
          $ && n.method !== "GET" && n.method !== "HEAD" && (k += `Content-Length: ${new TextEncoder().encode($).length}\r
`), k += `\r
`, $ && n.method !== "GET" && n.method !== "HEAD" && (k += $), console.log("[CaidoPostman] Creating replay session for:", n.method, L), console.log("[CaidoPostman] Host:", H, "Port:", q, "TLS:", U);
          const j = {
            raw: k,
            connectionInfo: {
              host: H,
              port: q,
              isTLS: U
            }
          }, O = await E.replay.createSession(j);
          O ? (await E.replay.openTab(O.id, { select: !0 }), await E.navigation.goTo("/replay"), n.importStatus = "done", M.textContent = "Opened") : (await E.navigation.goTo("/replay"), n.importStatus = "done", M.textContent = "Opened");
        } catch (v) {
          console.error("[CaidoPostman] Import error:", v), n.importStatus = "error", n.importError = String(v);
        }
        R(o);
      }
    });
  });
}
function se(o) {
  const a = o.querySelector("#resultsTable"), e = o.querySelector("#resultCount"), x = o.querySelector("#sendAllBtn"), l = o.querySelector("#validateBtn");
  if (e.textContent = `(${P.length})`, P.length === 0) {
    a.innerHTML = '<div class="p-10 text-center text-secondary-500">No requests found. Try a different domain or filters.</div>', x.classList.add("hidden"), l.classList.add("hidden");
    return;
  }
  x.classList.remove("hidden"), l.classList.remove("hidden"), a.innerHTML = `
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
        ${P.map((r, p) => {
    const C = {
      GET: "bg-success-900/30 text-success-400",
      POST: "bg-primary-900/30 text-primary-400",
      PUT: "bg-info-900/30 text-info-400",
      DELETE: "bg-danger-900/30 text-danger-400",
      PATCH: "bg-secondary-900/30 text-secondary-300"
    }[r.method] || "bg-surface-600 text-surface-0";
    return `
          <tr class="border-b border-surface-600 hover:bg-surface-700" data-idx="${p}">
            <td class="px-2 py-2.5"><span class="px-2 py-0.5 rounded text-xs font-semibold ${C}">${r.method}</span></td>
            <td class="px-2 py-2.5 max-w-[250px] overflow-hidden text-ellipsis whitespace-nowrap" title="${r.url}">${r.path}</td>
            <td class="px-2 py-2.5"><span class="px-2 py-0.5 rounded text-xs font-semibold ${r.statusCode === 200 ? "bg-success-900/30 text-success-400" : "bg-danger-900/30 text-danger-400"}">${r.statusCode}</span></td>
            <td class="px-2 py-2.5">${r.hasAuth && r.authType ? `<span class="px-2 py-0.5 rounded text-xs bg-primary-900/30 text-primary-400">${r.authType}</span>` : "-"}</td>
            <td class="px-2 py-2.5">
              <span class="px-2 py-0.5 rounded text-xs font-semibold ${r.validationStatus === "active" ? "bg-success-900/30 text-success-400" : r.validationStatus === "inactive" ? "bg-danger-900/30 text-danger-400" : r.validationStatus === "error" ? "bg-surface-500/50 text-secondary-400" : "bg-primary-900/30 text-primary-400"}">
                ${r.validationStatus === "active" || r.validationStatus === "inactive" ? r.validationCode : r.validationStatus === "error" ? "Error" : "Pending"}
              </span>
            </td>
            <td class="px-2 py-2.5">
              <button class="px-2.5 py-1 text-xs rounded bg-surface-600 text-surface-0 hover:bg-surface-500 mr-1 view-btn" data-idx="${p}">View</button>
              <button class="px-2.5 py-1 text-xs rounded bg-primary-700 text-surface-0 hover:bg-primary-600 send-btn" data-idx="${p}">Send</button>
            </td>
          </tr>
          <tr class="cp-row-details border-b border-surface-600" id="details-${p}">
            <td colspan="6" class="p-0">
              <div class="m-2 p-3 bg-surface-700 rounded-lg font-mono text-xs max-h-[300px] overflow-auto">
                <div class="font-semibold text-primary-400 mb-2">Headers</div>
                <pre class="m-0 whitespace-pre-wrap break-all text-secondary-300">${G(r.headers)}</pre>
                <div class="font-semibold text-primary-400 mt-3">Body</div>
                <pre class="m-0 whitespace-pre-wrap break-all text-secondary-300">${J(r.body)}</pre>
              </div>
            </td>
          </tr>
        `;
  }).join("")}
      </tbody>
    </table>
  `, a.querySelectorAll(".view-btn").forEach((r) => {
    r.addEventListener("click", (p) => {
      p.stopPropagation();
      const C = p.target.getAttribute("data-idx"), g = document.getElementById(`details-${C}`);
      g && (g.classList.toggle("expanded"), p.target.textContent = g.classList.contains("expanded") ? "Hide" : "View");
    });
  }), a.querySelectorAll(".send-btn").forEach((r) => {
    r.addEventListener("click", async (p) => {
      p.stopPropagation();
      const C = parseInt(p.target.getAttribute("data-idx") || "0"), g = P[C];
      if (g) {
        if (p.target.disabled = !0, p.target.textContent = "...", !w.collectionId) {
          const S = "Caido - " + g.host + " - " + (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          w.collectionId = await Z(w.apiKey, S) || void 0;
        }
        if (w.collectionId) {
          const S = await W(w.apiKey, w.collectionId, g);
          p.target.textContent = S ? "Done" : "Fail";
        } else
          p.target.textContent = "Fail";
      }
    });
  });
}
function oe(o) {
  try {
    let a = function() {
      if (q.textContent = `(${I.length})`, I.length === 0) {
        k.innerHTML = '<div class="text-center text-secondary-500 py-4">No collections found in your Postman account.</div>';
        return;
      }
      k.innerHTML = `
      <div class="space-y-2">
        ${I.map((s, i) => `
          <div class="flex items-center justify-between p-3 bg-surface-700 rounded-lg border border-surface-600 hover:border-primary-500 transition-colors cursor-pointer collection-item ${(_ == null ? void 0 : _.uid) === s.uid ? "border-primary-500 bg-surface-600" : ""}" data-idx="${i}">
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <div class="w-8 h-8 bg-primary-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                ${A}
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-medium text-surface-0 truncate" title="${s.name}">${s.name}</div>
                <div class="text-xs text-secondary-500">ID: ${s.uid}</div>
              </div>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button class="px-3 py-1.5 text-xs rounded bg-primary-700 text-surface-0 hover:bg-primary-600 transition-colors load-collection-btn" data-uid="${s.uid}" data-name="${s.name}">
                Load Requests
              </button>
            </div>
          </div>
        `).join("")}
      </div>
    `, k.querySelectorAll(".collection-item").forEach((s) => {
        s.addEventListener("click", (i) => {
          if (i.target.classList.contains("load-collection-btn")) return;
          const h = parseInt(s.getAttribute("data-idx") || "0");
          _ = I[h] || null, a();
        });
      }), k.querySelectorAll(".load-collection-btn").forEach((s) => {
        s.addEventListener("click", async (i) => {
          i.stopPropagation();
          const c = i.currentTarget, h = c.getAttribute("data-uid") || "", T = c.getAttribute("data-name") || "Collection";
          c.disabled = !0, c.innerHTML = '<span class="cp-spinner cp-spinner-sm"></span>', $.classList.remove("hidden"), $.innerHTML = `<div class="p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">Loading requests from "${T}"...</div>`;
          try {
            const b = await E.backend.fetchPostmanCollection(h, w.apiKey);
            if (b && b.requests) {
              u = b.requests.map((m) => ({
                id: m.id,
                name: m.name,
                method: m.method,
                url: m.url,
                headers: m.headers,
                body: m.body,
                collectionName: b.name
              }));
              const y = M.value;
              y !== "ALL" && (u = u.filter((m) => m.method === y)), $.innerHTML = `<div class="p-3 rounded-md text-sm bg-success-900/30 border border-success-500 text-success-400">Loaded ${u.length} requests from "${T}"</div>`, S.classList.remove("hidden"), R(e), _ = I.find((m) => m.uid === h) || null, a();
            } else
              $.innerHTML = `<div class="p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">No requests found in "${T}"</div>`;
          } catch (b) {
            $.innerHTML = `<div class="p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">Error loading collection: ${b}</div>`;
          }
          c.disabled = !1, c.textContent = "Load Requests";
        });
      });
    };
    E = o, ee();
    const e = document.createElement("div");
    e.className = "p-5 font-sans text-surface-0 h-full overflow-y-auto box-border", e.innerHTML = `
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
      <div class="px-4 py-3 bg-surface-700 font-semibold flex items-center gap-2 rounded-t-lg text-surface-0">${A} Connect to Postman</div>
      <div class="p-4">
        <div class="mb-4">
          <label class="block mb-1.5 text-sm text-secondary-400 font-medium">Postman API Key</label>
          <input type="text" id="apiKeyInput" placeholder="PMAK-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" class="w-full px-3 py-2.5 bg-surface-700 border border-surface-500 rounded-md text-surface-0 text-sm focus:outline-none focus:border-primary-500 transition-colors" />
          <small class="block mt-1 text-xs text-secondary-500">Get your API key from <a href="https://go.postman.co/settings/me/api-keys" target="_blank" class="text-primary-500 no-underline hover:underline">Postman Settings</a></small>
        </div>
        <div class="flex gap-2">
          <button id="connectBtn" class="px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer inline-flex items-center gap-2 bg-primary-700 text-surface-0 border border-primary-700 hover:bg-primary-600 transition-colors">${A} Connect to Postman</button>
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
          <button id="fetchCollectionsBtn" class="px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer inline-flex items-center gap-2 bg-success-600 text-white border border-success-600 hover:bg-success-500 transition-colors">${A} My Collections</button>
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
        ${A} My Collections
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
          <button id="sendAllBtn" class="hidden px-3 py-1.5 text-xs rounded-md bg-primary-700 text-surface-0 hover:bg-primary-600 inline-flex items-center gap-1 transition-colors">${A} Send All</button>
        </div>
      </div>
      <div class="p-4">
        <div id="statsContainer" class="flex gap-4 mb-4 flex-wrap"></div>
        <div id="resultsTable"></div>
      </div>
    </div>
  `;
    const x = e.querySelector("#apiKeyInput"), l = e.querySelector("#connectBtn"), r = e.querySelector("#logoutBtn"), p = e.querySelector("#connectStatus"), C = e.querySelector("#connectedBadge"), g = e.querySelector("#filterSection"), S = e.querySelector("#resultsSection"), t = e.querySelector("#domainInput"), f = e.querySelector("#domainFilterInput"), M = e.querySelector("#methodSelect"), d = e.querySelector("#searchPublicBtn"), n = e.querySelector("#fetchCollectionsBtn"), L = e.querySelector("#fetchStatus"), v = e.querySelector("#sendAllBtn"), H = e.querySelector("#validateBtn"), U = e.querySelector("#myCollectionsSection"), q = e.querySelector("#collectionsCount"), z = e.querySelector("#closeCollectionsBtn"), B = e.querySelector("#refreshCollectionsBtn"), $ = e.querySelector("#collectionsLoadingStatus"), k = e.querySelector("#collectionsList");
    async function j() {
      $.classList.remove("hidden"), $.innerHTML = '<div class="p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">Loading your collections...</div>', k.innerHTML = '<div class="text-center text-secondary-500 py-4"><span class="cp-spinner"></span> Loading...</div>';
      try {
        I = (await E.backend.fetchMyCollections(w.apiKey)).map((i) => ({
          id: i.id,
          uid: i.uid,
          name: i.name,
          owner: i.owner || ""
        })), $.classList.add("hidden"), a();
      } catch (s) {
        $.innerHTML = `<div class="p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">Error: ${s}</div>`, k.innerHTML = '<div class="text-center text-danger-400 py-4">Failed to load collections</div>';
      }
    }
    const O = localStorage.getItem("postman-api-key");
    O && (x.value = O), l.onclick = async () => {
      const s = x.value.trim();
      if (!s) {
        p.innerHTML = '<div class="mt-4 p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">Please enter your API Key</div>';
        return;
      }
      l.disabled = !0, l.innerHTML = '<span class="cp-spinner"></span> Connecting...', p.innerHTML = '<div class="mt-4 p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">Connecting to Postman...</div>';
      const i = await te(s);
      if (i.success) {
        w.apiKey = s, localStorage.setItem("postman-api-key", s);
        let c = "";
        if (i.apiUsage) {
          const { limit: h, usage: T } = i.apiUsage, b = Math.round(T / h * 100);
          T >= h ? c = `<div class="mt-2 p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">API LIMIT REACHED: ${T}/${h} requests (${b}%)</div>` : b > 80 && (c = `<div class="mt-2 p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">API Usage: ${T}/${h} (${b}%)</div>`);
        }
        p.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-success-900/30 border border-success-500 text-success-400">${i.message}</div>${c}`, C.classList.remove("hidden"), g.classList.remove("hidden"), S.classList.remove("hidden"), l.classList.add("hidden"), r.classList.remove("hidden"), x.disabled = !0;
      } else
        p.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">${i.message}</div>`, l.disabled = !1, l.innerHTML = `${A} Connect to Postman`;
    }, r.onclick = () => {
      w = { apiKey: "", workspaceId: "" }, u = [], I = [], P = [], _ = null, K = !1, localStorage.removeItem("postman-api-key"), x.value = "", x.disabled = !1, p.innerHTML = "", C.classList.add("hidden"), g.classList.add("hidden"), S.classList.add("hidden"), U.classList.add("hidden"), l.classList.remove("hidden"), l.disabled = !1, l.innerHTML = `${A} Connect to Postman`, r.classList.add("hidden"), n.innerHTML = `${A} My Collections`, n.classList.remove("bg-secondary-600", "border-secondary-600", "hover:bg-secondary-500"), n.classList.add("bg-success-600", "border-success-600", "hover:bg-success-500");
      const s = e.querySelector("#resultsTable"), i = e.querySelector("#resultCount");
      s && (s.innerHTML = ""), i && (i.textContent = "(0)"), L && (L.innerHTML = ""), k && (k.innerHTML = ""), q && (q.textContent = "(0)");
    }, d.onclick = async () => {
      const s = t.value.trim().toLowerCase(), i = f.value.trim().toLowerCase();
      if (!s) {
        L.innerHTML = '<div class="mt-4 p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">Please enter a search query</div>';
        return;
      }
      X = s.split(/[^a-z]/)[0] || "default", d.disabled = !0, d.innerHTML = '<span class="cp-spinner"></span> Searching...', L.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">Searching Postman Public API Network for "${s}"...</div>`;
      try {
        u = [];
        let c = 0;
        console.log("[CaidoPostman] Calling backend search...");
        const h = await E.backend.searchPostmanPublicNetwork(s);
        console.log("[CaidoPostman] Search results:", h.length, "collections found");
        const T = h.map((y) => ({ id: y.id, name: y.name }));
        if (console.log("[CaidoPostman] Total collections to load:", T.length), T.length === 0) {
          L.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">No collections found for "${s}". Try different keywords like: stripe, paypal, uber, github, twitter, slack</div>`, d.disabled = !1, d.innerHTML = "Search Public APIs";
          return;
        }
        L.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">Found ${T.length} collections. Loading requests...</div>`;
        for (const y of T)
          try {
            console.log("[CaidoPostman] Fetching collection:", y.id);
            const m = await E.backend.fetchPostmanCollection(y.id, w.apiKey);
            if (m && m.requests) {
              c++;
              for (const N of m.requests)
                u.push({
                  id: N.id,
                  name: N.name,
                  method: N.method,
                  url: N.url,
                  headers: N.headers,
                  body: N.body,
                  collectionName: m.name
                });
              L.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-info-900/30 border border-info-500 text-info-400">Loading... ${c}/${T.length} collections (${u.length} requests)</div>`;
            }
          } catch (m) {
            console.log("[CaidoPostman] Error fetching collection:", y.id, m);
          }
        const b = M.value;
        if (b !== "ALL" && (u = u.filter((y) => y.method === b)), i && (u = u.filter((y) => (y.resolvedUrl || y.url).toLowerCase().includes(i) || y.name.toLowerCase().includes(i))), L.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-success-900/30 border border-success-500 text-success-400">Found ${u.length} requests from ${c} collections</div>`, u.length > 0)
          R(e);
        else {
          const y = e.querySelector("#resultsTable");
          y.innerHTML = `<div class="p-10 text-center text-secondary-500">No requests found for "${s}"</div>`;
        }
      } catch (c) {
        L.innerHTML = `<div class="mt-4 p-3 rounded-md text-sm bg-danger-900/30 border border-danger-500 text-danger-400">Error: ${c}</div>`;
      }
      d.disabled = !1, d.innerHTML = "Search Public APIs";
    }, n.onclick = async () => {
      K = !K, K ? (U.classList.remove("hidden"), n.innerHTML = `${A} Hide Collections`, n.classList.remove("bg-success-600", "border-success-600", "hover:bg-success-500"), n.classList.add("bg-secondary-600", "border-secondary-600", "hover:bg-secondary-500"), I.length === 0 && await j()) : (U.classList.add("hidden"), n.innerHTML = `${A} My Collections`, n.classList.remove("bg-secondary-600", "border-secondary-600", "hover:bg-secondary-500"), n.classList.add("bg-success-600", "border-success-600", "hover:bg-success-500"));
    }, z.onclick = () => {
      K = !1, U.classList.add("hidden"), n.innerHTML = `${A} My Collections`, n.classList.remove("bg-secondary-600", "border-secondary-600", "hover:bg-secondary-500"), n.classList.add("bg-success-600", "border-success-600", "hover:bg-success-500");
    }, B.onclick = async () => {
      B.disabled = !0, B.innerHTML = '<span class="cp-spinner cp-spinner-sm"></span>', I = [], _ = null, await j(), B.disabled = !1, B.textContent = "Refresh";
    }, H.onclick = async () => {
      if (u.length > 0) {
        H.disabled = !0;
        let s = 0;
        const i = 5;
        for (let c = 0; c < u.length; c += i) {
          const h = u.slice(c, c + i);
          h.forEach((b) => b.validationStatus = "testing"), R(e), H.innerHTML = `<span class="cp-spinner"></span> ${s}/${u.length}`;
          const T = await Promise.all(h.map((b) => Q(b)));
          h.forEach((b, y) => {
            const m = T[y];
            m.status === 0 ? b.validationStatus = "error" : m.status >= 200 && m.status < 300 ? b.validationStatus = "success" : b.validationStatus = "failed", b.validationCode = m.status, b.validationTime = m.time, b.validationAuth = m.authValid, b.resolvedUrl = m.resolvedUrl, s++;
          }), R(e);
        }
        H.disabled = !1, H.innerHTML = "Auto Test All";
        return;
      }
      if (P.length !== 0) {
        H.disabled = !0, H.innerHTML = '<span class="cp-spinner"></span> Validating...';
        for (let s = 0; s < P.length; s++) {
          const i = P[s];
          try {
            const c = await E.backend.replayRequest(i.id);
            c.success ? (P[s].validationStatus = c.statusCode === 200 ? "active" : "inactive", P[s].validationCode = c.statusCode) : P[s].validationStatus = "error";
          } catch {
            P[s].validationStatus = "error";
          }
          se(e);
        }
        H.disabled = !1, H.innerHTML = "Validate All";
      }
    }, v.onclick = async () => {
      if (P.length === 0) return;
      v.disabled = !0, v.innerHTML = '<span class="cp-spinner"></span> Sending...';
      let s = 0, i = 0;
      if (!w.collectionId) {
        const h = "Caido - " + (t.value.trim() || "requests") + " - " + (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        w.collectionId = await Z(w.apiKey, h) || void 0;
      }
      if (w.collectionId)
        for (const c of P)
          await W(w.apiKey, w.collectionId, c) ? s++ : i++;
      v.innerHTML = i === 0 ? `Sent ${s}` : `${s} sent, ${i} failed`, setTimeout(() => {
        v.innerHTML = `${A} Send All`, v.disabled = !1;
      }, 3e3);
    }, o.navigation.addPage("/postman", {
      body: e,
      topbar: () => {
        const s = document.createElement("div");
        return s.innerHTML = `<span class="flex items-center gap-2">${A} Postman Integration</span>`, s;
      }
    }), o.sidebar.registerItem("Postman", "/postman", { icon: "rocket", group: "Tools" });
  } catch (a) {
    console.error("[CaidoPostman] Init error:", a);
  }
}
export {
  oe as init
};
