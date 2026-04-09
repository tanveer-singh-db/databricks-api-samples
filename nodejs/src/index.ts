/**
 * DatabricksWorkspaceClient — zero-dependency Node.js client for Databricks.
 */

export { DatabricksWorkspaceClient } from "./client.ts";
export type { AuthConfig } from "./auth.ts";
export {
  DatabricksClientError,
  AuthenticationError,
  ResourceNotFoundError,
  PermissionDeniedError,
  QueryExecutionError,
  JobRunError,
  OperationTimeoutError,
  AmbiguousJobError,
} from "./exceptions.ts";
export type { FindAndTriggerOptions } from "./jobs.ts";
export {
  JobInfo,
  RunStatus,
  RunResult,
  ColumnInfo,
  QueryResult,
} from "./models.ts";
