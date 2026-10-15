import fs from 'node:fs';
import path from 'node:path';

const inputDir = process.argv[2];
if (!inputDir) throw new Error('用法: node scripts/build-unihan.mjs <Unihan解压目录>');
const records = new Map();
const readFields = (file, wanted) => {
  for (const line of fs.readFileSync(path.join(inputDir, file), 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const [code, field, value] = line.split('\t');
    if (!wanted.has(field)) continue;
    const point = Number.parseInt(code.slice(2), 16);
    const char = String.fromCodePoint(point);
    if (!/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u{20000}-\u{2FA1F}\u{30000}-\u{323AF}]/u.test(char)) continue;
    const record = records.get(char) ?? {};
    record[field] = value;
    records.set(char, record);
  }
};

readFields('Unihan_Readings.txt', new Set(['kMandarin', 'kHanyuPinlu', 'kDefinition']));
readFields('Unihan_IRGSources.txt', new Set(['kTotalStrokes']));

const toneMap = { 'ā': 1, 'á': 2, 'ǎ': 3, 'à': 4, 'ē': 1, 'é': 2, 'ě': 3, 'è': 4, 'ī': 1, 'í': 2, 'ǐ': 3, 'ì': 4, 'ō': 1, 'ó': 2, 'ǒ': 3, 'ò': 4, 'ū': 1, 'ú': 2, 'ǔ': 3, 'ù': 4, 'ǖ': 1, 'ǘ': 2, 'ǚ': 3, 'ǜ': 4 };
function pinyinInfo(value = '') {
  const syllable = value.trim().split(/[ ,;]/)[0]?.toLowerCase() ?? '';
  let tone = 5;
  let pinyin = '';
  for (const char of syllable) {
    const decomposed = char.normalize('NFD');
    const base = decomposed[0];
    if (toneMap[char]) tone = toneMap[char];
    pinyin += 'ǖǘǚǜ'.includes(char) ? 'v' : base;
  }
  return { pinyin, tone };
}

const positive = /bright|brilliant|beautiful|good|auspicious|lucky|virtue|virtuous|wisdom|wise|talent|talented|healthy|strong|peace|peaceful|prosper|prosperous|wealth|rich|jade|precious|grace|elegant|noble|honor|honour|loyal|faithful|kind|benevolent|love|joy|happy|happiness|success|excellent|glory|radiant|clear|pure|fragrant|spring|sun|moon|star|phoenix|dragon|flower|blossom|forest|sea|ocean|sky|heaven|scholar|scholarly|hero|brave|courage|hope|celebrate|celebration|favor|favour|merit|fine|splendid|refined/i;
const negative = /evil|wicked|bad|ugly|fool|stupid|idiot|enemy|hatred|hate|death|die|dead|sick|disease|illness|poor|poverty|weak|coward|shame|disgrace|crime|criminal|curse|poison|filth|dirty|violent|violence|sorrow|grief|unlucky|inauspicious/i;
const frequencyValues = [...records.values()].map((record) => {
  const matches = [...(record.kHanyuPinlu ?? '').matchAll(/\((\d+)\)/g)];
  return matches.reduce((sum, match) => sum + Number(match[1]), 0);
});
const maxFrequency = Math.max(1, ...frequencyValues);
const output = {};
for (const [char, record] of records) {
  const { pinyin, tone } = pinyinInfo(record.kMandarin);
  const strokes = Number.parseInt(record.kTotalStrokes ?? '', 10);
  const counts = [...(record.kHanyuPinlu ?? '').matchAll(/\((\d+)\)/g)].map((match) => Number(match[1]));
  const freq = counts.reduce((sum, count) => sum + count, 0);
  const gloss = record.kDefinition ?? '';
  if (!pinyin && !freq && !gloss) continue;
  const sentiment = (positive.test(gloss) ? 1 : 0) - (negative.test(gloss) ? 1 : 0);
  const meaning = sentiment > 0 ? .78 : sentiment < 0 ? .3 : .56;
  output[char] = [pinyin, tone, Number.isFinite(strokes) ? strokes : 8, freq ? Math.log1p(freq) / Math.log1p(maxFrequency) : .46, meaning, Number.isFinite(strokes), freq > 0, Boolean(gloss)];
}

const target = new URL('../src/game/unihan-facts.json', import.meta.url);
fs.writeFileSync(target, `${JSON.stringify(Object.entries(output))}\n`);
console.log(`写入 ${Object.keys(output).length} 个汉字资料到 ${target.pathname}`);
