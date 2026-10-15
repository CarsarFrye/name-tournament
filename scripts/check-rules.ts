import { NPC_NAMES } from '../src/game/data.ts';
import { advanceAutoTournament, advanceManualTournament, createTournament, type GameState } from '../src/game/engine.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function advanceToEnd(state: GameState, manual = false): GameState {
  let guard = 0;
  while (state.stage !== 'done' && guard < 3000) {
    const session = state.session;
    const isPlayerMatch = Boolean(session && (session.aId === 'player' || session.bId === 'player'));
    if (manual && isPlayerMatch) {
      const used = session!.aId === 'player' ? session!.aUsed : session!.bUsed;
      const pick = (['sound', 'recognition', 'shape', 'meaning'] as const).find((trait) => !used.includes(trait));
      assert(pick, '手动对局应该仍有未使用属性');
      advanceManualTournament(state, pick);
    } else if (manual) {
      advanceManualTournament(state);
      assert(!state.session || state.session.aId === 'player' || state.session.bId === 'player', '手动模式不得停在NPC对局');
    } else {
      advanceAutoTournament(state);
    }
    guard += 1;
  }
  assert(state.stage === 'done', `赛事未在 ${guard} 步内结束，当前阶段：${state.stage}`);
  return state;
}

assert(NPC_NAMES.length === 48, 'NPC 名单必须为48人');
assert(new Set(NPC_NAMES).size === 48, 'NPC 名单不能有重名');

for (const [index, mode] of (['auto', 'manual'] as const).entries()) {
  const game = createTournament('林见山', mode, 0x12345678 + index);
  assert(game.entrants.length === 49, '参赛者应为48名 NPC 加玩家');
  assert(game.groups.length === 8, '应抽签分成8组');
  assert(game.groups.filter((group) => group.length === 7).length === 1, '应有且仅有一组7人');
  assert(game.groups.filter((group) => group.length === 6).length === 7, '其余七组应各有6人');
  assert(game.groups.flat().length === 49, '每位参赛者应且仅应分入一组');
  for (const entrant of game.entrants) {
    for (const rating of Object.values(entrant.profile.ratings)) assert(rating >= 0 && rating <= 10, '评分必须在0到10之间');
  }
  advanceToEnd(game, mode === 'manual');
  assert(game.qualifiers.length === 24, '每组前三应有24人晋级');
  assert(game.championId, '完整赛程必须产生冠军');
  assert(game.results.filter((match) => match.stage === 'groups' && match.id.startsWith('g')).length === 126, '小组赛应进行126场循环赛');
  assert(game.results.every((match) => match.bouts.length === 3), '每场对局必须完整进行三局');
  assert(game.results.every((match) => Math.abs(match.aTotalScore - match.bouts.reduce((sum, bout) => sum + bout.aScore, 0)) < .001 && Math.abs(match.bTotalScore - match.bouts.reduce((sum, bout) => sum + bout.bScore, 0)) < .001), '对局积分必须等于三局得分之和');
  assert(game.results.every((match) => match.aTotalScore !== match.bTotalScore
    ? match.winnerId === (match.aTotalScore > match.bTotalScore ? match.aId : match.bId)
    : match.aWins !== match.bWins
      ? match.winnerId === (match.aWins > match.bWins ? match.aId : match.bId)
      : Boolean(match.winnerId)), '对局赛果必须由累计积分决定，平分时才进入次级裁决');
  assert(game.entrants.every((entrant) => entrant.losses <= 2), '淘汰赛败场数不能超过两败');
  const resumed = JSON.parse(JSON.stringify(game)) as GameState;
  assert(resumed.championId === game.championId && resumed.results.length === game.results.length, '存档序列化应保留赛果');
}

const first = createTournament('林见山', 'auto', 333);
const second = createTournament('林见山', 'auto', 444);
assert(first.groups.map((group) => group.map((entrant) => entrant.id).join(',')).join('|') !== second.groups.map((group) => group.map((entrant) => entrant.id).join(',')).join('|'), '不同种子应产生不同抽签');

const synced = createTournament('林见山', 'auto', 0xabcdef01);
advanceAutoTournament(synced);
assert(synced.session?.aId === 'player' || synced.session?.bId === 'player', '自动演赛应先到玩家自己的对局');
assert(synced.session?.bouts.length === 0 && synced.results.length === 0, 'NPC 结果结算不应占用玩家首场对局的逐局展示');
let syncGuard = 0;
while (synced.stage !== 'done' && syncGuard < 1000) {
  const wasPlayerMatch = Boolean(synced.session && (synced.session.aId === 'player' || synced.session.bId === 'player'));
  const oldResultCount = synced.results.length;
  advanceAutoTournament(synced);
  assert(!synced.session || synced.session.aId === 'player' || synced.session.bId === 'player', '自动演赛不得把 NPC 具体对局展示为当前对局');
  if (wasPlayerMatch && synced.results.length > oldResultCount) {
    const last = synced.results.at(-1)!;
    assert(last.aId === 'player' || last.bId === 'player', '玩家对局结束后应先显示其赛果，再结算后续 NPC 对局');
  }
  syncGuard += 1;
}
assert(synced.stage === 'done' && synced.championId, '玩家淘汰后也应继续推演并产生全赛事冠军');

const manualStart = advanceManualTournament(createTournament('林见山', 'manual', 1));
assert(manualStart.session?.aId === 'player' || manualStart.session?.bId === 'player', '手动模式开赛后应自动结算至玩家首场对局');
assert(manualStart.results.length > 0 && manualStart.results.every((match) => match.aId !== 'player' && match.bId !== 'player'), '手动模式应自动结算玩家无关的NPC对局');

console.log('规则检查通过：每场三局积分制、手动模式自动跳过NPC对局、自动演赛玩家对局优先，完整赛程均正常。');
