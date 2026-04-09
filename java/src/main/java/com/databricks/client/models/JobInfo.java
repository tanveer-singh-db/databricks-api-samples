package com.databricks.client.models;

import java.util.Map;

public record JobInfo(
        long jobId,
        String name,
        Long createdTime,
        String creator,
        Map<String, String> tags
) {
    public JobInfo(long jobId, String name, Long createdTime, String creator) {
        this(jobId, name, createdTime, creator, Map.of());
    }
}
