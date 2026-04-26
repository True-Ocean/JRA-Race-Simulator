import { createRng }      from './src/engine/rng.js';
import { calcAllParams }  from './src/engine/params.js';
import { buildPhases, calcStaminaCons, applyCornerLoss, laneIndex, getStylePaceMultiplier }
                          from './src/engine/phase.js';
import { detectContacts, shouldBattle, resolveBattle }
                          from './src/engine/battle.js';
import { CONFIG }         from './src/config.js';
import { Renderer }       from './src/ui/renderer.js';

// JRA枠色（枠番1〜8）
const JRA_WAKU_COLORS = {
  1: { bg: '#FFFFFF', text: '#000000', label: '1枠' },
  2: { bg: '#000000', text: '#FFFFFF', label: '2枠' },
  3: { bg: '#FF0000', text: '#FFFFFF', label: '3枠' },
  4: { bg: '#0000FF', text: '#FFFFFF', label: '4枠' },
  5: { bg: '#FFFF00', text: '#000000', label: '5枠' },
  6: { bg: '#008000', text: '#FFFFFF', label: '6枠' },
  7: { bg: '#FF6600', text: '#FFFFFF', label: '7枠' },
  8: { bg: '#FF5FA2', text: '#000000', label: '8枠' },
};

const MIN_FORWARD_GAP = 26;
const LATERAL_BLOCK_X_GAP = 34;
const LATERAL_BLOCK_LANE_GAP = 0.95;
const LANE_WIDTH = 8;

// =====================
//  シミュレーション（全フェーズ一括計算）
// =====================
function runSimulation(raceData, userTweaks = {}, marks = {}) {
  const rng       = createRng(raceData.race_id);
  const horses    = calcAllParams(raceData, userTweaks, marks);
  const phases    = buildPhases(raceData.race_info.distance);
  const track     = raceData.race_info.track;
  const condition = raceData.race_info.condition;
  const trackMod  = CONFIG.TRACK_MODIFIER[track]?.[condition] ?? 1.0;

  const globalLogs = [];
  const snapshots  = [];

  for (const phase of phases) {
    // ① バトル判定
    const threshold      = phase.distance * 0.8;
    const contacts       = detectContacts(horses, threshold);
    const phaseEventLogs = [];

    for (const { a, b } of contacts) {
      if (!shouldBattle(rng, horses, a, b)) continue;
      const result = resolveBattle(rng, a, b, phase);
      const log = `[Battle] ${result.winner.name} vs ${result.loser.name} → 勝者: ${result.winner.name} (E: ${result.eA} vs ${result.eB})`;
      globalLogs.push(log);
      phaseEventLogs.push(log);
      break;
    }

    // ② 各馬の移動（衝突回避 + ブロック時バトル）
    const order = [...horses].sort((a, b) => b.x - a.x);
    for (const horse of order) {
      const staminaMod = horse.stamina > 0
        ? CONFIG.STAMINA_MODIFIER_FULL
        : CONFIG.STAMINA_MODIFIER_EMPTY;

      const paceMult = getStylePaceMultiplier(horse.style, phase.ratio);
      const V_eff    = horse.S_cruise * staminaMod * horse.battlePenalty * paceMult;
      const desiredAdvance = V_eff * (phase.distance / 80);

      // レーン移動AI（左右の馬が近い場合は進路変更を抑止）
      horse.targetLane = calcTargetLane(horse, phase, horses);
      const desiredY   = horse.y + (horse.targetLane - horse.y) * CONFIG.LANE_CHANGE_RATE;
      const laneCheck  = resolveLaneMovement(rng, horse, desiredY, horses, phase, phaseEventLogs, globalLogs);
      horse.y          = laneCheck.nextY;

      // 前方間隔チェック（前が塞がれていて仕掛ける場合はバトル）
      const forwardCheck = resolveForwardMovement(
        rng,
        horse,
        desiredAdvance,
        horses,
        phase,
        phaseEventLogs,
        globalLogs,
      );
      horse.x += forwardCheck.advance;

      applyCornerLoss(phase, horse);

      const cons    = calcStaminaCons(phase, horse, trackMod);
      horse.stamina = Math.max(0, horse.stamina - cons);

      horse.battleLosses  = 0;
      horse.battlePenalty = 1.0;

      const log = `[Phase ${phase.index + 1}][${horse.name}] lane=${laneIndex(horse.y)} stamina=${horse.stamina.toFixed(1)} pace×${paceMult.toFixed(2)}`;
      globalLogs.push(log);
      phaseEventLogs.push(log);
    }

    snapshots.push({
      phaseIndex: phase.index,
      isCorner:   phase.isCorner,
      isFinal:    phase.isFinal,
      ratio:      phase.ratio,
      eventLogs:  phaseEventLogs,
      horses:     horses.map(h => ({ ...h })),
    });
  }

  // ③ 最終タイム算出
  const results = horses.map(horse => {
    const staminaBonus = horse.initialStamina > 0
      ? (horse.stamina / horse.initialStamina) * 0.1 : 0;
    const V_final     = horse.S_cruise * (horse.stamina > 0 ? 1.0 : 0.7);
    const arrivalTime = (raceData.race_info.distance + horse.distanceLoss)
                      / (V_final * (1 + staminaBonus));
    return { ...horse, arrivalTime };
  });
  results.sort((a, b) => a.arrivalTime - b.arrivalTime);

  return { results, logs: globalLogs, snapshots, phases };
}

function resolveLaneMovement(rng, horse, desiredY, allHorses, phase, phaseEventLogs, globalLogs) {
  const laneBlocker = allHorses.find(h =>
    h.id !== horse.id &&
    Math.abs(h.x - horse.x) < LATERAL_BLOCK_X_GAP &&
    Math.abs(h.y - desiredY) < LATERAL_BLOCK_LANE_GAP
  );

  if (!laneBlocker) {
    return { nextY: clampLane(desiredY) };
  }

  const wantsLaneChange = Math.abs(desiredY - horse.y) > 0.18;
  if (!wantsLaneChange) {
    return { nextY: clampLane(horse.y) };
  }

  // 進路変更を強行したいときは既存バトル判定を利用
  if (shouldBattle(rng, allHorses, horse, laneBlocker)) {
    const result = resolveBattle(rng, horse, laneBlocker, phase);
    const log = `[Battle:進路] ${horse.name} が ${laneBlocker.name} に進路争い → 勝者: ${result.winner.name}`;
    globalLogs.push(log);
    phaseEventLogs.push(log);
    if (result.winner.id === horse.id) {
      return { nextY: clampLane(desiredY) };
    }
  }

  return { nextY: clampLane(horse.y) };
}

function resolveForwardMovement(rng, horse, desiredAdvance, allHorses, phase, phaseEventLogs, globalLogs) {
  const nextX = horse.x + desiredAdvance;
  const frontCandidates = allHorses
    .filter(h =>
      h.id !== horse.id &&
      h.x > horse.x &&
      Math.abs(h.y - horse.y) < 0.8
    )
    .sort((a, b) => a.x - b.x);

  const front = frontCandidates[0];
  if (!front) {
    return { advance: desiredAdvance };
  }

  const currentGap = front.x - horse.x;
  const maxAdvanceWithoutContact = Math.max(0, currentGap - MIN_FORWARD_GAP);
  if (desiredAdvance <= maxAdvanceWithoutContact) {
    return { advance: desiredAdvance };
  }

  const wantsOvertake = nextX > front.x - MIN_FORWARD_GAP;
  if (wantsOvertake && shouldBattle(rng, allHorses, horse, front)) {
    const result = resolveBattle(rng, horse, front, phase);
    const log = `[Battle:前詰まり] ${horse.name} が ${front.name} を交わしに行く → 勝者: ${result.winner.name}`;
    globalLogs.push(log);
    phaseEventLogs.push(log);
    if (result.winner.id === horse.id) {
      return { advance: desiredAdvance };
    }
  }

  return { advance: maxAdvanceWithoutContact };
}

function clampLane(v) {
  return Math.max(1, Math.min(LANE_WIDTH, v));
}

// =====================
//  レーン移動AI（8レーン対応）
// =====================
function calcTargetLane(horse, phase, allHorses) {
  const style        = horse.style;
  const isEarlyPhase = phase.ratio < 0.25;
  const isLatePhase  = phase.ratio > 0.65;

  // スタミナ温存（残30%以下）
  if (horse.stamina <= horse.initialStamina * CONFIG.STAMINA_CRITICAL && !isLatePhase) {
    return 1;
  }

  // 前方障害物回避（最終直線では無効化）
  const myLane  = laneIndex(horse.y);
  const blocked = !phase.isFinal && allHorses.some(h =>
    h.id !== horse.id &&
    Math.abs(h.y - horse.y) < 0.8 &&
    h.x > horse.x && (h.x - horse.x) < 40
  );

  // 脚質ベース目標レーン（8レーン対応）
  let baseLane;
  if (style === '逃げ') {
    baseLane = 1;
  } else if (style === '先行') {
    baseLane = isEarlyPhase ? 2 : 2;
  } else if (style === '差し') {
    baseLane = isLatePhase ? 3 : 4;
  } else if (style === '追込') {
    baseLane = phase.isFinal ? 5 : (isLatePhase ? 4 : 7);
  } else {
    baseLane = 4;
  }

  // 障害物があれば1つ外へ
  if (blocked && myLane < 8) {
    baseLane = Math.min(8, baseLane + 1);
  }

  return baseLane;
}

// =====================
//  出馬表の初期描画（充実版）
// =====================
function renderEntryList(horses) {
  const listEl = document.getElementById('entry-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  horses.forEach(horse => {
    const waku = JRA_WAKU_COLORS[horse.waku] ?? { bg: '#888', text: '#fff' };
    const dotBg = waku.bg === '#000000' ? '#444' : waku.bg;

    // パラメータのバー幅計算
    const cruisePct  = Math.round(horse.S_cruise);
    const maneuvPct  = Math.round(horse.M_maneuv);
    const sustainPct = Math.round(horse.S_sustain);

    const row = document.createElement('div');
    row.className        = 'entry-row';
    row.dataset.horseId  = horse.id;
    // 左端に枠色の帯を border-left で表示
    row.style.borderLeft = `5px solid ${waku.bg}`;
    row.style.boxShadow  = `inset 3px 0 8px rgba(0,0,0,0.18)`;
    row.innerHTML = `
      <div class="entry-gate" style="background:${waku.bg};color:${waku.text};border:1px solid rgba(255,255,255,0.3);">${horse.gate}</div>
      <div class="entry-info">
        <div class="entry-name">${horse.name}</div>
        <div class="entry-jockey">🏇 ${horse.jockeyName ?? ''}　${horse.style}</div>
        <div class="entry-params">
          <div class="param-row">
            <span class="param-label">速度</span>
            <div class="param-bar-bg"><div class="param-bar speed-bar" style="width:${cruisePct}%"></div></div>
            <span class="param-val">${cruisePct}</span>
          </div>
          <div class="param-row">
            <span class="param-label">操縦</span>
            <div class="param-bar-bg"><div class="param-bar maneuv-bar" style="width:${maneuvPct}%"></div></div>
            <span class="param-val">${maneuvPct}</span>
          </div>
          <div class="param-row">
            <span class="param-label">持久</span>
            <div class="param-bar-bg"><div class="param-bar sustain-bar" style="width:${sustainPct}%"></div></div>
            <span class="param-val">${sustainPct}</span>
          </div>
        </div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

// 出馬表に着順バッジを反映
function updateEntryRanks(results) {
  results.forEach((horse, i) => {
    const rank   = i + 1;
    const rowEl  = document.querySelector(`[data-horse-id="${horse.id}"]`);
    if (!rowEl) return;
    const old = rowEl.querySelector('.entry-rank-badge');
    if (old) old.remove();

    const badge = document.createElement('div');
    badge.className = `entry-rank-badge${rank <= 3 ? ` rank-${rank}` : ''}`;
    badge.textContent = `${rank}着`;
    rowEl.querySelector('.entry-info').appendChild(badge);
  });
}

// =====================
//  フェーズ手動進行コントローラー（ステップバイステップ）
// =====================
class PhaseController {
  constructor(snapshots, phases, renderer) {
    this.snapshots   = snapshots;
    this.phases      = phases;
    this.renderer    = renderer;
    this.currentIdx  = 0;
    this._logQueue   = [];
    this._logTimer   = null;

    this.btnNext   = document.getElementById('btn-next');
    this.btnRun    = document.getElementById('btn-run');
    this.btnReset  = document.getElementById('btn-reset');
    this.logPanel  = document.getElementById('log-panel');
    this.indicator = document.getElementById('phase-indicator');
    this.isAnimating = false;
    this.frameCount  = 24; // 1フェーズを細かく刻む
    this.frameMs     = 70; // 1コマの表示時間
  }

  start() {
    this.currentIdx = 0;
    this._renderPhase(0);
    this.btnNext.disabled = false;
    this.btnNext.textContent = '▶▶ 次のフェーズ';
  }

  _renderPhase(idx) {
    const snap  = this.snapshots[idx];
    const phase = this.phases[idx];
    const prev  = idx > 0 ? this.snapshots[idx - 1] : null;

    // 馬カードをアニメーション付きで描画（前フェーズ位置から開始）
    this._animateHorses(prev?.horses ?? null, snap.horses, phase, idx === 0);

    // フェーズ名をインジケーターに反映
    this.indicator.textContent = this.renderer.getPhaseName(phase);

    // ログをステップバイステップで1行ずつ表示
    this._enqueueLogs(snap.eventLogs);

    // 最終フェーズの次は「ゴール判定」
    if (idx === this.snapshots.length - 1) {
      this.btnNext.textContent = '🏁 ゴール判定';
    }
  }

  // 馬カードをアニメーションで表示（段階的に進行度を上げる）
  _animateHorses(fromHorses, toHorses, phase, isFirstPhase = false) {
    this.isAnimating      = true;
    this.btnNext.disabled = true;

    // 初回のみスタート演出（スタート隊列→第1フェーズ）
    if (isFirstPhase) {
      let progress = 0;
      const stepFirst = () => {
        progress += 1 / this.frameCount;
        this.renderer.draw(toHorses, phase, Math.min(1, progress));
        if (progress >= 1) {
          this.isAnimating = false;
          this.btnNext.disabled = false;
          return;
        }
        setTimeout(stepFirst, this.frameMs);
      };
      setTimeout(stepFirst, this.frameMs);
      return;
    }

    const fromById = new Map((fromHorses ?? []).map(h => [h.id, h]));
    let frame = 0;
    const step = () => {
      frame++;
      const progress = Math.min(1, frame / this.frameCount);

      // 前フェーズ位置 -> 今フェーズ位置へ線形補間
      const tweened = toHorses.map(to => {
        const from = fromById.get(to.id) ?? to;
        return {
          ...to,
          x: from.x + (to.x - from.x) * progress,
          y: from.y + (to.y - from.y) * progress,
          stamina: from.stamina + (to.stamina - from.stamina) * progress,
        };
      });

      this.renderer.draw(tweened, phase, 1);
      if (progress >= 1) {
        this.isAnimating = false;
        this.btnNext.disabled = false;
        return;
      }
      setTimeout(step, this.frameMs);
    };
    setTimeout(step, this.frameMs);
  }

  // ログを1行ずつ時間差で表示
  _enqueueLogs(lines) {
    if (this._logTimer) {
      clearTimeout(this._logTimer);
      this._logTimer = null;
    }
    this._logQueue = [...lines];
    this._flushNextLog();
  }

  _flushNextLog() {
    if (this._logQueue.length === 0) return;
    const line = this._logQueue.shift();
    const div  = document.createElement('div');
    div.className = 'log-entry' + (line.startsWith('[Battle]') ? ' battle' : '');
    div.textContent = line;
    this.logPanel.appendChild(div);
    this.logPanel.scrollTop = this.logPanel.scrollHeight;
    this._logTimer = setTimeout(() => this._flushNextLog(), 80);
  }

  next(onFinish) {
    if (this.isAnimating) return;
    this.currentIdx++;
    if (this.currentIdx >= this.snapshots.length) {
      this.btnNext.disabled = true;
      onFinish();
      return;
    }
    this._renderPhase(this.currentIdx);
  }
}

// =====================
//  着順表示
// =====================
function showResults(results, logs) {
  document.getElementById('result-area').style.display = 'block';
  const rankingEl = document.getElementById('ranking');
  rankingEl.innerHTML = '';

  results.forEach((horse, i) => {
    const rank     = i + 1;
    const card     = document.createElement('div');
    card.className = `horse-card${rank <= 3 ? ` rank-${rank}` : ''}`;
    const waku     = JRA_WAKU_COLORS[horse.waku] ?? { bg: '#888', text: '#fff' };
    const dotColor = waku.bg === '#000000' ? '#444' : waku.bg;
    card.innerHTML = `
      <div class="rank-num">${rank}</div>
      <div class="horse-dot" style="background:${dotColor};border-color:${waku.bg};"></div>
      <div class="horse-info">
        <div class="horse-name">${horse.name}</div>
        <div class="horse-meta">${horse.style} / スタミナ残: ${horse.stamina.toFixed(1)}</div>
      </div>
      <div class="horse-stats">
        <div class="arrival-time">${horse.arrivalTime.toFixed(3)}</div>
        <div class="stat-detail">距離ロス: ${horse.distanceLoss.toFixed(1)}m</div>
      </div>
    `;
    rankingEl.appendChild(card);
    setTimeout(() => card.classList.add('visible'), rank * 100);
  });

  // ログを1行ずつ表示
  const logEl = document.getElementById('log-panel');
  logEl.innerHTML = '';
  let i = 0;
  const showNextLog = () => {
    if (i >= logs.length) return;
    const div = document.createElement('div');
    div.className = 'log-entry' + (logs[i].startsWith('[Battle]') ? ' battle' : '');
    div.textContent = logs[i];
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
    i++;
    setTimeout(showNextLog, 40);
  };
  showNextLog();
}

// =====================
//  エントリーポイント
// =====================
fetch('./src/data/sample.json')
  .then(res => res.json())
  .then(raceData => {
    const phases        = buildPhases(raceData.race_info.distance);
    const track         = raceData.race_info.track;
    const condition     = raceData.race_info.condition;
    const renderer      = new Renderer('field-canvas', phases.length, track, condition);
    const initialHorses = calcAllParams(raceData);

    // 騎手名をhorseオブジェクトに付与
    raceData.entries.forEach((entry, idx) => {
      if (initialHorses[idx]) {
        initialHorses[idx].jockeyName = entry.jockey.name;
      }
    });

    // 出馬表初期描画
    renderEntryList(initialHorses);

    // 初期盤面
    renderer.draw(initialHorses, phases[0], 0);

    let controller = null;
    let simResults = null;
    let simLogs    = null;

    const btnRun   = document.getElementById('btn-run');
    const btnNext  = document.getElementById('btn-next');
    const btnReset = document.getElementById('btn-reset');

    // レース開始
    btnRun.addEventListener('click', () => {
      btnRun.disabled   = true;
      btnNext.disabled  = false;
      btnReset.disabled = false;
      document.getElementById('result-area').style.display = 'none';
      document.getElementById('log-panel').innerHTML = '';
      btnNext.textContent = '▶▶ 次のフェーズ';

      const sim  = runSimulation(raceData);
      simResults = sim.results;
      simLogs    = sim.logs;

      // 騎手名をシミュレーション結果にも付与
      raceData.entries.forEach((entry, idx) => {
        if (simResults[idx]) {
          // idで対応する結果を探す
        }
      });
      simResults.forEach(horse => {
        const entry = raceData.entries.find((_, i) => i === horse.id);
        if (entry) horse.jockeyName = entry.jockey.name;
      });

      controller = new PhaseController(sim.snapshots, phases, renderer);
      controller.start();
    });

    // 次のフェーズ／ゴール判定
    btnNext.addEventListener('click', () => {
      if (!controller) return;
      controller.next(() => {
        setTimeout(() => {
          showResults(simResults, simLogs);
          updateEntryRanks(simResults);
          btnNext.disabled    = true;
          btnReset.disabled   = false;
          btnNext.textContent = '▶▶ 次のフェーズ';
        }, 300);
      });
    });

    // リセット
    btnReset.addEventListener('click', () => {
      btnRun.disabled   = false;
      btnNext.disabled  = true;
      btnReset.disabled = true;
      btnNext.textContent = '▶▶ 次のフェーズ';
      document.getElementById('result-area').style.display = 'none';
      document.getElementById('phase-indicator').textContent = 'スタート';
      document.getElementById('log-panel').innerHTML =
        '<div class="log-entry" style="color:#334;">待機中...</div>';

      document.querySelectorAll('.entry-rank-badge').forEach(el => el.remove());

      renderer.draw(initialHorses, phases[0], 0);
      controller = null;
    });
  })
  .catch(err => {
    console.error('JSONの読み込みに失敗しました:', err);
  });
