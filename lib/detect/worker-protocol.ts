export type WorkerRequest =
  | { type: "load" }
  | { type: "score"; id: number; windows: string[] };

export type WorkerResponse =
  | { type: "progress"; loaded: number; total: number }
  | { type: "loaded"; threads: number }
  | { type: "scoring"; id: number; done: number; total: number }
  | { type: "scores"; id: number; scores: number[] }
  | { type: "error"; id?: number; message: string };
