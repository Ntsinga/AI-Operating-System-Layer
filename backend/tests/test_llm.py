import os
import unittest
from types import SimpleNamespace
from unittest import mock

from app import llm

SCHEMA = {"name": "decision", "schema": {"type": "object", "properties": {"action": {"type": "string"}}}, "strict": True}


class FakeClient:
    """Stands in for an OpenAI client; records each request and can be told to fail."""

    def __init__(self, name, calls, fail=False, content="ok"):
        self.name, self.calls, self.fail, self.content = name, calls, fail, content
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append((self.name, kwargs))
        if self.fail:
            raise RuntimeError(f"{self.name} exploded")
        message = SimpleNamespace(content=self.content, tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=None)


class LLMRoutingTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.failing = set()
        env = {"OPENAI_API_KEY": "sk-openai", "DEEPSEEK_API_KEY": "sk-deepseek"}
        patcher = mock.patch.dict(os.environ, env, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        client_patcher = mock.patch.object(
            llm, "_client", lambda provider: FakeClient(provider.name, self.calls, fail=provider.name in self.failing)
        )
        client_patcher.start()
        self.addCleanup(client_patcher.stop)

    def used(self):
        return [name for name, _ in self.calls]

    def test_defaults_to_openai_and_preserves_original_model(self):
        result = llm.chat("planner", [{"role": "user", "content": "hi"}])
        self.assertEqual((result.provider, result.model), ("openai", "gpt-4o-mini"))

    def test_global_provider_and_task_override(self):
        os.environ["LLM_PROVIDER"] = "deepseek"
        os.environ["LLM_PROVIDER_RECOVERY"] = "openai"
        self.assertEqual(llm.chat("analyze", []).provider, "deepseek")
        self.assertEqual(llm.chat("recovery", []).provider, "openai")

    def test_task_model_override_applies_to_primary_only(self):
        os.environ["LLM_PROVIDER_ANALYZE"] = "deepseek"
        os.environ["LLM_MODEL_ANALYZE"] = "deepseek-v4-pro"
        self.failing.add("deepseek")
        result = llm.chat("analyze", [])
        self.assertEqual(self.calls[0][1]["model"], "deepseek-v4-pro")
        # The fallback provider must not inherit a model name meant for the primary.
        self.assertEqual((result.provider, result.model), ("openai", "gpt-4o-mini"))

    def test_falls_back_when_primary_fails(self):
        os.environ["LLM_PROVIDER"] = "deepseek"
        self.failing.add("deepseek")
        result = llm.chat("planner", [])
        self.assertEqual(self.used(), ["deepseek", "openai"])
        self.assertEqual(result.provider, "openai")

    def test_fallback_disabled_surfaces_the_primary_failure(self):
        os.environ["LLM_PROVIDER"] = "deepseek"
        os.environ["LLM_FALLBACK"] = "0"
        self.failing.add("deepseek")
        with self.assertRaises(llm.LLMError) as ctx:
            llm.chat("planner", [])
        self.assertEqual(self.used(), ["deepseek"])
        self.assertIn("deepseek exploded", str(ctx.exception))

    def test_fallback_disabled_and_primary_unconfigured_is_unavailable_not_silently_rerouted(self):
        os.environ["LLM_PROVIDER"] = "openweight"
        os.environ["LLM_FALLBACK"] = "0"
        with self.assertRaises(llm.LLMUnavailableError):
            llm.chat("planner", [])
        self.assertEqual(self.calls, [])

    def test_no_provider_configured_is_unavailable(self):
        os.environ.pop("OPENAI_API_KEY")
        os.environ.pop("DEEPSEEK_API_KEY")
        with self.assertRaises(llm.LLMUnavailableError):
            llm.chat("planner", [])

    def test_unknown_provider_is_rejected(self):
        os.environ["LLM_PROVIDER"] = "gpt5-secret"
        with self.assertRaises(llm.LLMError):
            llm.chat("planner", [])

    def test_deepseek_serves_vision_on_flash(self):
        os.environ["LLM_PROVIDER_VISION"] = "deepseek"
        result = llm.chat("vision", [{"role": "user", "content": []}], vision=True)
        self.assertEqual(self.used(), ["deepseek"])
        self.assertEqual((result.provider, result.model), ("deepseek", "deepseek-flash"))

    def test_vision_works_with_deepseek_as_the_only_configured_provider(self):
        os.environ.pop("OPENAI_API_KEY")
        self.assertEqual(llm.chat("vision", [], vision=True).provider, "deepseek")

    def test_vision_is_never_sent_to_a_provider_without_vision(self):
        os.environ.update({"OPEN_WEIGHT_BASE_URL": "http://localhost:11434/v1", "OPEN_WEIGHT_MODEL": "llama3"})
        os.environ["LLM_PROVIDER"] = "openweight"
        result = llm.chat("vision", [{"role": "user", "content": []}], vision=True)
        self.assertEqual(self.used(), ["openai"])
        self.assertEqual(result.provider, "openai")

    def test_vision_with_no_capable_provider_configured_is_unavailable(self):
        os.environ.pop("OPENAI_API_KEY")
        os.environ.pop("DEEPSEEK_API_KEY")
        os.environ.update({"OPEN_WEIGHT_BASE_URL": "http://localhost:11434/v1", "OPEN_WEIGHT_MODEL": "llama3"})
        with self.assertRaises(llm.LLMUnavailableError):
            llm.chat("vision", [], vision=True)
        self.assertEqual(self.calls, [])

    def test_deepseek_defaults_to_flash_with_thinking_disabled(self):
        os.environ["LLM_PROVIDER_PLANNER"] = "deepseek"
        result = llm.chat("planner", [], tools=[{"type": "function", "function": {"name": "t"}}])
        self.assertEqual(result.model, "deepseek-flash")
        self.assertEqual(self.calls[0][1]["extra_body"], {"thinking": {"type": "disabled"}})

    def test_deepseek_thinking_can_be_opted_into(self):
        os.environ["LLM_PROVIDER_PLANNER"] = "deepseek"
        os.environ["DEEPSEEK_THINKING"] = "1"
        llm.chat("planner", [])
        self.assertNotIn("extra_body", self.calls[0][1])

    def test_openai_requests_carry_no_extra_body(self):
        llm.chat("planner", [])
        self.assertNotIn("extra_body", self.calls[0][1])

    def test_open_weight_vision_model_can_serve_vision_when_enabled(self):
        os.environ.update(
            {"OPEN_WEIGHT_BASE_URL": "http://localhost:11434/v1", "OPEN_WEIGHT_MODEL": "qwen2.5vl", "OPEN_WEIGHT_VISION": "1"}
        )
        os.environ["LLM_PROVIDER_VISION"] = "openweight"
        result = llm.chat("vision", [], vision=True)
        self.assertEqual((result.provider, result.model), ("openweight", "qwen2.5vl"))

    def test_open_weight_without_vision_flag_is_not_vision_capable(self):
        os.environ.update({"OPEN_WEIGHT_BASE_URL": "http://localhost:11434/v1", "OPEN_WEIGHT_MODEL": "llama3"})
        os.environ["LLM_PROVIDER_VISION"] = "openweight"
        self.assertEqual(llm.chat("vision", [], vision=True).provider, "openai")

    def test_tools_are_passed_through_with_auto_choice(self):
        tools = [{"type": "function", "function": {"name": "open_application"}}]
        llm.chat("planner", [], tools=tools)
        kwargs = self.calls[0][1]
        self.assertEqual((kwargs["tools"], kwargs["tool_choice"]), (tools, "auto"))

    def test_no_tools_means_no_tool_kwargs(self):
        llm.chat("analyze", [])
        self.assertNotIn("tools", self.calls[0][1])
        self.assertNotIn("tool_choice", self.calls[0][1])


class JsonModeTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        patcher = mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-openai", "DEEPSEEK_API_KEY": "sk-deepseek"}, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        client_patcher = mock.patch.object(llm, "_client", lambda provider: FakeClient(provider.name, self.calls))
        client_patcher.start()
        self.addCleanup(client_patcher.stop)

    def test_openai_gets_strict_json_schema_and_untouched_messages(self):
        messages = [{"role": "system", "content": "sys"}, {"role": "user", "content": "go"}]
        llm.chat("recovery", messages, json_schema=SCHEMA)
        kwargs = self.calls[0][1]
        self.assertEqual(kwargs["response_format"], {"type": "json_schema", "json_schema": SCHEMA})
        self.assertEqual(kwargs["messages"], messages)

    def test_schema_is_downgraded_to_json_object_for_deepseek_with_schema_in_prompt(self):
        os.environ["LLM_PROVIDER_RECOVERY"] = "deepseek"
        messages = [{"role": "system", "content": "sys"}, {"role": "user", "content": "go"}]
        llm.chat("recovery", messages, json_schema=SCHEMA)
        kwargs = self.calls[0][1]
        self.assertEqual(kwargs["response_format"], {"type": "json_object"})
        self.assertIn("JSON schema", kwargs["messages"][0]["content"])
        self.assertIn('"action"', kwargs["messages"][0]["content"])
        self.assertEqual(messages[0]["content"], "sys")  # caller's messages are not mutated

    def test_json_mode_adds_the_word_json_when_the_prompt_lacks_it(self):
        llm.chat("analyze", [{"role": "user", "content": "extract the fields"}], json_mode=True)
        kwargs = self.calls[0][1]
        self.assertEqual(kwargs["response_format"], {"type": "json_object"})
        self.assertRegex(kwargs["messages"][0]["content"], r"(?i)\bjson\b")

    def test_json_mode_leaves_prompt_alone_when_it_already_says_json(self):
        messages = [{"role": "system", "content": "Return JSON."}, {"role": "user", "content": "go"}]
        llm.chat("analyze", messages, json_mode=True)
        self.assertEqual(self.calls[0][1]["messages"], messages)

    def test_json_word_in_a_multimodal_text_part_counts(self):
        messages = [{"role": "user", "content": [{"type": "text", "text": "read this as json"}, {"type": "image_url", "image_url": {"url": "x"}}]}]
        llm.chat("vision", messages, json_mode=True, vision=True)
        self.assertEqual(self.calls[0][1]["messages"], messages)


if __name__ == "__main__":
    unittest.main()
