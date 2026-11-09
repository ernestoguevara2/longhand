import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

export type LoadProgress = { loaded: number; total: number };

type PendingScore = {
  resolve: (scores: number[]) => void;
  reject: (error: Error) => void;
  onProgress?: (done: number, total: number) => void;
};

/** Small promise wrapper around the classifier worker. Browser only. */
export class ClassifierClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private loading: Promise<void> | null = null;
  private pending = new Map<number, PendingScore>();
  private onLoadProgress?: (progress: LoadProgress) => void;
  private rejectLoad?: (error: Error) => void;
  private resolveLoad?: () => void;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("../../workers/detector.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handle(event.data);
    worker.onerror = (event) =>
      this.fail(new Error(event.message || "The scanner stopped unexpectedly."));
    this.worker = worker;
    return worker;
  }

  private handle(message: WorkerResponse) {
    switch (message.type) {
      case "progress":
        this.onLoadProgress?.({ loaded: message.loaded, total: message.total });
        break;
      case "loaded":
        this.resolveLoad?.();
        break;
      case "scoring":
        this.pending.get(message.id)?.onProgress?.(message.done, message.total);
        break;
      case "scores":
        this.pending.get(message.id)?.resolve(message.scores);
        this.pending.delete(message.id);
        break;
      case "error": {
        const error = new Error(message.message);
        if (message.id !== undefined) {
          this.pending.get(message.id)?.reject(error);
          this.pending.delete(message.id);
        } else {
          this.fail(error);
        }
        break;
      }
    }
  }

  private fail(error: Error) {
    this.rejectLoad?.(error);
    this.loading = null;
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  load(onProgress?: (progress: LoadProgress) => void): Promise<void> {
    if (onProgress) this.onLoadProgress = onProgress;
    this.loading ??= new Promise<void>((resolve, reject) => {
      this.resolveLoad = resolve;
      this.rejectLoad = reject;
      const request: WorkerRequest = { type: "load" };
      this.ensureWorker().postMessage(request);
    });
    return this.loading;
  }

  async score(
    windows: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<number[]> {
    await this.load();
    const id = this.nextId++;
    return new Promise<number[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      const request: WorkerRequest = { type: "score", id, windows };
      this.ensureWorker().postMessage(request);
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.loading = null;
  }
}
