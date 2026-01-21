import { type Caido } from "@caido/sdk-frontend";
import { type API } from "backend";

export type FrontendSDK = Caido<API, Record<string, never>>;

export interface PostmanConfig {
  apiKey: string;
  workspaceId: string;
  collectionId?: string;
}

export interface PostmanCollection {
  id: string;
  uid: string;
  name: string;
  owner: string;
}

export interface PostmanRequest {
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
  importStatus?: "idle" | "importing" | "done" | "error";
  importError?: string;
}

export interface FilteredRequest {
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
