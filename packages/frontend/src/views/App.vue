<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";
import Card from "primevue/card";
import Message from "primevue/message";

import { useSDK } from "@/plugins/sdk";
import type { PostmanConfig, PostmanCollection, PostmanRequest } from "@/types";

const sdk = useSDK();

// State
const config = ref<PostmanConfig>({ apiKey: "", workspaceId: "" });
const isConnected = ref(false);
const isLoading = ref(false);
const statusMessage = ref("");
const statusType = ref<"info" | "success" | "error">("info");

const searchQuery = ref("");
const domainFilter = ref("");
const methodFilter = ref("ALL");
const methodOptions = [
  { label: "All", value: "ALL" },
  { label: "GET", value: "GET" },
  { label: "POST", value: "POST" },
  { label: "PUT", value: "PUT" },
  { label: "PATCH", value: "PATCH" },
  { label: "DELETE", value: "DELETE" },
];

const collections = ref<PostmanCollection[]>([]);
const requests = ref<PostmanRequest[]>([]);
const showCollections = ref(false);
const expandedRows = ref<Record<string, boolean>>({});

// Computed
const stats = computed(() => ({
  total: requests.value.length,
  success: requests.value.filter(r => r.validationStatus === "success").length,
  failed: requests.value.filter(r => ["failed", "error"].includes(r.validationStatus || "")).length,
  withAuth: requests.value.filter(r => r.headers["Authorization"] || r.headers["X-Api-Key"]).length,
  tested: requests.value.filter(r => r.validationStatus && r.validationStatus !== "pending").length,
}));

// URL Resolution
const KNOWN_BASE_URLS: Record<string, string> = {
  dhl: "https://express.api.dhl.com",
  stripe: "https://api.stripe.com",
  github: "https://api.github.com",
  twitter: "https://api.twitter.com",
  slack: "https://slack.com/api",
  default: "https://api.example.com",
};

let searchContext = "default";

function resolveUrl(url: string): string {
  if (!url) return "";
  let resolved = url;
  const baseUrl = KNOWN_BASE_URLS[searchContext] || KNOWN_BASE_URLS["default"];
  resolved = resolved.replace(/\{\{([^}]+)\}\}/g, () => baseUrl);
  resolved = resolved.replace(/:([a-zA-Z_]+)/g, "test_$1");
  return resolved;
}

// Methods
async function connect() {
  if (!config.value.apiKey.trim()) {
    setStatus("Please enter your API Key", "error");
    return;
  }

  isLoading.value = true;
  setStatus("Connecting to Postman...", "info");

  try {
    const workspaces = await sdk.backend.fetchMyWorkspaces(config.value.apiKey);

    if (workspaces.length === 0) {
      setStatus("Invalid API Key or connection failed", "error");
      isLoading.value = false;
      return;
    }

    localStorage.setItem("postman-api-key", config.value.apiKey);
    isConnected.value = true;
    setStatus(`Connected successfully (${workspaces.length} workspaces)`, "success");
  } catch (error) {
    setStatus(`Connection error: ${error}`, "error");
  }

  isLoading.value = false;
}

function logout() {
  config.value = { apiKey: "", workspaceId: "" };
  isConnected.value = false;
  collections.value = [];
  requests.value = [];
  localStorage.removeItem("postman-api-key");
  statusMessage.value = "";
}

async function searchPublicAPIs() {
  if (!searchQuery.value.trim()) {
    setStatus("Please enter a search query", "error");
    return;
  }

  isLoading.value = true;
  searchContext = searchQuery.value.toLowerCase().split(/[^a-z]/)[0] || "default";
  setStatus(`Searching for "${searchQuery.value}"...`, "info");

  try {
    const searchResults = await sdk.backend.searchPostmanPublicNetwork(searchQuery.value);

    if (searchResults.length === 0) {
      setStatus(`No collections found for "${searchQuery.value}"`, "info");
      isLoading.value = false;
      return;
    }

    setStatus(`Found ${searchResults.length} collections. Loading requests...`, "info");
    requests.value = [];
    let loaded = 0;

    for (const col of searchResults.slice(0, 10)) {
      try {
        const data = await sdk.backend.fetchPostmanCollection(col.id, config.value.apiKey);
        if (data?.requests) {
          loaded++;
          for (const req of data.requests) {
            requests.value.push({
              ...req,
              collectionName: data.name,
              validationStatus: "pending",
            });
          }
        }
      } catch {
        // Skip failed collections
      }
    }

    // Apply filters
    if (methodFilter.value !== "ALL") {
      requests.value = requests.value.filter(r => r.method === methodFilter.value);
    }
    if (domainFilter.value) {
      requests.value = requests.value.filter(r =>
        r.url.toLowerCase().includes(domainFilter.value.toLowerCase())
      );
    }

    setStatus(`Loaded ${requests.value.length} requests from ${loaded} collections`, "success");
  } catch (error) {
    setStatus(`Search error: ${error}`, "error");
  }

  isLoading.value = false;
}

async function loadMyCollections() {
  isLoading.value = true;
  setStatus("Loading your collections...", "info");

  try {
    const cols = await sdk.backend.fetchMyCollections(config.value.apiKey);
    collections.value = cols.map((c: any) => ({
      id: c.id,
      uid: c.uid,
      name: c.name,
      owner: "",
    }));
    showCollections.value = true;
    setStatus(`Found ${collections.value.length} collections`, "success");
  } catch (error) {
    setStatus(`Error loading collections: ${error}`, "error");
  }

  isLoading.value = false;
}

async function loadCollection(col: PostmanCollection) {
  isLoading.value = true;
  setStatus(`Loading "${col.name}"...`, "info");

  try {
    const data = await sdk.backend.fetchPostmanCollection(col.uid, config.value.apiKey);
    if (data?.requests) {
      requests.value = data.requests.map(req => ({
        ...req,
        collectionName: data.name,
        validationStatus: "pending" as const,
      }));
      setStatus(`Loaded ${requests.value.length} requests`, "success");
    }
  } catch (error) {
    setStatus(`Error: ${error}`, "error");
  }

  isLoading.value = false;
}

async function testRequest(req: PostmanRequest, index: number) {
  requests.value[index]!.validationStatus = "testing";
  const resolved = resolveUrl(req.url);

  try {
    const result = await sdk.backend.importAndSendRequest(
      req.method,
      resolved,
      JSON.stringify(req.headers),
      req.body
    );

    requests.value[index]!.resolvedUrl = resolved;
    requests.value[index]!.validationCode = result.statusCode;
    requests.value[index]!.validationTime = result.time;

    if (!result.success || result.statusCode === 0) {
      requests.value[index]!.validationStatus = "error";
    } else if (result.statusCode && result.statusCode >= 200 && result.statusCode < 300) {
      requests.value[index]!.validationStatus = "success";
    } else {
      requests.value[index]!.validationStatus = "failed";
    }
  } catch {
    requests.value[index]!.validationStatus = "error";
  }
}

async function testAllRequests() {
  for (let i = 0; i < requests.value.length; i++) {
    await testRequest(requests.value[i]!, i);
  }
}

async function sendToReplay(req: PostmanRequest) {
  const resolved = req.resolvedUrl || resolveUrl(req.url);

  try {
    const parsedUrl = new URL(resolved);
    const isTLS = parsedUrl.protocol === "https:";
    const port = parsedUrl.port ? parseInt(parsedUrl.port) : (isTLS ? 443 : 80);
    const path = parsedUrl.pathname + parsedUrl.search;

    let rawRequest = `${req.method} ${path || "/"} HTTP/1.1\r\n`;
    rawRequest += `Host: ${parsedUrl.hostname}\r\n`;

    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() !== "host" && !value.includes("{{")) {
        rawRequest += `${key}: ${value}\r\n`;
      }
    }

    if (req.body && req.method !== "GET") {
      rawRequest += `Content-Length: ${new TextEncoder().encode(req.body).length}\r\n`;
    }

    rawRequest += "\r\n";
    if (req.body && req.method !== "GET") {
      rawRequest += req.body;
    }

    const session = await sdk.replay.createSession({
      raw: rawRequest,
      connectionInfo: {
        host: parsedUrl.hostname,
        port,
        isTLS,
      },
    });

    if (session) {
      await sdk.replay.openTab(session.id, { select: true });
      await sdk.navigation.goTo("/replay");
    }
  } catch (error) {
    console.error("Error sending to replay:", error);
  }
}

function setStatus(msg: string, type: "info" | "success" | "error") {
  statusMessage.value = msg;
  statusType.value = type;
}

function getMethodSeverity(method: string) {
  const map: Record<string, "success" | "info" | "warn" | "danger" | "secondary" | "contrast" | undefined> = {
    GET: "success",
    POST: "info",
    PUT: "warn",
    PATCH: "warn",
    DELETE: "danger",
  };
  return map[method] || "secondary";
}

function getStatusSeverity(status?: string) {
  const map: Record<string, "success" | "info" | "warn" | "danger" | "secondary" | "contrast" | undefined> = {
    success: "success",
    failed: "danger",
    error: "secondary",
    testing: "info",
  };
  return map[status || ""] || "info";
}

// Lifecycle
onMounted(() => {
  const savedKey = localStorage.getItem("postman-api-key");
  if (savedKey) config.value.apiKey = savedKey;
});
</script>

<template>
  <div class="h-full overflow-y-auto p-4">
    <!-- Header -->
    <div class="flex items-center gap-4 mb-6 pb-4 border-b border-[hsl(var(--c-surface-600))]">
      <div class="w-12 h-12 bg-[hsl(var(--c-primary-600))] rounded-xl flex items-center justify-center">
        <i class="fas fa-paper-plane text-white text-xl"></i>
      </div>
      <div>
        <h1 class="text-2xl font-semibold text-[hsl(var(--c-surface-0))]">Caido Postman</h1>
        <span class="text-[hsl(var(--c-primary-400))] text-sm">by @OFJAAAH</span>
      </div>
      <Tag v-if="isConnected" severity="success" class="ml-auto">Connected</Tag>
    </div>

    <!-- Status Message -->
    <Message v-if="statusMessage" :severity="statusType" :closable="false" class="mb-4">
      {{ statusMessage }}
    </Message>

    <!-- Connect Section -->
    <Card class="mb-4" v-if="!isConnected">
      <template #title>
        <div class="flex items-center gap-2">
          <i class="fas fa-plug text-[hsl(var(--c-primary-400))]"></i>
          Connect to Postman
        </div>
      </template>
      <template #content>
        <div class="flex flex-col gap-4">
          <div>
            <label class="block mb-2 text-sm font-medium text-[hsl(var(--c-surface-300))]">Postman API Key</label>
            <InputText
              v-model="config.apiKey"
              placeholder="PMAK-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              class="w-full"
            />
            <small class="text-[hsl(var(--c-surface-400))]">
              Get your API key from
              <a href="https://go.postman.co/settings/me/api-keys" target="_blank" class="text-[hsl(var(--c-primary-400))] hover:underline">
                Postman Settings
              </a>
            </small>
          </div>
          <Button @click="connect" :loading="isLoading">
            <i class="fas fa-plug mr-2"></i>
            Connect to Postman
          </Button>
        </div>
      </template>
    </Card>

    <!-- Search Section -->
    <Card class="mb-4" v-if="isConnected">
      <template #title>
        <div class="flex items-center gap-2">
          <i class="fas fa-search text-[hsl(var(--c-primary-400))]"></i>
          Search Postman Public API Network
        </div>
      </template>
      <template #content>
        <div class="flex flex-col gap-4">
          <div class="flex gap-4 flex-wrap">
            <div class="flex-1 min-w-[200px]">
              <label class="block mb-2 text-sm font-medium text-[hsl(var(--c-surface-300))]">API Name / Company</label>
              <InputText
                v-model="searchQuery"
                placeholder="dhl, stripe, github..."
                class="w-full"
              />
            </div>
            <div class="flex-1 min-w-[150px]">
              <label class="block mb-2 text-sm font-medium text-[hsl(var(--c-surface-300))]">Domain Filter</label>
              <InputText
                v-model="domainFilter"
                placeholder="api.example.com"
                class="w-full"
              />
            </div>
            <div class="w-32">
              <label class="block mb-2 text-sm font-medium text-[hsl(var(--c-surface-300))]">Method</label>
              <Select
                v-model="methodFilter"
                :options="methodOptions"
                optionLabel="label"
                optionValue="value"
                class="w-full"
              />
            </div>
          </div>
          <div class="flex gap-2 flex-wrap">
            <Button @click="searchPublicAPIs" :loading="isLoading">
              <i class="fas fa-search mr-2"></i>
              Search Public APIs
            </Button>
            <Button @click="loadMyCollections" :loading="isLoading" severity="secondary">
              <i class="fas fa-folder mr-2"></i>
              My Collections
            </Button>
            <Button @click="logout" severity="danger" outlined class="ml-auto">
              <i class="fas fa-sign-out-alt mr-2"></i>
              Logout
            </Button>
          </div>
        </div>
      </template>
    </Card>

    <!-- My Collections -->
    <Card class="mb-4" v-if="showCollections && collections.length > 0">
      <template #title>
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-2">
            <i class="fas fa-folder-open text-[hsl(var(--c-primary-400))]"></i>
            My Collections ({{ collections.length }})
          </div>
          <Button @click="showCollections = false" severity="secondary" size="small" text>
            <i class="fas fa-times"></i>
          </Button>
        </div>
      </template>
      <template #content>
        <div class="max-h-64 overflow-y-auto space-y-2">
          <div
            v-for="col in collections"
            :key="col.uid"
            class="flex items-center justify-between p-3 bg-[hsl(var(--c-surface-700))] rounded-lg hover:bg-[hsl(var(--c-surface-600))] cursor-pointer transition-colors"
            @click="loadCollection(col)"
          >
            <div class="flex items-center gap-2">
              <i class="fas fa-layer-group text-[hsl(var(--c-primary-400))]"></i>
              <span class="text-[hsl(var(--c-surface-0))]">{{ col.name }}</span>
            </div>
            <Button size="small" severity="info" text>
              <i class="fas fa-download mr-1"></i>
              Load
            </Button>
          </div>
        </div>
      </template>
    </Card>

    <!-- Results Section -->
    <Card v-if="requests.length > 0">
      <template #title>
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-2">
            <i class="fas fa-list text-[hsl(var(--c-primary-400))]"></i>
            Results ({{ requests.length }})
          </div>
          <Button @click="testAllRequests" size="small" severity="success">
            <i class="fas fa-play mr-2"></i>
            Test All
          </Button>
        </div>
      </template>
      <template #content>
        <!-- Stats -->
        <div class="flex gap-4 mb-4 flex-wrap">
          <div class="px-4 py-2 bg-[hsl(var(--c-surface-700))] rounded-lg text-center min-w-[80px]">
            <div class="text-xl font-semibold text-[hsl(var(--c-info-400))]">{{ stats.total }}</div>
            <div class="text-xs text-[hsl(var(--c-surface-400))]">Total</div>
          </div>
          <div class="px-4 py-2 bg-[hsl(var(--c-surface-700))] rounded-lg text-center min-w-[80px]">
            <div class="text-xl font-semibold text-[hsl(var(--c-success-400))]">{{ stats.success }}</div>
            <div class="text-xs text-[hsl(var(--c-surface-400))]">Success</div>
          </div>
          <div class="px-4 py-2 bg-[hsl(var(--c-surface-700))] rounded-lg text-center min-w-[80px]">
            <div class="text-xl font-semibold text-[hsl(var(--c-danger-400))]">{{ stats.failed }}</div>
            <div class="text-xs text-[hsl(var(--c-surface-400))]">Failed</div>
          </div>
          <div class="px-4 py-2 bg-[hsl(var(--c-surface-700))] rounded-lg text-center min-w-[80px]">
            <div class="text-xl font-semibold text-[hsl(var(--c-secondary-400))]">{{ stats.withAuth }}</div>
            <div class="text-xs text-[hsl(var(--c-surface-400))]">With Auth</div>
          </div>
        </div>

        <!-- Table -->
        <DataTable
          :value="requests"
          v-model:expandedRows="expandedRows"
          dataKey="id"
          scrollable
          scrollHeight="400px"
          class="text-sm"
        >
          <Column expander style="width: 3rem" />
          <Column field="method" header="Method" style="width: 80px">
            <template #body="{ data }">
              <Tag :severity="getMethodSeverity(data.method)">{{ data.method }}</Tag>
            </template>
          </Column>
          <Column field="name" header="Name" style="max-width: 200px">
            <template #body="{ data }">
              <span class="truncate block text-[hsl(var(--c-surface-0))]" :title="data.name">{{ data.name }}</span>
            </template>
          </Column>
          <Column field="url" header="URL">
            <template #body="{ data }">
              <span class="font-mono text-xs truncate block text-[hsl(var(--c-surface-300))]" :title="data.resolvedUrl || data.url">
                {{ data.resolvedUrl || resolveUrl(data.url) }}
              </span>
            </template>
          </Column>
          <Column header="Status" style="width: 100px">
            <template #body="{ data }">
              <span v-if="data.validationStatus === 'testing'" class="cp-spinner cp-spinner-sm"></span>
              <Tag v-else-if="data.validationCode" :severity="getStatusSeverity(data.validationStatus)">
                {{ data.validationCode }}
              </Tag>
              <span v-else class="text-[hsl(var(--c-surface-400))]">-</span>
            </template>
          </Column>
          <Column header="Actions" style="width: 150px">
            <template #body="{ data, index }">
              <div class="flex gap-1">
                <Button
                  @click="testRequest(data, index)"
                  size="small"
                  severity="info"
                  :disabled="data.validationStatus === 'testing'"
                  text
                >
                  <i class="fas fa-play"></i>
                </Button>
                <Button
                  @click="sendToReplay(data)"
                  size="small"
                  severity="success"
                  text
                >
                  <i class="fas fa-paper-plane"></i>
                </Button>
              </div>
            </template>
          </Column>
          <template #expansion="{ data }">
            <div class="p-4 bg-[hsl(var(--c-surface-800))] rounded">
              <div class="mb-2">
                <strong class="text-[hsl(var(--c-primary-400))]">Collection:</strong>
                <span class="text-[hsl(var(--c-surface-0))] ml-2">{{ data.collectionName }}</span>
              </div>
              <div class="mb-2">
                <strong class="text-[hsl(var(--c-primary-400))]">URL:</strong>
                <code class="text-xs text-[hsl(var(--c-surface-300))] ml-2">{{ data.url }}</code>
              </div>
              <div v-if="data.resolvedUrl" class="mb-2">
                <strong class="text-[hsl(var(--c-success-400))]">Resolved:</strong>
                <code class="text-xs text-[hsl(var(--c-surface-300))] ml-2">{{ data.resolvedUrl }}</code>
              </div>
              <div class="mb-2">
                <strong class="text-[hsl(var(--c-primary-400))]">Headers:</strong>
                <pre class="text-xs mt-1 p-2 bg-[hsl(var(--c-surface-900))] rounded overflow-auto max-h-32 text-[hsl(var(--c-surface-300))]">{{ JSON.stringify(data.headers, null, 2) }}</pre>
              </div>
              <div v-if="data.body">
                <strong class="text-[hsl(var(--c-primary-400))]">Body:</strong>
                <pre class="text-xs mt-1 p-2 bg-[hsl(var(--c-surface-900))] rounded overflow-auto max-h-32 text-[hsl(var(--c-surface-300))]">{{ data.body }}</pre>
              </div>
            </div>
          </template>
        </DataTable>
      </template>
    </Card>
  </div>
</template>
