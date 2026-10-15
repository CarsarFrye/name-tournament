import { useEffect, useMemo, useState } from 'react';
import { NPC_NAMES, TRAITS, type Trait } from './game/data';
import {
  advanceAutoTournament, advanceManualTournament, createTournament, currentSession, findCurrentPair, groupStandings, nextActionLabel, resumeAutoAfterEarlyElimination,
  playerOf, signature, stepTournament, weakness,
  type Entrant, type GameState, type Mode,
} from './game/engine';
import { scoreName } from './game/scoring';
import BracketTree from './components/BracketTree';

const SAVE_KEY = 'name-tournament-save-v1';
const SETUP_KEY = 'name-tournament-setup-v1';

function readSavedGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== 1 || parsed.entrants?.length !== 49) return null;
    resumeAutoAfterEarlyElimination(parsed);
    if (parsed.mode === 'manual' && (!parsed.session || (parsed.session.aId !== 'player' && parsed.session.bId !== 'player'))) {
      return advanceManualTournament(parsed);
    }
    if (parsed.mode === 'auto' && parsed.session && parsed.session.aId !== 'player' && parsed.session.bId !== 'player') {
      return advanceAutoTournament(parsed);
    }
    return parsed;
  } catch { return null; }
}

function freshSeed(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0];
}

function App() {
  const [game, setGame] = useState<GameState | null>(() => readSavedGame());
  const [name, setName] = useState(() => localStorage.getItem(SETUP_KEY) ?? '');
  const [mode, setMode] = useState<Mode>('manual');
  const [autoRunning, setAutoRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try { localStorage.setItem(SETUP_KEY, name); } catch { /* storage may be disabled */ }
  }, [name]);

  useEffect(() => {
    if (!game) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch { /* storage may be full */ }
  }, [game]);

  useEffect(() => {
    if (!autoRunning) return;
    const timer = window.setInterval(() => {
      setGame((previous) => {
        if (!previous || previous.stage === 'done') {
          setAutoRunning(false);
          return previous;
        }
        return previous.mode === 'auto'
          ? advanceAutoTournament(structuredClone(previous))
          : stepTournament(structuredClone(previous));
      });
    }, 560);
    return () => window.clearInterval(timer);
  }, [autoRunning]);

  const preview = useMemo(() => name.trim() ? scoreName(name.trim()) : null, [name]);

  function startNewTournament() {
    const clean = name.trim();
    if (!/^[\u3400-\u9fff]{1,8}$/.test(clean)) {
      setError('请输入 1–8 个中文汉字。');
      return;
    }
    setError('');
    setAutoRunning(false);
    const nextGame = createTournament(clean, mode, freshSeed());
    setGame(mode === 'manual' ? advanceManualTournament(nextGame) : nextGame);
  }

  function advance(pick?: Trait) {
    setGame((previous) => previous
      ? previous.mode === 'auto'
        ? advanceAutoTournament(structuredClone(previous))
        : advanceManualTournament(structuredClone(previous), pick)
      : previous);
  }

  function resetTournament() {
    if (!game) return;
    if (window.confirm('结束当前赛事并返回报名页？当前赛程会从本浏览器存档中清除。')) {
      setAutoRunning(false);
      setGame(null);
      try { localStorage.removeItem(SAVE_KEY); } catch { /* storage may be disabled */ }
    }
  }

  if (!game) {
    return <Registration
      name={name}
      mode={mode}
      preview={preview}
      error={error}
      onName={setName}
      onMode={setMode}
      onStart={startNewTournament}
    />;
  }

  return <TournamentView
    game={game}
    autoRunning={autoRunning}
    onAdvance={advance}
    onAuto={() => setAutoRunning((running) => !running)}
    onReset={resetTournament}
  />;
}

function Brand() {
  return <div className="brand-row">
    <div className="brand-mark">名</div>
    <div>
      <div className="brand-title">四十八个名字</div>
      <div className="brand-subtitle">以名会友 · 以赛论名</div>
    </div>
  </div>;
}

function Registration(props: {
  name: string; mode: Mode; preview: ReturnType<typeof scoreName> | null; error: string;
  onName: (name: string) => void; onMode: (mode: Mode) => void; onStart: () => void;
}) {
  return <main className="landing-shell">
    <header className="topbar"><Brand /><span className="topbar-note">好名字，是一生的礼物</span></header>
    <section className="hero-card">
      <div className="hero-ornament ornament-left">山</div>
      <div className="hero-content">
        <div className="eyebrow">48 位名字 NPC · 49 人随机抽签</div>
        <h1>名字，也能打一场<br /><em>精彩的比赛</em></h1>
        <p>四种属性，环形克制。让名字走上赛场，看看谁能一路登顶。</p>
        <div className="hero-stats">
          <div><strong>48</strong><span>名字 NPC</span></div>
          <div><strong>8</strong><span>随机小组</span></div>
          <div><strong>24</strong><span>晋级淘汰赛</span></div>
        </div>
      </div>
      <div className="hero-ornament ornament-right">名</div>
    </section>

    <section className="signup-grid">
      <div className="paper-card signup-card">
        <div className="section-kicker">01 / 加入本轮赛事</div>
        <h2>写下你的参赛名字</h2>
        <p className="muted">系统会依据读音、笔画、释义和名字内部组合生成各有强弱的四维面板。当前赛程只保存在这台设备的浏览器里。</p>
        <label className="field-label" htmlFor="player-name">参赛名字</label>
        <div className="name-input-wrap">
          <input id="player-name" value={props.name} onChange={(event) => props.onName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && props.onStart()} placeholder="例如：林见山" maxLength={8} autoComplete="off" />
          <span>{Array.from(props.name.trim()).length}/8</span>
        </div>
        {props.error && <div className="error-text">{props.error}</div>}
        {props.preview && <ScorePreview profile={props.preview} />}
        <div className="field-label mode-label">选择比赛方式</div>
        <div className="mode-options">
          <button className={`mode-option ${props.mode === 'manual' ? 'selected' : ''}`} onClick={() => props.onMode('manual')}>
            <span className="mode-icon">♧</span><span><b>手动出牌</b><small>每局亲自选择属性</small></span><span className="radio-dot" />
          </button>
          <button className={`mode-option ${props.mode === 'auto' ? 'selected' : ''}`} onClick={() => props.onMode('auto')}>
            <span className="mode-icon">⟳</span><span><b>自动演赛</b><small>系统逐场展示完整赛程</small></span><span className="radio-dot" />
          </button>
        </div>
        <button className="primary-button start-button" disabled={!props.name.trim()} onClick={props.onStart}>抽签开赛 <span>→</span></button>
        <div className="privacy-note"><span>◇</span> 本地估分 · 无需登录 · 不上传名字</div>
      </div>
      <div className="paper-card rules-card">
        <div className="section-kicker">02 / 赛事规则</div>
        <h2>以赛论名，环环相扣</h2>
        <div className="ring-diagram">
          <div className="ring-center">环形<br />克制</div>
          <div className="ring-node node-sound"><i>♫</i><b>音韵节奏</b><small>顺口好听</small></div>
          <div className="ring-node node-recognition"><i>✦</i><b>辨识传播</b><small>记忆深刻</small></div>
          <div className="ring-node node-shape"><i>▧</i><b>字形结构</b><small>协调易写</small></div>
          <div className="ring-node node-meaning"><i>❋</i><b>意涵气质</b><small>寓意悠长</small></div>
          <span className="ring-arrow arrow-one">↘</span><span className="ring-arrow arrow-two">↙</span><span className="ring-arrow arrow-three">↖</span><span className="ring-arrow arrow-four">↗</span>
        </div>
        <div className="rule-steps">
          <div><span>01</span><p><b>随机分组</b><small>49 人抽签分为 8 组，每组前三晋级。</small></p></div>
          <div><span>02</span><p><b>三局积分制</b><small>三局打满后累计每局得分，积分高者晋级。</small></p></div>
          <div><span>03</span><p><b>双败淘汰</b><small>败者还有机会，累计两败才会离场。</small></p></div>
        </div>
      </div>
    </section>
    <footer className="landing-footer"><span>首轮名单已就位 · 共 {NPC_NAMES.length} 位 NPC</span><span>每次开赛，重新抽签</span></footer>
  </main>;
}

function ScorePreview({ profile }: { profile: ReturnType<typeof scoreName> }) {
  const maxTrait = TRAITS.reduce((best, trait) => profile.ratings[trait.id] > profile.ratings[best.id] ? trait : best, TRAITS[0]);
  const minTrait = TRAITS.reduce((weak, trait) => profile.ratings[trait.id] < profile.ratings[weak.id] ? trait : weak, TRAITS[0]);
  return <div className="score-preview">
    {TRAITS.map((trait) => <div className="preview-line" key={trait.id}>
      <span>{trait.name}</span><div className="mini-bar"><i style={{ width: `${profile.ratings[trait.id] * 10}%`, background: trait.color }} /></div><b>{profile.ratings[trait.id].toFixed(1)}</b>
    </div>)}
    <div className="signature-line"><span>本命</span><b style={{ color: maxTrait.color }}>{maxTrait.name}</b><span className="weak-label">弱点</span><b style={{ color: minTrait.color }}>{minTrait.name}</b></div>
    {profile.unknownChars.length > 0 && <small className="unknown-note">{profile.unknownChars.join('、')} 暂无 Unihan 普通话读音，音韵按中性规则估算。</small>}
  </div>;
}

function TournamentView(props: { game: GameState; autoRunning: boolean; onAdvance: (trait?: Trait) => void; onAuto: () => void; onReset: () => void }) {
  const { game } = props;
  const session = currentSession(game);
  const pair = findCurrentPair(game);
  const a = pair ? game.entrants.find((entrant) => entrant.id === pair.aId) : undefined;
  const b = pair ? game.entrants.find((entrant) => entrant.id === pair.bId) : undefined;
  const player = playerOf(game);
  const playerSide = session ? session.aId === player.id ? 'a' : session.bId === player.id ? 'b' : undefined : undefined;
  const opponent = session && playerSide === 'a' ? b : session && playerSide === 'b' ? a : undefined;
  const used = playerSide === 'a' ? session?.aUsed ?? [] : session?.bUsed ?? [];
  const mustPick = Boolean(session && game.mode === 'manual' && playerSide);
  const playerScore = player.profile.ratings;
  const aTotalScore = session ? session.aTotalScore ?? sumBoutPoints(session.bouts, 'a') : 0;
  const bTotalScore = session ? session.bTotalScore ?? sumBoutPoints(session.bouts, 'b') : 0;
  const groupProgress = `${Math.min(game.groupIndex, game.groupMatches.length)} / ${game.groupMatches.length}`;
  const history = game.mode === 'auto'
    ? game.results.map((match, index) => ({ match, index }))
      .filter(({ match }, index, all) => match.aId === player.id || match.bId === player.id || index >= all.length - 7)
      .reverse()
    : [...game.results].reverse().slice(0, 7).map((match) => ({ match }));
  const stageTitle = game.stage === 'groups' ? '小组循环赛' : game.stage === 'winners' ? '胜者组' : game.stage === 'losers' ? '败者组' : game.stage === 'grand-final' || game.stage === 'reset-final' ? '总决赛' : '赛事结果';
  return <main className="game-shell">
    <header className="topbar game-topbar"><Brand /><div className="game-head-meta"><span className={`mode-pill ${game.mode}`}>{game.mode === 'manual' ? '手动出牌' : '自动演赛'}</span><span>随机种子 {game.seed.toString(16).slice(-6).toUpperCase()}</span><button className="quiet-button" onClick={props.onReset}>退出赛事</button></div></header>
    <div className="game-heading"><div><div className="section-kicker">本轮赛事 · 49 位参赛者</div><h1>{game.stage === 'done' ? '本轮赛事，尘埃落定' : stageTitle}</h1><p>{game.stage === 'groups' ? `小组赛进度 ${groupProgress} · 每组前三名晋级` : game.stage === 'done' ? '以名会友，以赛论名。' : `${game.results.filter((match) => match.stage !== 'groups').length} 场淘汰赛已完成`}</p></div>
      <div className="heading-tools">{game.mode === 'auto' && game.stage !== 'done' && <><button className={`play-button ${props.autoRunning ? 'playing' : ''}`} onClick={props.onAuto}>{props.autoRunning ? 'Ⅱ 暂停演赛' : '▶ 自动播放'}</button><button className="outline-button" onClick={() => props.onAdvance()}>{session ? '推进一局' : '进入我的下一场'} <span>→</span></button></>}</div>
    </div>

    {game.stage === 'done' && <section className="champion-banner"><div className="laurel">♕</div><div><span>本届冠军</span><strong>{game.entrants.find((entrant) => entrant.id === game.championId)?.name ?? '赛事完成'}</strong><small>{game.finishReason === 'champion' ? '你赢下了本届双败淘汰赛。' : ''}</small></div><button className="primary-button" onClick={props.onReset}>再开一届</button></section>}

    <section className="arena-grid">
      <div className="paper-card arena-card">
        <div className="arena-card-head"><div><div className="section-kicker">{pair ? pair.label : '赛事结算'}</div><h2>{session ? '正在进行的对决' : game.stage === 'done' ? '冠军已经诞生' : '准备下一场'}</h2></div>{session && <span className="live-badge"><i /> LIVE</span>}</div>
        {session && a && b ? <>
          <div className="duel-scoreboard">
            <Fighter entrant={a} wins={session.aWins} align="left" />
            <div className="versus"><span>{aTotalScore.toFixed(1)} : {bTotalScore.toFixed(1)}</span><small>累计积分</small><em>小局 {session.aWins}:{session.bWins}</em></div>
            <Fighter entrant={b} wins={session.bWins} align="right" />
          </div>
          <div className="scene-card"><div className="scene-icon">{session.scene.icon}</div><div><span>克制 ×1.18 · 被克 ×0.88 · 场景 +0.75 · 临场 ±0.6</span><b>{session.scene.name}</b><small>{session.scene.description} 加成属性：{TRAITS.find((trait) => trait.id === session.scene.trait)?.name}</small></div></div>
          {opponent && <TraitPanel entrant={opponent} title="对手属性面板" />}
          {mustPick ? <div className="choose-area"><div className="choose-heading"><b>轮到你出牌</b><span>选择一个未用过的属性</span></div><div className="trait-choice-grid">
            {TRAITS.map((trait) => <button key={trait.id} className={`trait-choice ${used.includes(trait.id) ? 'used' : ''}`} style={{ '--trait-color': trait.color } as React.CSSProperties} disabled={used.includes(trait.id)} onClick={() => props.onAdvance(trait.id)}>
              <i>{trait.icon}</i><span><b>{trait.name}</b><small>基础 {playerScore[trait.id].toFixed(1)} 分 {trait.id === session.scene.trait ? ' · 场景加成' : ''}</small></span>{used.includes(trait.id) ? <em>已出</em> : <span className="card-arrow">↗</span>}
            </button>)}
          </div><div className="strategy-hint">本命属性 <b>{TRAITS.find((trait) => trait.id === signature(player))?.name}</b>　·　弱点属性 <b>{TRAITS.find((trait) => trait.id === weakness(player))?.name}</b></div></div> : <div className="round-progress"><span>本场局数</span><div>{[0, 1, 2].map((index) => <i key={index} className={index < session.bouts.length ? 'filled' : ''} />)}</div><b>系统正在推演本局出牌</b></div>}
          {session.bouts.length > 0 && <div className="bout-log"><b>已出牌记录 · 每局得分计入总积分</b>{session.bouts.map((bout, index) => {
            const playerTrait = playerSide === 'a' ? bout.aTrait : bout.bTrait;
            const opponentTrait = playerSide === 'a' ? bout.bTrait : bout.aTrait;
            const playerPoints = playerSide === 'a' ? bout.aScore : bout.bScore;
            const opponentPoints = playerSide === 'a' ? bout.bScore : bout.aScore;
            const playerMeta = TRAITS.find((trait) => trait.id === playerTrait)!;
            const opponentMeta = TRAITS.find((trait) => trait.id === opponentTrait)!;
            return <div className="bout-row" key={`${bout.scene}-${index}`}>
              <div className="bout-round-heading"><b>第 {index + 1} 局</b><span>{bout.scene}</span><strong>{playerPoints.toFixed(1)} : {opponentPoints.toFixed(1)} 积分</strong></div>
              <div className="bout-card-pair">
                <div className={`played-trait-card ${playerPoints >= opponentPoints ? 'ahead' : ''}`}><small>你出牌</small><b style={{ color: playerMeta.color }}>{playerMeta.icon} {playerMeta.name}</b><span>得分 {playerPoints.toFixed(1)}</span></div>
                <i>VS</i>
                <div className={`played-trait-card opponent ${opponentPoints >= playerPoints ? 'ahead' : ''}`}><small>对手出牌</small><b style={{ color: opponentMeta.color }}>{opponentMeta.icon} {opponentMeta.name}</b><span>得分 {opponentPoints.toFixed(1)}</span></div>
              </div>
              {bout.note && <small className="bout-note">{bout.note}</small>}
            </div>;
          })}</div>}
        </> : <div className="no-match"><div className="no-match-icon">✧</div><h3>{game.stage === 'done' ? '赛事赛果' : game.mode === 'auto' ? '正在整理其他对局结果' : '下一场即将开赛'}</h3><p>{game.stage === 'done'
          ? '本轮赛事记录已保存在当前浏览器。'
          : game.mode === 'auto' ? '其他对局只结算最终结果，随后进入你的下一场对战。' : nextActionLabel(game)}</p><button className="primary-button" disabled={game.stage === 'done'} onClick={() => props.onAdvance()}>{game.stage === 'done' ? '赛程结束' : game.mode === 'auto' ? '结算赛果并进入我的下一场 →' : '开始下一场 →'}</button></div>}
      </div>

      <aside className="paper-card player-card"><div className="section-kicker">你的名字档案</div><div className="player-name-row"><div className="avatar">{Array.from(player.name)[0]}</div><div><h2>{player.name}</h2><span>{player.group ? `${player.group}组` : '参赛者'} · {player.losses} 败{game.stage === 'done' && player.id !== game.championId ? ` · ${player.losses >= 2 ? '已淘汰' : '未晋级'}` : ''}</span></div></div>
        <div className="signature-box"><div><small>本命属性</small><b style={{ color: TRAITS.find((trait) => trait.id === signature(player))?.color }}>{TRAITS.find((trait) => trait.id === signature(player))?.name}</b></div><div><small>弱点属性</small><b className="weak-value">{TRAITS.find((trait) => trait.id === weakness(player))?.name}</b></div></div>
        <div className="rating-list">{TRAITS.map((trait) => <div className="rating-row" key={trait.id}><span>{trait.icon} {trait.name}</span><div className="rating-track"><i style={{ width: `${player.profile.ratings[trait.id] * 10}%`, background: trait.color }} /></div><b>{player.profile.ratings[trait.id].toFixed(1)}</b></div>)}</div>
        {player.profile.unknownChars.length > 0 && <div className="small-warning">暂无 Unihan 普通话读音：{player.profile.unknownChars.join('、')}；音韵按中性规则估算。</div>}
        <details className="scoring-details"><summary>本地评分依据</summary><p>四维分数随名字特征变化，不会强行拉齐。对局基础分按出战属性相对本人四维均值和分布折算并封顶，因此强项有优势，但整体高分不会直接压制对手。</p>{TRAITS.map((trait) => <p key={trait.id}><b>{trait.name}：</b>{player.profile.reasons[trait.id]}</p>)}</details>
      </aside>
    </section>

    {game.qualifiers.length === 24 && <BracketTree game={game} />}

    <section className="lower-grid">
      <div className="paper-card groups-card"><div className="lower-heading"><div><div className="section-kicker">签运与积分榜</div><h2>八组赛况</h2></div><span className="muted">随机抽签 · 每组前三晋级</span></div><div className="group-grid">
        {game.groups.map((group, index) => {
          const standings = groupStandings(game, group);
          const playerInGroup = group.some((entrant) => entrant.isPlayer);
          return <div className={`group-tile ${playerInGroup ? 'player-group' : ''}`} key={index}><div className="group-tile-title"><b>{String.fromCharCode(65 + index)} 组</b><span>{group.length} 人</span></div>{standings.map((row, rank) => <div className={`standing-row ${row.entrant.isPlayer ? 'is-player' : ''} ${rank < 3 ? 'qualifying' : ''}`} key={row.entrant.id}><span className="rank-num">{rank + 1}</span><span className="standing-name">{row.entrant.name}{row.entrant.isPlayer && <i>你</i>}</span><b>{row.wins}胜</b><small>{rank < 3 ? '晋级区' : '待战'}</small></div>)}</div>;
        })}
      </div></div>
      <div className="paper-card history-card"><div className="lower-heading"><div><div className="section-kicker">{game.mode === 'auto' ? '其他对局仅显示终场结果' : '最近战报'}</div><h2>赛场纪事</h2></div><span className="record-count">{game.results.length} 场已结束</span></div>
        {history.length ? <div className="history-list">{history.map(({ match }) => {
          const hasPlayer = match.aId === player.id || match.bId === player.id;
          return <div className={`history-item ${game.mode === 'auto' && hasPlayer ? 'player-history-item' : ''}`} key={match.id}><div className="history-tag">{hasPlayer ? '你的对局 · ' : ''}{match.label}</div><div className="history-versus"><span className={match.winnerId === match.aId ? 'record-winner' : ''}>{game.entrants.find((entrant) => entrant.id === match.aId)?.name}</span><b>{(match.aTotalScore ?? sumBoutPoints(match.bouts, 'a')).toFixed(1)}:{(match.bTotalScore ?? sumBoutPoints(match.bouts, 'b')).toFixed(1)}</b><span className={match.winnerId === match.bId ? 'record-winner' : ''}>{game.entrants.find((entrant) => entrant.id === match.bId)?.name}</span></div><div className="winner-note">总积分 · 小局 {match.aWins}:{match.bWins} · 胜者 {game.entrants.find((entrant) => entrant.id === match.winnerId)?.name}</div>{hasPlayer && <div className="player-bout-recap">{match.bouts.map((bout, index) => <small key={`${match.id}-${index}`}>第{index + 1}局 {bout.scene} · {TRAITS.find((trait) => trait.id === bout.aTrait)?.short} {bout.aScore.toFixed(1)}:{bout.bScore.toFixed(1)} {TRAITS.find((trait) => trait.id === bout.bTrait)?.short}</small>)}</div>}</div>;
        })}</div> : <div className="empty-history">首场对决尚未开始</div>}
        {game.mode === 'auto' && game.stage !== 'done' && <button className="autoplay-wide" onClick={props.onAuto}>{props.autoRunning ? '暂停自动演赛 Ⅱ' : '连续播放 ▶'}</button>}
      </div>
    </section>
    <footer className="game-footer"><span>四十八个名字 · 重新开赛</span><span>赛程自动保存在当前浏览器</span></footer>
  </main>;
}

function Fighter({ entrant, wins, align }: { entrant: Entrant; wins: number; align: 'left' | 'right' }) {
  return <div className={`fighter ${align} ${entrant.isPlayer ? 'player-fighter' : ''}`}><div className="fighter-avatar">{Array.from(entrant.name)[0]}</div><strong>{entrant.name}</strong><span>{entrant.isPlayer ? '玩家' : `${entrant.group ?? '参赛者'}组 NPC`}</span><div className="round-pips" title={`单局领先 ${wins} 次`}>{[0, 1, 2].map((index) => <i className={index < wins ? 'won' : ''} key={index} />)}</div></div>;
}

function TraitPanel({ entrant, title }: { entrant: Entrant; title: string }) {
  const best = signature(entrant);
  const weak = weakness(entrant);
  return <div className="opponent-panel"><div className="opponent-panel-heading"><b>{title} · {entrant.name}</b><span>本命 {TRAITS.find((trait) => trait.id === best)?.name}　弱点 {TRAITS.find((trait) => trait.id === weak)?.name}</span></div><div className="opponent-traits">{TRAITS.map((trait) => <div className="opponent-trait-row" key={trait.id}>
    <span>{trait.icon} {trait.name}</span><div className="opponent-rating-track"><i style={{ width: `${entrant.profile.ratings[trait.id] * 10}%`, background: trait.color }} /></div><b>{entrant.profile.ratings[trait.id].toFixed(1)}</b>
  </div>)}</div></div>;
}

function sumBoutPoints(bouts: { aScore: number; bScore: number }[], side: 'a' | 'b'): number {
  return bouts.reduce((sum, bout) => sum + bout[`${side}Score`], 0);
}

export default App;
