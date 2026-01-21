import { ref, computed } from "vue";
import type { PostmanConfig, PostmanCollection, PostmanRequest } from "@/types";

export function usePostman() {
  const config = ref<PostmanConfig>({ apiKey: "", workspaceId: "" });
  const isConnected = ref(false);
  const collections = ref<PostmanCollection[]>([]);
  const requests = ref<PostmanRequest[]>([]);
  const isLoading = ref(false);
  const statusMessage = ref("");
  const statusType = ref<"info" | "success" | "error">("info");

  const KNOWN_BASE_URLS: Record<string, Record<string, string>> = {
    dhl: { baseUrl: "https://express.api.dhl.com" },
    stripe: { baseUrl: "https://api.stripe.com" },
    github: { baseUrl: "https://api.github.com" },
    twitter: { baseUrl: "https://api.twitter.com" },
    slack: { baseUrl: "https://slack.com/api" },
    spotify: { baseUrl: "https://api.spotify.com" },
    paypal: { baseUrl: "https://api-m.sandbox.paypal.com" },
    uber: { baseUrl: "https://api.uber.com" },
    twilio: { baseUrl: "https://api.twilio.com" },
    postman: { baseUrl: "https://api.getpostman.com" },
    default: { baseUrl: "https://api.example.com" },
  };

  let currentSearchContext = "default";

  function resolveUrl(url: string): string {
    if (!url) return "";
    let resolved = url;
    const contextUrls = KNOWN_BASE_URLS[currentSearchContext] || KNOWN_BASE_URLS["default"];

    resolved = resolved.replace(/\{\{([^}]+)\}\}/g, (_match, varName) => {
      const key = varName.toLowerCase().trim();
      return contextUrls[key] || contextUrls["baseUrl"] || "";
    });

    resolved = resolved.replace(/\[([^\]]+)\]/g, (_match, varName) => {
      const key = varName.toLowerCase().trim();
      return contextUrls[key] || contextUrls["baseUrl"] || "";
    });

    resolved = resolved.replace(/:([a-zA-Z_]+)/g, "test_$1");
    resolved = resolved.replace(/([^:])\/\//g, "$1/");

    return resolved;
  }

  function setSearchContext(query: string) {
    currentSearchContext = query.split(/[^a-z]/)[0] || "default";
  }

  function setStatus(message: string, type: "info" | "success" | "error" = "info") {
    statusMessage.value = message;
    statusType.value = type;
  }

  function clearStatus() {
    statusMessage.value = "";
  }

  const stats = computed(() => {
    const total = requests.value.length;
    const success = requests.value.filter(r => r.validationStatus === "success").length;
    const failed = requests.value.filter(r => r.validationStatus === "failed" || r.validationStatus === "error").length;
    const withAuth = requests.value.filter(r =>
      r.headers["Authorization"] || r.headers["authorization"] ||
      r.headers["X-Api-Key"] || r.headers["x-api-key"]
    ).length;
    const tested = requests.value.filter(r => r.validationStatus && r.validationStatus !== "pending").length;

    return { total, success, failed, withAuth, tested };
  });

  return {
    config,
    isConnected,
    collections,
    requests,
    isLoading,
    statusMessage,
    statusType,
    stats,
    resolveUrl,
    setSearchContext,
    setStatus,
    clearStatus,
    KNOWN_BASE_URLS,
  };
}
