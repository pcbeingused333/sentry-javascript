import { GEN_AI_INPUT_MESSAGES, GEN_AI_RESPONSE_TEXT } from '@sentry/conventions/attributes';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';

it('applies the options of an openAIIntegration the user configured', async ({ signal }) => {
  const runner = createRunner(__dirname).ignore('event').start(signal);

  // The segment span and the gen_ai child. The segment can arrive before the child's envelope.
  const spansPromise = runner.collectStreamedSpans(spansOfTrace => spansOfTrace.length === 2);

  await runner.makeRequest('get', '/');

  const genAiSpans = (await spansPromise).filter(span => !span.is_segment);
  expect(genAiSpans).toHaveLength(1);
  const attributes = genAiSpans[0]?.attributes;

  // The vite plugin instrumented `openai`, so the channel integration created the span.
  expect(attributes?.['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.chat' });
  expect(attributes?.['sentry.origin']).toEqual({ type: 'string', value: 'auto.ai.openai' });
  // `recordInputs: false` from the configured integration wins over `dataCollection`, which records
  // inputs by default. Outputs keep the default.
  expect(attributes?.[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
  expect(attributes?.[GEN_AI_RESPONSE_TEXT]).toEqual({ type: 'string', value: '["Hello from OpenAI!"]' });
});
