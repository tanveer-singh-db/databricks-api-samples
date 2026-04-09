import com.databricks.client.DatabricksWorkspaceClient;
import com.databricks.client.SqlQueryOptions;
import com.databricks.client.exceptions.QueryExecutionException;

import java.util.List;
import java.util.Map;

/**
 * Example: Execute SQL queries against a Databricks SQL warehouse.
 *
 * Prerequisites:
 *   - Set DATABRICKS_HOST and authentication env vars
 *   - Have a running SQL warehouse
 */
public class SqlQueryExample {
    public static void main(String[] args) {
        var client = new DatabricksWorkspaceClient();
        var warehouseId = "abc123def456"; // Replace with your warehouse ID

        // Simple query
        System.out.println("=== Simple query ===");
        var result = client.sql().executeQuery(
                "SELECT current_timestamp() AS now, 1 + 1 AS answer", warehouseId
        );
        System.out.println("Columns: " + result.columns().stream().map(c -> c.name()).toList());
        for (var row : result.rows()) {
            System.out.println("  " + row);
        }

        // Parameterized query
        System.out.println("\n=== Parameterized query ===");
        var opts = SqlQueryOptions.builder()
                .catalog("samples")
                .schema("nyctaxi")
                .parameters(List.of(Map.of("name", "limit", "value", "5", "type", "INT")))
                .build();
        var result2 = client.sql().executeQuery(
                "SELECT * FROM samples.nyctaxi.trips LIMIT :limit", warehouseId, opts
        );
        System.out.println("Total rows: " + result2.totalRowCount());

        // Lazy iteration
        System.out.println("\n=== Lazy iteration ===");
        var iter = client.sql().executeQueryLazy(
                "SELECT * FROM samples.nyctaxi.trips LIMIT 1000", warehouseId
        );
        int chunkNum = 0;
        while (iter.hasNext()) {
            chunkNum++;
            System.out.println("  Chunk " + chunkNum + ": " + iter.next().size() + " rows");
        }

        // Error handling
        System.out.println("\n=== Error handling ===");
        try {
            client.sql().executeQuery("SELCT bad syntax", warehouseId);
        } catch (QueryExecutionException e) {
            System.out.println("Query failed: " + e.getMessage());
        }
    }
}
