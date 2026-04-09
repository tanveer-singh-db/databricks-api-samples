/**
 * Custom exception hierarchy for DatabricksWorkspaceClient.
 *
 * Each exception supports ES2022 Error.cause for chaining the original error,
 * mirroring Python's `raise ... from` pattern.
 */

export class DatabricksClientError extends Error {
  readonly details: Record<string, unknown>;

  constructor(
    message: string,
    options?: { details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "DatabricksClientError";
    this.details = options?.details ?? {};
  }
}

export class AuthenticationError extends DatabricksClientError {
  constructor(
    message: string,
    options?: { details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options);
    this.name = "AuthenticationError";
  }
}

export class ResourceNotFoundError extends DatabricksClientError {
  constructor(
    message: string,
    options?: { details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ResourceNotFoundError";
  }
}

export class PermissionDeniedError extends DatabricksClientError {
  constructor(
    message: string,
    options?: { details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options);
    this.name = "PermissionDeniedError";
  }
}

export class QueryExecutionError extends DatabricksClientError {
  constructor(
    message: string,
    options?: { details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options);
    this.name = "QueryExecutionError";
  }
}

export class JobRunError extends DatabricksClientError {
  constructor(
    message: string,
    options?: { details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options);
    this.name = "JobRunError";
  }
}

export class OperationTimeoutError extends DatabricksClientError {
  constructor(
    message: string,
    options?: { details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options);
    this.name = "OperationTimeoutError";
  }
}

export class AmbiguousJobError extends DatabricksClientError {
  constructor(
    message: string,
    options?: { details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options);
    this.name = "AmbiguousJobError";
  }
}
