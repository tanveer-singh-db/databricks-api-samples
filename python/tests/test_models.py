"""Tests for data models."""

from databricks_workspace_client.models import (
    ColumnInfo,
    JobInfo,
    QueryResult,
    RunResult,
    RunStatus,
)


class TestRunStatus:
    def test_terminated_is_terminal(self) -> None:
        status = RunStatus(run_id=1, life_cycle_state="TERMINATED", result_state="SUCCESS")
        assert status.is_terminal is True

    def test_skipped_is_terminal(self) -> None:
        status = RunStatus(run_id=1, life_cycle_state="SKIPPED")
        assert status.is_terminal is True

    def test_internal_error_is_terminal(self) -> None:
        status = RunStatus(run_id=1, life_cycle_state="INTERNAL_ERROR")
        assert status.is_terminal is True

    def test_running_is_not_terminal(self) -> None:
        status = RunStatus(run_id=1, life_cycle_state="RUNNING")
        assert status.is_terminal is False

    def test_pending_is_not_terminal(self) -> None:
        status = RunStatus(run_id=1, life_cycle_state="PENDING")
        assert status.is_terminal is False

    def test_defaults(self) -> None:
        status = RunStatus(run_id=42, life_cycle_state="RUNNING")
        assert status.result_state is None
        assert status.state_message is None


class TestRunResult:
    def test_is_success(self) -> None:
        result = RunResult(run_id=1, life_cycle_state="TERMINATED", result_state="SUCCESS")
        assert result.is_success is True

    def test_is_not_success(self) -> None:
        result = RunResult(run_id=1, life_cycle_state="TERMINATED", result_state="FAILED")
        assert result.is_success is False

    def test_is_terminal(self) -> None:
        result = RunResult(run_id=1, life_cycle_state="TERMINATED")
        assert result.is_terminal is True

    def test_optional_fields_default_none(self) -> None:
        result = RunResult(run_id=1, life_cycle_state="RUNNING")
        assert result.start_time is None
        assert result.end_time is None
        assert result.run_duration is None
        assert result.run_page_url is None


class TestJobInfo:
    def test_defaults(self) -> None:
        job = JobInfo(job_id=1, name="test-job")
        assert job.created_time is None
        assert job.creator is None
        assert job.tags == {}


class TestColumnInfo:
    def test_construction(self) -> None:
        col = ColumnInfo(name="id", type_name="INT", position=0)
        assert col.name == "id"
        assert col.type_name == "INT"
        assert col.position == 0


class TestQueryResult:
    def test_construction(self) -> None:
        result = QueryResult(
            statement_id="stmt-1",
            columns=[ColumnInfo(name="x", type_name="STRING", position=0)],
            rows=[["hello"], ["world"]],
            total_row_count=2,
            total_chunk_count=1,
            truncated=False,
        )
        assert result.statement_id == "stmt-1"
        assert len(result.rows) == 2
        assert result.truncated is False
