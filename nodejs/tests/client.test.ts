import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabricksWorkspaceClient } from "../src/client.ts";
import { JobsClient } from "../src/jobs.ts";
import { SqlClient } from "../src/sql.ts";

describe("DatabricksWorkspaceClient", () => {
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

  it("creates jobs and sql clients", () => {
    setEnv({
      DATABRICKS_HOST: "https://test.databricks.com",
      DATABRICKS_TOKEN: "dapi-test",
    });
    const client = new DatabricksWorkspaceClient();
    assert.ok(client.jobs instanceof JobsClient);
    assert.ok(client.sql instanceof SqlClient);
  });

  it("accepts explicit config", () => {
    const client = new DatabricksWorkspaceClient({
      host: "https://explicit.databricks.com",
      token: "dapi-explicit",
    });
    assert.ok(client.jobs instanceof JobsClient);
    assert.ok(client.sql instanceof SqlClient);
  });
});
