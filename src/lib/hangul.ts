// Korean typed key by key: a syllable is built up as it is typed (ㅎ, 호, 회), and a final consonant can still move on
// to start the next one (회 + ㅇ is 횡, and + ㅡ makes it 회으). A field holds each of these on the way to the word.

const LEAD = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const VOWEL = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const TAIL = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
/** a vowel or final made of two keys, as the two */
const SPLIT: Record<string, string> = {
  ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ',
  ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ',
};
const split = (j: string) => SPLIT[j] ?? j;

/** the keys that type one character: 회 → ㅎㅗㅣ, 값 → ㄱㅏㅂㅅ; anything not Korean is itself */
function keys(ch: string): string {
  const i = ch.charCodeAt(0) - 0xac00;
  if (i < 0 || i > 11171) return split(ch);
  return LEAD[Math.floor(i / 588)] + split(VOWEL[Math.floor((i % 588) / 28)]) + split(TAIL[i % 28].trim());
}
const isHangul = (ch: string) => /[가-힣ㄱ-ㆎ]/.test(ch);

/**
 * `q` found in `text`, the last syllable of `q` counting as however far it has been typed: 회의록 is found by 호, 횡
 * and 회으 as well as by 회의 (a list cut down as a title is typed went empty at each of those, and back).
 */
export function typedIn(text: string, q: string): boolean {
  if (text.includes(q)) return true;
  const last = q.at(-1);
  if (!last || !isHangul(last)) return false;
  const head = q.slice(0, -1), tail = keys(last);
  // the syllable being typed, and the one after it (where a final consonant may yet go)
  for (let at = text.indexOf(head); at >= 0 && at < text.length; at = text.indexOf(head, at + 1)) {
    const next = text.slice(at + head.length, at + head.length + 2);
    if ([...next].map(keys).join('').startsWith(tail)) return true;
  }
  return false;
}
