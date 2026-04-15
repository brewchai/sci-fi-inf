from __future__ import annotations

import asyncio
import json
import math
import os
import re
import shlex
import uuid
from pathlib import Path
from typing import Any, Optional

import httpx
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.harvester import OpenAlexHarvester
from app.services.llm_router import complete_text
from app.services.reel_generator import ReelGenerator


SEARCH_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "if", "in", "into", "is", "it",
    "may", "might", "of", "on", "or", "that", "the", "their", "then", "there", "these", "they", "this",
    "to", "was", "were", "what", "when", "which", "who", "will", "with", "within", "without", "your",
}
GENERIC_TITLE_PATTERNS = (
    "guideline",
    "guidelines",
    "consensus statement",
    "position statement",
    "classification",
    "reporting statement",
    "reporting guideline",
    "prisma",
    "checklist",
    "explanation and elaboration",
    "standard operating procedure",
)


def _slugify(value: str, fallback: str = "item") -> str:
    text = re.sub(r"[^a-zA-Z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return text[:60] or fallback


def _workspace_root() -> Path:
    static_root = Path(os.getcwd()) / "static" / "fact_checker"
    static_root.mkdir(parents=True, exist_ok=True)
    return static_root


def _job_urls(job_id: str, relative: str) -> tuple[str, str]:
    local_path = _workspace_root() / job_id / relative
    local_path.parent.mkdir(parents=True, exist_ok=True)
    static_url = f"/static/fact_checker/{job_id}/{relative.replace(os.sep, '/')}"
    return str(local_path), static_url


async def _render_with_remotion_spec(spec: dict, output_relative_path: str) -> str:
    renderer_dir = Path(
        settings.PREMIUM_REEL_RENDERER_DIR
        or (Path(__file__).resolve().parents[2] / "premium_renderer")
    )
    script_path = renderer_dir / "render.mjs"
    if not script_path.exists():
        raise RuntimeError(f"Remotion renderer entrypoint not found: {script_path}")

    output_path = _workspace_root() / output_relative_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    spec_path = _workspace_root() / f"{uuid.uuid4().hex[:12]}-stitch-look-dev.json"
    spec_path.write_text(json.dumps(spec), encoding="utf-8")
    try:
        process = await asyncio.create_subprocess_exec(
            settings.NODE_BINARY,
            str(script_path),
            str(spec_path),
            str(output_path),
            cwd=str(renderer_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            error_output = stderr.decode(errors="ignore")[-2000:] or stdout.decode(errors="ignore")[-2000:]
            raise RuntimeError(f"Remotion stitch render failed: {error_output}")
        return f"/static/fact_checker/{output_relative_path.replace(os.sep, '/')}"
    finally:
        try:
            spec_path.unlink(missing_ok=True)
        except Exception:
            pass


def _find_drawtext_font() -> str | None:
    candidates = [
        "/System/Library/Fonts/Menlo.ttc",
        "/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/Supplemental/Courier New.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    return None


def _escape_drawtext(value: str) -> str:
    text = str(value or "").strip()
    text = text.replace("\\", r"\\")
    text = text.replace(":", r"\:")
    text = text.replace("'", r"\'")
    text = text.replace("%", r"\%")
    return text


def _wrap_overlay_lines(text: str, max_chars: int = 32, max_lines: int = 3) -> list[str]:
    words = str(text or "").strip().split()
    if not words:
        return []
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > max_chars:
            lines.append(current)
            current = word
            if len(lines) >= max_lines - 1:
                break
        else:
            current = candidate
    remaining_words = words[len(" ".join(lines + ([current] if current else [])).split()):]
    if current:
        lines.append(current)
    if remaining_words and lines:
        lines[-1] = f"{lines[-1]} {' '.join(remaining_words)}".strip()[:max_chars + 10]
    return lines[:max_lines]


def _first_sentence(text: str) -> str:
    clean = re.sub(r"\s+", " ", str(text or "").strip())
    if not clean:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", clean)
    return parts[0].strip() if parts else clean


def _build_claim_question(claim_text: str) -> str:
    clean = re.sub(r"\s+", " ", str(claim_text or "").strip())
    clean = re.sub(r"^(the claim that|the idea that|claim that|claim:)\s+", "", clean, flags=re.I)
    clean = re.sub(r"[.?!]+$", "", clean).strip()
    clean = re.sub(r"\b(including|include|such as|like|especially)\s*:?\s*$", "", clean, flags=re.I).strip()
    def _limit_words(value: str, max_words: int = 6) -> str:
        return " ".join(value.split()[:max_words]).strip()
    if not clean:
        return "IS THIS TRUE?"

    associated_match = re.match(r"^(.+?)\s+(is|are)\s+associated with\s+(.+)$", clean, flags=re.I)
    if associated_match:
        subject, obj = associated_match.group(1), associated_match.group(3)
        return f"{_limit_words(f'{subject} causing {obj}').upper()}?"

    linked_match = re.match(r"^(.+?)\s+(is|are)\s+(linked to|tied to|connected to)\s+(.+)$", clean, flags=re.I)
    if linked_match:
        subject, obj = linked_match.group(1), linked_match.group(4)
        return f"{_limit_words(f'{subject} linked to {obj}').upper()}?"

    action_match = re.match(r"^(.+?)\s+(can|could|may|might|will|would|does|do|helps?|improves?|reduces?|prevents?)\s+(.+)$", clean, flags=re.I)
    if action_match:
        subject, verb, obj = action_match.group(1), action_match.group(2), action_match.group(3)
        return f"{_limit_words(f'{subject} {verb} {obj}').upper()}?"

    if re.match(r"^(is|are|can|does|do|will|would|could|should|has|have)\b", clean, flags=re.I):
        return f"{_limit_words(clean).upper()}?"

    return f"{_limit_words(clean).upper()}?"


def _typed_drawtext_sequence(
    *,
    text: str,
    start_time: float,
    step_duration: float,
    x: str,
    y: str,
    fontsize: int,
    fontcolor: str,
    font_prefix: str,
) -> list[str]:
    clean = str(text or "").strip()
    if not clean:
        return []
    filters: list[str] = []
    reveal_steps = min(max(len(clean), 1), 18)
    chunk_size = max(1, math.ceil(len(clean) / reveal_steps))
    snippets = [clean[:idx] for idx in range(chunk_size, len(clean) + chunk_size, chunk_size)]
    total_steps = len(snippets)
    for step_index, snippet_value in enumerate(snippets):
        snippet = _escape_drawtext(snippet_value)
        visible_from = start_time + step_index * step_duration
        if step_index < total_steps - 1:
            enable = f"between(t,{visible_from:.2f},{visible_from + step_duration:.2f})"
        else:
            enable = f"gte(t,{visible_from:.2f})"
        filters.append(
            f"drawtext={font_prefix}text='{snippet}':fontsize={fontsize}:fontcolor={fontcolor}:x={x}:y={y}:enable='{enable}'"
        )
    return filters


def _clean_doi(value: str | None) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    text = re.sub(r"^https?://(dx\.)?doi\.org/", "", text, flags=re.I).strip()
    return text or None


def _normalize_title(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").strip().lower()).strip()


def _dedupe_strings(values: list[str], limit: int | None = None) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = re.sub(r"\s+", " ", str(value or "").strip())
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(cleaned[:220])
        if limit and len(deduped) >= limit:
            break
    return deduped


def _tokenize_text(value: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9][a-z0-9\-]{1,}", (value or "").lower())
    return [token for token in tokens if token not in SEARCH_STOPWORDS and len(token) > 2]


def _extract_content_terms(*parts: str) -> list[str]:
    return _dedupe_strings(_tokenize_text(" ".join(part for part in parts if part)))


def _extract_numeric_snippets(text: str, limit: int = 4) -> list[str]:
    snippets: list[str] = []
    if not text.strip():
        return snippets
    patterns = [
        r"\bn\s*=\s*\d[\d,]*\b",
        r"\b\d[\d,]*\s+(?:participants|patients|subjects|adults|children|people|individuals)\b",
        r"\b\d+(?:\.\d+)?\s*%\b",
        r"\b\d+(?:\.\d+)?\s*x\b",
        r"\b\d+(?:\.\d+)?\s*(?:fold|times)\b",
        r"\bp\s*[<=>]\s*0?\.\d+\b",
        r"\b\d+(?:\.\d+)?\s*(?:mg|g|kg|mmhg|bpm|hours|days|weeks|months|years)\b",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.I):
            snippet = match.group(0).strip()
            if snippet and snippet not in snippets:
                snippets.append(snippet)
                if len(snippets) >= limit:
                    return snippets
    return snippets


def _normalize_sentence_bullet(text: str) -> str:
    clean = re.sub(r"\s+", " ", str(text or "").strip())
    clean = re.sub(r"^[\s\-•]+", "", clean).strip()
    if not clean:
        return ""
    if re.search(r"[.?!]$", clean):
        return clean
    return f"{clean}."


def _normalize_stitch_rationale(text: str, max_bullets: int = 5) -> str:
    source_lines = [
        _normalize_sentence_bullet(line)
        for line in str(text or "").splitlines()
        if line.strip()
    ]
    bullets = [
        bullet
        for line in source_lines
        for bullet in [_normalize_sentence_bullet(line)]
    ]
    return "\n".join([bullet for bullet in bullets if bullet][:max_bullets])


def _count_words(text: str) -> int:
    return len(re.findall(r"\S+", str(text or "").strip()))


def _build_stitch_timing(question: str, rationale: str, clip_duration_seconds: float, requested_duration_seconds: float) -> dict:
    normalized_rationale = _normalize_stitch_rationale(rationale)
    bullet_lines = [line.strip() for line in normalized_rationale.splitlines() if line.strip()]
    total_words = sum(_count_words(line) for line in bullet_lines)

    # Keep the text portion readable, but derive timing from actual overlay volume.
    target_rationale_seconds = 6.2
    min_words_per_second = 3.8
    max_words_per_second = 7.2
    if total_words > 0:
        words_per_second = max(min_words_per_second, min(max_words_per_second, total_words / target_rationale_seconds))
        rationale_seconds = total_words / words_per_second
    else:
        words_per_second = min_words_per_second
        rationale_seconds = 0.0

    rationale_intro_seconds = 2.2
    bullet_gap_seconds = 0.18
    caption_lead_seconds = 0.22
    caption_fade_seconds = 0.38
    caption_hold_seconds = 2.0
    inter_bullet_seconds = max(0, len(bullet_lines) - 1) * bullet_gap_seconds
    tail_duration_seconds = (
        rationale_intro_seconds
        + rationale_seconds
        + inter_bullet_seconds
        + caption_lead_seconds
        + caption_fade_seconds
        + caption_hold_seconds
    )
    resolved_duration_seconds = max(
        requested_duration_seconds,
        clip_duration_seconds + tail_duration_seconds,
    )

    return {
        "normalized_rationale": normalized_rationale,
        "bullet_count": len(bullet_lines),
        "total_words": total_words,
        "words_per_second": round(words_per_second, 3),
        "rationale_seconds": round(rationale_seconds, 3),
        "rationale_intro_seconds": rationale_intro_seconds,
        "bullet_gap_seconds": bullet_gap_seconds,
        "caption_lead_seconds": caption_lead_seconds,
        "caption_fade_seconds": caption_fade_seconds,
        "caption_hold_seconds": caption_hold_seconds,
        "tail_duration_seconds": round(tail_duration_seconds, 3),
        "resolved_duration_seconds": round(resolved_duration_seconds, 3),
    }


def _build_evidence_stats(papers: list[dict]) -> dict:
    top_papers = papers[:8]
    numeric_highlights: list[str] = []
    years = [int(paper["year"]) for paper in top_papers if paper.get("year")]
    for paper in top_papers:
        numeric_highlights.extend(_extract_numeric_snippets(str(paper.get("title") or "")))
        numeric_highlights.extend(_extract_numeric_snippets(str(paper.get("abstract") or "")))
    numeric_highlights = _dedupe_strings(numeric_highlights, limit=8)
    return {
        "paper_count": len(papers),
        "reviewed_top_papers": len(top_papers),
        "year_range": [min(years), max(years)] if years else [],
        "citation_total_top_papers": sum(int(paper.get("cited_by_count") or 0) for paper in top_papers),
        "numeric_highlights": numeric_highlights,
    }


def _truncate_text(value: str | None, max_chars: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"


def _compact_paper_for_llm(paper: dict) -> dict:
    return {
        "title": str(paper.get("title") or "").strip(),
        "year": paper.get("year"),
        "paper_url": paper.get("paper_url"),
        "doi": paper.get("doi"),
        "journal": paper.get("journal"),
        "authors": list(paper.get("authors") or [])[:4],
        "cited_by_count": int(paper.get("cited_by_count") or 0),
        "retrieval_score": round(float(paper.get("retrieval_score") or 0.0), 3),
        "verification_source": paper.get("verification_source"),
        "verified": bool(paper.get("verified", True)),
        "abstract": _truncate_text(str(paper.get("abstract") or ""), 420),
    }


_HUMAN_PATTERNS = (
    "human", "humans", "participant", "participants", "patient", "patients", "adult", "adults",
    "men", "women", "older adults", "postmenopausal", "healthy volunteers", "subjects",
)
_ANIMAL_PATTERNS = (
    "mouse", "mice", "murine", "rat", "rats", "rodent", "rodents", "animal model", "animals",
    "zebrafish", "drosophila", "c. elegans", "worm",
)
_CELL_PATTERNS = (
    "in vitro", "cell", "cells", "cellular", "fibroblast", "organoid", "culture", "cultured",
    "hepg2", "hela", "293t",
)
_MECHANISM_PATTERNS = (
    "mechanism", "pathway", "biomarker", "nad", "sirtuin", "ampk", "mtor", "gene expression",
    "mitochondria", "mitochondrial", "signaling", "molecular", "protein", "enzyme",
)


def _text_blob(*parts: str) -> str:
    return " ".join(str(part or "") for part in parts if str(part or "").strip()).lower()


def _contains_any(text: str, patterns: tuple[str, ...]) -> bool:
    return any(pattern in text for pattern in patterns)


def _infer_population_type(*, title: str, abstract: str) -> str:
    text = _text_blob(title, abstract)
    has_human = _contains_any(text, _HUMAN_PATTERNS)
    has_animal = _contains_any(text, _ANIMAL_PATTERNS)
    has_cell = _contains_any(text, _CELL_PATTERNS)
    if has_human and (has_animal or has_cell):
        return "mixed"
    if has_human:
        return "human"
    if has_animal:
        return "animal"
    if has_cell:
        return "cell"
    return "unclear"


def _infer_study_type(*, title: str, abstract: str, population_type: str) -> str:
    text = _text_blob(title, abstract)
    if "meta-analysis" in text or "meta analysis" in text:
        return "meta_analysis"
    if "systematic review" in text:
        return "systematic_review"
    if "randomized" in text or "randomised" in text or "double-blind" in text or "placebo-controlled" in text:
        return "rct" if population_type in {"human", "mixed", "unclear"} else "animal_experiment"
    if "trial" in text or "intervention" in text:
        return "human_trial" if population_type in {"human", "mixed", "unclear"} else "animal_experiment"
    if "cohort" in text or "prospective" in text or "longitudinal" in text:
        return "cohort"
    if "case-control" in text or "case control" in text:
        return "case_control"
    if "cross-sectional" in text or "cross sectional" in text:
        return "cross_sectional"
    if "review" in text:
        return "review"
    if population_type == "animal":
        return "animal_experiment"
    if population_type == "cell":
        return "in_vitro"
    return "observational"


def _infer_claim_is_mechanistic(claim_text: str) -> bool:
    return _contains_any(_text_blob(claim_text), _MECHANISM_PATTERNS)


def _infer_directness(
    *,
    claim_text: str,
    title: str,
    abstract: str,
    population_type: str,
) -> str:
    combined = _text_blob(title, abstract)
    claim_terms = set(_extract_content_terms(claim_text))
    text_terms = set(_tokenize_text(combined))
    overlap_ratio = len(claim_terms & text_terms) / max(len(claim_terms), 1)
    has_mechanism_terms = _contains_any(combined, _MECHANISM_PATTERNS)
    claim_is_mechanistic = _infer_claim_is_mechanistic(claim_text)

    if population_type == "human" and overlap_ratio >= 0.22 and not has_mechanism_terms:
        return "direct"
    if population_type == "human" and overlap_ratio >= 0.14:
        return "direct"
    if population_type in {"human", "mixed"} and has_mechanism_terms:
        return "indirect" if not claim_is_mechanistic else "direct"
    if population_type == "animal":
        return "mechanistic" if not claim_is_mechanistic else "indirect"
    if population_type == "cell":
        return "mechanistic"
    if overlap_ratio >= 0.12:
        return "indirect"
    return "tangential"


def _normalize_paper_stance(
    *,
    claim_text: str,
    paper: dict,
    stance: str,
    inferred_population_type: str,
    inferred_study_type: str,
    inferred_directness: str,
    evidence_note: str,
) -> str:
    normalized_stance = str(stance or "tangential").strip().lower()
    if normalized_stance not in {"supports", "refutes", "mixed", "tangential"}:
        normalized_stance = "tangential"

    title = str(paper.get("title") or "")
    abstract = str(paper.get("abstract") or "")
    combined = _text_blob(title, abstract, evidence_note)
    claim_blob = _text_blob(claim_text)
    discusses_anxiety = any(term in combined for term in ("anxiety", "anxious", "stress", "restlessness"))
    no_effect_language = any(
        term in combined
        for term in (
            "no significant effect on anxiety",
            "no significant effect",
            "no discernible impact",
            "did not have a significant effect",
            "did not significantly improve",
            "no improvement in anxiety",
            "not significant",
        )
    )
    positive_effect_language = any(
        term in combined
        for term in (
            "reduced anxiety",
            "improved anxiety",
            "anxiety improvement",
            "alleviating anxiety",
            "helped reduce anxiety",
        )
    )
    high_relevance = float(paper.get("retrieval_score") or 0.0) >= 0.22
    direct_human_study = (
        inferred_population_type in {"human", "mixed"}
        and inferred_directness in {"direct", "indirect"}
        and inferred_study_type in {"rct", "human_trial", "cohort", "case_control", "cross_sectional", "observational"}
    )

    if normalized_stance == "tangential" and direct_human_study and high_relevance:
        if discusses_anxiety and no_effect_language:
            return "refutes"
        if discusses_anxiety and positive_effect_language:
            return "supports"
        return "mixed"

    return normalized_stance


def _study_type_weight(study_type: str) -> float:
    return {
        "meta_analysis": 1.0,
        "systematic_review": 0.95,
        "rct": 0.9,
        "human_trial": 0.8,
        "cohort": 0.68,
        "case_control": 0.6,
        "cross_sectional": 0.5,
        "observational": 0.52,
        "review": 0.42,
        "animal_experiment": 0.3,
        "in_vitro": 0.14,
    }.get(study_type, 0.45)


def _population_weight(population_type: str) -> float:
    return {
        "human": 1.0,
        "mixed": 0.82,
        "animal": 0.38,
        "cell": 0.18,
        "unclear": 0.58,
    }.get(population_type, 0.58)


def _directness_weight(directness: str) -> float:
    return {
        "direct": 1.0,
        "indirect": 0.72,
        "mechanistic": 0.42,
        "tangential": 0.08,
    }.get(directness, 0.3)


def _compute_paper_weight(paper: dict) -> float:
    study_type = str(paper.get("study_type") or "observational")
    population_type = str(paper.get("population_type") or "unclear")
    directness = str(paper.get("directness") or "indirect")
    relevance_score = max(0.0, min(float(paper.get("relevance_score") or 0.0), 1.0))
    retrieval_score = max(0.0, min(float(paper.get("retrieval_score") or 0.0), 1.0))
    citation_bonus = min(math.log1p(max(int(paper.get("cited_by_count") or 0), 0)) / 20.0, 0.08)
    relevance_multiplier = 0.55 + (0.25 * relevance_score) + (0.2 * retrieval_score)
    return (
        _study_type_weight(study_type)
        * _population_weight(population_type)
        * _directness_weight(directness)
        * relevance_multiplier
        * (1.0 + citation_bonus)
    )


def _derive_trust_label(score: float) -> str:
    if score >= 4.35:
        return "Strongly supported"
    if score >= 3.6:
        return "Mostly supported"
    if score >= 2.9:
        return "Mixed evidence"
    if score >= 2.1:
        return "Weak support"
    return "Mostly refuted"


def _compute_weighted_trust_score(*, claim_text: str, papers: list[dict]) -> tuple[float, str, dict]:
    support_total = 0.0
    refute_total = 0.0
    mixed_total = 0.0
    direct_human_support = 0.0
    direct_human_refute = 0.0
    indirect_support = 0.0
    mechanistic_support = 0.0

    for paper in papers:
        if not paper.get("counted_in_tally"):
            continue
        weight = _compute_paper_weight(paper)
        stance = str(paper.get("stance") or "tangential")
        population_type = str(paper.get("population_type") or "unclear")
        directness = str(paper.get("directness") or "indirect")
        if stance == "supports":
            support_total += weight
            if population_type == "human" and directness == "direct":
                direct_human_support += weight
            elif directness == "indirect":
                indirect_support += weight
            elif directness == "mechanistic":
                mechanistic_support += weight
        elif stance == "refutes":
            penalty_weight = weight * (1.12 if population_type == "human" and directness == "direct" else 1.0)
            refute_total += penalty_weight
            if population_type == "human" and directness == "direct":
                direct_human_refute += penalty_weight
        elif stance == "mixed":
            mixed_total += weight

    total_signal = support_total + refute_total + mixed_total
    if total_signal <= 0.001:
        return 3.0, "Mixed evidence", {
            "support_total": support_total,
            "refute_total": refute_total,
            "mixed_total": mixed_total,
            "direct_human_support": direct_human_support,
            "direct_human_refute": direct_human_refute,
            "indirect_support": indirect_support,
            "mechanistic_support": mechanistic_support,
        }

    balance = (support_total - refute_total + (0.18 * mixed_total)) / total_signal
    score = 3.0 + (1.45 * balance)
    score += 0.55 * min(direct_human_support / 1.8, 1.0)
    score -= 0.75 * min(direct_human_refute / 1.4, 1.0)

    if mixed_total > 0.18 and support_total > refute_total and direct_human_refute < 0.55:
        score = max(score, 3.35)

    if direct_human_support > 1.45 and refute_total < 0.45:
        score = max(score, 4.15)

    if direct_human_refute > 0.95 and direct_human_support < direct_human_refute:
        score = min(score, 2.85)
    if direct_human_refute > 1.45 and direct_human_support < 0.75:
        score = min(score, 2.2)

    if direct_human_support < 0.3:
        if indirect_support > 0.45:
            score = min(score, 3.45)
        elif mechanistic_support > 0.2:
            score = min(score, 3.2)

    if support_total > 0 and refute_total == 0 and mixed_total == 0 and direct_human_support < 0.25:
        score = min(score, 3.35)

    if _infer_claim_is_mechanistic(claim_text):
        score = min(max(score, 2.4), 4.2)

    score = max(1.0, min(score, 5.0))
    return score, _derive_trust_label(score), {
        "support_total": support_total,
        "refute_total": refute_total,
        "mixed_total": mixed_total,
        "direct_human_support": direct_human_support,
        "direct_human_refute": direct_human_refute,
        "indirect_support": indirect_support,
        "mechanistic_support": mechanistic_support,
    }


_LOW_SIGNAL_CLAIM_PATTERNS = [
    r"\bsaid this\b",
    r"\bsaid that\b",
    r"\byears? ago\b",
    r"\bmahavir\b",
    r"\bbuddha\b",
    r"\bscripture\b",
    r"\bguru\b",
    r"\bsaint\b",
    r"\bisn't it\b",
]

_RESEARCH_SIGNAL_PATTERNS = [
    r"\bassociated with\b",
    r"\bcauses?\b",
    r"\blinked to\b",
    r"\bconnected to\b",
    r"\bincreases?\b",
    r"\breduces?\b",
    r"\bimproves?\b",
    r"\bharms?\b",
    r"\bpromote[s]?\b",
    r"\bprevents?\b",
    r"\bevolution",
    r"\bmemory\b",
    r"\bhealth\b",
    r"\bdisease\b",
    r"\binflammation\b",
    r"\bbacteria\b",
    r"\bcells?\b",
    r"\bbody\b",
]


def _looks_like_low_signal_claim(text: str) -> bool:
    clean = re.sub(r"\s+", " ", str(text or "").strip()).lower()
    if not clean:
        return True
    return any(re.search(pattern, clean, flags=re.I) for pattern in _LOW_SIGNAL_CLAIM_PATTERNS)


def _research_signal_score(*parts: str) -> int:
    haystack = " ".join(str(part or "") for part in parts)
    return sum(1 for pattern in _RESEARCH_SIGNAL_PATTERNS if re.search(pattern, haystack, flags=re.I))


async def _run_command(args: list[str]) -> str:
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        message = (stderr or stdout).decode("utf-8", errors="ignore").strip()
        raise RuntimeError(message or f"Command failed: {' '.join(shlex.quote(part) for part in args)}")
    return (stdout or b"").decode("utf-8", errors="ignore").strip()


async def ingest_youtube_video(url: str) -> dict:
    if not url.strip():
        raise ValueError("YouTube URL is required")

    job_id = uuid.uuid4().hex[:12]
    job_dir = _workspace_root() / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    metadata_json = await _run_command(["yt-dlp", "-J", "--no-playlist", url.strip()])
    metadata = json.loads(metadata_json)

    title = str(metadata.get("title") or "Untitled video").strip()
    channel = str(metadata.get("channel") or metadata.get("uploader") or "").strip()
    duration_seconds = float(metadata.get("duration") or 0.0)

    video_template = str(job_dir / "source.%(ext)s")
    await _run_command([
        "yt-dlp",
        "--no-playlist",
        "-f",
        "mp4/bestvideo*+bestaudio/best",
        "--merge-output-format",
        "mp4",
        "-o",
        video_template,
        url.strip(),
    ])

    video_candidates = sorted(job_dir.glob("source.*"))
    if not video_candidates:
        raise RuntimeError("yt-dlp completed but no local video file was created")
    video_path = next((path for path in video_candidates if path.suffix.lower() == ".mp4"), video_candidates[0])

    audio_path = job_dir / "audio.mp3"
    await _run_command([
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        str(audio_path),
    ])

    generator = ReelGenerator()
    raw_words = await generator._get_word_timestamps(str(audio_path))
    punctuated_words = generator._restore_punctuation(raw_words, " ".join(word["word"] for word in raw_words).strip())
    transcript = " ".join(word["word"] for word in punctuated_words).strip()

    video_url = f"/static/fact_checker/{job_id}/{video_path.name}"
    audio_url = f"/static/fact_checker/{job_id}/{audio_path.name}"

    return {
        "job_id": job_id,
        "source_url": url.strip(),
        "title": title,
        "channel_name": channel,
        "duration_seconds": duration_seconds,
        "video_path": str(video_path),
        "video_url": video_url,
        "audio_path": str(audio_path),
        "audio_url": audio_url,
        "transcript": transcript,
        "word_timestamps": punctuated_words,
    }


async def extract_claims_from_transcript(
    *,
    transcript: str,
    word_timestamps: list[dict],
    title: str,
    channel_name: str,
) -> list[dict]:
    if not transcript.strip():
        return []
    if not (settings.OPENAI_API_KEY or settings.GEMINI_API_KEY):
        raise RuntimeError("A text LLM API key is required for claim extraction")

    compact_words = [
        {
            "word": str(word.get("word") or "").strip(),
            "start": round(float(word.get("start") or 0.0), 2),
            "end": round(float(word.get("end") or 0.0), 2),
        }
        for word in word_timestamps
        if str(word.get("word") or "").strip()
    ]
    if len(compact_words) > 500:
        compact_words = compact_words[:500]

    response = await complete_text(
        capability="fact_check_claim_extraction",
        default_openai_model="gpt-4o",
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=2200,
        messages=[
            {
                "role": "system",
                "content": (
                    "Extract factual, research-checkable claims from a social video transcript. "
                    "Only include claims that could plausibly be supported or refuted by scientific papers. "
                    "Prioritize biologic, medical, nutritional, evolutionary, causal, mechanistic, or health-related claims. "
                    "Do NOT include attribution, storytelling, spiritual framing, rhetorical setup, dates, who said something, or low-signal trivia. "
                    "Do NOT include claims like 'X said this 2500 years ago' or other source/background statements. "
                    "Prefer complete, standalone claims in plain language. "
                    "If a long passage contains multiple weak fragments, merge them into one stronger scientific claim instead of returning trivia. "
                    "Return strict JSON with a top-level key 'claims'. Each claim must include: "
                    "claim_text, normalized_claim, start_time_seconds, end_time_seconds, transcript_excerpt, factuality_confidence. "
                    "Keep 3 to 10 of the strongest claims. Do not include opinions, vague hype, or quote-attribution fragments."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "title": title,
                        "channel_name": channel_name,
                        "transcript": transcript[:8000],
                        "word_timestamps": compact_words,
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    )
    content = response.text.strip()
    payload = json.loads(content) if content else {}
    claims = payload.get("claims", []) if isinstance(payload, dict) else []
    if not isinstance(claims, list):
        return []

    normalized: list[dict] = []
    for idx, item in enumerate(claims):
        if not isinstance(item, dict):
            continue
        claim_text = str(item.get("claim_text") or "").strip()
        normalized_claim = str(item.get("normalized_claim") or claim_text).strip()
        excerpt = str(item.get("transcript_excerpt") or claim_text).strip()
        if not claim_text:
            continue
        if _looks_like_low_signal_claim(claim_text) and _research_signal_score(claim_text, normalized_claim, excerpt) < 2:
            continue
        try:
            start_time = max(0.0, float(item.get("start_time_seconds") or 0.0))
            end_time = max(start_time + 0.2, float(item.get("end_time_seconds") or start_time + 0.2))
            confidence = float(item.get("factuality_confidence") or 0.0)
        except (TypeError, ValueError):
            continue
        normalized.append(
            {
                "claim_id": f"claim-{len(normalized) + 1}",
                "claim_text": claim_text,
                "normalized_claim": normalized_claim,
                "start_time_seconds": round(start_time, 2),
                "end_time_seconds": round(end_time, 2),
                "transcript_excerpt": excerpt,
                "factuality_confidence": max(0.0, min(confidence, 1.0)),
                "_research_signal": _research_signal_score(claim_text, normalized_claim, excerpt),
            }
        )

    normalized.sort(
        key=lambda item: (
            item.get("_research_signal", 0),
            item.get("factuality_confidence", 0.0),
            len(str(item.get("claim_text") or "")),
        ),
        reverse=True,
    )
    normalized = normalized[:10]
    for idx, item in enumerate(normalized, start=1):
        item["claim_id"] = f"claim-{idx}"
        item.pop("_research_signal", None)

    if normalized:
        query_lists = await asyncio.gather(
            *[
                expand_claim_queries(
                    claim_text=item["claim_text"],
                    normalized_claim=item["normalized_claim"],
                    transcript_excerpt=item["transcript_excerpt"],
                    video_title=title,
                )
                for item in normalized
            ]
        )
        for item, queries in zip(normalized, query_lists):
            item["suggested_queries"] = queries

    return normalized


def _derive_openalex_queries(claim_text: str, normalized_claim: str, transcript_excerpt: str = "") -> list[str]:
    base = [normalized_claim.strip(), claim_text.strip()]
    cleaned = re.sub(r"\s+", " ", normalized_claim).strip()
    shortened = re.sub(r"\b(this|that|these|those|video|people|scientists|researchers)\b", "", cleaned, flags=re.I)
    shortened = re.sub(r"\s+", " ", shortened).strip(" ,.-")
    if shortened and shortened not in base:
        base.append(shortened)
    if transcript_excerpt.strip():
        base.append(transcript_excerpt.strip())
    return _dedupe_strings(base, limit=4)


async def _build_claim_search_plan(
    *,
    claim_text: str,
    normalized_claim: str,
    transcript_excerpt: str = "",
    video_title: str = "",
) -> dict:
    heuristic_queries = _derive_openalex_queries(claim_text, normalized_claim, transcript_excerpt)
    fallback = {
        "subject": "",
        "intervention_or_exposure": "",
        "outcome": "",
        "mechanism": "",
        "population": "",
        "queries": heuristic_queries,
    }
    if not (settings.OPENAI_API_KEY or settings.GEMINI_API_KEY):
        return fallback

    response = await complete_text(
        capability="fact_check_query_expansion",
        default_openai_model="gpt-4o",
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=1200,
        messages=[
            {
                "role": "system",
                "content": (
                    "You turn a social-media factual claim into a structured scientific literature search plan. "
                    "Return strict JSON with keys: subject, intervention_or_exposure, outcome, mechanism, population, queries. "
                    "The queries array must contain 8 to 12 short OpenAlex-ready searches. "
                    "Use buckets implicitly: exact claim, scientific rephrase, mechanism, intervention/exposure, outcome, synonym, broader and narrower variants. "
                    "Do not use vague generic medical phrases unless they are central to the claim."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "claim_text": claim_text,
                        "normalized_claim": normalized_claim,
                        "transcript_excerpt": transcript_excerpt,
                        "video_title": video_title,
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    )
    content = response.text.strip()
    payload = json.loads(content) if content else {}
    if not isinstance(payload, dict):
        return fallback
    plan = {
        "subject": str(payload.get("subject") or "").strip(),
        "intervention_or_exposure": str(payload.get("intervention_or_exposure") or "").strip(),
        "outcome": str(payload.get("outcome") or "").strip(),
        "mechanism": str(payload.get("mechanism") or "").strip(),
        "population": str(payload.get("population") or "").strip(),
        "queries": _dedupe_strings(
            heuristic_queries + [str(query).strip() for query in payload.get("queries", []) if str(query).strip()],
            limit=12,
        ),
    }
    if not plan["queries"]:
        plan["queries"] = heuristic_queries
    return plan


async def expand_claim_queries(
    *,
    claim_text: str,
    normalized_claim: str,
    transcript_excerpt: str = "",
    video_title: str = "",
) -> list[str]:
    plan = await _build_claim_search_plan(
        claim_text=claim_text,
        normalized_claim=normalized_claim,
        transcript_excerpt=transcript_excerpt,
        video_title=video_title,
    )
    return plan.get("queries", []) or _derive_openalex_queries(claim_text, normalized_claim, transcript_excerpt)


def _paper_row_from_openalex(raw: dict, query: str) -> dict:
    primary_location = raw.get("primary_location") or {}
    source = primary_location.get("source") or {}
    authorships = raw.get("authorships") or []
    authors = [
        str((entry.get("author") or {}).get("display_name") or "").strip()
        for entry in authorships[:6]
        if str((entry.get("author") or {}).get("display_name") or "").strip()
    ]
    abstract = OpenAlexHarvester.reconstruct_abstract(raw.get("abstract_inverted_index"))
    paper_url = (
        str(primary_location.get("landing_page_url") or "").strip()
        or str(raw.get("doi") or "").strip()
        or str(raw.get("id") or "").strip()
    )
    cited_by_count = int(raw.get("cited_by_count") or 0)
    return {
        "source": "openalex",
        "query": query,
        "title": str(raw.get("title") or "").strip(),
        "authors": authors,
        "year": raw.get("publication_year"),
        "doi": raw.get("doi"),
        "openalex_id": raw.get("id"),
        "abstract": abstract,
        "paper_url": paper_url,
        "cited_by_count": cited_by_count,
        "journal": str(source.get("display_name") or "").strip() or None,
        "verified": True,
        "verification_source": "openalex",
    }


async def _openalex_lookup_works(*, search: str | None = None, filter_expression: str | None = None, per_page: int = 8) -> list[dict]:
    params: dict[str, Any] = {"per_page": min(max(per_page, 1), 25)}
    if search:
        params["search"] = search
    if filter_expression:
        params["filter"] = filter_expression
    headers: dict[str, str] = {}
    if settings.OPENALEX_MAILTO:
        headers["User-Agent"] = f"mailto:{settings.OPENALEX_MAILTO}"

    async with httpx.AsyncClient(headers=headers, timeout=30.0) as client:
        response = await client.get(f"{settings.OPENALEX_API_URL}/works", params=params)
        response.raise_for_status()
        payload = response.json()
        return payload.get("results", []) or []


async def _verify_candidate_paper(candidate: dict) -> dict | None:
    title = str(candidate.get("title") or "").strip()
    doi = _clean_doi(candidate.get("doi"))
    if not title and not doi:
        return None

    raw_results: list[dict] = []
    if doi:
        try:
            raw_results = await _openalex_lookup_works(filter_expression=f"doi:https://doi.org/{doi}", per_page=3)
        except Exception:
            raw_results = []
    if not raw_results and title:
        try:
            raw_results = await _openalex_lookup_works(search=title, per_page=5)
        except Exception:
            raw_results = []
    if not raw_results:
        return None

    wanted_title = _normalize_title(title)
    wanted_doi = doi
    best_match: dict | None = None
    best_score = -1
    for raw in raw_results:
        raw_title = str(raw.get("title") or "").strip()
        raw_doi = _clean_doi(raw.get("doi"))
        score = 0
        if wanted_doi and raw_doi and wanted_doi.lower() == raw_doi.lower():
            score += 10
        if wanted_title and raw_title and wanted_title == _normalize_title(raw_title):
            score += 5
        if wanted_title and raw_title and wanted_title in _normalize_title(raw_title):
            score += 2
        if score > best_score:
            best_score = score
            best_match = raw

    if not best_match or best_score < 2:
        return None
    return best_match


async def _ai_fallback_verified_papers(
    *,
    claim: dict,
    queries: list[str],
    limit: int = 12,
) -> list[dict]:
    if not (settings.OPENAI_API_KEY or settings.GEMINI_API_KEY):
        return []

    response = await complete_text(
        capability="fact_check_fallback_papers",
        default_openai_model="gpt-4o",
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=2200,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are helping retrieve scientific papers for a fact-checking workflow. "
                    "Return as many potentially relevant real papers as possible for the claim. "
                    "Return strict JSON with key 'papers'. Each paper must include title, doi, and why_relevant. "
                    "Do not fabricate certainty. Include only papers you think might exist, even if DOI is missing."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "claim": claim,
                        "queries": queries,
                        "target_count": limit,
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    )
    content = response.text.strip()
    payload = json.loads(content) if content else {}
    candidates = payload.get("papers", []) if isinstance(payload, dict) else []
    verified_rows: list[dict] = []
    seen_ids: set[str] = set()
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        raw = await _verify_candidate_paper(candidate)
        if not raw:
            continue
        openalex_id = str(raw.get("id") or "").strip()
        if not openalex_id or openalex_id in seen_ids:
            continue
        seen_ids.add(openalex_id)
        row = _paper_row_from_openalex(raw, str(candidate.get("title") or "").strip())
        row["source"] = "ai_fallback_verified"
        row["verification_source"] = "openalex"
        row["query"] = str(candidate.get("why_relevant") or "").strip() or row.get("query")
        verified_rows.append(row)
        if len(verified_rows) >= limit:
            break
    return verified_rows


def _score_paper_relevance(*, row: dict, claim_payload: dict, search_plan: dict) -> tuple[float, list[str]]:
    title = str(row.get("title") or "")
    abstract = str(row.get("abstract") or "")
    journal = str(row.get("journal") or "")
    query = str(row.get("query") or "")
    combined = f"{title} {abstract}".strip()

    claim_terms = set(_extract_content_terms(
        str(claim_payload.get("claim_text") or ""),
        str(claim_payload.get("normalized_claim") or ""),
        str(claim_payload.get("transcript_excerpt") or ""),
    ))
    entity_terms = set(_extract_content_terms(
        str(search_plan.get("subject") or ""),
        str(search_plan.get("intervention_or_exposure") or ""),
        str(search_plan.get("outcome") or ""),
        str(search_plan.get("mechanism") or ""),
        str(search_plan.get("population") or ""),
    ))
    title_terms = set(_tokenize_text(title))
    abstract_terms = set(_tokenize_text(abstract))
    combined_terms = title_terms | abstract_terms
    query_terms = set(_tokenize_text(query))

    score = 0.0
    notes: list[str] = []
    if claim_terms:
        title_overlap = len(claim_terms & title_terms) / max(len(claim_terms), 1)
        abstract_overlap = len(claim_terms & abstract_terms) / max(len(claim_terms), 1)
        score += title_overlap * 0.38
        score += abstract_overlap * 0.22
        if title_overlap > 0:
            notes.append("title overlaps claim terms")
        if abstract_overlap > 0.1:
            notes.append("abstract overlaps claim terms")
    if entity_terms:
        entity_overlap = len(entity_terms & combined_terms) / max(len(entity_terms), 1)
        score += entity_overlap * 0.28
        if entity_overlap > 0.1:
            notes.append("matches extracted scientific entities")
    if query_terms:
        query_overlap = len(query_terms & combined_terms) / max(len(query_terms), 1)
        score += query_overlap * 0.12
        if query_overlap > 0.15:
            notes.append("aligned with a targeted query")

    recency_year = row.get("year")
    try:
        if recency_year:
            years_old = max(0, 2026 - int(recency_year))
            score += max(0.0, 0.06 - min(years_old, 15) * 0.003)
    except (TypeError, ValueError):
        pass

    citation_bonus = min(math.log1p(max(int(row.get("cited_by_count") or 0), 0)) / 12.0, 0.08)
    score += citation_bonus

    lower_title = title.lower()
    lower_journal = journal.lower()
    for pattern in GENERIC_TITLE_PATTERNS:
        if pattern in lower_title or pattern in lower_journal:
            score -= 0.28
            notes.append(f"penalized generic paper type: {pattern}")
            break
    if "systematic review" in lower_title or "meta-analysis" in lower_title:
        if len(claim_terms & title_terms) == 0 and len(entity_terms & title_terms) == 0:
            score -= 0.08
            notes.append("broad review with weak direct title match")

    normalized_score = max(0.0, min(score, 1.0))
    if normalized_score >= 0.45:
        notes.insert(0, "strong direct relevance")
    elif normalized_score >= 0.28:
        notes.insert(0, "moderate direct relevance")
    else:
        notes.insert(0, "weak direct relevance")
    return normalized_score, notes[:4]


async def retrieve_openalex_papers_for_claim(
    *,
    db: AsyncSession,
    claim_text: str,
    normalized_claim: str,
    transcript_excerpt: str = "",
    override_queries: list[str] | None = None,
    per_query_limit: int = 8,
) -> dict:
    harvester = OpenAlexHarvester(db)
    claim_payload = {
        "claim_text": claim_text,
        "normalized_claim": normalized_claim,
        "transcript_excerpt": transcript_excerpt,
    }
    search_plan = await _build_claim_search_plan(
        claim_text=claim_text,
        normalized_claim=normalized_claim,
        transcript_excerpt=transcript_excerpt,
    )
    queries = _dedupe_strings(override_queries or [])
    if not queries:
        queries = search_plan.get("queries", []) or _derive_openalex_queries(claim_text, normalized_claim, transcript_excerpt)
    results: list[dict] = []
    seen_ids: set[str] = set()

    for query in queries:
        raw_papers = await harvester.fetch_papers(
            query=query,
            per_page=per_query_limit,
            relaxed_filters=True,
        )
        for raw in raw_papers:
            paper_id = str(raw.get("id") or "").strip()
            if not paper_id or paper_id in seen_ids:
                continue
            seen_ids.add(paper_id)
            results.append(_paper_row_from_openalex(raw, query))

    if len(results) < 6:
        for query in queries:
            try:
                raw_papers = await _openalex_lookup_works(search=query, per_page=max(per_query_limit, 10))
            except Exception as exc:
                logger.warning(f"Broader OpenAlex fallback failed for '{query}': {exc}")
                continue
            for raw in raw_papers:
                paper_id = str(raw.get("id") or "").strip()
                if not paper_id or paper_id in seen_ids:
                    continue
                seen_ids.add(paper_id)
                results.append(_paper_row_from_openalex(raw, query))

    fallback_rows: list[dict] = []
    if len(results) < 8:
        for row in await _ai_fallback_verified_papers(
            claim=claim_payload,
            queries=queries,
            limit=max(6, 16 - len(results)),
        ):
            openalex_id = str(row.get("openalex_id") or "").strip()
            if not openalex_id or openalex_id in seen_ids:
                continue
            seen_ids.add(openalex_id)
            fallback_rows.append(row)
            results.append(row)

    scored_results: list[dict] = []
    for row in results:
        retrieval_score, retrieval_notes = _score_paper_relevance(
            row=row,
            claim_payload=claim_payload,
            search_plan=search_plan,
        )
        scored_results.append(
            {
                **row,
                "retrieval_score": retrieval_score,
                "retrieval_notes": retrieval_notes,
            }
        )

    strong_results = [row for row in scored_results if float(row.get("retrieval_score") or 0.0) >= 0.18]
    kept_results = strong_results if len(strong_results) >= 5 else scored_results
    kept_results.sort(
        key=lambda row: (
            float(row.get("retrieval_score") or 0.0),
            int(row.get("cited_by_count") or 0),
        ),
        reverse=True,
    )
    return {
        "queries_used": queries,
        "papers": kept_results[:30],
        "verified_ai_fallback_count": len(fallback_rows),
        "total_verified_papers": min(len(kept_results), 30),
        "search_plan": search_plan,
    }


async def cut_claim_clip(
    *,
    video_path: str,
    job_id: str,
    claim_id: str,
    start_time_seconds: float,
    end_time_seconds: float,
) -> dict:
    clip_start = max(0.0, start_time_seconds - 0.75)
    clip_end = max(clip_start + 0.75, end_time_seconds + 1.0)
    filename = f"{_slugify(claim_id, 'claim')}.mp4"
    output_path, clip_url = _job_urls(job_id, f"clips/{filename}")
    await _run_command([
        "ffmpeg",
        "-y",
        "-ss",
        f"{clip_start:.2f}",
        "-to",
        f"{clip_end:.2f}",
        "-i",
        video_path,
        "-vf",
        "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        output_path,
    ])
    return {
        "clip_url": clip_url,
        "clip_start_time_seconds": round(clip_start, 2),
        "clip_end_time_seconds": round(clip_end, 2),
    }


async def generate_stitch_preview(
    *,
    video_path: str,
    job_id: str,
    claim_id: str,
    claim_text: str = "",
    start_time_seconds: float,
    end_time_seconds: float,
    overlay_text: str = "STITCH INCOMING",
    overall_rating: float = 0.0,
    trust_label: str = "",
    verdict_summary: str = "",
    thirty_second_summary: str = "",
    support_count: int = 0,
    refute_count: int = 0,
    mixed_count: int = 0,
) -> dict:
    clip_start = max(0.0, start_time_seconds)
    clip_end = max(clip_start + 0.75, end_time_seconds)
    tail_duration = 9.4
    duration = max(0.75, clip_end - clip_start)
    freeze_start = max(duration - 0.05, 0.0)
    filename = f"{_slugify(claim_id, 'claim')}-stitch-preview.mp4"
    output_path, preview_url = _job_urls(job_id, f"stitch_previews/{filename}")

    font_file = _find_drawtext_font()
    font_prefix = f"fontfile={font_file}:" if font_file else ""
    overlay_label = _escape_drawtext(overlay_text or "STITCH INCOMING")
    claim_question = _escape_drawtext(_build_claim_question(claim_text or verdict_summary or overlay_text))
    rating_text = _escape_drawtext(f"{overall_rating:.1f} / 5" if overall_rating > 0 else "RATING PENDING")
    trust_text = _escape_drawtext(trust_label.strip().upper() or "ANALYSIS ONLINE")
    analysis_online_text = _escape_drawtext("ANALYSIS://ONLINE")
    verdict_label_text = _escape_drawtext("VERDICT")
    why_label_text = _escape_drawtext("WHY IT GOT THIS RATING")
    papers_caption_text = _escape_drawtext("FULL ANALYSIS + PAPERS LINKED IN CAPTION")
    review_count = support_count + refute_count + mixed_count
    verdict_lines = _wrap_overlay_lines(verdict_summary or overlay_text, max_chars=24, max_lines=2)
    reason_text = thirty_second_summary or verdict_summary
    summary_lines = _wrap_overlay_lines(reason_text, max_chars=28, max_lines=3)
    metrics_line = _escape_drawtext(f"{review_count} PAPERS  {support_count} SUPPORT  {refute_count} REFUTE  {mixed_count} MIXED")
    overlay_title = _escape_drawtext("CLAIM UNDER REVIEW")
    trust_score_label = _escape_drawtext("TRUST SCORE")
    gauge_color = "0x00ffaa" if overall_rating >= 3.5 else ("0xffd166" if overall_rating >= 2.5 else "0xff5c7a")
    card_positions = [
        (176, 1060), (378, 1060), (580, 1060), (782, 1060),
        (176, 1166), (378, 1166), (580, 1166), (782, 1166),
    ]
    center_overlay = (
        f"[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,split=2[v0base][vfreeze];"
        f"[v0base]trim=duration={duration:.2f},setpts=PTS-STARTPTS,"
        f"drawbox=x=112:y=560:w=856:h=300:color=black@0.26:t=fill,"
        f"drawbox=x=112:y=560:w=856:h=300:color=0x00ffaa@0.08:t=2,"
        f"drawtext={font_prefix}text='{overlay_title}':fontsize=30:fontcolor=0x9afee7:x=(w-text_w)/2:y=616:enable='between(t,0.06,{duration})',"
        f"drawtext={font_prefix}text='{claim_question}':fontsize=68:fontcolor=white:x=(w-text_w)/2:y=690:enable='between(t,0.16,{duration})',"
        f"drawtext={font_prefix}text='{overlay_label}':fontsize=26:fontcolor=0x9afee7:x=(w-text_w)/2:y=790:enable='between(t,0.34,{duration})',"
        f"format=yuv420p[v0]"
    )
    summary_filters: list[str] = []
    summary_start = 5.15
    for idx, line in enumerate(summary_lines):
        summary_filters.extend(
            _typed_drawtext_sequence(
                text=line,
                start_time=summary_start + idx * 0.8,
                step_duration=0.16,
                x="178",
                y=str(772 + idx * 68),
                fontsize=34,
                fontcolor="white",
                font_prefix=font_prefix,
            )
        )
    verdict_filters: list[str] = []
    verdict_base_y = 560
    for idx, line in enumerate(verdict_lines):
        verdict_filters.extend(
            _typed_drawtext_sequence(
                text=line,
                start_time=2.0 + idx * 0.55,
                step_duration=0.16,
                x="180",
                y=str(verdict_base_y + idx * 60),
                fontsize=42,
                fontcolor="white",
                font_prefix=font_prefix,
            )
        )
    paper_card_filters: list[str] = []
    support_remaining = max(0, support_count)
    mixed_remaining = max(0, mixed_count)
    total_cards = min(max(review_count, 4), 8)
    for idx in range(total_cards):
        x, y = card_positions[idx]
        start_t = 6.4 + idx * 0.09
        card_color = "0x00ffaa"
        if idx >= support_remaining:
            card_color = "0xffd166" if mixed_remaining > 0 else "0xffffff"
        if idx >= support_remaining and mixed_remaining > 0:
            mixed_remaining -= 1
        fly_expr = f"if(lt(t,{start_t:.2f}),1180,max({x},1180-(t-{start_t:.2f})*2200))"
        paper_card_filters.append(
            f"drawbox=x='{fly_expr}':y={y}:w=126:h=72:color={card_color}@0.22:t=fill:enable='between(t,{start_t:.2f},{tail_duration})'"
        )
        paper_card_filters.append(
            f"drawbox=x='{fly_expr}':y={y}:w=126:h=72:color={card_color}@0.82:t=2:enable='between(t,{start_t:.2f},{tail_duration})'"
        )
    tail_bg_prelude = (
        f"[vfreeze]trim=start={freeze_start:.2f}:duration=0.05,setpts=PTS-STARTPTS,"
        f"tpad=stop_mode=clone:stop_duration={tail_duration:.2f},trim=duration={tail_duration:.2f},"
        f"gblur=sigma=18,eq=brightness=-0.20:saturation=0.55,format=rgba[v1base]"
    )
    tail_filter_parts = [
        "[v1base]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.40:t=fill",
        "drawgrid=w=iw:h=60:t=1:c=0x00ffaa@0.05",
        "drawbox=x=112:y=118:w=856:h=1328:color=white@0.06:t=fill",
        "drawbox=x=112:y=118:w=856:h=1328:color=0x00ffaa@0.10:t=2",
        "drawbox=x=140:y=172:w=800:h=1220:color=white@0.08:t=fill",
        f"drawtext={font_prefix}text='{analysis_online_text}':fontsize=34:fontcolor=0x9afee7:x=92:y=136:enable='between(t,0.0,{tail_duration})'",
        f"drawtext={font_prefix}text='{trust_score_label}':fontsize=24:fontcolor=0x9afee7:x=(w-text_w)/2:y=214:enable='between(t,0.28,{tail_duration})'",
        f"drawtext={font_prefix}text='◔':fontsize=230:fontcolor={gauge_color}:x=200:y=196:enable='between(t,0.45,0.72)'",
        f"drawtext={font_prefix}text='◑':fontsize=230:fontcolor={gauge_color}:x=200:y=196:enable='between(t,0.72,0.99)'",
        f"drawtext={font_prefix}text='◕':fontsize=230:fontcolor={gauge_color}:x=200:y=196:enable='between(t,0.99,1.26)'",
        f"drawtext={font_prefix}text='●':fontsize=230:fontcolor={gauge_color}:x=200:y=196:enable='between(t,1.26,{tail_duration})'",
        f"drawtext={font_prefix}text='{rating_text}':fontsize=108:fontcolor=white:x=318:y=270:enable='between(t,0.45,{tail_duration})'",
        f"drawtext={font_prefix}text='{trust_text}':fontsize=30:fontcolor={gauge_color}:x=360:y=402:enable='between(t,1.1,{tail_duration})'",
        f"drawtext={font_prefix}text='{verdict_label_text}':fontsize=22:fontcolor=0x9afee7:x=178:y=512:enable='between(t,1.7,{tail_duration})'",
        f"drawtext={font_prefix}text='{why_label_text}':fontsize=22:fontcolor=0x9afee7:x=178:y=724:enable='between(t,4.7,{tail_duration})'",
        f"drawtext={font_prefix}text='{metrics_line}':fontsize=24:fontcolor=0x9afee7:x=(w-text_w)/2:y=1298:enable='between(t,7.2,{tail_duration})'",
    ]
    tail_filter_parts.extend(verdict_filters)
    tail_filter_parts.extend(summary_filters)
    tail_filter_parts.extend(paper_card_filters)
    tail_filter_parts.extend(
        [
            f"drawtext={font_prefix}text='{papers_caption_text}':fontsize=30:fontcolor=white:x=(w-text_w)/2:y=1372:enable='between(t,8.0,{tail_duration})'",
            "eq=contrast=1.10:brightness=0.02:saturation=0.0",
            "format=yuv420p[v1]",
        ]
    )
    tail_filter = ";".join([center_overlay, tail_bg_prelude, ",".join(tail_filter_parts)])

    await _run_command([
        "ffmpeg",
        "-y",
        "-ss",
        f"{clip_start:.2f}",
        "-to",
        f"{clip_end:.2f}",
        "-i",
        video_path,
        "-f",
        "lavfi",
        "-i",
        f"anullsrc=r=48000:cl=stereo:d={tail_duration}",
        "-filter_complex",
        f"{tail_filter};[0:a]atrim=duration={duration:.2f},asetpts=PTS-STARTPTS,aresample=48000,volume=1[a0];[1:a]atrim=duration={tail_duration},volume=0.8[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]",
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        output_path,
    ])
    return {
        "preview_url": preview_url,
        "selected_start_time_seconds": round(clip_start, 2),
        "selected_end_time_seconds": round(clip_end, 2),
        "overlay_text": overlay_text.strip() or "STITCH INCOMING",
        "tail_duration_seconds": tail_duration,
    }


async def render_stitch_look_dev(
    *,
    question: str,
    rating: float,
    trust_label: str,
    verdict: str,
    rationale: str,
    support_count: int,
    mixed_count: int,
    refute_count: int,
    selected_start_time_seconds: float = 0.0,
    selected_end_time_seconds: float = 0.0,
    background_video_path: str | None = None,
    duration_seconds: float = 9.0,
) -> dict:
    clip_duration_seconds = max(0.75, selected_end_time_seconds - selected_start_time_seconds)
    timing = _build_stitch_timing(question, rationale, clip_duration_seconds, duration_seconds)
    normalized_rationale = timing["normalized_rationale"]
    resolved_duration_seconds = float(timing["resolved_duration_seconds"])
    logger.info(
        "Stitch look dev duration resolved",
        clip_duration_seconds=round(clip_duration_seconds, 2),
        tail_duration_seconds=round(float(timing["tail_duration_seconds"]), 2),
        rationale_word_count=timing["total_words"],
        rationale_words_per_second=float(timing["words_per_second"]),
        requested_duration_seconds=round(duration_seconds, 2),
        resolved_duration_seconds=round(resolved_duration_seconds, 2),
    )
    output_name = f"look_dev/stitch-look-dev-{uuid.uuid4().hex[:8]}.mp4"
    spec = {
        "composition_id": "StitchLookDev",
        "duration_seconds": resolved_duration_seconds,
        "background_video_path": background_video_path or "",
        "stitch_preview": {
            "question": question,
            "rating": rating,
            "trust_label": trust_label,
            "verdict": verdict,
            "rationale": normalized_rationale,
            "support_count": support_count,
            "mixed_count": mixed_count,
            "refute_count": refute_count,
            "selected_start_time_seconds": selected_start_time_seconds,
            "selected_end_time_seconds": selected_end_time_seconds,
            "background_video_path": background_video_path or "",
            "timing": {
                "words_per_second": timing["words_per_second"],
                "rationale_intro_seconds": timing["rationale_intro_seconds"],
                "bullet_gap_seconds": timing["bullet_gap_seconds"],
                "caption_lead_seconds": timing["caption_lead_seconds"],
                "caption_fade_seconds": timing["caption_fade_seconds"],
                "caption_hold_seconds": timing["caption_hold_seconds"],
            },
        },
    }
    preview_url = await _render_with_remotion_spec(spec, output_name)
    return {
        "preview_url": preview_url,
        "duration_seconds": resolved_duration_seconds,
    }


async def generate_fact_check_hook_question(
    *,
    claim_text: str,
    trust_label: str = "",
    verdict_summary: str = "",
    papers: list[dict] | None = None,
) -> str:
    if not (settings.OPENAI_API_KEY or settings.GEMINI_API_KEY):
        logger.warning("Hook question generation skipped because no text LLM credentials are configured")
        return ""

    compact_papers = [
        {
            "title": str(paper.get("title") or "").strip(),
            "year": paper.get("year"),
            "stance": str(paper.get("stance") or "").strip(),
            "evidence_note": _truncate_text(str(paper.get("evidence_note") or ""), 180),
        }
        for paper in (papers or [])[:3]
        if str(paper.get("title") or "").strip()
    ]

    for model_name in ("gpt-4o-mini", "gpt-4o"):
        try:
            response = await complete_text(
                capability="fact_check_hook_question",
                default_openai_model=model_name,
                temperature=0.7,
                max_tokens=60,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Write one short social-video hook question for a science fact-check video. "
                            "Requirements: 4 to 9 words, complete sentence, accurate, punchy, specific, no cutoff fragments, no clickbait that overstates the evidence, "
                            "must end with a question mark, and must stay true to the exact claim text. "
                            "Prefer concrete outcomes like ANXIETY, STRESS, SLEEP, BLOOD SUGAR, MORTALITY, etc. instead of vague words like ISSUES or SYSTEM unless unavoidable. "
                            "Bad: 'VITAMIN B1 WORKS ON NEUROLOGICAL?' "
                            "Good: 'CAN THIAMINE REALLY HELP ANXIETY?' "
                            "Return only the final hook question in ALL CAPS."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "claim_text": claim_text,
                                "trust_label": trust_label,
                                "verdict_summary": verdict_summary,
                                "top_papers": compact_papers,
                            },
                            ensure_ascii=False,
                        ),
                    },
                ],
            )
            question = str(response.text or "").strip().replace("\n", " ")
            question = re.sub(r"\s+", " ", question).strip().strip('"').strip("'")
            if not question:
                continue
            if not question.endswith("?"):
                question = f"{question.rstrip('.!')}?"
            question = question.upper()
            logger.info(
                f"Generated fact-check look-dev question | provider={response.provider} | "
                f"model={response.model} | question={question}"
            )
            return question
        except Exception as exc:
            logger.warning(f"Hook question generation failed on {model_name}: {exc}")
    return ""


async def analyze_claim_against_papers(
    *,
    claim: dict,
    papers: list[dict],
    queries_used: list[str] | None = None,
    ai_fallback_used: bool = False,
) -> dict:
    if not (settings.OPENAI_API_KEY or settings.GEMINI_API_KEY):
        raise RuntimeError("A text LLM API key is required for claim analysis")

    trimmed_papers = papers[:12]
    llm_papers = [_compact_paper_for_llm(paper) for paper in trimmed_papers]
    evidence_stats = _build_evidence_stats(trimmed_papers)
    response = await complete_text(
        capability="fact_check_claim_analysis",
        default_openai_model="gpt-4o",
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=1800,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a paper-first scientific fact checker for social media claims. "
                    "Assess the claim using the supplied papers. "
                    "Use the supplied papers only. "
                    "Return strict JSON with keys: overall_rating, trust_label, verdict_summary, thirty_second_summary, papers. "
                    "overall_rating must be a number from 1 to 5. "
                    "The verdict_summary and thirty_second_summary should highlight useful numbers when present: sample sizes, percentages, years, effect sizes, or count of papers reviewed. "
                    "Do not invent numbers. Only use numbers that appear in the supplied evidence_stats or the supplied papers. "
                    "If the evidence includes no meaningful quantitative details, explicitly say the evidence is mostly qualitative. "
                    "For each paper in papers, include title, paper_url, stance (supports|refutes|mixed|tangential), relevance_score (0 to 1), evidence_note, "
                    "study_type (meta_analysis|systematic_review|rct|human_trial|cohort|case_control|cross_sectional|observational|review|animal_experiment|in_vitro), "
                    "population_type (human|mixed|animal|cell|unclear), and directness (direct|indirect|mechanistic|tangential). "
                    "Be cautious. If evidence is mixed or weak, say so clearly. "
                    "If the evidence base is thin, acknowledge that any fallback reasoning is weaker than paper-backed evidence."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "claim": claim,
                        "papers": llm_papers,
                        "evidence_stats": evidence_stats,
                        "queries_used": queries_used or [],
                        "ai_fallback_used": ai_fallback_used,
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    )
    content = response.text.strip()
    payload = json.loads(content) if content else {}
    paper_assessments = payload.get("papers", []) if isinstance(payload, dict) else []
    assessed_map = {
        str(item.get("title") or "").strip(): item
        for item in paper_assessments
        if isinstance(item, dict) and str(item.get("title") or "").strip()
    }

    merged_papers: list[dict] = []
    for paper in trimmed_papers:
        assessment = assessed_map.get(paper["title"], {})
        inferred_population_type = _infer_population_type(
            title=str(paper.get("title") or ""),
            abstract=str(paper.get("abstract") or ""),
        )
        inferred_study_type = _infer_study_type(
            title=str(paper.get("title") or ""),
            abstract=str(paper.get("abstract") or ""),
            population_type=inferred_population_type,
        )
        inferred_directness = _infer_directness(
            claim_text=str(claim.get("claim_text") or ""),
            title=str(paper.get("title") or ""),
            abstract=str(paper.get("abstract") or ""),
            population_type=inferred_population_type,
        )
        evidence_note = str(assessment.get("evidence_note") or "").strip()
        stance = _normalize_paper_stance(
            claim_text=str(claim.get("claim_text") or ""),
            paper=paper,
            stance=str(assessment.get("stance") or "tangential"),
            inferred_population_type=inferred_population_type,
            inferred_study_type=inferred_study_type,
            inferred_directness=inferred_directness,
            evidence_note=evidence_note,
        )
        counted_in_tally = stance in {"supports", "refutes", "mixed"}
        merged_papers.append(
            {
                **paper,
                "stance": stance,
                "relevance_score": max(0.0, min(float(assessment.get("relevance_score") or 0.0), 1.0)),
                "evidence_note": evidence_note or None,
                "study_type": str(assessment.get("study_type") or inferred_study_type),
                "population_type": str(assessment.get("population_type") or inferred_population_type),
                "directness": str(assessment.get("directness") or inferred_directness),
                "counted_in_tally": counted_in_tally,
                "counted_reason": "counted" if counted_in_tally else "tangential",
            }
        )

    supports = sum(1 for paper in merged_papers if paper["stance"] == "supports")
    refutes = sum(1 for paper in merged_papers if paper["stance"] == "refutes")
    mixed = sum(1 for paper in merged_papers if paper["stance"] == "mixed")
    tangential = sum(1 for paper in merged_papers if paper["stance"] == "tangential")
    counted_paper_count = supports + refutes + mixed
    counted_papers = [paper for paper in merged_papers if paper.get("counted_in_tally")]
    weighted_score, weighted_trust_label, score_breakdown = _compute_weighted_trust_score(
        claim_text=str(claim.get("claim_text") or ""),
        papers=merged_papers,
    )

    return {
        "overall_rating": weighted_score,
        "trust_label": weighted_trust_label,
        "verdict_summary": str(payload.get("verdict_summary") or "").strip(),
        "thirty_second_summary": str(payload.get("thirty_second_summary") or "").strip(),
        "support_count": supports,
        "refute_count": refutes,
        "mixed_count": mixed,
        "counted_paper_count": counted_paper_count,
        "tangential_count": tangential,
        "considered_but_not_counted_count": tangential,
        "papers": merged_papers,
        "paper_links": [paper["paper_url"] for paper in counted_papers if paper.get("paper_url")],
        "queries_used": queries_used or [],
        "ai_fallback_used": ai_fallback_used,
        "verified_paper_count": len(merged_papers),
        "evidence_stats": evidence_stats,
        "score_breakdown": score_breakdown,
    }
