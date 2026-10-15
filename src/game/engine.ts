import { NPC_NAMES, SCENES, TRAITS, type Trait } from './data.ts';
import { scoreName, signatureOf, traitLabel, weaknessOf, type Ratings, type ScoreProfile } from './scoring.ts';

export type Mode = 'manual' | 'auto';
export type Stage = 'groups' | 'winners' | 'losers' | 'grand-final' | 'reset-final' | 'done';
export type Entrant = {
  id: string;
  name: string;
  isPlayer: boolean;
  profile: ScoreProfile;
  group?: string;
  seed?: number;
  losses: number;
};
export type Pairing = { id: string; stage: Stage; label: string; aId: string; bId: string; group?: string };
export type BoutRecord = {
  scene: string;
  sceneTrait: Trait;
  aTrait: Trait;
  bTrait: Trait;
  aScore: number;
  bScore: number;
  aSwing: number;
  bSwing: number;
  winnerId: string;
  note: string;
  suddenDeath?: boolean;
};
export type MatchRecord = Pairing & {
  winnerId: string;
  loserId: string;
  aWins: number;
  bWins: number;
  aTotalScore: number;
  bTotalScore: number;
  bouts: BoutRecord[];
};
export type MatchSession = Pairing & {
  sceneIndex: number;
  aWins: number;
  bWins: number;
  aTotalScore: number;
  bTotalScore: number;
  aUsed: Trait[];
  bUsed: Trait[];
  bouts: BoutRecord[];
  scene: (typeof SCENES)[number];
};
export type GameState = {
  version: 1;
  seed: number;
  rngState: number;
  mode: Mode;
  stage: Stage;
  entrants: Entrant[];
  groups: Entrant[][];
  groupMatches: Pairing[];
  groupIndex: number;
  results: MatchRecord[];
  session?: MatchSession;
  qualifiers: Entrant[];
  winnersAlive: Entrant[];
  oneLossAlive: Entrant[];
  wChampion?: Entrant;
  bracketRound: number;
  queue: Pairing[];
  queueIndex: number;
  waveWinners: Entrant[];
  waveLosers: Entrant[];
  waveByes: Entrant[];
  championId?: string;
  finishReason?: 'player-eliminated' | 'champion';
  createdAt: number;
};

const TRAIT_BEATS: Record<Trait, Trait> = {
  sound: 'recognition',
  recognition: 'shape',
  shape: 'meaning',
  meaning: 'sound',
};
const TRAIT_BEATEN_BY: Record<Trait, Trait> = {
  sound: 'meaning',
  recognition: 'sound',
  shape: 'recognition',
  meaning: 'shape',
};
const GROUP_NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛'];

export function seededRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: (state + 0x6d2b79f5) | 0 };
}

function pickScene(state: GameState): (typeof SCENES)[number] {
  const draw = seededRandom(state.rngState);
  state.rngState = draw.state;
  return SCENES[Math.floor(draw.value * SCENES.length)];
}

function shuffled<T>(items: T[], state: GameState): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const draw = seededRandom(state.rngState);
    state.rngState = draw.state;
    const j = Math.floor(draw.value * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function createTournament(playerName: string, mode: Mode, seed: number): GameState {
  const player = makeEntrant('player', playerName.trim(), true);
  const npcEntrants = NPC_NAMES.map((name, index) => makeEntrant(`npc-${index + 1}`, name, false));
  const state: GameState = {
    version: 1,
    seed: seed >>> 0,
    rngState: seed >>> 0,
    mode,
    stage: 'groups',
    entrants: [player, ...npcEntrants],
    groups: [],
    groupMatches: [],
    groupIndex: 0,
    results: [],
    qualifiers: [],
    winnersAlive: [],
    oneLossAlive: [],
    bracketRound: 0,
    queue: [],
    queueIndex: 0,
    waveWinners: [],
    waveLosers: [],
    waveByes: [],
    createdAt: Date.now(),
  };
  const draw = shuffled(state.entrants, state);
  let cursor = 0;
  state.groups = GROUP_NAMES.map((name, index) => {
    const size = index === 0 ? 7 : 6;
    const group = draw.slice(cursor, cursor + size);
    cursor += size;
    group.forEach((entrant) => { entrant.group = name; });
    return group;
  });
  state.groupMatches = state.groups.flatMap((group, groupIndex) => {
    const matches: Pairing[] = [];
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        matches.push({ id: `g${groupIndex}-${i}-${j}`, stage: 'groups', label: `${nameOfGroup(groupIndex)}组循环赛`, aId: group[i].id, bId: group[j].id, group: nameOfGroup(groupIndex) });
      }
    }
    return matches;
  });
  if (mode === 'auto') {
    state.groupMatches.sort((a, b) => Number(isPlayerPair(b)) - Number(isPlayerPair(a)));
  }
  return state;
}

function makeEntrant(id: string, name: string, isPlayer: boolean): Entrant {
  return { id, name, isPlayer, profile: scoreName(name), losses: 0 };
}

function nameOfGroup(index: number): string { return GROUP_NAMES[index]; }
function getEntrant(state: GameState, id: string): Entrant { return state.entrants.find((entrant) => entrant.id === id)!; }
export function playerOf(state: GameState): Entrant { return state.entrants.find((entrant) => entrant.isPlayer)!; }

export function signature(entrant: Entrant): Trait { return signatureOf(entrant.profile.ratings); }
export function weakness(entrant: Entrant): Trait { return weaknessOf(entrant.profile.ratings); }

function npcChoice(self: Entrant, opponent: Entrant, used: Trait[], opponentLast: Trait | undefined, state: GameState, sceneTrait: Trait): Trait {
  const remaining = TRAITS.map((trait) => trait.id).filter((trait) => !used.includes(trait));
  if (remaining.length === 0) return TRAITS[0].id;
  let preferred: Trait;
  if (used.length === 0) {
    const ownSignature = signature(self);
    const opponentSignature = signature(opponent);
    preferred = TRAIT_BEATS[opponentSignature] === ownSignature ? TRAIT_BEATEN_BY[opponentSignature] : ownSignature;
  } else if (opponentLast) {
    const counter = TRAIT_BEATEN_BY[opponentLast];
    preferred = remaining.includes(counter)
      ? counter
      : remaining.reduce((best, trait) => self.profile.ratings[trait] > self.profile.ratings[best] ? trait : best, remaining[0]);
  } else {
    preferred = remaining.reduce((best, trait) => self.profile.ratings[trait] > self.profile.ratings[best] ? trait : best, remaining[0]);
  }

  // Keep the rule-based choice as the favorite while allowing the opponent and scene to affect the move.
  const alternatives = remaining.map((trait) => {
    let utility = (self.profile.ratings[trait] - 7) * .25;
    if (trait === preferred) utility += .85;
    if (trait === sceneTrait) utility += .4;
    if (opponentLast && TRAIT_BEATEN_BY[opponentLast] === trait) utility += .3;
    if (trait === signature(self)) utility += .15;
    if (trait === weakness(self)) utility -= .2;
    return { trait, weight: Math.exp(utility / .85) };
  });
  const draw = seededRandom(state.rngState);
  state.rngState = draw.state;
  const target = draw.value * alternatives.reduce((sum, option) => sum + option.weight, 0);
  let cumulative = 0;
  for (const option of alternatives) {
    cumulative += option.weight;
    if (target <= cumulative) return option.trait;
  }
  return alternatives.at(-1)!.trait;
}

function calculateScore(entrant: Entrant, own: Trait, other: Trait, sceneTrait: Trait, swing = 0): number {
  // Combat uses the entrant's relative strength, so an all-around high profile cannot beat everyone by default.
  const profileMean = TRAITS.reduce((sum, trait) => sum + entrant.profile.ratings[trait.id], 0) / TRAITS.length;
  const profileSpread = Math.sqrt(TRAITS.reduce((sum, trait) => sum + (entrant.profile.ratings[trait.id] - profileMean) ** 2, 0) / TRAITS.length);
  const relativeStrength = profileSpread > .25 ? (entrant.profile.ratings[own] - profileMean) / profileSpread : 0;
  let base = 7 + Math.max(-1.5, Math.min(1.5, relativeStrength)) * .55;
  if (own === signature(entrant)) base += .65;
  if (own === weakness(entrant)) base -= .25;
  const counterMultiplier = TRAIT_BEATS[own] === other ? 1.18 : TRAIT_BEATS[other] === own ? .88 : 1;
  let score = base * counterMultiplier;
  if (own === sceneTrait) score += .75;
  score += swing;
  return Math.round(score * 10) / 10;
}

function rollSwing(state: GameState): number {
  const options = [-.6, -.3, 0, .3, .6];
  const draw = seededRandom(state.rngState);
  state.rngState = draw.state;
  return options[Math.floor(draw.value * options.length)];
}

function resolveBout(
  state: GameState,
  a: Entrant,
  b: Entrant,
  scene: (typeof SCENES)[number],
  aTrait: Trait,
  bTrait: Trait,
  aUsed: Trait[],
  bUsed: Trait[],
): BoutRecord {
  const aSwing = rollSwing(state);
  const bSwing = rollSwing(state);
  const aScore = calculateScore(a, aTrait, bTrait, scene.trait, aSwing);
  const bScore = calculateScore(b, bTrait, aTrait, scene.trait, bSwing);
  let winnerId: string;
  let note = '';
  if (aScore !== bScore) {
    winnerId = aScore > bScore ? a.id : b.id;
  } else {
    const checks: [number, number, string][] = [
      [a.profile.ratings[aTrait], b.profile.ratings[bTrait], '该属性原始分'],
      [a.profile.ratings.recognition, b.profile.ratings.recognition, '辨识传播原始分'],
      [a.profile.ratings[signature(a)], b.profile.ratings[signature(b)], '本命属性原始分'],
    ];
    const decisive = checks.find(([left, right]) => left !== right);
    if (decisive) {
      winnerId = decisive[0] > decisive[1] ? a.id : b.id;
      note = `总分平局，按${decisive[2]}判定。`;
    } else {
      const aRemaining = TRAITS.map((trait) => trait.id).filter((trait) => !aUsed.includes(trait));
      const bRemaining = TRAITS.map((trait) => trait.id).filter((trait) => !bUsed.includes(trait));
      const suddenA = aRemaining.length ? npcChoice(a, b, aUsed, bTrait, state, scene.trait) : aTrait;
      const suddenB = bRemaining.length ? npcChoice(b, a, bUsed, aTrait, state, scene.trait) : bTrait;
      const suddenScene = pickScene(state);
      const suddenAScore = calculateScore(a, suddenA, suddenB, suddenScene.trait, aSwing);
      const suddenBScore = calculateScore(b, suddenB, suddenA, suddenScene.trait, bSwing);
      if (suddenAScore !== suddenBScore) winnerId = suddenAScore > suddenBScore ? a.id : b.id;
      else {
        const draw = seededRandom(state.rngState);
        state.rngState = draw.state;
        winnerId = draw.value >= .5 ? a.id : b.id;
      }
      note = `临场波动 ${swingLabel(a.name, aSwing)}，${swingLabel(b.name, bSwing)}；三项比较仍平，进行加赛：${traitLabel(suddenA)} ${suddenAScore} 分，${traitLabel(suddenB)} ${suddenBScore} 分；${noteForWinner(winnerId, a, b)}。`;
      return {
        scene: scene.name,
        sceneTrait: scene.trait,
        aTrait,
        bTrait,
        aScore,
        bScore,
        aSwing,
        bSwing,
        winnerId,
        note,
        suddenDeath: true,
      };
    }
  }
  note = [`临场波动 ${swingLabel(a.name, aSwing)}，${swingLabel(b.name, bSwing)}。`, note].filter(Boolean).join(' ');
  return { scene: scene.name, sceneTrait: scene.trait, aTrait, bTrait, aScore, bScore, aSwing, bSwing, winnerId, note };
}

function swingLabel(name: string, swing: number): string { return `${name} ${swing > 0 ? '+' : ''}${swing.toFixed(1)}`; }

function noteForWinner(winnerId: string, a: Entrant, b: Entrant): string {
  return `${winnerId === a.id ? a.name : b.name} 胜`;
}

function makeSession(state: GameState, pairing: Pairing): MatchSession {
  return {
    ...pairing,
    sceneIndex: 0,
    aWins: 0,
    bWins: 0,
    aTotalScore: 0,
    bTotalScore: 0,
    aUsed: [],
    bUsed: [],
    bouts: [],
    scene: pickScene(state),
  };
}

export function currentSession(state: GameState): MatchSession | undefined { return state.session; }

function isPlayerPair(pairing: Pairing): boolean {
  return pairing.aId === 'player' || pairing.bId === 'player';
}

export function advanceAutoTournament(state: GameState): GameState {
  if (state.mode !== 'auto') return stepTournament(state);
  let guard = 0;
  while (state.stage !== 'done' && guard < 20000) {
    const wasPlayerMatch = Boolean(state.session && isPlayerPair(state.session));
    stepTournament(state);
    if (wasPlayerMatch || (state.session && isPlayerPair(state.session))) return state;
    guard += 1;
  }
  return state;
}

export function advanceManualTournament(state: GameState, playerPick?: Trait): GameState {
  if (state.mode !== 'manual') return stepTournament(state, playerPick);
  let pick = playerPick;
  let guard = 0;
  while (state.stage !== 'done' && guard < 20000) {
    if (state.session && isPlayerPair(state.session)) {
      if (!pick) return state;
      stepTournament(state, pick);
      pick = undefined;
      if (state.session && isPlayerPair(state.session)) return state;
    } else {
      stepTournament(state);
    }
    guard += 1;
  }
  return state;
}

export function stepTournament(state: GameState, playerPick?: Trait): GameState {
  if (state.stage === 'done') return state;
  if (!state.session) {
    const pairing = nextPairing(state);
    if (!pairing) return state;
    state.session = makeSession(state, pairing);
    if (isPlayerPair(pairing)) return state;
  }

  const session = state.session;
  const a = getEntrant(state, session.aId);
  const b = getEntrant(state, session.bId);
  const aManual = state.mode === 'manual' && a.isPlayer;
  const bManual = state.mode === 'manual' && b.isPlayer;
  if ((aManual || bManual) && !playerPick) return state;
  const aTrait = aManual ? playerPick! : npcChoice(a, b, session.aUsed, lastWinningTrait(session, b.id), state, session.scene.trait);
  const bTrait = bManual ? playerPick! : npcChoice(b, a, session.bUsed, lastWinningTrait(session, a.id), state, session.scene.trait);
  if (session.aUsed.includes(aTrait) || session.bUsed.includes(bTrait)) return state;
  const bout = resolveBout(state, a, b, session.scene, aTrait, bTrait, session.aUsed, session.bUsed);
  session.bouts.push(bout);
  if (!Number.isFinite(session.aTotalScore)) session.aTotalScore = session.bouts.slice(0, -1).reduce((sum, item) => sum + item.aScore, 0);
  if (!Number.isFinite(session.bTotalScore)) session.bTotalScore = session.bouts.slice(0, -1).reduce((sum, item) => sum + item.bScore, 0);
  session.aTotalScore = Math.round((session.aTotalScore + bout.aScore) * 10) / 10;
  session.bTotalScore = Math.round((session.bTotalScore + bout.bScore) * 10) / 10;
  session.aUsed.push(aTrait);
  session.bUsed.push(bTrait);
  if (bout.winnerId === a.id) session.aWins += 1; else session.bWins += 1;

  if (session.bouts.length >= 3) {
    const winner = chooseMatchWinner(state, session, a, b);
    const loser = winner.id === a.id ? b : a;
    state.results.push({ ...session, winnerId: winner.id, loserId: loser.id });
    state.session = undefined;
    completePairing(state, session, winner, loser);
  } else {
    session.sceneIndex += 1;
    session.scene = pickScene(state);
  }
  if (state.mode === 'manual' && !aManual && !bManual && state.session) stepTournament(state);
  return state;
}

function lastWinningTrait(session: MatchSession, entrantId: string): Trait | undefined {
  for (let index = session.bouts.length - 1; index >= 0; index -= 1) {
    const bout = session.bouts[index];
    if (bout.winnerId === entrantId) return session.aId === entrantId ? bout.aTrait : bout.bTrait;
  }
  return undefined;
}

function chooseMatchWinner(state: GameState, session: MatchSession, a: Entrant, b: Entrant): Entrant {
  if (session.aTotalScore !== session.bTotalScore) return session.aTotalScore > session.bTotalScore ? a : b;
  if (session.aWins !== session.bWins) return session.aWins > session.bWins ? a : b;
  const draw = seededRandom(state.rngState);
  state.rngState = draw.state;
  return draw.value >= .5 ? a : b;
}

function nextPairing(state: GameState): Pairing | undefined {
  while (state.stage !== 'done') {
    if (state.stage === 'groups') {
      if (state.groupIndex < state.groupMatches.length) return state.groupMatches[state.groupIndex];
      finishGroups(state);
      continue;
    }
    if (state.queueIndex < state.queue.length) return state.queue[state.queueIndex];
    finishBracketBatch(state);
  }
  return undefined;
}

function completePairing(state: GameState, pairing: Pairing, winner: Entrant, loser: Entrant): void {
  if (pairing.stage === 'groups') {
    state.groupIndex += 1;
    return;
  }
  state.queueIndex += 1;
  if (pairing.stage === 'winners') {
    loser.losses = 1;
    state.waveWinners.push(winner);
    state.waveLosers.push(loser);
    return;
  }
  if (pairing.stage === 'losers') {
    state.waveWinners.push(winner);
    loser.losses = 2;
    return;
  }
  if (pairing.stage === 'grand-final') {
    if (winner.id === state.wChampion?.id) {
      loser.losses = 2;
      state.championId = winner.id;
      state.stage = 'done';
      state.finishReason = winner.isPlayer ? 'champion' : undefined;
    } else {
      loser.losses = 1;
      winner.losses = 1;
      state.stage = 'reset-final';
      state.queue = [{ id: 'grand-reset', stage: 'reset-final', label: '总决赛重赛', aId: state.wChampion!.id, bId: winner.id }];
      state.queueIndex = 0;
      state.waveWinners = [];
    }
    return;
  }
  if (pairing.stage === 'reset-final') {
    loser.losses = 2;
    state.championId = winner.id;
    state.stage = 'done';
    state.finishReason = winner.isPlayer ? 'champion' : undefined;
  }
}

function finishGroups(state: GameState): void {
  if (state.stage !== 'groups') return;
  const sortedByGroup = state.groups.map((group) => settleGroupTies(group, state));
  state.qualifiers = sortedByGroup.flatMap((ranking) => ranking.slice(0, 3));
  const champions = sortedByGroup.map((ranking) => ranking[0]);
  const seconds = sortedByGroup.map((ranking) => ranking[1]);
  const thirds = sortedByGroup.map((ranking) => ranking[2]);
  const sortWithinTier = (list: Entrant[]) => [...list].sort((a, b) => {
    const aStats = standingsFor(a, state.results);
    const bStats = standingsFor(b, state.results);
    return bStats.wins - aStats.wins || bStats.gameDiff - aStats.gameDiff || bStats.points - aStats.points || stableHash(`${state.seed}:${a.id}`) - stableHash(`${state.seed}:${b.id}`);
  });
  state.qualifiers = [...sortWithinTier(champions), ...sortWithinTier(seconds), ...sortWithinTier(thirds)];
  state.qualifiers.forEach((entrant, index) => { entrant.seed = index + 1; });
  state.winnersAlive = [...state.qualifiers];
  state.oneLossAlive = [];
  state.bracketRound = 0;
  scheduleWinners(state);
}

function rankGroup(group: Entrant[], results: MatchRecord[]): Entrant[] {
  const stats = new Map(group.map((entrant) => [entrant.id, { entrant, wins: 0, diff: 0, points: 0 }]));
  results.forEach((match) => {
    const winner = stats.get(match.winnerId);
    const loser = stats.get(match.loserId);
    if (!winner || !loser) return;
    winner.wins += 1;
    winner.points += totalBoutScore(match, match.winnerId);
    loser.points += totalBoutScore(match, match.loserId);
    const winBouts = match.winnerId === match.aId ? match.aWins : match.bWins;
    const loseBouts = match.loserId === match.aId ? match.aWins : match.bWins;
    winner.diff += winBouts - loseBouts;
    loser.diff += loseBouts - winBouts;
  });
  const entries = [...stats.values()];
  return entries.sort((left, right) => {
    if (left.wins !== right.wins) return right.wins - left.wins;
    const tied = entries.filter((item) => item.wins === left.wins);
    const mini = (item: typeof left) => results.filter((m) => m.winnerId === item.entrant.id && tied.some((other) => other.entrant.id === m.loserId)).length;
    return mini(right) - mini(left) || right.diff - left.diff || right.points - left.points;
  }).map((item) => item.entrant);
}

function settleGroupTies(group: Entrant[], state: GameState): Entrant[] {
  const groupName = group[0]?.group ?? '';
  let results = state.results.filter((match) => match.stage === 'groups' && match.group === groupName);
  let ranking = rankGroup(group, results);
  let index = 0;
  while (index < ranking.length) {
    let end = index + 1;
    while (end < ranking.length && compareGroupRecord(ranking[index], ranking[end], group, results) === 0) end += 1;
    const tied = ranking.slice(index, end);
    if (tied.length > 1) {
      for (let left = 0; left < tied.length; left += 1) {
        for (let right = left + 1; right < tied.length; right += 1) {
          const record = simulateMatch(state, {
            id: `playoff-${groupName}-${left}-${right}`,
            stage: 'groups',
            label: '小组加赛',
            group: groupName,
            aId: tied[left].id,
            bId: tied[right].id,
          });
          state.results.push(record);
        }
      }
      results = state.results.filter((match) => match.stage === 'groups' && match.group === groupName);
      ranking = rankGroup(group, results);
    }
    index = end;
  }
  return ranking.sort((a, b) => compareGroupRecord(a, b, group, results) || stableHash(`${state.seed}:${a.id}`) - stableHash(`${state.seed}:${b.id}`));
}

function compareGroupRecord(a: Entrant, b: Entrant, group: Entrant[], results: MatchRecord[]): number {
  const statA = standingsFor(a, results);
  const statB = standingsFor(b, results);
  if (statA.wins !== statB.wins) return statB.wins - statA.wins;
  const tied = group.filter((entrant) => standingsFor(entrant, results).wins === statA.wins);
  const miniWins = (entrant: Entrant) => results.filter((match) => match.winnerId === entrant.id && tied.some((other) => other.id === match.loserId)).length;
  return miniWins(b) - miniWins(a) || statB.gameDiff - statA.gameDiff || statB.points - statA.points;
}

function simulateMatch(state: GameState, pairing: Pairing): MatchRecord {
  const session = makeSession(state, pairing);
  const a = getEntrant(state, pairing.aId);
  const b = getEntrant(state, pairing.bId);
  while (session.bouts.length < 3) {
    const lastB = lastWinningTrait(session, b.id);
    const lastA = lastWinningTrait(session, a.id);
    const aTrait = npcChoice(a, b, session.aUsed, lastB, state, session.scene.trait);
    const bTrait = npcChoice(b, a, session.bUsed, lastA, state, session.scene.trait);
    const bout = resolveBout(state, a, b, session.scene, aTrait, bTrait, session.aUsed, session.bUsed);
    session.bouts.push(bout);
    session.aTotalScore = Math.round((session.aTotalScore + bout.aScore) * 10) / 10;
    session.bTotalScore = Math.round((session.bTotalScore + bout.bScore) * 10) / 10;
    session.aUsed.push(aTrait);
    session.bUsed.push(bTrait);
    if (bout.winnerId === a.id) session.aWins += 1; else session.bWins += 1;
    if (session.bouts.length < 3) {
      session.sceneIndex += 1;
      session.scene = pickScene(state);
    }
  }
  const winner = chooseMatchWinner(state, session, a, b);
  return { ...session, winnerId: winner.id, loserId: winner.id === a.id ? b.id : a.id };
}

function standingsFor(entrant: Entrant, results: MatchRecord[]): { wins: number; gameDiff: number; points: number; played: number } {
  const matches = results.filter((match) => match.stage === 'groups' && (match.aId === entrant.id || match.bId === entrant.id));
  let wins = 0; let gameDiff = 0; let points = 0;
  matches.forEach((match) => {
    const isA = match.aId === entrant.id;
    if (match.winnerId === entrant.id) wins += 1;
    gameDiff += isA ? match.aWins - match.bWins : match.bWins - match.aWins;
    points += totalBoutScore(match, entrant.id);
  });
  return { wins, gameDiff, points, played: matches.length };
}

function totalBoutScore(match: MatchRecord, entrantId: string): number {
  return match.bouts.reduce((sum, bout) => sum + (match.aId === entrantId ? bout.aScore : bout.bScore), 0);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function scheduleWinners(state: GameState): void {
  state.bracketRound += 1;
  if (state.winnersAlive.length <= 1) {
    state.wChampion = state.winnersAlive[0];
    scheduleLosers(state, '败者组收官');
    return;
  }
  const sorted = [...state.winnersAlive].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
  const capacity = 2 ** Math.floor(Math.log2(sorted.length - 1));
  const matchCount = sorted.length - capacity;
  const byeCount = sorted.length - matchCount * 2;
  const byes = sorted.slice(0, byeCount);
  const playing = sorted.slice(byeCount);
  const pairings: Pairing[] = [];
  for (let i = 0; i < playing.length / 2; i += 1) {
    pairings.push({
      id: `w-${state.bracketRound}-${i}`,
      stage: 'winners',
      label: `胜者组第${state.bracketRound}轮`,
      aId: playing[i].id,
      bId: playing[playing.length - 1 - i].id,
    });
  }
  state.waveWinners = [...byes];
  state.waveLosers = [];
  state.queue = pairings;
  state.queueIndex = 0;
  state.stage = 'winners';
}

function scheduleLosers(state: GameState, label: string): void {
  if (state.oneLossAlive.length <= 1) {
    if (state.oneLossAlive.length === 1 && state.wChampion) scheduleGrandFinal(state);
    else if (state.wChampion) { state.championId = state.wChampion.id; state.stage = 'done'; }
    return;
  }
  const sorted = [...state.oneLossAlive].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
  const byes = sorted.length % 2 ? [sorted[0]] : [];
  const playing = byes.length ? sorted.slice(1) : sorted;
  state.waveWinners = [...byes];
  state.queue = [];
  for (let i = 0; i < playing.length / 2; i += 1) {
    state.queue.push({ id: `l-${state.bracketRound}-${state.queue.length}`, stage: 'losers', label, aId: playing[i].id, bId: playing[playing.length - 1 - i].id });
  }
  state.queueIndex = 0;
  state.stage = 'losers';
}

function scheduleGrandFinal(state: GameState): void {
  if (!state.wChampion || state.oneLossAlive.length !== 1) return;
  state.queue = [{ id: 'grand-final', stage: 'grand-final', label: '总决赛', aId: state.wChampion.id, bId: state.oneLossAlive[0].id }];
  state.queueIndex = 0;
  state.waveWinners = [];
  state.stage = 'grand-final';
}

export function resumeAutoAfterEarlyElimination(state: GameState): GameState {
  if (state.mode !== 'auto' || state.finishReason !== 'player-eliminated' || state.championId) return state;
  state.finishReason = undefined;
  if (!state.qualifiers.some((entrant) => entrant.isPlayer)) {
    state.winnersAlive = [...state.qualifiers];
    state.oneLossAlive = [];
    state.bracketRound = 0;
    state.waveWinners = [];
    state.waveLosers = [];
    scheduleWinners(state);
    return state;
  }
  const lastRecord = state.results.at(-1);
  if (lastRecord?.stage === 'losers') state.stage = 'losers';
  return state;
}

function finishBracketBatch(state: GameState): void {
  if (state.stage === 'winners') {
    state.winnersAlive = state.waveWinners;
    state.oneLossAlive = [...state.oneLossAlive, ...state.waveLosers];
    state.waveLosers = [];
    if (state.winnersAlive.length <= 1) {
      state.wChampion = state.winnersAlive[0];
      scheduleLosers(state, '败者组晋级');
    } else {
      scheduleLosers(state, `败者组第${state.bracketRound}轮`);
      if (state.oneLossAlive.length <= 1) scheduleWinners(state);
    }
    return;
  }
  if (state.stage === 'losers') {
    state.oneLossAlive = state.waveWinners;
    state.waveWinners = [];
    if (state.wChampion && state.winnersAlive.length <= 1) {
      scheduleLosers(state, '败者组晋级');
    } else {
      scheduleWinners(state);
    }
  }
}

export function groupStandings(state: GameState, group: Entrant[]): { entrant: Entrant; wins: number; losses: number; gameDiff: number; points: number }[] {
  const ranking = rankGroup(group, state.results);
  return ranking.map((entrant) => {
    const stat = standingsFor(entrant, state.results);
    return { entrant, wins: stat.wins, losses: stat.played - stat.wins, gameDiff: stat.gameDiff, points: stat.points };
  });
}

export function nextActionLabel(state: GameState): string {
  if (state.stage === 'done') return '赛事已结束';
  if (state.session) return '选择本局属性';
  if (state.stage === 'groups') return `进行第 ${state.groupIndex + 1} / ${state.groupMatches.length} 场小组赛`;
  if (state.stage === 'winners') return '进行胜者组对局';
  if (state.stage === 'losers') return '进行败者组对局';
  if (state.stage === 'grand-final' || state.stage === 'reset-final') return '进行总决赛';
  return '继续赛程';
}

export function winningMatchRecords(state: GameState): MatchRecord[] { return state.results; }

export function scoreBreakdown(entrant: Entrant, trait: Trait, opponentTrait: Trait, sceneTrait: Trait, swing = 0): string[] {
  const profileMean = TRAITS.reduce((sum, item) => sum + entrant.profile.ratings[item.id], 0) / TRAITS.length;
  const profileSpread = Math.sqrt(TRAITS.reduce((sum, item) => sum + (entrant.profile.ratings[item.id] - profileMean) ** 2, 0) / TRAITS.length);
  const relativeStrength = profileSpread > .25 ? (entrant.profile.ratings[trait] - profileMean) / profileSpread : 0;
  const combatBase = 7 + Math.max(-1.5, Math.min(1.5, relativeStrength)) * .55;
  let base = combatBase;
  if (trait === signature(entrant)) base += .65;
  if (trait === weakness(entrant)) base -= .25;
  const counterMultiplier = TRAIT_BEATS[trait] === opponentTrait ? 1.18 : TRAIT_BEATS[opponentTrait] === trait ? .88 : 1;
  const items = [`基础 ${combatBase.toFixed(1)}（面板 ${entrant.profile.ratings[trait].toFixed(1)}）`];
  if (trait === signature(entrant)) items.push('本命 +0.65');
  if (trait === weakness(entrant)) items.push('弱点 -0.25');
  if (counterMultiplier !== 1) items.push(`${counterMultiplier > 1 ? '克制' : '被克'}倍率 ×${counterMultiplier.toFixed(2)}`);
  if (trait === sceneTrait) items.push('场景 +0.75');
  if (swing !== 0) items.push(`临场 ${swing > 0 ? '+' : ''}${swing.toFixed(1)}`);
  return items;
}

export function findCurrentPair(state: GameState): Pairing | undefined {
  if (state.session) return state.session;
  if (state.stage === 'groups') return state.groupMatches[state.groupIndex];
  return state.queue[state.queueIndex];
}

export function traitBeats(a: Trait, b: Trait): boolean { return TRAIT_BEATS[a] === b; }

export function matchupPrediction(a: Entrant, b: Entrant): { aSignature: Trait; bSignature: Trait; aWeakness: Trait; bWeakness: Trait; ratingsA: Ratings; ratingsB: Ratings; profileA: ScoreProfile; profileB: ScoreProfile } {
  return { aSignature: signature(a), bSignature: signature(b), aWeakness: weakness(a), bWeakness: weakness(b), ratingsA: a.profile.ratings, ratingsB: b.profile.ratings, profileA: a.profile, profileB: b.profile };
}
