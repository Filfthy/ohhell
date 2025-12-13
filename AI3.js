// ===== AI engine: GermanWhistAIEngine (ranked + probabilistic difficulty) =====

(function (global) {
  "use strict";

  function createEmptyHighCardState() {
    const suits = ["♠", "♥", "♦", "♣"];
    const state = {};
    for (const s of suits) {
      state[s] = { A: "unknown", K: "unknown" };
    }
    return state;
  }

  class GermanWhistAIEngine {
    constructor(config) {
      const defaults = {
        difficulty: "normal", // "easy" | "normal" | "hard"

        // probability of choosing ranked move [0,1,2,...]
        difficultyProfiles: {
          easy:   [0.15, 0.35, 0.30, 0.20],
          normal: [0.60, 0.30, 0.10],
          hard:   [1.00]
        },

        goodPrizeRanks: ["A", "K", "Q", "J", "10"],
        cautiousTrumpLead: true
      };

      this.config = Object.assign({}, defaults, config || {});
      this.resetMemory();
    }

    resetMemory() {
      this.highCardState = createEmptyHighCardState();
    }

    // ===== Round 2 starts here: inference is allowed =====
    startPlayPhase(myPlayHand) {
      this.highCardState = createEmptyHighCardState();

      const suits = ["♠", "♥", "♦", "♣"];
      const ranks = ["A", "K"];

      for (const s of suits) {
        for (const r of ranks) {
          const cardInHand = myPlayHand.some(
            c => c.suit === s && c.rank === r
          );
          this.highCardState[s][r] = cardInHand ? "inMyHand" : "inOppHand";
        }
      }
    }

    rememberTrick(info) {
      const { aiWasLeader, leadCard, followCard } = info;

      const aiCard  = aiWasLeader ? leadCard  : followCard;
      const oppCard = aiWasLeader ? followCard : leadCard;

      this._updateHighCardStateFromPlay(aiCard,  "ai");
      this._updateHighCardStateFromPlay(oppCard, "opp");
    }

    _updateHighCardStateFromPlay(card, who) {
      if (!card) return;
      const s = card.suit;
      const r = card.rank;
      if (r !== "A" && r !== "K") return;

      this.highCardState[s][r] =
        (who === "ai") ? "playedByMe" : "playedByOpp";
    }

    // =====================================================
    // =============== PUBLIC DECISION API =================
    // =====================================================

    chooseBuild(ctx) {
      return this._chooseWithDifficulty(
        ctx,
        (c, legal) => this._chooseBuildBest(c, legal)
      );
    }

    choosePlay(ctx) {
      return this._chooseWithDifficulty(
        ctx,
        (c, legal) => this._choosePlayBest(c, legal)
      );
    }

    // =====================================================
    // =========== DIFFICULTY / RANKING CORE ===============
    // =====================================================

    _chooseWithDifficulty(ctx, bestChooserFn) {
      const legal = this._getLegalIndices(ctx.hand, ctx.leadCard);
      if (legal.length === 1) return legal[0];

      const ranked = this._rankMoves(ctx, legal, bestChooserFn);
      return this._pickByDifficulty(ranked);
    }

    _rankMoves(ctx, legal, bestChooserFn) {
      const remaining = legal.slice();
      const ranking = [];

      while (remaining.length > 0) {
        const best = bestChooserFn(ctx, remaining);
        ranking.push(best);
        remaining.splice(remaining.indexOf(best), 1);
      }

      return ranking;
    }

    _pickByDifficulty(rankedMoves) {
      const profile =
        this.config.difficultyProfiles[this.config.difficulty] ||
        this.config.difficultyProfiles.normal;

      const usable = profile.slice(0, rankedMoves.length);
      const total = usable.reduce((a, b) => a + b, 0);

      let r = Math.random() * total;
      for (let i = 0; i < usable.length; i++) {
        r -= usable[i];
        if (r <= 0) return rankedMoves[i];
      }

      return rankedMoves[0]; // fallback
    }

    // =====================================================
    // ========== BEST-MOVE LOGIC (UNCHANGED) ===============
    // =====================================================

    _chooseBuildBest(ctx, legal) {
      const { hand, prizeCard, trumpSuit, isLeader, leadCard } = ctx;

      const prize = prizeCard || { rank: "2", suit: trumpSuit };
      const isGoodPrize =
        this.config.goodPrizeRanks.indexOf(prize.rank) !== -1;

      if (!isLeader && leadCard) {
        if (!isGoodPrize) {
          return this._lowestIndex(hand, legal);
        }
        const winners = legal.filter(idx => {
          const c = hand[idx];
          return (
            c.suit === leadCard.suit &&
            this._rankIndex(c) > this._rankIndex(leadCard)
          );
        });
        return winners.length
          ? this._lowestIndex(hand, winners)
          : this._lowestIndex(hand, legal);
      }

      if (!isGoodPrize) {
        return this._lowestIndex(hand, legal);
      }

      const sorted = legal.slice().sort((a, b) =>
        this._rankIndex(hand[a]) - this._rankIndex(hand[b])
      );

      const pos = Math.floor(sorted.length * 0.6);
      return sorted[Math.min(pos, sorted.length - 1)];
    }

    _choosePlayBest(ctx, legal) {
      const {
        hand,
        trumpSuit,
        isLeader,
        leadCard,
        myTricks = 0,
        oppTricks = 0
      } = ctx;

      const behind = myTricks < oppTricks;

      if (!isLeader && leadCard) {
        return this._chooseFollowCard(hand, legal, leadCard, trumpSuit);
      }

      return this._chooseLeadCard(hand, legal, trumpSuit, behind);
    }

    _chooseFollowCard(hand, legal, leadCard, trumpSuit) {
      const winners = [];
      const losers = [];

      for (const idx of legal) {
        const c = hand[idx];
        if (this._canBeat(c, leadCard, trumpSuit)) {
          winners.push(idx);
        } else {
          losers.push(idx);
        }
      }

      return winners.length
        ? this._lowestIndex(hand, winners)
        : this._lowestIndex(hand, legal);
    }

    _chooseLeadCard(hand, legal, trumpSuit, behind) {
      const suits = ["♠", "♥", "♦", "♣"];
      const suitGroups = { "♠": [], "♥": [], "♦": [], "♣": [] };

      for (const idx of legal) {
        suitGroups[hand[idx].suit].push(idx);
      }

      let bestSuit = null;
      let bestScore = -Infinity;

      for (const s of suits) {
        const cards = suitGroups[s];
        if (!cards.length) continue;

        let score = cards.length;

        const ak = this.highCardState[s];
        if (ak.A === "inOppHand") score -= 1.0;
        if (ak.K === "inOppHand") score -= 0.5;
        if (ak.A === "playedByOpp") score += 1.0;
        if (ak.K === "playedByOpp") score += 0.5;
        if (ak.A === "inMyHand") score += 0.75;
        if (ak.K === "inMyHand") score += 0.4;

        if (s === trumpSuit && this.config.cautiousTrumpLead && !behind) {
          score -= 2.0;
        }

        if (score > bestScore) {
          bestScore = score;
          bestSuit = s;
        }
      }

      const candidates = suitGroups[bestSuit];
      const sorted = candidates.slice().sort((a, b) =>
        this._rankIndex(hand[a]) - this._rankIndex(hand[b])
      );

      if (sorted.length === 1) return sorted[0];
      const pos = sorted.length >= 3 ? Math.floor(sorted.length * 0.6) : 1;
      return sorted[Math.min(pos, sorted.length - 1)];
    }

    // =====================================================

    _rankIndex(card) {
      const R = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
      return R.indexOf(card.rank);
    }

    _getLegalIndices(hand, leadCard) {
      if (!leadCard) return hand.map((_, i) => i);
      const inSuit = hand
        .map((c, i) => (c.suit === leadCard.suit ? i : -1))
        .filter(i => i !== -1);
      return inSuit.length ? inSuit : hand.map((_, i) => i);
    }

    _lowestIndex(hand, indices) {
      return indices.reduce((best, idx) =>
        this._rankIndex(hand[idx]) < this._rankIndex(hand[best]) ? idx : best
      );
    }

    _canBeat(card, leadCard, trumpSuit) {
      const r = this._rankIndex(card);
      const leadR = this._rankIndex(leadCard);

      if (card.suit === trumpSuit && leadCard.suit !== trumpSuit) return true;
      if (card.suit === leadCard.suit && r > leadR) return true;
      if (card.suit === trumpSuit && leadCard.suit === trumpSuit && r > leadR)
        return true;
      return false;
    }
  }

  global.GermanWhistAIEngine = GermanWhistAIEngine;
})(window);
