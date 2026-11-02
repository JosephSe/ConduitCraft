/** Web Worker entry: encodes GIF frames off the main thread so the UI stays responsive. */
import { encodeGif } from './gif';

type EncodeOptions = Parameters<typeof encodeGif>[0];

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<EncodeOptions>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = (event) => {
  try {
    const bytes = encodeGif(event.data);
    scope.postMessage({ ok: true, bytes }, [bytes.buffer]);
  } catch (error) {
    scope.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
