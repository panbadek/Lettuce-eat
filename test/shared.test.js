import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert, totals, parseAmount, round1 } from '../public/shared/food.js';
import { gridFromSlots, isValidSlot, timesBetween } from '../public/shared/slots.js';

const r = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round1(v)]));

test('1 hot dog = 4 toast halves = 3 pizza slices', () => {
  assert.deepEqual(convert(1, 'hotdog'), { toast: 4, hotdog: 1, pizza: 3 });
  assert.deepEqual(r(convert(4, 'toast')), { toast: 4, hotdog: 1, pizza: 3 });
  assert.deepEqual(r(convert(3, 'pizza')), { toast: 4, hotdog: 1, pizza: 3 });
  assert.deepEqual(r(convert(2, 'pizza')), { toast: 2.7, hotdog: 0.7, pizza: 2 });
});

test('totals sum mixed units', () => {
  const sum = totals([
    { amount: 2, unit: 'toast' }, // 0.5 hd
    { amount: 1.5, unit: 'hotdog' }, // 1.5 hd
    { amount: 3, unit: 'pizza' }, // 1 hd
  ]);
  assert.deepEqual(r(sum), { toast: 12, hotdog: 3, pizza: 9 });
  assert.deepEqual(totals([]), { toast: 0, hotdog: 0, pizza: 0 });
});

test('parseAmount accepts Polish decimal comma and rounds to 1 decimal', () => {
  assert.equal(parseAmount('2,5'), 2.5);
  assert.equal(parseAmount(' 3 '), 3);
  assert.equal(parseAmount('1.25'), 1.3);
  assert.equal(parseAmount(0.15), 0.2);
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('-1')));
  assert.ok(Number.isNaN(parseAmount(null)));
});

test('slot helpers', () => {
  assert.ok(isValidSlot('2030-12-31T23:30'));
  assert.ok(!isValidSlot('2030-12-31T23:45'));
  assert.ok(!isValidSlot('2030-02-29T10:00'));
  assert.ok(isValidSlot('2028-02-29T10:00'));
  assert.deepEqual(timesBetween('09:00', '10:30'), ['09:00', '09:30', '10:00']);
  assert.deepEqual(timesBetween('23:00', '24:00'), ['23:00', '23:30']);
  assert.deepEqual(gridFromSlots(['2030-01-02T11:00', '2030-01-01T09:00']), {
    dates: ['2030-01-01', '2030-01-02'],
    times: ['09:00', '09:30', '10:00', '10:30', '11:00'],
  });
});
