package com.databricks.client;

import com.databricks.client.exceptions.QueryExecutionException;
import com.databricks.sdk.service.sql.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SqlClientTest {

    @Mock
    private StatementExecutionAPI stmtApi;

    private SqlClient client;

    @BeforeEach
    void setUp() {
        client = new SqlClient(stmtApi);
    }

    @SuppressWarnings("unchecked")
    private static StatementResponse makeResponse(String stmtId,
                                                    Collection<? extends Collection<String>> rows,
                                                    int totalChunks, long totalRows) {
        var col1 = new ColumnInfo().setName("id").setTypeName(ColumnInfoTypeName.INT).setPosition(0L);
        var col2 = new ColumnInfo().setName("name").setTypeName(ColumnInfoTypeName.STRING).setPosition(1L);
        var schema = new ResultSchema().setColumns(List.of(col1, col2));
        var manifest = new ResultManifest()
                .setSchema(schema)
                .setTotalChunkCount((long) totalChunks)
                .setTotalRowCount(totalRows)
                .setTruncated(false);
        var result = new ResultData().setDataArray((Collection) rows);
        var status = new StatementStatus().setState(StatementState.SUCCEEDED);
        return new StatementResponse()
                .setStatementId(stmtId)
                .setStatus(status)
                .setManifest(manifest)
                .setResult(result);
    }

    @Test
    void singleChunk() {
        List<List<String>> rows = List.of(List.of("1", "alice"), List.of("2", "bob"));
        when(stmtApi.executeStatement(any(ExecuteStatementRequest.class)))
                .thenReturn(makeResponse("stmt-1", rows, 1, 2));

        var result = client.executeQuery("SELECT *", "wh-1");
        assertEquals("stmt-1", result.statementId());
        assertEquals(2, result.columns().size());
        assertEquals("id", result.columns().get(0).name());
        assertEquals(2, result.rows().size());
        assertEquals(List.of("1", "alice"), result.rows().get(0));
    }

    @SuppressWarnings("unchecked")
    @Test
    void multiChunkPagination() {
        List<List<String>> firstRows = new ArrayList<>(List.of(List.of("1", "a"), List.of("2", "b")));
        when(stmtApi.executeStatement(any(ExecuteStatementRequest.class)))
                .thenReturn(makeResponse("stmt-1", firstRows, 3, 5));

        var chunk2 = new ResultData().setDataArray((Collection) List.of(List.of("3", "c"), List.of("4", "d")));
        var chunk3 = new ResultData().setDataArray((Collection) List.of(List.of("5", "e")));
        when(stmtApi.getStatementResultChunkN(any(GetStatementResultChunkNRequest.class)))
                .thenReturn(chunk2)
                .thenReturn(chunk3);

        var result = client.executeQuery("SELECT *", "wh-1");
        assertEquals(5, result.rows().size());
        assertEquals(List.of("5", "e"), result.rows().get(4));
        verify(stmtApi, times(2)).getStatementResultChunkN(any());
    }

    @Test
    void executionError() {
        when(stmtApi.executeStatement(any(ExecuteStatementRequest.class)))
                .thenThrow(new RuntimeException("warehouse offline"));
        assertThrows(QueryExecutionException.class, () -> client.executeQuery("SELECT 1", "wh-bad"));
    }

    @Test
    void failedStatement() {
        var error = new ServiceError().setMessage("syntax error");
        var status = new StatementStatus().setState(StatementState.FAILED).setError(error);
        var response = new StatementResponse()
                .setStatementId("s1")
                .setStatus(status);
        when(stmtApi.executeStatement(any(ExecuteStatementRequest.class))).thenReturn(response);

        var ex = assertThrows(QueryExecutionException.class, () -> client.executeQuery("SELCT 1", "wh-1"));
        assertTrue(ex.getMessage().contains("syntax error"));
    }

    @SuppressWarnings("unchecked")
    @Test
    void lazyYieldsChunks() {
        List<List<String>> firstRows = new ArrayList<>(List.of(List.of("1")));
        when(stmtApi.executeStatement(any(ExecuteStatementRequest.class)))
                .thenReturn(makeResponse("s1", firstRows, 2, 2));
        var chunk2 = new ResultData().setDataArray((Collection) List.of(List.of("2")));
        when(stmtApi.getStatementResultChunkN(any(GetStatementResultChunkNRequest.class))).thenReturn(chunk2);

        var iter = client.executeQueryLazy("SELECT x", "wh-1");
        assertTrue(iter.hasNext());
        assertEquals(List.of(List.of("1")), iter.next());
        assertTrue(iter.hasNext());
        assertEquals(List.of(List.of("2")), iter.next());
        assertFalse(iter.hasNext());
    }
}
