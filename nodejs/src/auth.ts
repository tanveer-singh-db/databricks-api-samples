/**
 * Authentication configuration and credential resolution chain.
 *
 * Implements PAT, OAuth M2M, Azure Service Principal, Azure CLI,
 * and config profile authentication — all using built-in Node.js APIs.
 *
 * Note: Avoids TypeScript parameter properties and other syntax unsupported
 * by Node.js --experimental-strip-types mode.
 */

import { execSync } from "node:child_process";
import { AuthenticationError } from "./exceptions.ts";
import { getProfile } from "./config-parser.ts";
import type { TokenProvider } from "./http.ts";

export interface AuthConfig {
  // Core
  host?: string;
  token?: string;
  profile?: string;
  authType?: string;

  // OAuth M2M (service principal)
  clientId?: string;
  clientSecret?: string;

  // Azure-specific
  azureClientId?: string;
  azureClientSecret?: string;
  azureTenantId?: string;

  // SDK behavior
  httpTimeoutSeconds?: number;
  retryTimeoutSeconds?: number;
}

// ─── Token Providers ──────────────────────────────────────────────

class PatTokenProvider {
  _token: string;

  constructor(token: string) {
    this._token = token;
  }

  async getToken(): Promise<string> {
    return this._token;
  }
}

class CachingTokenProviderBase {
  _cachedToken: string | null = null;
  _expiresAt = 0;
  _fetchTokenImpl: () => Promise<{ token: string; expiresInSeconds: number }>;

  constructor(
    fetchTokenImpl: () => Promise<{ token: string; expiresInSeconds: number }>,
  ) {
    this._fetchTokenImpl = fetchTokenImpl;
  }

  async getToken(): Promise<string> {
    if (this._cachedToken && Date.now() < this._expiresAt) {
      return this._cachedToken;
    }
    const { token, expiresInSeconds } = await this._fetchTokenImpl();
    this._cachedToken = token;
    this._expiresAt = Date.now() + (expiresInSeconds - 30) * 1000;
    return token;
  }
}

const DATABRICKS_AZURE_RESOURCE = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d";

function createOAuthM2MProvider(
  host: string,
  clientId: string,
  clientSecret: string,
): TokenProvider {
  return new CachingTokenProviderBase(async () => {
    const url = `${host}/oidc/v1/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: "all-apis",
    });
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new AuthenticationError(
        `OAuth M2M token request failed: HTTP ${response.status}`,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    return { token: data.access_token, expiresInSeconds: data.expires_in };
  });
}

function createAzureServicePrincipalProvider(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): TokenProvider {
  return new CachingTokenProviderBase(async () => {
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: `${DATABRICKS_AZURE_RESOURCE}/.default`,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new AuthenticationError(
        `Azure SP token request failed: HTTP ${response.status}`,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    return { token: data.access_token, expiresInSeconds: data.expires_in };
  });
}

function createAzureCliProvider(): TokenProvider {
  return new CachingTokenProviderBase(async () => {
    try {
      const output = execSync(
        `az account get-access-token --resource ${DATABRICKS_AZURE_RESOURCE} --output json`,
        { encoding: "utf-8", timeout: 15_000 },
      );
      const data = JSON.parse(output) as {
        accessToken: string;
        expiresOn: string;
      };
      const expiresAt = new Date(data.expiresOn).getTime();
      const expiresInSeconds = Math.max(
        60,
        Math.floor((expiresAt - Date.now()) / 1000),
      );
      return { token: data.accessToken, expiresInSeconds };
    } catch (err) {
      throw new AuthenticationError(
        `Azure CLI authentication failed: ${err}`,
        { cause: err },
      );
    }
  });
}

// ─── Credential Resolution ────────────────────────────────────────

function resolveHostFromProfile(profileName?: string): string | undefined {
  if (!profileName) return undefined;
  const profile = getProfile(profileName);
  return profile?.host;
}

function resolveFromProfile(
  profileName: string,
  host: string,
): { host: string; tokenProvider: TokenProvider } {
  const profile = getProfile(profileName);
  if (!profile) {
    throw new AuthenticationError(`Config profile '${profileName}' not found`);
  }

  const profileHost = profile.host ?? host;

  if (profile.token) {
    return {
      host: profileHost,
      tokenProvider: new PatTokenProvider(profile.token),
    };
  }
  if (profile.client_id && profile.client_secret) {
    return {
      host: profileHost,
      tokenProvider: createOAuthM2MProvider(
        profileHost,
        profile.client_id,
        profile.client_secret,
      ),
    };
  }
  if (
    profile.azure_client_id &&
    profile.azure_client_secret &&
    profile.azure_tenant_id
  ) {
    return {
      host: profileHost,
      tokenProvider: createAzureServicePrincipalProvider(
        profile.azure_tenant_id,
        profile.azure_client_id,
        profile.azure_client_secret,
      ),
    };
  }

  throw new AuthenticationError(
    `Config profile '${profileName}' has no usable credentials`,
  );
}

export function resolveAuth(config?: AuthConfig): {
  host: string;
  tokenProvider: TokenProvider;
} {
  const cfg = config ?? {};

  // Resolve host: explicit config → env var → named profile → DEFAULT profile
  const rawHost =
    cfg.host ??
    process.env.DATABRICKS_HOST ??
    resolveHostFromProfile(cfg.profile) ??
    resolveHostFromProfile("DEFAULT");
  if (!rawHost) {
    throw new AuthenticationError("No Databricks host configured");
  }
  const host = rawHost.replace(/\/+$/, "");

  // 1. Explicit token → PAT
  if (cfg.authType === "pat" || cfg.token) {
    const token = cfg.token ?? process.env.DATABRICKS_TOKEN;
    if (!token) {
      throw new AuthenticationError("PAT auth requires a token");
    }
    return { host, tokenProvider: new PatTokenProvider(token) };
  }

  // 2. OAuth M2M
  if (cfg.authType === "oauth-m2m" || (cfg.clientId && cfg.clientSecret)) {
    const clientId = cfg.clientId ?? process.env.DATABRICKS_CLIENT_ID;
    const clientSecret =
      cfg.clientSecret ?? process.env.DATABRICKS_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new AuthenticationError(
        "OAuth M2M requires clientId and clientSecret",
      );
    }
    return {
      host,
      tokenProvider: createOAuthM2MProvider(host, clientId, clientSecret),
    };
  }

  // 3. Azure Service Principal
  if (cfg.azureClientId && cfg.azureClientSecret && cfg.azureTenantId) {
    return {
      host,
      tokenProvider: createAzureServicePrincipalProvider(
        cfg.azureTenantId,
        cfg.azureClientId,
        cfg.azureClientSecret,
      ),
    };
  }

  // 4. Azure CLI
  if (cfg.authType === "azure-cli") {
    return { host, tokenProvider: createAzureCliProvider() };
  }

  // 5. Named profile
  if (cfg.profile) {
    return resolveFromProfile(cfg.profile, host);
  }

  // 6. Env var fallbacks
  if (process.env.DATABRICKS_TOKEN) {
    return {
      host,
      tokenProvider: new PatTokenProvider(process.env.DATABRICKS_TOKEN),
    };
  }
  if (
    process.env.DATABRICKS_CLIENT_ID &&
    process.env.DATABRICKS_CLIENT_SECRET
  ) {
    return {
      host,
      tokenProvider: createOAuthM2MProvider(
        host,
        process.env.DATABRICKS_CLIENT_ID,
        process.env.DATABRICKS_CLIENT_SECRET,
      ),
    };
  }
  if (
    process.env.ARM_CLIENT_ID &&
    process.env.ARM_CLIENT_SECRET &&
    process.env.ARM_TENANT_ID
  ) {
    return {
      host,
      tokenProvider: createAzureServicePrincipalProvider(
        process.env.ARM_TENANT_ID,
        process.env.ARM_CLIENT_ID,
        process.env.ARM_CLIENT_SECRET,
      ),
    };
  }

  // 7. DEFAULT config profile
  const defaultProfile = getProfile("DEFAULT");
  if (
    defaultProfile?.token ||
    defaultProfile?.client_id ||
    defaultProfile?.azure_client_id
  ) {
    return resolveFromProfile("DEFAULT", host);
  }

  throw new AuthenticationError(
    "No authentication method could be resolved",
  );
}
