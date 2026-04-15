import path from "node:path";
import process from "node:process";
import fs from "node:fs";
import http from "node:http";
import {bundle} from "@remotion/bundler";
import {getCompositions, renderMedia} from "@remotion/renderer";

const [, , specPath, outputPath] = process.argv;

if (!specPath || !outputPath) {
  console.error("Usage: node render.mjs <specPath> <outputPath>");
  process.exit(1);
}

const entryPoint = path.join(process.cwd(), "src", "index.jsx");
const rawSpec = JSON.parse(fs.readFileSync(specPath, "utf-8"));

const createAssetServer = async (spec) => {
  const assetMap = new Map();
  let counter = 0;

  const registerPath = (absolutePath) => {
    if (!absolutePath) return "";
    if (absolutePath.startsWith("http://") || absolutePath.startsWith("https://")) {
      return absolutePath;
    }
    const key = `asset-${counter += 1}${path.extname(absolutePath) || ""}`;
    assetMap.set(key, absolutePath);
    return key;
  };

  const rewrittenSpec = {
    ...spec,
    audio_path: registerPath(spec.audio_path),
    overlay_video_path: registerPath(spec.overlay_video_path),
    background_video_path: registerPath(spec.background_video_path),
    sfx_timeline: (spec.sfx_timeline || []).map((cue) => ({
      ...cue,
      asset_path: registerPath(cue.asset_path),
    })),
    scenes: (spec.scenes || []).map((scene) => ({
      ...scene,
      asset_path: registerPath(scene.asset_path),
    })),
    stitch_preview: spec.stitch_preview
      ? {
          ...spec.stitch_preview,
          background_video_path: registerPath(spec.stitch_preview.background_video_path),
        }
      : undefined,
    video_text_fx: spec.video_text_fx
      ? {
          ...spec.video_text_fx,
          source_video_path: registerPath(spec.video_text_fx.source_video_path),
        }
      : undefined,
  };

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url, "http://127.0.0.1");
    const key = reqUrl.pathname.replace(/^\/+/, "");
    const assetPath = assetMap.get(key);
    if (!assetPath) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    const stream = fs.createReadStream(assetPath);
    stream.on("error", (err) => {
      res.statusCode = 500;
      res.end(String(err));
    });
    stream.pipe(res);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  const withUrls = {
    ...rewrittenSpec,
    audio_path: rewrittenSpec.audio_path ? `http://127.0.0.1:${port}/${rewrittenSpec.audio_path}` : "",
    overlay_video_path: rewrittenSpec.overlay_video_path ? `http://127.0.0.1:${port}/${rewrittenSpec.overlay_video_path}` : "",
    background_video_path: rewrittenSpec.background_video_path ? `http://127.0.0.1:${port}/${rewrittenSpec.background_video_path}` : "",
    sfx_timeline: (rewrittenSpec.sfx_timeline || []).map((cue) => ({
      ...cue,
      asset_path: cue.asset_path ? `http://127.0.0.1:${port}/${cue.asset_path}` : "",
    })),
    scenes: (rewrittenSpec.scenes || []).map((scene) => ({
      ...scene,
      asset_path: scene.asset_path ? `http://127.0.0.1:${port}/${scene.asset_path}` : "",
    })),
    stitch_preview: rewrittenSpec.stitch_preview
      ? {
          ...rewrittenSpec.stitch_preview,
          background_video_path: rewrittenSpec.stitch_preview.background_video_path
            ? `http://127.0.0.1:${port}/${rewrittenSpec.stitch_preview.background_video_path}`
            : "",
        }
      : undefined,
    video_text_fx: rewrittenSpec.video_text_fx
      ? {
          ...rewrittenSpec.video_text_fx,
          source_video_path: rewrittenSpec.video_text_fx.source_video_path
            ? `http://127.0.0.1:${port}/${rewrittenSpec.video_text_fx.source_video_path}`
            : "",
        }
      : undefined,
  };

  return {server, spec: withUrls};
};

const {server, spec} = await createAssetServer(rawSpec);
const bundled = await bundle({
  entryPoint,
  webpackOverride: (config) => config,
});

const inputProps = {spec};
const compositions = await getCompositions(bundled, {
  inputProps,
});
const compositionId = rawSpec.composition_id || "PremiumScienceReel";
const composition = compositions.find((comp) => comp.id === compositionId);

if (!composition) {
  throw new Error(`${compositionId} composition not found`);
}

try {
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    concurrency: 1,
    chromiumOptions: {
      gl: "swiftshader",
    },
  });
} finally {
  await new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
