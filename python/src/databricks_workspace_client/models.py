"""Pure data models for DatabricksWorkspaceClient.

All models are stdlib dataclasses with zero SDK imports, making them
the cross-language contract that Node.js and Java implementations will mirror.
"""

from __future__ import annotations

from dataclasses import dataclass, field

_TERMINAL_LIFECYCLE_STATES = frozenset({"TERMINATED", "SKIPPED", "INTERNAL_ERROR"})


@dataclass(frozen=True)
class JobInfo:
    """Simplified job metadata."""

    job_id: int
    name: str
    created_time: int | None = None
    creator: str | None = None
    tags: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class RunStatus:
    """Current status of a job run."""

    run_id: int
    life_cycle_state: str
    result_state: str | None = None
    state_message: str | None = None

    @property
    def is_terminal(self) -> bool:
        return self.life_cycle_state in _TERMINAL_LIFECYCLE_STATES


@dataclass(frozen=True)
class RunResult:
    """Full result of a completed (or failed) job run."""

    run_id: int
    life_cycle_state: str
    result_state: str | None = None
    state_message: str | None = None
    start_time: int | None = None
    end_time: int | None = None
    run_duration: int | None = None
    run_page_url: str | None = None

    @property
    def is_terminal(self) -> bool:
        return self.life_cycle_state in _TERMINAL_LIFECYCLE_STATES

    @property
    def is_success(self) -> bool:
        return self.result_state == "SUCCESS"


@dataclass(frozen=True)
class ColumnInfo:
    """Column metadata from a SQL query result."""

    name: str
    type_name: str
    position: int


@dataclass(frozen=True)
class QueryResult:
    """Complete result of a SQL query execution."""

    statement_id: str
    columns: list[ColumnInfo]
    rows: list[list[str | None]]
    total_row_count: int
    total_chunk_count: int
    truncated: bool
