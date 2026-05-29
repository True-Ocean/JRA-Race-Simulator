import { calcWaku } from '../engine/params.js';
import {
  PRE_RACE_MARK_OPTIONS,
  RATING_SLIDER_MAX,
  RATING_SLIDER_MIN,
  UNIQUE_MARK_SYMBOLS,
  formatEntryDetailLines,
} from '../engine/rating-adjustments.js';
import { formatRaceInfo } from '../stats/race-display.js';
import { JRA_WAKU_COLORS } from './colors.js';

/** プレレース編集で選べる脚質（シミュレーションが参照するラベルと一致） */
export const PRE_RACE_STYLE_OPTIONS = ['大逃げ', '逃げ', '先行', '差し', '追込'];

/** 出馬表の脚質バッジ用クラス（index.html の .entry-style--* と対応） */
const ENTRY_STYLE_BADGE_CLASS = {
  大逃げ: 'entry-style--oonige',
  逃げ: 'entry-style--nige',
  先行: 'entry-style--senko',
  差し: 'entry-style--sashi',
  追込: 'entry-style--oikomi',
};

const TOAST_MS = 2600;
const AGGREGATE_RESET_CONFIRM_MSG =
  'これまでのシミュレーション集計がリセットされます。よろしいですか？';

/** @type {((value: boolean) => void) | null} */
let preRaceConfirmResolve = null;

function bindPreRaceConfirmDialog() {
  if (bindPreRaceConfirmDialog._bound) return;
  bindPreRaceConfirmDialog._bound = true;

  const overlay = document.getElementById('pre-race-confirm');
  const btnOk = document.getElementById('pre-race-confirm-ok');
  const btnCancel = document.getElementById('pre-race-confirm-cancel');
  if (!overlay || !btnOk || !btnCancel) return;

  const finish = result => {
    overlay.hidden = true;
    if (preRaceConfirmResolve) {
      preRaceConfirmResolve(result);
      preRaceConfirmResolve = null;
    }
  };

  btnOk.addEventListener('click', () => finish(true));
  btnCancel.addEventListener('click', () => finish(false));
  overlay.addEventListener('click', ev => {
    if (ev.target === overlay) finish(false);
  });
  document.addEventListener('keydown', ev => {
    if (overlay.hidden) return;
    if (ev.key === 'Escape') finish(false);
  });
}

function showPreRaceConfirm(message = AGGREGATE_RESET_CONFIRM_MSG) {
  bindPreRaceConfirmDialog();
  const overlay = document.getElementById('pre-race-confirm');
  const msgEl = document.getElementById('pre-race-confirm-message');
  if (!overlay || !msgEl) {
    return Promise.resolve(window.confirm(message));
  }

  return new Promise(resolve => {
    preRaceConfirmResolve = resolve;
    msgEl.textContent = message;
    overlay.hidden = false;
    document.getElementById('pre-race-confirm-ok')?.focus();
  });
}

function closePreRaceConfirm() {
  const overlay = document.getElementById('pre-race-confirm');
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  if (preRaceConfirmResolve) {
    preRaceConfirmResolve(false);
    preRaceConfirmResolve = null;
  }
}

let activeInfoPopover = null;
let activeInfoPopoverAnchor = null;

function getEntryStyleBadgeClass(style) {
  return ENTRY_STYLE_BADGE_CLASS[style] ?? 'entry-style--default';
}

function clampRating(n) {
  return Math.max(RATING_SLIDER_MIN, Math.min(RATING_SLIDER_MAX, Math.round(n)));
}

export function showPreRaceToast(message) {
  const overlay = document.getElementById('pre-race-toast');
  const msgEl = document.getElementById('pre-race-toast-message');
  if (!overlay || !msgEl) return;
  msgEl.textContent = message;
  overlay.hidden = false;
  overlay.dataset.visible = '1';
  clearTimeout(showPreRaceToast._timer);
  showPreRaceToast._timer = setTimeout(() => {
    overlay.hidden = true;
    delete overlay.dataset.visible;
  }, TOAST_MS);
}

export function closeActiveInfoPopover() {
  if (activeInfoPopover) {
    activeInfoPopover.remove();
    activeInfoPopover = null;
    activeInfoPopoverAnchor = null;
  }
}

function bindInfoPopoverDismiss() {
  if (bindInfoPopoverDismiss._bound) return;
  bindInfoPopoverDismiss._bound = true;
  document.addEventListener('click', ev => {
    if (!activeInfoPopover) return;
    const t = ev.target;
    if (activeInfoPopover.contains(t) || activeInfoPopoverAnchor?.contains(t)) return;
    closeActiveInfoPopover();
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') closeActiveInfoPopover();
  });
}

function openInfoPopover(anchor, entry) {
  closeActiveInfoPopover();
  const lines = formatEntryDetailLines(entry);
  if (!lines.length) return;

  const pop = document.createElement('div');
  pop.className = 'pre-race-info-popover';
  pop.setAttribute('role', 'dialog');
  pop.innerHTML = lines.map(line => `<div class="pre-race-info-popover-line">${line}</div>`).join('');

  const editor = document.getElementById('pre-race-editor');
  (editor ?? document.body).appendChild(pop);

  const anchorRect = anchor.getBoundingClientRect();
  const editorRect = editor?.getBoundingClientRect() ?? { left: 0, top: 0 };
  let left = anchorRect.left - editorRect.left;
  let top = anchorRect.bottom - editorRect.top + 6;
  const maxLeft = (editor?.clientWidth ?? window.innerWidth) - pop.offsetWidth - 8;
  left = Math.max(8, Math.min(left, maxLeft));
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;

  activeInfoPopover = pop;
  activeInfoPopoverAnchor = anchor;
}

/**
 * プレレース表の見やすさを保ちつつ、必要時のみ軽く縮小する
 */
export function updatePreRaceTableFit() {
  const editor = document.getElementById('pre-race-editor');
  const wrap = document.querySelector('.pre-race-table-wrap');
  const inner = document.querySelector('.pre-race-table-inner');
  if (!editor || !wrap || !inner) return;
  if (editor.hidden) return;

  inner.style.zoom = '';
  inner.style.transform = '';
  inner.style.marginBottom = '';

  const availH = wrap.clientHeight;
  const nh = inner.scrollHeight;
  if (availH < 8 || nh < 1) return;

  const scaleByHeight = availH / nh;
  const scale = Math.max(0.9, Math.min(1, scaleByHeight));
  if (scale >= 0.999) return;

  inner.style.transform = `scale(${scale})`;
  inner.style.transformOrigin = 'top center';
  inner.style.marginBottom = `${-(nh * (1 - scale))}px`;
}

export function schedulePreRaceTableFit() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => updatePreRaceTableFit());
  });
}

/** @param {'horse' | 'jockey' | 'training'} kind */
function makeRatingSliderCell(get, set, kind) {
  const td = document.createElement('td');
  td.className = 'pre-race-rating-cell';

  const wrap = document.createElement('div');
  wrap.className = 'pre-race-rating-wrap';

  const val = document.createElement('span');
  val.className = 'pre-race-rating-val';
  val.setAttribute('aria-hidden', 'true');

  const input = document.createElement('input');
  input.type = 'range';
  input.className = `pre-race-rating-slider pre-race-rating-slider--${kind}`;
  input.min = String(RATING_SLIDER_MIN);
  input.max = String(RATING_SLIDER_MAX);
  input.step = '1';

  const ticks = document.createElement('div');
  ticks.className = 'pre-race-rating-ticks';
  ticks.setAttribute('aria-hidden', 'true');
  ticks.innerHTML = '<span>−5</span><span>0</span><span>+5</span>';

  const paint = () => {
    const v = get();
    input.value = String(v);
    val.textContent = v > 0 ? `+${v}` : String(v);
    val.dataset.zero = v === 0 ? '1' : '0';
    input.dataset.zero = v === 0 ? '1' : '0';
  };

  input.addEventListener('input', () => {
    set(clampRating(Number(input.value)));
    paint();
  });

  paint();
  wrap.append(val, input, ticks);
  td.appendChild(wrap);
  return td;
}

function makeDetailCell(entry) {
  const td = document.createElement('td');
  td.className = 'pre-race-detail-cell';

  const infoBtn = document.createElement('button');
  infoBtn.type = 'button';
  infoBtn.className = 'pre-race-info-btn';
  infoBtn.textContent = 'i';
  infoBtn.setAttribute('aria-label', '詳細データを表示');
  infoBtn.addEventListener('click', ev => {
    ev.stopPropagation();
    if (activeInfoPopoverAnchor === infoBtn) {
      closeActiveInfoPopover();
      return;
    }
    openInfoPopover(infoBtn, entry);
  });
  td.appendChild(infoBtn);
  return td;
}

function makeMarkCell(horseId, marksByHorse, allMarkButtons) {
  const td = document.createElement('td');
  td.className = 'pre-race-mark-cell';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pre-race-mark-btn';
  btn.setAttribute('aria-label', '予想印');

  const paint = () => {
    const sym = marksByHorse[horseId] ?? '';
    btn.textContent = sym || '—';
    btn.dataset.mark = sym;
    btn.title = sym ? `印 ${sym}（クリックで変更）` : '印なし（クリックで設定）';
  };

  btn.addEventListener('click', () => {
    const current = marksByHorse[horseId] ?? '';
    const idx = PRE_RACE_MARK_OPTIONS.indexOf(current);
    const next = PRE_RACE_MARK_OPTIONS[(idx + 1) % PRE_RACE_MARK_OPTIONS.length];
    if (next && UNIQUE_MARK_SYMBOLS.has(next)) {
      for (const [idStr, sym] of Object.entries(marksByHorse)) {
        if (sym === next) marksByHorse[idStr] = '';
      }
    }
    marksByHorse[horseId] = next;
    allMarkButtons.forEach(({ paintFn, button, id }) => paintFn(id, button));
  });

  paint();
  allMarkButtons.push({
    id: horseId,
    button: btn,
    paintFn: (id, button) => {
      const sym = marksByHorse[id] ?? '';
      button.textContent = sym || '—';
      button.dataset.mark = sym;
    },
  });
  td.appendChild(btn);
  return td;
}

/**
 * @param {HTMLElement} tbody
 * @param {object} p
 */
function resetPreRaceEditorValues(tbody, p) {
  const {
    ratingAdjustments,
    marksByHorse,
    totalEntries,
    runtimeRaceData,
    baselineEntryStyles,
    styleSyncByRow,
  } = p;

  for (let id = 0; id < totalEntries; id++) {
    ratingAdjustments[id] = { horse: 0, jockey: 0, training: 0 };
    marksByHorse[id] = '';
    const baselineStyle = baselineEntryStyles[id];
    if (baselineStyle != null && runtimeRaceData.entries[id]?.horse) {
      runtimeRaceData.entries[id].horse.style = baselineStyle;
    }
  }

  tbody.querySelectorAll('tr').forEach(tr => {
    const id = Number(tr.dataset.horseId);
    tr.querySelectorAll('.pre-race-rating-slider').forEach(slider => {
      slider.value = '0';
      slider.dataset.zero = '1';
      const val = slider.parentElement?.querySelector('.pre-race-rating-val');
      if (val) {
        val.textContent = '0';
        val.dataset.zero = '1';
      }
    });
    const markBtn = tr.querySelector('.pre-race-mark-btn');
    if (markBtn) {
      markBtn.textContent = '—';
      markBtn.dataset.mark = '';
    }
    const syncStyle = styleSyncByRow.get(id);
    if (syncStyle) syncStyle();
  });
}

/**
 * @param {object} p
 * @param {object} p.runtimeRaceData
 * @param {Record<number, { horse: number, jockey: number, training: number }>} p.ratingAdjustments
 * @param {Record<number, string>} p.marksByHorse
 * @param {string[]} p.baselineEntryStyles
 * @param {() => void} p.onClose
 * @param {() => boolean | void} p.onApply
 * @param {() => void} p.onReset
 */
export function mountPreRaceEditor(p) {
  const {
    runtimeRaceData,
    ratingAdjustments,
    marksByHorse,
    baselineEntryStyles,
    onClose,
    onApply,
    onReset,
  } = p;

  const tbody = document.getElementById('pre-race-tbody');
  const infoEl = document.getElementById('pre-race-race-info');
  const btnClose = document.getElementById('btn-pre-race-close');
  const btnApply = document.getElementById('btn-pre-race-apply');
  const btnReset = document.getElementById('btn-pre-race-reset');
  if (!tbody || !btnClose || !btnApply || !btnReset) return;

  bindInfoPopoverDismiss();

  if (infoEl) {
    infoEl.innerHTML = formatRaceInfo(runtimeRaceData);
  }

  tbody.innerHTML = '';
  closeActiveInfoPopover();

  const totalEntries = runtimeRaceData.entries.length;
  const allMarkButtons = [];
  const styleSyncByRow = new Map();

  runtimeRaceData.entries.forEach((entry, idx) => {
    if (!entry.jockey) entry.jockey = {};
    const horse = entry.horse;
    const jockey = entry.jockey;
    if (!ratingAdjustments[idx]) {
      ratingAdjustments[idx] = { horse: 0, jockey: 0, training: 0 };
    }
    if (marksByHorse[idx] === undefined) marksByHorse[idx] = '';

    const tr = document.createElement('tr');
    tr.dataset.horseId = String(idx);

    tr.appendChild(makeMarkCell(idx, marksByHorse, allMarkButtons));

    const waku = calcWaku(entry.gate, totalEntries);
    const wakuColors = JRA_WAKU_COLORS[waku] ?? { bg: '#888888', text: '#ffffff' };

    const tdGate = document.createElement('td');
    tdGate.className = 'pre-race-gate-cell';
    const gateBadge = document.createElement('span');
    gateBadge.className = 'entry-gate';
    gateBadge.textContent = String(entry.gate);
    gateBadge.style.background = wakuColors.bg;
    gateBadge.style.color = wakuColors.text;
    gateBadge.style.border = '1px solid rgba(255,255,255,0.3)';
    tdGate.appendChild(gateBadge);
    tr.appendChild(tdGate);

    const tdName = document.createElement('td');
    tdName.className = 'pre-race-name';
    const nameLine = document.createElement('div');
    nameLine.className = 'pre-race-name-line';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'pre-race-name-text';
    nameSpan.textContent = horse.name ?? '';
    nameLine.appendChild(nameSpan);
    tdName.appendChild(nameLine);
    tr.appendChild(tdName);

    const tdJockey = document.createElement('td');
    tdJockey.className = 'pre-race-jockey';
    const jockeySpan = document.createElement('span');
    jockeySpan.className = 'pre-race-jockey-name';
    jockeySpan.textContent = jockey.name ?? '';
    tdJockey.appendChild(jockeySpan);
    tr.appendChild(tdJockey);

    const tdStyle = document.createElement('td');
    const styleWrap = document.createElement('span');
    const sel = document.createElement('select');
    sel.className = 'pre-race-select';
    const syncStyleBadgeClass = () => {
      styleWrap.className = `entry-style-inline pre-race-style-wrap ${getEntryStyleBadgeClass(horse.style)}`;
      sel.value = horse.style ?? PRE_RACE_STYLE_OPTIONS[0];
    };
    styleSyncByRow.set(idx, syncStyleBadgeClass);

    const styleSet = new Set(PRE_RACE_STYLE_OPTIONS);
    if (horse.style && !styleSet.has(horse.style)) {
      const o = document.createElement('option');
      o.value = horse.style;
      o.textContent = horse.style;
      sel.appendChild(o);
    }
    PRE_RACE_STYLE_OPTIONS.forEach(s => {
      const o = document.createElement('option');
      o.value = s;
      o.textContent = s;
      if (horse.style === s) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      horse.style = sel.value;
      syncStyleBadgeClass();
    });
    syncStyleBadgeClass();
    styleWrap.appendChild(sel);
    tdStyle.appendChild(styleWrap);
    tr.appendChild(tdStyle);

    const ratings = ratingAdjustments[idx];
    tr.appendChild(
      makeRatingSliderCell(
        () => ratings.horse,
        v => {
          ratings.horse = v;
        },
        'horse',
      ),
    );
    tr.appendChild(
      makeRatingSliderCell(
        () => ratings.jockey,
        v => {
          ratings.jockey = v;
        },
        'jockey',
      ),
    );
    tr.appendChild(
      makeRatingSliderCell(
        () => ratings.training,
        v => {
          ratings.training = v;
        },
        'training',
      ),
    );

    tr.appendChild(makeDetailCell(entry));

    tbody.appendChild(tr);
  });

  const wireButton = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.replaceWith(el.cloneNode(true));
    document.getElementById(id)?.addEventListener('click', handler);
  };

  wireButton('btn-pre-race-close', () => {
    closePreRaceConfirm();
    closeActiveInfoPopover();
    onClose?.();
  });

  wireButton('btn-pre-race-apply', async () => {
    closeActiveInfoPopover();
    if (!(await showPreRaceConfirm())) return;
    if (onApply?.() !== false) {
      showPreRaceToast('お好み設定が反映されました');
    }
  });

  wireButton('btn-pre-race-reset', async () => {
    closeActiveInfoPopover();
    if (!(await showPreRaceConfirm())) return;
    resetPreRaceEditorValues(tbody, {
      ratingAdjustments,
      marksByHorse,
      totalEntries,
      runtimeRaceData,
      baselineEntryStyles,
      styleSyncByRow,
    });
    if (onReset?.() !== false) {
      showPreRaceToast('初期設定にリセットされました');
    }
  });

  schedulePreRaceTableFit();
  const wrapEl = document.querySelector('.pre-race-table-wrap');
  if (wrapEl && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => schedulePreRaceTableFit());
    ro.observe(wrapEl);
  }
  window.addEventListener('resize', schedulePreRaceTableFit);
}

export { getEntryStyleBadgeClass };
