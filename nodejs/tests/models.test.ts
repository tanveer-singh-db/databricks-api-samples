import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  JobInfo,
  RunStatus,
  RunResult,
  ColumnInfo,
  QueryResult,
} from "../src/models.ts";

describe("RunStatus", () => {
  it("TERMINATED is terminal", () => {
    const s = new RunStatus({ runId: 1, lifecycleState: "TERMINATED", resultState: "SUCCESS" });
    assert.equal(s.isTerminal, true);
  });

  it("SKIPPED is terminal", () => {
    const s = new RunStatus({ runId: 1, lifecycleState: "SKIPPED" });
    assert.equal(s.isTerminal, true);
  });

  it("INTERNAL_ERROR is terminal", () => {
    const s = new RunStatus({ runId: 1, lifecycleState: "INTERNAL_ERROR" });
    assert.equal(s.isTerminal, true);
  });

  it("RUNNING is not terminal", () => {
    const s = new RunStatus({ runId: 1, lifecycleState: "RUNNING" });
    assert.equal(s.isTerminal, false);
  });

  it("PENDING is not terminal", () => {
    const s = new RunStatus({ runId: 1, lifecycleState: "PENDING" });
    assert.equal(s.isTerminal, false);
  });

  it("defaults resultState and stateMessage to null", () => {
    const s = new RunStatus({ runId: 42, lifecycleState: "RUNNING" });
    assert.equal(s.resultState, null);
    assert.equal(s.stateMessage, null);
  });
});

describe("RunResult", () => {
  it("isSuccess is true for SUCCESS", () => {
    const r = new RunResult({ runId: 1, lifecycleState: "TERMINATED", resultState: "SUCCESS" });
    assert.equal(r.isSuccess, true);
  });

  it("isSuccess is false for FAILED", () => {
    const r = new RunResult({ runId: 1, lifecycleState: "TERMINATED", resultState: "FAILED" });
    assert.equal(r.isSuccess, false);
  });

  it("isTerminal is true for TERMINATED", () => {
    const r = new RunResult({ runId: 1, lifecycleState: "TERMINATED" });
    assert.equal(r.isTerminal, true);
  });

  it("optional fields default to null", () => {
    const r = new RunResult({ runId: 1, lifecycleState: "RUNNING" });
    assert.equal(r.startTime, null);
    assert.equal(r.endTime, null);
    assert.equal(r.runDuration, null);
    assert.equal(r.runPageUrl, null);
  });
});

describe("JobInfo", () => {
  it("defaults to null and empty tags", () => {
    const j = new JobInfo({ jobId: 1, name: "test" });
    assert.equal(j.createdTime, null);
    assert.equal(j.creator, null);
    assert.deepEqual(j.tags, {});
  });

  it("is frozen", () => {
    const j = new JobInfo({ jobId: 1, name: "test" });
    assert.throws(() => {
      (j as any).name = "mutated";
    });
  });
});

describe("ColumnInfo", () => {
  it("constructs correctly", () => {
    const c = new ColumnInfo({ name: "id", typeName: "INT", position: 0 });
    assert.equal(c.name, "id");
    assert.equal(c.typeName, "INT");
    assert.equal(c.position, 0);
  });
});

describe("QueryResult", () => {
  it("constructs correctly", () => {
    const r = new QueryResult({
      statementId: "stmt-1",
      columns: [new ColumnInfo({ name: "x", typeName: "STRING", position: 0 })],
      rows: [["hello"], ["world"]],
      totalRowCount: 2,
      totalChunkCount: 1,
      truncated: false,
    });
    assert.equal(r.statementId, "stmt-1");
    assert.equal(r.rows.length, 2);
    assert.equal(r.truncated, false);
  });
});
