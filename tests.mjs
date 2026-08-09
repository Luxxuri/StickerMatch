import assert from 'node:assert/strict';
import { evaluateMatch, parseHex, safeFilenameToken, solveAdaptive, solveLinear, toHex } from './color-engine.js';

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

console.log('5/5 browser color-engine tests passed.');
