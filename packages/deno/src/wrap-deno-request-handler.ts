import type { Integration } from '@sentry/core';
import { debug, getClient, withIsolationScope } from '@sentry/core';
import { wrapServerRequestHandler } from '@sentry/server-utils/request-handler';
import type { DenoServeIntegrationOptions } from './integrations/deno-serve';

export type RequestHandlerWrapperOptions<Addr extends Deno.Addr> = {
  request: Request;
  info: Deno.ServeHandlerInfo<Addr>;
  serveOptions?: Deno.ServeOptions<Addr>;
};

export const wrapDenoRequestHandler = <Addr extends Deno.Addr = Deno.Addr>(
  wrapperOptions: RequestHandlerWrapperOptions<Addr>,
  handler: () => Promise<Response> | Response,
): Response | Promise<Response> => {
  return withIsolationScope(async isolationScope => {
    const { request, info } = wrapperOptions;

    const client = getClient();
    if (!client) {
      // `denoServeIntegration` patches `Deno.serve` from `Client.init()`, which a
      // directly-constructed client also runs — that path never calls
      // `setCurrentClient`, so the patch can be live with no client bound. Keep
      // requests flowing to the user's handler, uninstrumented.
      debug.warn('Cannot instrument Deno.serve request. No client defined.');
      return handler();
    }
    isolationScope.setClient(client);

    return wrapServerRequestHandler(
      {
        request,
        client,
        isolationScope,
        options: client.getIntegrationByName<Integration & DenoServeIntegrationOptions>('DenoServe'),
        origin: 'auto.http.deno',
        mechanism: { handled: false, type: 'auto.http.deno', data: { function: 'serve' } },
        getSocketAddress: () => {
          const remoteAddr = info?.remoteAddr as Deno.NetAddr | undefined;
          return remoteAddr?.hostname ? { address: remoteAddr.hostname, port: remoteAddr.port } : undefined;
        },
      },
      handler,
    );
  });
};
