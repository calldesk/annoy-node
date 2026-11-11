/**
 * Annoy (Approximate Nearest Neighbors Oh Yeah) native N-API binding.
 *
 * Indexes are built in memory (`addItem` then `build`) or memory-mapped from a file (`load`).
 * Their memory is reported to V8, so dropped indexes are collected.
 */

declare class Annoy {
  /**
   * @param dimensions - Number of components of each vector.
   * @param metric - Distance; anything else than `Angular` or `Manhattan` is Euclidean.
   */
  constructor(dimensions: number, metric?: Annoy.AnnoyMetric);

  /** Adds (or replaces) item `index`. */
  addItem(index: number, vector: Annoy.AnnoyVector): void;

  /** Builds a forest of `trees` trees (default 1). Items cannot be added afterwards. */
  build(trees?: number): void;

  /** Saves the index to `path`, then maps it. Returns false on failure. */
  save(path: string): boolean;

  /** Memory-maps the index saved at `path`. Returns false on failure. */
  load(path: string): boolean;

  /** Frees the index (heap nodes or mapping). */
  unload(): void;

  /** Vector of item `index` (default 1). */
  getItem(index?: number): number[];

  /**
   * The `n` nearest neighbours of `vector` (at most the number of items).
   * @param searchK - Nodes to inspect (default -1: n x trees); more is slower and more precise.
   */
  getNNsByVector(vector: Annoy.AnnoyVector, n: number, searchK?: number, includeDistances?: false): number[];
  getNNsByVector(vector: Annoy.AnnoyVector, n: number, searchK: number, includeDistances: true): Annoy.AnnoyNeighbors;
  getNNsByVector(vector: Annoy.AnnoyVector, n: number, searchK?: number, includeDistances?: boolean): number[] | Annoy.AnnoyNeighbors;

  /** The `n` nearest neighbours of item `index`. */
  getNNsByItem(index: number, n: number, searchK?: number, includeDistances?: false): number[];
  getNNsByItem(index: number, n: number, searchK: number, includeDistances: true): Annoy.AnnoyNeighbors;
  getNNsByItem(index: number, n: number, searchK?: number, includeDistances?: boolean): number[] | Annoy.AnnoyNeighbors;

  /** Number of items in the index. */
  getNItems(): number;

  /** Distance between items `a` and `b`, with the index metric. */
  getDistance(a: number, b: number): number;
}

declare namespace Annoy {
  /** Distance used by the index. Any other value builds a Euclidean index. */
  export type AnnoyMetric = 'Angular' | 'Euclidean' | 'Manhattan';

  /**
   * A vector: a JS array of numbers, or a numeric typed array (read directly, without
   * per-component conversion; `Float32Array` is copied as is). Missing components are 0,
   * extra components are ignored.
   */
  export type AnnoyVector =
    | readonly number[]
    | Float32Array
    | Float64Array
    | Int8Array
    | Uint8Array
    | Uint8ClampedArray
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array;

  /** Neighbours with their distances (`includeDistances: true`). */
  export interface AnnoyNeighbors {
    neighbors: number[];
    distances: number[];
  }
}

export = Annoy;
