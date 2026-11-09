// Copies the ONNX Runtime WASM files into public/ort so the app self-hosts them
// and scanning never depends on a third-party script CDN.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const transformersEntry = require.resolve("@huggingface/transformers");
const transformersRequire = createRequire(transformersEntry);
const ortDir = dirname(transformersRequire.resolve("onnxruntime-web"));
const target = join(process.cwd(), "public", "ort");
mkdirSync(target, { recursive: true });

const files = readdirSync(ortDir).filter((f) =>
  /^ort-wasm-simd-threaded\.(asyncify\.)?(mjs|wasm)$/.test(f),
);
for (const f of files) cpSync(join(ortDir, f), join(target, f));
console.log(`copied ${files.length} ONNX Runtime files to public/ort`);
