"""GPT-Live-1 voice layer: a full-duplex audio bridge between the phone and OpenAI.

The phone streams mic audio to /live/ws (main.py) and plays back whatever comes down
it. This module owns the OpenAI side of that socket and the "client delegation" glue:
when GPT-Live-1 decides it needs backend reasoning (the user asked for something that
needs a phone-native tool, or just a real answer), it fires session.delegation.created.
At that point we drive the SAME LangGraph workflow (graph.start_thread/resume_thread)
the plain text /workflow/* routes use, so a spoken command goes through identical tool
proposal / confirmation / execution logic as a typed one - see graph.py's module
docstring for why tool execution has to happen on the phone, never here.

Two delegation modes exist; "client" (used here) is the only fit, because our tools
can only run on the phone (PackageManager, ContactsContract, etc.) - OpenAI's managed
"Responses" delegation would need the backend to execute tool calls synchronously
itself, which we can't do.

Audio event names/format (EVENT_AUDIO_APPEND, EVENT_AUDIO_DELTA, 24kHz PCM16) are
confirmed from https://developers.openai.com/api/docs/guides/realtime-conversations
(2026-09-12). Delegation event names (EVENT_DELEGATION_CREATED, EVENT_COMMENTARY_APPEND,
etc.) are confirmed from https://developers.openai.com/api/docs/guides/live-delegation.

WARNING - still unconfirmed against live docs (see the "GPT-Live-1 as the voice layer"
plan's Risks section): the exact wss:// connection URL (LIVE_WS_URL) for a GPT-Live-1
session specifically, since it wasn't surfaced by either fetch above. If connecting
fails, that's the constant to check first.
"""

import asyncio
import base64
import json
import logging
import os
from typing import Any, Optional

import websockets
from fastapi import WebSocket

from app.graph import WorkflowResponse, resume_thread, start_thread

logger = logging.getLogger("aios.live_voice")

LIVE_VOICE_MODEL = "gpt-live-1"
LIVE_WS_URL = "wss://api.openai.com/v1/live/sessions"
DEFAULT_VOICE = "alloy"
# Seconds to wait for the phone to execute a proposed tool (including any tap-to-confirm
# the user needs to make - see tools/types.ts:confirmBeforeExecute) before giving up on
# that turn. Generous: a human tap can take a while, and there's no point timing out fast.
PENDING_RESUME_TIMEOUT_SECONDS = 180

LIVE_VOICE_INSTRUCTIONS = (
    "You are Casper, a phone assistant having a live spoken conversation. For ANYTHING "
    "that needs a real device or account action (opening apps, sending messages, reading "
    "contacts/calendar/email, changing settings, searching, etc.) or that needs real "
    "thought rather than small talk, delegate immediately to your backend - don't try to "
    "answer or act on it yourself. For plain conversation (greetings, clarifying what the "
    "user meant, acknowledging you're working on something), respond directly and briefly. "
    "Keep your own spoken replies short and natural."
)

# --- Event type names -------------------------------------------------------
EVENT_SESSION_UPDATE = "session.update"
EVENT_AUDIO_APPEND = "input_audio_buffer.append"  # phone mic -> OpenAI
EVENT_AUDIO_DELTA = "response.output_audio.delta"  # OpenAI speech -> phone
# Confirmed against https://developers.openai.com/api/docs/guides/realtime-conversations
# (2026-09-12): input_audio_buffer.append/audio and response.output_audio.delta/delta,
# both base64 audio/pcm at 24kHz. SAMPLE_RATE in LiveVoiceModule.kt matches.
EVENT_DELEGATION_CREATED = "session.delegation.created"
EVENT_INPUT_TRANSCRIPT_DELTA = "session.input_transcript.delta"
EVENT_COMMENTARY_APPEND = "session.commentary.append"
EVENT_THINKING_APPEND = "session.thinking.append"

# thread_id -> (Future[WorkflowResponse], event loop that owns the Future). Populated
# while a LiveVoiceBridge is waiting on a phone-executed tool result, resolved by
# main.py's /workflow/{thread_id}/resume route - the SAME route the plain text flow
# calls. That route runs in a worker thread (sync def), hence call_soon_threadsafe.
_pending_resumes: dict[str, tuple["asyncio.Future[WorkflowResponse]", asyncio.AbstractEventLoop]] = {}


def resolve_pending_resume(thread_id: str, response: WorkflowResponse) -> None:
    entry = _pending_resumes.get(thread_id)
    if entry is None:
        return  # No live bridge waiting on this thread - the plain text flow, as usual.
    future, loop = entry
    if not future.done():
        loop.call_soon_threadsafe(future.set_result, response)


class LiveVoiceBridge:
    """One phone <-> OpenAI live session. Create per WebSocket connection, call run()."""

    def __init__(self, phone_ws: WebSocket) -> None:
        self.phone_ws = phone_ws
        self.openai_ws: Optional[Any] = None
        self.thread_id: Optional[str] = None
        self.tools: list[dict[str, Any]] = []
        self.installed_apps: Optional[list[dict[str, Any]]] = None
        self.device_id = "local"
        self._transcript_buffer = ""
        # Serializes delegation handling per bridge: a thread is only ever paused on one
        # interrupt at a time, so a second spoken turn arriving mid tool-round-trip must
        # wait its turn rather than racing resume_thread calls for the same thread_id.
        self._workflow_lock = asyncio.Lock()
        self._loop = asyncio.get_event_loop()

    async def run(self) -> None:
        init_raw = await self.phone_ws.receive_text()
        init = json.loads(init_raw)
        self.tools = init.get("tools", [])
        self.installed_apps = init.get("installedApps")
        self.device_id = init.get("deviceId", "local")

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not set. Add it to backend/.env.")

        self.openai_ws = await websockets.connect(
            LIVE_WS_URL, additional_headers={"Authorization": f"Bearer {api_key}"}
        )
        await self._send_openai_event(
            EVENT_SESSION_UPDATE,
            session={
                "model": LIVE_VOICE_MODEL,
                "voice": DEFAULT_VOICE,
                "delegation": {"type": "client"},
                "instructions": LIVE_VOICE_INSTRUCTIONS,
            },
        )
        await asyncio.gather(self._pump_phone_audio(), self._pump_openai_events())

    async def close(self) -> None:
        if self.openai_ws is not None:
            await self.openai_ws.close()
        if self.thread_id is not None:
            entry = _pending_resumes.pop(self.thread_id, None)
            if entry is not None and not entry[0].done():
                entry[0].cancel()

    # --- phone -> OpenAI ------------------------------------------------------

    async def _pump_phone_audio(self) -> None:
        while True:
            chunk = await self.phone_ws.receive_bytes()
            await self._send_openai_event(EVENT_AUDIO_APPEND, audio=base64.b64encode(chunk).decode("ascii"))

    # --- OpenAI -> phone -------------------------------------------------------

    async def _pump_openai_events(self) -> None:
        async for raw in self.openai_ws:
            event = json.loads(raw)
            event_type = event.get("type")

            if event_type == EVENT_AUDIO_DELTA:
                audio_bytes = base64.b64decode(event.get("delta") or "")
                if audio_bytes:
                    await self.phone_ws.send_bytes(audio_bytes)
            elif event_type == EVENT_INPUT_TRANSCRIPT_DELTA:
                self._transcript_buffer += event.get("delta", "")
            elif event_type == EVENT_DELEGATION_CREATED:
                delegation_id = event.get("delegation", {}).get("id")
                # Don't await inline - handling a delegation can involve a slow phone
                # round trip (including a human tap-to-confirm), and this loop must keep
                # consuming audio/transcript events from OpenAI the whole time.
                asyncio.create_task(self._handle_delegation(delegation_id))
            else:
                logger.debug("live_voice_unhandled_event type=%s", event_type)

    # --- Delegation / LangGraph bridge -----------------------------------------

    async def _handle_delegation(self, delegation_id: Optional[str]) -> None:
        async with self._workflow_lock:
            command_text = self._transcript_buffer.strip()
            self._transcript_buffer = ""
            if not command_text:
                return
            await self._send_control({"type": "caption", "speaker": "user", "text": command_text})
            try:
                if self.thread_id is None:
                    response = await asyncio.to_thread(
                        start_thread, command_text, self.tools, self.installed_apps, self.device_id
                    )
                    self.thread_id = response.threadId
                else:
                    response = await asyncio.to_thread(resume_thread, self.thread_id, command_text)
                await self._handle_response(delegation_id, response)
            except Exception:
                logger.exception("live_voice_delegation_failed thread=%s", self.thread_id)
                await self._speak(delegation_id, "Sorry, something went wrong on my end.")

    async def _handle_response(self, delegation_id: Optional[str], response: WorkflowResponse) -> None:
        if response.status == "awaiting_confirmation":
            self.thread_id = response.threadId
            future: "asyncio.Future[WorkflowResponse]" = self._loop.create_future()
            _pending_resumes[response.threadId] = (future, self._loop)
            await self._send_control(
                {"type": "proposed_tool", "threadId": response.threadId, "proposedTool": response.proposedTool}
            )
            try:
                resumed = await asyncio.wait_for(future, timeout=PENDING_RESUME_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                await self._speak(delegation_id, "Sorry, that took too long - let's try something else.")
                return
            finally:
                _pending_resumes.pop(response.threadId, None)
            await self._handle_response(delegation_id, resumed)
        elif response.status == "awaiting_reply":
            await self._speak(delegation_id, response.message)
        else:  # "done" - only hit at graph.py's MAX_STEPS safety cap
            await self._speak(delegation_id, response.finalMessage)

    async def _speak(self, delegation_id: Optional[str], text: Optional[str]) -> None:
        if not text:
            return
        # Client-delegation appends are capped at ~500 tokens each (per the delegation
        # guide) - well above any realistic spoken reply, but truncate defensively.
        await self._send_openai_event(EVENT_COMMENTARY_APPEND, delegation_id=delegation_id, content=text[:1900])
        await self._send_control({"type": "caption", "speaker": "assistant", "text": text})

    # --- Wire helpers ------------------------------------------------------------

    async def _send_openai_event(self, event_type: str, **fields: Any) -> None:
        await self.openai_ws.send(json.dumps({"type": event_type, **fields}))

    async def _send_control(self, payload: dict[str, Any]) -> None:
        await self.phone_ws.send_text(json.dumps(payload))
