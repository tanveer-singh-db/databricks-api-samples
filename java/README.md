# Databricks Workspace Client — Java

A Java wrapper around the official `databricks-sdk-java` for common workspace operations.

## Requirements

- Java 17+
- Maven 3.8+

## Setup

```bash
cd java/
mvn compile
```

## Quick Start

```java
import com.databricks.client.DatabricksWorkspaceClient;

// Uses DATABRICKS_HOST + DATABRICKS_TOKEN env vars (or any unified auth method)
var client = new DatabricksWorkspaceClient();

// List jobs
var jobs = client.jobs().listJobs("etl", false, 10);

// Find and trigger by name
var result = client.jobs().findAndTrigger(null, "etl-daily", null, true);

// Execute SQL
var queryResult = client.sql().executeQuery("SELECT 1 AS x", "warehouse-id");
```

## Project Structure

```
java/
├── pom.xml
├── src/main/java/com/databricks/client/
│   ├── DatabricksWorkspaceClient.java  # Facade
│   ├── AuthConfig.java                 # Auth configuration builder
│   ├── JobsClient.java                 # Jobs operations
│   ├── SqlClient.java                  # SQL operations
│   ├── TriggerParams.java              # Job trigger parameters
│   ├── SqlQueryOptions.java            # SQL query options
│   ├── models/                         # Java records (immutable)
│   └── exceptions/                     # Custom exception hierarchy
├── src/test/java/                      # JUnit 5 + Mockito tests
└── examples/                           # Runnable example classes
```

## Running Tests

```bash
mvn test
```

## Documentation

- [Authentication Guide](../docs/authentication.md)
- [Jobs API Guide](../docs/jobs-api.md)
- [SQL Execution Guide](../docs/sql-api.md)
- [Deployment Patterns](../docs/deployment-patterns.md)
