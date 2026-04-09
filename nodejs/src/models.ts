/**
 * Pure data models for DatabricksWorkspaceClient.
 *
 * All models are frozen (immutable) classes with computed getters,
 * mirroring Python's frozen dataclasses. These define the cross-language
 * contract that Python and Java implementations also follow.
 */

const TERMINAL_LIFECYCLE_STATES = new Set([
  "TERMINATED",
  "SKIPPED",
  "INTERNAL_ERROR",
]);

export class JobInfo {
  readonly jobId: number;
  readonly name: string;
  readonly createdTime: number | null;
  readonly creator: string | null;
  readonly tags: Readonly<Record<string, string>>;

  constructor(opts: {
    jobId: number;
    name: string;
    createdTime?: number | null;
    creator?: string | null;
    tags?: Record<string, string>;
  }) {
    this.jobId = opts.jobId;
    this.name = opts.name;
    this.createdTime = opts.createdTime ?? null;
    this.creator = opts.creator ?? null;
    this.tags = Object.freeze({ ...(opts.tags ?? {}) });
    Object.freeze(this);
  }
}

export class RunStatus {
  readonly runId: number;
  readonly lifecycleState: string;
  readonly resultState: string | null;
  readonly stateMessage: string | null;

  constructor(opts: {
    runId: number;
    lifecycleState: string;
    resultState?: string | null;
    stateMessage?: string | null;
  }) {
    this.runId = opts.runId;
    this.lifecycleState = opts.lifecycleState;
    this.resultState = opts.resultState ?? null;
    this.stateMessage = opts.stateMessage ?? null;
    Object.freeze(this);
  }

  get isTerminal(): boolean {
    return TERMINAL_LIFECYCLE_STATES.has(this.lifecycleState);
  }
}

export class RunResult {
  readonly runId: number;
  readonly lifecycleState: string;
  readonly resultState: string | null;
  readonly stateMessage: string | null;
  readonly startTime: number | null;
  readonly endTime: number | null;
  readonly runDuration: number | null;
  readonly runPageUrl: string | null;

  constructor(opts: {
    runId: number;
    lifecycleState: string;
    resultState?: string | null;
    stateMessage?: string | null;
    startTime?: number | null;
    endTime?: number | null;
    runDuration?: number | null;
    runPageUrl?: string | null;
  }) {
    this.runId = opts.runId;
    this.lifecycleState = opts.lifecycleState;
    this.resultState = opts.resultState ?? null;
    this.stateMessage = opts.stateMessage ?? null;
    this.startTime = opts.startTime ?? null;
    this.endTime = opts.endTime ?? null;
    this.runDuration = opts.runDuration ?? null;
    this.runPageUrl = opts.runPageUrl ?? null;
    Object.freeze(this);
  }

  get isTerminal(): boolean {
    return TERMINAL_LIFECYCLE_STATES.has(this.lifecycleState);
  }

  get isSuccess(): boolean {
    return this.resultState === "SUCCESS";
  }
}

export class ColumnInfo {
  readonly name: string;
  readonly typeName: string;
  readonly position: number;

  constructor(opts: { name: string; typeName: string; position: number }) {
    this.name = opts.name;
    this.typeName = opts.typeName;
    this.position = opts.position;
    Object.freeze(this);
  }
}

export class QueryResult {
  readonly statementId: string;
  readonly columns: readonly ColumnInfo[];
  readonly rows: readonly (readonly (string | null)[])[];
  readonly totalRowCount: number;
  readonly totalChunkCount: number;
  readonly truncated: boolean;

  constructor(opts: {
    statementId: string;
    columns: ColumnInfo[];
    rows: (string | null)[][];
    totalRowCount: number;
    totalChunkCount: number;
    truncated: boolean;
  }) {
    this.statementId = opts.statementId;
    this.columns = Object.freeze([...opts.columns]);
    this.rows = Object.freeze(opts.rows.map((r) => Object.freeze([...r])));
    this.totalRowCount = opts.totalRowCount;
    this.totalChunkCount = opts.totalChunkCount;
    this.truncated = opts.truncated;
    Object.freeze(this);
  }
}
