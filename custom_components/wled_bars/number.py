"""Overall brightness of all bars on a device."""
from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.const import PERCENTAGE

from .const import DOMAIN
from .entity_base import BarsEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities([BarsBrightness(hass.data[DOMAIN][entry.entry_id])])


class BarsBrightness(BarsEntity, NumberEntity):
    _attr_name = "Bars brightness"
    _attr_icon = "mdi:brightness-6"
    _attr_native_min_value = 1
    _attr_native_max_value = 100
    _attr_native_step = 1
    _attr_native_unit_of_measurement = PERCENTAGE
    _attr_mode = NumberMode.SLIDER

    def __init__(self, manager) -> None:
        super().__init__(manager, "brightness")

    @property
    def native_value(self) -> float:
        return float(self.manager.settings["brightness"])

    async def async_set_native_value(self, value: float) -> None:
        await self._set("brightness", int(value))
