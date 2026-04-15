import json
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.social_fact_checker import (
    analyze_claim_against_papers,
    cut_claim_clip,
    extract_claims_from_transcript,
    generate_fact_check_hook_question,
    generate_stitch_preview,
    ingest_youtube_video,
    render_stitch_look_dev,
    retrieve_openalex_papers_for_claim,
)

router = APIRouter()


def _job_dir(job_id: str) -> Path:
    return Path(os.getcwd()) / "static" / "fact_checker" / job_id


def _job_file(job_id: str) -> Path:
    return _job_dir(job_id) / "job.json"


def _claims_file(job_id: str) -> Path:
    return _job_dir(job_id) / "claims.json"


def _write_json(path: Path, payload: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _read_json(path: Path) -> dict | list:
    if not path.exists():
        raise FileNotFoundError(str(path))
    return json.loads(path.read_text(encoding="utf-8"))


class FactCheckWordTimestamp(BaseModel):
    word: str
    start: float
    end: float


class FactCheckClaim(BaseModel):
    claim_id: str
    claim_text: str
    normalized_claim: str
    start_time_seconds: float
    end_time_seconds: float
    transcript_excerpt: str
    factuality_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    suggested_queries: list[str] = Field(default_factory=list)


class IngestYoutubeRequest(BaseModel):
    url: str


class IngestYoutubeResponse(BaseModel):
    job_id: str
    source_url: str
    title: str
    channel_name: str = ""
    duration_seconds: float = 0.0
    video_url: str
    audio_url: str
    transcript: str
    word_timestamps: list[FactCheckWordTimestamp]


class ExtractClaimsRequest(BaseModel):
    job_id: str


class ExtractClaimsResponse(BaseModel):
    claims: list[FactCheckClaim]


class FactCheckPaperMatch(BaseModel):
    source: str = "openalex"
    query: str | None = None
    title: str
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    doi: str | None = None
    openalex_id: str | None = None
    abstract: str | None = None
    paper_url: str | None = None
    cited_by_count: int = 0
    journal: str | None = None
    verified: bool = True
    verification_source: str | None = None
    retrieval_score: float = Field(default=0.0, ge=0.0, le=1.0)
    retrieval_notes: list[str] = Field(default_factory=list)
    stance: str = "tangential"
    relevance_score: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence_note: str | None = None
    counted_in_tally: bool = False
    counted_reason: str = "tangential"


class AnalyzeClaimRequest(BaseModel):
    job_id: str
    claim_id: str
    queries: list[str] = Field(default_factory=list)
    analysis_claim_text: str = ""


class AnalyzeClaimResponse(BaseModel):
    claim: FactCheckClaim
    analysis_claim_text: str
    look_dev_question: str = ""
    clip_url: str
    clip_start_time_seconds: float
    clip_end_time_seconds: float
    overall_rating: float = Field(ge=1.0, le=5.0)
    trust_label: str
    verdict_summary: str
    thirty_second_summary: str
    support_count: int = 0
    refute_count: int = 0
    mixed_count: int = 0
    counted_paper_count: int = 0
    tangential_count: int = 0
    considered_but_not_counted_count: int = 0
    queries_used: list[str] = Field(default_factory=list)
    ai_fallback_used: bool = False
    verified_paper_count: int = 0
    papers: list[FactCheckPaperMatch]
    paper_links: list[str] = Field(default_factory=list)


class GenerateHookQuestionRequest(BaseModel):
    claim_text: str
    trust_label: str = ""
    verdict_summary: str = ""


class GenerateHookQuestionResponse(BaseModel):
    question: str


class GenerateStitchPreviewRequest(BaseModel):
    job_id: str
    claim_id: str
    selected_start_time_seconds: float
    selected_end_time_seconds: float
    overlay_text: str = "STITCH INCOMING"
    overall_rating: float = 0.0
    trust_label: str = ""
    verdict_summary: str = ""
    thirty_second_summary: str = ""
    support_count: int = 0
    refute_count: int = 0
    mixed_count: int = 0


class GenerateStitchPreviewResponse(BaseModel):
    claim: FactCheckClaim
    preview_url: str
    selected_start_time_seconds: float
    selected_end_time_seconds: float
    overlay_text: str
    tail_duration_seconds: float


class RenderStitchLookDevRequest(BaseModel):
    job_id: str | None = None
    question: str
    rating: float = Field(default=4.0, ge=0.0, le=5.0)
    trust_label: str = "MOSTLY SUPPORTED"
    verdict: str = ""
    rationale: str = ""
    support_count: int = 0
    refute_count: int = 0
    mixed_count: int = 0
    selected_start_time_seconds: float = 0.0
    selected_end_time_seconds: float = 0.0
    duration_seconds: float = Field(default=9.0, ge=4.0, le=20.0)
    use_source_background: bool = True


class RenderStitchLookDevResponse(BaseModel):
    preview_url: str
    duration_seconds: float
    source_background_used: bool = False


@router.post("/ingest-youtube", response_model=IngestYoutubeResponse)
async def ingest_youtube(request: IngestYoutubeRequest):
    try:
        payload = await ingest_youtube_video(request.url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to ingest video: {exc}") from exc

    _write_json(_job_file(payload["job_id"]), payload)
    return IngestYoutubeResponse(**payload)


@router.post("/extract-claims", response_model=ExtractClaimsResponse)
async def extract_claims(request: ExtractClaimsRequest):
    try:
        job = _read_json(_job_file(request.job_id))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Fact-check job not found") from exc

    try:
        claims = await extract_claims_from_transcript(
            transcript=str(job.get("transcript") or ""),
            word_timestamps=list(job.get("word_timestamps") or []),
            title=str(job.get("title") or ""),
            channel_name=str(job.get("channel_name") or ""),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to extract claims: {exc}") from exc

    _write_json(_claims_file(request.job_id), claims)
    return ExtractClaimsResponse(claims=[FactCheckClaim(**claim) for claim in claims])


@router.post("/generate-hook-question", response_model=GenerateHookQuestionResponse)
async def generate_hook_question(request: GenerateHookQuestionRequest):
    claim_text = str(request.claim_text or "").strip()
    if not claim_text:
        raise HTTPException(status_code=400, detail="Claim text is required")

    try:
        question = await generate_fact_check_hook_question(
            claim_text=claim_text,
            trust_label=str(request.trust_label or "").strip(),
            verdict_summary=str(request.verdict_summary or "").strip(),
            papers=[],
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate hook question: {exc}") from exc

    return GenerateHookQuestionResponse(question=question)


@router.post("/analyze-claim", response_model=AnalyzeClaimResponse)
async def analyze_claim(request: AnalyzeClaimRequest, db: AsyncSession = Depends(get_db)):
    try:
        job = _read_json(_job_file(request.job_id))
        claims = _read_json(_claims_file(request.job_id))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Fact-check job or claims not found") from exc

    selected = next((claim for claim in claims if str(claim.get("claim_id")) == request.claim_id), None)
    if not selected:
        raise HTTPException(status_code=404, detail="Selected claim not found")

    analysis_claim_text = str(request.analysis_claim_text or selected.get("claim_text") or "").strip()
    if not analysis_claim_text:
        raise HTTPException(status_code=400, detail="Analysis claim text is required")

    try:
        clip_payload = await cut_claim_clip(
            video_path=str(job.get("video_path") or ""),
            job_id=request.job_id,
            claim_id=request.claim_id,
            start_time_seconds=float(selected.get("start_time_seconds") or 0.0),
            end_time_seconds=float(selected.get("end_time_seconds") or 0.0),
        )
        papers = await retrieve_openalex_papers_for_claim(
            db=db,
            claim_text=analysis_claim_text,
            normalized_claim=analysis_claim_text,
            transcript_excerpt=str(selected.get("transcript_excerpt") or ""),
            override_queries=request.queries,
        )
        logger.info(
            "Fact-check paper retrieval completed",
            job_id=request.job_id,
            claim_id=request.claim_id,
            analysis_claim_text=analysis_claim_text,
            queries_used=papers.get("queries_used", []),
            paper_count=len(papers.get("papers", [])),
            verified_paper_count=int(papers.get("total_verified_papers") or 0),
            verified_ai_fallback_count=int(papers.get("verified_ai_fallback_count") or 0),
        )
        top_titles = [
            str(paper.get("title") or "").strip()
            for paper in papers.get("papers", [])[:5]
            if str(paper.get("title") or "").strip()
        ]
        if top_titles:
            logger.info(
                "Top retrieved papers for fact-check claim",
                job_id=request.job_id,
                claim_id=request.claim_id,
                top_titles=top_titles,
            )
        logger.info(
            "Starting fact-check evidence analysis",
            job_id=request.job_id,
            claim_id=request.claim_id,
            trimmed_paper_count=min(len(papers.get("papers", [])), 20),
        )
        analysis = await analyze_claim_against_papers(
            claim={
                **selected,
                "claim_text": analysis_claim_text,
                "normalized_claim": analysis_claim_text,
            },
            papers=papers["papers"],
            queries_used=papers["queries_used"],
            ai_fallback_used=bool(papers.get("verified_ai_fallback_count")),
        )
        look_dev_question = await generate_fact_check_hook_question(
            claim_text=analysis_claim_text,
            trust_label=str(analysis.get("trust_label") or ""),
            verdict_summary=str(analysis.get("verdict_summary") or ""),
            papers=list(analysis.get("papers") or []),
        )
        logger.info(
            "Fact-check evidence analysis completed",
            job_id=request.job_id,
            claim_id=request.claim_id,
            overall_rating=analysis.get("overall_rating"),
            trust_label=analysis.get("trust_label"),
            support_count=analysis.get("support_count"),
            refute_count=analysis.get("refute_count"),
            mixed_count=analysis.get("mixed_count"),
        )
    except Exception as exc:
        logger.exception(
            "Fact-check claim analysis failed",
            job_id=request.job_id,
            claim_id=request.claim_id,
            analysis_claim_text=analysis_claim_text,
        )
        raise HTTPException(status_code=500, detail=f"Failed to analyze claim: {exc}") from exc

    return AnalyzeClaimResponse(
        claim=FactCheckClaim(**selected),
        analysis_claim_text=analysis_claim_text,
        look_dev_question=look_dev_question,
        clip_url=clip_payload["clip_url"],
        clip_start_time_seconds=clip_payload["clip_start_time_seconds"],
        clip_end_time_seconds=clip_payload["clip_end_time_seconds"],
        overall_rating=analysis["overall_rating"],
        trust_label=analysis["trust_label"],
        verdict_summary=analysis["verdict_summary"],
        thirty_second_summary=analysis["thirty_second_summary"],
        support_count=analysis["support_count"],
        refute_count=analysis["refute_count"],
        mixed_count=analysis["mixed_count"],
        counted_paper_count=analysis["counted_paper_count"],
        tangential_count=analysis["tangential_count"],
        considered_but_not_counted_count=analysis["considered_but_not_counted_count"],
        queries_used=analysis["queries_used"],
        ai_fallback_used=analysis["ai_fallback_used"],
        verified_paper_count=analysis["verified_paper_count"],
        papers=[FactCheckPaperMatch(**paper) for paper in analysis["papers"]],
        paper_links=analysis["paper_links"],
    )


@router.post("/generate-stitch-preview", response_model=GenerateStitchPreviewResponse)
async def generate_stitch_preview_endpoint(request: GenerateStitchPreviewRequest):
    try:
        job = _read_json(_job_file(request.job_id))
        claims = _read_json(_claims_file(request.job_id))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Fact-check job or claims not found") from exc

    selected = next((claim for claim in claims if str(claim.get("claim_id")) == request.claim_id), None)
    if not selected:
        raise HTTPException(status_code=404, detail="Selected claim not found")

    clip_start = max(0.0, request.selected_start_time_seconds)
    clip_end = max(clip_start + 0.75, request.selected_end_time_seconds)
    try:
        payload = await generate_stitch_preview(
            video_path=str(job.get("video_path") or ""),
            job_id=request.job_id,
            claim_id=request.claim_id,
            claim_text=str(selected.get("claim_text") or ""),
            start_time_seconds=clip_start,
            end_time_seconds=clip_end,
            overlay_text=request.overlay_text,
            overall_rating=request.overall_rating,
            trust_label=request.trust_label,
            verdict_summary=request.verdict_summary,
            thirty_second_summary=request.thirty_second_summary,
            support_count=request.support_count,
            refute_count=request.refute_count,
            mixed_count=request.mixed_count,
        )
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate stitch preview: {exc}") from exc

    return GenerateStitchPreviewResponse(
        claim=FactCheckClaim(**selected),
        preview_url=payload["preview_url"],
        selected_start_time_seconds=payload["selected_start_time_seconds"],
        selected_end_time_seconds=payload["selected_end_time_seconds"],
        overlay_text=payload["overlay_text"],
        tail_duration_seconds=payload["tail_duration_seconds"],
    )


@router.post("/render-stitch-look-dev", response_model=RenderStitchLookDevResponse)
async def render_stitch_look_dev_endpoint(request: RenderStitchLookDevRequest):
    background_video_path = ""
    if request.job_id and request.use_source_background:
        try:
            job = _read_json(_job_file(request.job_id))
            background_video_path = str(job.get("video_path") or "")
        except FileNotFoundError:
            background_video_path = ""

    try:
        payload = await render_stitch_look_dev(
            question=request.question,
            rating=request.rating,
            trust_label=request.trust_label,
            verdict=request.verdict,
            rationale=request.rationale,
            support_count=request.support_count,
            mixed_count=request.mixed_count,
            refute_count=request.refute_count,
            selected_start_time_seconds=request.selected_start_time_seconds,
            selected_end_time_seconds=request.selected_end_time_seconds,
            background_video_path=background_video_path or None,
            duration_seconds=request.duration_seconds,
        )
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to render stitch look dev: {exc}") from exc

    return RenderStitchLookDevResponse(
        preview_url=payload["preview_url"],
        duration_seconds=payload["duration_seconds"],
        source_background_used=bool(background_video_path),
    )
