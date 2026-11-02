import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { engines?: { node?: string } };

function minimumVersion(range: string): [number, number] {
  const match = /^>=\s*(\d+)\.(\d+)/.exec(range);
  assert.ok(match, `engines.node must be a ">=major.minor" range, got "${range}"`);
  return [Number(match[1]), Number(match[2])];
}

describe('Node toolchain requirement', () => {
  it('declares a Node range that supports the built-in TypeScript the tests rely on (22.6+)', () => {
    const range = pkg.engines?.node;
    assert.ok(range, 'package.json must declare engines.node');
    const [major, minor] = minimumVersion(range);
    assert.ok(major > 22 || (major === 22 && minor >= 6), `engines.node ${range} must be at least 22.6`);
  });

  it('is satisfied by the Node running these tests', () => {
    const [major, minor] = minimumVersion(pkg.engines!.node!);
    const [runMajor, runMinor] = process.versions.node.split('.').map(Number);
    assert.ok(runMajor > major || (runMajor === major && runMinor >= minor), `running ${process.versions.node}`);
  });

  it('keeps .nvmrc and every CI workflow on the same Node major', () => {
    const nvmrcMajor = Number(readFileSync(resolve(root, '.nvmrc'), 'utf8').trim().split('.')[0]);
    assert.ok(Number.isInteger(nvmrcMajor), '.nvmrc must start with a major version');
    const dir = resolve(root, '.github/workflows');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.yml'))) {
      for (const [, version] of readFileSync(resolve(dir, file), 'utf8').matchAll(/node-version:\s*['"]?(\d+)/g)) {
        assert.equal(Number(version), nvmrcMajor, `${file} uses Node ${version}, .nvmrc says ${nvmrcMajor}`);
      }
    }
  });
});
