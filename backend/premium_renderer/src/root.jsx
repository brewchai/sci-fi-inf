import {
  AbsoluteFill,
  Audio,
  Composition,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const WIDTH = 1080;
const HEIGHT = 1920;
const TALKING_HEAD_WIDTH = 720;
const TALKING_HEAD_HEIGHT = 1280;
const FPS = 30;
const clamp = (value) => Math.max(0, Math.min(1, value));
const lerp = (a, b, t) => a + (b - a) * t;

const toAssetUrl = (src) => src || "";

const toOverlayBullets = (text) => {
  const rawLines = String(text || "")
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-•]+/, "").trim())
    .filter(Boolean);
  return rawLines.slice(0, 5);
};

const wordCount = (text) =>
  String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const wordSlice = (text, frame, startFrame, wordsPerSecond, fps) => {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  const elapsedSeconds = Math.max(0, (frame - startFrame) / fps);
  const visibleWords = Math.min(words.length, Math.ceil(elapsedSeconds * wordsPerSecond));
  return words.slice(0, visibleWords).join(" ");
};

const getBeatFrameRange = (beat, fps) => {
  const startFrame = Math.max(0, Math.floor(Number(beat?.start_time_seconds || 0) * fps));
  const endFrame = Math.max(startFrame + 1, Math.ceil(Number(beat?.end_time_seconds || 0) * fps));
  return {startFrame, endFrame, durationInFrames: Math.max(1, endFrame - startFrame)};
};

const buildEvidenceCards = (supportCount, mixedCount, refuteCount, maxCards = 10) => {
  const exactCards = [
    ...Array.from({length: Math.max(0, supportCount)}, () => "support"),
    ...Array.from({length: Math.max(0, mixedCount)}, () => "mixed"),
    ...Array.from({length: Math.max(0, refuteCount)}, () => "refute"),
  ];
  if (exactCards.length <= maxCards) {
    return exactCards;
  }

  const total = Math.max(1, supportCount + mixedCount + refuteCount);
  const buckets = [
    {type: "support", count: Math.max(0, supportCount)},
    {type: "mixed", count: Math.max(0, mixedCount)},
    {type: "refute", count: Math.max(0, refuteCount)},
  ];

  const allocated = buckets.map((bucket) => ({
    ...bucket,
    cards: Math.floor((bucket.count / total) * maxCards),
    remainder: ((bucket.count / total) * maxCards) % 1,
  }));

  let used = allocated.reduce((sum, bucket) => sum + bucket.cards, 0);
  if (used === 0) {
    const lead = allocated.reduce((best, bucket) => (bucket.count > best.count ? bucket : best), allocated[0]);
    lead.cards = 1;
    used = 1;
  }
  while (used < maxCards) {
    allocated.sort((a, b) => b.remainder - a.remainder || b.count - a.count);
    const next = allocated.find((bucket) => bucket.count > 0) || allocated[0];
    next.cards += 1;
    next.remainder = 0;
    used += 1;
  }

  return allocated.flatMap((bucket) => Array.from({length: bucket.cards}, () => bucket.type)).slice(0, maxCards);
};

const PROGRESS_PHASES = [
  "CHECKING FACTS",
  "SCANNING PAPERS",
  "REVIEWING EVIDENCE",
  "MATCHING SOURCES",
];

const getActiveCaption = (wordTimestamps, timeSeconds) => {
  if (!wordTimestamps?.length) return "";
  const activeIndex = wordTimestamps.findIndex(
    (word) => timeSeconds >= word.start && timeSeconds <= word.end + 0.12,
  );
  if (activeIndex === -1) return "";
  const start = Math.max(0, activeIndex - 2);
  const end = Math.min(wordTimestamps.length, activeIndex + 3);
  return wordTimestamps.slice(start, end).map((word) => word.word).join(" ");
};

const getSceneCaptionText = (scene) => {
  if (!scene || !Object.prototype.hasOwnProperty.call(scene, "caption_text")) {
    return null;
  }
  if (scene.caption_text === null || scene.caption_text === undefined) {
    return null;
  }
  return String(scene.caption_text).trim();
};

const transitionDurationFor = (name) => {
  switch (name) {
    case "hard_cut_blur":
      return 6;
    case "masked_push":
      return 12;
    case "light_sweep_dissolve":
      return 14;
    case "scale_through_zoom":
      return 12;
    case "vertical_reveal":
      return 12;
    case "horizontal_reveal":
      return 12;
    case "soft_flash_cut":
      return 8;
    case "glass_warp":
      return 14;
    case "radial_focus_pull":
      return 12;
    case "split_panel_wipe":
      return 14;
    case "film_burn_edge":
      return 10;
    case "depth_parallax_snap":
      return 10;
    case "ghost_trail_crossfade":
      return 14;
    case "iris_close_open":
      return 12;
    case "depth_blur_handoff":
    default:
      return 10;
  }
};

const SceneAsset = ({scene, progress, entering, transitionName, sceneStartFrame, sceneFxName, sceneFxStrength}) => {
  const zoomBase = scene.motion_preset === "hero_push"
    ? 1.12
    : scene.motion_preset === "parallax_rise"
      ? 1.08
      : scene.motion_preset === "tracking_drift"
        ? 1.05
      : 1.03;

  const driftY = scene.motion_preset === "parallax_rise"
    ? interpolate(progress, [0, 1], entering ? [40, 0] : [0, -40])
    : scene.motion_preset === "micro_jolt"
      ? Math.sin(progress * Math.PI * 12) * 8
      : interpolate(progress, [0, 1], entering ? [18, 0] : [0, -18]);

  const driftX = scene.motion_preset === "tracking_drift"
    ? interpolate(progress, [0, 1], entering ? [24, 0] : [0, -24])
    : transitionName === "depth_parallax_snap"
      ? interpolate(progress, [0, 1], entering ? [48, 0] : [0, -48])
      : 0;

  let scale = entering
    ? interpolate(progress, [0, 1], [zoomBase, 1.0])
    : interpolate(progress, [0, 1], [1.0, 1.06]);

  let blur = transitionName === "depth_blur_handoff"
    ? interpolate(progress, [0, 1], entering ? [18, 0] : [0, 16])
    : transitionName === "hard_cut_blur"
      ? interpolate(progress, [0, 1], entering ? [12, 0] : [0, 12])
      : transitionName === "soft_flash_cut"
        ? interpolate(progress, [0, 1], entering ? [8, 0] : [0, 8])
        : transitionName === "radial_focus_pull"
          ? interpolate(progress, [0, 1], entering ? [14, 0] : [0, 14])
          : transitionName === "ghost_trail_crossfade"
            ? interpolate(progress, [0, 1], entering ? [10, 0] : [0, 10])
      : 0;

  const brightness = transitionName === "film_burn_edge"
    ? interpolate(progress, [0, 1], entering ? [1.1, 1.0] : [1.0, 1.16])
    : transitionName === "soft_flash_cut"
      ? interpolate(progress, [0, 1], entering ? [1.16, 1.0] : [1.0, 1.12])
      : 1.0;

  if (entering && sceneFxName === "zoom_through_handoff") {
    scale *= interpolate(progress, [0, 1], [1.18 + sceneFxStrength * 0.18, 1]);
    blur += interpolate(progress, [0, 1], [18 * Math.max(sceneFxStrength, 0.35), 0]);
  }

  if (entering && sceneFxName === "paper_crumble_transition") {
    scale *= interpolate(progress, [0, 1], [0.88, 1.0]);
    blur += interpolate(progress, [0, 1], [12 * Math.max(sceneFxStrength, 0.3), 0]);
  }

  const contrast = transitionName === "glass_warp" ? 1.09 : 1.04;
  const saturate = transitionName === "film_burn_edge" ? 1.14 : 1.05;

  const baseStyle = {
    position: "absolute",
    inset: -60,
    width: WIDTH + 120,
    height: HEIGHT + 120,
    objectFit: "cover",
    transform: `translate(${driftX}px, ${driftY}px) scale(${scale})`,
    filter: `blur(${blur}px) saturate(${saturate}) contrast(${contrast}) brightness(${brightness})`,
  };

  if (scene.asset_type === "video" && scene.asset_path) {
    return (
      <Sequence from={sceneStartFrame} layout="none">
        <OffthreadVideo src={toAssetUrl(scene.asset_path)} style={baseStyle} />
      </Sequence>
    );
  }

  if (scene.asset_type === "image" && scene.asset_path) {
    return <Img src={toAssetUrl(scene.asset_path)} style={baseStyle} />;
  }

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 20% 20%, rgba(113, 203, 255, 0.24), transparent 30%), radial-gradient(circle at 80% 0%, rgba(255, 217, 102, 0.18), transparent 24%), linear-gradient(180deg, #0f1017 0%, #090a10 100%)",
      }}
    />
  );
};

const TransitionOverlay = ({transitionName, progress}) => {
  if (transitionName === "light_sweep_dissolve") {
    const translateX = interpolate(progress, [0, 1], [-420, 1140]);
    return (
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: `linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.0) 36%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.0) 64%, transparent 100%)`,
          transform: `translateX(${translateX}px)`,
          mixBlendMode: "screen",
          opacity: 0.85,
        }}
      />
    );
  }

  if (transitionName === "masked_push") {
    return (
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: "linear-gradient(90deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02), transparent)",
          clipPath: `inset(0 ${interpolate(progress, [0, 1], [100, 0])}% 0 0)`,
          opacity: 0.8,
        }}
      />
    );
  }

  if (transitionName === "soft_flash_cut") {
    const opacity = Math.sin(progress * Math.PI) * 0.7;
    return (
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity,
          background:
            "radial-gradient(circle at center, rgba(255,255,255,0.46), rgba(255,245,228,0.16) 34%, transparent 62%)",
          mixBlendMode: "screen",
        }}
      />
    );
  }

  if (transitionName === "glass_warp") {
    return (
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity: 0.42,
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.16), transparent 34%, rgba(255,255,255,0.06) 48%, transparent 62%, rgba(255,255,255,0.12))",
          mixBlendMode: "screen",
          transform: `skewX(${interpolate(progress, [0, 1], [8, -8])}deg) scale(${1.02 + progress * 0.04})`,
          filter: `blur(${4 + progress * 8}px)`,
        }}
      />
    );
  }

  if (transitionName === "radial_focus_pull") {
    const radius = interpolate(progress, [0, 1], [28, 78]);
    return (
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity: 0.52,
          background: `radial-gradient(circle at center, transparent 0%, transparent ${radius - 14}%, rgba(8,10,18,0.10) ${radius}%, rgba(8,10,18,0.72) 100%)`,
        }}
      />
    );
  }

  if (transitionName === "split_panel_wipe") {
    const left = interpolate(progress, [0, 1], [-52, 0]);
    const right = interpolate(progress, [0, 1], [52, 0]);
    return (
      <>
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            left: 0,
            right: "50%",
            transform: `translateX(${left}px)`,
            background: "linear-gradient(90deg, rgba(255,255,255,0.12), transparent)",
            opacity: 0.6,
          }}
        />
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            left: "50%",
            right: 0,
            transform: `translateX(${right}px)`,
            background: "linear-gradient(270deg, rgba(255,255,255,0.12), transparent)",
            opacity: 0.6,
          }}
        />
      </>
    );
  }

  if (transitionName === "film_burn_edge") {
    const glow = interpolate(progress, [0, 1], [0.12, 0.52]);
    return (
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity: 0.9,
          background:
            `radial-gradient(circle at 0% ${22 + progress * 42}%, rgba(255,163,70,${glow}), transparent 24%), radial-gradient(circle at 100% ${78 - progress * 36}%, rgba(255,222,163,${glow}), transparent 22%)`,
          mixBlendMode: "screen",
          filter: "blur(8px)",
        }}
      />
    );
  }

  if (transitionName === "depth_parallax_snap") {
    return (
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity: 0.4,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.08), transparent 26%, transparent 74%, rgba(255,255,255,0.06))",
          transform: `translateX(${interpolate(progress, [0, 1], [-24, 24])}px)`,
        }}
      />
    );
  }

  if (transitionName === "ghost_trail_crossfade") {
    return (
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity: interpolate(progress, [0, 1], [0.22, 0]),
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.12), transparent 26%, rgba(255,255,255,0.06) 52%, transparent 78%)",
          transform: `translateX(${interpolate(progress, [0, 1], [-80, 80])}px)`,
          mixBlendMode: "screen",
          filter: "blur(6px)",
        }}
      />
    );
  }

  if (transitionName === "iris_close_open") {
    const radius = interpolate(progress, [0, 1], [0, 84]);
    return (
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity: 0.7,
          background: `radial-gradient(circle at center, transparent 0%, transparent ${radius - 10}%, rgba(5,8,14,0.18) ${radius}%, rgba(5,8,14,0.9) 100%)`,
        }}
      />
    );
  }

  return null;
};

const tornPaperClipPath = (progress) => {
  const edge = interpolate(progress, [0, 1], [0, 100]);
  const p1 = Math.max(0, edge - 6);
  const p2 = Math.max(0, edge + 4);
  const p3 = Math.max(0, edge - 3);
  const p4 = Math.max(0, edge + 5);
  const p5 = Math.max(0, edge - 4);
  return `polygon(0 0, ${p1}% 0, ${p2}% 14%, ${p3}% 28%, ${p4}% 42%, ${p5}% 58%, ${p2}% 72%, ${p3}% 86%, ${edge}% 100%, 0 100%)`;
};

const SceneFxOverlay = ({sceneFxName, progress, strength}) => {
  if (sceneFxName === "paper_tear_reveal") {
    const edge = interpolate(progress, [0, 1], [-140, WIDTH + 120]);
    const opacity = interpolate(progress, [0, 1], [0.9, 0.08]) * (0.7 + strength * 0.3);
    return (
      <AbsoluteFill style={{pointerEvents: "none"}}>
        <AbsoluteFill
          style={{
            width: 120,
            left: edge - 60,
            background: "linear-gradient(180deg, rgba(247,236,214,0.96), rgba(217,198,166,0.92))",
            clipPath: "polygon(40% 0, 74% 8%, 38% 18%, 70% 32%, 42% 47%, 68% 61%, 35% 74%, 66% 88%, 40% 100%, 0 100%, 0 0)",
            boxShadow: "0 0 30px rgba(0,0,0,0.28)",
            opacity,
          }}
        />
      </AbsoluteFill>
    );
  }

  if (sceneFxName === "paper_crumble_transition") {
    const opacity = Math.sin(progress * Math.PI) * (0.45 + strength * 0.25);
    const spread = 160 + strength * 120;
    return (
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity,
          background: `radial-gradient(circle at 35% 40%, rgba(243,226,199,0.55), transparent ${spread / 12}%),
            radial-gradient(circle at 58% 56%, rgba(228,207,169,0.42), transparent ${spread / 11}%),
            radial-gradient(circle at 72% 44%, rgba(248,237,219,0.34), transparent ${spread / 10}%),
            radial-gradient(circle at center, rgba(255,248,236,0.18), transparent 42%)`,
          filter: "blur(12px)",
          mixBlendMode: "screen",
        }}
      />
    );
  }

  if (sceneFxName === "zoom_through_handoff") {
    const opacity = Math.sin(progress * Math.PI) * (0.36 + strength * 0.3);
    const radius = interpolate(progress, [0, 1], [6, 58 + strength * 18]);
    return (
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity,
          background: `radial-gradient(circle at center, rgba(255,255,255,0.24), transparent ${radius}%),
            linear-gradient(0deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%),
            linear-gradient(90deg, transparent 0%, rgba(117,188,255,0.10) 50%, transparent 100%)`,
          mixBlendMode: "screen",
          filter: `blur(${8 + strength * 10}px)`,
        }}
      />
    );
  }

  return null;
};

const SceneLayer = ({scene, sceneStartFrame, entering, transitionName, sceneFxName = "none", sceneFxStrength = 0}) => {
  const frame = useCurrentFrame();
  const localFrame = frame - sceneStartFrame;
  const activeTransition = transitionName || scene.transition;
  const transitionFrames = transitionDurationFor(activeTransition);
  const progress = clamp(localFrame / Math.max(transitionFrames, 1));

  let opacity = entering ? interpolate(progress, [0, 1], [0, 1]) : interpolate(progress, [0, 1], [1, 0]);
  let clipPath = "inset(0 0 0 0)";
  let transform = "none";
  let filter = "none";

  if (activeTransition === "hard_cut_blur") {
    opacity = entering ? interpolate(progress, [0, 1], [0.2, 1]) : interpolate(progress, [0, 1], [1, 0]);
  } else if (activeTransition === "masked_push") {
    opacity = 1;
    transform = entering
      ? `translateX(${interpolate(progress, [0, 1], [84, 0])}px)`
      : `translateX(${interpolate(progress, [0, 1], [0, -84])}px)`;
    clipPath = entering
      ? `inset(0 ${interpolate(progress, [0, 1], [100, 0])}% 0 0 round 0px)`
      : "inset(0 0 0 0)";
  } else if (activeTransition === "vertical_reveal") {
    opacity = 1;
    transform = entering
      ? `translateY(${interpolate(progress, [0, 1], [72, 0])}px)`
      : `translateY(${interpolate(progress, [0, 1], [0, -56])}px)`;
    clipPath = entering
      ? `inset(${interpolate(progress, [0, 1], [100, 0])}% 0 0 0 round 0px)`
      : "inset(0 0 0 0)";
  } else if (activeTransition === "horizontal_reveal") {
    opacity = 1;
    transform = entering
      ? `translateX(${interpolate(progress, [0, 1], [-72, 0])}px)`
      : `translateX(${interpolate(progress, [0, 1], [0, 56])}px)`;
    clipPath = entering
      ? `inset(0 0 0 ${interpolate(progress, [0, 1], [100, 0])}% round 0px)`
      : "inset(0 0 0 0)";
  } else if (activeTransition === "soft_flash_cut") {
    opacity = entering ? interpolate(progress, [0, 1], [0.5, 1]) : interpolate(progress, [0, 1], [1, 0.1]);
  } else if (activeTransition === "glass_warp") {
    opacity = entering ? interpolate(progress, [0, 1], [0.12, 1]) : interpolate(progress, [0, 1], [1, 0]);
    transform = `skewX(${entering ? interpolate(progress, [0, 1], [9, 0]) : interpolate(progress, [0, 1], [0, -9])}deg) scale(${entering ? interpolate(progress, [0, 1], [1.08, 1]) : interpolate(progress, [0, 1], [1, 1.05])})`;
    filter = `blur(${entering ? interpolate(progress, [0, 1], [16, 0]) : interpolate(progress, [0, 1], [0, 12])}px)`;
  } else if (activeTransition === "radial_focus_pull") {
    opacity = entering ? interpolate(progress, [0, 1], [0.22, 1]) : interpolate(progress, [0, 1], [1, 0.18]);
    transform = `scale(${entering ? interpolate(progress, [0, 1], [1.12, 1]) : interpolate(progress, [0, 1], [1, 1.08])})`;
  } else if (activeTransition === "split_panel_wipe") {
    opacity = 1;
    clipPath = entering
      ? `polygon(0 0, ${50 - 50 * progress}% 0, ${50 + 50 * progress}% 0, 100% 0, 100% 100%, ${50 + 50 * progress}% 100%, ${50 - 50 * progress}% 100%, 0 100%)`
      : "inset(0 0 0 0)";
  } else if (activeTransition === "film_burn_edge") {
    opacity = entering ? interpolate(progress, [0, 1], [0.14, 1]) : interpolate(progress, [0, 1], [1, 0]);
  } else if (activeTransition === "depth_parallax_snap") {
    opacity = entering ? interpolate(progress, [0, 1], [0.18, 1]) : interpolate(progress, [0, 1], [1, 0]);
    transform = entering
      ? `translate3d(${interpolate(progress, [0, 1], [92, 0])}px, ${interpolate(progress, [0, 1], [22, 0])}px, 0) scale(${interpolate(progress, [0, 1], [1.12, 1])})`
      : `translate3d(${interpolate(progress, [0, 1], [0, -72])}px, ${interpolate(progress, [0, 1], [0, -18])}px, 0) scale(${interpolate(progress, [0, 1], [1, 1.03])})`;
  } else if (activeTransition === "ghost_trail_crossfade") {
    opacity = entering ? interpolate(progress, [0, 1], [0.08, 1]) : interpolate(progress, [0, 1], [1, 0]);
    transform = `translateX(${entering ? interpolate(progress, [0, 1], [32, 0]) : interpolate(progress, [0, 1], [0, -32])}px)`;
  } else if (activeTransition === "iris_close_open") {
    opacity = 1;
    clipPath = entering
      ? `circle(${interpolate(progress, [0, 1], [0, 150])}% at 50% 50%)`
      : `circle(${interpolate(progress, [0, 1], [150, 0])}% at 50% 50%)`;
  }

  if (entering && sceneFxName === "paper_tear_reveal") {
    opacity = interpolate(progress, [0, 1], [0.2, 1]);
    clipPath = tornPaperClipPath(progress);
    transform = `translateX(${interpolate(progress, [0, 1], [22, 0])}px) scale(${interpolate(progress, [0, 1], [1.03 + sceneFxStrength * 0.03, 1])})`;
  } else if (entering && sceneFxName === "paper_crumble_transition") {
    opacity = interpolate(progress, [0, 1], [0.14, 1]);
    clipPath = `circle(${interpolate(progress, [0, 1], [18, 160])}% at 50% 50%)`;
    transform = `scale(${interpolate(progress, [0, 1], [0.82, 1])}) rotate(${interpolate(progress, [0, 1], [-8 - sceneFxStrength * 10, 0])}deg)`;
    filter = `blur(${interpolate(progress, [0, 1], [20 * Math.max(sceneFxStrength, 0.35), 0])}px)`;
  } else if (entering && sceneFxName === "zoom_through_handoff") {
    opacity = interpolate(progress, [0, 1], [0.1, 1]);
    transform = `scale(${interpolate(progress, [0, 1], [1.24 + sceneFxStrength * 0.18, 1])})`;
    filter = `blur(${interpolate(progress, [0, 1], [16 * Math.max(sceneFxStrength, 0.35), 0])}px)`;
  }

  return (
    <AbsoluteFill style={{opacity, clipPath, transform, filter}}>
      <SceneAsset
        scene={scene}
        progress={progress}
        entering={entering}
        transitionName={activeTransition}
        sceneStartFrame={sceneStartFrame}
        sceneFxName={sceneFxName}
        sceneFxStrength={sceneFxStrength}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(5,8,14,0.18) 0%, rgba(5,8,14,0.35) 35%, rgba(5,8,14,0.80) 100%)",
        }}
      />
      <TransitionOverlay transitionName={activeTransition} progress={progress} />
      {entering ? (
        <SceneFxOverlay
          sceneFxName={sceneFxName}
          progress={progress}
          strength={sceneFxStrength}
        />
      ) : null}
    </AbsoluteFill>
  );
};

const PremiumReel = ({spec}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const timeSeconds = frame / fps;
  const scenes = (spec.scenes || []).map((scene) => ({
    ...scene,
    startFrame: Math.max(0, Math.floor(scene.start_time_seconds * fps)),
    endFrame: Math.max(1, Math.ceil(scene.end_time_seconds * fps)),
  }));
  const sfxTimeline = (spec.sfx_timeline || [])
    .filter((cue) => cue.asset_path)
    .map((cue) => ({
      ...cue,
      startFrame: Math.max(0, Math.floor((cue.start_time_seconds || 0) * fps)),
      volume: clamp(Number(cue.volume ?? 0.45)),
    }));

  const currentIndex = Math.max(
    0,
    scenes.findIndex((scene, idx) => {
      const next = scenes[idx + 1];
      return frame >= scene.startFrame && (!next || frame < next.startFrame);
    }),
  );
  const currentScene = scenes[currentIndex] || scenes[0];
  const previousScene = currentIndex > 0 ? scenes[currentIndex - 1] : null;
  const previousTransitionFrames = previousScene ? transitionDurationFor(currentScene?.transition) : 0;
  const shouldShowPrevious = previousScene && frame < currentScene.startFrame + previousTransitionFrames;
  const activeSceneFxName = currentScene?.scene_fx_name || "none";
  const activeSceneFxStrength = Math.max(0, Math.min(1, Number(currentScene?.scene_fx_strength ?? 0)));
  const springIn = spring({fps, frame, config: {damping: 18, stiffness: 90}});
  const sceneCaptionText = getSceneCaptionText(currentScene);
  const captionText = sceneCaptionText !== null
    ? sceneCaptionText
    : (getActiveCaption(spec.word_timestamps, timeSeconds) || "");
  const showCta = !!spec.closing_statement && timeSeconds >= (spec.main_duration_seconds - 0.1);

  return (
    <AbsoluteFill
      style={{
        background: "#070910",
        color: "#fff",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <Audio src={toAssetUrl(spec.audio_path)} />
      {sfxTimeline.map((cue) => (
        <Sequence key={cue.id || `${cue.sound_id}-${cue.startFrame}`} from={cue.startFrame}>
          <Audio src={toAssetUrl(cue.asset_path)} volume={cue.volume} />
        </Sequence>
      ))}
      {spec.overlay_video_path ? (
        <OffthreadVideo
          src={toAssetUrl(spec.overlay_video_path)}
          style={{
            position: "absolute",
            inset: 0,
            width: WIDTH,
            height: HEIGHT,
            objectFit: "cover",
            opacity: 0.22,
            mixBlendMode: "screen",
          }}
        />
      ) : null}

      {shouldShowPrevious ? (
        <SceneLayer
          key={`prev-${previousScene.id}`}
          scene={previousScene}
          sceneStartFrame={currentScene.startFrame}
          entering={false}
          transitionName={currentScene.transition}
        />
      ) : null}
      {currentScene ? (
        <SceneLayer
          key={`current-${currentScene.id}`}
          scene={currentScene}
          sceneStartFrame={currentScene.startFrame}
          entering
          transitionName={currentScene.transition}
          sceneFxName={activeSceneFxName}
          sceneFxStrength={activeSceneFxStrength}
        />
      ) : null}

      <AbsoluteFill
        style={{
          justifyContent: "space-between",
          padding: "88px 60px 86px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 86,
              lineHeight: 1.02,
              fontWeight: 800,
              maxWidth: 900,
              transform: `translateY(${interpolate(springIn, [0, 1], [20, 0])}px)`,
              opacity: springIn,
              textShadow: "0 8px 32px rgba(0,0,0,0.36)",
            }}
          >
            {spec.headline}
          </div>
        </div>

        {spec.include_waveform ? (
          <div
            style={{
              position: "absolute",
              left: 60,
              right: 60,
              top: 820,
              height: 140,
              display: "flex",
              alignItems: "center",
              gap: 10,
              opacity: 0.48,
            }}
          >
            {Array.from({length: 36}).map((_, idx) => {
              const height = 18 + Math.abs(Math.sin((frame + idx * 5) / 8)) * 88;
              return (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    height,
                    borderRadius: 999,
                    background: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(105,188,255,0.54))",
                    boxShadow: "0 0 18px rgba(145, 210, 255, 0.24)",
                  }}
                />
              );
            })}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gap: 26,
            alignSelf: "stretch",
          }}
        >
          {captionText ? (
            <div
              style={{
                position: "absolute",
                top: "65%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                maxWidth: 920,
                padding: "28px 34px",
                background: "rgba(7, 10, 16, 0.66)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 34,
                backdropFilter: "blur(18px)",
                fontSize: 54,
                fontWeight: 700,
                lineHeight: 1.12,
                textAlign: "center",
                boxShadow: "0 18px 64px rgba(0,0,0,0.28)",
              }}
            >
              {captionText}
            </div>
          ) : null}

          {showCta ? (
            <div
              style={{
                alignSelf: "center",
                justifySelf: "center",
                maxWidth: 920,
                padding: "30px 36px",
                borderRadius: 36,
                background: "linear-gradient(135deg, rgba(13,20,31,0.92), rgba(28,33,48,0.84))",
                border: "1px solid rgba(255,255,255,0.12)",
                transform: `translateY(${interpolate(springIn, [0, 1], [40, 0])}px)`,
                boxShadow: "0 24px 80px rgba(0,0,0,0.34)",
              }}
            >
              <div style={{fontSize: 24, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", marginBottom: 14}}>
                Closing beat
              </div>
              <div style={{fontSize: 58, fontWeight: 800, lineHeight: 1.08}}>
                {spec.closing_statement}
              </div>
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const StitchLookDev = ({spec}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const data = spec?.stitch_preview || {};
  const question = (data.question || "IS THIS CLAIM ACTUALLY TRUE?").toUpperCase();
  const rating = Number(data.rating ?? 4);
  const trustLabel = (data.trust_label || "MOSTLY SUPPORTED").toUpperCase();
  const rationale = data.rationale || "The strongest studies support the direction of the claim, but effects vary by protocol and not every paper lands the same conclusion.";
  const rationaleBullets = toOverlayBullets(rationale);
  const timing = data.timing || {};
  const supportCount = Number(data.support_count ?? 5);
  const mixedCount = Number(data.mixed_count ?? 3);
  const refuteCount = Number(data.refute_count ?? 0);
  const backgroundVideoPath = data.background_video_path || spec?.background_video_path || "";
  const selectedStartTimeSeconds = Math.max(0, Number(data.selected_start_time_seconds ?? 0));
  const selectedEndTimeSeconds = Math.max(selectedStartTimeSeconds + 0.75, Number(data.selected_end_time_seconds ?? (selectedStartTimeSeconds + 2.5)));
  const clipStartFrameAbs = Math.floor(selectedStartTimeSeconds * fps);
  const clipEndFrameAbs = Math.ceil(selectedEndTimeSeconds * fps);
  const clipFrames = Math.max(24, clipEndFrameAbs - clipStartFrameAbs);
  const tailStartFrame = clipFrames;
  const panelEnterFrame = tailStartFrame + 10;
  const progressFill = clipFrames > 1 ? clamp(frame / Math.max(clipFrames - 1, 1)) : 1;
  const audioFadeStartFrame = Math.max(0, clipFrames - 14);
  const overlayFade = spring({
    fps,
    frame: Math.max(0, frame - panelEnterFrame),
    config: {damping: 17, stiffness: 88, mass: 0.9},
  });
  const ringProgress = spring({
    fps,
    frame: Math.max(0, frame - (tailStartFrame + 30)),
    config: {damping: 15, stiffness: 120, mass: 0.7},
    durationInFrames: 42,
  });
  const ringPct = clamp(ringProgress) * clamp(rating / 5);
  const gaugeColor = rating >= 3.5 ? "#43ffd1" : rating >= 2.5 ? "#ffd36a" : "#ff637f";
  const questionOpacity = interpolate(frame, [0, 22, Math.max(30, clipFrames - 10), clipFrames + 8], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cleanVideoOpacity = interpolate(frame, [0, Math.max(20, clipFrames - 18), clipFrames + 10], [1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const blurredVideoOpacity = interpolate(frame, [0, Math.max(18, clipFrames - 14), clipFrames + 12], [0.1, 0.28, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const darkOverlayOpacity = interpolate(frame, [0, Math.max(22, clipFrames - 10), clipFrames + 18], [0.06, 0.12, 0.42], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const panelTranslateY = lerp(72, 0, clamp(overlayFade));
  const panelOpacity = clamp(overlayFade);
  const rationaleIntroFrames = Math.max(24, Math.round(Number(timing.rationale_intro_seconds ?? 2.2) * fps));
  const bulletGapFrames = Math.max(3, Math.round(Number(timing.bullet_gap_seconds ?? 0.18) * fps));
  const captionLeadFrames = Math.max(3, Math.round(Number(timing.caption_lead_seconds ?? 0.22) * fps));
  const captionFadeFrames = Math.max(10, Math.round(Number(timing.caption_fade_seconds ?? 0.38) * fps));
  const rationaleWordsPerSecond = Math.max(2.5, Number(timing.words_per_second ?? 3.6));
  const rationaleStartFrame = tailStartFrame + rationaleIntroFrames;
  const bulletOne = rationaleBullets[0] || "";
  const bulletTwo = rationaleBullets[1] || "";
  const bulletThree = rationaleBullets[2] || "";
  const bulletFour = rationaleBullets[3] || "";
  const bulletFive = rationaleBullets[4] || "";
  const bulletOneFrames = Math.ceil((wordCount(bulletOne) / rationaleWordsPerSecond) * fps);
  const bulletTwoFrames = Math.ceil((wordCount(bulletTwo) / rationaleWordsPerSecond) * fps);
  const bulletThreeFrames = Math.ceil((wordCount(bulletThree) / rationaleWordsPerSecond) * fps);
  const bulletFourFrames = Math.ceil((wordCount(bulletFour) / rationaleWordsPerSecond) * fps);
  const bulletFiveFrames = Math.ceil((wordCount(bulletFive) / rationaleWordsPerSecond) * fps);
  const bulletTwoStartFrame = rationaleStartFrame + bulletOneFrames + bulletGapFrames;
  const bulletThreeStartFrame = bulletTwoStartFrame + bulletTwoFrames + bulletGapFrames;
  const bulletFourStartFrame = bulletThreeStartFrame + bulletThreeFrames + bulletGapFrames;
  const bulletFiveStartFrame = bulletFourStartFrame + bulletFourFrames + bulletGapFrames;
  const typedBulletOne = wordSlice(bulletOne, frame, rationaleStartFrame, rationaleWordsPerSecond, fps);
  const typedBulletTwo = wordSlice(bulletTwo, frame, bulletTwoStartFrame, rationaleWordsPerSecond, fps);
  const typedBulletThree = wordSlice(bulletThree, frame, bulletThreeStartFrame, rationaleWordsPerSecond, fps);
  const typedBulletFour = wordSlice(bulletFour, frame, bulletFourStartFrame, rationaleWordsPerSecond, fps);
  const typedBulletFive = wordSlice(bulletFive, frame, bulletFiveStartFrame, rationaleWordsPerSecond, fps);
  const rationaleEndFrame = bulletFive
    ? bulletFiveStartFrame + bulletFiveFrames
    : bulletFour
      ? bulletFourStartFrame + bulletFourFrames
      : bulletThree
        ? bulletThreeStartFrame + bulletThreeFrames
        : bulletTwo
          ? bulletTwoStartFrame + bulletTwoFrames
          : rationaleStartFrame + bulletOneFrames;
  const rationaleTextFrames = Math.max(0, rationaleEndFrame - rationaleStartFrame);
  const typingLoopFrames = fps * 8;
  const shouldLoopTypingSfx = rationaleTextFrames > typingLoopFrames;
  const captionStartFrame = rationaleEndFrame + captionLeadFrames;
  const captionFade = spring({
    fps,
    frame: Math.max(0, frame - captionStartFrame),
    config: {damping: 18, stiffness: 110, mass: 0.85},
    durationInFrames: captionFadeFrames,
  });
  const cards = buildEvidenceCards(supportCount, mixedCount, refuteCount, 10);
  const progressPulseFrames = Array.from(
    {length: Math.max(0, Math.floor(Math.max(0, clipFrames - 1) / Math.round(fps * 2.5)))},
    (_, idx) => Math.round(fps * 2.5) * (idx + 1),
  ).filter((pulseFrame) => pulseFrame < Math.max(12, clipFrames - 10));
  const progressCueFrames = [0, ...progressPulseFrames];
  const progressPhaseIndex = progressCueFrames.reduce((index, cueFrame) => (
    frame >= cueFrame ? (index + 1) % PROGRESS_PHASES.length : index
  ), -1);
  const progressPhase = PROGRESS_PHASES[Math.max(0, progressPhaseIndex)];

  return (
    <AbsoluteFill style={{backgroundColor: "#040507", fontFamily: "Menlo, Monaco, monospace", color: "white"}}>
      <Sequence from={10}>
        <Audio src={staticFile("sfx/click.mp3")} volume={0.16} />
      </Sequence>
      {progressPulseFrames.map((pulseFrame, idx) => (
        <Sequence key={`progress-pulse-${idx}`} from={pulseFrame}>
          <Audio src={staticFile(idx % 2 === 0 ? "sfx/click.mp3" : "sfx/camera_click.mp3")} volume={0.12} />
        </Sequence>
      ))}
      <Sequence from={18}>
        <Audio src={staticFile("sfx/woosh.mp3")} volume={0.18} />
      </Sequence>
      <Sequence from={Math.max(22, clipFrames - 18)}>
        <Audio src={staticFile("sfx/riser.mp3")} volume={0.2123} />
      </Sequence>
      <Sequence from={tailStartFrame + 12}>
        <Audio src={staticFile("sfx/pop.mp3")} volume={0.34} />
      </Sequence>
      <Sequence from={captionStartFrame}>
        <Audio src={staticFile("sfx/woosh.mp3")} volume={0.16} />
      </Sequence>
      <Sequence from={captionStartFrame + 4}>
        <Audio src={staticFile("sfx/pop.mp3")} volume={0.24} />
      </Sequence>
      {cards.map((_, idx) => (
        <Sequence key={`card-sfx-${idx}`} from={tailStartFrame + 56 + idx * 4}>
          <Audio src={staticFile("sfx/camera_click.mp3")} volume={0.1} />
        </Sequence>
      ))}
      {rationaleTextFrames > 0 ? (
        <Sequence from={rationaleStartFrame} durationInFrames={rationaleTextFrames}>
          <Audio
            src={staticFile("sfx/typing_bullets.mp3")}
            volume={0.5}
            loop={shouldLoopTypingSfx}
            trimAfter={shouldLoopTypingSfx ? typingLoopFrames : undefined}
          />
        </Sequence>
      ) : null}

      {backgroundVideoPath ? (
        <>
          <OffthreadVideo
            src={toAssetUrl(backgroundVideoPath)}
            startFrom={clipStartFrameAbs}
            muted
            style={{
              position: "absolute",
              inset: -60,
              width: WIDTH + 120,
              height: HEIGHT + 120,
              objectFit: "cover",
              filter: "blur(22px) brightness(0.34) saturate(0.82)",
              opacity: blurredVideoOpacity,
              transform: `scale(${lerp(1.12, 1.02, clamp(frame / Math.max(durationInFrames, 1)))})`,
            }}
          />
          <OffthreadVideo
            src={toAssetUrl(backgroundVideoPath)}
            startFrom={clipStartFrameAbs}
            endAt={clipEndFrameAbs}
            volume={(f) => {
              if (f <= audioFadeStartFrame) return 1;
              return interpolate(f, [audioFadeStartFrame, clipFrames], [1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
            }}
            style={{
              position: "absolute",
              inset: 0,
              width: WIDTH,
              height: HEIGHT,
              objectFit: "cover",
              opacity: cleanVideoOpacity,
              transform: `scale(${lerp(1.02, 1.0, clamp(frame / Math.max(clipFrames, 1)))})`,
            }}
          />
        </>
      ) : (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(circle at 20% 20%, rgba(67,255,209,0.12), transparent 24%), radial-gradient(circle at 80% 0%, rgba(255,211,106,0.08), transparent 22%), linear-gradient(180deg, #08090d 0%, #030406 100%)",
          }}
        />
      )}
      <AbsoluteFill style={{background: `rgba(4,6,9,${darkOverlayOpacity})`}} />

      <AbsoluteFill style={{justifyContent: "center", alignItems: "center", padding: 110}}>
        <div
          style={{
            opacity: questionOpacity,
            transform: `translateY(${lerp(28, 0, questionOpacity)})`,
            textAlign: "center",
            maxWidth: 880,
            textShadow: "0 18px 60px rgba(0,0,0,0.36)",
            display: "grid",
            gap: 22,
            justifyItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: "0.18em",
              color: "#f3fffb",
              marginBottom: 20,
              padding: "14px 26px",
              borderRadius: 999,
              background: "linear-gradient(135deg, rgba(50,255,214,0.30), rgba(18,48,44,0.72))",
              border: "2px solid rgba(67,255,209,0.78)",
              boxShadow: "0 0 38px rgba(67,255,209,0.28), 0 0 90px rgba(67,255,209,0.12), inset 0 1px 0 rgba(255,255,255,0.10)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              textTransform: "uppercase",
            }}
          >
            CLAIM UNDER REVIEW
          </div>
          <div style={{fontSize: 84, fontWeight: 700, lineHeight: 1.01}}>{question}</div>
          <div
            style={{
              width: 778,
              maxWidth: "100%",
              borderRadius: 30,
              border: "2px solid rgba(67,255,209,0.22)",
              background: "linear-gradient(180deg, rgba(7,15,18,0.56), rgba(8,12,17,0.34))",
              boxShadow: "0 0 42px rgba(67,255,209,0.12), inset 0 1px 0 rgba(255,255,255,0.04)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              padding: "22px 26px 26px",
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{fontSize: 28, fontWeight: 800, letterSpacing: "0.14em", color: "#c9fff5", textTransform: "uppercase"}}>{progressPhase}</div>
            <div style={{height: 24, borderRadius: 999, background: "rgba(255,255,255,0.10)", overflow: "hidden", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)"}}>
              <div
                style={{
                  width: `${progressFill * 100}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: `linear-gradient(90deg, rgba(67,255,209,0.95), ${gaugeColor})`,
                  boxShadow: `0 0 34px ${gaugeColor}66, 0 0 64px ${gaugeColor}33`,
                }}
              />
            </div>
            <div style={{fontSize: 20, fontWeight: 700, color: "#effffb", letterSpacing: "0.08em"}}>
              {Math.round(progressFill * 100)}% COMPLETE
            </div>
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{padding: "300px 110px 220px"}}>
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 40,
            border: "1px solid rgba(67,255,209,0.16)",
            background: "rgba(9,14,18,0.34)",
            boxShadow: "0 0 90px rgba(67,255,209,0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
            backdropFilter: "blur(26px)",
            WebkitBackdropFilter: "blur(26px)",
            padding: "52px 58px",
            display: "grid",
            gridTemplateRows: "auto auto 1fr auto",
            opacity: panelOpacity,
            transform: `translateY(${panelTranslateY}px)`,
          }}
        >
          <div style={{display: "grid", gridTemplateColumns: "300px 1fr", alignItems: "center"}}>
            <div style={{display: "flex", justifyContent: "center", alignItems: "center"}}>
              <div
                style={{
                  width: 220,
                  height: 220,
                  borderRadius: 999,
                  background: `conic-gradient(${gaugeColor} ${ringPct * 360}deg, rgba(255,255,255,0.08) 0deg)`,
                  boxShadow: `0 0 34px ${gaugeColor}44`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 166,
                    height: 166,
                    borderRadius: 999,
                    background: "rgba(8,10,13,0.92)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "grid",
                    placeItems: "center",
                    textAlign: "center",
                  }}
                >
                  <div>
                    <div style={{fontSize: 20, color: "#8ff7e0", letterSpacing: "0.12em"}}>TRUST</div>
                    <div style={{fontSize: 68, fontWeight: 700, lineHeight: 1}}>{rating.toFixed(1)}</div>
                    <div style={{fontSize: 18, color: "#c9fef1"}}>/ 5</div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{display: "grid", gap: 18}}>
              <div style={{fontSize: 24, letterSpacing: "0.14em", color: "#8ff7e0"}}>{question}</div>
              <div style={{fontSize: 48, fontWeight: 700, lineHeight: 1.02, color: gaugeColor}}>{trustLabel}</div>
              <div style={{display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, maxWidth: 680}}>
                {cards.map((card, idx) => {
                  const color = card === "support" ? "#43ffd1" : card === "mixed" ? "#ffd36a" : "#ff637f";
                  const cardProgress = spring({
                    fps,
                    frame: Math.max(0, frame - (tailStartFrame + 56 + idx * 4)),
                    config: {damping: 14, stiffness: 160},
                    durationInFrames: 18,
                  });
                  return (
                    <div
                      key={`${card}-${idx}`}
                      style={{
                        height: 72,
                        borderRadius: 18,
                        border: `1px solid ${color}88`,
                        background: `${color}1c`,
                        boxShadow: `0 0 18px ${color}22`,
                        transform: `translateY(${lerp(50, 0, clamp(cardProgress))}px) scale(${lerp(0.84, 1, clamp(cardProgress))})`,
                        opacity: clamp(cardProgress),
                      }}
                    />
                  );
                })}
              </div>
              <div style={{fontSize: 22, color: "#dffef7", letterSpacing: "0.06em"}}>
                {supportCount} support  •  {mixedCount} mixed  •  {refuteCount} refute
              </div>
            </div>
          </div>

          <div style={{display: "grid", alignContent: "start", marginTop: 24}}>
            <div style={{display: "grid", gap: 10, maxWidth: 810}}>
              {bulletOne ? (
                <div style={{display: "grid", gridTemplateColumns: "28px 1fr", alignItems: "start", columnGap: 18}}>
                  <div style={{fontSize: 28, color: "#8ff7e0", lineHeight: 1.35}}>•</div>
                  <div style={{fontSize: 28, lineHeight: 1.28}}>{typedBulletOne}</div>
                </div>
              ) : null}
              {bulletTwo ? (
                <div style={{display: "grid", gridTemplateColumns: "28px 1fr", alignItems: "start", columnGap: 18}}>
                  <div style={{fontSize: 28, color: "#8ff7e0", lineHeight: 1.35}}>•</div>
                  <div style={{fontSize: 28, lineHeight: 1.28}}>{typedBulletTwo}</div>
                </div>
              ) : null}
              {bulletThree ? (
                <div style={{display: "grid", gridTemplateColumns: "28px 1fr", alignItems: "start", columnGap: 18}}>
                  <div style={{fontSize: 28, color: "#8ff7e0", lineHeight: 1.35}}>•</div>
                  <div style={{fontSize: 28, lineHeight: 1.28}}>{typedBulletThree}</div>
                </div>
              ) : null}
              {bulletFour ? (
                <div style={{display: "grid", gridTemplateColumns: "28px 1fr", alignItems: "start", columnGap: 18}}>
                  <div style={{fontSize: 28, color: "#8ff7e0", lineHeight: 1.35}}>•</div>
                  <div style={{fontSize: 28, lineHeight: 1.28}}>{typedBulletFour}</div>
                </div>
              ) : null}
              {bulletFive ? (
                <div style={{display: "grid", gridTemplateColumns: "28px 1fr", alignItems: "start", columnGap: 18}}>
                  <div style={{fontSize: 28, color: "#8ff7e0", lineHeight: 1.35}}>•</div>
                  <div style={{fontSize: 28, lineHeight: 1.28}}>{typedBulletFive}</div>
                </div>
              ) : null}
            </div>
          </div>

          <div />

          <div
            style={{
              alignSelf: "end",
              paddingTop: 22,
              marginBottom: "15%",
              fontSize: 41,
              color: "#8ff7e0",
              letterSpacing: "0.05em",
              lineHeight: 1.2,
              opacity: clamp(captionFade),
              transform: `translateY(${lerp(22, 0, clamp(captionFade))}px)`,
            }}
          >
            FULL ANALYSIS + PAPERS LINKED IN CAPTION
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const UploadedVideoTextFx = ({spec}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const data = spec?.video_text_fx || {};
  const sourceVideoPath = data.source_video_path || "";
  const transcriptText = String(data.transcript_text || "").trim();
  const stylePreset = String(data.style_preset || "ali-abdal").trim();
  const beats = Array.isArray(data.beats) ? data.beats : [];
  const topBeats = beats.filter((beat) => beat.layer === "headline_top");
  const bottomBeats = beats.filter((beat) => beat.layer === "subtitle_bottom");
  const activeTopBeat = topBeats.find((beat) => {
    const {startFrame, endFrame} = getBeatFrameRange(beat, fps);
    return frame >= startFrame && frame < endFrame;
  }) || null;
  const activeBottomBeat = bottomBeats.find((beat) => {
    const {startFrame, endFrame} = getBeatFrameRange(beat, fps);
    return frame >= startFrame && frame < endFrame;
  }) || null;
  const activeTopRange = activeTopBeat ? getBeatFrameRange(activeTopBeat, fps) : null;
  const activeBottomRange = activeBottomBeat ? getBeatFrameRange(activeBottomBeat, fps) : null;
  const topRevealProgress = activeTopRange
    ? clamp((frame - activeTopRange.startFrame) / Math.max(8, Math.min(16, activeTopRange.durationInFrames)))
    : 0;
  const bottomRevealProgress = activeBottomRange
    ? clamp((frame - activeBottomRange.startFrame) / Math.max(6, Math.min(12, activeBottomRange.durationInFrames)))
    : 0;
  const timelineProgress = clamp(frame / Math.max(1, durationInFrames - 1));
  const showAccent = activeTopBeat?.style === "numeric_emphasis" || activeTopBeat?.style === "icon_callout";
  const topCardBackground = activeTopBeat?.style === "statement" ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.96)";
  const topCardBorder = activeTopBeat?.style === "hook" ? "2px solid rgba(213,87,121,0.34)" : "1px solid rgba(23,23,23,0.08)";
  const topTextColor = showAccent ? "#d55779" : "#171717";

  return (
    <AbsoluteFill style={{backgroundColor: "#f4ede7", color: "#171717", fontFamily: stylePreset === "ali-abdal" ? "Georgia, 'Times New Roman', serif" : "Menlo, monospace"}}>
      {sourceVideoPath ? (
        <OffthreadVideo
          src={sourceVideoPath}
          startFrom={0}
          endAt={durationInFrames}
          style={{
            position: "absolute",
            inset: 0,
            width: TALKING_HEAD_WIDTH,
            height: TALKING_HEAD_HEIGHT,
            objectFit: "cover",
          }}
        />
      ) : (
        <AbsoluteFill style={{background: "linear-gradient(180deg, #f8f2ec 0%, #e7ddd4 100%)"}} />
      )}

      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, rgba(247,239,230,0.52) 0%, rgba(247,239,230,0.28) 18%, rgba(247,239,230,0.0) 42%)",
        }}
      />

      {topBeats.map((beat, idx) => {
        const {startFrame, durationInFrames: beatFrames} = getBeatFrameRange(beat, fps);
        const shouldLoopTypingSfx = beatFrames > fps * 8;
        return (
          <Sequence key={`video-text-fx-top-${idx}`} from={startFrame} durationInFrames={beatFrames}>
            <Audio
              src={staticFile("sfx/typing_bullets.mp3")}
              volume={0.32}
              loop={shouldLoopTypingSfx}
              trimAfter={shouldLoopTypingSfx ? fps * 8 : undefined}
            />
          </Sequence>
        );
      })}

      <AbsoluteFill style={{padding: "24px 22px 34px"}}>
        <div
          style={{
            height: 8,
            width: "100%",
            borderRadius: 999,
            background: "rgba(255,255,255,0.55)",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.35)",
            marginBottom: 22,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${timelineProgress * 100}%`,
              background: "linear-gradient(90deg, #171717 0%, #d55779 100%)",
            }}
          />
        </div>
        <div style={{display: "grid", height: "100%"}}>
          <div style={{display: "grid", alignContent: "start", justifyItems: "center"}}>
            {activeTopBeat ? (
              <div
                style={{
                  maxWidth: 580,
                  padding: activeTopBeat.style === "hook" ? "18px 20px" : "16px 18px",
                  borderRadius: activeTopBeat.style === "statement" ? 999 : 28,
                  background: topCardBackground,
                  border: topCardBorder,
                  boxShadow: "0 10px 26px rgba(66,40,24,0.10)",
                  textAlign: "center",
                  opacity: topRevealProgress,
                  transform: `translateY(${lerp(10, 0, topRevealProgress)}px) scale(${lerp(0.985, 1, topRevealProgress)})`,
                }}
              >
                <div
                  style={{
                    fontSize: activeTopBeat.style === "numeric_emphasis" ? 40 : activeTopBeat.style === "hook" ? 38 : 34,
                    lineHeight: 1.08,
                    fontWeight: activeTopBeat.style === "numeric_emphasis" ? 800 : 700,
                    color: topTextColor,
                  }}
                >
                  {activeTopBeat.text}
                </div>
              </div>
            ) : null}
          </div>

          <div />

          <div style={{display: "grid", justifyItems: "center", alignContent: "end", paddingBottom: 54}}>
            {activeBottomBeat ? (
              <div
                style={{
                  maxWidth: 560,
                  padding: "11px 18px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.96)",
                  border: "1px solid rgba(23,23,23,0.08)",
                  boxShadow: "0 8px 22px rgba(61,39,27,0.12)",
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1.18,
                  color: "#2b2928",
                  textAlign: "center",
                  opacity: bottomRevealProgress,
                  transform: `translateY(${lerp(8, 0, bottomRevealProgress)}px)`,
                }}
              >
                {activeBottomBeat.text}
              </div>
            ) : null}
          </div>
        </div>
      </AbsoluteFill>

      {!sourceVideoPath && transcriptText ? (
        <AbsoluteFill style={{justifyContent: "end", alignItems: "center", paddingBottom: 28}}>
          <div style={{fontFamily: "Inter, system-ui, sans-serif", fontSize: 18, color: "rgba(0,0,0,0.45)"}}>
            Transcript-loaded fallback preview
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

export const Root = () => {
  return (
    <>
      <Composition
        id="PremiumScienceReel"
        component={PremiumReel}
        durationInFrames={FPS * 30}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{spec: {duration_seconds: 30, scenes: [], word_timestamps: []}}}
        calculateMetadata={({props}) => {
          if (!props.spec) {
            return {durationInFrames: FPS * 30};
          }
          return {
            durationInFrames: Math.max(1, Math.ceil((props.spec.duration_seconds || 30) * FPS)),
          };
        }}
      />
      <Composition
        id="StitchLookDev"
        component={StitchLookDev}
        durationInFrames={FPS * 9}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          spec: {
            duration_seconds: 9,
            stitch_preview: {
              question: "IS MORNING LIGHT ACTUALLY THAT POWERFUL?",
              rating: 4.0,
              trust_label: "MOSTLY SUPPORTED",
              verdict: "Evidence mostly supports the direction of the claim.",
              rationale: "The best papers point the same way, but not every study lands the same magnitude or protocol.",
              support_count: 5,
              mixed_count: 3,
              refute_count: 0,
              background_video_path: "",
            },
          },
        }}
        calculateMetadata={({props}) => ({
          durationInFrames: Math.max(1, Math.ceil(((props?.spec?.duration_seconds) || 9) * FPS)),
        })}
      />
      <Composition
        id="UploadedVideoTextFx"
        component={UploadedVideoTextFx}
        durationInFrames={FPS * 15}
        fps={FPS}
        width={TALKING_HEAD_WIDTH}
        height={TALKING_HEAD_HEIGHT}
        defaultProps={{
          spec: {
            duration_seconds: 15,
            video_text_fx: {
              source_video_path: "",
              transcript_text: "",
              style_preset: "ali-abdal",
              beats: [],
            },
          },
        }}
        calculateMetadata={({props}) => ({
          durationInFrames: Math.max(1, Math.ceil(((props?.spec?.duration_seconds) || 15) * FPS)),
        })}
      />
    </>
  );
};
