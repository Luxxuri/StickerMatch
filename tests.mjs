import assert from 'node:assert/strict';
import { evaluateMatch, parseHex, safeFilenameToken, solveAdaptive, solveLinear, toHex } from './color-engine.js';
import { SAVED_COLOR_MATCHES } from './saved-colors.js';

const color = value => {
  const parsed = parseHex(value);
  assert.ok(parsed, `Could not parse ${value}`);
  return parsed;
};

assert.equal(toHex(solveLinear(color('#D1C590'), color('#F9F7E5'), color('#CDC08A')).corrected), '#AC9955');
assert.equal(evaluateMatch(color('#808080'), color('#808080')).percentage, 100);
assert.equal(safeFilenameToken('Tan/Khaki', 'FFFFFF'), 'Tan_Khaki');

const first = { source: color('#CBC08A'), rendered: color('#F7F6E1'), target: color('#CBC08A') };
assert.equal(toHex(solveAdaptive([first], color('#CBC08A')).corrected), '#A69553');
const second = { source: color('#A69553'), rendered: color('#EEE7A2'), target: color('#CBC08A') };
assert.equal(toHex(solveAdaptive([first, second], color('#CBC08A')).corrected), '#706746');

assert.equal(SAVED_COLOR_MATCHES.length, 23);
assert.equal(new Set(SAVED_COLOR_MATCHES.map(match => match.name.toLowerCase())).size, SAVED_COLOR_MATCHES.length);
for (const match of SAVED_COLOR_MATCHES) {
  assert.ok(parseHex(match.targetHex), `Invalid target HEX for ${match.name}`);
  assert.ok(parseHex(match.backgroundHex), `Invalid background HEX for ${match.name}`);
}

console.log('6/6 browser tests passed.');
