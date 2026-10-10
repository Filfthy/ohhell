// oh-core.js
// Core constants, model classes, geometry helpers, and CardView.
// (Pure rules + card rendering – no DOM element lookups, no AI engine here.)

// ===== Card / rules constants =====

const SUITS = ["♠", "♥", "♦", "♣"];

// The Infernal suits (a Look & feel choice): drawn symbols standing in for the usual four, matched by
// colour - Flame for hearts, Trident for diamonds, Horns for clubs, Pentagram for spades. The cards'
// own suits never change; only how they're shown. The symbols are in index.html's #suit-symbols.
let INFERNAL = false;
const INFERNAL_SUITS = { "♥": "flames", "♦": "tridents", "♣": "horns", "♠": "pentagrams" };
const INFERNAL_SPECIAL = {
  SUN: { letter: "S", color: "#b5650f" }, MOON: { letter: "M", color: "#1d55a8" },
  DRAGON: { letter: "D", color: "#a3201e" }, JOKER: { letter: "F", color: "#6b3a8f", name: "The Fool (Joker)" }
};
const INFERNAL_ICON = { "♥": "s-flame", "♦": "s-trident", "♣": "s-horns", "♠": "s-pentagram" };
const INFERNAL_NAME = { hearts: "flames", diamonds: "tridents", clubs: "horns", spades: "pentagrams",
  heart: "flame", diamond: "trident", club: "horn", spade: "pentagram" };
// A suit as HTML: the usual symbol, or the Infernal one.
function suitMark(suit) {
  return INFERNAL && INFERNAL_ICON[suit]
    ? `<svg class="sg" viewBox="0 0 100 100" aria-hidden="true"><use href="#${INFERNAL_ICON[suit]}"/></svg>` : suit;
}
// Suit names in running text follow the symbols ("hearts" becomes "flames"), keeping capitals.
function suitWords(text) {
  if (!INFERNAL) return text;
  return text.replace(/\b(hearts?|diamonds?|clubs?|spades?)\b/gi, w => {
    const r = INFERNAL_NAME[w.toLowerCase()];
    return w[0] === w[0].toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r;
  });
}
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

// ===== Model classes (no DOM) =====

// Extended deck: 8 special cards (suit "Special", rank "0"), each with a role.
const SPECIAL_SUIT = "Special";
const ROLE = { NONE: "NONE", JOKER: "JOKER", DRAGON: "DRAGON", SUN: "SUN", MOON: "MOON" };
const SPECIAL_COUNTS = [[ROLE.JOKER, 2], [ROLE.DRAGON, 4], [ROLE.SUN, 1], [ROLE.MOON, 1]];
const MOON_CAPTURE_BONUS = 20;

class Card {
  constructor(suit, rank, role = ROLE.NONE, copy = 0) {
    this.suit = suit;
    this.rank = rank;
    this.role = role;
    this.copy = copy;          // tells identical specials apart (two Jokers, four Dragons)
    this.value = role === ROLE.NONE ? RANK_VALUES[rank] : 0;
  }

  get isSpecial() {
    return this.role !== ROLE.NONE;
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

  // Normal cards must follow the lead suit if possible.
  // Special cards may be played at any time.
  getLegalMoves(leadSuit) {
    if (!leadSuit) {
      return this.cards.map((_, i) => i);
    }
    const hasLead = this.cards.some(c => !c.isSpecial && c.suit === leadSuit);
    if (!hasLead) return this.cards.map((_, i) => i);

    const out = [];
    this.cards.forEach((c, i) => {
      if (c.isSpecial || c.suit === leadSuit) out.push(i);
    });
    return out;
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

// The lead suit is set by the first NORMAL card played (specials don't set it).
function leadSuitOf(cards) {
  for (const c of cards) if (!c.isSpecial) return c.suit;
  return null;
}

// Index (in play order) of the card that wins / is currently winning.
//  1. MOON + SUN both played: MOON wins (and earns the capture bonus).
//  2. SUN wins.
//  3. The first DRAGON played wins.
//  4. Highest trump (normal cards only).
//  5. Highest card of the lead suit (normal cards only).
//  6. Only JOKERs / MOON played: the first card wins.
function trickWinnerIndex(cards, trumpSuit) {
  if (!cards.length) return -1;
  let sun = -1, moon = -1, dragon = -1;
  cards.forEach((c, i) => {
    if (c.role === ROLE.SUN) sun = i;
    else if (c.role === ROLE.MOON) moon = i;
    else if (c.role === ROLE.DRAGON && dragon < 0) dragon = i;
  });
  if (sun >= 0 && moon >= 0) return moon;
  if (sun >= 0) return sun;
  if (dragon >= 0) return dragon;

  const highest = (pred) => {
    let best = -1;
    cards.forEach((c, i) => {
      if (!c.isSpecial && pred(c) && (best < 0 || c.value > cards[best].value)) best = i;
    });
    return best;
  };
  if (trumpSuit) {
    const t = highest(c => c.suit === trumpSuit);
    if (t >= 0) return t;
  }
  const lead = leadSuitOf(cards);
  if (lead) return highest(c => c.suit === lead);
  return 0;
}

class Trick {
  constructor(leader, numPlayers) {
    this.leader = leader;
    this.numPlayers = numPlayers;
    this.plays = [];      // { who, card }  (who = seat index)
    this.leadSuit = null;
  }

  addPlay(who, card) {
    if (!this.leadSuit && !card.isSpecial) {
      this.leadSuit = card.suit;
    }
    this.plays.push({ who, card });
  }

  isComplete() {
    return this.plays.length >= this.numPlayers;
  }

  // Current best play so far (works on incomplete tricks too).
  winningPlay(trumpSuit) {
    const i = trickWinnerIndex(this.plays.map(p => p.card), trumpSuit);
    return i < 0 ? null : this.plays[i];
  }

  winner(trumpSuit) {
    if (!this.isComplete()) return null;
    return this.winningPlay(trumpSuit).who;
  }
}

// "A♠", "10♥", "Q♦" or a special role name ("SUN", "MOON", "DRAGON", "JOKER").
function parseCard(code, copy = 0) {
  if (ROLE[code] && code !== "NONE") return new Card(SPECIAL_SUIT, "0", code, copy);
  return new Card(code.slice(-1), code.slice(0, -1));
}

function cardCode(card) {
  return card.isSpecial ? card.role : card.rank + card.suit;
}

function createDeck(extended = false) {
  const d = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      d.push(new Card(suit, rank));
    }
  }
  if (extended) {
    for (const [role, count] of SPECIAL_COUNTS) {
      for (let k = 0; k < count; k++) d.push(new Card(SPECIAL_SUIT, "0", role, k));
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

// Opponent fan geometry (cards hang down from the top of the seat)
function computeOppFanSlot(slotIndex, totalSlots, scale) {
  const spreadDeg = 24;
  const baseAngle = -spreadDeg / 2;
  const t = (totalSlots > 1) ? (slotIndex / (totalSlots - 1)) : 0.5;
  const angle = baseAngle + t * spreadDeg;
  const offsetX = (slotIndex - (totalSlots - 1) / 2) * 6 * scale;
  const offsetY = -Math.abs(angle) * 0.2 * scale;
  return { angle, offsetX, offsetY };
}

// Helper: centre of a slot/container in viewport coords
function getRectCenter(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
}

// Hand sizes for a whole game.
//   downup: max … 1 … max   updown: 1 … max … 1
//   down:   max … 1         up:     1 … max
function buildRoundSchedule(maxCards, pattern = "downup") {
  const down = [], up = [];
  for (let n = maxCards; n >= 1; n--) down.push(n);
  for (let n = 1; n <= maxCards; n++) up.push(n);
  switch (pattern) {
    case "updown": return up.concat(down.slice(1));
    case "down":   return down;
    case "up":     return up;
    default:       return down.concat(up.slice(1));
  }
}

// Scoring: 1 point per trick, +10 bonus for making the bid exactly.
const EXACT_BID_BONUS = 10;
function scoreForRound(bid, won) {
  return won + (won === bid ? EXACT_BID_BONUS : 0);
}

// Trump coin: a "five-sided coin" — one face per suit plus a blank (no trump),
// so each suit and "no trump" come up 1 time in 5.
const TRUMP_COIN_FACES = ["♠", "♥", "♦", "♣", null];
function flipTrumpCoin() {
  return TRUMP_COIN_FACES[Math.floor(Math.random() * TRUMP_COIN_FACES.length)];
}

// Seat 0 is always the human. Seats go clockwise: 0 → 1 → 2 …
class OhHellGame {
  constructor() {
    this.numPlayers = 4;
    this.schedule = [];
    this.roundIndex = -1;
    this.scores = [];
    this.history = [];
    this.phase = "idle";   // 'idle' | 'bid' | 'play' | 'roundEnd' | 'gameOver'
    this.hands = [];
    this.bids = [];
    this.won = [];
    this.trickHistory = [];
    this.bidding = "simultaneous";  // 'simultaneous' | 'sequential' (dealer's hook)
    this.trumpMode = "coin";        // 'coin' | 'card'
    this.extended = false;          // extended deck with the 8 special cards
    this.bonus = [];                // per-seat bonus points this round (Moon captures Sun)
    this.playedCards = [];
    this.currentTrick = null;
    this.trumpCard = null;
    this.trumpSuit = null;
    this.stockCount = 0;
    this.dealer = 0;
    this.turn = 0;
    this.leader = 0;
  }

  startNewGame({ numPlayers = 4, maxCards = 10, firstDealer = 0, pattern = "downup",
                  bidding = "simultaneous", trumpMode = "coin", extended = false,
                  presetRounds = null } = {}) {
    this.numPlayers = numPlayers;
    // Prepared deals (tutorial): [{ trump, extended, hands: [[codes], ...] }]
    this.presetRounds = presetRounds;
    this.extended = extended;
    this.bidding = bidding;
    this.trumpMode = trumpMode;
    // 52 (or 60) cards, one possibly turned for trump.
    const cap = Math.floor((extended ? 59 : 51) / numPlayers);
    this.schedule = presetRounds
      ? presetRounds.map(r => r.hands[0].length)
      : buildRoundSchedule(Math.max(1, Math.min(maxCards, cap)), pattern);
    this.roundIndex = -1;
    this.scores = new Array(numPlayers).fill(0);
    this.history = [];
    this.dealer = ((firstDealer % numPlayers) + numPlayers) % numPlayers;
    this.phase = "idle";
    this.hands = [];
    this.currentTrick = null;
  }

  get handSize() {
    return this.schedule[this.roundIndex] || 0;
  }

  get totalRounds() {
    return this.schedule.length;
  }

  isLastRound() {
    return this.roundIndex >= this.schedule.length - 1;
  }

  nextSeat(seat) {
    return (seat + 1) % this.numPlayers;
  }

  startRound() {
    if (this.roundIndex >= 0) this.dealer = this.nextSeat(this.dealer);
    this.roundIndex++;

    const preset = this.presetRounds && this.presetRounds[this.roundIndex];
    if (preset) this.extended = !!preset.extended;

    const deck = createDeck(this.extended);
    shuffle(deck);

    const n = this.handSize;
    this.hands = [];
    for (let s = 0; s < this.numPlayers; s++) {
      this.hands.push(new Hand(preset
        ? preset.hands[s].map((c, i) => parseCard(c, i))
        : deck.splice(0, n)));
    }

    if (preset) {
      this.trumpCard = null;
      this.trumpSuit = preset.trump || null;
      deck.length = Math.max(0, deck.length - n * this.numPlayers);
    } else if (this.trumpMode === "coin") {
      this.trumpCard = null;
      this.trumpSuit = flipTrumpCoin();
    } else {
      this.trumpCard = deck.length > 0 ? deck.pop() : null;
      // A turned-up special card means no trump this round.
      this.trumpSuit = (this.trumpCard && !this.trumpCard.isSpecial) ? this.trumpCard.suit : null;
    }
    this.stockCount = deck.length;

    this.bids = new Array(this.numPlayers).fill(null);
    this.won = new Array(this.numPlayers).fill(0);
    this.bonus = new Array(this.numPlayers).fill(0);
    this.playedCards = [];
    this.trickHistory = [];   // completed tricks: { leader, plays }
    this.tricksPlayed = 0;

    this.phase = "bid";
    this.leader = this.nextSeat(this.dealer);
    this.turn = this.leader;
    this.currentTrick = new Trick(this.leader, this.numPlayers);
  }

  bidTotal() {
    return this.bids.reduce((a, b) => a + (b == null ? 0 : b), 0);
  }

  get simultaneous() {
    return this.bidding === "simultaneous";
  }

  // Sequential bidding only: the dealer (last to bid) may not make the bids
  // add up to the hand size. Simultaneous bids have no such restriction.
  forbiddenBid(seat) {
    if (this.simultaneous || seat !== this.dealer) return null;
    const f = this.handSize - this.bidTotal();
    return f >= 0 ? f : null;
  }

  legalBids(seat) {
    const forbidden = this.forbiddenBid(seat);
    const out = [];
    for (let b = 0; b <= this.handSize; b++) {
      if (b !== forbidden) out.push(b);
    }
    return out;
  }

  // Simultaneous: any seat may place its (secret) bid, once.
  // Sequential: seats bid in turn from the dealer's left.
  placeBid(seat, bid) {
    if (this.phase !== "bid") return { ok: false, reason: "not-bidding" };
    if (this.bids[seat] != null) return { ok: false, reason: "already-bid" };
    if (!this.simultaneous && seat !== this.turn) return { ok: false, reason: "not-your-turn" };
    if (!this.legalBids(seat).includes(bid)) return { ok: false, reason: "illegal-bid" };

    this.bids[seat] = bid;

    if (this.bids.every(b => b != null)) {
      this.phase = "play";
      this.turn = this.leader;
      return { ok: true, biddingDone: true };
    }

    this.turn = this.nextSeat(seat);
    return { ok: true, biddingDone: false };
  }

  getLegalMovesFor(seat) {
    if (this.phase !== "play") return [];
    return this.hands[seat].getLegalMoves(this.currentTrick.leadSuit);
  }

  playCard(seat, index) {
    if (this.phase !== "play" || seat !== this.turn) return { ok: false, reason: "not-your-turn" };
    if (!this.getLegalMovesFor(seat).includes(index)) return { ok: false, reason: "illegal" };

    const card = this.hands[seat].removeAt(index);
    this.currentTrick.addPlay(seat, card);
    this.playedCards.push(card);

    if (this.currentTrick.isComplete()) {
      return { ok: true, card, trickComplete: true, winner: this.currentTrick.winner(this.trumpSuit) };
    }

    this.turn = this.nextSeat(seat);
    return { ok: true, card, trickComplete: false };
  }

  resolveCompletedTrick() {
    const winner = this.currentTrick.winner(this.trumpSuit);
    const plays = this.currentTrick.plays.slice();
    this.trickHistory.push({ leader: this.currentTrick.leader, plays });
    this.won[winner]++;

    // Moon captures Sun: bonus for whoever played the Moon.
    let moonCapture = null;
    const sunPlay = plays.find(p => p.card.role === ROLE.SUN);
    const moonPlay = plays.find(p => p.card.role === ROLE.MOON);
    if (sunPlay && moonPlay) {
      this.bonus[moonPlay.who] += MOON_CAPTURE_BONUS;
      moonCapture = { seat: moonPlay.who, bonus: MOON_CAPTURE_BONUS };
    }
    this.tricksPlayed++;

    this.leader = winner;
    this.turn = winner;
    this.currentTrick = new Trick(winner, this.numPlayers);

    const roundOver = this.tricksPlayed >= this.handSize;
    let roundResult = null;

    if (roundOver) {
      const points = this.bids.map((b, i) => scoreForRound(b, this.won[i]) + this.bonus[i]);
      points.forEach((p, i) => { this.scores[i] += p; });
      roundResult = {
        cards: this.handSize,
        trumpSuit: this.trumpSuit,
        dealer: this.dealer,
        bids: this.bids.slice(),
        won: this.won.slice(),
        bonus: this.bonus.slice(),
        points,
        totals: this.scores.slice()
      };
      this.history.push(roundResult);
      this.phase = this.isLastRound() ? "gameOver" : "roundEnd";
    }

    return { winner, plays, roundOver, roundResult, moonCapture, gameOver: this.phase === "gameOver" };
  }

  getViewState() {
    return {
      phase: this.phase,
      numPlayers: this.numPlayers,
      roundNumber: this.roundIndex + 1,
      totalRounds: this.schedule.length,
      handSize: this.handSize,
      trumpSuit: this.trumpSuit,
      trumpCard: this.trumpCard,
      stockCount: this.stockCount,
      dealer: this.dealer,
      turn: this.turn,
      hands: this.hands.map(h => h.cards),
      bids: this.bids,
      won: this.won,
      bonus: this.bonus,
      extended: this.extended,
      scores: this.scores,
      trickCards: this.currentTrick ? this.currentTrick.plays : []
    };
  }
}

// ===== CardView (card DOM fragments only, no table layout) =====

// Preload + decode the face-card art once, so the many re-renders during play
// never show a half-loaded (or alt-text) royal.
const ROYAL_IMAGES = {};
(function preloadRoyals() {
  if (typeof Image === "undefined") return;
  for (const r of ["J", "Q", "K"]) {
    for (const s of ["S", "H", "D", "C"]) {
      const img = new Image();
      img.src = `court/${r}${s}.svg`;
      if (img.decode) img.decode().catch(() => {});
      ROYAL_IMAGES[r + s] = img;
    }
  }
  for (const role of ["JOKER", "DRAGON", "SUN", "MOON"]) {
    for (const f of [role, "icon-" + role]) {
      const img = new Image();
      img.src = `special/${f}.svg`;
      if (img.decode) img.decode().catch(() => {});
      ROYAL_IMAGES[f] = img;
    }
  }
})();

const SPECIAL_LOOK = {
  JOKER:  { name: "Joker",  rule: "never wins (unless only Jokers/Moon are played)" },
  DRAGON: { name: "Dragon", rule: "the first Dragon played wins, unless the Sun is played" },
  SUN:    { name: "Sun",    rule: "beats everything except the Moon" },
  MOON:   { name: "Moon",   rule: "eclipses the Sun (+20 bonus); otherwise never wins" }
};

class CardView {
  cardColorClass(card) {
    if (card.isSpecial) return "s-special";
    switch (card.suit) {
      case "♠": return "s-spade";
      case "♥": return "s-heart";
      case "♦": return "s-diamond";
      case "♣": return "s-club";
      default: return "";
    }
  }

  // Extended-deck special cards: a whole-card art layer (court frame line with
  // the double-ended figure over it) and one symbol in each corner.
  fillSpecialCard(div, card) {
    const info = SPECIAL_LOOK[card.role];
    div.classList.add("special", "special-" + card.role.toLowerCase());
    div.title = info.name + ": " + info.rule;

    if (INFERNAL) {
      // Infernal: a woodcut figure in a framed panel, with its Infernal glyph (special/inf-icon-*.svg) at top left (the Joker is the Fool)
      const L = INFERNAL_SPECIAL[card.role];
      div.classList.add("inf-court-card");
      if (L.name) div.title = L.name + ": " + info.rule;
      const ic = document.createElement("img");   // the special's own glyph, top left only
      ic.className = "sp-corner inf-sp-glyph";
      ic.src = `special/inf-icon-${card.role}.svg`; ic.alt = ""; ic.draggable = false;
      div.appendChild(ic);
      const jumbo = document.createElement("img");
      jumbo.className = "jumbo-pip jumbo-icon";
      jumbo.src = `special/inf-icon-${card.role}.svg`; jumbo.alt = ""; jumbo.draggable = false;
      div.appendChild(jumbo);
      const center = document.createElement("div");
      center.className = "face-icon";
      center.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%";
      const frame = document.createElement("div");
      frame.className = "inf-court";
      const img = document.createElement("img");
      img.src = `img/inf-${card.role}.webp`; img.alt = ""; img.draggable = false;
      frame.appendChild(img); center.appendChild(frame); div.appendChild(center);
      return div;
    }

    for (const cls of ["sp-corner", "sp-corner bottom"]) {
      const ic = document.createElement("img");
      ic.className = cls;
      ic.src = `special/icon-${card.role}.svg`;
      ic.alt = "";
      ic.draggable = false;
      div.appendChild(ic);
    }

    // Large-index faces: the special's icon as an enlarged centre pip.
    const jumbo = document.createElement("img");
    jumbo.className = "jumbo-pip jumbo-icon";
    jumbo.src = `special/icon-${card.role}.svg`;
    jumbo.alt = "";
    jumbo.draggable = false;
    div.appendChild(jumbo);

    // Whole-card art layer (special/ROLE.svg holds the frame line and the
    // figure, which may break out of the frame).
    const img = document.createElement("img");
    img.className = "special-art";
    img.src = `special/${card.role}.svg`;
    img.alt = "";
    img.draggable = false;
    div.appendChild(img);
    return div;
  }

  pipPositionToPercent(col, row) {
    const colMap = { L: 33, C: 50, R: 67 };
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

    if (card && card.isSpecial) return this.fillSpecialCard(div, card);

    const cornerTop = document.createElement("div");
    cornerTop.className = "corner " + (card ? this.cardColorClass(card) : "");
    const cornerBottom = document.createElement("div");
    cornerBottom.className = "corner bottom " + (card ? this.cardColorClass(card) : "");

    if (card) {
      cornerTop.innerHTML =
        `<span class="rank${card.rank === "10" ? " ten" : ""}">${card.rank}</span><span class="suit">${suitMark(card.suit)}</span>`;
      cornerBottom.innerHTML =
        `<span class="rank${card.rank === "10" ? " ten" : ""}">${card.rank}</span><span class="suit">${suitMark(card.suit)}</span>`;
    }

    div.appendChild(cornerTop);
    div.appendChild(cornerBottom);

    // Large-index faces (small screens / option): one enlarged centre pip
    // replaces the pips and court artwork.
    if (card) {
      let jumbo;
      if (card.rank === "A" && card.suit === "♠" && !INFERNAL) {
        // Keep the BugVictim branding on the ace of spades.
        jumbo = document.createElement("img");
        jumbo.className = "jumbo-pip jumbo-icon jumbo-ace";
        jumbo.src = "spade.svg";
        jumbo.alt = "";
        jumbo.draggable = false;
      } else if (card.rank === "J" || card.rank === "Q" || card.rank === "K") {
        // Court cards: crown (K), coronet (Q) or feathered cap (J).
        jumbo = document.createElement("img");
        jumbo.className = "jumbo-pip jumbo-icon jumbo-court";
        jumbo.src = `special/icon-${card.rank}.svg`; jumbo.alt = ""; jumbo.draggable = false;
      } else {
        jumbo = document.createElement("div");
        jumbo.className = "jumbo-pip " + this.cardColorClass(card);
        jumbo.innerHTML = suitMark(card.suit);
      }
      div.appendChild(jumbo);
    }

    if (card) {
      const center = document.createElement("div");
      center.className = "face-icon " + this.cardColorClass(card);
      center.style.position = "absolute";
      center.style.top = "0";
      center.style.left = "0";
      center.style.width = "100%";
      center.style.height = "100%";

      if ((card.rank === "J" || card.rank === "Q" || card.rank === "K" || card.rank === "A") && INFERNAL) {
        // Infernal courts and aces: a woodcut in a framed panel, the index only at top left
        div.classList.add("inf-court-card");
        if (card.rank === "A") div.classList.add("inf-ace", "inf-ace-" + INFERNAL_SUITS[card.suit]);
        const frame = document.createElement("div");
        frame.className = "inf-court";
        const img = document.createElement("img");
        img.src = `img/inf-${card.rank}-${INFERNAL_SUITS[card.suit]}.webp`;
        img.alt = ""; img.draggable = false;
        frame.appendChild(img);
        center.appendChild(frame);
      } else if (card.rank === "J" || card.rank === "Q" || card.rank === "K") {
        // Traditional double-headed court art (court/KH.svg etc.). The suit is
        // shown by the corner indices only, so nothing covers the figures.
        const img = document.createElement("img");
        const suitMap = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };
        const s = suitMap[card.suit] || "";
        img.src = `court/${card.rank}${s}.svg`;
        img.alt = "";   // decorative: the corner index already names the card
        img.draggable = false;
        img.style.pointerEvents = "none";

        const inset = document.createElement("div");
        inset.className = "royal-inset";
        img.className = "royal-inset-img";
        inset.appendChild(img);
        center.appendChild(inset);
      } else {
        center.style.display = "block";

        if (card.rank === "A" && card.suit === "♠" && !INFERNAL) {
          const img = document.createElement("img");
          img.src = "spade.svg";
          img.alt = "";
          img.className = "ace-spade-svg";
          img.draggable = false;
          img.style.pointerEvents = "none";
          center.appendChild(img);
          div.appendChild(center);
          return div;
        }

        const leftX  = 34;
        const rightX = 66;
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
            s.innerHTML = suitMark(card.suit);
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
            s.innerHTML = suitMark(card.suit);
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
            s.innerHTML = suitMark(card.suit);
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
              s.innerHTML = suitMark(card.suit);
              if (card.rank === "A") s.className = "ace-pip"; // one big traditional pip
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
