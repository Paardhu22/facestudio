/*
 * Face-detection worker (SKILLS.md §C.7, ADR-016).
 *
 * This is a CLASSIC worker on purpose: a verified spike showed MediaPipe's loader cannot initialise inside a MODULE worker
 * ("ModuleFactory not set"), while a classic worker that `importScripts` the bundled UMD script works. It is plain JavaScript
 * served from /public (not bundled), so its message shapes are documented here and mirrored by
 * `src/features/face-detection/detection-client.ts`.
 *
 * Request : { type: 'detect', id, bitmap, minConfidence, wasmPath, modelPath }   (bitmap is transferred and closed here)
 * Response: { type: 'result', id, width, height, faces: [{ box: {x,y,width,height}, score, keypoints: [{x,y}] }] }
 *           { type: 'error', id, message, fatal }   (fatal = the detector itself cannot run, so do not retry)
 *
 * Boxes are in INPUT pixels; keypoints are normalized 0..1. Detection only: no recognition, no embeddings.
 */
importScripts('/mediapipe/vision_bundle.js');

let detectorPromise = null;

function getDetector(wasmPath, modelPath, minConfidence) {
  if (!detectorPromise) {
    detectorPromise = Vision.FilesetResolver.forVisionTasks(wasmPath)
      .then((vision) =>
        Vision.FaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
          runningMode: 'IMAGE',
          minDetectionConfidence: minConfidence,
        }),
      )
      .catch((error) => {
        detectorPromise = null; // allow a later retry (for example after the model has been installed)
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { fatal: true });
      });
  }
  return detectorPromise;
}

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || message.type !== 'detect') return;
  const { id, bitmap } = message;
  try {
    const detector = await getDetector(message.wasmPath, message.modelPath, message.minConfidence);
    const result = detector.detect(bitmap);
    const faces = result.detections.map((detection) => {
      const box = detection.boundingBox;
      return {
        box: { x: box.originX, y: box.originY, width: box.width, height: box.height },
        score: detection.categories[0] ? detection.categories[0].score : 0,
        keypoints: (detection.keypoints || []).map((point) => ({ x: point.x, y: point.y })),
      };
    });
    self.postMessage({ type: 'result', id, width: bitmap.width, height: bitmap.height, faces });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      message: error instanceof Error ? error.message : String(error),
      fatal: Boolean(error && error.fatal),
    });
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
};
