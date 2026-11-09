/** The in-browser classifier. The revision is pinned so a repo update cannot change scores silently. */
export const CLASSIFIER = {
  id: "hbhanushali/fakespot-ai-detector-onnx",
  revision: "e2fddfefe101446f4626061424e156c9058092e0",
  dtype: "q8",
  maxTokens: 512,
  approxDownloadMb: 125,
} as const;
