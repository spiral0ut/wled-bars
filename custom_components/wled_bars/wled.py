"""Minimal WLED client: JSON API for per-LED control and DDP for realtime."""
from __future__ import annotations

import socket
from typing import Any

import aiohttp

DDP_PORT = 4048
DDP_MAX_PIXELS = 480
JSON_MAX_ITEMS = 240  # entries of the "i" array per request (WLED JSON buffer is small)


class WledError(Exception):
    """WLED did not answer or answered with an error."""


def compress_changes(changes: dict[int, tuple[int, int, int]]) -> list[list]:
    """Turn {index: rgb} into chunks of WLED's "i" array.

    Runs of neighbouring LEDs with one colour become [start, stop, "RRGGBB"]
    (stop exclusive); single LEDs become [index, "RRGGBB"].
    """
    items: list = []
    run_start = None
    run_end = None
    run_color = None
    for idx in sorted(changes):
        color = "%02X%02X%02X" % tuple(changes[idx])
        if run_color == color and idx == run_end + 1:
            run_end = idx
            continue
        if run_color is not None:
            items.append((run_start, run_end, run_color))
        run_start = run_end = idx
        run_color = color
    if run_color is not None:
        items.append((run_start, run_end, run_color))

    chunks: list[list] = []
    current: list = []
    for start, end, color in items:
        entry = [start, color] if start == end else [start, end + 1, color]
        if current and len(current) + len(entry) > JSON_MAX_ITEMS:
            chunks.append(current)
            current = []
        current.extend(entry)
    if current:
        chunks.append(current)
    return chunks


def ddp_packets(frame: bytes) -> list[bytes]:
    """Split an RGB byte frame into DDP packets (push flag on the last one)."""
    packets = []
    step = DDP_MAX_PIXELS * 3
    total = len(frame)
    offset = 0
    seq = 1
    while offset < total or not packets:
        chunk = frame[offset : offset + step]
        last = offset + step >= total
        header = bytes(
            [
                0x41 if last else 0x40,  # version 1, push on last packet
                seq & 0x0F,
                0x0B,  # RGB, 8 bits per channel
                0x01,  # default output device
            ]
        )
        header += offset.to_bytes(4, "big") + len(chunk).to_bytes(2, "big")
        packets.append(header + chunk)
        offset += step
        seq += 1
    return packets


class WledClient:
    def __init__(self, session: aiohttp.ClientSession, host: str) -> None:
        self._session = session
        self.host = host
        self._timeout = aiohttp.ClientTimeout(total=5)
        self._sock: socket.socket | None = None

    async def _get(self, path: str) -> Any:
        try:
            async with self._session.get(
                f"http://{self.host}{path}", timeout=self._timeout
            ) as resp:
                if resp.status != 200:
                    raise WledError(f"HTTP {resp.status}")
                return await resp.json(content_type=None)
        except (aiohttp.ClientError, TimeoutError, ValueError) as err:
            raise WledError(str(err) or type(err).__name__) from err

    async def info(self) -> dict:
        return await self._get("/json/info")

    async def state(self) -> dict:
        return await self._get("/json/state")

    async def post_state(self, payload: dict) -> None:
        try:
            async with self._session.post(
                f"http://{self.host}/json/state", json=payload, timeout=self._timeout
            ) as resp:
                if resp.status != 200:
                    raise WledError(f"HTTP {resp.status}")
                await resp.read()
        except (aiohttp.ClientError, TimeoutError) as err:
            raise WledError(str(err) or type(err).__name__) from err

    async def set_pixels(
        self, segment: int, changes: dict[int, tuple[int, int, int]], power_on: bool
    ) -> None:
        """Paint individual LEDs (indices relative to the segment)."""
        chunks = compress_changes(changes)
        if not chunks and power_on:
            await self.post_state({"on": True})
        for n, chunk in enumerate(chunks):
            payload: dict = {"seg": [{"id": segment, "i": chunk}]}
            if power_on and n == 0:
                payload["on"] = True
            await self.post_state(payload)

    async def release(self, segment: int) -> None:
        """Unfreeze the segment so WLED's own effect takes the LEDs back."""
        await self.post_state({"seg": [{"id": segment, "frz": False}]})

    def send_ddp(self, frame: bytes) -> None:
        if self._sock is None:
            self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self._sock.setblocking(False)
        host = self.host.split(":")[0]
        try:
            for packet in ddp_packets(frame):
                self._sock.sendto(packet, (host, DDP_PORT))
        except OSError as err:
            raise WledError(str(err)) from err

    def close(self) -> None:
        if self._sock is not None:
            self._sock.close()
            self._sock = None
