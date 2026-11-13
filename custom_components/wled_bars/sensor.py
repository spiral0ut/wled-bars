"""Sensors: how full each bar is, and what a strip is showing right now."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.const import PERCENTAGE
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import DOMAIN, SIGNAL_STATUS
from .entity_base import BarEntity, BarsEntity, sync_bar_entities
from .manager import showing_text


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities([StripShowing(hass.data[DOMAIN][entry.entry_id])])
    sync_bar_entities(hass, entry, async_add_entities, BarFill)


class StripShowing(BarsEntity, SensorEntity):
    """What is on the strip right now, for other displays.

    The state is one compact line (name|first LED|last LED|percent|colour;…)
    that an ESPHome text sensor can read; the attributes hold the same bars
    as a list for dashboards and templates.
    """

    _attr_name = "Showing"
    _attr_icon = "mdi:led-strip-variant"

    def __init__(self, manager) -> None:
        super().__init__(manager, "showing")

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, f"{SIGNAL_STATUS}_{self.manager.entry.entry_id}", self._changed
            )
        )

    @property
    def native_value(self) -> str:
        return showing_text(self.manager.showing())

    @property
    def extra_state_attributes(self) -> dict:
        rows = self.manager.showing()
        return {"count": len(rows), "led_count": self.manager.led_count, "bars": rows}


class BarFill(BarEntity, SensorEntity):
    """Fill of a bar in whole percent; unknown while it has nothing to show."""

    suffix = "fill"
    _attr_icon = "mdi:percent-outline"
    _attr_native_unit_of_measurement = PERCENTAGE
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_suggested_display_precision = 0

    def __init__(self, manager, bar_id: str) -> None:
        super().__init__(manager, bar_id, "fill")

    @property
    def native_value(self) -> int | None:
        rt = self.runtime
        if rt is None or rt.status.get("state") != "active":
            return None
        return round(rt.status.get("percent") or 0.0)

    @property
    def extra_state_attributes(self) -> dict:
        rt = self.runtime
        status = rt.status if rt else {}
        bar = rt.bar if rt else {}
        showing = bool(status.get("visible"))
        return {
            "showing": showing,
            "status": status.get("state"),
            "value": status.get("value"),
            "text": status.get("text"),
            "color": f"#{status['color']}" if showing and status.get("color") else None,
            "first_led": bar.get("start"),
            "last_led": bar.get("end"),
        }
