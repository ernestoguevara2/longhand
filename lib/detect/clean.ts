/**
 * Port of `clean_text` from the Fakespot model's utils.py, which its model card recommends
 * before scoring. Applied to classifier input only; the text the user sees is untouched.
 */
export function cleanForClassifier(input: string): string {
  let t = input
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\(.*?\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/#+ /g, "")
    .replace(/^>.*$/gm, "")
    .replace(/^(\s*[-*+]|\d+\.)\s+/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/\|.*?\|/g, "")
    .replace(/<.*?>/g, "");
  t = t
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  return t
    .replace(/[\n\t\r]/g, " ")
    .replace(/ ,/g, ",")
    .replace(/ +/g, " ")
    .trim();
}
