"""Example: Execute SQL queries against a Databricks SQL warehouse.

Prerequisites:
    - Set DATABRICKS_HOST and authentication env vars
    - Have a running SQL warehouse
"""

from databricks_workspace_client import DatabricksWorkspaceClient, QueryExecutionError

client = DatabricksWorkspaceClient()

WAREHOUSE_ID = "abc123def456"  # Replace with your warehouse ID

# Simple query
print("=== Simple query ===")
result = client.sql.execute_query(
    statement="SELECT current_timestamp() AS now, 1 + 1 AS answer",
    warehouse_id=WAREHOUSE_ID,
)
print(f"Columns: {[c.name for c in result.columns]}")
for row in result.rows:
    print(f"  {row}")

# Query with catalog/schema context and parameters
print("\n=== Parameterized query ===")
result = client.sql.execute_query(
    statement="SELECT * FROM samples.nyctaxi.trips LIMIT :limit",
    warehouse_id=WAREHOUSE_ID,
    catalog="samples",
    schema="nyctaxi",
    parameters=[{"name": "limit", "value": "5", "type": "INT"}],
)
print(f"Total rows: {result.total_row_count}")
print(f"Columns: {[c.name for c in result.columns]}")
for row in result.rows:
    print(f"  {row}")

# Lazy iteration for large results
print("\n=== Lazy iteration (chunk by chunk) ===")
chunk_num = 0
for chunk in client.sql.execute_query_lazy(
    statement="SELECT * FROM samples.nyctaxi.trips LIMIT 1000",
    warehouse_id=WAREHOUSE_ID,
):
    chunk_num += 1
    print(f"  Chunk {chunk_num}: {len(chunk)} rows")

# Error handling
print("\n=== Error handling ===")
try:
    client.sql.execute_query("SELCT bad syntax", warehouse_id=WAREHOUSE_ID)
except QueryExecutionError as e:
    print(f"Query failed: {e}")
