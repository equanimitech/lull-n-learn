// @ts-check
/**
 * FSRS-5 (Free Spaced Repetition Scheduler), pure functions, no I/O.
 * https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 */

/** @typedef {1 | 2 | 3 | 4} Rating Again=1, Hard=2, Good=3, Easy=4 */

export const DEFAULT_WEIGHTS = Object.freeze([
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621,
]);

export const DECAY = -0.5;
export const FACTOR = 0.9 ** (1 / DECAY) - 1;
export const DESIRED_RETENTION = 0.9;

/**
 * @param {number} x
 * @param {number} lo
 * @param {number} hi
 */
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Initial difficulty after the first rating: D0(G) = w4 - e^(w5 * (G - 1)) + 1.
 * @param {Rating} rating
 * @param {readonly number[]} [w]
 * @returns {number} difficulty in [1, 10]
 */
export const initDifficulty = (rating, w = DEFAULT_WEIGHTS) =>
  clamp(w[4] - Math.exp(w[5] * (rating - 1)) + 1, 1, 10);

/**
 * Initial stability after the first rating: S0(G) = w[G-1].
 * @param {Rating} rating
 * @param {readonly number[]} [w]
 * @returns {number} stability in days, min 0.1
 */
export const initStability = (rating, w = DEFAULT_WEIGHTS) =>
  Math.max(w[rating - 1], 0.1);

/**
 * Probability of recall after elapsedDays given stability.
 * @param {number} elapsedDays
 * @param {number} stability
 * @returns {number} in (0, 1]
 */
export const retrievability = (elapsedDays, stability) =>
  (1 + (FACTOR * elapsedDays) / stability) ** DECAY;

/**
 * Days until retrievability decays to the desired retention.
 * I(r, S) = (S / FACTOR) * (r^(1/DECAY) - 1); reduces to S at r = 0.9.
 * @param {number} stability
 * @param {number} [retention]
 * @returns {number} whole days, min 1
 */
export const nextInterval = (stability, retention = DESIRED_RETENTION) =>
  Math.max(1, Math.round((stability / FACTOR) * (retention ** (1 / DECAY) - 1)));

/**
 * Mean reversion toward D0(Easy): w7 * D0(4) + (1 - w7) * d.
 * @param {number} d
 * @param {readonly number[]} w
 */
const meanRevert = (d, w) => w[7] * initDifficulty(4, w) + (1 - w[7]) * d;

/**
 * Difficulty after a review: D' = meanRevert(D - w6 * (G - 3)), clamped [1, 10].
 * @param {number} d current difficulty
 * @param {Rating} rating
 * @param {readonly number[]} [w]
 * @returns {number}
 */
export const nextDifficulty = (d, rating, w = DEFAULT_WEIGHTS) =>
  clamp(meanRevert(d - w[6] * (rating - 3), w), 1, 10);

/**
 * Stability after a successful review (Hard, Good, or Easy).
 * @param {number} d difficulty
 * @param {number} s current stability
 * @param {number} r retrievability at review time
 * @param {Rating} rating 2, 3, or 4
 * @param {readonly number[]} [w]
 * @returns {number}
 */
export const stabilityAfterSuccess = (d, s, r, rating, w = DEFAULT_WEIGHTS) => {
  const hardPenalty = rating === 2 ? w[15] : 1;
  const easyBonus = rating === 4 ? w[16] : 1;
  return (
    s *
    (Math.exp(w[8]) *
      (11 - d) *
      s ** -w[9] *
      (Math.exp(w[10] * (1 - r)) - 1) *
      hardPenalty *
      easyBonus +
      1)
  );
};

/**
 * Stability after a lapse (Again). Never exceeds the pre-lapse stability,
 * never drops below 0.1.
 * @param {number} d difficulty
 * @param {number} s current stability
 * @param {number} r retrievability at review time
 * @param {readonly number[]} [w]
 * @returns {number}
 */
export const stabilityAfterLapse = (d, s, r, w = DEFAULT_WEIGHTS) =>
  Math.max(
    0.1,
    Math.min(
      w[11] * d ** -w[12] * ((s + 1) ** w[13] - 1) * Math.exp(w[14] * (1 - r)),
      s,
    ),
  );

// --- Card-state transitions ---

const DAY_MS = 24 * 60 * 60 * 1000;
const LAPSE_REQUEUE_MS = 10 * 60 * 1000;

/**
 * @typedef {Object} FsrsState
 * @property {number} difficulty 1..10
 * @property {number} stability days
 * @property {number} reps completed reviews
 * @property {number} lapses times forgotten after being learned
 * @property {string} due ISO8601
 * @property {string | null} lastReview ISO8601, null before the first review
 */

/**
 * State for a card that has never been reviewed. Due immediately; the
 * placeholder difficulty/stability are replaced at the first review.
 * @param {Date} [now]
 * @returns {FsrsState}
 */
export const newCardState = (now = new Date()) => ({
  difficulty: 5.0,
  stability: 1.0,
  reps: 0,
  lapses: 0,
  due: now.toISOString(),
  lastReview: null,
});

/**
 * Apply one review. Pure: returns a new state, never mutates the input.
 * @param {FsrsState} state
 * @param {Rating} rating
 * @param {Date} [now]
 * @returns {FsrsState}
 */
export function review(state, rating, now = new Date()) {
  if (![1, 2, 3, 4].includes(rating)) {
    throw new RangeError(`rating must be 1..4, got ${rating}`);
  }
  const isFirst = state.lastReview === null;
  let difficulty;
  let stability;
  let lapses = state.lapses;

  if (isFirst) {
    difficulty = initDifficulty(rating);
    stability = initStability(rating);
  } else {
    const elapsedDays = Math.max(
      0,
      (now.getTime() - new Date(/** @type {string} */ (state.lastReview)).getTime()) / DAY_MS,
    );
    const r = retrievability(elapsedDays, state.stability);
    difficulty = nextDifficulty(state.difficulty, rating);
    if (rating === 1) {
      stability = stabilityAfterLapse(state.difficulty, state.stability, r);
      lapses += 1;
    } else {
      stability = stabilityAfterSuccess(state.difficulty, state.stability, r, rating);
    }
  }

  const dueMs =
    rating === 1 ? LAPSE_REQUEUE_MS : nextInterval(stability) * DAY_MS;

  return {
    difficulty,
    stability,
    reps: state.reps + 1,
    lapses,
    due: new Date(now.getTime() + dueMs).toISOString(),
    lastReview: now.toISOString(),
  };
}
