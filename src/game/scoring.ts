import { TRAITS, type Trait } from './data.ts';
import UNIHAN_FACTS from './unihan-facts.json' with { type: 'json' };

export type Ratings = Record<Trait, number>;
export type ScoreProfile = { ratings: Ratings; reasons: Record<Trait, string>; unknownChars: string[] };
type CharacterFacts = { pinyin: string; tone: number; strokes: number; common: number; meaning: number; hasStrokes: boolean; hasFrequency: boolean; hasDefinition: boolean };
const characterFacts = new Map(UNIHAN_FACTS as unknown as [string, [string, number, number, number, number, boolean, boolean, boolean]][]);

const clamp = (n: number) => Math.max(0, Math.min(10, n));
const roundTenth = (n: number) => Math.round(clamp(n) * 10) / 10;
const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'w', 'y'];

function splitPinyin(value: string): { initial: string; final: string } {
  const initial = INITIALS.find((item) => value.startsWith(item)) ?? '';
  return { initial, final: value.slice(initial.length) };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function spread(values: number[]): number {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

export function scoreName(name: string): ScoreProfile {
  const chars = Array.from(name);
  const facts: CharacterFacts[] = chars.map((char) => {
    const [pinyin, tone, strokes, common, meaning, hasStrokes, hasFrequency, hasDefinition] = characterFacts.get(char) ?? ['', 2, 8, .46, .56, false, false, false];
    return { pinyin, tone, strokes, common, meaning, hasStrokes, hasFrequency, hasDefinition };
  });
  const readingCount = facts.filter((fact) => Boolean(fact.pinyin)).length;
  const strokeCount = facts.filter((fact) => fact.hasStrokes).length;
  const frequencyCount = facts.filter((fact) => fact.hasFrequency).length;
  const definitionCount = facts.filter((fact) => fact.hasDefinition).length;
  const syllables = facts.map((fact) => splitPinyin(fact.pinyin));
  const tones = facts.map((fact) => fact.tone === 5 ? 2.5 : fact.tone);
  const toneVariety = new Set(tones).size;
  const toneSteps = tones.slice(1).map((tone, index) => tone - tones[index]);
  const contourChanges = toneSteps.slice(1).filter((step, index) => Math.sign(step) !== Math.sign(toneSteps[index]) && step !== 0 && toneSteps[index] !== 0).length;
  const repeatedInitials = syllables.slice(1).filter((syllable, index) => syllable.initial && syllable.initial === syllables[index].initial).length;
  const repeatedFinals = syllables.slice(1).filter((syllable, index) => syllable.final && syllable.final === syllables[index].final).length;
  const distinctInitials = new Set(syllables.map((syllable) => syllable.initial).filter(Boolean)).size;
  const distinctFinals = new Set(syllables.map((syllable) => syllable.final).filter(Boolean)).size;
  const missingReadings = chars.length - readingCount;
  const sameToneSteps = toneSteps.filter((step) => step === 0).length;
  const toneRange = Math.max(...tones) - Math.min(...tones);
  const rhythm = 5.2
    + toneRange * .34
    + Math.max(0, toneVariety - 1) * .42
    + contourChanges * .32
    + (distinctFinals / Math.max(1, chars.length)) * .45
    + (syllables.length > 1 ? .2 : 0)
    - sameToneSteps * .35
    - repeatedInitials * .55
    - repeatedFinals * .3
    - missingReadings * .35;

  const strokes = facts.map((fact) => fact.hasStrokes ? fact.strokes : 8);
  const averageStroke = mean(strokes);
  const strokeSpread = spread(strokes);
  const strokeGaps = strokes.slice(1).map((value, index) => Math.abs(value - strokes[index]));
  const averageGap = mean(strokeGaps);
  const strokeExtremes = strokes.filter((value) => value <= 5 || value >= 19).length;
  const shape = 7.3
    - Math.abs(averageStroke - 10.5) * .2
    - Math.abs(strokeSpread - 3.2) * .32
    + averageGap * .16
    - strokeExtremes * .32
    + (distinctInitials === chars.length && chars.length > 1 ? .15 : 0);

  const semanticSignals = facts.map((fact) => (fact.meaning - .56) / .22);
  const semanticAverage = mean(semanticSignals);
  const semanticSpread = spread(semanticSignals);
  const semanticHarmony = semanticSpread === 0 ? .15 : -.18 * semanticSpread;
  const definitionCoverage = definitionCount / Math.max(1, chars.length);
  const meaning = 6.45
    + semanticAverage * 2.15
    + semanticHarmony
    + (definitionCoverage - .7) * .6;

  const raritySignals = facts.map((fact) => {
    if (fact.hasFrequency) return 1 - fact.common;
    const strokeRarity = clamp(Math.abs((fact.hasStrokes ? fact.strokes : 8) - 10) / 10);
    const pronunciationRarity = fact.pinyin.length >= 4 ? .25 : 0;
    return .28 + strokeRarity * .5 + pronunciationRarity;
  });
  const uniqueSyllables = new Set(facts.map((fact) => fact.pinyin).filter(Boolean)).size;
  const phoneticSignature = (distinctInitials + distinctFinals) / Math.max(1, chars.length * 2);
  const averageRarity = mean(raritySignals);
  const recognition = 6.35
    + (averageRarity - .45) * 3.2
    + (phoneticSignature - .68) * 1.5
    + Math.max(0, uniqueSyllables - 1) * .08
    - (readingCount > 1 && uniqueSyllables < readingCount ? .55 : 0)
    - repeatedInitials * .22
    - repeatedFinals * .16;
  const ratings: Ratings = {
    sound: roundTenth(rhythm),
    shape: roundTenth(shape),
    meaning: roundTenth(meaning),
    recognition: roundTenth(recognition),
  };

  const reasons: Record<Trait, string> = {
    sound: `Unihan 默认读音覆盖 ${readingCount}/${chars.length} 字；结合声调跨度、声调转折、声母与韵母重复度估算节奏，多音字采用默认读音。`,
    shape: `Unihan 笔画资料覆盖 ${strokeCount}/${chars.length} 字；结合平均笔画 ${averageStroke.toFixed(1)}、笔画差异 ${strokeSpread.toFixed(1)}、相邻字笔画落差与极繁/极简字估算视觉平衡。`,
    meaning: `Unihan 英文单字释义覆盖 ${definitionCount}/${chars.length} 字；褒贬词线索与释义覆盖度会影响分数，但不能理解姓名组合的文化语境。`,
    recognition: `字符词频覆盖 ${frequencyCount}/${chars.length} 字；稀有度、音节重复与声韵组合共同估算记忆区分度。频率仅是弱信号，不等于真实姓名重名率。`,
  };
  return { ratings, reasons, unknownChars: [...new Set(chars.filter((_, index) => !facts[index].pinyin))] };
}

export function signatureOf(ratings: Ratings): Trait {
  return TRAITS.reduce((best, current) => ratings[current.id] > ratings[best] ? current.id : best, TRAITS[0].id);
}

export function weaknessOf(ratings: Ratings): Trait {
  return TRAITS.reduce((weak, current) => ratings[current.id] < ratings[weak] ? current.id : weak, TRAITS[0].id);
}

export function traitLabel(trait: Trait): string {
  return TRAITS.find((item) => item.id === trait)?.name ?? trait;
}
