"""WLED Bars: progress bars and status gauges on WLED strips."""
from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, panel_custom
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.loader import async_get_integration

from .const import (
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_URL_PATH,
    SERVICE_SET_ENABLED,
    SERVICE_SET_VALUE,
    SERVICE_START_TIMER,
    SERVICE_STOP_TIMER,
    STATIC_URL,
)
from .manager import BarsManager
from .websocket import async_register_websocket

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SWITCH, Platform.NUMBER]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
_SHARED = f"{DOMAIN}_shared"


def managers(hass: HomeAssistant) -> dict[str, BarsManager]:
    return hass.data.setdefault(DOMAIN, {})


def _find(hass: HomeAssistant, key: str):
    for mgr in managers(hass).values():
        rt = mgr.find_bar(key)
        if rt is not None:
            return mgr, rt
    raise ServiceValidationError(f"No WLED bar named or with id '{key}'")


async def _async_setup_shared(hass: HomeAssistant) -> None:
    """One-time setup: frontend files, sidebar panel, websocket API, services."""
    if hass.data.get(_SHARED):
        return
    hass.data[_SHARED] = True

    version = (await async_get_integration(hass, DOMAIN)).version or "0"
    frontend_dir = str(Path(__file__).parent / "frontend")
    if not hass.data.get(f"{_SHARED}_static"):  # survives removing the last device
        hass.data[f"{_SHARED}_static"] = True
        try:
            from homeassistant.components.http import StaticPathConfig

            await hass.http.async_register_static_paths(
                [StaticPathConfig(STATIC_URL, frontend_dir, False)]
            )
        except ImportError:  # Home Assistant < 2024.7
            hass.http.register_static_path(STATIC_URL, frontend_dir, False)

    module_url = f"{STATIC_URL}/wled-bars.js?v={version}"
    add_extra_js_url(hass, module_url)  # makes the dashboard card available
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_ELEMENT,
        sidebar_title="WLED Bars",
        sidebar_icon="mdi:led-strip-variant",
        module_url=module_url,
        embed_iframe=False,
        require_admin=True,
    )
    async_register_websocket(hass)

    async def start_timer(call: ServiceCall) -> None:
        mgr, rt = _find(hass, call.data["bar"])
        mgr.start_timer(rt, call.data["duration"].total_seconds())

    async def stop_timer(call: ServiceCall) -> None:
        mgr, rt = _find(hass, call.data["bar"])
        mgr.stop_timer(rt)

    async def set_value(call: ServiceCall) -> None:
        mgr, rt = _find(hass, call.data["bar"])
        mgr.set_value(rt, call.data["value"])

    async def set_enabled(call: ServiceCall) -> None:
        mgr, rt = _find(hass, call.data["bar"])
        bars = [dict(b) for b in mgr.bars]
        for bar in bars:
            if bar["id"] == rt.bar["id"]:
                bar["enabled"] = call.data["enabled"]
        await mgr.async_save(bars, None)

    bar = {vol.Required("bar"): cv.string}
    hass.services.async_register(
        DOMAIN,
        SERVICE_START_TIMER,
        start_timer,
        vol.Schema({**bar, vol.Required("duration"): cv.positive_time_period}),
    )
    hass.services.async_register(DOMAIN, SERVICE_STOP_TIMER, stop_timer, vol.Schema(bar))
    hass.services.async_register(
        DOMAIN, SERVICE_SET_VALUE, set_value, vol.Schema({**bar, vol.Required("value"): vol.Coerce(float)})
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SET_ENABLED, set_enabled, vol.Schema({**bar, vol.Required("enabled"): cv.boolean})
    )


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    await _async_setup_shared(hass)
    mgr = BarsManager(hass, entry)
    await mgr.async_start()
    managers(hass)[entry.entry_id] = mgr
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        mgr = managers(hass).pop(entry.entry_id, None)
        if mgr:
            await mgr.async_stop()
    return unloaded


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    from homeassistant.helpers.storage import Store

    await Store(hass, 1, f"{DOMAIN}.{entry.entry_id}").async_remove()
    if not hass.config_entries.async_entries(DOMAIN) and hass.data.pop(_SHARED, None):
        frontend.async_remove_panel(hass, PANEL_URL_PATH)
        for service in (SERVICE_START_TIMER, SERVICE_STOP_TIMER, SERVICE_SET_VALUE, SERVICE_SET_ENABLED):
            hass.services.async_remove(DOMAIN, service)
