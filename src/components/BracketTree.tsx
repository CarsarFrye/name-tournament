import type { GameState, MatchRecord, Pairing } from '../game/engine';

type BracketNode = Pairing & {
  winnerId?: string;
  aWins?: number;
  bWins?: number;
  aTotalScore?: number;
  bTotalScore?: number;
  active?: boolean;
};

type Column = { key: string; title: string; lane: 'winners' | 'losers' | 'final' | 'reset' | 'champion'; round?: number; slots: number; source?: string };

const columns: Column[] = [
  { key: 'w-1', title: 'W1 · 第1轮', lane: 'winners', round: 1, slots: 8 },
  { key: 'w-2', title: 'W2 · 第2轮', lane: 'winners', round: 2, slots: 8 },
  { key: 'w-3', title: 'W3 · 第3轮', lane: 'winners', round: 3, slots: 4 },
  { key: 'w-4', title: 'W4 · 第4轮', lane: 'winners', round: 4, slots: 2 },
  { key: 'w-5', title: 'W5 · 胜者组决赛', lane: 'winners', round: 5, slots: 1 },
  { key: 'l-1', title: 'L1 · 第1轮', lane: 'losers', round: 1, slots: 4, source: 'W1 败者' },
  { key: 'l-2', title: 'L2 · 第2轮', lane: 'losers', round: 2, slots: 6, source: 'W2 败者 + L1 胜者' },
  { key: 'l-3', title: 'L3 · 第3轮', lane: 'losers', round: 3, slots: 5, source: 'W3 败者 + L2 胜者' },
  { key: 'l-4', title: 'L4 · 第4轮', lane: 'losers', round: 4, slots: 3, source: 'W4 败者 + L3 胜者' },
  { key: 'l-5', title: 'L5 · 败者组决赛', lane: 'losers', round: 5, slots: 4, source: 'W5 败者 + L4 胜者' },
  { key: 'grand-final', title: '总决赛', lane: 'final', slots: 1, source: 'W5 胜者 vs L5 胜者' },
  { key: 'reset-final', title: '总决赛重赛', lane: 'reset', slots: 1, source: '胜者组冠军首战失利时' },
  { key: 'champion', title: '赛事冠军', lane: 'champion', slots: 1 },
];

const CARD_WIDTH = 156;
const CARD_HEIGHT = 54;
const COLUMN_PITCH = 188;
const LEFT = 18;
const CANVAS_WIDTH = LEFT * 2 + 7 * COLUMN_PITCH;
const CANVAS_HEIGHT = 1050;
const WINNERS_TOP = 94;
const WINNERS_HEIGHT = 440;
const LOSERS_TOP = 646;
const LOSERS_HEIGHT = 330;

function columnFor(node: Pairing): string | undefined {
  if (node.stage === 'grand-final') return 'grand-final';
  if (node.stage === 'reset-final') return 'reset-final';
  const match = node.id.match(/^([wl])-(\d+)-(\d+)$/);
  return match ? `${match[1]}-${match[2]}` : undefined;
}

function slotIndex(node: Pairing): number {
  return Number(node.id.match(/-(\d+)$/)?.[1] ?? 0);
}

function yFor(column: Column, index: number, count: number): number {
  if (column.lane === 'winners') return WINNERS_TOP + ((index + .5) / count) * WINNERS_HEIGHT - CARD_HEIGHT / 2;
  if (column.lane === 'losers') return LOSERS_TOP + ((index + .5) / count) * LOSERS_HEIGHT - CARD_HEIGHT / 2;
  if (column.lane === 'final') return 478;
  if (column.lane === 'reset') return 570;
  return 478;
}

function xFor(column: Column): number {
  const round = column.round ?? (column.lane === 'final' ? 6 : 7);
  return LEFT + (round - 1) * COLUMN_PITCH;
}

function laneOf(node: Pairing): 'winners' | 'losers' | undefined {
  if (node.stage === 'winners') return 'winners';
  if (node.stage === 'losers') return 'losers';
  return undefined;
}

function recordNode(record: MatchRecord): BracketNode {
  return {
    ...record,
    aTotalScore: record.aTotalScore ?? record.bouts.reduce((sum, bout) => sum + bout.aScore, 0),
    bTotalScore: record.bTotalScore ?? record.bouts.reduce((sum, bout) => sum + bout.bScore, 0),
    active: false,
  };
}

export default function BracketTree({ game }: { game: GameState }) {
  const resultNodes = game.results.filter((record) => record.stage !== 'groups').map(recordNode);
  const queueNodes: BracketNode[] = game.queue.slice(game.queueIndex).map((pairing) => ({ ...pairing }));
  const byId = new Map<string, BracketNode>();
  [...resultNodes, ...queueNodes].forEach((node) => byId.set(node.id, node));
  if (game.session) byId.set(game.session.id, { ...game.session, active: true });
  const nodes = [...byId.values()];
  const entrants = new Map(game.entrants.map((entrant) => [entrant.id, entrant]));
  const nodesByColumn = new Map(columns.map((column) => [column.key, nodes
    .filter((node) => columnFor(node) === column.key)
    .sort((a, b) => slotIndex(a) - slotIndex(b))]));

  const chronological = [...resultNodes, ...queueNodes.filter((node) => !resultNodes.some((record) => record.id === node.id))];
  const previousMatch = new Map<string, BracketNode>();
  const edges: { from: BracketNode; to: BracketNode }[] = [];
  chronological.forEach((node) => {
    for (const entrantId of [node.aId, node.bId]) {
      const previous = previousMatch.get(entrantId);
      if (previous && laneOf(previous) === laneOf(node) && columnFor(previous) !== columnFor(node)) {
        edges.push({ from: previous, to: node });
      }
      previousMatch.set(entrantId, node);
    }
  });

  const location = new Map<string, { x: number; y: number; column: Column }>();
  columns.forEach((column) => {
    const placed = nodesByColumn.get(column.key) ?? [];
    const count = Math.max(column.slots, placed.length);
    placed.forEach((node) => location.set(node.id, {
      x: xFor(column),
      y: yFor(column, slotIndex(node), count),
      column,
    }));
  });

  const champion = game.entrants.find((entrant) => entrant.id === game.championId);
  const liveId = game.session?.id;

  return <section className="paper-card bracket-card">
    <div className="lower-heading bracket-heading">
      <div><div className="section-kicker">24强 · 双败淘汰</div><h2>晋级赛程树</h2></div>
      <span className="muted">胜者组一败转入败者组 · 两败出局 · 横向滚动查看</span>
    </div>
    <div className="bracket-legend"><span><i className="legend-win" />胜者组晋级</span><span><i className="legend-loss" />败者组晋级</span><span><i className="legend-live" />进行中</span></div>
    <div className="bracket-viewport">
      <div className="bracket-canvas" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
        <div className="bracket-lane-label winners-lane-label">胜者组 <small>只显示胜者组内晋级路径；首败转入 L1</small></div>
        <div className="bracket-lane-label losers-lane-label">败者组 <small>只显示败者组内晋级路径；再败出局</small></div>
        <svg className="bracket-link-layer" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} aria-hidden="true">
          <rect x="8" y="42" width={CANVAS_WIDTH - 16} height="510" rx="16" className="winners-lane-bg" />
          <rect x="8" y="588" width={CANVAS_WIDTH - 16} height="410" rx="16" className="losers-lane-bg" />
          {edges.map((edge, index) => {
            const from = location.get(edge.from.id);
            const to = location.get(edge.to.id);
            if (!from || !to) return null;
            const x1 = from.x + CARD_WIDTH;
            const x2 = to.x;
            const y1 = from.y + CARD_HEIGHT / 2;
            const y2 = to.y + CARD_HEIGHT / 2;
            const middle = x1 + Math.max(10, (x2 - x1) / 2);
            return <path key={`${edge.from.id}-${edge.to.id}-${index}`} d={`M ${x1} ${y1} H ${middle} V ${y2} H ${x2}`} className={laneOf(edge.from) === 'winners' ? 'bracket-edge edge-win' : 'bracket-edge edge-losers'} />;
          })}
        </svg>
        {columns.map((column) => {
          const placed = nodesByColumn.get(column.key) ?? [];
          const count = Math.max(column.slots, placed.length);
          const x = xFor(column);
          const headingTop = column.lane === 'winners' ? 48 : column.lane === 'losers' ? 594 : 426;
          const placeholders = Array.from({ length: Math.max(0, column.slots - placed.length) }, (_, index) => index + placed.length);
          return <div className="bracket-column" key={column.key}>
            <div className={`bracket-column-heading ${column.lane}`} style={{ left: x, top: headingTop }}><h3>{column.title}</h3>{column.source && <small>{column.source}</small>}</div>
            {placed.map((node) => {
              const y = yFor(column, slotIndex(node), count);
              const entrantA = entrants.get(node.aId);
              const entrantB = entrants.get(node.bId);
              const winner = node.winnerId ? entrants.get(node.winnerId) : undefined;
              return <div className={`bracket-match ${node.winnerId ? 'is-complete' : ''} ${node.active || node.id === liveId ? 'is-live' : ''} ${entrantA?.isPlayer || entrantB?.isPlayer ? 'has-player' : ''}`} key={node.id} style={{ left: x, top: y }}>
                <div className="bracket-match-round">{node.label}</div>
                <div className={`bracket-entrant ${node.winnerId === node.aId ? 'is-winner' : ''}`}><span>{entrantA?.name ?? '待定'}</span><b>{node.aTotalScore === undefined ? '—' : node.aTotalScore.toFixed(1)}</b></div>
                <div className={`bracket-entrant ${node.winnerId === node.bId ? 'is-winner' : ''}`}><span>{entrantB?.name ?? '待定'}</span><b>{node.bTotalScore === undefined ? '—' : node.bTotalScore.toFixed(1)}</b></div>
                <div className="bracket-match-status">{node.active || node.id === liveId ? '● 正在进行' : winner ? `胜者：${winner.name}` : '待开赛'}</div>
              </div>;
            })}
            {column.lane !== 'champion' && placeholders.map((slot) => {
              const y = yFor(column, slot, count);
              return <div className="bracket-match bracket-placeholder" key={`${column.key}-slot-${slot}`} style={{ left: x, top: y }}>
                <div className="bracket-match-round">待定签位</div>
                <div className="bracket-placeholder-versus">待定 <span>VS</span> 待定</div>
                <div className="bracket-match-status">尚未生成对阵</div>
              </div>;
            })}
            {column.lane === 'champion' && <div className={`bracket-champion ${champion ? 'is-crowned' : ''}`} style={{ left: x, top: yFor(column, 0, 1) }}>
              <span>♕</span><small>赛事冠军</small><strong>{champion?.name ?? '待诞生'}</strong>
            </div>}
          </div>;
        })}
      </div>
    </div>
    <div className="bracket-footnote">实线赛果按实际对战更新；虚线签位表示后续轮次。{game.stage === 'done' && champion ? ` 本届冠军：${champion.name}。` : ' 总决赛若胜者组冠军首战落败，将进行重赛。'}</div>
  </section>;
}
