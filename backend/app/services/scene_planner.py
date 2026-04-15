import json
from typing import Optional

from loguru import logger

from app.core.config import settings
from app.services.llm_router import complete_text


SCENE_ROLES = {"hook", "setup", "escalation", "reveal", "payoff", "ending"}
ASSET_BIASES = {"video", "image", "either"}
PREMIUM_SCENE_FX = {
    "none",
    "paper_tear_reveal",
    "paper_crumble_transition",
    "zoom_through_handoff",
}

SCENE_INTELLIGENCE_MODEL = "gpt-4o"


def normalize_scene_role(value: Optional[str]) -> str:
    role = str(value or "").strip().lower()
    return role if role in SCENE_ROLES else "setup"


def normalize_asset_bias(value: Optional[str]) -> str:
    bias = str(value or "").strip().lower()
    return bias if bias in ASSET_BIASES else "either"


def normalize_scene_fx_name(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    fx_name = str(value).strip().lower()
    if not fx_name:
        return None
    if fx_name in PREMIUM_SCENE_FX:
        return fx_name
    return "none"


def normalize_scene_fx_strength(value: Optional[float]) -> float:
    try:
        numeric = float(value if value is not None else 0.55)
    except (TypeError, ValueError):
        numeric = 0.55
    return max(0.0, min(1.0, numeric))


def _scene_excerpt(scene: dict) -> str:
    return " ".join(
        str(scene.get(key, "") or "").strip()
        for key in ("anchor_phrase", "transcript_excerpt", "visual_focus_word", "anchor_word")
        if str(scene.get(key, "") or "").strip()
    )


def _fallback_role(index: int, total: int, text: str) -> str:
    lowered = text.lower()
    if index == 0:
        return "hook"
    if index == total - 1:
        return "ending"
    if any(term in lowered for term in ("finally", "turns out", "reveals", "revealed", "the answer", "this means")):
        return "reveal"
    if any(term in lowered for term in ("therefore", "so", "as a result", "which means", "impact")):
        return "payoff"
    if index >= max(1, total // 2) and any(term in lowered for term in ("but", "however", "instead", "yet", "although")):
        return "escalation"
    if index >= max(1, (total * 2) // 3):
        return "payoff"
    return "setup" if index <= 1 else "escalation"


def _fallback_asset_bias(role: str, text: str) -> str:
    lowered = text.lower()
    if role in {"hook", "escalation"}:
        return "video"
    if any(term in lowered for term in ("microscope", "surgery", "reaction", "moving", "spinning", "walking", "pouring", "exploding")):
        return "video"
    if any(term in lowered for term in ("diagram", "scan", "portrait", "x-ray", "document", "photo", "still")):
        return "image"
    return "either"


def _fallback_fx(role: str, index: int, total: int, text: str) -> tuple[str, float, str]:
    lowered = text.lower()
    mid_index = total // 2
    if role == "hook":
        return ("paper_tear_reveal", 0.78, "Open the reel with a tactile tear-in for a strong hook.")
    if role in {"reveal", "payoff"} and abs(index - mid_index) <= 1:
        return ("zoom_through_handoff", 0.72, "Use a zoom-through handoff near the midpoint reveal.")
    if any(term in lowered for term in ("paper", "document", "journal", "study", "page")):
        return ("paper_crumble_transition", 0.64, "The scene references paper-like material, so a crumble transition fits.")
    return ("none", 0.0, "Keep this scene on standard transitions only.")


def build_fallback_scene_plan(script: str, scenes: list[dict]) -> dict[str, dict]:
    total = len(scenes)
    context_by_scene: dict[str, dict] = {}
    for index, scene in enumerate(scenes):
        scene_id = str(scene.get("scene_id") or f"scene-{index + 1}")
        scene_text = _scene_excerpt(scene)
        role = normalize_scene_role(scene.get("scene_role")) if scene.get("scene_role") else _fallback_role(index, total, scene_text)
        asset_bias = normalize_asset_bias(scene.get("asset_bias")) if scene.get("asset_bias") else _fallback_asset_bias(role, scene_text)
        fx_name, fx_strength, fx_reason = _fallback_fx(role, index, total, scene_text)
        if scene.get("scene_fx_name") is not None:
            fx_name = normalize_scene_fx_name(scene.get("scene_fx_name")) or "none"
        previous_excerpt = _scene_excerpt(scenes[index - 1]) if index > 0 else "Start with an immediate visual hook."
        next_excerpt = _scene_excerpt(scenes[index + 1]) if index < total - 1 else "Land the ending cleanly."
        continuity = (
            f"Stay visually consistent with the previous beat: {previous_excerpt[:120]}"
            if index > 0
            else "Introduce the reel with a decisive first image."
        )
        novelty = (
            f"Show a fresh visual beat before the next scene: {next_excerpt[:120]}"
            if index < total - 1
            else "Feel like the final beat or exit."
        )
        prompt_focus = (
            f"Scene {index + 1}/{total}: {scene_text[:180]}. "
            f"This beat functions as the {role} of the reel, so keep the image specific to that role."
        )
        stock_rationale = (
            "Prefer dynamic stock footage for motion and energy."
            if asset_bias == "video"
            else "Prefer iconic, instantly legible imagery."
            if asset_bias == "image"
            else "Choose the clearest asset type for this beat."
        )
        context_by_scene[scene_id] = {
            "scene_role": role,
            "asset_bias": asset_bias,
            "continuity_note": continuity,
            "novelty_note": novelty,
            "prompt_focus": prompt_focus,
            "stock_match_rationale": stock_rationale,
            "scene_fx_name": fx_name,
            "scene_fx_strength": normalize_scene_fx_strength(scene.get("scene_fx_strength") if scene.get("scene_fx_strength") is not None else fx_strength),
            "fx_rationale": fx_reason,
            "planning_confidence": 0.42,
        }
    return context_by_scene


async def build_scene_plan(script: str, scenes: list[dict]) -> dict[str, dict]:
    if not scenes:
        return {}

    if not (settings.OPENAI_API_KEY or settings.GEMINI_API_KEY):
        return build_fallback_scene_plan(script, scenes)

    trimmed_script = " ".join((script or "").split()).strip()
    if len(trimmed_script) > 9000:
        trimmed_script = trimmed_script[:9000] + "..."

    compact_scenes = []
    for index, scene in enumerate(scenes):
        compact_scenes.append(
            {
                "scene_id": scene.get("scene_id") or f"scene-{index + 1}",
                "scene_index": index + 1,
                "total_scenes": len(scenes),
                "anchor_word": scene.get("anchor_word", ""),
                "visual_focus_word": scene.get("visual_focus_word", ""),
                "anchor_phrase": scene.get("anchor_phrase", ""),
                "transcript_excerpt": scene.get("transcript_excerpt", ""),
                "start_time_seconds": scene.get("start_time_seconds", 0),
                "end_time_seconds": scene.get("end_time_seconds", 0),
                "current_transition": scene.get("effect_transition_name"),
                "current_fx": scene.get("scene_fx_name"),
            }
        )

    prompt = (
        "You are the scene director for a vertical science reel.\n"
        "Your job is to improve each scene while keeping the output scene-specific.\n"
        "You are not writing final prompts yet. You are planning context that later prompt and stock stages will use.\n\n"
        "For EACH scene, return:\n"
        "- scene_role: one of hook, setup, escalation, reveal, payoff, ending\n"
        "- asset_bias: one of video, image, either\n"
        "- continuity_note: one sentence about what visual continuity to preserve from the previous beat\n"
        "- novelty_note: one sentence about what should feel visually new in this beat\n"
        "- prompt_focus: one sentence describing the exact visible subject/action this scene should center on\n"
        "- stock_match_rationale: one sentence about what kind of stock asset will fit this scene best\n"
        "- scene_fx_name: one of none, paper_tear_reveal, paper_crumble_transition, zoom_through_handoff\n"
        "- scene_fx_strength: 0.0 to 1.0\n"
        "- fx_rationale: one sentence about why the FX should or should not be used\n"
        "- planning_confidence: 0.0 to 1.0\n\n"
        "Rules:\n"
        "1. Think about the WHOLE reel, but keep each answer specific to the current scene.\n"
        "2. Avoid generic science imagery. Tie every scene to the narration's story progression.\n"
        "3. Use heavy FX sparsely. Usually only the hook or a major midpoint reveal should get one.\n"
        "4. Prefer continuity without making adjacent scenes repetitive.\n"
        "5. Output JSON only in the format {\"scenes\": [...]}.\n\n"
        f"FULL REEL SCRIPT:\n{trimmed_script}\n\n"
        f"SCENES:\n{json.dumps(compact_scenes, ensure_ascii=False)}"
    )

    fallback = build_fallback_scene_plan(script, scenes)

    try:
        response = await complete_text(
            capability="scene_planning",
            default_openai_model=SCENE_INTELLIGENCE_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=3500,
        )
        data = json.loads(response.text or "{}")
        planned_rows = data.get("scenes", [])
        planned_map: dict[str, dict] = {}
        for row in planned_rows:
            scene_id = str(row.get("scene_id", "")).strip()
            if not scene_id:
                continue
            base = fallback.get(scene_id, {})
            planned_map[scene_id] = {
                "scene_role": normalize_scene_role(row.get("scene_role") or base.get("scene_role")),
                "asset_bias": normalize_asset_bias(row.get("asset_bias") or base.get("asset_bias")),
                "continuity_note": str(row.get("continuity_note") or base.get("continuity_note") or "").strip(),
                "novelty_note": str(row.get("novelty_note") or base.get("novelty_note") or "").strip(),
                "prompt_focus": str(row.get("prompt_focus") or base.get("prompt_focus") or "").strip(),
                "stock_match_rationale": str(row.get("stock_match_rationale") or base.get("stock_match_rationale") or "").strip(),
                "scene_fx_name": normalize_scene_fx_name(row.get("scene_fx_name") or base.get("scene_fx_name")) or "none",
                "scene_fx_strength": normalize_scene_fx_strength(row.get("scene_fx_strength") if row.get("scene_fx_strength") is not None else base.get("scene_fx_strength")),
                "fx_rationale": str(row.get("fx_rationale") or base.get("fx_rationale") or "").strip(),
                "planning_confidence": normalize_scene_fx_strength(row.get("planning_confidence") if row.get("planning_confidence") is not None else base.get("planning_confidence")),
            }

        merged = fallback.copy()
        merged.update(planned_map)
        return merged
    except Exception as exc:
        logger.warning(f"Scene planning fell back to heuristics: {exc}")
        return fallback
