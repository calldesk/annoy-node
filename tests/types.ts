// Type-level test of index.d.ts: compiles with `tsc --noEmit --strict`, and every
// `@ts-expect-error` line must fail to type-check. Not executed.
import Annoy = require('..');

const index = new Annoy(3, 'Angular');
index.addItem(0, [1, 2, 3]);
index.addItem(1, new Float32Array([4, 5, 6]));
index.addItem(2, Object.freeze([7, 8, 9]));
index.build(10);
const saved: boolean = index.save('/tmp/index.ann');
const loaded: boolean = new Annoy(3).load('/tmp/index.ann');
const ids: number[] = index.getNNsByVector([1, 2, 3], 2);
const withDistances: Annoy.AnnoyNeighbors = index.getNNsByVector(new Float32Array([1, 2, 3]), 2, -1, true);
const byItem: number[] = index.getNNsByItem(0, 2, 100, false);
const item: number[] = index.getItem(0);
const count: number = index.getNItems();
const distance: number = index.getDistance(0, 1);
const maybe: number[] | Annoy.AnnoyNeighbors = index.getNNsByVector([1, 2, 3], 2, -1, Math.random() > 0.5);
void [saved, loaded, ids, withDistances, byItem, item, count, distance, maybe];

// @ts-expect-error unknown metric name
new Annoy(3, 'Cosine');
// @ts-expect-error a vector is numeric
index.addItem(3, ['1', '2', '3']);
// @ts-expect-error BigInt arrays are not vectors
index.addItem(3, new BigInt64Array(3));
// @ts-expect-error without distances the result is the id list
const wrong: Annoy.AnnoyNeighbors = index.getNNsByVector([1, 2, 3], 2);
// @ts-expect-error with distances the result is an object
const wrongIds: number[] = index.getNNsByItem(0, 2, -1, true);
// @ts-expect-error a path is a string
index.load(42);
void [wrong, wrongIds];
