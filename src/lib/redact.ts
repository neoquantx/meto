const REDACTED = "[redacted]";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CARD = /\d(?:[ -]?\d){12,18}/g;
const PHONE =
  /(?:\+\d{1,3}[\s.-]*)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]+\d{3,4}[\s.-]+\d{3,4}|\+\d[\d\s().-]{7,}\d|\b[6-9]\d{9}\b/g;

export function redactText(value: string) {
  const withoutEmail = value.replace(EMAIL, REDACTED);
  const withoutCards = replaceBounded(withoutEmail, CARD, (match) => {
    const digits = match.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 ? REDACTED : match;
  });
  return replaceBounded(withoutCards, PHONE, () => REDACTED);
}

function replaceBounded(value: string, pattern: RegExp, replace: (match: string) => string) {
  return value.replace(pattern, (match, offset: number, source: string) => {
    const before = source[offset - 1] ?? "";
    const after = source[offset + match.length] ?? "";
    if (/\d/.test(before) || /\d/.test(after)) return match;
    return replace(match);
  });
}
