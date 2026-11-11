"""Switches: one for all bars on a device, and one per bar."""
from __future__ import annotations

from homeassistant.components.switch import SwitchEntity

from .const import DOMAIN
from .entity_base import BarEntity, BarsEntity, sync_bar_entities


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities([BarsSwitch(hass.data[DOMAIN][entry.entry_id])])
    sync_bar_entities(hass, entry, async_add_entities, BarSwitch)


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


class BarSwitch(BarEntity, SwitchEntity):
    """Turns a single bar on or off (the same switch as in the editor)."""

    _attr_icon = "mdi:led-strip"

    def __init__(self, manager, bar_id: str) -> None:
        super().__init__(manager, bar_id, "enabled")

    @property
    def is_on(self) -> bool:
        bar = self.bar
        return bool(bar and bar["enabled"])

    async def _enable(self, enabled: bool) -> None:
        bars = [dict(b) for b in self.manager.bars]
        for bar in bars:
            if bar["id"] == self.bar_id:
                bar["enabled"] = enabled
        await self.manager.async_save(bars, None)

    async def async_turn_on(self, **kwargs) -> None:
        await self._enable(True)

    async def async_turn_off(self, **kwargs) -> None:
        await self._enable(False)
