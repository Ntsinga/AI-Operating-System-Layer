import logging
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from app.graph import MAX_STEPS, WorkflowResponse, compiled_graph, format_response, resume_thread, start_thread  # noqa: E402  (must load .env first)
from app.search import search_images, search_web  # noqa: E402
from app.transcribe import transcribe_audio  # noqa: E402
from app.live_voice import LiveVoiceBridge, resolve_pending_resume  # noqa: E402
from app.google_oauth import exchange as exchange_google_oauth, start_url as google_start_url, status as google_status  # noqa: E402
from app.google_api import calendar_upcoming, drive_search, gmail_search, gmail_read, drive_read, gmail_create_draft, calendar_create_event  # noqa: E402
from app.expenses import monthly_finances  # noqa: E402
from app.receipt import extract_receipt  # noqa: E402
from app.sms_finances import sms_finances  # noqa: E402
from app.subscriptions import detect_recurring_charges  # noqa: E402
from app.replay_recovery import resolve_replay_recovery  # noqa: E402
from app.procedural_memory import approve_procedure, correct_step_and_save_version, delete_procedure, list_procedures, save_procedure, search_procedures  # noqa: E402
from app.learning import append_action, append_actions, complete_session, start_session  # noqa: E402
from app.debug_events import list_events, record_events  # noqa: E402
from app.boards import ask_board, create_board, delete_board, get_board, list_boards, save_board  # noqa: E402

app = FastAPI(title="AI-OS Orchestrator Backend")
logger = logging.getLogger("aios.api")

# Local dev only: this backend is reached from the Android emulator (10.0.2.2) or a
# device on the same LAN, never the public internet. Wide-open CORS is fine here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class LearningSessionRequest(BaseModel):
    intent: str
    appPackage: Optional[str] = None


class LearningActionRequest(BaseModel):
    action: dict[str, Any]

class LearningActionsBatchRequest(BaseModel):
    actions: list[dict[str, Any]]


class LearningActionsBatchRequest(BaseModel):
    actions: list[dict[str, Any]]


class DebugEventsRequest(BaseModel):
    events: list[dict[str, Any]]


@app.post("/learning/sessions")
def learning_start(req: LearningSessionRequest) -> dict[str, Any]:
    return start_session(req.intent, req.appPackage)


@app.post("/learning/sessions/{session_id}/actions")
def learning_action(session_id: str, req: LearningActionRequest) -> dict[str, Any]:
    try:
        return append_action(session_id, req.action)
    except KeyError as error:
        raise HTTPException(404, str(error))
    except ValueError as error:
        raise HTTPException(409, str(error))

@app.post("/learning/sessions/{session_id}/actions/batch")
def learning_actions_batch(session_id: str, req: LearningActionsBatchRequest) -> dict[str, Any]:
    try:
        return append_actions(session_id, req.actions[:500])
    except KeyError as error:
        raise HTTPException(404, str(error))
    except ValueError as error:
        raise HTTPException(409, str(error))


@app.post("/learning/sessions/{session_id}/actions/batch")
def learning_actions_batch(session_id: str, req: LearningActionsBatchRequest) -> dict[str, Any]:
    try:
        return append_actions(session_id, req.actions[:500])
    except KeyError as error:
        raise HTTPException(404, str(error))
    except ValueError as error:
        raise HTTPException(409, str(error))


@app.post("/learning/sessions/{session_id}/complete")
def learning_complete(session_id: str) -> dict[str, Any]:
    try:
        return complete_session(session_id)
    except KeyError as error:
        raise HTTPException(404, str(error))
    except ValueError as error:
        raise HTTPException(409, str(error))


@app.post("/debug/events")
def debug_events_create(req: DebugEventsRequest) -> dict[str, Any]:
    return record_events(req.events)


@app.get("/debug/events")
def debug_events_list(traceId: Optional[str] = None, sessionId: Optional[str] = None, procedureId: Optional[int] = None, limit: int = 100) -> list[dict[str, Any]]:
    return list_events(trace_id=traceId, session_id=sessionId, procedure_id=procedureId, limit=limit)


class BoardCreateRequest(BaseModel):
    title: Optional[str] = None
    kind: Optional[str] = None


class BoardSaveRequest(BaseModel):
    title: Optional[str] = None
    scene: Optional[Any] = None
    events: Optional[Any] = None
    thumb: Optional[str] = None


class BoardAskRequest(BaseModel):
    question: str
    snapshot: str  # PNG data-URI of the current canvas
    selection: Optional[dict[str, Any]] = None


@app.post("/boards")
def boards_create(req: BoardCreateRequest) -> dict[str, Any]:
    return create_board(req.title, req.kind)


@app.get("/boards")
def boards_list() -> list[dict[str, Any]]:
    return list_boards()


@app.get("/boards/{board_id}")
def boards_get(board_id: str) -> dict[str, Any]:
    try:
        return get_board(board_id)
    except KeyError as error:
        raise HTTPException(404, str(error))


@app.put("/boards/{board_id}")
def boards_save(board_id: str, req: BoardSaveRequest) -> dict[str, Any]:
    try:
        return save_board(board_id, title=req.title, scene=req.scene, events=req.events, thumb=req.thumb)
    except KeyError as error:
        raise HTTPException(404, str(error))
    except ValueError as error:
        raise HTTPException(413, str(error))


@app.delete("/boards/{board_id}")
def boards_delete(board_id: str) -> dict[str, Any]:
    try:
        return delete_board(board_id)
    except KeyError as error:
        raise HTTPException(404, str(error))


@app.post("/boards/{board_id}/ask")
def boards_ask(board_id: str, req: BoardAskRequest) -> dict[str, Any]:
    try:
        return ask_board(board_id, req.question, req.snapshot, req.selection)
    except ValueError as error:
        raise HTTPException(400, str(error))
    except Exception as error:  # LLMUnavailableError / LLMError - no capable provider configured
        logger.warning("boards_ask_failed board=%s error=%s", board_id, error)
        raise HTTPException(503, "No vision-capable AI provider is available to answer right now.")


@app.get("/connect/google/start")
def connect_google_start() -> RedirectResponse:
    try:
        return RedirectResponse(google_start_url())
    except RuntimeError as error:
        raise HTTPException(503, str(error))


def _app_redirect_page(status: str, message: str) -> HTMLResponse:
    from urllib.parse import urlencode

    target = "aios://google-connected?" + urlencode({"status": status, "message": message})
    body = (
        "Google account connected. Returning to AI-OS..."
        if status == "success"
        else f"Google connection failed: {message}"
    )
    # The `aios` scheme is registered on MainActivity (android:scheme="aios" in
    # AndroidManifest.xml) with no host restriction, so any aios://... URL brings the app back
    # to the foreground - meta-refresh covers browsers that block synchronous JS redirects to
    # custom schemes, the visible link covers ones that block both.
    html = f"""<!doctype html><html><head><meta http-equiv="refresh" content="0;url={target}">
    <meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="font-family:sans-serif;text-align:center;padding-top:48px;color:#333;">
    <p>{body}</p>
    <p><a href="{target}">Tap here if you are not returned to AI-OS automatically.</a></p>
    </body></html>"""
    return HTMLResponse(html)


@app.get("/connect/google/callback")
async def connect_google_callback(code: str, state: str) -> HTMLResponse:
    try:
        await exchange_google_oauth(code, state)
        return _app_redirect_page("success", "")
    except (RuntimeError, ValueError, httpx.HTTPError) as error:
        return _app_redirect_page("error", str(error))


@app.get("/connect/google/status")
def connect_google_status() -> dict:
    return google_status()


class GoogleSearchRequest(BaseModel):
    query: str
    maxResults: int = 10


class GmailDraftRequest(BaseModel):
    to: str
    subject: str
    body: str


class CalendarCreateRequest(BaseModel):
    title: str
    startTime: str
    endTime: str
    description: str = ""


@app.post("/connect/google/gmail/search")
async def google_gmail_search(req: GoogleSearchRequest) -> list[dict[str, Any]]:
    try: return await gmail_search(req.query, req.maxResults)
    except (RuntimeError, httpx.HTTPError) as error: raise HTTPException(400, str(error))


@app.get("/connect/google/gmail/{message_id}")
async def google_gmail_read(message_id: str) -> dict[str, Any]:
    try: return await gmail_read(message_id)
    except (RuntimeError, httpx.HTTPError) as error: raise HTTPException(400, str(error))


@app.post("/connect/google/gmail/drafts")
async def google_gmail_create_draft(req: GmailDraftRequest) -> dict[str, Any]:
    try: return await gmail_create_draft(req.to, req.subject, req.body)
    except (RuntimeError, httpx.HTTPError) as error: raise HTTPException(400, str(error))


@app.post("/connect/google/drive/search")
async def google_drive_search(req: GoogleSearchRequest) -> list[dict[str, Any]]:
    try: return await drive_search(req.query, req.maxResults)
    except (RuntimeError, httpx.HTTPError) as error: raise HTTPException(400, str(error))


@app.get("/connect/google/drive/{file_id}")
async def google_drive_read(file_id: str) -> dict[str, Any]:
    try: return await drive_read(file_id)
    except (RuntimeError, httpx.HTTPError) as error: raise HTTPException(400, str(error))


@app.get("/connect/google/calendar/upcoming")
async def google_calendar_upcoming(hours: int = 168) -> list[dict[str, Any]]:
    try: return await calendar_upcoming(hours)
    except (RuntimeError, httpx.HTTPError) as error: raise HTTPException(400, str(error))


@app.post("/connect/google/calendar/events")
async def google_calendar_create(req: CalendarCreateRequest) -> dict[str, Any]:
    try: return await calendar_create_event(req.title, req.startTime, req.endTime, req.description)
    except (RuntimeError, httpx.HTTPError) as error: raise HTTPException(400, str(error))


class MonthlyFinanceRequest(BaseModel):
    year: int
    month: int
    day: int | None = None

class FinanceAnalysisRequest(BaseModel):
    finances: dict[str, Any]

class SmsFinanceRequest(BaseModel):
    year: int
    month: int
    day: int | None = None
    allTime: bool = False
    messages: list[dict[str, Any]]

class RecurringChargesRequest(BaseModel):
    items: list[dict[str, Any]]

class ReplayRecoveryRequest(BaseModel):
    failedSelector: dict[str, Any]
    elements: list[dict[str, Any]]
    typedValue: str | None = None
    screenTitle: str | None = None
    intent: str | None = None


@app.post("/expenses/month")
async def expenses_month(req: MonthlyFinanceRequest) -> dict[str, Any]:
    try: return await monthly_finances(req.year, req.month, req.day)
    except (RuntimeError, httpx.HTTPError, ValueError) as error: raise HTTPException(400, str(error))


@app.post("/expenses/analyze")
def expenses_analyze(req: FinanceAnalysisRequest) -> dict[str, str]:
    import json
    from app import llm
    try:
        result = llm.chat(
            "analyze",
            [
                {"role": "system", "content": "Summarize this personal finance data in at most 3 short bullet points (under 12 words each): top category, revenue vs expenses, one practical next step. No headers, no preamble, no regulated financial advice."},
                {"role": "user", "content": json.dumps(req.finances)},
            ],
            max_tokens=120,
        )
    except llm.LLMUnavailableError as error: raise HTTPException(503, str(error))
    except llm.LLMError as error: raise HTTPException(502, str(error))
    return {"analysis": result.text or "No analysis returned."}


@app.post("/expenses/receipt")
async def expenses_receipt(file: UploadFile = File(...)) -> dict[str, Any]:
    try: return extract_receipt(await file.read(), file.content_type or "image/jpeg")
    except RuntimeError as error: raise HTTPException(500, str(error))


@app.post("/expenses/sms")
def expenses_sms(req: SmsFinanceRequest) -> dict[str, Any]:
    return sms_finances(req.messages, req.year, req.month, req.day, req.allTime)


@app.post("/expenses/subscriptions")
def expenses_subscriptions(req: RecurringChargesRequest) -> list[dict[str, Any]]:
    return detect_recurring_charges(req.items)


@app.post("/replay/recovery")
def replay_recovery(req: ReplayRecoveryRequest) -> dict[str, Any]:
    try:
        return resolve_replay_recovery(req.failedSelector, req.elements, req.typedValue, req.screenTitle, req.intent)
    except Exception as error:  # noqa: BLE001 - replay must always get a bounded action back, never a 500 mid-replay
        return {"action": "abort", "elementIndex": None, "reason": f"recovery request failed: {error}"}


class CorrectStepRequest(BaseModel):
    stepIndex: int
    correctedArguments: dict[str, Any]


@app.post("/procedures/{procedure_id}/correct-step")
def procedures_correct_step(procedure_id: int, req: CorrectStepRequest) -> dict[str, Any]:
    result = correct_step_and_save_version(procedure_id, req.stepIndex, req.correctedArguments)
    if result is None:
        raise HTTPException(404, "Procedure or step index not found.")
    return result


class StartWorkflowRequest(BaseModel):
    command: str
    tools: list[dict[str, Any]]
    installedApps: Optional[list[dict[str, Any]]] = None
    deviceId: str = "local"


class ResumeWorkflowRequest(BaseModel):
    result: Any = None


class WorkflowFinalizeRequest(BaseModel):
    outcome: str = "succeeded"


@app.get("/procedures")
def procedures_list() -> list[dict[str, Any]]:
    return list_procedures()


@app.get("/procedures/search")
def procedures_search(query: str, limit: int = 3) -> list[dict[str, Any]]:
    return search_procedures(query, max(1, min(limit, 10)))


@app.delete("/procedures/{procedure_id}")
def procedures_delete(procedure_id: int) -> dict[str, bool]:
    return {"deleted": delete_procedure(procedure_id)}


@app.post("/procedures/{procedure_id}/approve")
def procedures_approve(procedure_id: int) -> dict[str, bool]:
    return {"approved": approve_procedure(procedure_id)}


@app.post("/workflow/start", response_model=WorkflowResponse)
def start_workflow(req: StartWorkflowRequest) -> WorkflowResponse:
    response = start_thread(req.command, req.tools, req.installedApps, req.deviceId)
    logger.info(
        "workflow_started thread=%s scope=%s command_length=%d",
        response.threadId, req.deviceId[:80], len(req.command),
    )
    return response


@app.post("/workflow/{thread_id}/resume", response_model=WorkflowResponse)
def resume_workflow(thread_id: str, req: ResumeWorkflowRequest) -> WorkflowResponse:
    logger.info("workflow_resumed thread=%s result_type=%s", thread_id, type(req.result).__name__)
    response = resume_thread(thread_id, req.result)
    # If a GPT-Live-1 delegation bridge (live_voice.py) is waiting on this thread for a
    # phone-executed tool result, this HTTP resume (from the phone, after it ran the tool -
    # same call the plain text flow already makes) is exactly what it's waiting for. Wake it
    # so it can keep driving the live conversation. No-op for the plain text flow.
    resolve_pending_resume(thread_id, response)
    return response


@app.websocket("/live/ws")
async def live_voice_ws(websocket: WebSocket) -> None:
    """Full-duplex audio bridge between the phone and a GPT-Live-1 session.

    Relays mic/speaker audio in both directions and, on delegation, drives the same
    start_thread/resume_thread functions the plain /workflow/* routes use above -
    see live_voice.py for the bridge implementation.
    """
    await websocket.accept()
    bridge = LiveVoiceBridge(websocket)
    try:
        await bridge.run()
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("live_voice_ws_error")
    finally:
        await bridge.close()


@app.post("/workflow/{thread_id}/complete")
def complete_workflow(thread_id: str, req: WorkflowFinalizeRequest = WorkflowFinalizeRequest()) -> WorkflowResponse:
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = compiled_graph.get_state(config)
    if not snapshot.values:
        raise HTTPException(404, f"No workflow found for thread {thread_id}.")
    values = snapshot.values
    history = values.get("history", [])
    if history:
        intent = next((msg.get("content", "") for msg in values.get("messages", []) if msg.get("role") == "user"), "")
        outcome = req.outcome if req.outcome in {"succeeded", "failed", "cancelled", "rolled_back"} else "succeeded"
        save_procedure(intent, history, success=outcome == "succeeded", scope=values.get("procedureScope", "local"), outcome=outcome)
        logger.info("workflow_completed thread=%s outcome=%s steps=%d", thread_id, outcome, len(history))
    return format_response(thread_id)


class SearchRequest(BaseModel):
    query: str
    count: int = 5


class SearchResult(BaseModel):
    title: str
    url: str
    description: str


class ImageSearchRequest(BaseModel):
    query: str
    count: int = 12


class ImageSearchResult(BaseModel):
    title: str
    imageUrl: str
    thumbnailUrl: str
    sourceUrl: str
    width: Optional[int] = None
    height: Optional[int] = None


@app.post("/search", response_model=list[SearchResult])
def search(req: SearchRequest) -> list[dict[str, Any]]:
    try:
        return search_web(req.query, req.count)
    except RuntimeError as error:
        raise HTTPException(500, str(error))
    except httpx.HTTPStatusError as error:
        raise HTTPException(502, f"Search provider error: {error}")


@app.post("/search/images", response_model=list[ImageSearchResult])
def search_images_endpoint(req: ImageSearchRequest) -> list[dict[str, Any]]:
    try:
        return search_images(req.query, req.count)
    except RuntimeError as error:
        raise HTTPException(500, str(error))
    except httpx.HTTPStatusError as error:
        raise HTTPException(502, f"Image search provider error: {error}")


class TranscribeResponse(BaseModel):
    text: str


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(file: UploadFile = File(...)) -> TranscribeResponse:
    try:
        audio_bytes = await file.read()
        text = transcribe_audio(audio_bytes, file.filename or "recording.m4a")
        return TranscribeResponse(text=text)
    except RuntimeError as error:
        raise HTTPException(500, str(error))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "maxSteps": str(MAX_STEPS)}
