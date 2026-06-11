import {
  CARROT_MAX,
  CARROT_MIN,
  PRE_RACE_MARK_OPTIONS,
  carrotsForMark,
  clampCarrots,
  formatEntryDetailLines,
} from '../engine/rating-adjustments.js';
import { formatRaceInfo } from '../stats/race-display.js';
import { appendHorseBlockCells } from './horse-block.js';

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

/** @typedef {'apply' | 'discard' | 'stay'} PreRaceConfirmResult */

/** @type {((value: PreRaceConfirmResult) => void) | null} */
let preRaceConfirmResolve = null;

function bindPreRaceConfirmDialog() {
  if (bindPreRaceConfirmDialog._bound) return;
  bindPreRaceConfirmDialog._bound = true;

  const overlay = document.getElementById('pre-race-confirm');
  const btnOk = document.getElementById('pre-race-confirm-ok');
  const btnCancel = document.getElementById('pre-race-confirm-cancel');
  if (!overlay || !btnOk || !btnCancel) return;

  /** @param {PreRaceConfirmResult} result */
  const finish = result => {
    overlay.hidden = true;
    if (preRaceConfirmResolve) {
      preRaceConfirmResolve(result);
      preRaceConfirmResolve = null;
    }
  };

  btnOk.addEventListener('click', () => finish('apply'));
  btnCancel.addEventListener('click', () => finish('discard'));
  overlay.addEventListener('click', ev => {
    if (ev.target === overlay) finish('stay');
  });
  document.addEventListener('keydown', ev => {
    if (overlay.hidden) return;
    if (ev.key === 'Escape') finish('stay');
  });
}

/**
 * @param {string} message
 * @param {{ okLabel?: string, cancelLabel?: string }} [labels]
 * @returns {Promise<PreRaceConfirmResult>}
 */
export function showPreRaceConfirm(
  message,
  { okLabel = 'はい', cancelLabel = 'いいえ' } = {},
) {
  bindPreRaceConfirmDialog();
  const overlay = document.getElementById('pre-race-confirm');
  const msgEl = document.getElementById('pre-race-confirm-message');
  const btnOk = document.getElementById('pre-race-confirm-ok');
  const btnCancel = document.getElementById('pre-race-confirm-cancel');
  if (!overlay || !msgEl) {
    return Promise.resolve(window.confirm(message) ? 'apply' : 'discard');
  }

  return new Promise(resolve => {
    preRaceConfirmResolve = resolve;
    msgEl.textContent = message;
    if (btnOk) btnOk.textContent = okLabel;
    if (btnCancel) btnCancel.textContent = cancelLabel;
    overlay.hidden = false;
    btnOk?.focus();
  });
}

function closePreRaceConfirm() {
  const overlay = document.getElementById('pre-race-confirm');
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  if (preRaceConfirmResolve) {
    preRaceConfirmResolve('stay');
    preRaceConfirmResolve = null;
  }
}

let activeInfoPopover = null;
let activeInfoPopoverAnchor = null;

function getEntryStyleBadgeClass(style) {
  return ENTRY_STYLE_BADGE_CLASS[style] ?? 'entry-style--default';
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

function formatCarrotLabel(count) {
  return count > 0 ? `🥕×${count}` : '—';
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

/**
 * @param {number} horseId
 * @param {Record<number, string>} marksByHorse
 * @param {Record<number, number>} carrotsByHorse
 * @param {Array<{ id: number, button: HTMLButtonElement, paintFn: Function }>} allMarkButtons
 * @param {Map<number, { paint: () => void, setCount: (n: number) => void }>} carrotControlsByRow
 */
function makeMarkCell(horseId, marksByHorse, carrotsByHorse, allMarkButtons, carrotControlsByRow) {
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
    btn.title = sym ? `予想印 ${sym}（クリックで変更）` : '予想印なし（クリックで設定）';
  };

  btn.addEventListener('click', () => {
    const current = marksByHorse[horseId] ?? '';
    const idx = PRE_RACE_MARK_OPTIONS.indexOf(current);
    const next = PRE_RACE_MARK_OPTIONS[(idx + 1) % PRE_RACE_MARK_OPTIONS.length];
    marksByHorse[horseId] = next;
    const nextCarrots = carrotsForMark(next);
    carrotsByHorse[horseId] = nextCarrots;
    allMarkButtons.forEach(({ paintFn, button, id }) => paintFn(id, button));
    const carrotCtrl = carrotControlsByRow.get(horseId);
    carrotCtrl?.setCount(nextCarrots);
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
 * @param {number} horseId
 * @param {Record<number, number>} carrotsByHorse
 * @param {Map<number, { paint: () => void, setCount: (n: number) => void }>} carrotControlsByRow
 */
function makeCarrotCell(horseId, carrotsByHorse, carrotControlsByRow) {
  const td = document.createElement('td');
  td.className = 'pre-race-carrot-cell';

  const stepper = document.createElement('div');
  stepper.className = 'pre-race-stepper pre-race-carrot-stepper';

  const btnMinus = document.createElement('button');
  btnMinus.type = 'button';
  btnMinus.className = 'pre-race-carrot-btn pre-race-carrot-btn--minus';
  btnMinus.textContent = '−';
  btnMinus.setAttribute('aria-label', '評価を減らす');

  const label = document.createElement('span');
  label.className = 'pre-race-carrot-label';
  label.setAttribute('aria-live', 'polite');

  const btnPlus = document.createElement('button');
  btnPlus.type = 'button';
  btnPlus.className = 'pre-race-carrot-btn pre-race-carrot-btn--plus';
  btnPlus.textContent = '+';
  btnPlus.setAttribute('aria-label', '評価を増やす');

  const paint = () => {
    const count = clampCarrots(carrotsByHorse[horseId] ?? 0);
    carrotsByHorse[horseId] = count;
    label.textContent = formatCarrotLabel(count);
    label.dataset.zero = count === 0 ? '1' : '0';
    btnMinus.disabled = count <= CARROT_MIN;
    btnPlus.disabled = count >= CARROT_MAX;
  };

  const setCount = count => {
    carrotsByHorse[horseId] = clampCarrots(count);
    paint();
  };

  btnMinus.addEventListener('click', () => {
    setCount((carrotsByHorse[horseId] ?? 0) - 1);
  });
  btnPlus.addEventListener('click', () => {
    setCount((carrotsByHorse[horseId] ?? 0) + 1);
  });

  paint();
  carrotControlsByRow.set(horseId, { paint, setCount });

  stepper.append(btnMinus, label, btnPlus);
  td.appendChild(stepper);
  return td;
}

/**
 * @param {object} p
 * @param {object} p.runtimeRaceData - race_info 表示用（entries は draft.entries を渡す）
 * @param {{ entries: object[], carrotsByHorse: Record<number, number>, marksByHorse: Record<number, string> }} p.draft
 */
export function renderPreRaceEditor(p) {
  const { runtimeRaceData, draft } = p;
  const { entries, carrotsByHorse, marksByHorse } = draft;

  const tbody = document.getElementById('pre-race-tbody');
  const infoEl = document.getElementById('pre-race-race-info');
  if (!tbody) return;

  bindInfoPopoverDismiss();

  if (infoEl) {
    infoEl.innerHTML = formatRaceInfo({ ...runtimeRaceData, entries });
  }

  tbody.innerHTML = '';
  closeActiveInfoPopover();

  const totalEntries = entries.length;
  const allMarkButtons = [];
  const carrotControlsByRow = new Map();
  const styleSyncByRow = new Map();

  entries.forEach((entry, idx) => {
    if (!entry.jockey) entry.jockey = {};
    const horse = entry.horse;
    if (carrotsByHorse[idx] === undefined) carrotsByHorse[idx] = 0;
    if (marksByHorse[idx] === undefined) marksByHorse[idx] = '';

    const tr = document.createElement('tr');
    tr.dataset.horseId = String(idx);

    tr.appendChild(
      makeMarkCell(idx, marksByHorse, carrotsByHorse, allMarkButtons, carrotControlsByRow),
    );

    appendHorseBlockCells(tr, entry, entry.gate, totalEntries);

    const tdStyle = document.createElement('td');
    tdStyle.className = 'pre-race-style-cell';
    const styleInner = document.createElement('div');
    styleInner.className = 'pre-race-style-inner';
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
    styleInner.appendChild(styleWrap);
    tdStyle.appendChild(styleInner);
    tr.appendChild(tdStyle);

    tr.appendChild(makeCarrotCell(idx, carrotsByHorse, carrotControlsByRow));
    tr.appendChild(makeDetailCell(entry));

    tbody.appendChild(tr);
  });

  schedulePreRaceTableFit();
}

/**
 * @param {object} p
 * @param {object} p.runtimeRaceData
 * @param {() => { entries: object[], carrotsByHorse: Record<number, number>, marksByHorse: Record<number, string> } | null} p.getDraft
 * @param {() => Promise<boolean>} p.onCloseAttempt
 * @param {() => void} p.onClose
 * @param {() => void} [p.onReset]
 */
export function mountPreRaceEditor(p) {
  const { runtimeRaceData, getDraft, onCloseAttempt, onClose, onReset } = p;

  const btnClose = document.getElementById('btn-pre-race-close');
  if (!btnClose) return;

  const wireButton = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.replaceWith(el.cloneNode(true));
    document.getElementById(id)?.addEventListener('click', handler);
  };

  wireButton('btn-pre-race-close', async () => {
    closePreRaceConfirm();
    closeActiveInfoPopover();
    const proceed = await onCloseAttempt();
    if (!proceed) return;
    onClose?.();
  });

  wireButton('btn-pre-race-reset', async () => {
    closeActiveInfoPopover();
    const choice = await showPreRaceConfirm('オリジナル設定を初期状態に戻しますか？', {
      okLabel: 'はい',
      cancelLabel: 'いいえ',
    });
    if (choice !== 'apply') return;
    onReset?.();
  });

  const wrapEl = document.querySelector('.pre-race-table-wrap');
  if (wrapEl && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => schedulePreRaceTableFit());
    ro.observe(wrapEl);
  }
  window.addEventListener('resize', schedulePreRaceTableFit);
}

export { getEntryStyleBadgeClass };
