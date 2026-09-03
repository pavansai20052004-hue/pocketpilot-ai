const TECHNICAL_PUNCTUATION: Readonly<Record<string, string>> = {
  '：': ':',
  '（': '(',
  '）': ')',
  '［': '[',
  '］': ']',
  '｛': '{',
  '｝': '}',
  '／': '/',
  '＼': '\\',
};

export function normalizeTechnicalText(rawText: string): string {
  let text = rawText.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  for (const [source, target] of Object.entries(TECHNICAL_PUNCTUATION)) {
    text = text.replaceAll(source, target);
  }
  return text
    .split('\n')
    .map((line) => normalizeTechnicalLine(line))
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function normalizeTechnicalLine(line: string): string {
  const withoutTrailingNoise = line.replace(/[ \t]+$/g, '');
  if (!looksTechnical(withoutTrailingNoise)) return withoutTrailingNoise;
  return withoutTrailingNoise
    .replace(/\s+([:;,.)\]])/g, '$1')
    .replace(/([([{/])\s+/g, '$1')
    .replace(/\.\s+(?=[A-Za-z_$])/g, '.')
    .replace(/\s+\//g, '/')
    .replace(/\s+\.\s+/g, '.')
    .replace(/\s+\/\s+/g, '/')
    .replace(/\b(line|File)\s*:\s*(\d+)\b/gi, '$1 $2');
}

function looksTechnical(line: string): boolean {
  return /(?:Error|Exception|Traceback|\bat\s+\S+|File\s+["']|\.\w{1,5}:\d+|\w+\([^)]*\)|\[[^\]]+\])/i.test(line);
}
