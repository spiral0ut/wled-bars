"""Websocket API used by the editor panel and the dashboard card."""
from __future__ import annotations

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN


def _manager(hass, connection, msg):
    mgr = hass.data.get(DOMAIN, {}).get(msg["entry_id"])
    if mgr is None:
        connection.send_error(msg["id"], "not_found", "Unknown WLED Bars device")
    return mgr


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/devices"})
@callback
def ws_devices(hass, connection, msg) -> None:
    connection.send_result(
        msg["id"], [mgr.describe() for mgr in hass.data.get(DOMAIN, {}).values()]
    )


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/get", vol.Required("entry_id"): str}
)
@callback
def ws_get(hass, connection, msg) -> None:
    mgr = _manager(hass, connection, msg)
    if mgr:
        connection.send_result(
            msg["id"], {"device": mgr.describe(), "bars": mgr.bars, "settings": mgr.settings}
        )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/save",
        vol.Required("entry_id"): str,
        vol.Optional("bars"): [dict],
        vol.Optional("settings"): dict,
    }
)
@websocket_api.async_response
async def ws_save(hass, connection, msg) -> None:
    mgr = _manager(hass, connection, msg)
    if mgr:
        await mgr.async_save(msg.get("bars"), msg.get("settings"))
        connection.send_result(msg["id"], {"bars": mgr.bars, "settings": mgr.settings})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/preview",
        vol.Required("entry_id"): str,
        vol.Optional("bar"): vol.Any(dict, None),
        vol.Optional("frac", default=0.5): vol.Coerce(float),
    }
)
@callback
def ws_preview(hass, connection, msg) -> None:
    """Show a draft bar on the real strip for a few seconds (bar=None stops)."""
    mgr = _manager(hass, connection, msg)
    if mgr:
        mgr.set_preview(msg.get("bar"), max(0.0, min(1.0, msg["frac"])))
        connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/identify",
        vol.Required("entry_id"): str,
        vol.Required("leds"): [int],
    }
)
@callback
def ws_identify(hass, connection, msg) -> None:
    mgr = _manager(hass, connection, msg)
    if mgr:
        mgr.identify(msg["leds"])
        connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/flash",
        vol.Required("entry_id"): str,
        vol.Optional("color", default="#ff0000"): str,
        vol.Optional("effect", default="flash"): str,
        vol.Optional("duration", default=3): vol.Coerce(float),
    }
)
@callback
def ws_flash(hass, connection, msg) -> None:
    """Try a notification flash from the editor."""
    mgr = _manager(hass, connection, msg)
    if mgr:
        mgr.flash(None, msg["color"], msg["effect"], msg["duration"])
        connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/control",
        vol.Required("entry_id"): str,
        vol.Optional("enabled"): bool,
        vol.Optional("brightness"): vol.All(vol.Coerce(int), vol.Range(min=1, max=100)),
        vol.Optional("bar"): str,
        vol.Optional("bar_enabled"): bool,
    }
)
@websocket_api.async_response
async def ws_control(hass, connection, msg) -> None:
    """The dashboard card's controls: the same things the switches and the brightness number do."""
    mgr = _manager(hass, connection, msg)
    if not mgr:
        return
    settings = None
    if "enabled" in msg or "brightness" in msg:
        settings = dict(mgr.settings)
        if "enabled" in msg:
            settings["enabled"] = msg["enabled"]
        if "brightness" in msg:
            settings["brightness"] = msg["brightness"]
    bars = None
    if "bar" in msg and "bar_enabled" in msg:
        bars = [dict(b) for b in mgr.bars]
        for bar in bars:
            if bar["id"] == msg["bar"]:
                bar["enabled"] = msg["bar_enabled"]
    if bars is not None or settings is not None:
        await mgr.async_save(bars, settings)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/subscribe", vol.Required("entry_id"): str}
)
@callback
def ws_subscribe(hass, connection, msg) -> None:
    """Stream the composed strip frame and per-bar status."""
    mgr = _manager(hass, connection, msg)
    if not mgr:
        return

    @callback
    def forward(payload: dict) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    connection.send_result(msg["id"])
    connection.subscriptions[msg["id"]] = mgr.add_listener(forward)


_PRESETS = f"{DOMAIN}_presets"


async def _presets(hass: HomeAssistant) -> dict:
    """Preset defaults shared by every strip: {preset key: [add-on ids]}."""
    cache = hass.data.get(_PRESETS)
    if cache is None:
        from homeassistant.helpers.storage import Store

        store = Store(hass, 1, f"{DOMAIN}.presets")
        data = await store.async_load()
        cache = hass.data[_PRESETS] = {"store": store, "data": data if isinstance(data, dict) else {}}
    return cache


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/presets_get"})
@websocket_api.async_response
async def ws_presets_get(hass, connection, msg) -> None:
    connection.send_result(msg["id"], (await _presets(hass))["data"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/presets_save", vol.Required("presets"): {str: [str]}}
)
@websocket_api.async_response
async def ws_presets_save(hass, connection, msg) -> None:
    cache = await _presets(hass)
    cache["data"] = msg["presets"]
    await cache["store"].async_save(cache["data"])
    connection.send_result(msg["id"], cache["data"])


@callback
def async_register_websocket(hass: HomeAssistant) -> None:
    for command in (
        ws_devices, ws_get, ws_save, ws_preview, ws_identify, ws_flash, ws_control, ws_subscribe,
        ws_presets_get, ws_presets_save,
    ):
        websocket_api.async_register_command(hass, command)
