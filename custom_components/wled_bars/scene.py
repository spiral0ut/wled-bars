"""Native Home Assistant scenes for saved strip layouts."""
from homeassistant.components.scene import Scene
from homeassistant.exceptions import HomeAssistantError

from .entity_base import BarsEntity, sync_entities


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    sync_entities(hass, entry, async_add_entities, LayoutScene,
                  lambda manager: [layout["id"] for layout in manager.settings["layouts"]])


class LayoutScene(BarsEntity, Scene):
    _attr_icon = "mdi:led-strip-variant"

    def __init__(self, manager, layout_id: str) -> None:
        super().__init__(manager, f"layout_{layout_id}")
        self.layout_id = layout_id

    @property
    def name(self) -> str:
        return next((layout["name"] for layout in self.manager.settings["layouts"]
                     if layout["id"] == self.layout_id), "Layout")

    @property
    def extra_state_attributes(self) -> dict:
        return {"wled_bars_entry": self.manager.entry.entry_id, "layout_id": self.layout_id}

    async def async_activate(self, **kwargs) -> None:
        try:
            await self.manager.async_activate_layout(self.layout_id)
        except ValueError as err:
            raise HomeAssistantError(str(err)) from err
