package com.databricks.client;

import com.databricks.sdk.core.DatabricksConfig;

/**
 * Authentication configuration for connecting to a Databricks workspace.
 * Fields map directly to {@link DatabricksConfig} setters.
 * Leave all fields null to use unified default credentials
 * (environment variables → .databrickscfg → cloud-native auth).
 */
public class AuthConfig {

    private String host;
    private String token;
    private String profile;
    private String authType;
    private String clientId;
    private String clientSecret;
    private String azureClientId;
    private String azureClientSecret;
    private String azureTenantId;
    private String azureWorkspaceResourceId;
    private Integer httpTimeoutSeconds;

    public AuthConfig setHost(String host) {
        this.host = host;
        return this;
    }

    public AuthConfig setToken(String token) {
        this.token = token;
        return this;
    }

    public AuthConfig setProfile(String profile) {
        this.profile = profile;
        return this;
    }

    public AuthConfig setAuthType(String authType) {
        this.authType = authType;
        return this;
    }

    public AuthConfig setClientId(String clientId) {
        this.clientId = clientId;
        return this;
    }

    public AuthConfig setClientSecret(String clientSecret) {
        this.clientSecret = clientSecret;
        return this;
    }

    public AuthConfig setAzureClientId(String azureClientId) {
        this.azureClientId = azureClientId;
        return this;
    }

    public AuthConfig setAzureClientSecret(String azureClientSecret) {
        this.azureClientSecret = azureClientSecret;
        return this;
    }

    public AuthConfig setAzureTenantId(String azureTenantId) {
        this.azureTenantId = azureTenantId;
        return this;
    }

    public AuthConfig setAzureWorkspaceResourceId(String azureWorkspaceResourceId) {
        this.azureWorkspaceResourceId = azureWorkspaceResourceId;
        return this;
    }

    public AuthConfig setHttpTimeoutSeconds(Integer httpTimeoutSeconds) {
        this.httpTimeoutSeconds = httpTimeoutSeconds;
        return this;
    }

    /**
     * Convert to the SDK's {@link DatabricksConfig}, passing through only non-null fields.
     */
    public DatabricksConfig toDatabricksConfig() {
        DatabricksConfig config = new DatabricksConfig();
        if (host != null) config.setHost(host);
        if (token != null) config.setToken(token);
        if (profile != null) config.setProfile(profile);
        if (authType != null) config.setAuthType(authType);
        if (clientId != null) config.setClientId(clientId);
        if (clientSecret != null) config.setClientSecret(clientSecret);
        if (azureClientId != null) config.setAzureClientId(azureClientId);
        if (azureClientSecret != null) config.setAzureClientSecret(azureClientSecret);
        if (azureTenantId != null) config.setAzureTenantId(azureTenantId);
        if (azureWorkspaceResourceId != null) config.setAzureWorkspaceResourceId(azureWorkspaceResourceId);
        if (httpTimeoutSeconds != null) config.setHttpTimeoutSeconds(httpTimeoutSeconds);
        return config;
    }

    public String getHost() { return host; }
    public String getToken() { return token; }
}
