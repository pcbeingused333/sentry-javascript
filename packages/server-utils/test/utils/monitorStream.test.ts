import { describe, expect, it, vi } from 'vitest';
import { monitorStream } from '../../src/utils/monitorStream';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('monitorStream', () => {
  it('passes the chunks through and calls onDone when the source closes', async () => {
    const onDone = vi.fn();
    const onError = vi.fn();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('a'));
        controller.enqueue(encode('b'));
        controller.close();
      },
    });

    const text = await new Response(monitorStream(source, onDone, onError)).text();

    expect(text).toBe('ab');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reads from the source only when the consumer pulls', async () => {
    let pulls = 0;
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls++;
          controller.enqueue(encode(String(pulls)));
        },
      },
      { highWaterMark: 0 },
    );

    const reader = monitorStream(source, vi.fn(), vi.fn()).getReader();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(pulls).toBe(0);

    await reader.read();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(pulls).toBe(1);
    await reader.cancel();
  });

  it('cancels the source when the consumer cancels, without reporting an error', async () => {
    let sourceCancelReason: unknown;
    const onDone = vi.fn();
    const onError = vi.fn();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('first event'));
      },
      cancel(reason) {
        sourceCancelReason = reason;
      },
    });
    const reader = monitorStream(source, onDone, onError).getReader();
    const reason = new Error('client disconnected');

    await reader.read();
    await reader.cancel(reason);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(sourceCancelReason).toBe(reason);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a source error and calls onDone, without an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const onDone = vi.fn();
    const onError = vi.fn();
    const error = new Error('source failed');
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });

    try {
      const response = new Response(monitorStream(source, onDone, onError));
      const text = response.text();
      controller!.error(error);

      await expect(text).rejects.toBe(error);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(onError).toHaveBeenCalledWith(error);
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
