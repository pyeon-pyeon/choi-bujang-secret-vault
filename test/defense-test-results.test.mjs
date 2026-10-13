import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeDefenseTests, readDefenseTestResults } from '../src/defense-test-results.mjs';

const catalog = { schema: 'vault.defense-catalog.v1', sourceUrl: 'https://fixture.invalid/catalog', tests: [
  { attackId: 'fixture_attack', step: 12, expected: '자료 없이 거부' },
  { attackId: 'fixture_normal', step: 12, expected: '정상 허용' },
] };

test('제공 41종의 각 행이 미실행이고 막음·허용·통과로 합산되지 않음', () => {
  const source = JSON.parse(readFileSync(new URL('../operations/defense-catalog.json', import.meta.url), 'utf8'));
  const summary = readDefenseTestResults();
  assert.equal(source.tests.length, 41);
  assert.equal(summary.expectedTestCount, source.tests.length);
  assert.deepEqual(summary.records.map(row => row.attackId), source.tests.map(row => row.attackId));
  assert.equal(summary.notRun, summary.records.length);
  assert.equal(summary.executed, 0);
  assert.equal(summary.blocked, 0);
  assert.equal(summary.allowed, 0);
  assert.equal(summary.passed, 0);
  assert.ok(summary.records.every(row => row.actual === null && row.requestId === null && row.checkedAt === null));
});

test('미실행에 block·pass 표시를 끼워도 무시하고 실제 결과만 집계', () => {
  const saved = { schema: 'vault.defense-test-records.v1', records: [
    { attackId: 'fixture_attack', status: 'not_run', outcome: 'blocked', assertionPassed: true,
      actual: { httpStatus: 401, dataReturned: false, body: 'synthetic-private-body' } },
    { attackId: 'fixture_normal', status: 'executed', outcome: 'allowed', assertionPassed: true,
      actual: { httpStatus: 200, dataReturned: true, body: 'synthetic-private-body' },
      requestId: 'server-fixture-0001', checkedAt: '2026-10-13T00:00:00.000Z' },
  ] };
  const summary = summarizeDefenseTests(catalog, saved);
  assert.equal(summary.notRun, 1); assert.equal(summary.executed, 1);
  assert.equal(summary.blocked, 0); assert.equal(summary.allowed, 1); assert.equal(summary.passed, 1);
  assert.equal(summary.records[0].outcome, 'not_run');
  assert.equal(summary.records[0].assertionPassed, null);
  assert(!JSON.stringify(summary).includes('synthetic-private'));
  saved.records[0] = { attackId: 'fixture_attack', status: 'executed', outcome: 'blocked',
    assertionPassed: true, actual: { httpStatus: 403, dataReturned: false },
    requestId: 'server-fixture-0002', checkedAt: '2026-10-13T00:00:01.000Z' };
  assert.equal(summarizeDefenseTests(catalog, saved).blocked, 1);
  saved.records[0].actual = { httpStatus: 500, dataReturned: false };
  assert.equal(summarizeDefenseTests(catalog, saved).blocked, 0);
  saved.records[0].actual = { httpStatus: 403, dataReturned: true };
  assert.equal(summarizeDefenseTests(catalog, saved).blocked, 0);
});

test('기대 거부 문구·중복·증거 누락만으로는 차단이나 통과를 만들지 않음', () => {
  const row = { attackId: 'fixture_attack', status: 'executed', outcome: 'blocked', assertionPassed: true,
    actual: { httpStatus: 403, dataReturned: false } };
  const invalid = summarizeDefenseTests(catalog, { schema: 'vault.defense-test-records.v1', records: [row, row] });
  assert.equal(invalid.notRun, 2); assert.equal(invalid.passed, 0); assert.equal(invalid.blocked, 0);
  assert.equal(summarizeDefenseTests(catalog, null).notRun, 2);
});
