import uuid
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from langgraph.types import Command
from pydantic import BaseModel

load_dotenv()

from app.graph import MAX_STEPS, compiled_graph  # noqa: E402  (must load .env first)
from app.search import search_images, search_web  # noqa: E402
from app.transcribe import transcribe_audio  # noqa: E402
from app.google_oauth import exchange as exchange_google_oauth, start_url as google_start_url, status as google_status  # noqa: E402
from app.google_api import calendar_upcoming, drive_search, gmail_search, gmail_read, drive_read, gmail_create_draft, calendar_create_event  # noqa: E402
from app.expenses import monthly_finances  # noqa: E402
from app.receipt import extract_receipt  # noqa: E402
from app.sms_finances import sms_finances  # noqa: E402
from app.procedural_memory import save_procedure, search_procedures  # noqa: E402

app = FastAPI(title="AI-OS Orchestrator Backend")

# Local dev only: this backend is reached from the Android emulator (10.0.2.2) or a
# device on the same LAN, never the public internet. Wide-open CORS is fine here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/connect/google/start")
def connect_google_start() -> RedirectResponse:
    try:
        return RedirectResponse(google_start_url())
    except RuntimeError as error:
        raise HTTPException(503, str(error))


@app.get("/connect/google/callback")
async def connect_google_callback(code: str, state: str) -> dict:
    try:
        await exchange_google_oauth(code, state)
        return {"connected": True, "message": "Google services connected. You may close this window."}
    except (RuntimeError, ValueError, httpx.HTTPError) as error:
        raise HTTPException(400, str(error))


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

class FinanceAnalysisRequest(BaseModel):
    finances: dict[str, Any]

class SmsFinanceRequest(BaseModel):
    year: int
    month: int
    messages: list[dict[str, Any]]


@app.post("/expenses/month")
async def expenses_month(req: MonthlyFinanceRequest) -> dict[str, Any]:
    try: return await monthly_finances(req.year, req.month)
    except (RuntimeError, httpx.HTTPError, ValueError) as error: raise HTTPException(400, str(error))


@app.post("/expenses/analyze")
def expenses_analyze(req: FinanceAnalysisRequest) -> dict[str, str]:
    import os, json
    from openai import OpenAI
    if not os.getenv("OPENAI_API_KEY"): raise HTTPException(503, "OPENAI_API_KEY is not configured.")
    response = OpenAI(api_key=os.environ["OPENAI_API_KEY"]).chat.completions.create(model="gpt-4o-mini", messages=[{"role": "system", "content": "Analyze this personal finance summary concisely. Mention category concentration, revenue vs expenses, anomalies, and one practical next step. Do not give regulated financial advice."}, {"role": "user", "content": json.dumps(req.finances)}])
    return {"analysis": response.choices[0].message.content or "No analysis returned."}


@app.post("/expenses/receipt")
async def expenses_receipt(file: UploadFile = File(...)) -> dict[str, Any]:
    try: return extract_receipt(await file.read(), file.content_type or "image/jpeg")
    except RuntimeError as error: raise HTTPException(500, str(error))


@app.post("/expenses/sms")
def expenses_sms(req: SmsFinanceRequest) -> dict[str, Any]:
    return sms_finances(req.messages, req.year, req.month)


class StartWorkflowRequest(BaseModel):
    command: str
    tools: list[dict[str, Any]]
    installedApps: Optional[list[dict[str, Any]]] = None


class ResumeWorkflowRequest(BaseModel):
    result: Any = None


class WorkflowResponse(BaseModel):
    threadId: str
    status: str  # "awaiting_confirmation" | "awaiting_reply" | "done"
    proposedTool: Optional[dict[str, Any]] = None
    message: Optional[str] = None
    finalMessage: Optional[str] = None
    history: Optional[list[dict[str, Any]]] = None


def _format_response(thread_id: str) -> WorkflowResponse:
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = compiled_graph.get_state(config)

    if snapshot.next:
        task = snapshot.tasks[0]
        if not task.interrupts:
            raise HTTPException(500, "Graph paused with no interrupt payload.")
        interrupt_value = task.interrupts[0].value
        kind = interrupt_value.get("kind")

        if kind == "tool_call":
            return WorkflowResponse(
                threadId=thread_id,
                status="awaiting_confirmation",
                proposedTool=interrupt_value["proposedTool"],
                history=snapshot.values.get("history", []),
            )
        if kind == "awaiting_reply":
            return WorkflowResponse(
                threadId=thread_id,
                status="awaiting_reply",
                message=interrupt_value["message"],
                history=snapshot.values.get("history", []),
            )
        raise HTTPException(500, f"Unknown interrupt kind: {kind!r}")

    # Graph truly ended - only happens by hitting MAX_STEPS (safety cap).
    values = snapshot.values
    history = values.get("history", [])
    intent = next(
        (msg.get("content", "") for msg in values.get("messages", []) if msg.get("role") == "user"),
        "",
    )
    if history:
        save_procedure(intent, history, success=True)
    last_assistant_text = next(
        (
            msg["content"]
            for msg in reversed(values.get("messages", []))
            if msg.get("role") == "assistant" and msg.get("content")
        ),
        None,
    )
    final_message = last_assistant_text or f"Stopped after {values.get('stepCount', 0)} steps."

    return WorkflowResponse(
        threadId=thread_id,
        status="done",
        finalMessage=final_message,
        history=history,
    )


@app.post("/workflow/start", response_model=WorkflowResponse)
def start_workflow(req: StartWorkflowRequest) -> WorkflowResponse:
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    initial_state = {
        "tools": req.tools,
        "installedApps": req.installedApps,
        "messages": [{"role": "user", "content": req.command}],
        "history": [],
        "stepCount": 0,
        "proceduralMemory": search_procedures(req.command),
    }
    compiled_graph.invoke(initial_state, config=config)
    return _format_response(thread_id)


@app.post("/workflow/{thread_id}/resume", response_model=WorkflowResponse)
def resume_workflow(thread_id: str, req: ResumeWorkflowRequest) -> WorkflowResponse:
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = compiled_graph.get_state(config)
    if not snapshot.next:
        raise HTTPException(404, f"No workflow awaiting resume for thread {thread_id}.")

    compiled_graph.invoke(Command(resume=req.result), config=config)
    return _format_response(thread_id)


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
