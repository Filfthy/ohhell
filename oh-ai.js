// ===== AI engine: OhHellAIEngine =====
//
// easy / medium: a rule-based player (moves are scored, then picked with a
//                difficulty profile so weaker players sometimes misplay).
// hard:          look-ahead player. For each decision it deals many plausible
//                versions of the hidden hands (respecting known voids and how
//                well each hand fits its owner's bid), plays every option out
//                to the end of the round with the rule-based player, and picks
//                the option with the best average result.

(function (global) {
  "use strict";

  const SUIT_LIST = ["♠", "♥", "♦", "♣"];
  const SUIT_IDX = { "♠": 0, "♥": 1, "♦": 2, "♣": 3 };
  // 0..51 normal cards; 52..59 specials (2 Jokers, 4 Dragons, Sun, Moon).
  const SPECIAL_BASE = { JOKER: 52, DRAGON: 54, SUN: 58, MOON: 59 };
  const DECK_IDS = 60;
  const cardId = c => c.isSpecial ? SPECIAL_BASE[c.role] + c.copy : SUIT_IDX[c.suit] * 13 + c.value - 2;
  const winnerIdx = (cards, trumpSuit) => trickWinnerIndex(cards, trumpSuit);

  // Expected tricks per card, fitted from simulated games.
  // [players][handSizeBucket: 1-2 | 3-5 | 6+] = 13 trump ranks (2..A), 13 side ranks (2..A),
  // side void with trumps, side singleton with trumps, extra trump length.

  const BID_WEIGHTS = {
    2: [
      [0.574, 0.67, 0.694, 0.771, 0.712, 0.855, 0.934, 0.86, 1.034, 0.995, 1.017, 1.061, 1.096, 0.102, 0.186, 0.226, 0.225, 0.259, 0.294, 0.341, 0.404, 0.388, 0.405, 0.436, 0.486, 0.555, 0.021, 0.2, 0],
      [0.889, 0.884, 0.903, 0.965, 0.908, 1.034, 1.071, 1.105, 1.067, 1.181, 1.275, 1.339, 1.402, 0.023, 0.052, 0.095, 0.126, 0.199, 0.255, 0.323, 0.39, 0.406, 0.48, 0.528, 0.605, 0.748, 0.052, -0.046, -0.361],
      [0.897, 0.914, 0.937, 0.956, 0.955, 0.975, 1.016, 1.079, 1.153, 1.177, 1.28, 1.33, 1.404, -0.049, -0.035, 0.033, 0.105, 0.161, 0.207, 0.302, 0.359, 0.456, 0.572, 0.622, 0.694, 0.775, 0.076, -0.05, -0.014]
    ],
    3: [
      [0.633, 0.669, 0.646, 0.717, 0.707, 0.759, 0.867, 0.913, 0.975, 1.018, 1.133, 1.246, 1.245, -0.001, 0.006, 0.063, 0.086, 0.088, 0.136, 0.154, 0.173, 0.233, 0.224, 0.231, 0.28, 0.366, -0.027, 0.086, 0],
      [0.723, 0.736, 0.784, 0.806, 0.864, 0.87, 0.922, 0.963, 1.005, 1.057, 1.175, 1.279, 1.418, -0.108, -0.072, -0.031, -0.003, 0.051, 0.074, 0.118, 0.17, 0.212, 0.261, 0.346, 0.449, 0.591, -0.021, -0.067, 0.018],
      [0.638, 0.625, 0.682, 0.678, 0.733, 0.739, 0.797, 0.861, 0.933, 1.019, 1.088, 1.224, 1.37, -0.117, -0.08, -0.086, -0.051, -0.014, 0.035, 0.082, 0.148, 0.246, 0.311, 0.413, 0.563, 0.717, 0.013, -0.067, 0.242]
    ],
    4: [
      [0.487, 0.537, 0.565, 0.635, 0.666, 0.698, 0.778, 0.824, 0.837, 1.027, 1.076, 1.127, 1.233, -0.039, -0.021, -0.009, 0.013, 0.034, 0.067, 0.084, 0.098, 0.133, 0.159, 0.18, 0.219, 0.221, -0.034, 0.05, 0],
      [0.574, 0.601, 0.628, 0.685, 0.73, 0.744, 0.832, 0.841, 0.907, 0.952, 1.064, 1.2, 1.365, -0.085, -0.082, -0.067, -0.06, -0.028, 0.005, 0.041, 0.08, 0.112, 0.169, 0.237, 0.31, 0.483, -0.038, -0.05, 0.197],
      [0.507, 0.517, 0.532, 0.556, 0.603, 0.642, 0.699, 0.77, 0.838, 0.914, 1.02, 1.144, 1.319, -0.106, -0.098, -0.094, -0.088, -0.061, -0.047, -0.015, 0.017, 0.086, 0.154, 0.257, 0.414, 0.695, 0.007, -0.052, 0.277]
    ],
    5: [
      [0.356, 0.427, 0.463, 0.475, 0.56, 0.582, 0.618, 0.692, 0.848, 0.898, 0.994, 1.119, 1.201, -0.035, -0.019, -0.015, -0.004, 0.007, 0.017, 0.033, 0.074, 0.087, 0.09, 0.122, 0.146, 0.162, -0.02, 0.004, 0],
      [0.464, 0.514, 0.558, 0.578, 0.621, 0.706, 0.767, 0.826, 0.866, 0.929, 1.035, 1.136, 1.317, -0.084, -0.06, -0.069, -0.052, -0.045, -0.022, -0.02, 0.028, 0.069, 0.096, 0.145, 0.225, 0.373, -0.059, -0.06, 0.3],
      [0.401, 0.398, 0.432, 0.457, 0.512, 0.54, 0.597, 0.665, 0.767, 0.859, 0.955, 1.09, 1.268, -0.083, -0.09, -0.085, -0.084, -0.081, -0.067, -0.053, -0.033, 0.004, 0.054, 0.146, 0.279, 0.653, 0.032, -0.037, 0.354]
    ]
  };
  // Same, for no-trump rounds (only the side-rank columns matter).
  const BID_WEIGHTS_NT = {
    2: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.193, 0.331, 0.397, 0.405, 0.477, 0.49, 0.507, 0.505, 0.535, 0.59, 0.637, 0.683, 0.741, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.076, 0.151, 0.203, 0.288, 0.376, 0.438, 0.449, 0.569, 0.598, 0.663, 0.766, 0.883, 1.026, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.038, 0.051, 0.115, 0.233, 0.367, 0.432, 0.541, 0.619, 0.704, 0.792, 0.881, 0.888, 0.916, 0, 0, 0]
    ],
    3: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.017, 0.101, 0.156, 0.237, 0.236, 0.306, 0.309, 0.397, 0.425, 0.444, 0.482, 0.569, 0.665, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.122, -0.067, 0.023, 0.086, 0.154, 0.236, 0.331, 0.366, 0.433, 0.538, 0.609, 0.777, 0.961, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.218, -0.19, -0.128, -0.007, 0.06, 0.167, 0.279, 0.411, 0.55, 0.611, 0.81, 0.951, 1.039, 0, 0, 0]
    ],
    4: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.018, 0.041, 0.053, 0.108, 0.154, 0.19, 0.234, 0.301, 0.347, 0.385, 0.414, 0.506, 0.528, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.155, -0.126, -0.07, -0.004, 0.063, 0.146, 0.196, 0.283, 0.365, 0.439, 0.535, 0.644, 0.925, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.247, -0.224, -0.189, -0.126, -0.065, 0.044, 0.118, 0.251, 0.374, 0.507, 0.68, 0.925, 1.202, 0, 0, 0]
    ],
    5: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.035, -0.006, 0.028, 0.089, 0.094, 0.119, 0.17, 0.236, 0.287, 0.325, 0.355, 0.442, 0.491, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.153, -0.121, -0.096, -0.058, 0.01, 0.06, 0.13, 0.212, 0.287, 0.388, 0.496, 0.618, 0.814, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.234, -0.211, -0.176, -0.132, -0.094, -0.04, 0.045, 0.139, 0.262, 0.4, 0.587, 0.802, 1.25, 0, 0, 0]
    ]
  };
  // Extended deck (60 cards): same columns plus Sun, Moon, Dragons, Jokers.
  const BID_WEIGHTS_EXT = {
    2: [
      [0.602, 0.623, 0.667, 0.721, 0.677, 0.742, 0.809, 0.791, 0.827, 0.9, 0.907, 1.009, 0.963, 0.222, 0.304, 0.283, 0.288, 0.323, 0.334, 0.386, 0.396, 0.406, 0.451, 0.501, 0.499, 0.529, 0.006, 0.098, 0, 1.129, -0.036, 1.108, -0.115],
      [0.901, 0.888, 0.858, 0.854, 0.926, 0.927, 0.973, 1.013, 1.031, 1.026, 1.072, 1.039, 1.083, 0.168, 0.148, 0.215, 0.225, 0.274, 0.328, 0.333, 0.395, 0.44, 0.51, 0.59, 0.684, 0.726, -0.02, -0.079, -0.206, 0.975, -0.062, 0.958, -0.056],
      [0.671, 0.652, 0.723, 0.667, 0.676, 0.75, 0.803, 0.815, 0.85, 0.948, 0.958, 0.966, 0.969, 0.088, 0.124, 0.126, 0.22, 0.275, 0.306, 0.398, 0.48, 0.548, 0.643, 0.688, 0.757, 0.815, 0.074, -0.062, 0.377, 0.642, 0.115, 0.766, 0.066]
    ],
    3: [
      [0.442, 0.466, 0.429, 0.478, 0.546, 0.565, 0.586, 0.656, 0.661, 0.821, 0.763, 0.798, 0.901, 0.027, 0.053, 0.111, 0.131, 0.135, 0.143, 0.173, 0.194, 0.241, 0.246, 0.249, 0.298, 0.31, 0.013, 0.032, 0, 1.154, -0.008, 1.077, -0.058],
      [0.617, 0.637, 0.677, 0.668, 0.713, 0.724, 0.761, 0.799, 0.828, 0.911, 0.92, 0.968, 1.073, -0.01, -0.008, 0.037, 0.053, 0.083, 0.124, 0.163, 0.172, 0.235, 0.27, 0.376, 0.45, 0.541, -0.059, -0.069, 0.269, 0.902, 0.089, 0.989, 0.013],
      [0.362, 0.396, 0.375, 0.399, 0.478, 0.493, 0.556, 0.603, 0.703, 0.794, 0.846, 0.907, 0.936, -0.032, -0.014, -0.006, 0.014, 0.038, 0.081, 0.141, 0.224, 0.271, 0.383, 0.492, 0.593, 0.708, 0.055, -0.063, 0.59, 0.716, 0.19, 0.798, 0.042]
    ],
    4: [
      [0.421, 0.386, 0.483, 0.451, 0.525, 0.517, 0.59, 0.647, 0.615, 0.713, 0.824, 0.834, 0.928, -0.002, 0.017, 0.039, 0.025, 0.069, 0.08, 0.115, 0.114, 0.15, 0.13, 0.181, 0.202, 0.228, -0.026, -0.014, 0, 1.086, 0.01, 1.001, -0.041],
      [0.401, 0.427, 0.512, 0.474, 0.567, 0.593, 0.673, 0.704, 0.769, 0.819, 0.85, 0.9, 0.952, -0.036, -0.027, -0.009, 0.014, 0.015, 0.055, 0.079, 0.088, 0.125, 0.19, 0.221, 0.271, 0.406, -0.061, -0.073, 0.223, 0.919, 0.151, 0.952, 0.019],
      [0.183, 0.195, 0.209, 0.267, 0.277, 0.346, 0.398, 0.471, 0.536, 0.627, 0.741, 0.834, 0.858, -0.023, -0.021, -0.027, -0.015, 0.009, 0.013, 0.034, 0.084, 0.133, 0.206, 0.294, 0.447, 0.608, 0.054, -0.052, 0.72, 0.751, 0.196, 0.814, 0.038]
    ],
    5: [
      [0.335, 0.398, 0.394, 0.388, 0.492, 0.512, 0.512, 0.544, 0.602, 0.646, 0.686, 0.77, 0.867, -0.005, -0.003, 0.008, 0.028, 0.021, 0.039, 0.075, 0.084, 0.088, 0.101, 0.105, 0.136, 0.158, -0.044, -0.056, 0, 1.046, 0.063, 0.944, -0.028],
      [0.309, 0.327, 0.374, 0.404, 0.465, 0.493, 0.574, 0.652, 0.693, 0.74, 0.77, 0.847, 0.884, -0.029, -0.023, -0.023, -0.021, 0, 0.024, 0.025, 0.058, 0.066, 0.109, 0.147, 0.193, 0.282, -0.085, -0.08, 0.304, 0.866, 0.186, 0.938, 0.022],
      [0.094, 0.106, 0.12, 0.154, 0.202, 0.232, 0.294, 0.376, 0.467, 0.568, 0.65, 0.773, 0.81, -0.02, -0.029, -0.02, -0.022, -0.012, -0.006, 0.009, 0.023, 0.05, 0.098, 0.177, 0.292, 0.522, 0.034, -0.044, 0.706, 0.741, 0.27, 0.824, 0]
    ]
  };
  const BID_WEIGHTS_EXT_NT = {
    2: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.306, 0.363, 0.361, 0.355, 0.327, 0.415, 0.419, 0.503, 0.489, 0.607, 0.582, 0.669, 0.666, 0, 0, 0, 1.237, 0.024, 1.198, -0.109],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.161, 0.225, 0.258, 0.326, 0.328, 0.363, 0.395, 0.475, 0.556, 0.607, 0.731, 0.819, 0.9, 0, 0, 0, 1.187, -0.153, 1.18, -0.182],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.106, 0.144, 0.168, 0.219, 0.335, 0.387, 0.5, 0.589, 0.678, 0.76, 0.849, 0.909, 0.923, 0, 0, 0, 0.633, -0.016, 0.756, 0.052]
    ],
    3: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.07, 0.142, 0.171, 0.212, 0.179, 0.226, 0.246, 0.3, 0.308, 0.324, 0.358, 0.484, 0.549, 0, 0, 0, 1.207, 0.002, 1.182, -0.131],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.042, 0.015, 0.04, 0.08, 0.13, 0.201, 0.244, 0.296, 0.335, 0.444, 0.499, 0.623, 0.774, 0, 0, 0, 1.026, 0.004, 1.141, -0.074],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.071, -0.052, -0.024, 0.011, 0.059, 0.122, 0.21, 0.293, 0.417, 0.543, 0.705, 0.86, 0.967, 0, 0, 0, 0.653, 0.103, 0.774, 0.011]
    ],
    4: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.015, 0.063, 0.053, 0.079, 0.132, 0.151, 0.171, 0.189, 0.22, 0.238, 0.315, 0.352, 0.434, 0, 0, 0, 1.187, 0, 1.093, -0.087],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.064, -0.038, -0.014, 0.02, 0.062, 0.09, 0.117, 0.183, 0.241, 0.301, 0.373, 0.504, 0.682, 0, 0, 0, 0.986, 0.075, 1.059, -0.06],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.106, -0.099, -0.074, -0.05, -0.01, 0.025, 0.073, 0.149, 0.237, 0.349, 0.525, 0.761, 0.973, 0, 0, 0, 0.634, 0.156, 0.796, -0.007]
    ],
    5: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.007, 0.011, 0.026, 0.068, 0.078, 0.088, 0.135, 0.133, 0.153, 0.184, 0.222, 0.245, 0.332, 0, 0, 0, 1.146, 0.042, 1.054, -0.086],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.066, -0.049, -0.046, -0.014, 0.016, 0.053, 0.079, 0.13, 0.156, 0.212, 0.291, 0.405, 0.595, 0, 0, 0, 0.92, 0.097, 1.008, -0.033],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.109, -0.096, -0.073, -0.052, -0.048, -0.023, 0.008, 0.065, 0.131, 0.225, 0.383, 0.623, 0.946, 0, 0, 0, 0.661, 0.192, 0.797, 0.016]
    ]
  };

  class OhHellAIEngine {
    constructor(config) {
      const defaults = {
        difficulty: "medium", // "easy" | "medium" | "hard"

        // probability of choosing ranked move [0,1,2,...]
        difficultyProfiles: {
          easy:   [0.50, 0.28, 0.14, 0.08],
          medium: [0.88, 0.10, 0.02],
          hard:   [1.00]
        },

        // chance the bid is nudged by ±1 from the estimate
        bidWobble: { easy: 0.45, medium: 0.12, hard: 0 },

        // look-ahead budget (hard)
        playSamples: 200,
        playTimeMs: 300,
        bidSamples: 100,
        bidTimeMs: 400,

        // how much the hard AI cares about opponents' points vs its own
        spite: 0.25
      };

      this.config = Object.assign({}, defaults, config || {});
    }

    setDifficulty(d) {
      this.config.difficulty = d;
    }

    resetMemory() { /* everything needed comes from public game state */ }

    get isHard() { return this.config.difficulty === "hard"; }

    // =====================================================
    // ===================== BIDDING =======================
    // =====================================================

    // ctx: { hand, trumpSuit, trumpCard, numPlayers, handSize, legalBids,
    //        seat, dealer, bids, simultaneous }
    // With simultaneous bidding `bids` is all null: nobody's bid is known yet.
    chooseBid(ctx) {
      this.ext = !!ctx.extended;
      if (this.isHard && ctx.seat != null) return this._lookaheadBid(ctx);

      const est = this.estimateTricks(ctx.hand, ctx.trumpSuit, ctx.numPlayers, ctx.handSize);
      let target = Math.round(est);

      const wobble = this.config.bidWobble[this.config.difficulty] || 0;
      if (Math.random() < wobble) target += (Math.random() < 0.5 ? -1 : 1);

      return this._nearestLegal(target, est, ctx.legalBids, ctx.handSize);
    }

    _nearestLegal(target, est, legalBids, handSize) {
      target = Math.max(0, Math.min(handSize, target));
      if (legalBids.includes(target)) return target;
      const preferUp = est > target;
      for (const b of (preferUp ? [target + 1, target - 1] : [target - 1, target + 1])) {
        if (legalBids.includes(b)) return b;
      }
      return legalBids[0];
    }

    // Deterministic rule-based bid (used for other players inside look-ahead).
    _plainBid(hand, trumpSuit, n, handSize, legalBids) {
      const est = this.estimateTricks(hand, trumpSuit, n, handSize);
      return this._nearestLegal(Math.round(est), est, legalBids, handSize);
    }

    estimateTricks(hand, trumpSuit, numPlayers, handSize) {
      const n = Math.max(2, Math.min(5, numPlayers));
      const bucket = handSize <= 2 ? 0 : handSize <= 5 ? 1 : 2;
      const w = this.ext
        ? (trumpSuit ? BID_WEIGHTS_EXT[n][bucket] : BID_WEIGHTS_EXT_NT[n][bucket])
        : (trumpSuit ? BID_WEIGHTS[n][bucket] : BID_WEIGHTS_NT[n][bucket]);
      const f = this.bidFeatures(hand, trumpSuit);

      let exp = 0;
      for (let i = 0; i < f.length; i++) exp += f[i] * w[i];
      return Math.max(0, Math.min(handSize, exp));
    }

    // 13 trump ranks, 13 side ranks, side void with trumps, side singleton with
    // trumps, extra trump length. (No-trump: everything counts as "side".)
    // Extended deck adds: Sun, Moon, Dragons, Jokers.
    bidFeatures(hand, trumpSuit) {
      const f = new Array(this.ext ? 33 : 29).fill(0);
      const count = { "♠": 0, "♥": 0, "♦": 0, "♣": 0 };

      for (const c of hand) {
        if (c.isSpecial) {
          if (this.ext) f[{ SUN: 29, MOON: 30, DRAGON: 31, JOKER: 32 }[c.role]]++;
          continue;
        }
        count[c.suit]++;
        f[(c.suit === trumpSuit ? 0 : 13) + c.value - 2]++;
      }

      const trumps = trumpSuit ? count[trumpSuit] : 0;
      for (const s of SUIT_LIST) {
        if (s === trumpSuit) continue;
        if (count[s] === 0) f[26] += Math.min(1, trumps);
        else if (count[s] === 1) f[27] += Math.min(1, trumps);
      }
      f[28] = Math.pow(Math.max(0, trumps - 2), 2) / 4;
      return f;
    }

    // ----- look-ahead bidding (hard) -----
    _lookaheadBid(ctx) {
      const n = ctx.numPlayers;
      const seat = ctx.seat;
      const est = this.estimateTricks(ctx.hand, ctx.trumpSuit, n, ctx.handSize);

      // Only consider bids near the estimate.
      const lo = Math.max(0, Math.floor(est) - 2);
      const hi = Math.min(ctx.handSize, Math.ceil(est) + 2);
      const cands = ctx.legalBids.filter(b => b >= lo && b <= hi);
      if (cands.length === 0) return this._nearestLegal(Math.round(est), est, ctx.legalBids, ctx.handSize);
      if (cands.length === 1) return cands[0];

      const known = new Uint8Array(DECK_IDS);
      ctx.hand.forEach(c => { known[cardId(c)] = 1; });
      if (ctx.trumpCard) known[cardId(ctx.trumpCard)] = 1;
      const pool = this._unknownCards(known, ctx.extended);

      const totals = new Map(cands.map(b => [b, 0]));
      let wTotal = 0;
      const t0 = Date.now();

      for (let k = 0; k < this.config.bidSamples; k++) {
        if (k >= 12 && Date.now() - t0 > this.config.bidTimeMs) break;

        this._shuffle(pool);
        const hands = [];
        let p = 0;
        for (let s = 0; s < n; s++) {
          if (s === seat) { hands.push(ctx.hand.slice()); continue; }
          hands.push(pool.slice(p, p + ctx.handSize));
          p += ctx.handSize;
        }

        // Weight the deal by how well it explains bids already made.
        let w = 1;
        for (let s = 0; s < n; s++) {
          if (s === seat || ctx.bids[s] == null) continue;
          const e = this.estimateTricks(hands[s], ctx.trumpSuit, n, ctx.handSize);
          w *= Math.exp(-((e - ctx.bids[s]) ** 2) / 2);
        }
        if (w < 1e-6) continue;
        wTotal += w;

        for (const b of cands) {
          const bids = this._completeBids(ctx, hands, seat, b);
          const pts = this._rolloutRound(ctx, hands, bids);
          totals.set(b, totals.get(b) + w * this._utility(pts, seat));
        }
      }

      if (wTotal === 0) return this._nearestLegal(Math.round(est), est, ctx.legalBids, ctx.handSize);

      let best = cands[0], bestV = -Infinity;
      for (const [b, t] of totals) if (t > bestV) { bestV = t; best = b; }
      return best;
    }

    // Fill in a (rule-based) bid for every seat whose bid isn't known.
    // Sequential bidding also applies the dealer's hook.
    _completeBids(ctx, hands, seat, myBid) {
      const n = ctx.numPlayers;
      const bids = ctx.bids.slice();
      bids[seat] = myBid;
      const first = (ctx.dealer + 1) % n;
      for (let k = 0; k < n; k++) {
        const s = (first + k) % n;
        if (bids[s] != null) continue;
        const total = bids.reduce((a, b) => a + (b == null ? 0 : b), 0);
        const legal = [];
        for (let b = 0; b <= ctx.handSize; b++) {
          if (!ctx.simultaneous && s === ctx.dealer && b === ctx.handSize - total) continue;
          legal.push(b);
        }
        bids[s] = this._plainBid(hands[s], ctx.trumpSuit, n, ctx.handSize, legal);
      }
      return bids;
    }

    _rolloutRound(ctx, hands, bids) {
      const n = ctx.numPlayers;
      const st = {
        n,
        hands: hands.map(h => h.slice()),
        bids,
        won: new Array(n).fill(0),
        bonus: new Array(n).fill(0),
        leader: (ctx.dealer + 1) % n,
        plays: [],
        playedMask: new Uint8Array(DECK_IDS),
        trumpSuit: ctx.trumpSuit,
        trumpCard: ctx.trumpCard,
        handSize: ctx.handSize,
        tricksPlayed: 0
      };
      return this._rollout(st);
    }

    _utility(points, seat) {
      let others = 0;
      for (let i = 0; i < points.length; i++) if (i !== seat) others += points[i];
      const mean = points.length > 1 ? others / (points.length - 1) : 0;
      return points[seat] - this.config.spite * mean;
    }

    // =====================================================
    // ===================== PLAYING =======================
    // =====================================================

    // ctx: { hand, legal, plays, trumpSuit, trumpCard, numPlayers, bid, won,
    //        tricksLeft, playedCards, seat, bids, wonAll, trickHistory,
    //        handSize, tricksPlayed, leader }
    choosePlay(ctx) {
      this.ext = !!ctx.extended;
      const legal = ctx.legal;
      if (legal.length === 1) return legal[0];

      if (this.isHard && ctx.seat != null && ctx.trickHistory) {
        return this._lookaheadPlay(ctx);
      }

      const known = this._knownMask(ctx.hand, ctx.playedCards, ctx.trumpCard);
      const scored = legal.map(idx => ({
        idx,
        score: this._scorePlay(ctx.hand, idx, ctx.plays, ctx.trumpSuit, ctx.bid, ctx.won,
                               ctx.numPlayers, known)
      }));
      scored.sort((a, b) => b.score - a.score);
      return this._pickByDifficulty(scored.map(s => s.idx));
    }

    _knownMask(hand, playedCards, trumpCard) {
      const m = new Uint8Array(DECK_IDS);
      for (const c of hand) m[cardId(c)] = 1;
      for (const c of playedCards) m[cardId(c)] = 1;
      if (trumpCard) m[cardId(trumpCard)] = 1;
      return m;
    }

    // Rule-based evaluation of playing hand[idx].
    _scorePlay(hand, idx, plays, trumpSuit, bid, won, numPlayers, known) {
      const card = hand[idx];
      const need = bid - won;

      // Moon capturing the Sun is worth +20 whatever it does to the bid.
      if (card.role === "MOON" && plays.some(p => p.card.role === "SUN")) return 50;

      // On the bid exactly: avoid tricks. Under it: chase tricks.
      // Already over: every trick is still a point, so take them.
      const wantWin = need !== 0;

      const cards = plays.map(p => p.card);
      cards.push(card);
      const beatsNow = winnerIdx(cards, trumpSuit) === plays.length;

      const leadSuit = leadSuitOf(cards);
      const hold = beatsNow
        ? this._holdProbability(card, leadSuit, plays, hand.length, trumpSuit, numPlayers, known)
        : 0;
      const isTrump = !card.isSpecial && card.suit === trumpSuit;
      const cheap = this._cardWorth(card);

      if (wantWin) {
        if (beatsNow) {
          let score = hold * 10 - cheap;
          if (!plays.length && isTrump) {
            let trumpCount = 0;
            for (const c of hand) if (c.suit === trumpSuit) trumpCount++;
            if (trumpCount * 2 < hand.length) score -= 1.5;
          }
          return score;
        }
        return -5 - (isTrump ? 1.5 : 0) - cheap;
      }

      if (beatsNow) {
        return -hold * 10 + cheap * 0.5 - (isTrump ? 0.5 : 0);
      }
      return 2 + cheap * 3 + (isTrump ? 1 : 0);
    }

    // How "valuable / dangerous" a card is to hold (0..~1.2).
    _cardWorth(card) {
      switch (card.role) {
        case "SUN": return 1.25;
        case "DRAGON": return 1.1;
        case "MOON": return 0.35;   // a perfect duck, and the Sun's only answer
        case "JOKER": return 0.05;  // always a safe duck: keep it for when it's needed
        default: return card.value / 14;
      }
    }

    // Probability that `card` (currently winning / leading) survives the
    // players still to act this trick.
    _holdProbability(card, leadSuit, plays, handLen, trumpSuit, numPlayers, known) {
      const toAct = numPlayers - 1 - plays.length;
      if (toAct <= 0) return 1;

      // Unseen counts (cards not in my hand, not played, not the turned card).
      let unseen = 0;
      const unseenSuit = [0, 0, 0, 0];
      for (let s = 0; s < 4; s++) {
        for (let r = 0; r < 13; r++) if (!known[s * 13 + r]) unseenSuit[s]++;
        unseen += unseenSuit[s];
      }
      let sunUnseen = 0, moonUnseen = 0, dragonsUnseen = 0;
      if (this.ext) {
        sunUnseen = known[SPECIAL_BASE.SUN] ? 0 : 1;
        moonUnseen = known[SPECIAL_BASE.MOON] ? 0 : 1;
        for (let k = 0; k < 4; k++) if (!known[SPECIAL_BASE.DRAGON + k]) dragonsUnseen++;
        for (let k = 0; k < 2; k++) if (!known[SPECIAL_BASE.JOKER + k]) unseen++;
        unseen += sunUnseen + moonUnseen + dragonsUnseen;
      }
      if (unseen <= 0) return 1;

      const h = Math.max(1, handLen);
      const pHeld = Math.min(1, (toAct * h) / unseen);

      switch (card.role) {
        case "SUN":    return moonUnseen ? 1 - pHeld : 1;
        case "DRAGON": return sunUnseen ? 1 - pHeld : 1;
        case "MOON":
        case "JOKER":  return 0.02; // only "winning" as the first card; any normal card beats it
        default: break;
      }

      if (!leadSuit || (card.suit !== leadSuit && card.suit !== trumpSuit)) return 0;

      const cs = SUIT_IDX[card.suit];
      const ls = SUIT_IDX[leadSuit];
      const ts = trumpSuit ? SUIT_IDX[trumpSuit] : -1;

      let higher = 0;
      for (let r = card.value - 1; r < 13; r++) if (!known[cs * 13 + r]) higher++;

      let p = Math.pow(1 - pHeld, higher);

      if (ts >= 0 && cs !== ts && unseenSuit[ts] > 0) {
        const pVoid = Math.pow(Math.max(0, unseen - unseenSuit[ls]) / unseen, h);
        const pHasTrump = 1 - Math.pow(Math.max(0, unseen - unseenSuit[ts]) / unseen, h);
        p *= Math.pow(1 - pVoid * pHasTrump, toAct);
      }

      // Anyone still to act may drop the Sun or a Dragon on it.
      if (sunUnseen + dragonsUnseen > 0) p *= Math.pow(1 - 0.7 * pHeld, sunUnseen + dragonsUnseen);
      return p;
    }

    // Mirrors Hand.getLegalMoves: follow suit with normal cards; specials any time.
    _legalIdx(hand, leadSuit) {
      if (!leadSuit) return hand.map((_, i) => i);
      let hasLead = false;
      for (const c of hand) if (!c.isSpecial && c.suit === leadSuit) { hasLead = true; break; }
      if (!hasLead) return hand.map((_, i) => i);
      const out = [];
      for (let i = 0; i < hand.length; i++) if (hand[i].isSpecial || hand[i].suit === leadSuit) out.push(i);
      return out;
    }

    // Resolve a full trick inside a rollout (winner, Moon-capture bonus).
    _resolveRolloutTrick(st) {
      const cards = st.plays.map(p => p.card);
      const w = st.plays[winnerIdx(cards, st.trumpSuit)].who;
      st.won[w]++;
      if (st.bonus) {
        const sun = st.plays.find(p => p.card.role === "SUN");
        const moon = st.plays.find(p => p.card.role === "MOON");
        if (sun && moon) st.bonus[moon.who] += MOON_CAPTURE_BONUS;
      }
      st.leader = w;
      st.plays = [];
      st.tricksPlayed++;
    }

    // Deterministic rule-based choice (used inside rollouts).
    _greedyIdx(st, seat) {
      const hand = st.hands[seat];
      const leadSuit = leadSuitOf(st.plays.map(p => p.card));
      const legal = this._legalIdx(hand, leadSuit);
      if (legal.length === 1) return legal[0];

      const known = st.playedMask.slice();
      for (const c of hand) known[cardId(c)] = 1;
      if (st.trumpCard) known[cardId(st.trumpCard)] = 1;

      let bestIdx = legal[0], bestScore = -Infinity;
      for (const idx of legal) {
        const sc = this._scorePlay(hand, idx, st.plays, st.trumpSuit, st.bids[seat], st.won[seat], st.n, known);
        if (sc > bestScore) { bestScore = sc; bestIdx = idx; }
      }
      return bestIdx;
    }

    // Play the rest of the round out. Mutates st; returns points per seat.
    _rollout(st) {
      const n = st.n;
      while (st.tricksPlayed < st.handSize) {
        const seat = (st.leader + st.plays.length) % n;
        const idx = this._greedyIdx(st, seat);
        const card = st.hands[seat].splice(idx, 1)[0];
        st.plays.push({ who: seat, card });
        st.playedMask[cardId(card)] = 1;

        if (st.plays.length === n) this._resolveRolloutTrick(st);
      }
      return st.bids.map((b, i) => scoreForRound(b, st.won[i]) + (st.bonus ? st.bonus[i] : 0));
    }

    // ----- look-ahead play (hard) -----
    _lookaheadPlay(ctx) {
      const n = ctx.numPlayers;
      const seat = ctx.seat;
      const legal = ctx.legal;

      // Public knowledge: cards played, trump card, and who has shown out of what.
      const played = new Uint8Array(DECK_IDS);
      const voids = Array.from({ length: n }, () => [false, false, false, false]);
      const playedBy = Array.from({ length: n }, () => []);

      // A normal card off the lead suit shows a void; specials reveal nothing.
      const noteTrick = (plays) => {
        const lead = leadSuitOf(plays.map(p => p.card));
        for (const p of plays) {
          played[cardId(p.card)] = 1;
          playedBy[p.who].push(p.card);
          if (lead && !p.card.isSpecial && p.card.suit !== lead) voids[p.who][SUIT_IDX[lead]] = true;
        }
      };
      for (const t of ctx.trickHistory) noteTrick(t.plays);
      if (ctx.plays.length) noteTrick(ctx.plays);

      const known = played.slice();
      for (const c of ctx.hand) known[cardId(c)] = 1;
      if (ctx.trumpCard) known[cardId(ctx.trumpCard)] = 1;
      const pool = this._unknownCards(known, ctx.extended);

      // How many cards each other seat still holds.
      const inTrick = new Set(ctx.plays.map(p => p.who));
      const need = [];
      for (let s = 0; s < n; s++) {
        need.push(s === seat ? 0 : (ctx.handSize - ctx.tricksPlayed - (inTrick.has(s) ? 1 : 0)));
      }

      const totals = new Array(legal.length).fill(0);
      let wTotal = 0;
      const t0 = Date.now();

      for (let k = 0; k < this.config.playSamples; k++) {
        if (k >= 16 && Date.now() - t0 > this.config.playTimeMs) break;

        const hands = this._sampleHands(pool, need, voids, seat);
        if (!hands) continue;

        // Weight by how well each player's full hand matches their bid.
        let w = 1;
        for (let s = 0; s < n; s++) {
          if (s === seat) continue;
          const full = hands[s].concat(playedBy[s]);
          const e = this.estimateTricks(full, ctx.trumpSuit, n, ctx.handSize);
          w *= Math.exp(-((e - ctx.bids[s]) ** 2) / 2.5);
        }
        if (w < 1e-7) continue;
        wTotal += w;

        hands[seat] = ctx.hand;

        for (let m = 0; m < legal.length; m++) {
          const st = {
            n,
            hands: hands.map(h => h.slice()),
            bids: ctx.bids,
            won: ctx.wonAll.slice(),
            bonus: (ctx.bonusAll || new Array(n).fill(0)).slice(),
            leader: ctx.leader,
            plays: ctx.plays.slice(),
            playedMask: played.slice(),
            trumpSuit: ctx.trumpSuit,
            trumpCard: ctx.trumpCard,
            handSize: ctx.handSize,
            tricksPlayed: ctx.tricksPlayed
          };

          // Play the candidate card, then let everyone continue.
          const card = st.hands[seat].splice(legal[m], 1)[0];
          st.plays.push({ who: seat, card });
          st.playedMask[cardId(card)] = 1;
          if (st.plays.length === n) this._resolveRolloutTrick(st);

          totals[m] += w * this._utility(this._rollout(st), seat);
        }
      }

      if (wTotal === 0) {
        const known2 = this._knownMask(ctx.hand, ctx.playedCards, ctx.trumpCard);
        let bi = legal[0], bs = -Infinity;
        for (const idx of legal) {
          const sc = this._scorePlay(ctx.hand, idx, ctx.plays, ctx.trumpSuit, ctx.bid, ctx.won, n, known2);
          if (sc > bs) { bs = sc; bi = idx; }
        }
        return bi;
      }

      let best = 0;
      for (let m = 1; m < legal.length; m++) if (totals[m] > totals[best]) best = m;
      return legal[best];
    }

    // Deal `pool` cards to the other seats (need[s] each, rest stay in the
    // stock), never giving a player a suit they've shown out of.
    _sampleHands(pool, need, voids, seat) {
      const n = need.length;
      const totalNeed = need.reduce((a, b) => a + b, 0);
      const cards = pool.slice();

      for (let attempt = 0; attempt < 12; attempt++) {
        this._shuffle(cards);
        const hands = Array.from({ length: n }, () => []);
        const space = need.slice();
        let stockSpace = cards.length - totalNeed;
        let ok = true;

        // Hardest-to-place cards first: suits fewer players can hold.
        const order = cards.slice().sort((a, b) => this._eligibleCount(a, voids, space, seat) -
                                                   this._eligibleCount(b, voids, space, seat));
        for (const c of order) {
          const si = SUIT_IDX[c.suit];
          let total = stockSpace;
          for (let s = 0; s < n; s++) if (s !== seat && space[s] > 0 && !voids[s][si]) total += space[s];
          if (total <= 0) { ok = false; break; }

          let r = Math.random() * total;
          if (r < stockSpace) { stockSpace--; continue; }
          r -= stockSpace;
          for (let s = 0; s < n; s++) {
            if (s === seat || space[s] <= 0 || voids[s][si]) continue;
            if (r < space[s]) { hands[s].push(c); space[s]--; break; }
            r -= space[s];
          }
        }
        if (ok && space.every((v, s) => s === seat || v === 0)) return hands;
      }

      // Constraints too tight (rare): ignore voids.
      this._shuffle(cards);
      const hands = Array.from({ length: n }, () => []);
      let p = 0;
      for (let s = 0; s < n; s++) {
        if (s === seat) continue;
        hands[s] = cards.slice(p, p + need[s]);
        p += need[s];
      }
      return hands;
    }

    _eligibleCount(card, voids, space, seat) {
      const si = SUIT_IDX[card.suit];
      let k = 0;
      for (let s = 0; s < voids.length; s++) if (s !== seat && space[s] > 0 && !voids[s][si]) k++;
      return k;
    }

    _unknownCards(known, extended) {
      const out = [];
      for (let s = 0; s < 4; s++) {
        for (let r = 0; r < 13; r++) {
          if (!known[s * 13 + r]) out.push(new Card(SUIT_LIST[s], RANKS[r]));
        }
      }
      if (extended) {
        for (const [role, count] of SPECIAL_COUNTS) {
          for (let k = 0; k < count; k++) {
            if (!known[SPECIAL_BASE[role] + k]) out.push(new Card(SPECIAL_SUIT, "0", role, k));
          }
        }
      }
      return out;
    }

    _shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
    }

    // =====================================================

    _pickByDifficulty(rankedMoves) {
      const profile =
        this.config.difficultyProfiles[this.config.difficulty] ||
        this.config.difficultyProfiles.medium;

      const usable = profile.slice(0, rankedMoves.length);
      const total = usable.reduce((a, b) => a + b, 0);

      let r = Math.random() * total;
      for (let i = 0; i < usable.length; i++) {
        r -= usable[i];
        if (r <= 0) return rankedMoves[i];
      }
      return rankedMoves[0];
    }
  }

  global.OhHellAIEngine = OhHellAIEngine;
})(window);
