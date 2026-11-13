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
    SERVICE_FLASH,
    SERVICE_SET_ENABLED,
    SERVICE_SET_VALUE,
    SERVICE_START_TIMER,
    SERVICE_STOP_TIMER,
    STATIC_URL,
)
from . import engine
from .manager import FLASH_EFFECTS, BarLookupError, BarsManager, resolve_bar
from .websocket import async_register_websocket

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SWITCH, Platform.NUMBER, Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
_SHARED = f"{DOMAIN}_shared"


def managers(hass: HomeAssistant) -> dict[str, BarsManager]:
    return hass.data.setdefault(DOMAIN, {})


def _find(hass: HomeAssistant, data):
    """The bar a service call means; `device` narrows it when names repeat."""
    try:
        return resolve_bar(list(managers(hass).values()), data["bar"], data.get("device"))
    except BarLookupError as err:
        raise ServiceValidationError(str(err)) from err


async def _async_setup_shared(hass: HomeAssistant) -> None:
    """One-time setup: frontend files, sidebar panel, websocket API, services."""
    if hass.data.get(_SHARED):
        return
    hass.data[_SHARED] = True

    version = str((await async_get_integration(hass, DOMAIN)).version or "0")
    hass.data[f"{DOMAIN}_version"] = version  # lets a browser notice it is running an older copy
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
        mgr, rt = _find(hass, call.data)
        mgr.start_timer(rt, call.data["duration"].total_seconds())

    async def stop_timer(call: ServiceCall) -> None:
        mgr, rt = _find(hass, call.data)
        mgr.stop_timer(rt)

    async def set_value(call: ServiceCall) -> None:
        mgr, rt = _find(hass, call.data)
        mgr.set_value(rt, call.data["value"])

    async def set_enabled(call: ServiceCall) -> None:
        mgr, rt = _find(hass, call.data)
        bars = [dict(b) for b in mgr.bars]
        for bar in bars:
            if bar["id"] == rt.bar["id"]:
                bar["enabled"] = call.data["enabled"]
        await mgr.async_save(bars, None)

    async def flash(call: ServiceCall) -> None:
        data = call.data
        color = data.get("color", "#ff0000")
        if not isinstance(color, str):
            color = "#" + "".join(f"{max(0, min(255, int(c))):02x}" for c in list(color)[:3])
        seconds = float(data.get("duration", 5))
        effect = data.get("effect", "flash")
        if data.get("bar"):
            # just this bar's LEDs
            mgr, rt = _find(hass, data)
            targets = [(mgr, engine.bar_leds(rt.bar))]
        else:
            wanted = str(data.get("device") or "").strip().lower()
            mgrs = [m for m in managers(hass).values() if not wanted or wanted in m.keys()]
            if not mgrs:
                raise ServiceValidationError(f"No WLED Bars device named '{data.get('device')}'")
            leds = None
            if "start" in data or "end" in data:
                lo, hi = sorted((int(data.get("start", 0)), int(data.get("end", data.get("start", 0)))))
                leds = list(range(lo, hi + 1))
            targets = [(m, leds) for m in mgrs]
        for mgr, leds in targets:
            mgr.flash(leds, color, effect, seconds)

    hass.services.async_register(
        DOMAIN,
        SERVICE_FLASH,
        flash,
        vol.Schema(
            {
                vol.Optional("bar"): cv.string,
                vol.Optional("device"): cv.string,
                vol.Optional("color"): vol.Any(cv.string, [vol.Coerce(int)]),
                vol.Optional("effect"): vol.In(FLASH_EFFECTS),
                vol.Optional("duration"): vol.All(vol.Coerce(float), vol.Range(min=0.5, max=120)),
                vol.Optional("start"): vol.All(vol.Coerce(int), vol.Range(min=0)),
                vol.Optional("end"): vol.All(vol.Coerce(int), vol.Range(min=0)),
            }
        ),
    )

    bar = {vol.Required("bar"): cv.string, vol.Optional("device"): cv.string}
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
        for service in (SERVICE_START_TIMER, SERVICE_STOP_TIMER, SERVICE_SET_VALUE, SERVICE_SET_ENABLED, SERVICE_FLASH):
            hass.services.async_remove(DOMAIN, service)
