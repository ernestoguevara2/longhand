import type { Metadata } from "next";
import Link from "next/link";

import evaluation from "@/lib/detect/data/evaluation.json";

export const metadata: Metadata = {
  title: "How scores work: Longhand",
  description: "What Longhand's scanner measures, its measured error rates, and where it fails.",
};

const GROUP_NAMES: Record<string, string> = {
  human_hc3: "Human: online answers (HC3)",
  human_raid: "Human: paper abstracts (RAID)",
  human_us_8th_grade: "Human: US 8th-grade essays",
  human_college_essay: "Human: college essays",
  human_cs224n_abstract: "Human: student paper abstracts",
  human_toefl: "Human: TOEFL essays by non-native writers",
  ai_raid: "AI: ChatGPT, GPT-4, Llama and Mistral (RAID)",
  ai_raid_paraphrased: "AI: same models, paraphrased",
  ai_gpt3_essay: "AI: GPT-3 essays",
  ai_gpt3_abstract: "AI: GPT-3 abstracts",
  ai_gpt3_prompted_literary: "AI: GPT-3 asked to write literary prose",
  "ai_fresh_gemma4:e4b": "AI: Gemma 4 e4b, 2026",
  "ai_fresh_gemma4:26b": "AI: Gemma 4 26b, 2026",
};

const percent = (value: number | null) => (value === null ? "n/a" : `${value}%`);

export default function HowItWorks() {
  const groups = [...evaluation.perBucket].sort((a, b) => Number(b.bucket.startsWith("human")) - Number(a.bucket.startsWith("human")));
  return (
    <div className="mx-auto w-full max-w-[46rem] px-5 pt-3 pb-20">
      <Link href="/" className="font-serif text-xl italic">
        Longhand
      </Link>
      <article className="mt-12 space-y-10 font-serif text-[1.0625rem] leading-[1.75] [&_h2]:mb-3 [&_h2]:font-sans [&_h2]:text-xl [&_h2]:font-semibold">
        <header>
          <h1 className="font-sans text-4xl leading-tight font-semibold">How scores work</h1>
          <p className="mt-4">
            Longhand estimates whether writing resembles AI output. The score is not proof of who wrote something,
            and it should never be the only reason to accuse anyone.
          </p>
        </header>

        <section>
          <h2>What gets measured</h2>
          <p>
            The quick read counts writing patterns: contrasts like &ldquo;not just X but Y&rdquo;, inflated claims,
            chatbot leftovers, and vocabulary that language models overuse. It runs as you type, and each highlight names
            its reason.
          </p>
          <p className="mt-4">
            The deep scan adds a language classifier, a RoBERTa model from Fakespot AI Labs that runs in your browser.
            Its result is combined with the patterns using a small formula fitted on human and AI text. Your text is not
            sent anywhere for either scan.
          </p>
          <p className="mt-4">
            A score of 70 or more means &ldquo;Likely AI&rdquo;. The line is set on calibration data so that at most about
            6% of human writing, not counting academic abstracts, and about 20% of essays by non-native writers would cross
            it. The number is a signal strength, not the chance that AI wrote the text.
          </p>
        </section>

        <section>
          <h2>Measured results</h2>
          <p>
            These figures come from {evaluation.summary.testSamples} samples held back from calibration. It is a small
            test, and most of the AI text comes from older models, so read it as a rough guide.
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full font-sans text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-normal">Group</th>
                  <th className="py-2 pr-4 text-right font-normal">Samples</th>
                  <th className="py-2 pr-4 text-right font-normal">Raw model flags</th>
                  <th className="py-2 text-right font-normal">Longhand: Likely AI</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((row) => (
                  <tr key={row.bucket} className="border-b border-border/60">
                    <td className="py-2 pr-4">{GROUP_NAMES[row.bucket] ?? row.bucket}</td>
                    <td className="py-2 pr-4 text-right">{row.n}</td>
                    <td className="py-2 pr-4 text-right">{percent(row.rawFlaggedAt50)}</td>
                    <td className="py-2 text-right">{percent(row.deepLikelyAi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 font-sans text-sm leading-relaxed text-muted-foreground">
            For human groups, lower is better: each flag is a false accusation. For AI groups, higher is better. &ldquo;Raw
            model&rdquo; is the classifier alone at its usual 50% cutoff.
          </p>
        </section>

        <section>
          <h2>Where it fails</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Academic and technical writing.</strong> This kind of prose scores high even when a person wrote it,
              and Longhand warns you when text looks like this.
            </li>
            <li>
              <strong>Non-native English writers.</strong> Detectors flag them far more often. Published research found this
              across seven detectors, and our own test above shows it too.
            </li>
            <li>
              <strong>Short text.</strong> Under 50 words gets no verdict, and under 150 is low confidence.
            </li>
            <li>
              <strong>Other languages.</strong> Calibration is for English, so no percentage is shown.
            </li>
            <li>
              <strong>Newer models.</strong> Any detector falls behind as AI writing changes.
            </li>
          </ul>
        </section>

        <section>
          <h2>About rewriting</h2>
          <p>
            A rewrite is checked against your draft for numbers, names, quotations, links, layout and length. An optional
            fact check asks the model to compare both versions. Anything that fails is shown, but these checks can still
            miss a changed meaning, so read the result before you use it.
          </p>
          <p className="mt-4">
            Longhand does not promise that a rewrite will pass any detector, because results vary between detectors and
            change over time. Follow the rules of your school, employer or publisher on AI assistance.
          </p>
        </section>

        <section>
          <h2>Your privacy</h2>
          <p>
            Scans run in your browser. The one-time model download contacts Hugging Face but sends no text. Rewrites go only
            to the model you choose: with Ollama they stay on your computer, and with a cloud provider they go to that
            provider under its terms. Longhand has no accounts or analytics and keeps nothing on a server. History stays in
            your browser, and you can turn it off.
          </p>
        </section>
      </article>
    </div>
  );
}
