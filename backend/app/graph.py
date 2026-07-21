"""LangGraph multi-step tool-calling workflow (Phase 3).

The graph itself never executes a tool - only the phone can (PackageManager,
BatteryManager, ContactsContract, etc. are native Android APIs). Each planning
step calls interrupt() to pause the graph, which resumes in one of two ways:

- The model chose a tool: pause with kind="tool_call" and hand the proposal back.
  The mobile app shows it, gets user confirmation, executes the tool locally, and
  resumes with the tool's result via Command(resume=<result>).
- The model responded with plain text (a question, a list of options, a final
  summary - these all look the same to the API): pause with kind="awaiting_reply"
  and hand the text back. The mobile app shows it and lets the user type a reply
  (e.g. "the second one"), which resumes the SAME thread as a new user turn.
  This is what makes "search, show me options, I pick one, then act on it"
  actually possible - see ERROR_LOG.md (2026-07-20, workflow stopped after
  presenting search options with no way to continue).

There is no separate "done" terminal state distinct from awaiting_reply - the
graph is always paused waiting for a tool result or the next user turn, until
MAX_STEPS is hit (safety cap) or the client simply stops calling resume
(abandons the thread, same as clicking Stop today).
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.types import interrupt
from openai import OpenAI

MAX_STEPS = 12
OPENAI_MODEL = "gpt-4o-mini"
_CONTEXT_DIR = Path(__file__).parent / "context"


def _load_os_context() -> str:
    harness = (_CONTEXT_DIR / "os_harness.md").read_text(encoding="utf-8")
    aliases = json.loads((_CONTEXT_DIR / "web_aliases.json").read_text(encoding="utf-8"))
    alias_lines = "\n".join(f"- {name}: {url}" for name, url in aliases.items())
    return f"{harness}\n\n## Known web aliases\n\n{alias_lines}"


OS_HARNESS_CONTEXT = _load_os_context()


class ToolCallRecord(TypedDict):
    toolName: str
    arguments: dict[str, Any]
    result: Any


class WorkflowState(TypedDict):
    tools: List[dict[str, Any]]
    installedApps: Optional[List[dict[str, Any]]]
    messages: List[dict[str, Any]]
    history: List[ToolCallRecord]
    stepCount: int
    proceduralMemory: List[dict[str, Any]]


def _client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set. Add it to backend/.env.")
    return OpenAI(api_key=api_key)


def _build_system_prompt(state: WorkflowState) -> str:
    parts = [
        OS_HARNESS_CONTEXT,
        "You are a phone-control planner having a multi-turn conversation with a user, with "
        "the ability to call tools. Decide the single next tool to call to make progress, or "
        "reply in plain text - to ask a clarifying question, to present options for the user "
        "to choose from (e.g. search results), or to summarize what was done. Do not call a "
        "tool you have already called with the same arguments unless the user explicitly asks "
        "to repeat it. Only call a tool that exists.",
        f"Current planner time is {datetime.now().astimezone().isoformat()}. Use this only to "
        "calculate explicit relative deadlines; ask if a timezone or deadline is ambiguous.",
    ]

    apps = state.get("installedApps")
    if apps:
        app_lines = "\n".join(f"{app['name']} -> {app['packageName']}" for app in apps)
        parts.append(
            "Apps actually installed on this device (name -> packageName), for grounding "
            "open_application and similar tools - use these exact package names, do not "
            "guess:\n" + app_lines
        )

    procedures = state.get("proceduralMemory", [])
    if procedures:
        parts.append(
            "Reusable procedures from previous successful runs. Treat them as hints, verify "
            "the current state, and adapt rather than blindly replaying them:\n"
            + json.dumps(procedures, default=str)
        )

    return "\n\n".join(parts)


def planner_node(state: WorkflowState) -> dict[str, Any]:
    client = _client()

    # Real assistant tool_calls + tool-result messages, not a prose summary in the
    # system prompt. Cheap models (gpt-4o-mini) do not reliably track "already did
    # this" from a text description - they need the actual multi-turn function-calling
    # protocol. See ERROR_LOG.md (2026-07-19, workflow stuck repeating a tool call).
    full_messages = [{"role": "system", "content": _build_system_prompt(state)}] + state["messages"]

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=full_messages,
        tools=state["tools"],
        tool_choice="auto",
    )

    choice = response.choices[0].message

    if not choice.tool_calls:
        text = choice.content or "I don't have a next step - what would you like to do?"
        user_reply = interrupt({"kind": "awaiting_reply", "message": text})
        new_messages = state["messages"] + [
            {"role": "assistant", "content": text},
            {"role": "user", "content": user_reply},
        ]
        return {"messages": new_messages, "stepCount": state["stepCount"] + 1}

    call = choice.tool_calls[0]
    try:
        arguments = json.loads(call.function.arguments or "{}")
    except json.JSONDecodeError:
        text = f"I got invalid arguments back for {call.function.name} - could you rephrase?"
        user_reply = interrupt({"kind": "awaiting_reply", "message": text})
        new_messages = state["messages"] + [
            {"role": "assistant", "content": text},
            {"role": "user", "content": user_reply},
        ]
        return {"messages": new_messages, "stepCount": state["stepCount"] + 1}

    proposed = {"toolName": call.function.name, "arguments": arguments}
    call_id = f"call_{state['stepCount']}"

    # Pause here. The value passed back via Command(resume=...) is whatever the
    # FastAPI layer sends after the phone executes (or rejects) the tool.
    tool_result = interrupt({"kind": "tool_call", "proposedTool": proposed})

    new_messages = state["messages"] + [
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": call_id,
                    "type": "function",
                    "function": {"name": proposed["toolName"], "arguments": json.dumps(proposed["arguments"])},
                }
            ],
        },
        {"role": "tool", "tool_call_id": call_id, "content": json.dumps(tool_result)},
    ]
    new_history = state["history"] + [
        {"toolName": proposed["toolName"], "arguments": proposed["arguments"], "result": tool_result}
    ]
    return {"messages": new_messages, "history": new_history, "stepCount": state["stepCount"] + 1}


def _should_continue(state: WorkflowState) -> str:
    if state["stepCount"] >= MAX_STEPS:
        return END
    return "planner"


def build_graph():
    graph = StateGraph(WorkflowState)
    graph.add_node("planner", planner_node)
    graph.set_entry_point("planner")
    graph.add_conditional_edges("planner", _should_continue, {"planner": "planner", END: END})
    return graph.compile(checkpointer=MemorySaver())


compiled_graph = build_graph()
