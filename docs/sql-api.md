# SQL Execution Guide

Execute SQL queries against Databricks SQL warehouses with automatic pagination.

> **Official docs:** [Statement Execution API](https://learn.microsoft.com/en-us/azure/databricks/api/workspace/statementexecution) | [SQL warehouses](https://learn.microsoft.com/en-us/azure/databricks/sql/admin/sql-endpoints) | [Query execution tutorial](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/sql-execution-tutorial)

## Execute a Query (Eager)

Fetches all result rows into memory. Best for small-to-medium result sets.

**Python:**
```python
from databricks_workspace_client import DatabricksWorkspaceClient
client = DatabricksWorkspaceClient()

result = client.sql.execute_query(
    statement="SELECT * FROM samples.nyctaxi.trips LIMIT 100",
    warehouse_id="abc123def456",
)
for row in result.rows:
    print(row)
```

**Node.js:**
```typescript
import { DatabricksWorkspaceClient } from "databricks-workspace-client";
const client = new DatabricksWorkspaceClient();

const result = await client.sql.executeQuery(
  "SELECT * FROM samples.nyctaxi.trips LIMIT 100",
  "abc123def456",
);
for (const row of result.rows) {
  console.log(row);
}
```

**Java:**
```java
import com.databricks.client.DatabricksWorkspaceClient;
var client = new DatabricksWorkspaceClient();

var result = client.sql().executeQuery(
    "SELECT * FROM samples.nyctaxi.trips LIMIT 100", "abc123def456"
);
for (var row : result.rows()) {
    System.out.println(row);
}
```

`QueryResult` fields:
- `statement_id` — unique statement identifier
- `columns` — list of `ColumnInfo(name, type_name, position)`
- `rows` — `list[list[str | None]]` — all result rows
- `total_row_count` — total rows across all chunks
- `total_chunk_count` — number of chunks fetched
- `truncated` — whether the result was truncated by the server

## Catalog and Schema Context

Set the default catalog and schema so queries don't need fully-qualified table names:

```python
result = client.sql.execute_query(
    statement="SELECT * FROM trips LIMIT 10",
    warehouse_id="abc123def456",
    catalog="samples",
    schema="nyctaxi",
)
```

## Parameterized Queries

Use named parameters to prevent SQL injection. See [parameterized statements](https://learn.microsoft.com/en-us/azure/databricks/api/workspace/statementexecution/executestatement#parameters).

```python
result = client.sql.execute_query(
    statement="SELECT * FROM users WHERE age > :min_age AND city = :city",
    warehouse_id="abc123def456",
    parameters=[
        {"name": "min_age", "value": "21", "type": "INT"},
        {"name": "city", "value": "Seattle", "type": "STRING"},
    ],
)
```

## Row and Byte Limits

```python
result = client.sql.execute_query(
    statement="SELECT * FROM large_table",
    warehouse_id="abc123def456",
    row_limit=1000,       # Max rows to return
    byte_limit=10485760,  # Max 10 MiB
)
```

## Lazy Iteration (Large Results)

For large result sets, iterate chunk by chunk without loading everything into memory:

**Python:**
```python
for chunk in client.sql.execute_query_lazy(
    statement="SELECT * FROM large_table",
    warehouse_id="abc123def456",
):
    for row in chunk:
        process(row)
```

**Node.js** (async generator):
```typescript
for await (const chunk of client.sql.executeQueryLazy(
  "SELECT * FROM large_table",
  "abc123def456",
)) {
  for (const row of chunk) {
    process(row);
  }
}
```

**Java** (Iterator):
```java
var iter = client.sql().executeQueryLazy("SELECT * FROM large_table", "abc123def456");
while (iter.hasNext()) {
    var chunk = iter.next();
    for (var row : chunk) {
        process(row);
    }
}
```

Each iteration yields one chunk of rows. Only one chunk is held in memory at a time.

## Error Handling

```python
from databricks_workspace_client import QueryExecutionError

try:
    result = client.sql.execute_query(
        "SELECT * FROM nonexistent_table",
        warehouse_id="abc123def456",
    )
except QueryExecutionError as e:
    print(f"Query failed: {e}")
    print(f"Details: {e.details}")
```

`QueryExecutionError` is raised when:
- The SQL warehouse is unreachable or offline
- The SQL statement has a syntax error
- The query execution times out (>50s server-side wait)
- Any other statement execution failure

## How Pagination Works

Under the hood, the client uses the Databricks [Statement Execution API](https://learn.microsoft.com/en-us/azure/databricks/api/workspace/statementexecution/executestatement) with `INLINE` disposition and `JSON_ARRAY` format:

1. Sends the SQL statement with a 50-second server-side wait timeout
2. The first response contains chunk 0 and metadata (total chunks, total rows)
3. If `total_chunk_count > 1`, fetches remaining chunks via [`getResultChunkN`](https://learn.microsoft.com/en-us/azure/databricks/api/workspace/statementexecution/getstatementresultchunkn)
4. `execute_query()` collects all chunks eagerly; `execute_query_lazy()` yields them one at a time

## Further Reading

- [Statement Execution API reference](https://learn.microsoft.com/en-us/azure/databricks/api/workspace/statementexecution)
- [SQL execution tutorial](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/sql-execution-tutorial)
- [SQL warehouses overview](https://learn.microsoft.com/en-us/azure/databricks/sql/admin/sql-endpoints)
- [Databricks SDK for Python — Statement Execution](https://databricks-sdk-py.readthedocs.io/en/latest/workspace/sql/statement_execution.html)
- [Databricks SDK for Java](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/sdk-java)
