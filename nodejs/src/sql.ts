/**
 * SQL Statement Execution client — execute queries and handle chunked pagination.
 *
 * Uses direct REST API calls via IHttpClient (no SDK).
 */

import type { IHttpClient } from "./http.ts";
import { QueryExecutionError } from "./exceptions.ts";
import { ColumnInfo, QueryResult } from "./models.ts";

// ─── Internal API response types ──────────────────────────────────

interface ApiColumn {
  name?: string;
  type_name?: string;
  position?: number;
}

interface ApiResultSchema {
  columns?: ApiColumn[];
}

interface ApiManifest {
  schema?: ApiResultSchema;
  total_chunk_count?: number;
  total_row_count?: number;
  truncated?: boolean;
}

interface ApiResultData {
  data_array?: (string | null)[][];
}

interface ApiStatementStatus {
  state?: string;
  error?: { message?: string };
}

interface ApiStatementResponse {
  statement_id?: string;
  status?: ApiStatementStatus;
  manifest?: ApiManifest;
  result?: ApiResultData;
}

interface ApiChunkResponse {
  data_array?: (string | null)[][];
}

// ─── Helpers ──────────────────────────────────────────────────────

function parseColumns(response: ApiStatementResponse): ColumnInfo[] {
  const cols = response.manifest?.schema?.columns;
  if (!cols) return [];
  return cols.map(
    (col, i) =>
      new ColumnInfo({
        name: col.name ?? "",
        typeName: col.type_name ?? "",
        position: col.position ?? i,
      }),
  );
}

function extractRows(
  response: ApiStatementResponse | ApiChunkResponse,
): (string | null)[][] {
  const data = "result" in response
    ? (response as ApiStatementResponse).result?.data_array
    : (response as ApiChunkResponse).data_array;
  return data ?? [];
}

// ─── Public API ───────────────────────────────────────────────────

export interface SqlQueryOptions {
  catalog?: string;
  schema?: string;
  parameters?: Array<{ name: string; value: string; type?: string }>;
  rowLimit?: number;
  byteLimit?: number;
}

export class SqlClient {
  _http: IHttpClient;

  constructor(http: IHttpClient) {
    this._http = http;
  }

  async executeQuery(
    statement: string,
    warehouseId: string,
    options?: SqlQueryOptions,
  ): Promise<QueryResult> {
    const response = await this._executeStatement(
      statement,
      warehouseId,
      options,
    );

    const columns = parseColumns(response);
    const allRows = extractRows(response);

    // Fetch remaining chunks if paginated
    const totalChunks = response.manifest?.total_chunk_count ?? 1;
    if (totalChunks > 1 && response.statement_id) {
      for (let i = 1; i < totalChunks; i++) {
        const chunk = await this._http.get<ApiChunkResponse>(
          `/api/2.0/sql/statements/${response.statement_id}/result/chunks/${i}`,
        );
        const chunkRows = chunk.data_array ?? [];
        allRows.push(...chunkRows);
      }
    }

    return new QueryResult({
      statementId: response.statement_id ?? "",
      columns,
      rows: allRows,
      totalRowCount:
        response.manifest?.total_row_count ?? allRows.length,
      totalChunkCount: totalChunks,
      truncated: response.manifest?.truncated ?? false,
    });
  }

  async *executeQueryLazy(
    statement: string,
    warehouseId: string,
    options?: Omit<SqlQueryOptions, "rowLimit" | "byteLimit">,
  ): AsyncGenerator<(string | null)[][], void, unknown> {
    const response = await this._executeStatement(
      statement,
      warehouseId,
      options,
    );

    // Yield first chunk
    const firstRows = extractRows(response);
    if (firstRows.length > 0) {
      yield firstRows;
    }

    // Yield remaining chunks
    const totalChunks = response.manifest?.total_chunk_count ?? 1;
    if (totalChunks > 1 && response.statement_id) {
      for (let i = 1; i < totalChunks; i++) {
        const chunk = await this._http.get<ApiChunkResponse>(
          `/api/2.0/sql/statements/${response.statement_id}/result/chunks/${i}`,
        );
        const chunkRows = chunk.data_array ?? [];
        if (chunkRows.length > 0) {
          yield chunkRows;
        }
      }
    }
  }

  async _executeStatement(
    statement: string,
    warehouseId: string,
    options?: SqlQueryOptions,
  ): Promise<ApiStatementResponse> {
    const body: Record<string, unknown> = {
      warehouse_id: warehouseId,
      statement,
      format: "JSON_ARRAY",
      disposition: "INLINE",
      wait_timeout: "50s",
      on_wait_timeout: "CANCEL",
    };

    if (options?.catalog) body.catalog = options.catalog;
    if (options?.schema) body.schema = options.schema;
    if (options?.rowLimit) body.row_limit = options.rowLimit;
    if (options?.byteLimit) body.byte_limit = options.byteLimit;
    if (options?.parameters) {
      body.parameters = options.parameters.map((p) => ({
        name: p.name,
        value: p.value,
        ...(p.type ? { type: p.type } : {}),
      }));
    }

    let response: ApiStatementResponse;
    try {
      response = await this._http.post<ApiStatementResponse>(
        "/api/2.0/sql/statements/",
        body,
      );
    } catch (err) {
      throw new QueryExecutionError(
        `Failed to execute SQL statement: ${err}`,
        { details: { warehouseId }, cause: err },
      );
    }

    if (response.status?.state === "FAILED") {
      const errorMsg = response.status.error?.message ?? "Unknown error";
      throw new QueryExecutionError(`SQL statement failed: ${errorMsg}`, {
        details: {
          statementId: response.statement_id,
          warehouseId,
        },
      });
    }

    return response;
  }
}
