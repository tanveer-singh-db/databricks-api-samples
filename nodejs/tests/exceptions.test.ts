import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DatabricksClientError,
  AuthenticationError,
  ResourceNotFoundError,
  PermissionDeniedError,
  QueryExecutionError,
  JobRunError,
  OperationTimeoutError,
} from "../src/exceptions.ts";

describe("DatabricksClientError", () => {
  it("stores message and default details", () => {
    const err = new DatabricksClientError("something failed");
    assert.equal(err.message, "something failed");
    assert.deepEqual(err.details, {});
  });

  it("stores custom details", () => {
    const err = new DatabricksClientError("fail", {
      details: { jobId: 123 },
    });
    assert.equal(err.details.jobId, 123);
  });

  it("chains cause via Error.cause", () => {
    const original = new Error("root cause");
    const err = new DatabricksClientError("wrapped", { cause: original });
    assert.equal(err.cause, original);
  });
});

describe("Error hierarchy", () => {
  it("all subclasses are instances of DatabricksClientError", () => {
    const errors = [
      new AuthenticationError("auth"),
      new ResourceNotFoundError("not found"),
      new PermissionDeniedError("denied"),
      new QueryExecutionError("query"),
      new JobRunError("run"),
      new OperationTimeoutError("timeout"),
    ];
    for (const err of errors) {
      assert.ok(err instanceof DatabricksClientError);
      assert.ok(err instanceof Error);
    }
  });

  it("each has correct name", () => {
    assert.equal(new AuthenticationError("x").name, "AuthenticationError");
    assert.equal(new ResourceNotFoundError("x").name, "ResourceNotFoundError");
    assert.equal(new PermissionDeniedError("x").name, "PermissionDeniedError");
    assert.equal(new QueryExecutionError("x").name, "QueryExecutionError");
    assert.equal(new JobRunError("x").name, "JobRunError");
    assert.equal(new OperationTimeoutError("x").name, "OperationTimeoutError");
  });
});
