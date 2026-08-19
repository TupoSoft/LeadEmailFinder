"""Small Jinja filters for cross-host inventory validation and manifest rendering.

Kept here rather than inlined in playbook/template Jinja because composite-key duplicate
detection and field-stripping are materially cleaner as a few lines of Python than as nested
map/groupby chains, matching the "small, purpose-specific" preference this repo applies to
TypeScript code (see AGENTS.md) applied here to Ansible.
"""

from __future__ import annotations

from collections import Counter
from typing import Any


def proxy_fleet_dupes(values: list[Any]) -> list[Any]:
    """Return the distinct values that appear more than once in ``values``."""
    counts = Counter(values)
    return sorted({value for value, count in counts.items() if count > 1}, key=str)


def proxy_fleet_dupes_by(items: list[dict[str, Any]], *keys: str) -> list[tuple[Any, ...]]:
    """Return the distinct composite keys (built from ``keys``) that appear more than once."""
    composite_keys = [tuple(item[key] for key in keys) for item in items]
    return proxy_fleet_dupes(composite_keys)


def proxy_fleet_strip_registry_fields(listener: dict[str, Any]) -> dict[str, Any]:
    """Keep only the fields plan 11's renderer reads, dropping plan-13-only registry metadata."""
    manifest_fields = ("egressId", "bindIp", "port", "egressIp", "maxConnections")
    return {key: listener[key] for key in manifest_fields}


def proxy_fleet_render_credentials(
    listeners: list[dict[str, Any]], credentials: dict[str, dict[str, str]]
) -> dict[str, dict[str, str]]:
    """Build plan 11's exact credentials-file shape for exactly this host's listeners."""
    return {listener["egressId"]: credentials[listener["egressId"]] for listener in listeners}


class FilterModule:
    def filters(self) -> dict[str, Any]:
        return {
            "proxy_fleet_dupes": proxy_fleet_dupes,
            "proxy_fleet_dupes_by": proxy_fleet_dupes_by,
            "proxy_fleet_strip_registry_fields": proxy_fleet_strip_registry_fields,
            "proxy_fleet_render_credentials": proxy_fleet_render_credentials,
        }
