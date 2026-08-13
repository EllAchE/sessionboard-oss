#!/usr/bin/env python3
"""Maintain non-secret, resumable Cicero onboarding state in a caller directory."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

VERSION = 1
STATE_DIR = ".cicero"
STATE_FILE = "onboarding.json"
MILESTONES = (
    "hosting-ready",
    "account-ready",
    "event-ready",
    "cfp-open",
    "submissions-reviewed",
    "program-built",
    "program-published",
    "api-key-ready",
    "handoff-ready",
)
HOSTING_MODES = ("unknown", "existing", "local-docker", "self-hosted-other", "cloudflare")
ACCOUNT_STATUSES = ("unknown", "needed", "ready")
API_KEY_STATUSES = ("unknown", "missing", "read-only", "configured")
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class StateError(ValueError):
    """A safe, user-actionable state error."""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def default_state() -> dict[str, Any]:
    return {
        "version": VERSION,
        "base_url": None,
        "event_slug": None,
        "hosting": {"mode": "unknown"},
        "account": {"status": "unknown"},
        "api_key": {"status": "unknown", "environment_variable": "CICERO_API_KEY"},
        "progress": {"completed": [], "next": MILESTONES[0]},
        "updated_at": now(),
    }


def state_path(root: str) -> Path:
    return Path(root).expanduser().resolve() / STATE_DIR / STATE_FILE


def next_milestone(completed: list[str]) -> str | None:
    return next((milestone for milestone in MILESTONES if milestone not in completed), None)


def normalize(state: dict[str, Any]) -> dict[str, Any]:
    if state.get("version") != VERSION:
        raise StateError(f"unsupported onboarding state version: {state.get('version')!r}")

    progress = state.get("progress")
    if not isinstance(progress, dict):
        raise StateError("progress must be a JSON object")
    completed = progress.get("completed", [])
    if not isinstance(completed, list) or any(item not in MILESTONES for item in completed):
        raise StateError("progress.completed contains an unknown milestone")
    completed = [milestone for milestone in MILESTONES if milestone in set(completed)]

    base_url = state.get("base_url")
    if base_url is not None and not isinstance(base_url, str):
        raise StateError("base_url must be a string or null")
    event_slug = state.get("event_slug")
    if event_slug is not None and not isinstance(event_slug, str):
        raise StateError("event_slug must be a string or null")

    hosting = state.get("hosting")
    account = state.get("account")
    api_key = state.get("api_key")
    if not isinstance(hosting, dict) or hosting.get("mode") not in HOSTING_MODES:
        raise StateError("hosting.mode is invalid")
    if not isinstance(account, dict) or account.get("status") not in ACCOUNT_STATUSES:
        raise StateError("account.status is invalid")
    if not isinstance(api_key, dict) or api_key.get("status") not in API_KEY_STATUSES:
        raise StateError("api_key.status is invalid")

    return {
        "version": VERSION,
        "base_url": clean_base_url(base_url) if base_url else None,
        "event_slug": clean_slug(event_slug) if event_slug else None,
        "hosting": {"mode": hosting["mode"]},
        "account": {"status": account["status"]},
        "api_key": {
            "status": api_key["status"],
            "environment_variable": "CICERO_API_KEY",
        },
        "progress": {
            "completed": completed,
            "next": next_milestone(completed),
        },
        "updated_at": state.get("updated_at") if isinstance(state.get("updated_at"), str) else now(),
    }


def reopen_from(state: dict[str, Any], milestone: str) -> None:
    """Reopen a milestone and everything that depends on it."""
    cutoff = MILESTONES.index(milestone)
    state["progress"]["completed"] = [
        item for item in state["progress"]["completed"] if MILESTONES.index(item) < cutoff
    ]


def require_mark_preconditions(state: dict[str, Any], milestones: list[str]) -> None:
    requested = set(milestones)
    completed = set(state["progress"]["completed"]) | requested
    if "hosting-ready" in requested and (
        not state["base_url"] or state["hosting"]["mode"] == "unknown"
    ):
        raise StateError("hosting-ready requires a base URL and a confirmed hosting mode")
    if "account-ready" in requested and state["account"]["status"] != "ready":
        raise StateError("account-ready requires account status ready")
    if "event-ready" in requested and not state["event_slug"]:
        raise StateError("event-ready requires an exact event slug")
    if "api-key-ready" in requested and state["api_key"]["status"] != "configured":
        raise StateError("api-key-ready requires api-key status configured")
    if "handoff-ready" in requested:
        prerequisites = set(MILESTONES[:-1])
        if not prerequisites.issubset(completed) or state["api_key"]["status"] != "configured":
            raise StateError("handoff-ready requires every prior milestone and a configured API key")


def load(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise StateError(f"no onboarding state at {path}; run init")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise StateError(f"cannot read onboarding state at {path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise StateError("onboarding state must be a JSON object")
    return normalize(raw)


def save(path: Path, state: dict[str, Any]) -> None:
    state = normalize(state)
    state["updated_at"] = now()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    payload = json.dumps(state, indent=2, sort_keys=True) + "\n"
    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=path.parent, prefix=".onboarding-", delete=False
        ) as handle:
            temporary = handle.name
            os.chmod(temporary, 0o600)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)


def clean_base_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise StateError("base URL must be an absolute http(s) URL")
    if parsed.username or parsed.password:
        raise StateError("base URL must not contain credentials")
    if parsed.query or parsed.fragment:
        raise StateError("base URL must not contain a query or fragment")
    path = parsed.path.rstrip("/")
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def clean_slug(value: str) -> str:
    value = value.strip()
    if not SLUG.fullmatch(value):
        raise StateError("event slug must contain lowercase letters, digits, and single hyphens")
    return value


def print_state(path: Path, state: dict[str, Any]) -> None:
    print(json.dumps({"path": str(path), "state": state}, indent=2, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="caller working directory (default: current directory)")
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("init", help="create state if it does not exist")
    commands.add_parser("show", help="print current state without changing it")
    commands.add_parser("next", help="print the first unfinished milestone")

    setter = commands.add_parser("set", help="record confirmed non-secret setup facts")
    setter.add_argument("--base-url")
    setter.add_argument("--event-slug")
    setter.add_argument("--hosting", choices=HOSTING_MODES)
    setter.add_argument("--account", choices=ACCOUNT_STATUSES)
    setter.add_argument("--api-key", choices=API_KEY_STATUSES)

    marker = commands.add_parser("mark", help="mark one or more verified milestones complete")
    marker.add_argument("milestones", nargs="+", choices=MILESTONES)

    unmarker = commands.add_parser("unmark", help="reopen a milestone after saved state changes")
    unmarker.add_argument("milestones", nargs="+", choices=MILESTONES)
    return parser


def run(args: argparse.Namespace) -> int:
    path = state_path(args.root)
    if args.command == "init":
        if path.exists():
            state = load(path)
            save(path, state)
        else:
            state = default_state()
            save(path, state)
        print_state(path, state)
        return 0

    state = load(path)
    if args.command == "show":
        print_state(path, state)
        return 0
    if args.command == "next":
        print(state["progress"]["next"] or "complete")
        return 0
    if args.command == "set":
        changed = False
        if args.base_url is not None:
            value = clean_base_url(args.base_url)
            if value != state["base_url"]:
                reopen_from(state, "hosting-ready")
            state["base_url"] = value
            changed = True
        if args.event_slug is not None:
            value = clean_slug(args.event_slug)
            if value != state["event_slug"]:
                reopen_from(state, "event-ready")
            state["event_slug"] = value
            changed = True
        if args.hosting is not None:
            if args.hosting != state["hosting"]["mode"]:
                reopen_from(state, "hosting-ready")
            state["hosting"]["mode"] = args.hosting
            changed = True
        if args.account is not None:
            if args.account != state["account"]["status"]:
                reopen_from(state, "account-ready")
            state["account"]["status"] = args.account
            changed = True
        if args.api_key is not None:
            if args.api_key != state["api_key"]["status"]:
                reopen_from(state, "api-key-ready")
            state["api_key"]["status"] = args.api_key
            changed = True
        if not changed:
            raise StateError("set requires at least one value")
        save(path, state)
        print_state(path, state)
        return 0

    completed = set(state["progress"]["completed"])
    if args.command == "mark":
        require_mark_preconditions(state, args.milestones)
        completed.update(args.milestones)
    elif args.command == "unmark":
        reopen_from(state, min(args.milestones, key=MILESTONES.index))
        completed = set(state["progress"]["completed"])
    state["progress"]["completed"] = list(completed)
    save(path, state)
    print_state(path, state)
    return 0


def main() -> int:
    try:
        return run(build_parser().parse_args())
    except StateError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
