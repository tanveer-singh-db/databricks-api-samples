# Design Specification — Databricks Workspace Client

## 1. Goals

- Provide a **clean, consistent API** for common Databricks workspace operations across Python, Node.js, and Java
- Each language implementation is a **standalone package** with its own build, test, and dependency management
- The **public API surface is identical** across languages (adjusted for language idioms)
- Node.js uses **zero runtime dependencies** for supply chain security

## 2. Architecture

### 2.1 Facade Pattern

Each language exposes a single entry point: `DatabricksWorkspaceClient`. It composes domain-specific clients:

```
DatabricksWorkspaceClient
│
├── constructor(config?: AuthConfig)
│     → resolves credentials (PAT, OAuth, Azure, config profile)
│     → creates internal HTTP transport
│     → wires domain clients
│
├── .jobs → JobsClient
│     ├── listJobs(name?, expandTasks?, limit?) → JobInfo[]
│     ├── trigger(jobId, params?) → runId
│     ├── getRunStatus(runId) → RunStatus
│     ├── getRunResult(runId) → RunResult
│     ├── triggerAndWait(jobId, params?, timeout?, callback?) → RunResult
│     └── findAndTrigger(jobId|jobName, params?, wait?) → RunResult
│
├── .sql → SqlClient
│     ├── executeQuery(statement, warehouseId, opts?) → QueryResult
│     └── executeQueryLazy(statement, warehouseId, opts?) → Iterator/AsyncGenerator
│
└── .workspace_client (Python only — escape hatch to raw SDK)
```

### 2.2 Module Decomposition

Each language has the same logical modules:

| Module | Responsibility |
|--------|---------------|
| `auth` | AuthConfig definition, credential resolution chain, token providers |
| `client` | Facade — wires auth + domain clients |
| `jobs` | JobsClient — CRUD + polling for job runs |
| `sql` | SqlClient — statement execution with chunk pagination |
| `models` | Immutable data transfer objects (cross-language contract) |
| `exceptions` | Error hierarchy with structured details |
| `http` | *(Node.js only)* Internal HTTP client wrapping `fetch()` |
| `config-parser` | *(Node.js only)* INI parser for `~/.databrickscfg` |

Python delegates HTTP and config parsing to `databricks-sdk`. Node.js implements them from scratch with built-in APIs.

### 2.3 Transport Layer

| Language | HTTP | Auth Resolution | Config Parsing |
|----------|------|----------------|---------------|
| Python | `databricks-sdk` handles it | `databricks-sdk` unified auth | `databricks-sdk` handles it |
| Node.js | Built-in `fetch()` via `HttpClient` class | Custom chain in `auth.ts` | Custom INI parser in `config-parser.ts` |
| Java | `databricks-sdk-java` handles it | `databricks-sdk-java` unified auth | `databricks-sdk-java` handles it |

Node.js `HttpClient` features:
- Bearer token auth via `TokenProvider.getToken()`
- Timeout via `AbortSignal.timeout()`
- Retry on 429/5xx with exponential backoff (3 retries)
- HTTP status → exception mapping (401→Auth, 403→Permission, 404→NotFound)

## 3. Data Models

All models are **immutable** (Python: `@dataclass(frozen=True)`, Node.js: `Object.freeze(this)`).

### 3.1 JobInfo
Represents a job definition in the workspace.

| Field | Type | Source (REST API) |
|-------|------|-------------------|
| jobId / job_id | int | `job.job_id` |
| name | string | `job.settings.name` |
| createdTime / created_time | int? | `job.created_time` |
| creator | string? | `job.creator_user_name` |
| tags | dict/Record<string,string> | `job.settings.tags` |

### 3.2 RunStatus
Snapshot of a job run's current state (single poll).

| Field | Type | Source (REST API) |
|-------|------|-------------------|
| runId / run_id | int | `run.run_id` |
| lifecycleState / life_cycle_state | string | `run.state.life_cycle_state` |
| resultState / result_state | string? | `run.state.result_state` |
| stateMessage / state_message | string? | `run.state.state_message` |

Computed: `isTerminal` — true if lifecycleState in {TERMINATED, SKIPPED, INTERNAL_ERROR}

### 3.3 RunResult
Full result of a completed run (extends RunStatus fields).

| Field | Type | Source (REST API) |
|-------|------|-------------------|
| *(all RunStatus fields)* | | |
| startTime / start_time | int? | `run.start_time` |
| endTime / end_time | int? | `run.end_time` |
| runDuration / run_duration | int? | `run.execution_duration` |
| runPageUrl / run_page_url | string? | `run.run_page_url` |

Computed: `isSuccess` — true if resultState == "SUCCESS"

### 3.4 ColumnInfo
Column metadata from SQL query results.

| Field | Type | Source (REST API) |
|-------|------|-------------------|
| name | string | `column.name` |
| typeName / type_name | string | `column.type_name` |
| position | int | `column.position` |

### 3.5 QueryResult
Complete SQL query result.

| Field | Type | Source (REST API) |
|-------|------|-------------------|
| statementId / statement_id | string | `response.statement_id` |
| columns | ColumnInfo[] | `response.manifest.schema.columns` |
| rows | (string\|null)[][] | `response.result.data_array` + chunks |
| totalRowCount / total_row_count | int | `response.manifest.total_row_count` |
| totalChunkCount / total_chunk_count | int | `response.manifest.total_chunk_count` |
| truncated | bool | `response.manifest.truncated` |

## 4. Authentication

### 4.1 AuthConfig Fields

| Field | Python | Node.js | Purpose |
|-------|--------|---------|---------|
| host | `str` | `string` | Workspace URL |
| token | `str` | `string` | Personal access token |
| profile | `str` | `string` | ~/.databrickscfg profile name |
| auth_type / authType | `str` | `string` | Force auth method |
| client_id / clientId | `str` | `string` | OAuth M2M client ID |
| client_secret / clientSecret | `str` | `string` | OAuth M2M client secret |
| azure_client_id / azureClientId | `str` | `string` | Azure SP app ID |
| azure_client_secret / azureClientSecret | `str` | `string` | Azure SP secret |
| azure_tenant_id / azureTenantId | `str` | `string` | Azure tenant ID |

### 4.2 Token Provider Chain (Node.js)

```
resolveAuth(config?)
│
├─ Explicit config fields:
│   token? → PatTokenProvider
│   clientId + clientSecret? → OAuthM2MTokenProvider
│   azureClientId + azureClientSecret + azureTenantId? → AzureServicePrincipalTokenProvider
│   authType == "azure-cli"? → AzureCliTokenProvider
│   profile? → resolveFromProfile()
│
├─ Environment variables:
│   DATABRICKS_TOKEN → PatTokenProvider
│   DATABRICKS_CLIENT_ID + SECRET → OAuthM2MTokenProvider
│   ARM_CLIENT_ID + SECRET + TENANT_ID → AzureServicePrincipalTokenProvider
│
├─ DEFAULT profile from ~/.databrickscfg
│
└─ Throw AuthenticationError
```

OAuth/Azure token providers cache tokens in memory with 30s expiry buffer.

## 5. Error Handling

### 5.1 Exception Mapping

| HTTP Status | REST API Error | Client Exception |
|-------------|---------------|-----------------|
| 401 | Unauthenticated | AuthenticationError |
| 403 | PermissionDenied | PermissionDeniedError |
| 404 | NotFound | ResourceNotFoundError |
| 429 | RateLimited | Retry, then DatabricksClientError |
| 5xx | ServerError | Retry, then DatabricksClientError |
| — | SQL FAILED state | QueryExecutionError |
| — | Run result != SUCCESS | JobRunError |
| — | Polling timeout exceeded | OperationTimeoutError |
| — | Multiple jobs match name | AmbiguousJobError |

### 5.2 Error Chaining
- Python: `raise ClientError(...) from sdk_error`
- Node.js: `new ClientError(..., { cause: originalError })`

## 6. Find-and-Trigger Flow

`findAndTrigger` / `find_and_trigger` combines job resolution and triggering in a single call.

### 6.1 Resolution Chain

```
findAndTrigger({ jobId?, jobName?, wait?, ...params })
│
├── jobId provided? → use directly (skip resolution)
│
├── jobName provided:
│   ├── Exact match: listJobs(name=jobName)
│   │   ├── 1 result → resolved
│   │   └── >1 results → AmbiguousJobError
│   │
│   └── No exact match → Partial match:
│       ├── listJobs() (all jobs)
│       ├── filter: jobName.lower() in job.name.lower()
│       ├── 0 matches → ResourceNotFoundError
│       ├── 1 match → resolved
│       └── >1 matches → AmbiguousJobError
│
└── Neither → DatabricksClientError
```

### 6.2 Trigger Behavior

After resolution:
- `wait=False` (default): calls `trigger(jobId)` then `getRunResult(runId)` — returns current state (PENDING/RUNNING)
- `wait=True`: delegates to `triggerAndWait(jobId, ...)` — blocks until terminal state

### 6.3 AmbiguousJobError

Raised when multiple jobs match. The error message lists all matches:

```
Job name 'etl' matched 3 jobs:
  [101] etl-daily-v1
  [102] etl-daily-v2
  [103] etl-weekly
Please provide a more specific name or use job_id.
```

The `details` dict contains structured data: `{ jobName, matches: [{ jobId, name }, ...] }`

## 7. SQL Pagination

The Statement Execution API returns results in chunks:

```
POST /api/2.0/sql/statements/
  → response with chunk 0, manifest.total_chunk_count

If total_chunk_count > 1:
  GET /api/2.0/sql/statements/{id}/result/chunks/1
  GET /api/2.0/sql/statements/{id}/result/chunks/2
  ...
```

- `executeQuery()` — fetches all chunks eagerly, returns complete `QueryResult`
- `executeQueryLazy()` — yields chunks one at a time (Python: `Iterator`, Node.js: `AsyncGenerator`)

Request parameters: `disposition=INLINE`, `format=JSON_ARRAY`, `wait_timeout=50s`, `on_wait_timeout=CANCEL`

## 8. Testing Strategy

| Aspect | Python | Node.js | Java |
|--------|--------|---------|------|
| Framework | pytest + pytest-mock | node:test + node:assert | JUnit 5 + Mockito |
| Mocking target | `WorkspaceClient` (SDK) | `IHttpClient` (interface) | `WorkspaceClient` (SDK) |
| External deps needed | None (all mocked) | None (all mocked) | None (all mocked) |
| Test location | `python/tests/` | `nodejs/tests/` | `java/src/test/` |
| Run command | `pytest -v` | `npm test` | `mvn test` |

Both test suites cover:
- Auth config resolution and error wrapping
- Job listing with pagination and filtering
- Job triggering and run ID extraction
- Run status polling and terminal state detection
- Trigger-and-wait with success, timeout, failure, and callback scenarios
- SQL single-chunk and multi-chunk pagination
- SQL lazy iteration and empty results
- Model construction, defaults, computed properties, and immutability
- Facade client wiring
- Job resolution by ID, exact name, partial name, ambiguous, and not-found cases
- Find-and-trigger with fire-and-forget vs wait modes

## 9. Adding a New API Domain

To add support for a new Databricks API (e.g., clusters, notebooks, Unity Catalog):

### Step 1: Define models
Add to `models.py` / `models.ts`:
```python
# Python
@dataclass(frozen=True)
class ClusterInfo:
    cluster_id: str
    cluster_name: str
    state: str
```
```typescript
// Node.js
export class ClusterInfo {
  readonly clusterId: string;
  readonly clusterName: string;
  readonly state: string;
  constructor(opts: { clusterId: string; clusterName: string; state: string }) {
    this.clusterId = opts.clusterId;
    // ...
    Object.freeze(this);
  }
}
```

### Step 2: Add exceptions (if needed)
Only if the domain has unique failure modes not covered by existing exceptions.

### Step 3: Implement the client
```python
# Python: clusters.py
class ClustersClient:
    def __init__(self, workspace_client: WorkspaceClient):
        self._ws = workspace_client
    def list_clusters(self) -> list[ClusterInfo]: ...
```
```typescript
// Node.js: clusters.ts
export class ClustersClient {
    _http: IHttpClient;
    constructor(http: IHttpClient) { this._http = http; }
    async listClusters(): Promise<ClusterInfo[]> { ... }
}
```

### Step 4: Wire into facade
```python
# Python: client.py
self.clusters = ClustersClient(self._ws)
```
```typescript
// Node.js: client.ts
this.clusters = new ClustersClient(http);
```

### Step 5: Add to exports
Update `__init__.py` / `index.ts` with new public types.

### Step 6: Write tests
- Python: `tests/test_clusters.py` — mock `WorkspaceClient`
- Node.js: `tests/clusters.test.ts` — mock `IHttpClient`

### Step 7: Add examples and docs
- `python/examples/list_clusters.py`
- `nodejs/examples/list-clusters.ts`
- `docs/clusters-api.md` with both languages

### Step 8: Update CLAUDE.md
Add the new models to the cross-language contract table and the new client to the architecture diagram.

## 10. Java Implementation Notes

The Java implementation is complete at `java/`. Key specifics:

- **Package**: `com.databricks.client` with sub-packages `models` and `exceptions`
- **SDK**: `com.databricks:databricks-sdk-java:0.79.0` (wraps SDK, same as Python)
- **Java 17+**: Uses records for models, `var` for local variables, text blocks
- **AuthConfig**: Fluent builder pattern — `new AuthConfig().setHost(...).setToken(...)`
- **Domain clients via methods**: `client.jobs()`, `client.sql()` (not fields like Python/Node.js)
- **TriggerParams / SqlQueryOptions**: Builder records for type-safe parameter construction
- **Wait pattern**: Uses SDK's `Wait.get(Duration)` for blocking triggerAndWait
- **Lazy SQL**: Returns `Iterator<List<List<String>>>` (Java equivalent of Python's Iterator)
- **Tests**: JUnit 5 + Mockito, mock `WorkspaceClient` and `JobsExt`/`StatementExecutionAPI`
