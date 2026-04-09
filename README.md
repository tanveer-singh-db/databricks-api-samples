# databricks-api-samples

Multi-language sample implementations of a Databricks Workspace Client.

## Language Implementations

| Language | Status | Directory | Approach |
|----------|--------|-----------|----------|
| Python | Available | [`python/`](python/) | Wraps official `databricks-sdk` |
| Node.js | Available | [`nodejs/`](nodejs/) | Direct REST API, zero runtime deps |
| Java | Available | [`java/`](java/) | Wraps official `databricks-sdk-java` |

## Features

- **Authentication** — unified auth supporting PAT, OAuth M2M, Azure CLI, Azure Service Principal, GCP, and config profiles
- **Jobs** — list/search jobs, trigger runs, poll status, trigger-and-wait with callbacks, find-and-trigger by name or partial name
- **SQL Execution** — execute queries against SQL warehouses with automatic chunk pagination

## Quick Start

### Python

```bash
cd python/
pip install -e ".[dev]"
```

```python
from databricks_workspace_client import DatabricksWorkspaceClient

client = DatabricksWorkspaceClient()  # Uses env vars or .databrickscfg

jobs = client.jobs.list_jobs(limit=10)
result = client.sql.execute_query("SELECT 1", warehouse_id="...")
```

### Node.js

```bash
cd nodejs/
npm install && npm run build
```

```typescript
import { DatabricksWorkspaceClient } from "databricks-workspace-client";

const client = new DatabricksWorkspaceClient();

const jobs = await client.jobs.listJobs({ limit: 10 });
const result = await client.sql.executeQuery("SELECT 1", "warehouse-id");
```

> The Node.js implementation uses **zero runtime dependencies** — all HTTP calls use the built-in `fetch()` API.

### Java

```bash
cd java/
mvn compile
```

```java
import com.databricks.client.DatabricksWorkspaceClient;

var client = new DatabricksWorkspaceClient(); // Uses env vars or .databrickscfg

var jobs = client.jobs().listJobs("etl", false, 10);
var result = client.sql().executeQuery("SELECT 1", "warehouse-id");
```

## Documentation

**Guides** (cross-language):
- [Authentication Guide](docs/authentication.md) — all auth methods with Python, Node.js, and Java examples
- [Deployment Patterns](docs/deployment-patterns.md) — which auth to use for Azure apps, on-prem, notebooks, and more
- [Jobs API Guide](docs/jobs-api.md) — job operations
- [SQL Execution Guide](docs/sql-api.md) — query execution with pagination

**Language-specific**:
- [Python README](python/README.md)
- [Node.js README](nodejs/README.md)
- [Java README](java/README.md)

## Architecture

Each language implementation follows the same facade pattern:

```
DatabricksWorkspaceClient
├── .jobs  → JobsClient   (list, trigger, poll, wait, findAndTrigger)
├── .sql   → SqlClient    (execute, lazy iterate)
└── .workspaceClient()     (escape hatch to raw SDK, Python + Java)
```

The public API shape, model definitions, and error hierarchy are consistent across languages.