// ローカルでは常時記録し、debug=flicker のときだけ診断パネルを表示する。
const STORAGE_KEY = 'jra-display-diagnostics-v1';
const MAX_EVENTS = 200;
let activeTrace = null;
let flushActiveTrace = null;

export function isLocalDisplayDiagnostics(location) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location?.hostname);
}

export function shouldShowDisplayDiagnostics(location) {
  return isLocalDisplayDiagnostics(location)
    && new URLSearchParams(location.search).get('debug') === 'flicker';
}

export function createDisplayTrace(previous = null, now = () => new Date().toISOString()) {
  const events = Array.isArray(previous?.events) ? previous.events.slice(-MAX_EVENTS) : [];
  const page = (Number.isSafeInteger(previous?.page) ? previous.page : 0) + 1;
  const counts = {};
  return {
    record(type, detail = {}) {
      counts[type] = (counts[type] ?? 0) + 1;
      // レース中は毎フレーム呼ばれるため、描画は件数のみ。逐次ログ・DOM 更新は禁止。
      if (type === 'draw') return;
      events.push({ time: now(), page, type, detail, draws: counts.draw ?? 0 });
      if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    },
    snapshot() {
      return { page, counts: { ...counts }, events: [...events] };
    },
  };
}

export function createDisplayDiagnosticView(snapshot, recentLimit = 30) {
  return {
    page: snapshot.page,
    counts: snapshot.counts,
    recentEvents: snapshot.events.slice(-recentLimit).reverse(),
  };
}

export function recordDisplayDiagnostic(type, detail) {
  if (!activeTrace) return;
  activeTrace.record(type, detail);
  if (type !== 'draw') flushActiveTrace?.();
}

/** Go Live の通知を読み取り専用で記録する。元の自動更新・WebSocketは変更しない。 */
export function observeLiveReload(win, doc, record) {
  if (!isLocalDisplayDiagnostics(win?.location) || typeof win.WebSocket !== 'function') return null;
  const injected = Array.from(doc.scripts ?? []).some(script =>
    script.textContent?.includes('Live reload enabled.'),
  );
  if (!injected) return null;
  try {
    const protocol = win.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new win.WebSocket(`${protocol}//${win.location.host}${win.location.pathname}/ws`);
    socket.addEventListener('message', event => {
      if (event.data === 'reload' || event.data === 'refreshcss') {
        record('live-server-message', { message: event.data });
      }
    });
    socket.addEventListener('error', () => record('live-server-observer-error'));
    return socket;
  } catch {
    record('live-server-observer-error');
    return null;
  }
}

export function startDisplayDiagnostics() {
  if (typeof window === 'undefined' || !isLocalDisplayDiagnostics(window.location) || activeTrace) return;
  let previous = null;
  try {
    previous = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
  } catch { /* ストレージ利用不可でもメモリー内で記録する */ }
  activeTrace = createDisplayTrace(previous);
  const flush = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(activeTrace.snapshot()));
    } catch { /* レース結果の保存を優先し、容量不足では診断を永続化しない */ }
  };
  flushActiveTrace = flush;
  const viewport = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio,
  });
  const record = (type, detail = {}) => recordDisplayDiagnostic(type, detail);
  observeLiveReload(window, document, record);
  record('boot', {
    navigation: performance.getEntriesByType('navigation')[0]?.type ?? 'unknown',
    visibility: document.visibilityState,
    ...viewport(),
  });
  flush();
  window.addEventListener('pageshow', event => record('pageshow', { persisted: event.persisted }));
  window.addEventListener('beforeunload', () => record('beforeunload'));
  window.addEventListener('pagehide', event => {
    record('pagehide', { persisted: event.persisted });
    flush();
  });
  document.addEventListener('visibilitychange', () => {
    record('visibility', { state: document.visibilityState });
    flush();
  });
  for (const type of ['focus', 'blur']) window.addEventListener(type, () => record(type));
  window.addEventListener('resize', () => record('window-resize', viewport()));
  window.visualViewport?.addEventListener('resize', () => record('visual-viewport-resize', viewport()));
  // 入力内容は保存しない。アプリ自身に Return が届いたかだけ確認する。
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter') record('enter', { repeat: event.repeat, composing: event.isComposing });
  });
  window.addEventListener('error', event => record('error', { message: event.message }));
  const canvas = document.getElementById('field-canvas');
  for (const type of ['contextlost', 'contextrestored']) {
    canvas?.addEventListener(type, () => record(type));
  }

  if (!shouldShowDisplayDiagnostics(window.location)) return;

  const panel = document.createElement('details');
  panel.id = 'display-diagnostics';
  panel.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:10000;max-width:calc(100vw - 16px);background:#182433;color:#fff;padding:8px;border:1px solid #8796a5;border-radius:4px;font:12px monospace;text-align:left;';
  const summary = document.createElement('summary');
  summary.textContent = '画面診断（ローカル専用）';
  const update = document.createElement('button');
  update.type = 'button';
  update.textContent = '診断記録を表示・更新';
  const output = document.createElement('pre');
  output.style.cssText = 'max-height:45vh;max-width:650px;overflow:auto;white-space:pre-wrap;word-break:break-word;';
  update.addEventListener('click', () => {
    flush();
    output.textContent = JSON.stringify(createDisplayDiagnosticView(activeTrace.snapshot()), null, 2);
  });
  panel.append(summary, update, output);
  document.body.appendChild(panel);
}
