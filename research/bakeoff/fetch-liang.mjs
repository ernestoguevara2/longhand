// Downloads the essay data published with Liang et al. (2023) into ./data.
// The upstream repo declares no license, so this data is fetched, never committed.
import { mkdirSync, writeFileSync } from "node:fs";

const BASE =
  "https://raw.githubusercontent.com/Weixin-Liang/ChatGPT-Detector-Bias/main/Data_and_Results";
const SETS = [
  ["Human_Data/TOEFL_real_91", "human_toefl", 91],
  ["Human_Data/HewlettStudentEssay_real_88", "human_us_8th_grade", 88],
  ["Human_Data/CollegeEssay_real_70", "human_college_essay", 70],
  ["Human_Data/CS224N_real_145", "human_cs224n_abstract", 60],
  ["GPT_Data/CollegeEssay_gpt3_31", "ai_gpt3_essay", 31],
  ["GPT_Data/CS224N_gpt3_145", "ai_gpt3_abstract", 60],
  ["GPT_Data/CS224N_gpt3PromptEng_145", "ai_gpt3_prompted_literary", 60],
];

mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
const rows = [];
for (const [path, bucket, max] of SETS) {
  const res = await fetch(`${BASE}/${path}/data.json`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const docs = (await res.json()).map((d) => d.document).filter(Boolean).slice(0, max);
  rows.push(...docs.map((text) => ({ bucket, source: "Liang et al.", text })));
  console.log(bucket, docs.length);
}
writeFileSync(new URL("./data/liang.json", import.meta.url), JSON.stringify(rows));
