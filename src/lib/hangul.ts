
const LEAD = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const VOWEL = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const TAIL = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
const SPLIT: Record<string, string> = {
  ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ',
  ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ',
};
const split = (j: string) => SPLIT[j] ?? j;

function keys(ch: string): string {
  const i = ch.charCodeAt(0) - 0xac00;
  if (i < 0 || i > 11171) return split(ch);
  return LEAD[Math.floor(i / 588)] + split(VOWEL[Math.floor((i % 588) / 28)]) + split(TAIL[i % 28].trim());
}
const isHangul = (ch: string) => /[가-힣ㄱ-ㆎ]/.test(ch);

export function typedIn(text: string, q: string, start = false): boolean {
  const at0 = (t: string) => (start ? t.startsWith(q) : t.includes(q));
  if (at0(text)) return true;
  if (q.length > 1 && [...q].every((c) => LEAD.includes(c)) && at0([...text].map((c) => keys(c)[0]).join(''))) return true;
  const last = q.at(-1);
  if (!last || !isHangul(last)) return false;
  const head = q.slice(0, -1), tail = keys(last);
  for (let at = text.indexOf(head); at >= 0 && at < text.length && !(start && at > 0); at = text.indexOf(head, at + 1)) {
    const next = text.slice(at + head.length, at + head.length + 2);
    if ([...next].map(keys).join('').startsWith(tail)) return true;
  }
  return false;
}
