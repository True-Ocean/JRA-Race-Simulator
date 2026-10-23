import { describe, expect, it } from 'vitest';
import { formatRaceInfo } from '../src/stats/race-display.js';

describe('formatRaceInfo', () => {
  it('escapes race data before embedding it in HTML', () => {
    const payload = '<img src=x onerror="alert(1)">';
    const html = formatRaceInfo({ race_info: {
      date: payload, venue: payload, race_name: payload,
    } });

    expect(html).not.toContain(payload);
    expect(html.match(/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/g)).toHaveLength(3);
  });
});
