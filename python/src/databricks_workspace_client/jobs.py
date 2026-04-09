"""Jobs API client — list, trigger, poll, and wait for Databricks job runs."""

from __future__ import annotations

import itertools
import logging
from collections.abc import Callable
from datetime import timedelta

from databricks.sdk import WorkspaceClient
from databricks.sdk.errors import NotFound, PermissionDenied
from databricks.sdk.service.jobs import BaseJob, Run

from databricks_workspace_client.exceptions import (
    AmbiguousJobError,
    DatabricksClientError,
    JobRunError,
    OperationTimeoutError,
    PermissionDeniedError,
    ResourceNotFoundError,
)
from databricks_workspace_client.models import JobInfo, RunResult, RunStatus


def _map_job(job: BaseJob) -> JobInfo:
    """Convert an SDK ``BaseJob`` to our ``JobInfo`` model."""
    return JobInfo(
        job_id=job.job_id or 0,
        name=job.settings.name if job.settings else "",
        created_time=job.created_time,
        creator=job.creator_user_name,
        tags=dict(job.settings.tags) if job.settings and job.settings.tags else {},
    )


def _map_run_status(run: Run) -> RunStatus:
    """Convert an SDK ``Run`` to our ``RunStatus`` model."""
    state = run.state
    return RunStatus(
        run_id=run.run_id or 0,
        life_cycle_state=state.life_cycle_state.value if state and state.life_cycle_state else "",
        result_state=state.result_state.value if state and state.result_state else None,
        state_message=state.state_message if state else None,
    )


def _map_run_result(run: Run) -> RunResult:
    """Convert an SDK ``Run`` to our ``RunResult`` model."""
    state = run.state
    return RunResult(
        run_id=run.run_id or 0,
        life_cycle_state=state.life_cycle_state.value if state and state.life_cycle_state else "",
        result_state=state.result_state.value if state and state.result_state else None,
        state_message=state.state_message if state else None,
        start_time=run.start_time,
        end_time=run.end_time,
        run_duration=run.execution_duration,
        run_page_url=run.run_page_url,
    )


logger = logging.getLogger(__name__)


class JobsClient:
    """Client for Databricks Jobs API operations."""

    def __init__(self, workspace_client: WorkspaceClient) -> None:
        self._ws = workspace_client

    def list_jobs(
        self,
        *,
        name: str | None = None,
        expand_tasks: bool = False,
        limit: int | None = None,
    ) -> list[JobInfo]:
        """List jobs in the workspace, optionally filtering by name.

        Args:
            name: Filter by exact job name (case-insensitive match on the API side).
            expand_tasks: Include task and cluster details in the response.
            limit: Maximum number of jobs to return. ``None`` returns all.

        Returns:
            List of ``JobInfo`` objects.

        Raises:
            PermissionError_: If the caller lacks permission to list jobs.
        """
        try:
            jobs_iter = self._ws.jobs.list(name=name, expand_tasks=expand_tasks)
            if limit is not None:
                jobs_iter = itertools.islice(jobs_iter, limit)
            return [_map_job(j) for j in jobs_iter]
        except PermissionDenied as e:
            raise PermissionDeniedError(
                f"Permission denied listing jobs: {e}",
                details={"name_filter": name},
            ) from e

    def trigger(
        self,
        job_id: int,
        *,
        notebook_params: dict[str, str] | None = None,
        job_parameters: dict[str, str] | None = None,
        python_params: list[str] | None = None,
        python_named_params: dict[str, str] | None = None,
        jar_params: list[str] | None = None,
        sql_params: dict[str, str] | None = None,
        idempotency_token: str | None = None,
    ) -> int:
        """Trigger a job run and return the ``run_id`` immediately (non-blocking).

        Args:
            job_id: The ID of the job to trigger.
            notebook_params: Parameters for notebook tasks.
            job_parameters: Job-level parameters (Databricks Jobs v2.1+).
            python_params: Positional parameters for Python tasks.
            python_named_params: Named parameters for Python tasks.
            jar_params: Parameters for JAR tasks.
            sql_params: Parameters for SQL tasks.
            idempotency_token: Token to ensure at-most-once execution.

        Returns:
            The ``run_id`` of the triggered run.

        Raises:
            ResourceNotFoundError: If the job does not exist.
            PermissionError_: If the caller lacks permission to trigger the job.
        """
        try:
            wait = self._ws.jobs.run_now(
                job_id=job_id,
                notebook_params=notebook_params,
                job_parameters=job_parameters,
                python_params=python_params,
                python_named_params=python_named_params,
                jar_params=jar_params,
                sql_params=sql_params,
                idempotency_token=idempotency_token,
            )
            return wait.run_id
        except NotFound as e:
            raise ResourceNotFoundError(
                f"Job {job_id} not found: {e}",
                details={"job_id": job_id},
            ) from e
        except PermissionDenied as e:
            raise PermissionDeniedError(
                f"Permission denied triggering job {job_id}: {e}",
                details={"job_id": job_id},
            ) from e

    def get_run_status(self, run_id: int) -> RunStatus:
        """Get the current status of a job run (single poll).

        Args:
            run_id: The ID of the run to check.

        Returns:
            Current ``RunStatus``.

        Raises:
            ResourceNotFoundError: If the run does not exist.
        """
        try:
            run = self._ws.jobs.get_run(run_id=run_id)
            return _map_run_status(run)
        except NotFound as e:
            raise ResourceNotFoundError(
                f"Run {run_id} not found: {e}",
                details={"run_id": run_id},
            ) from e

    def get_run_result(self, run_id: int) -> RunResult:
        """Get the full result of a job run.

        Args:
            run_id: The ID of the run.

        Returns:
            Full ``RunResult`` including timing and URL.

        Raises:
            ResourceNotFoundError: If the run does not exist.
        """
        try:
            run = self._ws.jobs.get_run(run_id=run_id)
            return _map_run_result(run)
        except NotFound as e:
            raise ResourceNotFoundError(
                f"Run {run_id} not found: {e}",
                details={"run_id": run_id},
            ) from e

    def trigger_and_wait(
        self,
        job_id: int,
        *,
        notebook_params: dict[str, str] | None = None,
        job_parameters: dict[str, str] | None = None,
        python_params: list[str] | None = None,
        python_named_params: dict[str, str] | None = None,
        jar_params: list[str] | None = None,
        sql_params: dict[str, str] | None = None,
        idempotency_token: str | None = None,
        timeout: timedelta = timedelta(minutes=20),
        poll_callback: Callable[[RunStatus], None] | None = None,
    ) -> RunResult:
        """Trigger a job and block until it reaches a terminal state.

        Uses the SDK's built-in ``Wait[Run].result()`` with polling. The optional
        ``poll_callback`` receives a ``RunStatus`` between each poll interval,
        useful for logging progress.

        Args:
            job_id: The ID of the job to trigger.
            notebook_params: Parameters for notebook tasks.
            job_parameters: Job-level parameters.
            python_params: Positional parameters for Python tasks.
            python_named_params: Named parameters for Python tasks.
            jar_params: Parameters for JAR tasks.
            sql_params: Parameters for SQL tasks.
            idempotency_token: Token to ensure at-most-once execution.
            timeout: Maximum time to wait for completion. Defaults to 20 minutes.
            poll_callback: Called with ``RunStatus`` between each poll interval.

        Returns:
            Full ``RunResult`` when the run reaches a terminal state.

        Raises:
            ResourceNotFoundError: If the job does not exist.
            TimeoutError_: If the run does not complete within ``timeout``.
            JobRunError: If the run terminates with a non-SUCCESS result.
        """
        try:
            wait = self._ws.jobs.run_now(
                job_id=job_id,
                notebook_params=notebook_params,
                job_parameters=job_parameters,
                python_params=python_params,
                python_named_params=python_named_params,
                jar_params=jar_params,
                sql_params=sql_params,
                idempotency_token=idempotency_token,
            )

            # Adapt the SDK callback (receives Run) to our callback (receives RunStatus)
            sdk_callback = None
            if poll_callback is not None:

                def sdk_callback(run: Run) -> None:
                    poll_callback(_map_run_status(run))

            completed_run = wait.result(timeout=timeout, callback=sdk_callback)

        except NotFound as e:
            raise ResourceNotFoundError(
                f"Job {job_id} not found: {e}",
                details={"job_id": job_id},
            ) from e
        except TimeoutError as e:
            raise OperationTimeoutError(
                f"Job {job_id} did not complete within {timeout}: {e}",
                details={"job_id": job_id, "timeout": str(timeout)},
            ) from e
        except PermissionDenied as e:
            raise PermissionDeniedError(
                f"Permission denied triggering job {job_id}: {e}",
                details={"job_id": job_id},
            ) from e

        result = _map_run_result(completed_run)

        if result.result_state and result.result_state != "SUCCESS":
            raise JobRunError(
                f"Job {job_id} run {result.run_id} finished with state "
                f"{result.result_state}: {result.state_message}",
                details={
                    "job_id": job_id,
                    "run_id": result.run_id,
                    "result_state": result.result_state,
                },
            )

        return result

    def _resolve_job(self, *, job_id: int | None, job_name: str | None) -> int:
        """Resolve a job by ID or name (exact or partial). Returns the job_id.

        Resolution order:
        1. If ``job_id`` is provided, return it directly.
        2. If ``job_name`` is provided, try exact match via the API.
        3. If no exact match, search all jobs for a partial (substring) match.

        Args:
            job_id: Explicit job ID — used directly if provided.
            job_name: Job name or partial name to search for.

        Returns:
            The resolved ``job_id``.

        Raises:
            DatabricksClientError: If neither job_id nor job_name is provided.
            ResourceNotFoundError: If no job matches the name.
            AmbiguousJobError: If multiple jobs match the name.
        """
        if job_id is not None:
            logger.info("[find_and_trigger] Using job_id=%d directly", job_id)
            return job_id

        if job_name is None:
            raise DatabricksClientError(
                "Either job_id or job_name must be provided",
            )

        # 1. Try exact match (API-side, case-insensitive)
        logger.info("[find_and_trigger] Searching for job with exact name: '%s'", job_name)
        exact_matches = self.list_jobs(name=job_name)
        if len(exact_matches) == 1:
            logger.info(
                "[find_and_trigger] Exact match found: [%d] %s",
                exact_matches[0].job_id, exact_matches[0].name,
            )
            return exact_matches[0].job_id
        if len(exact_matches) > 1:
            self._raise_ambiguous(job_name, exact_matches)

        # 2. Partial match (client-side, capped at 1000 jobs)
        logger.info(
            "[find_and_trigger] No exact match. Searching partial match across workspace jobs...",
        )
        all_jobs = self.list_jobs(limit=1000)
        needle = job_name.lower()
        partial = [j for j in all_jobs if needle in j.name.lower()]

        if len(partial) == 0:
            raise ResourceNotFoundError(
                f"No job found matching '{job_name}' (searched {len(all_jobs)} jobs)",
                details={"job_name": job_name, "jobs_searched": len(all_jobs)},
            )
        if len(partial) == 1:
            logger.info(
                "[find_and_trigger] Partial match found: [%d] %s",
                partial[0].job_id, partial[0].name,
            )
            return partial[0].job_id

        self._raise_ambiguous(job_name, partial)

    @staticmethod
    def _raise_ambiguous(job_name: str, matches: list[JobInfo]) -> None:
        """Raise AmbiguousJobError with a formatted list of matching jobs."""
        job_list = "\n".join(f"  [{j.job_id}] {j.name}" for j in matches)
        raise AmbiguousJobError(
            f"Job name '{job_name}' matched {len(matches)} jobs:\n{job_list}\n"
            f"Please provide a more specific name or use job_id.",
            details={
                "job_name": job_name,
                "matches": [{"job_id": j.job_id, "name": j.name} for j in matches],
            },
        )

    def find_and_trigger(
        self,
        *,
        job_id: int | None = None,
        job_name: str | None = None,
        notebook_params: dict[str, str] | None = None,
        job_parameters: dict[str, str] | None = None,
        python_params: list[str] | None = None,
        python_named_params: dict[str, str] | None = None,
        jar_params: list[str] | None = None,
        sql_params: dict[str, str] | None = None,
        idempotency_token: str | None = None,
        wait: bool = False,
        timeout: timedelta = timedelta(minutes=20),
        poll_callback: Callable[[RunStatus], None] | None = None,
    ) -> RunResult:
        """Find a job by ID or name, trigger it, and return the result.

        Resolves the job using ``job_id`` (direct) or ``job_name`` (exact then
        partial match). Then triggers the job and either returns immediately
        or waits for completion based on the ``wait`` flag.

        Args:
            job_id: Explicit job ID — skips name resolution.
            job_name: Job name or partial name to search for.
            notebook_params: Parameters for notebook tasks.
            job_parameters: Job-level parameters.
            python_params: Positional parameters for Python tasks.
            python_named_params: Named parameters for Python tasks.
            jar_params: Parameters for JAR tasks.
            sql_params: Parameters for SQL tasks.
            idempotency_token: Token to ensure at-most-once execution.
            wait: If True, block until the run reaches a terminal state.
            timeout: Maximum time to wait (only used when ``wait=True``).
            poll_callback: Called with ``RunStatus`` between polls (only when ``wait=True``).

        Returns:
            ``RunResult`` — terminal if ``wait=True``, otherwise current state.

        Raises:
            DatabricksClientError: If neither job_id nor job_name is provided.
            ResourceNotFoundError: If no job matches the name.
            AmbiguousJobError: If multiple jobs match the name.
            JobRunError: If ``wait=True`` and the run finishes with non-SUCCESS.
            OperationTimeoutError: If ``wait=True`` and the timeout is exceeded.
        """
        resolved_id = self._resolve_job(job_id=job_id, job_name=job_name)

        trigger_kwargs: dict[str, object] = {}
        if notebook_params is not None:
            trigger_kwargs["notebook_params"] = notebook_params
        if job_parameters is not None:
            trigger_kwargs["job_parameters"] = job_parameters
        if python_params is not None:
            trigger_kwargs["python_params"] = python_params
        if python_named_params is not None:
            trigger_kwargs["python_named_params"] = python_named_params
        if jar_params is not None:
            trigger_kwargs["jar_params"] = jar_params
        if sql_params is not None:
            trigger_kwargs["sql_params"] = sql_params
        if idempotency_token is not None:
            trigger_kwargs["idempotency_token"] = idempotency_token

        logger.info("[find_and_trigger] Triggering job_id=%d (wait=%s)", resolved_id, wait)

        if wait:
            result = self.trigger_and_wait(
                resolved_id,
                timeout=timeout,
                poll_callback=poll_callback,
                **trigger_kwargs,  # type: ignore[arg-type]
            )
            logger.info(
                "[find_and_trigger] Run %d completed: %s",
                result.run_id, result.result_state,
            )
            return result

        run_id = self.trigger(resolved_id, **trigger_kwargs)  # type: ignore[arg-type]
        logger.info("[find_and_trigger] Run %d triggered (fire-and-forget)", run_id)
        return self.get_run_result(run_id)
