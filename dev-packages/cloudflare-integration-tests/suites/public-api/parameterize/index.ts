import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
  }),
  {
    async fetch(_request, _env, _ctx) {
      const userId = 42;
      Sentry.captureMessage(Sentry.parameterize`User ${userId} logged in`);
      return new Response('ok');
    },
  },
);
