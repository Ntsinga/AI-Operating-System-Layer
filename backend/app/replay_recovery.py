"""Bounded, planner-assisted recovery for a learned-procedure replay step whose selector no
longer matches anything on screen ("Phase 5.5" in docs/AI_OS_ORCHESTRATOR_PLAN.md).

Deliberately narrow: this must never let a model invent a coordinate, resourceId, or element
that isn't actually on screen right now, and it must never guess between two-or-more equally
plausible options (that's exactly how a taught "ride home" procedure could silently book a ride
to the wrong destination - see ERROR_LOG.md 2026-07-29). A model can only ever hand back
select_element (by an index that is provably in the current element list), retry, or abort.

Where this used to hard-abort on ambiguity or on no model match, it now hands the decision to
the actual person holding the phone instead (action "ask_user", carrying the real candidate
element indices for the native side to present as options - see
LearningWatcherService.attemptBoundedRecovery / RecoveryPromptOverlay.kt). That keeps the "never
guess" rule intact while turning what used to be a dead-end abort into "ask, don't guess" -
someone confirming their own choice isn't a guess. ask_user is a decision this module makes
directly; it is never something the model itself can choose (kept out of VALID_ACTIONS/schema).
"""

import json
from typing import Any

from app import llm

VALID_ACTIONS = {"select_element", "retry", "abort"}
MAX_ASK_USER_CANDIDATES = 8


def _candidates_matching_typed_value(elements: list[dict[str, Any]], typed_value: str | None) -> list[dict[str, Any]]:
    if not typed_value:
        return []
    needle = typed_value.strip().lower()
    if not needle:
        return []
    matches = []
    for element in elements:
        haystack = " ".join(filter(None, [element.get("text"), element.get("contentDescription")])).lower()
        if needle in haystack:
            matches.append(element)
    return matches


def _validate_decision(decision: dict[str, Any], elements: list[dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(decision, dict):
        # Providers without strict json_schema (open-weight models) can return valid JSON of the wrong shape.
        return {"action": "abort", "elementIndex": None, "reason": "model returned a non-object recovery decision"}
    action = decision.get("action")
    element_index = decision.get("elementIndex")
    if action not in VALID_ACTIONS:
        return {"action": "abort", "elementIndex": None, "reason": "model returned an invalid action"}
    if action == "select_element":
        valid_indices = {element["index"] for element in elements}
        if element_index not in valid_indices:
            # Hard safety guard: never trust a model-picked index that isn't a real, currently
            # visible element - regardless of how confident the model's stated reasoning sounds.
            return {"action": "abort", "elementIndex": None, "reason": "model selected an index outside the real element list"}
    return {"action": action, "elementIndex": element_index, "reason": str(decision.get("reason", ""))}


def _ask_model(failed_selector: dict[str, Any], elements: list[dict[str, Any]], screen_title: str | None, intent: str | None) -> dict[str, Any]:
    element_lines = "\n".join(
        f"{element['index']}: text={element.get('text')!r} resourceId={element.get('resourceId')!r} contentDescription={element.get('contentDescription')!r}"
        for element in elements
    )
    prompt = (
        f"A taught UI automation step failed to find its original target.\n"
        f"Original taught intent: {intent or 'unknown'}\n"
        f"Screen title: {screen_title or 'unknown'}\n"
        f"The step originally targeted something like: {json.dumps(failed_selector)}\n"
        f"Currently visible tappable elements (index: fields):\n{element_lines}\n\n"
        "Pick the index of the ONE element that most likely corresponds to the original target, "
        "only if you are confident. If multiple elements are plausible or none clearly match, "
        "you must choose abort - never guess between visually similar options."
    )
    try:
        result = llm.chat(
            "recovery",
            [
                {
                    "role": "system",
                    "content": "You are a bounded UI-replay recovery assistant. You may only select an element by an index that is present in the provided list, or return retry/abort. Never invent an index, coordinate, or new element.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=200,
            json_schema={
                "name": "replay_recovery_decision",
                "schema": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string", "enum": ["select_element", "retry", "abort"]},
                        "elementIndex": {"type": ["integer", "null"]},
                        "reason": {"type": "string"},
                    },
                    "required": ["action", "elementIndex", "reason"],
                    "additionalProperties": False,
                },
                "strict": True,
            },
        )
    except llm.LLMError as error:
        # Includes "no provider configured". Either way the caller promotes abort to ask_user.
        return {"action": "abort", "elementIndex": None, "reason": f"no typed-value match and fallback reasoning unavailable: {error}"[:300]}
    try:
        decision = json.loads(result.text or "{}")
    except json.JSONDecodeError:
        return {"action": "abort", "elementIndex": None, "reason": "model returned an unparsable recovery decision"}
    return _validate_decision(decision, elements)


def resolve_replay_recovery(
    failed_selector: dict[str, Any],
    elements: list[dict[str, Any]],
    typed_value: str | None = None,
    screen_title: str | None = None,
    intent: str | None = None,
) -> dict[str, Any]:
    if not elements:
        return {"action": "retry", "elementIndex": None, "reason": "no interactive elements currently visible"}

    # Deterministic fast path: if exactly one currently-visible element's text contains what the
    # user actually typed earlier in this procedure, that is a safe, unambiguous match - no
    # model call needed, zero hallucination risk.
    matches = _candidates_matching_typed_value(elements, typed_value)
    if len(matches) == 1:
        return {
            "action": "select_element",
            "elementIndex": matches[0]["index"],
            "reason": f"unambiguous match for typed value {typed_value!r}",
        }
    if len(matches) > 1:
        # Several equally-plausible options (e.g. multiple "Ntinda ..." results). The original
        # teaching session never recorded which specific one was chosen, so guessing here risks
        # silently picking the wrong destination/option. Never resolve this automatically - ask
        # the person replaying instead of aborting the whole run.
        return {
            "action": "ask_user",
            "elementIndex": None,
            "candidateIndices": [match["index"] for match in matches],
            "reason": f"{len(matches)} elements match typed value {typed_value!r} - ask which one was originally selected",
        }

    # No typed-value signal, or nothing matched it - fall back to a constrained model call that
    # can only pick one of the REAL elements below by index, or refuse.
    decision = _ask_model(failed_selector, elements, screen_title, intent)
    if decision["action"] == "abort":
        # Still not a dead end: hand the real, currently visible elements to a human instead of
        # silently failing the whole replay. Works even with no LLM provider configured, since
        # _ask_model's own "unavailable" fallback also lands here.
        bounded = elements[:MAX_ASK_USER_CANDIDATES]
        return {
            "action": "ask_user",
            "elementIndex": None,
            "candidateIndices": [element["index"] for element in bounded],
            "reason": decision.get("reason", "no confident automatic match"),
        }
    return decision
