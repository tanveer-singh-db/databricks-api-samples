# CLAUDE.md — Databricks API Samples

## Project Overview

Multi-language Databricks Workspace Client library. Each language provides the **same facade pattern** and **identical public API surface** for auth, jobs, and SQL operations.

| Language | Status | SDK Approach | Runtime Deps |
|----------|--------|-------------|--------------|
| Python | Complete | Wraps `databricks-sdk` | `databricks-sdk` |
| Node.js | Complete | Direct REST API + built-in `fetch()` | **Zero** |
| Java | Complete | Wraps `databricks-sdk-java` | `databricks-sdk-java` |

## Architecture

```
DatabricksWorkspaceClient (facade)
├── .jobs  → JobsClient   (list, trigger, poll, triggerAndWait, findAndTrigger)
├── .sql   → SqlClient    (executeQuery, executeQueryLazy)
└── auth resolved at construction via credential chain
```

### Credential Resolution Order (both languages)
1. Explicit config fields (host, token, clientId, etc.)
2. Environment variables (DATABRICKS_HOST, DATABRICKS_TOKEN, etc.)
3. Named profile from `~/.databrickscfg`
4. DEFAULT profile from `~/.databrickscfg`
5. Cloud-native auth (Azure CLI) as last resort

### Cross-Language Model Contract

Models are immutable and consistent across implementations:

| Model | Python (snake_case) | Node.js / Java (camelCase) |
|-------|---------------------|---------------------------|
| JobInfo | job_id, name, created_time, creator, tags | jobId, name, createdTime, creator, tags |
| RunStatus | run_id, life_cycle_state, result_state, state_message | runId, lifecycleState, resultState, stateMessage |
| RunResult | + start_time, end_time, run_duration, run_page_url | + startTime, endTime, runDuration, runPageUrl |
| ColumnInfo | name, type_name, position | name, typeName, position |
| QueryResult | statement_id, columns, rows, total_row_count, total_chunk_count, truncated | statementId, columns, rows, totalRowCount, totalChunkCount, truncated |

Computed properties: `is_terminal`/`isTerminal()`, `is_success`/`isSuccess()`

Java models use records (immutable by default). Node.js uses `Object.freeze()`. Python uses `@dataclass(frozen=True)`.

### Exception Hierarchy (identical in all three languages)
```
DatabricksClientError (base)
├── AuthenticationError
├── ResourceNotFoundError
├── PermissionDeniedError
├── QueryExecutionError
├── JobRunError
├── OperationTimeoutError
└── AmbiguousJobError
```

All exceptions carry a `details` dict/object and chain the original error.

## Directory Structure

```
├── CLAUDE.md
├── README.md
├── docs/
│   ├── authentication.md    # Cross-language auth guide
│   ├── jobs-api.md          # Cross-language jobs guide
│   └── sql-api.md           # Cross-language SQL guide
├── python/
│   ├── pyproject.toml       # Python >=3.10, hatchling build
│   ├── src/databricks_workspace_client/
│   │   ├── __init__.py      # Public re-exports
│   │   ├── client.py        # Facade
│   │   ├── auth.py          # AuthConfig dataclass + factory
│   │   ├── jobs.py          # JobsClient (wraps SDK)
│   │   ├── sql.py           # SqlClient (wraps SDK)
│   │   ├── models.py        # Frozen dataclasses
│   │   └── exceptions.py    # Error hierarchy
│   ├── tests/               # pytest, mocks WorkspaceClient
│   └── examples/            # Runnable scripts
├── nodejs/
│   ├── package.json         # Zero runtime deps, Node >=18
│   ├── tsconfig.json        # ESM, ES2022, strict
│   ├── src/
│   │   ├── index.ts         # Public re-exports
│   │   ├── client.ts        # Facade
│   │   ├── auth.ts          # AuthConfig + token provider chain
│   │   ├── http.ts          # fetch()-based HTTP client
│   │   ├── config-parser.ts # ~/.databrickscfg INI parser
│   │   ├── jobs.ts          # JobsClient (REST API)
│   │   ├── sql.ts           # SqlClient (REST API)
│   │   ├── models.ts        # Object.freeze() classes
│   │   └── exceptions.ts    # Error hierarchy
│   ├── tests/               # node:test + node:assert
│   └── examples/            # Runnable scripts
├── java/
│   ├── pom.xml              # Java 17+, Maven, databricks-sdk-java
│   ├── src/main/java/com/databricks/client/
│   │   ├── DatabricksWorkspaceClient.java  # Facade
│   │   ├── AuthConfig.java                 # Config builder
│   │   ├── JobsClient.java                 # JobsClient (wraps SDK)
│   │   ├── SqlClient.java                  # SqlClient (wraps SDK)
│   │   ├── TriggerParams.java              # Job trigger parameter record
│   │   ├── SqlQueryOptions.java            # SQL query options record
│   │   ├── models/          # Java records (JobInfo, RunStatus, etc.)
│   │   └── exceptions/      # Exception hierarchy
│   ├── src/test/java/       # JUnit 5 + Mockito
│   └── examples/            # Runnable example classes
```

## Commands

### Python
```bash
cd python/
pip install -e ".[dev]"   # Install with dev deps
pytest -v                  # Run 60 tests
ruff check src/ tests/     # Lint
mypy src/                  # Type check
```

### Node.js
```bash
cd nodejs/
npm install                # Install dev deps (typescript, @types/node only)
npm run build              # Compile TypeScript
npm test                   # Run 79 tests (node:test)
npm run lint               # Type check (tsc --noEmit)
```

### Java
```bash
cd java/
mvn compile                # Compile
mvn test                   # Run tests (JUnit 5 + Mockito)
mvn package -DskipTests    # Build JAR
```

### Run examples
```bash
# Requires DATABRICKS_HOST + auth (env vars or ~/.databrickscfg)
python python/examples/list_jobs.py
node --experimental-strip-types nodejs/examples/list-jobs.ts
cd java/ && mvn exec:java -Dexec.mainClass="ListJobsExample" -Dexec.sourceRoot="examples"
```

## Key Conventions

### When adding a new feature or API wrapper:
1. **Start with models.py / models.ts** — define the cross-language data contract first
2. **Add exceptions if needed** — keep the hierarchy consistent across languages
3. **Implement in Python first** (simpler, SDK does heavy lifting), then mirror in Node.js and Java
4. **Node.js must use zero runtime deps** — only built-in `fetch()`, `node:fs`, `node:child_process`
5. **Node.js avoids TS parameter properties** — use explicit field declarations (required by `--experimental-strip-types`)
6. **Update the facade** — wire new client into `DatabricksWorkspaceClient`
7. **Write tests in all three languages** — Python mocks `WorkspaceClient`, Node.js mocks `IHttpClient`, Java mocks `WorkspaceClient` with Mockito
8. **Update docs/** — add examples for both languages side-by-side
9. **Update this CLAUDE.md** — add the new models/methods to the contract tables

### Naming conventions:
- Python: `snake_case` for everything
- Node.js: `camelCase` for fields/methods, `PascalCase` for classes
- Java: `camelCase` for fields/methods, `PascalCase` for classes, accessor methods on records (e.g., `result.runId()`)
- REST API uses `snake_case` — Node.js and Java have explicit mapper functions at the boundary

### REST API endpoints (Node.js needs these, Python SDK abstracts them):
- List jobs: `GET /api/2.1/jobs/list`
- Trigger job: `POST /api/2.1/jobs/run-now`
- Get run: `GET /api/2.1/jobs/runs/get`
- Execute SQL: `POST /api/2.0/sql/statements/`
- Get SQL chunk: `GET /api/2.0/sql/statements/{id}/result/chunks/{idx}`

### Security constraint:
Node.js implementation uses **zero third-party runtime dependencies** by design (supply chain security). Only `typescript` and `@types/node` are dev dependencies. All HTTP via built-in `fetch()`, config parsing via `node:fs`, Azure CLI via `node:child_process`.

### JobsClient method reference:
| Method (Python / Node.js) | Description |
|---------------------------|-------------|
| `list_jobs` / `listJobs` | List/search jobs by name, with pagination |
| `trigger` / `trigger` | Fire-and-forget — returns `run_id` immediately |
| `get_run_status` / `getRunStatus` | Single poll — current state of a run |
| `get_run_result` / `getRunResult` | Full result including timing and URL |
| `trigger_and_wait` / `triggerAndWait` | Trigger + block until terminal state |
| `find_and_trigger` / `findAndTrigger` | Resolve job by ID/name/partial name, then trigger |
| `_resolve_job` / `_resolveJob` | Internal: resolve job_id from name (exact → partial) |

### findAndTrigger resolution logic:
1. `job_id` provided → use directly (no API call)
2. `job_name` provided → exact match via API (`list_jobs(name=...)`)
3. No exact match → partial substring match (client-side, case-insensitive)
4. 0 matches → `ResourceNotFoundError`
5. 1 match → use that job_id
6. >1 matches → `AmbiguousJobError` (lists all matches with IDs)

## Java Implementation Notes

- Wraps `com.databricks:databricks-sdk-java:0.79.0` (same approach as Python)
- Models use Java 17 records (immutable by default)
- `AuthConfig` uses fluent setter pattern: `new AuthConfig().setHost(...).setToken(...)`
- Domain clients accessed via methods: `client.jobs()`, `client.sql()` (not fields)
- `triggerAndWait` uses SDK's `Wait.get(Duration)` for blocking with timeout
- `resolveJob` and `findAndTrigger` have the same exact/partial match logic as Python/Node.js
- Tests use JUnit 5 + Mockito, mock the SDK `WorkspaceClient`
