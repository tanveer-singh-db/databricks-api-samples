import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SqlClient } from "../src/sql.ts";
import type { IHttpClient } from "../src/http.ts";
import { QueryExecutionError } from "../src/exceptions.ts";

function createMockHttp(handlers: {
  get?: (path: string) => Promise<unknown>;
  post?: (path: string, body?: unknown) => Promise<unknown>;
}): IHttpClient {
  return {
    async get<T>(path: string): Promise<T> {
      return (handlers.get?.(path) ?? {}) as T;
    },
    async post<T>(path: string, body?: unknown): Promise<T> {
      return (handlers.post?.(path, body) ?? {}) as T;
    },
  };
}

describe("SqlClient.executeQuery", () => {
  it("single chunk result", async () => {
    const http = createMockHttp({
      post: async () => ({
        statement_id: "stmt-1",
        status: { state: "SUCCEEDED" },
        manifest: {
          schema: {
            columns: [
              { name: "id", type_name: "INT", position: 0 },
              { name: "name", type_name: "STRING", position: 1 },
            ],
          },
          total_chunk_count: 1,
          total_row_count: 2,
          truncated: false,
        },
        result: { data_array: [["1", "alice"], ["2", "bob"]] },
      }),
    });
    const client = new SqlClient(http);
    const result = await client.executeQuery("SELECT *", "wh-1");

    assert.equal(result.statementId, "stmt-1");
    assert.equal(result.columns.length, 2);
    assert.equal(result.columns[0].name, "id");
    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.rows[0], ["1", "alice"]);
    assert.equal(result.totalRowCount, 2);
    assert.equal(result.truncated, false);
  });

  it("multi-chunk pagination", async () => {
    let getCalls = 0;
    const http = createMockHttp({
      post: async () => ({
        statement_id: "stmt-1",
        status: { state: "SUCCEEDED" },
        manifest: {
          schema: { columns: [{ name: "x", type_name: "INT", position: 0 }] },
          total_chunk_count: 3,
          total_row_count: 5,
          truncated: false,
        },
        result: { data_array: [["1"], ["2"]] },
      }),
      get: async () => {
        getCalls++;
        if (getCalls === 1) return { data_array: [["3"], ["4"]] };
        return { data_array: [["5"]] };
      },
    });
    const client = new SqlClient(http);
    const result = await client.executeQuery("SELECT x", "wh-1");

    assert.equal(result.rows.length, 5);
    assert.deepEqual(result.rows[4], ["5"]);
    assert.equal(result.totalChunkCount, 3);
    assert.equal(getCalls, 2);
  });

  it("passes catalog, schema, and parameters", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const http = createMockHttp({
      post: async (_path, body) => {
        capturedBody = body as Record<string, unknown>;
        return {
          statement_id: "s1",
          status: { state: "SUCCEEDED" },
          manifest: { schema: { columns: [] }, total_chunk_count: 1, total_row_count: 0 },
          result: { data_array: [] },
        };
      },
    });
    const client = new SqlClient(http);
    await client.executeQuery("SELECT :id", "wh-1", {
      catalog: "main",
      schema: "default",
      parameters: [{ name: "id", value: "42", type: "INT" }],
    });

    assert.equal(capturedBody?.catalog, "main");
    assert.equal(capturedBody?.schema, "default");
    const params = capturedBody?.parameters as Array<Record<string, string>>;
    assert.equal(params[0].name, "id");
  });

  it("throws on execution error", async () => {
    const http = createMockHttp({
      post: async () => {
        throw new Error("warehouse offline");
      },
    });
    const client = new SqlClient(http);
    await assert.rejects(
      () => client.executeQuery("SELECT 1", "wh-bad"),
      (err: Error) => err instanceof QueryExecutionError && err.message.includes("Failed"),
    );
  });

  it("throws on FAILED statement", async () => {
    const http = createMockHttp({
      post: async () => ({
        statement_id: "s1",
        status: { state: "FAILED", error: { message: "syntax error at line 1" } },
        manifest: null,
        result: null,
      }),
    });
    const client = new SqlClient(http);
    await assert.rejects(
      () => client.executeQuery("SELCT 1", "wh-1"),
      (err: Error) => err instanceof QueryExecutionError && err.message.includes("syntax error"),
    );
  });
});

describe("SqlClient.executeQueryLazy", () => {
  it("yields chunks", async () => {
    const http = createMockHttp({
      post: async () => ({
        statement_id: "s1",
        status: { state: "SUCCEEDED" },
        manifest: {
          schema: { columns: [{ name: "x", type_name: "INT", position: 0 }] },
          total_chunk_count: 2,
        },
        result: { data_array: [["1"]] },
      }),
      get: async () => ({ data_array: [["2"]] }),
    });
    const client = new SqlClient(http);
    const chunks: (string | null)[][][] = [];
    for await (const chunk of client.executeQueryLazy("SELECT x", "wh-1")) {
      chunks.push(chunk);
    }
    assert.equal(chunks.length, 2);
    assert.deepEqual(chunks[0], [["1"]]);
    assert.deepEqual(chunks[1], [["2"]]);
  });

  it("single chunk yields once", async () => {
    const http = createMockHttp({
      post: async () => ({
        statement_id: "s1",
        status: { state: "SUCCEEDED" },
        manifest: { total_chunk_count: 1 },
        result: { data_array: [["1"]] },
      }),
    });
    const client = new SqlClient(http);
    const chunks: (string | null)[][][] = [];
    for await (const chunk of client.executeQueryLazy("SELECT 1", "wh-1")) {
      chunks.push(chunk);
    }
    assert.equal(chunks.length, 1);
  });

  it("empty result yields nothing", async () => {
    const http = createMockHttp({
      post: async () => ({
        statement_id: "s1",
        status: { state: "SUCCEEDED" },
        manifest: { total_chunk_count: 1 },
        result: { data_array: [] },
      }),
    });
    const client = new SqlClient(http);
    const chunks: (string | null)[][][] = [];
    for await (const chunk of client.executeQueryLazy("SELECT *", "wh-1")) {
      chunks.push(chunk);
    }
    assert.equal(chunks.length, 0);
  });
});
