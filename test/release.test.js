import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-intexpurespa';

test('the Unreleased section moves under the released version', () => {
  const before = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- Bubbles from the widget.',
    '',
    '## [1.0.0] - 2026-10-30',
    '',
    '- First release.',
    '',
    `[Unreleased]: ${REPO}/compare/v1.0.0...HEAD`,
    `[1.0.0]: ${REPO}/releases/tag/v1.0.0`,
    '',
  ].join('\n');
  const after = rollChangelog(before, '1.1.0', '2026-11-02');
  assert.match(after, /## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-11-02\n\n### Added/);
  assert.match(after, /\[Unreleased\]: .*\/compare\/v1\.1\.0\.\.\.HEAD/);
  assert.match(after, /\[1\.1\.0\]: .*\/compare\/v1\.0\.0\.\.\.v1\.1\.0/);
});

test('an empty Unreleased section still names the release', () => {
  const before = `# Changelog\n\n## [Unreleased]\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const after = rollChangelog(before, '1.0.0', '2026-10-30');
  assert.match(after, /## \[1\.0\.0\] - 2026-10-30\n\n- Maintenance release/);
  assert.match(after, /\[1\.0\.0\]: .*\/releases\/tag\/v1\.0\.0/);
});

test('a version already in the changelog is left alone', () => {
  const text = '## [Unreleased]\n\n## [1.0.0] - 2026-10-30\n';
  assert.equal(rollChangelog(text, '1.0.0', '2026-10-31'), text);
});
