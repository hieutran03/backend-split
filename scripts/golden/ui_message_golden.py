"""Golden fixtures for the UIMessage projection (MSG-02, journal 020).

Runs the REAL Python projection of the chatbot repo on the cases below and writes
test/fixtures/ui-message-golden.json, which the TypeScript port is tested against.

Usage (from backend-split, with the chatbot repo's virtualenv):
    <chatbot>/.venv/Scripts/python -I scripts/golden/ui_message_golden.py <chatbot>

`app.api.ai_sdk` itself cannot be imported here (it pulls sklearn), so the loop of
`get_conversation_messages_ai_sdk` (app/api/ai_sdk.py, the `for msg in
paginated_result.items` body) is copied verbatim below; every helper it calls is
imported from the chatbot code.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

CHATBOT = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(CHATBOT))

from app.core.config import settings  # noqa: E402
from app.schemas.message import MessageRead  # noqa: E402
from app.services.event_streaming.ai_sdk_projection import (  # noqa: E402
    attach_image_parts_to_message,
    effective_answer_visuals,
    effective_source_figures,
    ensure_leading_text_part,
    is_v1_rich_items_message,
    project_ai_sdk_message_for_capability,
    scrub_legacy_metadata,
    visible_image_file_parts,
)

LS = chr(0x2028)
FENCE = "`" * 3


def project(msg: MessageRead, inline: bool, visuals: bool, figures: bool) -> dict[str, Any]:
    """Verbatim body of the loop in get_conversation_messages_ai_sdk."""
    rich_response_capable = bool(inline and getattr(settings, "inline_rich_response_enabled", False))
    visuals_capable = effective_answer_visuals(base=rich_response_capable, requested=visuals)
    figures_capable = effective_source_figures(base=rich_response_capable, requested=figures)

    role = "user" if msg.sender == 1 else "assistant"
    message_payload: dict[str, Any] = {
        "id": str(msg.id),
        "role": role,
        "content": msg.content,
        "createdAt": msg.created_at.isoformat() if msg.created_at else None,
    }
    if isinstance(msg.message_metadata, dict):
        message_payload["metadata"] = msg.message_metadata
    if role == "assistant":
        is_v1 = is_v1_rich_items_message(msg.message_metadata)
        file_parts = visible_image_file_parts(
            message_payload, is_v1=is_v1, inline_rich_response_v1=rich_response_capable
        )
        message_payload = project_ai_sdk_message_for_capability(
            message_payload,
            inline_rich_response_v1=rich_response_capable,
            answer_visuals_v1=visuals_capable,
            source_figures_v1=figures_capable,
        )
        message_payload = attach_image_parts_to_message(
            message_payload, image_parts=file_parts, is_v1=is_v1
        )
    ensure_leading_text_part(message_payload)
    metadata = message_payload.get("metadata")
    if isinstance(metadata, dict):
        message_payload["metadata"] = scrub_legacy_metadata(metadata)
    # AISDKUIMessage.model_validate + response serialization (by alias).
    return {
        "id": message_payload["id"],
        "role": message_payload["role"],
        "content": message_payload["content"],
        "parts": message_payload.get("parts", []),
        "metadata": message_payload.get("metadata"),
    }


PRIVATE = "https://origin.example.com/private/raw.png"
B64 = "iVBORw0KGgo="

CASES: list[dict[str, Any]] = [
    {"name": "user plain, no metadata", "sender": 1, "content": "Hello", "metadata": None},
    {
        "name": "user metadata scrubbed (legacy, internal, redundant keys)",
        "sender": 1,
        "content": "Hi <!--rich:img1--> stays for users",
        "metadata": {
            "persona": "x",
            "images": [{"url": "https://a/b.png"}],
            "has_images": True,
            "_internal": 1,
            "conversation_id": "c",
            "context_window": {"limit": 1000, "used": 10, "ratio": 0.01},
        },
    },
    {"name": "assistant empty metadata", "sender": 2, "content": "Answer", "metadata": {}},
    {"name": "assistant blank content", "sender": 2, "content": "   ", "metadata": {}},
    {
        "name": "assistant legacy images",
        "sender": 2,
        "content": "See images",
        "metadata": {
            "images": [
                {"data": B64, "mime": "image/jpeg"},
                {"url": "https://cdn.example.com/a.png"},
                {"url": "/chat-images/123", "mediaType": "image/webp"},
                {"image": "data:image/gif;base64,R0lGOD=="},
                {"source": {"url": "blob:xyz"}},
                {"data": "abc"},
                {"data": "anh-" + chr(0x1EA3)},
                {"data": B64, "mime": "image/jpeg"},
                {"base64": "  " + B64 + "  ", "contentType": " image/png "},
                "not-a-dict",
                {"url": "", "data": "", "base64": None},
            ],
            "images_count": 9,
        },
    },
    {
        "name": "assistant v1 rich items with markers and code",
        "sender": 2,
        "content": "\n".join(
            [
                "Intro <!--rich:img1--> after",
                "<!--rich:grp1-->",
                FENCE + "md",
                "<!--rich:img1--> in fence",
                FENCE,
                "inline `<!--rich:img1-->` code",
                "    <!--rich:img1--> indented",
                "bad <!--rich:bad id--> marker",
                "<!--rich:bad id 2-->",
                "end",
            ]
        ),
        "metadata": {
            "rich_items_version": 1,
            "rich_items": [
                {"id": "img1", "type": "image", "alt_text": "A", "payload": {"url": "https://x/1.png", "mime_type": "image/png"}},
                {
                    "id": "grp1",
                    "type": "image_group",
                    "payload": {"items": [{"data": B64, "mime_type": "image/jpeg"}, {"url": "https://x/2.png"}, {"nothing": 1}]},
                },
                {"id": "w1", "type": "live_widget", "payload": {"html": "<b>"}},
            ],
            "rich_reference_warnings": ["w"],
        },
    },
    {
        "name": "answer visual with fallback, visual marker without descriptor",
        "sender": 2,
        "content": "Before\n\nText <!--rich:visual:v1--> mid <!--rich:visual:v1-->\n<!--rich:visual:gone-->\n\n\n\nAfter",
        "metadata": {
            "rich_items_version": 1,
            "rich_items": [
                {"id": "visual:v1", "type": "answer_visual", "payload": {"fallback_markdown": "| a | b |\n|---|---|", "spec": {}}},
            ],
        },
    },
    {
        "name": "source figures (group of 2, group of 1)",
        "sender": 2,
        "content": "Compare <!--rich:figure:f1-->\n<!--rich:figure:f2-->",
        "metadata": {
            "rich_items_version": 1,
            "rich_items": [
                {
                    "id": "figure:f1",
                    "type": "image_group",
                    "source": "source_figure",
                    "alt_text": "Fig",
                    "payload": {
                        "caption": "Cap",
                        "caption_evidence": [{"label": "S", "url": "https://s"}],
                        "fallback_markdown": "**Figure:** Cap",
                        "label": "L",
                        "items": [
                            {"url": "https://x/a.png", "label": "A", "alt_text": "a", "source_url": "https://s/a"},
                            {"url": "https://x/b.png", "label": "B", "alt_text": "b"},
                        ],
                    },
                },
                {
                    "id": "figure:f2",
                    "type": "image_group",
                    "source": "source_figure",
                    "payload": {
                        "comparison_unavailable": True,
                        "fallback_markdown": "**Figure**",
                        "items": [{"data": B64, "mime_type": "image/png", "label": "Only", "alt_text": "only one"}],
                    },
                },
            ],
        },
    },
    {
        "name": "web sources",
        "sender": 2,
        "content": "Sourced",
        "metadata": {
            "web_sources": [
                {"url": "https://a", "title": "A", "source_id": "s1"},
                {"url": "https://b"},
                {"url": "https://a", "source_id": "s1"},
                {"title": "no url"},
                "junk",
            ]
        },
    },
    {
        "name": "private image url redaction",
        "sender": 2,
        "content": "Private",
        "metadata": {
            "rich_items_version": 1,
            "rich_items": [
                {
                    "id": "img1",
                    "type": "image",
                    "payload": {"url": "/web-images/9", "original_image_url": PRIVATE, "original_image_digests": ["d"]},
                    "provenance": {"note": "fetched from " + PRIVATE, "copy": PRIVATE + " "},
                },
            ],
            "tool_output": json.dumps({"original_image_url": PRIVATE, "k": [1, 2], "s": "x"}),
            "broken": "{original_image_url: oops",
            "mention": "see " + PRIVATE,
        },
    },
    {
        "name": "rich_items_version true counts as v1",
        "sender": 2,
        "content": "x <!--rich:img1-->",
        "metadata": {"rich_items_version": True, "rich_items": [{"id": "img1", "type": "image", "payload": {"url": "https://x/1.png"}}]},
    },
    {
        "name": "CRLF, tilde fence, line separator",
        "sender": 2,
        "content": "a <!--rich:img1-->\r\n~~~\r\n<!--rich:img1-->\r\n~~~\r\nb" + LS + "<!--rich:visual:z-->",
        "metadata": {"rich_items_version": 1, "rich_items": [{"id": "img1", "type": "image", "payload": {"url": "https://x/1.png"}}]},
    },
    {
        "name": "markers but no rich items, legacy message",
        "sender": 2,
        "content": "x <!--rich:a--> y",
        "metadata": {"suggested_questions": ["q1", 2], "interrupt": None},
    },
]

FLAGS = [
    (False, False, False),
    (True, False, False),
    (True, True, False),
    (True, True, True),
    (False, True, True),
]

out = []
for i, case in enumerate(CASES):
    msg = MessageRead.model_validate(
        {
            "id": UUID(int=i + 1),
            "created_at": datetime(2026, 11, 18, tzinfo=UTC),
            "updated_at": datetime(2026, 11, 18, tzinfo=UTC),
            "deleted_at": None,
            "conversation_id": UUID(int=999),
            "sender": case["sender"],
            "content": case["content"],
            "message_metadata": case["metadata"],
        }
    )
    for inline, visuals, figures in FLAGS:
        out.append(
            {
                "name": case["name"],
                "flags": {"inlineRichResponseV1": inline, "answerVisualsV1": visuals, "sourceFiguresV1": figures},
                "input": {"id": str(UUID(int=i + 1)), "sender": "user" if case["sender"] == 1 else "assistant", "content": case["content"], "metadata": case["metadata"]},
                "expected": project(msg, inline, visuals, figures),
            }
        )

target = Path(__file__).resolve().parents[2] / "test" / "fixtures" / "ui-message-golden.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
print(f"wrote {len(out)} cases (inline_rich_response_enabled={settings.inline_rich_response_enabled})")
