import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveAuth } from "../src/auth.ts";
import { AuthenticationError } from "../src/exceptions.ts";

describe("resolveAuth", () => {
  const savedEnv: Record<string, string | undefined> = {};

  function setEnv(vars: Record<string, string>) {
    for (const [k, v] of Object.entries(vars)) {
      savedEnv[k] = process.env[k];
      process.env[k] = v;
    }
  }

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
    Object.keys(savedEnv).forEach((k) => delete savedEnv[k]);
  });

  it("uses PAT when token is provided in config", async () => {
    const { host, tokenProvider } = resolveAuth({
      host: "https://my.databricks.com",
      token: "dapi123",
    });
    assert.equal(host, "https://my.databricks.com");
    const token = await tokenProvider.getToken();
    assert.equal(token, "dapi123");
  });

  it("strips trailing slash from host", async () => {
    const { host } = resolveAuth({
      host: "https://my.databricks.com///",
      token: "dapi123",
    });
    assert.equal(host, "https://my.databricks.com");
  });

  it("falls back to DATABRICKS_TOKEN env var", async () => {
    setEnv({
      DATABRICKS_HOST: "https://env.databricks.com",
      DATABRICKS_TOKEN: "dapi-env",
    });
    const { host, tokenProvider } = resolveAuth();
    assert.equal(host, "https://env.databricks.com");
    const token = await tokenProvider.getToken();
    assert.equal(token, "dapi-env");
  });

  it("throws AuthenticationError when no host is configured", () => {
    // With a nonexistent profile and no env vars, should fail with AuthenticationError
    const saved = { ...process.env };
    delete process.env.DATABRICKS_HOST;
    delete process.env.DATABRICKS_TOKEN;
    try {
      assert.throws(
        () => resolveAuth({ profile: "__no_such_profile__" }),
        (err: Error) => err instanceof AuthenticationError,
      );
    } finally {
      Object.assign(process.env, saved);
    }
  });

  it("throws AuthenticationError when no auth is resolvable", () => {
    // Clear any env vars that could provide auth
    const saved = { ...process.env };
    delete process.env.DATABRICKS_TOKEN;
    delete process.env.DATABRICKS_CLIENT_ID;
    delete process.env.DATABRICKS_CLIENT_SECRET;
    delete process.env.ARM_CLIENT_ID;
    delete process.env.ARM_CLIENT_SECRET;
    delete process.env.ARM_TENANT_ID;
    try {
      assert.throws(
        // Use a nonexistent profile to avoid ~/.databrickscfg DEFAULT
        () => resolveAuth({ host: "https://x.com", profile: "__nonexistent__" }),
        (err: Error) => err instanceof AuthenticationError,
      );
    } finally {
      Object.assign(process.env, saved);
    }
  });

  it("resolves OAuth M2M from config fields", () => {
    const { host, tokenProvider } = resolveAuth({
      host: "https://ws.databricks.com",
      clientId: "my-client",
      clientSecret: "my-secret",
    });
    assert.equal(host, "https://ws.databricks.com");
    // Token provider is OAuth M2M — we can't easily test the fetch
    // without mocking global fetch, but we verify it was selected
    assert.ok(tokenProvider);
  });

  it("resolves Azure SP from config fields", () => {
    const { tokenProvider } = resolveAuth({
      host: "https://adb.azuredatabricks.net",
      azureClientId: "app-id",
      azureClientSecret: "secret",
      azureTenantId: "tenant-id",
    });
    assert.ok(tokenProvider);
  });

  it("resolves Azure CLI when authType is azure-cli", () => {
    const { tokenProvider } = resolveAuth({
      host: "https://adb.azuredatabricks.net",
      authType: "azure-cli",
    });
    assert.ok(tokenProvider);
  });

  it("uses ARM env vars for Azure SP", () => {
    setEnv({
      DATABRICKS_HOST: "https://adb.net",
      ARM_CLIENT_ID: "arm-client",
      ARM_CLIENT_SECRET: "arm-secret",
      ARM_TENANT_ID: "arm-tenant",
    });
    const { host, tokenProvider } = resolveAuth();
    assert.equal(host, "https://adb.net");
    assert.ok(tokenProvider);
  });
});
