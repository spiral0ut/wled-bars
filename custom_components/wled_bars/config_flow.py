"""Config flow: one entry per WLED device."""
from __future__ import annotations

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import CONF_HOST, DOMAIN
from .wled import WledClient, WledError


class WledBarsConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._host: str | None = None
        self._name = "WLED"

    async def _probe(self, host: str) -> dict:
        return await WledClient(async_get_clientsession(self.hass), host).info()

    async def async_step_user(self, user_input=None):
        errors = {}
        if user_input is not None:
            host = user_input[CONF_HOST].strip().removeprefix("http://").rstrip("/")
            try:
                info = await self._probe(host)
            except WledError:
                errors["base"] = "cannot_connect"
            else:
                await self.async_set_unique_id(str(info.get("mac") or host).lower())
                self._abort_if_unique_id_configured(updates={CONF_HOST: host})
                return self.async_create_entry(
                    title=info.get("name") or host, data={CONF_HOST: host}
                )
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_HOST): str}),
            errors=errors,
        )

    async def async_step_reconfigure(self, user_input=None):
        """Point an existing strip at a new address, keeping its bars."""
        entry = self.hass.config_entries.async_get_entry(self.context["entry_id"])
        errors = {}
        if user_input is not None:
            host = user_input[CONF_HOST].strip().removeprefix("http://").rstrip("/")
            try:
                info = await self._probe(host)
            except WledError:
                errors["base"] = "cannot_connect"
            else:
                found = str(info.get("mac") or host).lower()
                # entries made from a bare address have no MAC to compare with
                known_mac = entry.unique_id and entry.unique_id != entry.data[CONF_HOST].lower()
                if known_mac and info.get("mac") and found != entry.unique_id:
                    errors["base"] = "wrong_device"
                else:
                    self.hass.config_entries.async_update_entry(
                        entry, data={**entry.data, CONF_HOST: host}
                    )
                    await self.hass.config_entries.async_reload(entry.entry_id)
                    return self.async_abort(reason="reconfigure_successful")
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=vol.Schema({vol.Required(CONF_HOST, default=entry.data[CONF_HOST]): str}),
            description_placeholders={"name": entry.title},
            errors=errors,
        )

    async def async_step_zeroconf(self, discovery_info):
        host = discovery_info.host
        try:
            info = await self._probe(host)
        except WledError:
            return self.async_abort(reason="cannot_connect")
        await self.async_set_unique_id(str(info.get("mac") or host).lower())
        self._abort_if_unique_id_configured(updates={CONF_HOST: host})
        self._host = host
        self._name = info.get("name") or host
        self.context["title_placeholders"] = {"name": self._name}
        return await self.async_step_confirm()

    async def async_step_confirm(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title=self._name, data={CONF_HOST: self._host})
        return self.async_show_form(
            step_id="confirm", description_placeholders={"name": self._name}
        )
