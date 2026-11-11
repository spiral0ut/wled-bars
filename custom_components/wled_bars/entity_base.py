"""Shared bases for the per-device and per-bar entities."""
from __future__ import annotations

from typing import Callable

from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import Entity

from .const import DOMAIN, SIGNAL_SETTINGS, SIGNAL_STATUS


class BarsEntity(Entity):
    """An entity that belongs to one WLED device."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, manager, key: str) -> None:
        self.manager = manager
        self._attr_unique_id = f"{manager.entry.entry_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, manager.entry.entry_id)},
            name=f"{manager.name} Bars",
            manufacturer="WLED Bars",
            configuration_url=f"http://{manager.host}",
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                f"{SIGNAL_SETTINGS}_{self.manager.entry.entry_id}",
                self._changed,
            )
        )

    @callback
    def _changed(self) -> None:
        self.async_write_ha_state()

    async def _set(self, key: str, value) -> None:
        await self.manager.async_save(None, {**self.manager.settings, key: value})


class BarEntity(BarsEntity):
    """An entity that belongs to one bar. Named after the bar, and follows renames."""

    suffix = ""  # appended to the bar's name

    def __init__(self, manager, bar_id: str, key: str) -> None:
        super().__init__(manager, f"{bar_id}_{key}")
        self.bar_id = bar_id

    @property
    def runtime(self):
        for rt in self.manager.runtimes:
            if rt.bar["id"] == self.bar_id:
                return rt
        return None

    @property
    def bar(self) -> dict | None:
        rt = self.runtime
        return rt.bar if rt else None

    @property
    def available(self) -> bool:
        return self.runtime is not None

    @property
    def name(self) -> str:
        bar = self.bar
        base = bar["name"] if bar else "Bar"
        return f"{base} {self.suffix}".strip()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                f"{SIGNAL_STATUS}_{self.manager.entry.entry_id}",
                self._changed,
            )
        )


def sync_bar_entities(
    hass,
    entry,
    async_add_entities,
    factory: Callable[[object, str], BarEntity],
    wanted: Callable[[dict], bool] = lambda bar: True,
) -> None:
    """Keep one entity per bar: add for new bars, remove for deleted ones."""
    manager = hass.data[DOMAIN][entry.entry_id]
    known: dict[str, BarEntity] = {}

    @callback
    def sync() -> None:
        current = [bar["id"] for bar in manager.bars if wanted(bar)]  # in list order
        fresh = [factory(manager, bar_id) for bar_id in current if bar_id not in known]
        for entity in fresh:
            known[entity.bar_id] = entity
        if fresh:
            async_add_entities(fresh)
        registry = er.async_get(hass)
        for bar_id in [b for b in known if b not in current]:
            entity = known.pop(bar_id)
            if entity.entity_id and registry.async_get(entity.entity_id):
                registry.async_remove(entity.entity_id)  # also removes the entity itself
            elif entity.hass is not None:
                hass.async_create_task(entity.async_remove())

    sync()
    entry.async_on_unload(
        async_dispatcher_connect(hass, f"{SIGNAL_SETTINGS}_{entry.entry_id}", sync)
    )
