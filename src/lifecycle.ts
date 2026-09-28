export class ActionGate {
  private active = false;

  async run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (this.active) return undefined;
    this.active = true;
    try {
      return await action();
    } finally {
      this.active = false;
    }
  }

  get busy(): boolean { return this.active; }
}

export interface TransactionLike {
  error: unknown;
  oncomplete: ((this: any, event: Event) => unknown) | null;
  onerror: ((this: any, event: Event) => unknown) | null;
  onabort: ((this: any, event: Event) => unknown) | null;
}

export interface RequestLike<T> {
  result: T;
  error: unknown;
  onsuccess: ((this: any, event: Event) => unknown) | null;
  onerror: ((this: any, event: Event) => unknown) | null;
}

export function waitForTransaction<T>(transaction: TransactionLike, request: RequestLike<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(result!);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function completeWriteOrder(
  pendingWrites: Iterable<Promise<unknown>>,
  saveSession: () => Promise<unknown>,
  clearChunks: () => Promise<unknown>,
): Promise<void> {
  const results = await Promise.allSettled(pendingWrites);
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
  await saveSession();
  await clearChunks();
}

export async function setupRecorder(
  getStream: () => Promise<MediaStream>,
  makeRecorder: (stream: MediaStream) => MediaRecorder,
): Promise<{ stream: MediaStream; recorder: MediaRecorder }> {
  const stream = await getStream();
  try {
    return { stream, recorder: makeRecorder(stream) };
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    throw error;
  }
}
