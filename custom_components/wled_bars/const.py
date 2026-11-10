"""Constants for WLED Bars."""

DOMAIN = "wled_bars"

CONF_HOST = "host"

STATIC_URL = "/wled_bars_static"
PANEL_URL_PATH = "wled-bars"
PANEL_ELEMENT = "wled-bars-panel"

SIGNAL_SETTINGS = f"{DOMAIN}_settings"

DEFAULT_SETTINGS = {
    "enabled": True,
    "brightness": 100,
    # "json": per-LED JSON API. Coexists with normal WLED use, a few frames/sec.
    # "ddp": realtime UDP. Smooth animation, but owns the whole strip while a bar shows.
    "transport": "json",
    "segment": 0,
    "fps": 0,  # 0 = automatic (5 for json, 25 for ddp)
    "auto_power": True,
    "idle": "release",  # release (give LEDs back to WLED) | black
    "night": {
        "mode": "off",  # off | schedule | entity
        "start": "22:00",
        "end": "07:00",
        "entity": "",
        "level": 20,
    },
}

SERVICE_START_TIMER = "start_timer"
SERVICE_STOP_TIMER = "stop_timer"
SERVICE_SET_VALUE = "set_value"
SERVICE_SET_ENABLED = "set_enabled"
