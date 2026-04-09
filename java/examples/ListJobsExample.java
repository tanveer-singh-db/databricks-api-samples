import com.databricks.client.DatabricksWorkspaceClient;

/**
 * Example: List and search for jobs in a Databricks workspace.
 *
 * Prerequisites:
 *   - Set DATABRICKS_HOST and authentication env vars
 *   - Java 17+
 */
public class ListJobsExample {
    public static void main(String[] args) {
        var client = new DatabricksWorkspaceClient();

        System.out.println("=== First 10 jobs ===");
        var jobs = client.jobs().listJobs(null, false, 10);
        for (var job : jobs) {
            System.out.printf("  [%d] %s (created by: %s)%n", job.jobId(), job.name(), job.creator());
        }

        System.out.println("\n=== Search by name ===");
        var etlJobs = client.jobs().listJobs("etl", false, null);
        for (var job : etlJobs) {
            System.out.printf("  [%d] %s%n", job.jobId(), job.name());
        }
        if (etlJobs.isEmpty()) {
            System.out.println("  No jobs found matching 'etl'");
        }
    }
}
