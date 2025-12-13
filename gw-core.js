// gw-core.js
// Core constants, model classes, geometry helpers, and CardView.
// (Pure rules + card rendering – no DOM element lookups, no AI engine here.)

// ===== Card / rules constants =====

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

// Base sizes for scaling
const BASE_CARD_WIDTH = 60;  // .card.small
const BASE_CARD_HEIGHT = 90;
const BASE_INDEX_PX = 16;
const BASE_PIP_PX = 10;
const MIN_INDEX_PX = 11;
const MIN_PIP_PX = 5;

// Layout metrics cache (updated on resize)
const layoutMetrics = {
  scale: 1,
  cardWidth: BASE_CARD_WIDTH,
  cardHeight: BASE_CARD_HEIGHT
};

// Pip layout definitions
const PIP_LAYOUTS = {
  "A": [["C", "M"]],
  "2": [["C", "T"], ["C", "B"]],
  "3": [["C", "T"], ["C", "M"], ["C", "B"]],
  "4": [["L", "T"], ["R", "T"], ["L", "B"], ["R", "B"]],
  "5": [["L", "T"], ["R", "T"], ["C", "M"], ["L", "B"], ["R", "B"]],
  "6": [["L", "T"], ["R", "T"], ["L", "M"], ["R", "M"], ["L", "B"], ["R", "B"]],
  "7": [["L", "T"], ["R", "T"], ["C", "TM"], ["L", "M"], ["R", "M"], ["L", "B"], ["R", "B"]],
  "8": [["L", "T"], ["R", "T"], ["L", "TM"], ["R", "TM"], ["L", "BM"], ["R", "BM"], ["L", "B"], ["R", "B"]],
  "9": [["L", "T"], ["C", "T"], ["R", "T"], ["L", "M"], ["C", "M"], ["R", "M"], ["L", "B"], ["C", "B"], ["R", "B"]],
  "10": [["L", "T"], ["R", "T"], ["L", "TM"], ["R", "TM"], ["L", "M"], ["R", "M"], ["L", "BM"], ["R", "BM"], ["L", "B"], ["R", "B"]]
};

// Delay showing the *next* prize card until after awards + discards in draw phase
window.__delayPrizeReveal = false;

// ===== Model classes (no DOM) =====

class Card {
  constructor(suit, rank) {
    this.suit = suit;
    this.rank = rank;
    this.value = RANK_VALUES[rank];
  }
}

class Hand {
  constructor(cards = []) {
    this.cards = cards;
  }

  get length() {
    return this.cards.length;
  }

  add(card) {
    this.cards.push(card);
  }

  removeAt(index) {
    if (index < 0 || index >= this.cards.length) return null;
    return this.cards.splice(index, 1)[0];
  }

  getLegalMoves(leadSuit) {
    if (!leadSuit) {
      return this.cards.map((_, i) => i);
    }
    const indicesOfLeadSuit = this.cards
      .map((card, idx) => ({ card, idx }))
      .filter(o => o.card.suit === leadSuit)
      .map(o => o.idx);

    if (indicesOfLeadSuit.length > 0) return indicesOfLeadSuit;
    return this.cards.map((_, i) => i);
  }
}

function cardBeats(a, b, leadSuit, trumpSuit) {
  const aIsTrump = a.suit === trumpSuit;
  const bIsTrump = b.suit === trumpSuit;

  if (aIsTrump && !bIsTrump) return true;
  if (!aIsTrump && bIsTrump) return false;

  const aIsLead = a.suit === leadSuit;
  const bIsLead = b.suit === leadSuit;

  if (aIsLead && !bIsLead) return true;
  if (!aIsLead && bIsLead) return false;

  if (a.suit === b.suit) {
    return a.value > b.value;
  }
  return false;
}

class Trick {
  constructor(leader) {
    this.leader = leader;
    this.plays = [];      // { who, card }
    this.leadSuit = null;
  }

  addPlay(who, card) {
    if (!this.leadSuit) {
      this.leadSuit = card.suit;
    }
    this.plays.push({ who, card });
  }

  isComplete() {
    return this.plays.length >= 2;
  }

  winner(trumpSuit) {
    if (!this.isComplete()) return null;
    const [first, second] = this.plays;
    let winner = first;
    if (cardBeats(second.card, first.card, this.leadSuit, trumpSuit)) {
      winner = second;
    }
    return winner.who;
  }
}

function createDeck() {
  const d = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      d.push(new Card(suit, rank));
    }
  }
  return d;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Shared fan geometry for player hand
function computePlayerFanSlot(slotIndex, totalSlots, scale) {
  const spreadDeg = 30;
  const baseAngle = -spreadDeg / 2;
  const t = (totalSlots > 1) ? (slotIndex / (totalSlots - 1)) : 0.5;
  const angle = baseAngle + t * spreadDeg;
  const offsetX = (slotIndex - (totalSlots - 1) / 2) * 14 * scale;
  const offsetY = Math.abs(angle) * 0.25 * scale;
  return { angle, offsetX, offsetY };
}

// AI fan geometry
function computeAiFanSlot(slotIndex, totalSlots, scale) {
  const spreadDeg = 30;
  const baseAngle = -spreadDeg / 2;
  const t = (totalSlots > 1) ? (slotIndex / (totalSlots - 1)) : 0.5;
  const angle = baseAngle + t * spreadDeg;
  const offsetX = (slotIndex - (totalSlots - 1) / 2) * 14 * scale;
  const offsetY = -Math.abs(angle) * 0.25 * scale;
  return { angle, offsetX, offsetY };
}

// Helper: centre of a slot/container in viewport coords
function getRectCenter(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
}

class GermanWhistGame {
  constructor() {
    this.startNewGame();
  }

  startNewGame() {
    const deck = createDeck();
    shuffle(deck);

    this.playerHand = new Hand(deck.splice(0, 13));
    this.aiHand = new Hand(deck.splice(0, 13));

    this.stock = deck; // remaining 26

    // First reveal the initial prize card…
    this.prizeCard = this.stock.length > 0 ? this.stock.pop() : null;

    // …and its suit is trump for the whole hand.
    this.trumpSuit = this.prizeCard ? this.prizeCard.suit : null;

    this.phase = "draw"; // 'draw' or 'score'
    this.tricksPlayedInPhase = 0;
    this.scoreDrawPhase = { player: 0, ai: 0 };
    this.scoreScorePhase = { player: 0, ai: 0 };

    this.playerWon = [];
    this.aiWon = [];

    this.leader = "player";
    this.turn = "player";
    this.currentTrick = new Trick(this.leader);
  }

  getLegalMovesFor(who) {
    const leadSuit = this.currentTrick.leadSuit;
    const hand = (who === "player") ? this.playerHand : this.aiHand;
    return hand.getLegalMoves(leadSuit);
  }

  playCard(who, index) {
    const hand = (who === "player") ? this.playerHand : this.aiHand;
    const legal = this.getLegalMovesFor(who);
    if (!legal.includes(index)) {
      return { ok: false, reason: "illegal" };
    }

    const card = hand.removeAt(index);
    this.currentTrick.addPlay(who, card);

    this.turn = (who === "player") ? "ai" : "player";

    if (this.currentTrick.isComplete()) {
      const winner = this.currentTrick.winner(this.trumpSuit);
      return { ok: true, trickComplete: true, winner };
    }

    return { ok: true, trickComplete: false };
  }

  resolveCompletedTrick(winner) {
    this.tricksPlayedInPhase++;
    let status = "";
    const newToPlayer = [];
    const newToAi = [];

    if (this.phase === "draw") {
      if (winner === "player") {
        this.scoreDrawPhase.player++;
        if (this.prizeCard) {
          this.playerHand.add(this.prizeCard);
          newToPlayer.push(this.prizeCard);
        }
        this.prizeCard = null;
        if (this.stock.length > 0) {
          const c = this.stock.pop();
          this.aiHand.add(c);
          newToAi.push(c);
        }
      } else {
        this.scoreDrawPhase.ai++;
        if (this.prizeCard) {
          this.aiHand.add(this.prizeCard);
          newToAi.push(this.prizeCard);
        }
        this.prizeCard = null;
        if (this.stock.length > 0) {
          const c = this.stock.pop();
          this.playerHand.add(c);
          newToPlayer.push(c);
        }
      }

      if (this.stock.length > 0) {
        this.prizeCard = this.stock.pop();
        status = `Trick won by ${winner === "player" ? "you" : "AI"}. Next prize card revealed.`;
      } else {
        this.phase = "score";
        this.tricksPlayedInPhase = 0;
        status =
          `Draw phase complete. New hands built. Scoring phase begins – ` +
          `${winner === "player" ? "you" : "AI"} lead the next trick.`;
      }
    } else {
      if (winner === "player") {
        this.scoreScorePhase.player++;
        this.playerWon.push(1);
      } else {
        this.scoreScorePhase.ai++;
        this.aiWon.push(1);
      }

      status =
        `Trick won by ${winner === "player" ? "you" : "AI"}.`;
    }

    this.currentTrick = new Trick(winner);
    this.leader = winner;
    this.turn = winner;

    const gameOver = (this.phase === "score" &&
      this.playerHand.length === 0 &&
      this.aiHand.length === 0);

    return { winner, status, gameOver, newToPlayer, newToAi };
  }

  getFinalResultText() {
    let msg =
      `Game over. Scoring tricks – You: ${this.scoreScorePhase.player}, AI: ${this.scoreScorePhase.ai}. `;

    if (this.scoreScorePhase.player > this.scoreScorePhase.ai) {
      msg += "You win the hand.";
    } else if (this.scoreScorePhase.player < this.scoreScorePhase.ai) {
      msg += "AI wins the hand.";
    } else {
      msg += "It's a tie.";
    }
    return msg;
  }

  getViewState() {
    return {
      phase: this.phase,
      trumpSuit: this.trumpSuit,
      stockCount: this.stock.length,
      prizeCard: this.prizeCard,
      playerHand: this.playerHand.cards,
      aiHand: this.aiHand.cards,
      trickCards: this.currentTrick ? this.currentTrick.plays : [],
      scoreScorePhase: this.scoreScorePhase,
      playerWonCount: this.playerWon.length,
      aiWonCount: this.aiWon.length
    };
  }
}

// ===== CardView (card DOM fragments only, no table layout) =====

class CardView {
  cardColorClass(card) {
    switch (card.suit) {
      case "♠": return "s-spade";
      case "♥": return "s-heart";
      case "♦": return "s-diamond";
      case "♣": return "s-club";
      default: return "";
    }
  }

  pipPositionToPercent(col, row) {
    const colMap = { L: 30, C: 50, R: 70 };
    const rowMap = { T: 25, TM: 38, M: 50, BM: 62, B: 75 };
    return { x: colMap[col] ?? 50, y: rowMap[row] ?? 50 };
  }

  createCardElement(card, options = {}) {
    const div = document.createElement("div");
    div.className = "card small";

    div._card = card || null;

    if (options.back) {
      div.classList.add("back");
      if (options.clickable) {
        div.classList.add("clickable");
      }
      return div;
    }

    if (options.clickable) {
      div.classList.add("clickable");
    }

    const cornerTop = document.createElement("div");
    cornerTop.className = "corner " + (card ? this.cardColorClass(card) : "");
    const cornerBottom = document.createElement("div");
    cornerBottom.className = "corner bottom " + (card ? this.cardColorClass(card) : "");

    if (card) {
      cornerTop.innerHTML =
        `<span class="rank">${card.rank}</span><span class="suit">${card.suit}</span>`;
      cornerBottom.innerHTML =
        `<span class="rank">${card.rank}</span><span class="suit">${card.suit}</span>`;
    }

    div.appendChild(cornerTop);
    div.appendChild(cornerBottom);

    if (card) {
      const center = document.createElement("div");
      center.className = "face-icon " + this.cardColorClass(card);
      center.style.position = "absolute";
      center.style.top = "0";
      center.style.left = "0";
      center.style.width = "100%";
      center.style.height = "100%";

      if (card.rank === "J" || card.rank === "Q" || card.rank === "K") {
        // Suit-specific PNG artwork for royalties: JH.png, QS.png, etc.
        const img = document.createElement("img");
        const suitMap = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };
        const s = suitMap[card.suit] || "";
        img.src = `${card.rank}${s}.png`;
        img.alt = card.rank + card.suit;
        img.style.position = "absolute";
        img.style.top = "50%";
        img.style.left = "50%";
        // Boost face art size for all royals
        if (card.rank === "K") {
          img.style.transform = "translate(-50%, -53%)";
          img.style.width = "100%";
          img.style.height = "110%";
          img.style.objectFit = "fill";
        } else if (card.rank === "Q") {
          img.style.transform = "translate(-50%, -50%)";
          img.style.width = "95%";
          img.style.objectFit = "contain";
        } else if (card.rank === "J") {
          img.style.transform = "translate(-50%, -50%)";
          img.style.width = "95%";
          img.style.height = "160%";
          img.style.objectFit = "fill";
        }
        img.style.objectFit = "contain";
        img.style.pointerEvents = "none";
        center.appendChild(img);
      } else {
        center.style.display = "block";

        if (card.rank === "A" && card.suit === "♠") {
          center.classList.add("ace-spades");
        }

        const leftX  = 32;
        const rightX = 68;
        const y1 = 25;
        const y2 = 42;
        const y3 = 58;
        const y4 = 75;
        const ycTop    = 33.5;
        const ycBottom = 66.5;

        if (card.rank === "10") {
          const positions = [
            [leftX,  y1], [rightX, y1],
            [50,     ycTop],
            [leftX,  y2], [rightX, y2],
            [leftX,  y3], [rightX, y3],
            [50,     ycBottom],
            [leftX,  y4], [rightX, y4]
          ];
          positions.forEach(([x, y]) => {
            const s = document.createElement("span");
            s.textContent = card.suit;
            s.style.position = "absolute";
            s.style.left = x + "%";
            s.style.top = y + "%";
            s.style.transform = "translate(-50%, -50%)";
            center.appendChild(s);
          });

        } else if (card.rank === "9") {
          const positions = [
            [leftX,  y1], [rightX, y1],
            [50,     ycTop],
            [leftX,  y2], [rightX, y2],
            [leftX,  y3], [rightX, y3],
            [leftX,  y4], [rightX, y4]
          ];
          positions.forEach(([x, y]) => {
            const s = document.createElement("span");
            s.textContent = card.suit;
            s.style.position = "absolute";
            s.style.left = x + "%";
            s.style.top = y + "%";
            s.style.transform = "translate(-50%, -50%)";
            center.appendChild(s);
          });

        } else if (card.rank === "8") {
          const positions = [
            [leftX, y1], [rightX, y1],
            [leftX, y2], [rightX, y2],
            [leftX, y3], [rightX, y3],
            [leftX, y4], [rightX, y4]
          ];
          positions.forEach(([x, y]) => {
            const s = document.createElement("span");
            s.textContent = card.suit;
            s.style.position = "absolute";
            s.style.left = x + "%";
            s.style.top = y + "%";
            s.style.transform = "translate(-50%, -50%)";
            center.appendChild(s);
          });

        } else {
          const layout = PIP_LAYOUTS[card.rank];
          if (layout) {
            layout.forEach(([col, row]) => {
              const pos = this.pipPositionToPercent(col, row);
              const s = document.createElement("span");
              s.textContent = card.suit;
              s.style.position = "absolute";
              s.style.left = pos.x + "%";
              s.style.top = pos.y + "%";
              s.style.transform = "translate(-50%, -50%)";
              center.appendChild(s);
            });
          }
        }
      }

      div.appendChild(center);
    }

    return div;
  }
}
