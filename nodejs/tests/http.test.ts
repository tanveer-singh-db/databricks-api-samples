import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../src/http.ts";
import type { TokenProvider } from "../src/http.ts";
import {
  AuthenticationError,
  DatabricksClientError,
  PermissionDeniedError,
  ResourceNotFoundError,
} from "../src/exceptions.ts";

const fakeToken: TokenProvider = {
  async getToken() {
    return "test-token";
  },
};

function createClient(options?: { maxRetries?: number }): HttpClient {
  return new HttpClient({
    host: "https://test.databricks.com",
    tokenProvider: fakeToken,
    timeoutMs: 5000,
    maxRetries: options?.maxRetries ?? 0,
    retryDelayMs: 1,
  });
}

describe("HttpClient", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("sends GET with auth header and parses JSON", async () => {
    const mockFetch = mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ result: "ok" }), { status: 200 }),
    );

    const client = createClient();
    const data = await client.get<{ result: string }>("/api/test");

    assert.equal(data.result, "ok");
    const [url, init] = mockFetch.mock.calls[0].arguments;
    assert.ok((url as string).includes("/api/test"));
    assert.equal((init as RequestInit).method, "GET");
    assert.ok(
      ((init as RequestInit).headers as Record<string, string>).Authorization.includes("test-token"),
    );
  });

  it("sends POST with JSON body", async () => {
    const mockFetch = mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ id: 42 }), { status: 200 }),
    );

    const client = createClient();
    const data = await client.post<{ id: number }>("/api/create", {
      name: "test",
    });

    assert.equal(data.id, 42);
    const [, init] = mockFetch.mock.calls[0].arguments;
    assert.equal((init as RequestInit).method, "POST");
    assert.equal((init as RequestInit).body, JSON.stringify({ name: "test" }));
  });

  it("appends query params to GET", async () => {
    mock.method(globalThis, "fetch", async () =>
      new Response("{}", { status: 200 }),
    );

    const client = createClient();
    await client.get("/api/list", { name: "etl", limit: "10" });

    const [url] = (globalThis.fetch as any).mock.calls[0].arguments;
    assert.ok((url as string).includes("name=etl"));
    assert.ok((url as string).includes("limit=10"));
  });

  it("maps 401 to AuthenticationError", async () => {
    mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ message: "bad token" }), { status: 401 }),
    );

    const client = createClient();
    await assert.rejects(
      () => client.get("/api/test"),
      (err: Error) => err instanceof AuthenticationError && err.message === "bad token",
    );
  });

  it("maps 403 to PermissionDeniedError", async () => {
    mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ message: "forbidden" }), { status: 403 }),
    );

    const client = createClient();
    await assert.rejects(
      () => client.get("/api/test"),
      (err: Error) => err instanceof PermissionDeniedError,
    );
  });

  it("maps 404 to ResourceNotFoundError", async () => {
    mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ message: "not found" }), { status: 404 }),
    );

    const client = createClient();
    await assert.rejects(
      () => client.get("/api/test"),
      (err: Error) => err instanceof ResourceNotFoundError,
    );
  });

  it("retries on 429 and succeeds", async () => {
    let callCount = 0;
    mock.method(globalThis, "fetch", async () => {
      callCount++;
      if (callCount === 1) {
        return new Response("{}", { status: 429 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const client = createClient({ maxRetries: 1 });
    const data = await client.get<{ ok: boolean }>("/api/test");
    assert.equal(data.ok, true);
    assert.equal(callCount, 2);
  });

  it("retries on 500 and eventually throws", async () => {
    mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ message: "server error" }), { status: 500 }),
    );

    const client = createClient({ maxRetries: 1 });
    await assert.rejects(
      () => client.get("/api/test"),
      (err: Error) => err instanceof DatabricksClientError,
    );
  });
});
