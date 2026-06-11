// Deterministic train/test splitting using a seeded Fisher-Yates shuffle.
// Determinism is per-session: same seed + same pool ⇒ same split.

export interface SplitConfig {
  name: string;
  trainSize: number;
  testSize: number;
}

export interface SplitResult {
  config: SplitConfig;
  trainIds: number[];
  testIds: number[];
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  // Mulberry32 - small, fast, deterministic.
  let s = seed >>> 0;
  const rand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function generateSplits(
  imageIds: number[],
  configs: SplitConfig[],
  seed = 42,
): SplitResult[] {
  if (configs.length === 0) return [];

  const testSizes = new Set(configs.map((c) => c.testSize));
  if (testSizes.size > 1) {
    throw new Error(
      `All splits must share the same test size; got ${Array.from(testSizes).join(', ')}.`,
    );
  }
  const testSize = [...testSizes][0];

  const maxTrain = Math.max(...configs.map((c) => c.trainSize));
  const totalNeeded = maxTrain + testSize;
  if (totalNeeded > imageIds.length) {
    throw new Error(
      `Need ${totalNeeded} images (max train ${maxTrain} + test ${testSize}), but only ${imageIds.length} available.`,
    );
  }

  const sortedConfigs = [...configs].sort((a, b) => a.trainSize - b.trainSize);
  const shuffled = seededShuffle(imageIds, seed);
  const testIds = shuffled.slice(0, testSize);
  const remaining = shuffled.slice(testSize);

  return sortedConfigs.map((config) => ({
    config,
    trainIds: remaining.slice(0, config.trainSize),
    testIds,
  }));
}
