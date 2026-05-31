import { describe, it, expect } from 'vitest';
import { buildBattleLogLine, getBattleTypeLabel, isBattleLogLine } from '../src/engine/battle-log.js';
import { formatLogLineHtml, getBattleLogClass } from '../src/ui/race-log.js';

describe('buildBattleLogLine', () => {
  it('2行形式で勝者・敗者の馬名を出力する', () => {
    const line = buildBattleLogLine('進路争い', { gate: 17, name: 'ロブチェン' }, { gate: 2, name: 'マテンロウゲイル' });
    expect(line).toBe('[バトル：進路争い]\n⭕️ロブチェン vs ❌マテンロウゲイル');
    expect(getBattleTypeLabel(line)).toBe('進路争い');
    expect(isBattleLogLine(line)).toBe(true);
  });
});

describe('formatLogLineHtml battle', () => {
  it('タグと対戦行を改行で分け、枠色バッジ付きで表示する', () => {
    const meta = new Map([
      ['馬A', { gate: 1, waku: 1 }],
      ['馬B', { gate: 2, waku: 2 }],
    ]);
    const line = buildBattleLogLine('進路争い', { name: '馬A' }, { name: '馬B' });
    const html = formatLogLineHtml(line, meta);
    expect(html).toContain('[バトル：進路争い]');
    expect(html).toContain('<br>');
    expect(html).toContain('horse-badge');
    expect(html).toContain('⭕️');
    expect(html).toContain('❌');
    expect(html).toContain('horse-name');
    expect(html).toContain('馬A');
    expect(html).toContain('馬B');
    expect(getBattleLogClass(line)).toContain('battle-lane');
  });

  it('対戦行は battle-side で縦位置中央揃えの markup を出力する', () => {
    const meta = new Map([
      ['馬A', { gate: 1, waku: 1 }],
      ['馬B', { gate: 2, waku: 2 }],
    ]);
    const line = buildBattleLogLine('進路争い', { name: '馬A' }, { name: '馬B' });
    const html = formatLogLineHtml(line, meta);
    expect(html).toContain('class="battle-side"');
    expect(html).toContain('class="battle-icon"');
    expect(html).toContain('class="battle-vs"');
  });
});

describe('formatLogLineHtml irregular start', () => {
  it('出遅れログはタグと枠色バッジ付き馬名のみ表示する', () => {
    const meta = new Map([['ロブチェン', { gate: 17, waku: 8 }]]);
    const html = formatLogLineHtml('[出遅れ] ロブチェン', meta);
    expect(html).toContain('[出遅れ]');
    expect(html).toContain('horse-badge');
    expect(html).toContain('ロブチェン');
    expect(html).not.toContain('スタートで遅れる');
  });

  it('旧形式の叙述付きログも馬番バッジと馬名だけに整形する', () => {
    const meta = new Map([['ロブチェン', { gate: 17, waku: 8 }]]);
    const html = formatLogLineHtml('[出遅れ] ロブチェン がスタートで遅れる（-25%）', meta);
    expect(html).toContain('horse-badge');
    expect(html).toContain('>17<');
    expect(html).not.toContain('-25%');
  });
});
