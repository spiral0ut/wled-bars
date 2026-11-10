"""Shared base for the two per-device entities."""
from __future__ import annotations

from homeassistant.core import callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import Entity

from .const import DOMAIN, SIGNAL_SETTINGS


class BarsEntity(Entity):
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
