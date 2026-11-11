"""Numbers: overall brightness per device, and the value of each manual bar."""
from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.const import PERCENTAGE

from . import engine
from .const import DOMAIN
from .entity_base import BarEntity, BarsEntity, sync_bar_entities


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities([BarsBrightness(hass.data[DOMAIN][entry.entry_id])])
    sync_bar_entities(
        hass, entry, async_add_entities, BarValue, lambda bar: bar["source"]["type"] == "manual"
    )


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


class BarValue(BarEntity, NumberEntity):
    """Sets the value of a bar whose source is "an automation"."""

    suffix = "value"
    _attr_icon = "mdi:tune-variant"
    _attr_mode = NumberMode.SLIDER

    def __init__(self, manager, bar_id: str) -> None:
        super().__init__(manager, bar_id, "value")

    def _range(self) -> tuple[float, float]:
        bar = self.bar
        if not bar:
            return (0.0, 100.0)
        low = engine.num(bar["source"]["min"], 0.0)
        high = engine.num(bar["source"]["max"], 100.0)
        return (min(low, high), max(low, high))

    @property
    def native_min_value(self) -> float:
        return self._range()[0]

    @property
    def native_max_value(self) -> float:
        return self._range()[1]

    @property
    def native_step(self) -> float:
        low, high = self._range()
        return 1.0 if high - low >= 20 else round(max(high - low, 0.01) / 100, 4)

    @property
    def native_value(self) -> float | None:
        rt = self.runtime
        if rt is None:
            return None
        if rt.manual_value is not None:
            return rt.manual_value
        value = rt.status.get("value")
        return value if value is not None else self._range()[0]

    async def async_set_native_value(self, value: float) -> None:
        rt = self.runtime
        if rt is not None:
            self.manager.set_value(rt, float(value))
            self.async_write_ha_state()
