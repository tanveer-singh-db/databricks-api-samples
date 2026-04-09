"""Tests for JobsClient."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import MagicMock

import pytest
from databricks.sdk.errors import NotFound, PermissionDenied
from databricks.sdk.service.jobs import BaseJob, JobSettings, Run, RunState

from databricks_workspace_client.exceptions import (
    AmbiguousJobError,
    DatabricksClientError,
    JobRunError,
    OperationTimeoutError,
    PermissionDeniedError,
    ResourceNotFoundError,
)
from databricks_workspace_client.jobs import JobsClient


def _make_base_job(job_id: int, name: str) -> MagicMock:
    job = MagicMock(spec=BaseJob)
    job.job_id = job_id
    job.settings = MagicMock(spec=JobSettings)
    job.settings.name = name
    job.settings.tags = None
    job.created_time = 1700000000
    job.creator_user_name = "user@example.com"
    return job


def _make_run(
    run_id: int,
    life_cycle_state: str,
    result_state: str | None = None,
    state_message: str | None = None,
) -> MagicMock:
    run = MagicMock(spec=Run)
    run.run_id = run_id
    run.state = MagicMock(spec=RunState)

    lcs_mock = MagicMock()
    lcs_mock.value = life_cycle_state
    run.state.life_cycle_state = lcs_mock

    if result_state:
        rs_mock = MagicMock()
        rs_mock.value = result_state
        run.state.result_state = rs_mock
    else:
        run.state.result_state = None

    run.state.state_message = state_message
    run.start_time = 1700000000
    run.end_time = 1700000060
    run.execution_duration = 60000
    run.run_page_url = "https://workspace.com/jobs/1/runs/1"
    return run


class TestListJobs:
    def test_list_returns_job_info(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.list.return_value = iter([
            _make_base_job(1, "etl-daily"),
            _make_base_job(2, "ml-training"),
        ])
        client = JobsClient(mock_ws)
        jobs = client.list_jobs()
        assert len(jobs) == 2
        assert jobs[0].job_id == 1
        assert jobs[0].name == "etl-daily"
        assert jobs[1].job_id == 2

    def test_list_with_name_filter(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.list.return_value = iter([_make_base_job(1, "etl-daily")])
        client = JobsClient(mock_ws)
        client.list_jobs(name="etl-daily")
        mock_ws.jobs.list.assert_called_once_with(name="etl-daily", expand_tasks=False)

    def test_list_with_limit(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.list.return_value = iter([
            _make_base_job(i, f"job-{i}") for i in range(10)
        ])
        client = JobsClient(mock_ws)
        jobs = client.list_jobs(limit=3)
        assert len(jobs) == 3

    def test_list_permission_denied(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.list.side_effect = PermissionDenied("no access")
        client = JobsClient(mock_ws)
        with pytest.raises(PermissionDeniedError):
            client.list_jobs()


class TestTrigger:
    def test_trigger_returns_run_id(self, mock_ws: MagicMock) -> None:
        wait_mock = MagicMock()
        wait_mock.run_id = 42
        mock_ws.jobs.run_now.return_value = wait_mock

        client = JobsClient(mock_ws)
        run_id = client.trigger(job_id=1, notebook_params={"key": "value"})
        assert run_id == 42
        mock_ws.jobs.run_now.assert_called_once_with(
            job_id=1,
            notebook_params={"key": "value"},
            job_parameters=None,
            python_params=None,
            python_named_params=None,
            jar_params=None,
            sql_params=None,
            idempotency_token=None,
        )

    def test_trigger_job_not_found(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.run_now.side_effect = NotFound("job 999 not found")
        client = JobsClient(mock_ws)
        with pytest.raises(ResourceNotFoundError, match="999"):
            client.trigger(job_id=999)

    def test_trigger_permission_denied(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.run_now.side_effect = PermissionDenied("not allowed")
        client = JobsClient(mock_ws)
        with pytest.raises(PermissionDeniedError):
            client.trigger(job_id=1)


class TestGetRunStatus:
    def test_returns_run_status(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.get_run.return_value = _make_run(42, "RUNNING")
        client = JobsClient(mock_ws)
        status = client.get_run_status(run_id=42)
        assert status.run_id == 42
        assert status.life_cycle_state == "RUNNING"
        assert status.is_terminal is False

    def test_terminal_state(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.get_run.return_value = _make_run(42, "TERMINATED", "SUCCESS")
        client = JobsClient(mock_ws)
        status = client.get_run_status(run_id=42)
        assert status.is_terminal is True
        assert status.result_state == "SUCCESS"

    def test_run_not_found(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.get_run.side_effect = NotFound("run 999 not found")
        client = JobsClient(mock_ws)
        with pytest.raises(ResourceNotFoundError):
            client.get_run_status(run_id=999)


class TestGetRunResult:
    def test_returns_full_result(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.get_run.return_value = _make_run(42, "TERMINATED", "SUCCESS")
        client = JobsClient(mock_ws)
        result = client.get_run_result(run_id=42)
        assert result.run_id == 42
        assert result.start_time == 1700000000
        assert result.end_time == 1700000060
        assert result.run_duration == 60000
        assert result.run_page_url == "https://workspace.com/jobs/1/runs/1"


class TestTriggerAndWait:
    def test_success(self, mock_ws: MagicMock) -> None:
        wait_mock = MagicMock()
        wait_mock.run_id = 42
        completed_run = _make_run(42, "TERMINATED", "SUCCESS")
        wait_mock.result.return_value = completed_run
        mock_ws.jobs.run_now.return_value = wait_mock

        client = JobsClient(mock_ws)
        result = client.trigger_and_wait(job_id=1, timeout=timedelta(minutes=5))
        assert result.run_id == 42
        assert result.is_success

    def test_timeout_raises(self, mock_ws: MagicMock) -> None:
        wait_mock = MagicMock()
        wait_mock.run_id = 42
        wait_mock.result.side_effect = TimeoutError("timed out")
        mock_ws.jobs.run_now.return_value = wait_mock

        client = JobsClient(mock_ws)
        with pytest.raises(OperationTimeoutError, match="did not complete"):
            client.trigger_and_wait(job_id=1, timeout=timedelta(seconds=1))

    def test_failure_raises_job_run_error(self, mock_ws: MagicMock) -> None:
        wait_mock = MagicMock()
        wait_mock.run_id = 42
        failed_run = _make_run(42, "TERMINATED", "FAILED", "task failed: OOM")
        wait_mock.result.return_value = failed_run
        mock_ws.jobs.run_now.return_value = wait_mock

        client = JobsClient(mock_ws)
        with pytest.raises(JobRunError, match="FAILED"):
            client.trigger_and_wait(job_id=1)

    def test_callback_receives_run_status(self, mock_ws: MagicMock) -> None:
        wait_mock = MagicMock()
        wait_mock.run_id = 42

        # Capture the SDK callback and simulate it being called
        def fake_result(timeout: timedelta, callback: object = None) -> MagicMock:
            if callback:
                callback(_make_run(42, "RUNNING"))
                callback(_make_run(42, "TERMINATING"))
            return _make_run(42, "TERMINATED", "SUCCESS")

        wait_mock.result.side_effect = fake_result
        mock_ws.jobs.run_now.return_value = wait_mock

        captured_statuses: list[object] = []
        client = JobsClient(mock_ws)
        client.trigger_and_wait(
            job_id=1,
            poll_callback=lambda s: captured_statuses.append(s.life_cycle_state),
        )
        assert captured_statuses == ["RUNNING", "TERMINATING"]

    def test_not_found_raises(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.run_now.side_effect = NotFound("no such job")
        client = JobsClient(mock_ws)
        with pytest.raises(ResourceNotFoundError):
            client.trigger_and_wait(job_id=999)


class TestResolveJob:
    def test_resolve_by_job_id(self, mock_ws: MagicMock) -> None:
        client = JobsClient(mock_ws)
        assert client._resolve_job(job_id=42, job_name=None) == 42
        mock_ws.jobs.list.assert_not_called()

    def test_resolve_exact_name_match(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.list.return_value = iter([_make_base_job(10, "etl-daily")])
        client = JobsClient(mock_ws)
        assert client._resolve_job(job_id=None, job_name="etl-daily") == 10

    def test_resolve_partial_name_match(self, mock_ws: MagicMock) -> None:
        # First call (exact match) returns empty, second call (all jobs) returns matches
        mock_ws.jobs.list.side_effect = [
            iter([]),  # exact match returns nothing
            iter([
                _make_base_job(1, "other-job"),
                _make_base_job(2, "my-etl-pipeline"),
                _make_base_job(3, "ml-training"),
            ]),
        ]
        client = JobsClient(mock_ws)
        assert client._resolve_job(job_id=None, job_name="etl") == 2

    def test_resolve_no_match(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.list.side_effect = [
            iter([]),  # exact match returns nothing
            iter([_make_base_job(1, "other-job")]),  # no partial match either
        ]
        client = JobsClient(mock_ws)
        with pytest.raises(ResourceNotFoundError, match="No job found"):
            client._resolve_job(job_id=None, job_name="nonexistent")

    def test_resolve_ambiguous_exact_match(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.list.return_value = iter([
            _make_base_job(1, "etl-daily"),
            _make_base_job(2, "etl-daily"),
        ])
        client = JobsClient(mock_ws)
        with pytest.raises(AmbiguousJobError, match="matched 2 jobs"):
            client._resolve_job(job_id=None, job_name="etl-daily")

    def test_resolve_ambiguous_partial_match(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.list.side_effect = [
            iter([]),  # no exact match
            iter([
                _make_base_job(1, "etl-daily-v1"),
                _make_base_job(2, "etl-daily-v2"),
                _make_base_job(3, "etl-weekly"),
            ]),
        ]
        client = JobsClient(mock_ws)
        with pytest.raises(AmbiguousJobError, match="matched 3 jobs") as exc_info:
            client._resolve_job(job_id=None, job_name="etl")
        assert len(exc_info.value.details["matches"]) == 3

    def test_resolve_neither_provided(self, mock_ws: MagicMock) -> None:
        client = JobsClient(mock_ws)
        with pytest.raises(DatabricksClientError, match="Either job_id or job_name"):
            client._resolve_job(job_id=None, job_name=None)


class TestFindAndTrigger:
    def test_fire_and_forget(self, mock_ws: MagicMock) -> None:
        """wait=False: triggers and returns current state immediately."""
        # Resolve: exact match
        mock_ws.jobs.list.return_value = iter([_make_base_job(10, "my-job")])
        # Trigger
        wait_mock = MagicMock()
        wait_mock.run_id = 42
        mock_ws.jobs.run_now.return_value = wait_mock
        # Get result
        mock_ws.jobs.get_run.return_value = _make_run(42, "PENDING")

        client = JobsClient(mock_ws)
        result = client.find_and_trigger(job_name="my-job", notebook_params={"x": "1"})
        assert result.run_id == 42
        assert result.life_cycle_state == "PENDING"

    def test_wait_for_completion(self, mock_ws: MagicMock) -> None:
        """wait=True: delegates to trigger_and_wait."""
        mock_ws.jobs.list.return_value = iter([_make_base_job(10, "my-job")])
        wait_mock = MagicMock()
        wait_mock.run_id = 42
        wait_mock.result.return_value = _make_run(42, "TERMINATED", "SUCCESS")
        mock_ws.jobs.run_now.return_value = wait_mock

        client = JobsClient(mock_ws)
        result = client.find_and_trigger(job_name="my-job", wait=True)
        assert result.run_id == 42
        assert result.is_success

    def test_by_partial_name(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.list.side_effect = [
            iter([]),  # exact match fails
            iter([_make_base_job(5, "my-etl-pipeline")]),  # partial matches 1
        ]
        wait_mock = MagicMock()
        wait_mock.run_id = 99
        mock_ws.jobs.run_now.return_value = wait_mock
        mock_ws.jobs.get_run.return_value = _make_run(99, "RUNNING")

        client = JobsClient(mock_ws)
        result = client.find_and_trigger(job_name="etl")
        assert result.run_id == 99

    def test_by_job_id(self, mock_ws: MagicMock) -> None:
        wait_mock = MagicMock()
        wait_mock.run_id = 77
        mock_ws.jobs.run_now.return_value = wait_mock
        mock_ws.jobs.get_run.return_value = _make_run(77, "PENDING")

        client = JobsClient(mock_ws)
        result = client.find_and_trigger(job_id=10)
        assert result.run_id == 77
        mock_ws.jobs.list.assert_not_called()

    def test_not_found(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.list.side_effect = [iter([]), iter([])]
        client = JobsClient(mock_ws)
        with pytest.raises(ResourceNotFoundError):
            client.find_and_trigger(job_name="ghost")

    def test_ambiguous(self, mock_ws: MagicMock) -> None:
        mock_ws.jobs.list.return_value = iter([
            _make_base_job(1, "etl-job"),
            _make_base_job(2, "etl-job"),
        ])
        client = JobsClient(mock_ws)
        with pytest.raises(AmbiguousJobError):
            client.find_and_trigger(job_name="etl-job")
