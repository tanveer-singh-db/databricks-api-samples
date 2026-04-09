import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseConfigFile, getProfile } from "../src/config-parser.ts";

function createTempConfig(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "dbcfg-"));
  const path = join(dir, ".databrickscfg");
  writeFileSync(path, content, "utf-8");
  return path;
}

describe("parseConfigFile", () => {
  it("parses sections and key-value pairs", () => {
    const path = createTempConfig(`
[DEFAULT]
host = https://default.databricks.com
token = dapi-default

[STAGING]
host = https://staging.databricks.com
token = dapi-staging
`);
    const profiles = parseConfigFile(path);
    assert.equal(profiles.size, 2);
    assert.equal(profiles.get("DEFAULT")?.host, "https://default.databricks.com");
    assert.equal(profiles.get("STAGING")?.token, "dapi-staging");
  });

  it("ignores comments and empty lines", () => {
    const path = createTempConfig(`
# This is a comment
; Another comment

[DEFAULT]
host = https://example.com
# inline not stripped but full-line comments skipped
`);
    const profiles = parseConfigFile(path);
    assert.equal(profiles.get("DEFAULT")?.host, "https://example.com");
  });

  it("returns empty map for nonexistent file", () => {
    const profiles = parseConfigFile("/nonexistent/path/.databrickscfg");
    assert.equal(profiles.size, 0);
  });

  it("handles values with equals signs", () => {
    const path = createTempConfig(`
[DEFAULT]
token = dapi=something=with=equals
`);
    const profiles = parseConfigFile(path);
    assert.equal(profiles.get("DEFAULT")?.token, "dapi=something=with=equals");
  });
});

describe("getProfile", () => {
  it("returns the requested profile", () => {
    const path = createTempConfig(`
[DEFAULT]
host = https://default.com
[PROD]
host = https://prod.com
token = secret
`);
    const profile = getProfile("PROD", path);
    assert.equal(profile?.host, "https://prod.com");
    assert.equal(profile?.token, "secret");
  });

  it("returns null for missing profile", () => {
    const path = createTempConfig("[DEFAULT]\nhost = x\n");
    assert.equal(getProfile("NONEXISTENT", path), null);
  });

  it("defaults to DEFAULT profile", () => {
    const path = createTempConfig("[DEFAULT]\nhost = https://d.com\n");
    const profile = getProfile(undefined, path);
    assert.equal(profile?.host, "https://d.com");
  });
});
