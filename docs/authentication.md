# Authentication Guide

This guide covers all supported authentication methods for connecting to a Databricks workspace.

> **Official docs:** [Databricks unified authentication](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/auth/unified-auth) | [Environment variables reference](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/auth/unified-auth-envvars)

## Quick Start (Recommended)

The client uses Databricks **[unified authentication](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/auth/unified-auth)** — set environment variables and it works automatically:

```bash
export DATABRICKS_HOST="https://your-workspace.cloud.databricks.com"
export DATABRICKS_TOKEN="dapi..."
```

**Python:**
```python
from databricks_workspace_client import DatabricksWorkspaceClient
client = DatabricksWorkspaceClient()  # Picks up env vars automatically
```

**Node.js:**
```typescript
import { DatabricksWorkspaceClient } from "databricks-workspace-client";
const client = new DatabricksWorkspaceClient(); // Picks up env vars automatically
```

**Java:**
```java
import com.databricks.client.DatabricksWorkspaceClient;
var client = new DatabricksWorkspaceClient(); // Picks up env vars automatically
```

## Authentication Methods

### Personal Access Token (PAT)

Simplest for development. Not recommended for production. See [Azure Databricks personal access tokens](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/auth/pat).

**Python:**
```python
from databricks_workspace_client import DatabricksWorkspaceClient, AuthConfig
client = DatabricksWorkspaceClient(AuthConfig(
    host="https://your-workspace.cloud.databricks.com",
    token="dapi...",
))
```

**Node.js:**
```typescript
const client = new DatabricksWorkspaceClient({
  host: "https://your-workspace.cloud.databricks.com",
  token: "dapi...",
});
```

**Java:**
```java
var client = new DatabricksWorkspaceClient(
    new AuthConfig().setHost("https://your-workspace.cloud.databricks.com").setToken("dapi...")
);
```

**Environment variables**: `DATABRICKS_HOST`, `DATABRICKS_TOKEN`

### OAuth Machine-to-Machine (M2M)

Recommended for production service-to-service authentication using a service principal. See [OAuth M2M authentication](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/auth/oauth-m2m).

**Python:**
```python
client = DatabricksWorkspaceClient(AuthConfig(
    host="https://your-workspace.cloud.databricks.com",
    client_id="<service-principal-application-id>",
    client_secret="<service-principal-secret>",
))
```

**Node.js:**
```typescript
const client = new DatabricksWorkspaceClient({
  host: "https://your-workspace.cloud.databricks.com",
  clientId: "<service-principal-application-id>",
  clientSecret: "<service-principal-secret>",
});
```

**Java:**
```java
var client = new DatabricksWorkspaceClient(
    new AuthConfig().setHost("https://your-workspace.cloud.databricks.com")
        .setClientId("<service-principal-application-id>")
        .setClientSecret("<service-principal-secret>")
);
```

**Environment variables**: `DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID`, `DATABRICKS_CLIENT_SECRET`

### Azure Service Principal

For Azure Databricks workspaces using Microsoft Entra ID (Azure AD) credentials. See [Azure service principal authentication](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/auth/oauth-m2m#azure-service-principal).

**Python:**
```python
client = DatabricksWorkspaceClient(AuthConfig(
    host="https://adb-123456789.12.azuredatabricks.net",
    azure_client_id="<application-id>",
    azure_client_secret="<client-secret>",
    azure_tenant_id="<tenant-id>",
))
```

**Node.js:**
```typescript
const client = new DatabricksWorkspaceClient({
  host: "https://adb-123456789.12.azuredatabricks.net",
  azureClientId: "<application-id>",
  azureClientSecret: "<client-secret>",
  azureTenantId: "<tenant-id>",
});
```

**Java:**
```java
var client = new DatabricksWorkspaceClient(
    new AuthConfig().setHost("https://adb-123456789.12.azuredatabricks.net")
        .setAzureClientId("<application-id>")
        .setAzureClientSecret("<client-secret>")
        .setAzureTenantId("<tenant-id>")
);
```

**Environment variables**: `DATABRICKS_HOST`, `ARM_CLIENT_ID`, `ARM_CLIENT_SECRET`, `ARM_TENANT_ID`

### Azure CLI

Uses your Azure CLI login. Good for local development with Azure Databricks. See [Azure CLI authentication](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/auth/azure-cli).

```bash
az login
```

**Python:**
```python
client = DatabricksWorkspaceClient(AuthConfig(
    host="https://adb-123456789.12.azuredatabricks.net",
    auth_type="azure-cli",
))
```

**Node.js:**
```typescript
const client = new DatabricksWorkspaceClient({
  host: "https://adb-123456789.12.azuredatabricks.net",
  authType: "azure-cli",
});
```

**Java:**
```java
var client = new DatabricksWorkspaceClient(
    new AuthConfig().setHost("https://adb-123456789.12.azuredatabricks.net").setAuthType("azure-cli")
);
```

### Azure Managed Identity

For workloads running on Azure VMs, AKS, or Azure Functions. See [Azure managed identity authentication](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/auth/azure-mi).

```python
client = DatabricksWorkspaceClient(AuthConfig(
    host="https://adb-123456789.12.azuredatabricks.net",
    azure_use_msi=True,
    azure_client_id="<managed-identity-client-id>",  # Optional for user-assigned MSI
))
```

### GCP Service Account

```python
client = DatabricksWorkspaceClient(AuthConfig(
    host="https://your-workspace.gcp.databricks.com",
    google_credentials="/path/to/service-account-key.json",
))
```

**Environment variables**: `DATABRICKS_HOST`, `GOOGLE_CREDENTIALS`

### Databricks Config Profile

Use a named profile from `~/.databrickscfg`. See [Databricks configuration profiles](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/auth/config-profiles).

```ini
# ~/.databrickscfg
[STAGING]
host = https://staging.cloud.databricks.com
token = dapi...
```

```python
client = DatabricksWorkspaceClient(AuthConfig(profile="STAGING"))
```

## Deployment Patterns

Not sure which auth method to use? See the **[Deployment Patterns Guide](deployment-patterns.md)** for recommendations by scenario:

- [Azure Web App → Databricks](deployment-patterns.md#1-azure-web-app--databricks) — Managed Identity or Service Principal
- [On-Prem App → Databricks](deployment-patterns.md#2-on-prem-app--databricks) — OAuth M2M with secrets manager
- [Developer Laptop](deployment-patterns.md#3-developer-laptop) — Azure CLI or PAT
- [Databricks App → Workspace API](deployment-patterns.md#4-databricks-app--workspace-api) — automatic OAuth
- [Databricks Notebook → Workspace API](deployment-patterns.md#5-databricks-notebook--workspace-api) — automatic context

## Credential Resolution Order

When using `DatabricksWorkspaceClient()` with no explicit config, credentials are resolved in this order:

1. Explicit `AuthConfig` fields
2. Environment variables (`DATABRICKS_HOST`, `DATABRICKS_TOKEN`, etc.)
3. `.databrickscfg` DEFAULT profile
4. Cloud-native auth (Azure CLI, GCP default credentials)

## Cross-Language Consistency

The `AuthConfig` field names are shared across all language implementations:

| Field | Python | Node.js | Java |
|-------|--------|---------|------|
| `host` | `AuthConfig(host=...)` | `{ host: ... }` | `new AuthConfig().setHost(...)` |
| `token` | `AuthConfig(token=...)` | `{ token: ... }` | `new AuthConfig().setToken(...)` |
| `client_id` | `AuthConfig(client_id=...)` | `{ clientId: ... }` | `new AuthConfig().setClientId(...)` |
