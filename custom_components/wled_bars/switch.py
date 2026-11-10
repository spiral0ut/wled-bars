"""Master on/off switch for all bars on a device."""
from __future__ import annotations

from homeassistant.components.switch import SwitchEntity

from .const import DOMAIN
from .entity_base import BarsEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities([BarsSwitch(hass.data[DOMAIN][entry.entry_id])])


class BarsSwitch(BarsEntity, SwitchEntity):
    _attr_name = "Bars"
    _attr_icon = "mdi:led-strip-variant"

    def __init__(self, manager) -> None:
        super().__init__(manager, "enabled")

    @property
    def is_on(self) -> bool:
        return bool(self.manager.settings["enabled"])

    async def async_turn_on(self, **kwargs) -> None:
        await self._set("enabled", True)

    async def async_turn_off(self, **kwargs) -> None:
        await self._set("enabled", False)
