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


@callback
def async_register_websocket(hass: HomeAssistant) -> None:
    for command in (ws_devices, ws_get, ws_save, ws_preview, ws_identify, ws_subscribe):
        websocket_api.async_register_command(hass, command)
