import com.databricks.client.DatabricksWorkspaceClient;
import com.databricks.client.TriggerParams;
import com.databricks.client.exceptions.AmbiguousJobException;
import com.databricks.client.exceptions.ResourceNotFoundException;

import java.time.Duration;
import java.util.Map;

/**
 * Example: Find a job by name (exact or partial) and trigger it.
 *
 * Prerequisites:
 *   - Set DATABRICKS_HOST and authentication env vars
 *   - Java 17+
 */
public class FindAndTriggerExample {
    public static void main(String[] args) {
        var client = new DatabricksWorkspaceClient();

        // Fire-and-forget by name
        try {
            var result = client.jobs().findAndTrigger(
                    null, "etl-daily",
                    TriggerParams.builder().jobParameters(Map.of("env", "staging")).build(),
                    false
            );
            System.out.printf("Triggered run %d — state: %s%n", result.runId(), result.lifecycleState());
        } catch (ResourceNotFoundException e) {
            System.out.println("No job found matching 'etl-daily'");
        } catch (AmbiguousJobException e) {
            System.out.println("Multiple matches:\n" + e.getMessage());
        }

        // Wait for completion with partial name
        try {
            var result = client.jobs().findAndTrigger(
                    null, "etl", null, true,
                    Duration.ofMinutes(30),
                    status -> System.out.printf("  [%s] %s%n", status.lifecycleState(), status.stateMessage())
            );
            System.out.printf("%nCompleted: %s (run %d)%n", result.resultState(), result.runId());
        } catch (AmbiguousJobException e) {
            System.out.println("Ambiguous — narrow your search:\n" + e.getMessage());
        }
    }
}
