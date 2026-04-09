# Databricks Workspace Client — Node.js

A zero-dependency Databricks workspace client using direct REST API calls with built-in `fetch()`.

**No third-party runtime dependencies** — only TypeScript and @types/node as dev dependencies.

## Installation

```bash
cd nodejs/
npm install
npm run build
```

Requires Node.js >= 18.

## Quick Start

```typescript
import { DatabricksWorkspaceClient } from "databricks-workspace-client";

// Uses DATABRICKS_HOST + DATABRICKS_TOKEN env vars (or any supported auth)
const client = new DatabricksWorkspaceClient();

// List jobs
const jobs = await client.jobs.listJobs({ name: "etl", limit: 10 });

// Trigger a job
const runId = await client.jobs.trigger(123, { notebookParams: { env: "prod" } });

// Wait for completion with progress
const result = await client.jobs.triggerAndWait(123, {
  timeoutMs: 30 * 60 * 1000,
  pollCallback: (s) => console.log(`${s.lifecycleState}: ${s.stateMessage}`),
});

// Find a job by name and trigger it
const findResult = await client.jobs.findAndTrigger({ jobName: "etl", wait: true });

// Execute SQL
const queryResult = await client.sql.executeQuery("SELECT 1 AS x", "warehouse-id");
```

## Project Structure

```
nodejs/
├── package.json           # Zero runtime deps
├── tsconfig.json
├── src/
│   ├── index.ts           # Public API exports
│   ├── client.ts          # DatabricksWorkspaceClient facade
│   ├── auth.ts            # AuthConfig + token provider chain
│   ├── http.ts            # Internal HTTP client (built-in fetch)
│   ├── config-parser.ts   # ~/.databrickscfg INI parser
│   ├── jobs.ts            # JobsClient (REST API)
│   ├── sql.ts             # SqlClient (REST API)
│   ├── models.ts          # Data models (JobInfo, RunStatus, QueryResult, etc.)
│   └── exceptions.ts      # Custom error hierarchy
├── tests/                 # Unit tests (node:test, no workspace needed)
└── examples/              # Runnable example scripts
```

## Authentication

Supports the same methods as the Python implementation:

- **PAT** — `DATABRICKS_TOKEN` env var or `AuthConfig.token`
- **OAuth M2M** — `clientId` + `clientSecret` (service principal)
- **Azure Service Principal** — `azureClientId` + `azureClientSecret` + `azureTenantId`
- **Azure CLI** — `authType: "azure-cli"`
- **Config profiles** — reads `~/.databrickscfg`

See [Authentication Guide](../docs/authentication.md) for details.

## Running Tests

```bash
npm test
```

Uses Node.js built-in `node:test` runner — zero test framework dependencies.

## Type Checking

```bash
npm run lint
```

## Documentation

- [Authentication Guide](../docs/authentication.md)
- [Jobs API Guide](../docs/jobs-api.md)
- [SQL Execution Guide](../docs/sql-api.md)

## Security

This package has **zero runtime dependencies** by design. All HTTP calls use Node.js built-in `fetch()`, authentication token exchange uses built-in `node:https` primitives, and config file parsing uses `node:fs`. This eliminates supply chain attack vectors from third-party packages.
