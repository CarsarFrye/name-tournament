import { createTournament, stepTournament, type GameState } from '../src/game/engine.ts';
import { scoreName } from '../src/game/scoring.ts';

const customNames = ['韩雨桐', '林知夏', '江予白', '沈星野', '顾清和', '苏念安', '许知遥', '陆景行', '唐晚宁', '温书屿', '叶听澜', '方清越'];
const candidateRuns = Number(process.argv[2] ?? 24);
const seedRuns = Number(process.argv[3] ?? 160);

type Aggregate = { runs: number; qualified: number; top8: number; champion: number; groupWins: number; losses: number; matchWins: number; matchCount: number };
const aggregate = new Map<string, Aggregate>();
const championCounts = new Map<string, number>();
let matchCount = 0;
let closePointMatches = 0;
let pointMarginTotal = 0;
let totalBouts = 0;
let customWinBouts = 0;
let customBouts = 0;
let playerHasSeed = 0;

function play(state: GameState): boolean {
  let guard = 0;
  let playerReachedTop8 = false;
  let qualifierIds: Set<string> | undefined;
  while (state.stage !== 'done' && guard < 5000) {
    stepTournament(state);
    if (state.stage !== 'groups' && !qualifierIds) qualifierIds = new Set(state.qualifiers.map((entrant) => entrant.id));
    const stillAlive = qualifierIds ? state.entrants.filter((entrant) => qualifierIds!.has(entrant.id) && entrant.losses < 2) : [];
    if (stillAlive.length > 0 && stillAlive.length <= 8 && qualifierIds?.has('player') && state.entrants.find((entrant) => entrant.id === 'player')!.losses < 2) playerReachedTop8 = true;
    guard += 1;
  }
  if (state.stage !== 'done') throw new Error(`seed ${state.seed} did not finish`);
  return playerReachedTop8;
}

function run(name: string, seed: number): void {
  const game = createTournament(name, 'auto', seed);
  const playerReachedTop8 = play(game);
  const player = game.entrants.find((entrant) => entrant.id === 'player')!;
  const stats = aggregate.get(name) ?? { runs: 0, qualified: 0, top8: 0, champion: 0, groupWins: 0, losses: 0, matchWins: 0, matchCount: 0 };
  stats.runs += 1;
  stats.qualified += Number(game.qualifiers.some((entrant) => entrant.id === 'player'));
  stats.top8 += Number(playerReachedTop8);
  stats.champion += Number(game.championId === 'player');
  stats.losses += player.losses;
  stats.groupWins += game.results.filter((match) => match.stage === 'groups' && match.winnerId === 'player').length;
  stats.matchWins += game.results.filter((match) => (match.aId === 'player' || match.bId === 'player') && match.winnerId === 'player').length;
  stats.matchCount += game.results.filter((match) => match.aId === 'player' || match.bId === 'player').length;
  aggregate.set(name, stats);
  const champion = game.entrants.find((entrant) => entrant.id === game.championId)!;
  championCounts.set(champion.name, (championCounts.get(champion.name) ?? 0) + 1);
  for (const match of game.results) {
    matchCount += 1;
    const margin = Math.abs(match.aTotalScore - match.bTotalScore);
    pointMarginTotal += margin;
    closePointMatches += Number(margin <= 1.5);
    totalBouts += match.bouts.length;
    if (match.aId === 'player' || match.bId === 'player') {
      customBouts += match.bouts.length;
      customWinBouts += match.bouts.filter((bout) => bout.winnerId === 'player').length;
    }
  }
  playerHasSeed += Number(player.seed !== undefined);
}

for (let index = 0; index < seedRuns; index += 1) run('林见山', (0x5eed1234 + index * 7919) >>> 0);
for (const [nameIndex, name] of customNames.entries()) {
  for (let index = 0; index < candidateRuns; index += 1) run(name, (0x9e3779b9 + nameIndex * 104729 + index * 7919) >>> 0);
}

console.log(JSON.stringify({
  runs: [...aggregate.entries()].map(([name, values]) => ({
    name,
    ratings: scoreName(name).ratings,
    ...values,
    qualificationRate: `${(100 * values.qualified / values.runs).toFixed(1)}%`,
    top8Rate: `${(100 * values.top8 / values.runs).toFixed(1)}%`,
    titleRate: `${(100 * values.champion / values.runs).toFixed(1)}%`,
  })),
  tournamentSummary: {
    seasons: seedRuns + candidateRuns * customNames.length,
    matches: matchCount,
    closePointMatchRate: `${(100 * closePointMatches / matchCount).toFixed(1)}%`,
    meanPointMargin: (pointMarginTotal / matchCount).toFixed(2),
    meanBoutCount: (totalBouts / matchCount).toFixed(2),
    playerBoutWinRate: `${(100 * customWinBouts / customBouts).toFixed(1)}%`,
    playerMatchWinRate: `${(100 * [...aggregate.values()].reduce((sum, item) => sum + item.matchWins, 0) / [...aggregate.values()].reduce((sum, item) => sum + item.matchCount, 0)).toFixed(1)}%`,
    topNpcChampions: [...championCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    seededPlayerShare: `${(100 * playerHasSeed / (seedRuns + candidateRuns * customNames.length)).toFixed(1)}%`,
  },
}, null, 2));
