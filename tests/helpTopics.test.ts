import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { guideUrl, HELP_TOPICS, helpTopic, slugify } from '../src/core/helpTopics.ts';

const guide = readFileSync(new URL('../docs/guide.md', import.meta.url), 'utf8');
const headings = new Set(
  guide
    .split('\n')
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => slugify(line.replace(/^#{1,6}\s+/, ''))),
);

describe('help topics', () => {
  it('imports with no DOM globals', () => {
    assert.equal(typeof (globalThis as { document?: unknown }).document, 'undefined');
    assert.ok(HELP_TOPICS.length > 0);
  });

  it('has unique ids and complete entries', () => {
    assert.equal(new Set(HELP_TOPICS.map((t) => t.id)).size, HELP_TOPICS.length);
    for (const topic of HELP_TOPICS) {
      assert.ok(topic.title.trim(), `${topic.id} has a title`);
      assert.ok(topic.body.trim(), `${topic.id} has a body`);
      assert.equal(helpTopic(topic.id), topic);
    }
  });

  it('keeps each body to two or three sentences', () => {
    for (const topic of HELP_TOPICS) {
      const sentences = topic.body.split(/(?<=[.!?])\s+/).filter(Boolean).length;
      assert.ok(sentences >= 2 && sentences <= 3, `${topic.id} has ${sentences} sentences`);
    }
  });

  it('points every guideAnchor at a heading that exists in docs/guide.md', () => {
    for (const topic of HELP_TOPICS) {
      assert.ok(headings.has(topic.guideAnchor), `#${topic.guideAnchor} is missing from docs/guide.md (topic ${topic.id})`);
    }
  });

  it('builds a link to the guide on GitHub', () => {
    assert.match(guideUrl({ guideAnchor: 'lenses' }), /^https:\/\/github\.com\/.+\/docs\/guide\.md#lenses$/);
  });

  it('slugs headings the way GitHub does', () => {
    assert.equal(slugify('Traffic and scenarios'), 'traffic-and-scenarios');
    assert.equal(slugify('Review & Status'), 'review--status');
  });

  it('covers every insight rule in the guide', async () => {
    const { INSIGHT_RULES } = await import('../src/core/insights.ts');
    for (const rule of INSIGHT_RULES) assert.ok(guide.includes(`| ${rule.title} |`), `guide explains "${rule.title}"`);
  });

  it('no longer uses the old name Blueprint Markdown', () => {
    assert.ok(!/Blueprint Markdown/i.test(guide));
  });
});
