// oh-app.js
// Table view + game controller for Oh Hell.

// Corner button icons (drawn, so they look the same everywhere), as in German Whist.
const svgIcon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  full: svgIcon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  exitFull: svgIcon('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  sound: svgIcon('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  muted: svgIcon('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  quit: svgIcon('<path d="M6 6l12 12M18 6L6 18"/>'),
  rules: svgIcon('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8.5 7.5h7M8.5 11h7"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')
};

// Seat positions around the table, clockwise from the human (seat 0, bottom).
const SEAT_LAYOUTS = {
  2: ["bottom", "top"],
  3: ["bottom", "left", "right"],
  4: ["bottom", "left", "top", "right"],
  5: ["bottom", "left", "topleft", "topright", "right"]
};

// Where each seat's card lands in the centre, in card widths / heights, plus a slight tilt.
const TRICK_OFFSETS = {
  bottom:   { x:  0.00, y:  0.36, rot:  0 },
  top:      { x:  0.00, y: -0.22, rot:  0 },
  left:     { x: -0.90, y:  0.00, rot: -8 },
  right:    { x:  0.90, y:  0.00, rot:  8 },
  topleft:  { x: -0.50, y: -0.32, rot: -5 },
  topright: { x:  0.50, y: -0.32, rot:  5 }
};

// Each opponent's hand is turned to face the middle of the table.
const SEAT_ANGLE = { bottom: 0, left: 90, topleft: 135, top: 180, topright: -135, right: -90 };

// Opponents are drawn at random from this pool for each game.
const OPPONENT_POOL = ["Lilith", "Persephone", "Lamia", "Loki", "Old Nick", "Bub",
  "Cerberus", "Brimstone", "Hellga", "Davy Jones", "Banshee", "Faust",
  "Morgana", "Jezebel"];
// Which way each portrait looks as drawn (l/r; the rest face front). They're mirrored as needed to
// look in towards the table.
const PORTRAIT_FACING = { lamia: "r", loki: "r", "old-nick": "r", hellga: "r", "davy-jones": "r", banshee: "r", faust: "r",
  persephone: "l", morgana: "l" };
// Opponent card size relative to yours; recalculated for screen shape and
// player count (see updateOppScale).
let OPP_CARD_SCALE = 0.85;

// Player hand suit order: Spades, Diamonds, Clubs, Hearts (L→R), then specials.
const PLAYER_SUIT_ORDER = { "♠": 0, "♦": 1, "♣": 2, "♥": 3, "Special": 4 };
const SPECIAL_SORT = { MOON: 1, JOKER: 2, DRAGON: 3, SUN: 4 };

// Game pace: 1 = normal, 0.5 = fast. Scales pauses and card flights.
let GAME_SPEED = 1;

// Card faces: "auto" uses large-index faces when cards are drawn small.
let FACES_MODE = "auto";
const LARGE_FACES_BELOW_PX = 64;   // card width at which auto switches
function applyFaces() {
  const large = FACES_MODE === "large" ||
    (FACES_MODE === "auto" && layoutMetrics.cardWidth < LARGE_FACES_BELOW_PX);
  document.body.classList.toggle("faces-large", large);
}
const COIN_BIG = 2.2;
const PHONE_HAND_SCALE = 1.4;   // your hand on phones (see updateScale)
const PHONE_FAN_TIGHTEN = 0.9;  // closer card spacing for that bigger hand
let IS_PHONE = false;
let HAND_SCALE = 1;   // trump coin size while it spins mid-table
// Touch screens get "tap to pick, tap again to play" so a stray tap
// doesn't play a card.
const IS_TOUCH = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
const wait = (ms) => new Promise(r => setTimeout(r, ms * GAME_SPEED));

class GameController {
  constructor() {
    this.game = new OhHellGame();
    this.cardView = new CardView();

    this.difficulty = "easy";
    this.aiEngine = new OhHellAIEngine({ difficulty: this.difficulty });

    this.ANIM_EASE = t => t * t * (3 - 2 * t);

    this.playerName = "Player";
    this.numPlayers = 4;
    this.firstDealMode = "random";
    this.maxCards = 7;               // most cards in a hand (1-10)
    this.pattern = "downup";         // 'downup' | 'updown' | 'down' | 'up'
    this.playersChoice = "4";        // "2".."5" or "random"
    this.bidding = "simultaneous";   // 'simultaneous' (secret tokens) | 'sequential' (dealer's hook)
    this.trumpMode = "coin";         // 'coin' (5-sided coin) | 'card' (turned-up card)
    this.extended = false;           // extended deck: + 2 Jokers, 4 Dragons, Sun, Moon
    this.suitColors = "rbbg";

    this.epoch = 0;          // bumps on every new game; stale async flows bail out
    this.busy = false;       // true while cards are flying
    this.overlayActive = true;
    this.dealVisible = null; // per-seat card counts while dealing
    this.hiddenTrickSeat = null; // seat whose trick card is mid-flight
    this.playFlow = 0;       // id of the play loop currently allowed to run
    this.trumpHidden = false;
    this.coinFace = null;      // face shown while the trump coin spins (undefined = not shown)
    this.coinSpinning = false;
    this.pickedIdx = null;     // touch screens: card picked by the first tap
    this.bidsRevealed = true;  // simultaneous bids stay face down until everyone has bid
    this.revealing = false;
    this.seatEls = [];
    this.tut = null;           // running tutorial (TUTORIAL script) or null
    this.pickOpponents();

    // WebAudio (for win/lose jingle)
    this.audioCtx = null;
    this.playedEndJingle = false;
    this.soundMuted = true;

    this.sfx = {
      cardShove2: new Audio("card-shove-2.ogg")
    };
    this.sfx.cardShove2.preload = "auto";
    this.sfx.cardShove2.volume = 0.4;
    try { this.sfx.cardShove2.load(); } catch (e) { /* ignore */ }

    try {
      const savedMuted = localStorage.getItem("oh_soundMuted");
      if (savedMuted != null) this.soundMuted = (savedMuted === "1");

      const savedName = localStorage.getItem("oh_playerName");
      if (savedName) this.playerName = savedName;

      const savedDiff = localStorage.getItem("oh_difficulty");
      if (savedDiff) this.difficulty = savedDiff;

      const savedPlayers = localStorage.getItem("oh_players") || localStorage.getItem("oh_numPlayers");
      if (savedPlayers === "random") this.playersChoice = "random";
      else if (+savedPlayers >= 2 && +savedPlayers <= 5) { this.playersChoice = String(+savedPlayers); this.numPlayers = +savedPlayers; }
      const savedMax = parseInt(localStorage.getItem("oh_maxCards"), 10);
      if (savedMax >= 1 && savedMax <= 10) this.maxCards = savedMax;
      const savedPattern = localStorage.getItem("oh_pattern");
      if (["downup", "updown", "down", "up"].includes(savedPattern)) this.pattern = savedPattern;

      const savedFirst = localStorage.getItem("oh_firstDeal");
      if (savedFirst) this.firstDealMode = savedFirst;

      const savedSuit = localStorage.getItem("oh_suitcolors");
      if (savedSuit) this.suitColors = savedSuit;

      const savedBidding = localStorage.getItem("oh_bidding");
      if (savedBidding === "simultaneous" || savedBidding === "sequential") this.bidding = savedBidding;
      const savedTrump = localStorage.getItem("oh_trumpMode");
      if (savedTrump === "coin" || savedTrump === "card") this.trumpMode = savedTrump;
      this.extended = localStorage.getItem("oh_extended") === "1";
      if (localStorage.getItem("oh_speed") === "fast") GAME_SPEED = 0.5;
      const savedFaces = localStorage.getItem("oh_faces");
      if (["auto", "classic", "large"].includes(savedFaces)) FACES_MODE = savedFaces;
    } catch (e) { /* ignore */ }

    this.aiEngine.setDifficulty(this.difficulty);

    this.dom = {
      gameArea: document.getElementById("game-area"),
      seats: document.getElementById("seats"),
      deckSlot: document.getElementById("deck-slot"),
      trumpSlot: document.getElementById("trump-slot"),
      trickArea: document.getElementById("trick-area"),
      playerHand: document.getElementById("player-hand"),
      playerInfo: document.getElementById("player-seat-info"),
      roundLabel: document.getElementById("round-label"),
      scoreTable: document.getElementById("score-table"),
      bidPanel: document.getElementById("bid-panel"),
      bidTitle: document.getElementById("bid-title"),
      bidButtons: document.getElementById("bid-buttons"),
      bidNote: document.getElementById("bid-note")
    };

    this.applySoundMuted();
    this.applyFullscreenUi();
    this.bindBidKeys();
    this.bindScorecard();
    this.bindQuit();
    this.bindCornerButtons();
    this.bindStartOverlay();
    // A tap anywhere outside your hand puts a picked card back.
    document.addEventListener("click", (e) => {
      if (this.pickedIdx != null && !e.composedPath().includes(this.dom.playerHand)) this.clearPick(true);
    });

    // Draw an empty table behind the start overlay.
    this.game.startNewGame({ numPlayers: this.numPlayers, maxCards: 5, firstDealer: 0 });
    this.buildSeats();
    this.render();
  }

  // =====================================================
  // =================== Seats / names ===================
  // =====================================================

  // Infernal style: each player's portrait beside their nameplate, on the outer side, turned to look in
  // towards the middle of the table (you are the hooded one)
  setPortrait(seat, els) {
    // it lives inside the nameplate (tucked behind its end), so it's put back each time the name is written
    let p = els.portrait;
    if (!p) { p = els.portrait = document.createElement("div"); p.className = "portrait"; }
    if (p.parentNode !== els.name) els.name.appendChild(p);
    const who = seat === 0 ? "player" : this.seatName(seat).toLowerCase().replace(/\s+/g, "-");
    const pos = seat === 0 ? "bottom" : this.seatPos(seat);
    const onRight = pos === "right" || pos === "topright";   // the outer side; everyone looks in to the middle
    const looksRight = !onRight;
    const face = PORTRAIT_FACING[who];
    if (p.dataset.who !== who) { p.dataset.who = who; p.style.backgroundImage = `url("img/opp-${who}.webp")`; }
    p.classList.toggle("on-right", onRight);
    p.classList.toggle("flip", !!face && face !== (looksRight ? "r" : "l"));
  }

  seatName(seat) {
    if (seat === 0) return (this.playerName && this.playerName.trim()) || "Player";
    return this.opponentNames[(seat - 1) % this.opponentNames.length];
  }

  // Each game: opponents drawn at random from the whole pool, seated in
  // random order.
  pickOpponents() {
    const pool = OPPONENT_POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.opponentNames = pool;
  }

  seatPos(seat) {
    return SEAT_LAYOUTS[this.game.numPlayers][seat];
  }

  // Bigger opponent cards when there's room: wide screens and fewer players.
  updateOppScale() {
    const n = this.game.numPlayers || 4;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    let k = 0.85;
    if (aspect >= 1.7) k += 0.05;          // wide (16:9 and wider)
    else if (aspect < 1.45) k -= 0.08;     // squarer screens
    if (n <= 3) k += 0.06;                 // only side or top seats
    else if (n === 5) k -= 0.03;           // five seats share the space
    if (IS_PHONE) k -= 0.17;               // make room for your bigger hand
    OPP_CARD_SCALE = Math.max(IS_PHONE ? 0.6 : 0.72, Math.min(0.97, k));
    document.documentElement.style.setProperty("--opp-scale", OPP_CARD_SCALE.toFixed(3));
  }

  buildSeats() {
    this.updateOppScale();
    const n = this.game.numPlayers;
    this.dom.seats.innerHTML = "";
    this.dom.trickArea.innerHTML = "";
    this.seatEls = [];

    if (document.body.dataset.players !== String(n)) { document.body.dataset.players = String(n); updateScale(); }

    for (let seat = 0; seat < n; seat++) {
      const pos = this.seatPos(seat);
      let handEl, infoEl;

      if (seat === 0) {
        handEl = this.dom.playerHand;
        infoEl = this.dom.playerInfo;
      } else {
        const seatEl = document.createElement("div");
        seatEl.className = `seat seat-${pos}`;
        seatEl.dataset.seat = String(seat);

        handEl = document.createElement("div");
        handEl.className = "seat-hand";
        handEl.style.setProperty("--seat-rot", SEAT_ANGLE[pos] + "deg");

        infoEl = document.createElement("div");
        infoEl.className = "seat-info";
        infoEl.innerHTML =
          `<div class="name-label"></div><div class="seat-stats"></div>`;

        seatEl.appendChild(handEl);
        seatEl.appendChild(infoEl);
        this.dom.seats.appendChild(seatEl);
      }

      const slot = document.createElement("div");
      slot.className = `trick-slot trick-${pos}`;
      this.dom.trickArea.appendChild(slot);

      this.seatEls.push({
        hand: handEl,
        info: infoEl,
        name: infoEl.querySelector(".name-label"),
        stats: infoEl.querySelector(".seat-stats"),
        slot
      });
    }

    this.layoutTrickSlots();
  }

  layoutTrickSlots() {
    const W = layoutMetrics.cardWidth;
    const H = layoutMetrics.cardHeight;
    const n = this.game.numPlayers;

    this.seatEls.forEach((els, seat) => {
      const pos = this.seatPos(seat);
      const o = TRICK_OFFSETS[pos];
      // With five players the side seats sit a little lower to make room.
      const y = (n === 5 && (pos === "left" || pos === "right")) ? 0.18 : o.y;
      els.slot.style.left = (o.x * W - W / 2) + "px";
      els.slot.style.top = (y * H - H / 2) + "px";
      els.slot.style.transform = `rotate(${o.rot}deg)`;
      els.slot.style.zIndex = "1";
    });
  }

  // =====================================================
  // ====================== Render =======================
  // =====================================================

  render() {
    const g = this.game;
    if (!this.seatEls.length) return;

    this.layoutTrickSlots();
    this.renderPlayerHand();
    for (let seat = 1; seat < g.numPlayers; seat++) this.renderOpponentHand(seat);
    this.renderSeatInfo();
    this.renderTrick();
    this.renderDeck();
    this.renderScoreboard();
    this.updateTurnHighlight();

    document.body.setAttribute("data-phase", g.phase);
  }

  visibleHand(seat) {
    const cards = this.game.hands[seat] ? this.game.hands[seat].cards : [];
    if (this.dealVisible) return cards.slice(0, this.dealVisible[seat]);
    return cards;
  }

  renderPlayerHand() {
    const handDiv = this.dom.playerHand;
    handDiv.innerHTML = "";

    const scale = layoutMetrics.scale;
    const insetBase = 18 * scale;
    const cardHeight = layoutMetrics.cardHeight;
    const cardTop = (cardHeight + 2 * insetBase) - cardHeight;

    const allCards = this.game.hands[0] ? this.game.hands[0].cards : [];
    const shown = this.visibleHand(0);

    const indexed = shown.map(card => ({ card, idx: allCards.indexOf(card) }));
    indexed.sort((a, b) => {
      const s = PLAYER_SUIT_ORDER[a.card.suit] - PLAYER_SUIT_ORDER[b.card.suit];
      if (s !== 0) return s;
      if (a.card.isSpecial) return SPECIAL_SORT[a.card.role] - SPECIAL_SORT[b.card.role];
      return a.card.value - b.card.value;
    });

    let legal = this.playerInputReady() ? this.game.getLegalMovesFor(0) : [];
    const tutIdx = this.tutCardIdx(0);
    if (tutIdx != null) legal = legal.filter(i => i === tutIdx);
    const total = indexed.length;
    // A picked card (touch screens) opens a gap either side of it, so the
    // card next to it is easy to tap instead.
    const pickedSlot = legal.includes(this.pickedIdx) ? indexed.findIndex(o => o.idx === this.pickedIdx) : -1;
    const pickGap = 0.22 * layoutMetrics.cardWidth * HAND_SCALE;

    indexed.forEach((obj, slot) => {
      const pos = computePlayerFanSlot(slot, total, scale * HAND_SCALE * (IS_PHONE ? PHONE_FAN_TIGHTEN : 1));
      if (pickedSlot >= 0 && slot !== pickedSlot) pos.offsetX += slot < pickedSlot ? -pickGap : pickGap;
      const div = this.cardView.createCardElement(obj.card, { clickable: true });

      div.style.top = cardTop + "px";
      div.style.setProperty("--fan-x", pos.offsetX + "px");
      div.style.setProperty("--fan-y", pos.offsetY + "px");
      div.style.setProperty("--fan-angle", pos.angle + "deg");
      div.style.zIndex = String(slot + 100);

      if (legal.includes(obj.idx)) div.classList.add("legal-move");
      // The picked card lifts but keeps its place in the fan, so the cards
      // either side of it can still be tapped.
      if (obj.idx === this.pickedIdx && legal.includes(obj.idx)) div.classList.add("picked");

      div.addEventListener("click", (e) => this.handlePlayerCardClick(obj.idx, e.currentTarget));
      handDiv.appendChild(div);
    });
  }

  renderOpponentHand(seat) {
    const handDiv = this.seatEls[seat].hand;
    handDiv.innerHTML = "";

    const scale = layoutMetrics.scale;
    const cards = this.visibleHand(seat);
    const total = Math.max(cards.length, 1);

    cards.forEach((_, i) => {
      const pos = computeOppFanSlot(i, total, scale);
      const back = this.cardView.createCardElement(cards[i], { back: true });
      back.style.setProperty("--fan-x", pos.offsetX + "px");
      back.style.setProperty("--fan-y", (-pos.offsetY) + "px");
      back.style.setProperty("--fan-angle", pos.angle + "deg");
      back.style.zIndex = String(100 + i);
      handDiv.appendChild(back);
    });
  }

  renderSeatInfo() {
    const g = this.game;
    const inRound = g.phase !== "idle" && !this.dealVisible;

    for (let seat = 0; seat < g.numPlayers; seat++) {
      const els = this.seatEls[seat];
      els.name.textContent = this.seatName(seat);
      this.setPortrait(seat, els);

      const bid = g.bids ? g.bids[seat] : null;
      const won = g.won ? g.won[seat] : 0;

      let html = "";
      if (inRound && seat === g.dealer) {
        html += `<span class="dealer-chip" title="Dealer">D</span>`;
      }

      if (!inRound) {
        html += "";
      } else if (bid == null) {
        const thinking = g.phase === "bid" && (g.simultaneous || g.turn === seat);
        html += `<span class="bid-token empty" title="No bid yet">${thinking ? "…" : ""}</span>` +
          `<span class="stat-muted">${thinking ? "bidding…" : "waiting"}</span>`;
      } else if (!this.bidsRevealed) {
        html += `<span class="bid-token face-down" title="Bid placed face down">?</span>` +
          `<span class="stat-muted">bid placed</span>`;
      } else {
        let cls = "";
        if (won === bid) cls = "on-target";
        else if (won > bid) cls = "over";
        const flip = this.flipTokens ? " flipping" : "";
        const mark = won === bid ? " ✓" : won > bid ? " ✗" : "";
        html += `<span class="bid-token revealed ${cls}${flip}" title="Bid ${bid}">${bid}</span>` +
          `<span class="stat ${cls}">Won <b>${won}</b>${mark}</span>`;
        // Your own status during play: what you still need to do.
        if (seat === 0 && g.phase === "play") {
          const left = g.handSize - g.tricksPlayed;
          const need = bid - won;
          let hint = "";
          if (need < 0) hint = "over: take what you can";
          else if (need === 0) hint = left ? "on target: duck the rest" : "";
          else if (need > left) hint = "can't make it now";
          else hint = `need ${need} more`;
          if (hint) html += `<span class="stat-hint">${hint}</span>`;
        }
      }
      els.stats.innerHTML = html;
    }
  }

  renderTrick() {
    this.seatEls.forEach(els => { els.slot.innerHTML = ""; });

    const plays = this.game.currentTrick ? this.game.currentTrick.plays : [];
    plays.forEach(({ who, card }, i) => {
      if (who === this.hiddenTrickSeat) return;
      const el = this.cardView.createCardElement(card);
      const slot = this.seatEls[who].slot;
      slot.style.zIndex = String(10 + i);
      slot.appendChild(el);
    });
  }

  renderDeck() {
    const g = this.game;
    const deckSlot = this.dom.deckSlot;
    const trumpSlot = this.dom.trumpSlot;
    deckSlot.innerHTML = "";
    trumpSlot.innerHTML = "";

    if (g.phase === "idle") return;

    // The deck only appears in the middle of the table while dealing
    // (and, with a turned-up trump card, until that card is turned).
    deckSlot.classList.toggle("dealing", !!(this.dealVisible || this.trumpHidden));
    if (!this.dealVisible && !this.trumpHidden) {
      deckSlot.innerHTML = "";
    }

    // Stock pile: everything not dealt (shrinks visibly while dealing).
    let stock = g.stockCount;
    if (this.dealVisible) {
      const dealt = this.dealVisible.reduce((a, b) => a + b, 0);
      stock = 52 - dealt;
    } else if (g.trumpCard && this.trumpHidden) {
      stock += 1;
    }
    const deckSize = g.extended ? 60 : 52;
    if (g.trumpMode === "coin") stock = deckSize - g.handSize * g.numPlayers;
    if (this.dealVisible) stock = deckSize - this.dealVisible.reduce((a, b) => a + b, 0);

    let layers = 0;
    if (stock >= 30) layers = 5;
    else if (stock >= 20) layers = 4;
    else if (stock >= 10) layers = 3;
    else if (stock >= 4) layers = 2;
    else if (stock > 0) layers = 1;

    const scale = layoutMetrics.scale;
    if (!this.dealVisible && !this.trumpHidden) layers = 0;
    for (let i = 0; i < layers; i++) {
      const backCard = this.cardView.createCardElement(null, { back: true });
      backCard.style.position = "absolute";
      backCard.style.left = "50%";
      backCard.style.top = "50%";
      backCard.style.transform =
        `translate(-50%, -50%) translate(${i * 2 * scale}px, ${-i * 1.5 * scale}px)`;
      backCard.style.zIndex = String(100 + i);
      backCard.style.boxShadow = (i === layers - 1)
        ? `0 ${4 * scale}px ${6 * scale}px rgba(0,0,0,0.55)`
        : `0 ${2 * scale}px ${3 * scale}px rgba(0,0,0,0.35)`;
      deckSlot.appendChild(backCard);
    }

    if (g.trumpMode === "coin") {
      const face = this.coinSpinning ? this.coinFace : (this.trumpHidden || this.dealVisible ? undefined : g.trumpSuit);
      if (face !== undefined) trumpSlot.appendChild(this.makeCoin(face, this.coinSpinning));
    } else if (g.trumpCard && !this.trumpHidden && !this.dealVisible) {
      trumpSlot.appendChild(this.cardView.createCardElement(g.trumpCard));
    }
  }

  // The five-sided trump coin: a suit, or blank for no trump.
  makeCoin(face, spinning) {
    const coin = document.createElement("div");
    coin.className = "trump-coin" + (spinning ? " spinning" : "") + (face ? "" : " blank");
    if (face) {
      const sym = document.createElement("span");
      sym.className = "coin-suit " + this.cardView.cardColorClass({ suit: face });
      sym.innerHTML = suitMark(face);
      coin.appendChild(sym);
      coin.title = "Trump: " + (INFERNAL ? suitWords({ "♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs" }[face]) : face);
    } else {
      coin.innerHTML = `<span class="coin-blank">No<br>trump</span>`;
      coin.title = "No trump this round";
    }
    return coin;
  }

  renderScoreboard() {
    const g = this.game;

    if (g.phase === "idle" || g.roundIndex < 0) {
      this.dom.roundLabel.textContent = "";
    } else {
      this.dom.roundLabel.innerHTML =
        `Round <b>${g.roundIndex + 1}</b> of ${g.totalRounds}` +
        ` · <b>${g.handSize}</b> card${g.handSize === 1 ? "" : "s"}` +
        (g.trumpSuit ? "" : `<div class="sb-nt">No trump this round</div>`);
    }

    const best = Math.max(...g.scores, 0);
    let rows = "";
    for (let seat = 0; seat < g.numPlayers; seat++) {
      const score = g.scores[seat] || 0;
      const lead = (score === best && best > 0) ? " leader" : "";
      const me = seat === 0 ? " me" : "";
      rows += `<tr class="${lead}${me}"><td>${this.escape(this.seatName(seat))}</td><td>${score}</td></tr>`;
    }

    let bidLine = "";
    if ((g.phase === "bid" || g.phase === "play") && !this.dealVisible && this.bidsRevealed) {
      const total = g.bidTotal();
      const diff = total - g.handSize;
      let feel = "";
      if (g.bids.every(b => b != null)) {
        feel = diff > 0 ? ` <span class="over">(${diff} over)</span>`
             : diff < 0 ? ` <span class="under">(${-diff} under)</span>` : "";
      }
      bidLine = `<tfoot><tr><td>Bids</td><td>${total}/${g.handSize}${feel}</td></tr></tfoot>`;
    }

    this.dom.scoreTable.innerHTML = `<tbody>${rows}</tbody>${bidLine}`;
  }

  escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  updateTurnHighlight() {
    const g = this.game;
    document.body.classList.remove("player-turn");
    this.seatEls.forEach(els => els.name.classList.remove("turn-glow"));

    if (this.overlayActive || this.busy || this.dealVisible) return;
    if (g.phase !== "bid" && g.phase !== "play") return;

    if (g.phase === "bid" && g.simultaneous) {
      g.bids.forEach((b, seat) => { if (b == null) this.seatEls[seat].name.classList.add("turn-glow"); });
      return;
    }

    const els = this.seatEls[g.turn];
    if (els) els.name.classList.add("turn-glow");
    if (g.turn === 0 && g.phase === "play") document.body.classList.add("player-turn");
  }

  playerInputReady() {
    return !this.overlayActive && !this.busy && !this.dealVisible &&
      this.game.phase === "play" && this.game.turn === 0;
  }

  // =====================================================
  // ===================== Animation =====================
  // =====================================================

  // Fly a card (face or back) between two viewport-centre points.
  flyCard({ card = null, from, to, dur = 500, scaleFrom = 1, scaleTo = 1, rotFrom = 0, rotTo = 0, z = 9999 }) {
    dur *= GAME_SPEED;
    const W = layoutMetrics.cardWidth;
    const H = layoutMetrics.cardHeight;

    const el = card
      ? this.cardView.createCardElement(card)
      : this.cardView.createCardElement(null, { back: true });

    el.style.position = "fixed";
    el.style.zIndex = String(z);
    el.style.pointerEvents = "none";
    el.style.transformOrigin = "center center";
    el.style.margin = "0";

    const place = (p) => {
      const x = from.x + (to.x - from.x) * p;
      const y = from.y + (to.y - from.y) * p;
      const s = scaleFrom + (scaleTo - scaleFrom) * p;
      const r = rotFrom + (rotTo - rotFrom) * p;
      el.style.left = (x - W / 2) + "px";
      el.style.top = (y - H / 2) + "px";
      el.style.transform = `rotate(${r}deg) scale(${s})`;
    };

    place(0);
    document.body.appendChild(el);

    return new Promise(resolve => {
      const start = performance.now();
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        el.remove();
        resolve();
      };
      const step = (now) => {
        if (finished) return;
        const t = Math.min(1, (now - start) / dur);
        place(this.ANIM_EASE(t));
        if (t < 1) requestAnimationFrame(step);
        else finish();
      };
      requestAnimationFrame(step);
      // rAF pauses in hidden tabs; never let the game stall on an animation.
      setTimeout(finish, dur + 150);
    });
  }

  seatAngle(seat) {
    return SEAT_ANGLE[this.seatPos(seat)] || 0;
  }

  seatHandCenter(seat) {
    return getRectCenter(this.seatEls[seat].hand);
  }

  slotCenter(seat) {
    return getRectCenter(this.seatEls[seat].slot);
  }

  async animateDeal(ep) {
    const g = this.game;
    const n = g.numPlayers;
    this.dealVisible = new Array(n).fill(0);
    this.busy = true;
    this.render();

    const deckC = getRectCenter(this.dom.deckSlot);
    const flights = [];
    const stagger = Math.max(28, Math.min(70, 1400 / (g.handSize * n)));

    let k = 0;
    for (let round = 0; round < g.handSize; round++) {
      for (let i = 1; i <= n; i++) {
        const seat = (g.dealer + i) % n; // deal starts left of the dealer
        const order = k++;
        const delay = order * stagger;
        flights.push((async () => {
          await wait(delay);
          if (ep !== this.epoch) return;
          if (order % 3 === 0) this.playSfx(this.sfx.cardShove2);
          const to = seat === 0
            ? getRectCenter(this.dom.playerHand)
            : this.seatHandCenter(seat);
          await this.flyCard({
            from: deckC, to, dur: 260,
            scaleTo: seat === 0 ? 1 : OPP_CARD_SCALE,
            rotTo: this.seatAngle(seat)
          });
          if (ep !== this.epoch || !this.dealVisible) return;
          this.dealVisible[seat]++;
          this.render();
        })());
      }
    }

    await Promise.all(flights);
    if (ep !== this.epoch) return;

    this.dealVisible = null;
    this.trumpHidden = true;
    this.render();

    if (g.trumpMode === "coin") {
      await this.animateCoinFlip(ep);
      if (ep !== this.epoch) return;
    } else if (g.trumpCard) {
      // Turn up the trump card.
      await wait(150);
      if (ep !== this.epoch) return;
      this.playSfx(this.sfx.cardShove2);
      await this.flyCard({
        card: g.trumpCard,
        from: getRectCenter(this.dom.deckSlot),
        to: getRectCenter(this.dom.trumpSlot),
        dur: 420
      });
      if (ep !== this.epoch) return;
    }

    this.trumpHidden = false;
    this.busy = false;
    this.render();
  }

  // The coin spins big (COIN_BIG) in the middle of the table, lands, then slides into
  // the trump slot.
  // ----- Touch "pick then play" -----
  showPlayHint() {
    // Only the first few times: after that you know, and it would cover the trick.
    this.playHintsShown = (this.playHintsShown || 0) + 1;
    if (this.playHintsShown > 3) return;
    let hint = document.getElementById("play-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.id = "play-hint";
      hint.textContent = "Tap again to play";
      document.body.appendChild(hint);
    }
    const picked = this.dom.playerHand.querySelector(".card.picked");
    const r = (picked || this.dom.playerHand).getBoundingClientRect();
    hint.style.top = Math.max(4, r.top - 34) + "px";
    hint.style.left = (r.left + r.width / 2) + "px";
    hint.style.display = "block";
  }

  clearPick(rerender = false) {
    const had = this.pickedIdx != null;
    this.pickedIdx = null;
    const hint = document.getElementById("play-hint");
    if (hint) hint.style.display = "none";
    if (had && rerender) this.renderPlayerHand();
  }

  async animateCoinFlip(ep) {
    const faces = TRUMP_COIN_FACES;
    const centre = getRectCenter(this.dom.trickArea);
    const flight = document.createElement("div");
    flight.className = "coin-flight";
    flight.style.left = centre.x + "px";
    flight.style.top = centre.y + "px";
    document.body.appendChild(flight);
    const cleanup = () => flight.remove();
    this.dom.deckSlot.classList.remove("dealing");   // the deal is done; don't show the deck behind the coin

    const show = (face, spinning) => {
      flight.innerHTML = "";
      flight.appendChild(this.makeCoin(face, spinning));
    };

    this.playSfx(this.sfx.cardShove2);
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      show(faces[(i + Math.floor(Math.random() * faces.length)) % faces.length], true);
      this.sfxTick();
      await wait(55 + i * 10);
      if (ep !== this.epoch) return cleanup();
    }

    // Land on the real result.
    const result = this.game.trumpSuit;
    show(result, false);
    flight.firstChild.classList.add("landed");
    this.sfxFlick();
    await wait(750);
    if (ep !== this.epoch) return cleanup();

    // Slide off to the trump slot.
    const to = getRectCenter(this.dom.trumpSlot);
    const dur = 550 * GAME_SPEED;
    const anim = flight.animate([
      { transform: `translate(-50%, -50%) scale(${COIN_BIG})` },
      { transform: `translate(calc(-50% + ${to.x - centre.x}px), calc(-50% + ${to.y - centre.y}px)) scale(1)` }
    ], { duration: dur, easing: "cubic-bezier(.5,0,.3,1)", fill: "forwards" });
    await anim.finished.catch(() => {});
    cleanup();
    if (ep !== this.epoch) return;

    this.coinSpinning = false;
    this.coinFace = null;
    this.trumpHidden = false;
    this.renderDeck();
  }

  async animateTrickToWinner(plays, winner) {
    const target = getRectCenter(this.seatEls[winner].name);
    this.seatEls.forEach(els => { els.slot.innerHTML = ""; });

    await Promise.all(plays.map(({ who, card }) => {
      const from = this.slotCenter(who);
      const rot = TRICK_OFFSETS[this.seatPos(who)].rot;
      return this.flyCard({
        card, from, to: target, dur: 480,
        rotFrom: rot, rotTo: rot, scaleFrom: 1, scaleTo: 0.25, z: 9998
      });
    }));
  }

  // =====================================================
  // ===================== Game flow =====================
  // =====================================================

  startGame() {
    this.epoch++;
    this.clearPick();
    this.busy = false;
    this.dealVisible = null;
    this.hiddenTrickSeat = null;
    this.trumpHidden = false;
    this.playedEndJingle = false;
    this.hideBidPanel();
    this.hideRoundSummary();

    this.pickOpponents();
    if (this.playersChoice === "random") this.numPlayers = 2 + Math.floor(Math.random() * 4);
    const n = this.numPlayers;
    let firstDealer;
    if (this.firstDealMode === "player") firstDealer = 0;
    else if (this.firstDealMode === "opponent") firstDealer = 1 + Math.floor(Math.random() * (n - 1));
    else firstDealer = Math.floor(Math.random() * n);

    this.game.startNewGame({
      numPlayers: n,
      maxCards: this.maxCards,
      pattern: this.pattern,
      firstDealer,
      bidding: this.bidding,
      trumpMode: this.trumpMode,
      extended: this.extended
    });

    this.aiEngine.resetMemory();
    this.aiEngine.setDifficulty(this.difficulty);

    this.buildSeats();
    this.runRound(this.epoch);
  }

  async runRound(ep) {
    this.clearPick();
    this.game.startRound();
    this.bidsRevealed = !this.game.simultaneous;
    this.revealing = false;
    this.flipTokens = false;
    this.render();
    await wait(250);
    if (ep !== this.epoch) return;

    await this.animateDeal(ep);
    if (ep !== this.epoch) return;

    if (this.tut) {
      await this.coach("start");
      if (ep !== this.epoch) return;
    }

    await this.continueBidding(ep);
  }

  async continueBidding(ep) {
    if (this.game.simultaneous) return this.simultaneousBidding(ep);

    const g = this.game;
    while (g.phase === "bid") {
      if (g.turn === 0) {
        this.render();
        this.showBidPanel();
        return; // resumes from onPlayerBid
      }

      this.render();
      await wait(650);
      if (ep !== this.epoch) return;

      const seat = g.turn;
      g.placeBid(seat, this.aiEngine.chooseBid(this.bidContext(seat)));
      this.sfxFlick();
      this.flashStats(seat);
    }

    await this.startPlayAfterBids(ep);
  }

  bidContext(seat) {
    const g = this.game;
    return {
      seat,
      hand: g.hands[seat].cards,
      trumpSuit: g.trumpSuit,
      trumpCard: g.trumpCard,
      numPlayers: g.numPlayers,
      handSize: g.handSize,
      legalBids: g.legalBids(seat),
      dealer: g.dealer,
      simultaneous: g.simultaneous,
      extended: g.extended,
      // Secret bidding: nobody's bid is visible yet.
      bids: g.simultaneous ? new Array(g.numPlayers).fill(null) : g.bids.slice()
    };
  }

  // Everyone bids at once: AIs place face-down tokens while you choose yours,
  // then all tokens flip together.
  async simultaneousBidding(ep) {
    const g = this.game;
    this.render();
    if (this.tut) this.coach("bid");
    this.showBidPanel();

    const order = [];
    for (let s = 1; s < g.numPlayers; s++) order.push(s);
    order.sort(() => Math.random() - 0.5);

    for (const seat of order) {
      await wait(450 + Math.random() * 500);
      if (ep !== this.epoch || g.phase !== "bid") return;
      const bid = this.tut ? this.tutRound().bids[seat] : this.aiEngine.chooseBid(this.bidContext(seat));
      g.placeBid(seat, bid);
      this.sfxFlick();
      this.flashStats(seat);
    }
    await this.maybeRevealBids(ep);
  }

  async maybeRevealBids(ep) {
    const g = this.game;
    if (this.revealing || g.phase !== "play" || this.bidsRevealed) return;
    this.revealing = true;
    this.busy = true; // nobody may lead before the tokens flip

    await wait(500);
    if (ep !== this.epoch) return;

    this.bidsRevealed = true;
    this.flipTokens = true;
    this.playSfx(this.sfx.cardShove2);
    this.render();
    await wait(900);
    if (ep !== this.epoch) return;
    this.flipTokens = false;

    if (this.tut) {
      this.render();
      await this.coach("reveal");
      if (ep !== this.epoch) return;
    }

    await this.startPlayAfterBids(ep);
  }

  async startPlayAfterBids(ep) {
    // Short pause before the first lead; keep input locked so a quick click
    // can't start a second play loop alongside this one.
    this.busy = true;
    this.render();
    await wait(500);
    if (ep !== this.epoch) return;
    this.busy = false;
    await this.continuePlay(ep);
  }

  onPlayerBid(bid) {
    const g = this.game;
    if (g.phase !== "bid" || g.bids[0] != null || this.busy) return;
    if (!g.simultaneous && g.turn !== 0) return;
    const res = g.placeBid(0, bid);
    if (!res.ok) return;
    this.ensureAudioContext();
    if (this.tut) this.hideCoach();
    this.hideBidPanel();
    this.sfxFlick();
    this.flashStats(0);
    if (g.simultaneous) this.maybeRevealBids(this.epoch);
    else this.continueBidding(this.epoch);
  }

  flashStats(seat) {
    this.render();
    const el = this.seatEls[seat] && this.seatEls[seat].stats;
    if (!el) return;
    el.classList.remove("just-bid");
    void el.offsetWidth;
    el.classList.add("just-bid");
  }

  async continuePlay(ep) {
    const g = this.game;
    // Only the most recently started loop may drive the AI.
    const flow = ++this.playFlow;
    const stale = () => ep !== this.epoch || flow !== this.playFlow;

    while (g.phase === "play") {
      if (g.turn === 0) {
        this.render();
        if (this.tut) this.coach("play" + g.tricksPlayed);
        return; // resumes from handlePlayerCardClick
      }

      this.render();
      await wait(380);
      if (stale()) return;

      const result = await this.aiPlay(ep);
      if (stale() || !result) return;

      if (result.trickComplete) {
        await this.finishTrick(ep);
        if (stale()) return;
      }
    }

    if (g.phase === "roundEnd" || g.phase === "gameOver") {
      await wait(400);
      if (ep !== this.epoch) return;
      this.showRoundSummary();
    }
  }

  async aiPlay(ep) {
    const g = this.game;
    const seat = g.turn;
    const hand = g.hands[seat].cards;
    const legal = g.getLegalMovesFor(seat);

    let idx = this.aiEngine.choosePlay({
      hand,
      legal,
      plays: g.currentTrick.plays,
      trumpSuit: g.trumpSuit,
      trumpCard: g.trumpCard,
      numPlayers: g.numPlayers,
      bid: g.bids[seat],
      won: g.won[seat],
      tricksLeft: g.handSize - g.tricksPlayed,
      playedCards: g.playedCards,
      seat,
      bids: g.bids,
      wonAll: g.won,
      trickHistory: g.trickHistory,
      handSize: g.handSize,
      tricksPlayed: g.tricksPlayed,
      leader: g.currentTrick.leader,
      extended: g.extended,
      bonusAll: g.bonus
    });
    const tutIdx = this.tutCardIdx(seat);
    if (tutIdx != null) idx = tutIdx;
    if (!legal.includes(idx)) idx = legal[Math.floor(Math.random() * legal.length)];

    const from = this.seatHandCenter(seat);
    const result = g.playCard(seat, idx);
    if (!result.ok) return null;

    await this.animatePlayToSlot(ep, seat, result.card, from, OPP_CARD_SCALE, this.seatAngle(seat));
    return result;
  }

  async animatePlayToSlot(ep, seat, card, from, scaleFrom, rotFrom = 0) {
    this.busy = true;
    this.hiddenTrickSeat = seat;
    this.render();
    this.sfxFlick();

    const rot = TRICK_OFFSETS[this.seatPos(seat)].rot;
    await this.flyCard({
      card, from, to: this.slotCenter(seat), dur: 420,
      scaleFrom, scaleTo: 1, rotFrom, rotTo: rot
    });
    if (ep !== this.epoch) return;

    this.hiddenTrickSeat = null;
    this.busy = false;
    this.render();
  }

  async handlePlayerCardClick(idx, cardElement) {
    if (!this.playerInputReady()) return;
    const ep = this.epoch;

    this.ensureAudioContext();

    const legal = this.game.getLegalMovesFor(0);
    if (!legal.includes(idx)) return;
    const tutIdx = this.tutCardIdx(0);
    if (tutIdx != null && idx !== tutIdx) return;

    // Touch screens: the first tap picks the card, a second tap plays it.
    if (IS_TOUCH && this.pickedIdx !== idx) {
      this.pickedIdx = idx;
      this.renderPlayerHand();
      this.showPlayHint();
      return;
    }
    this.clearPick();
    if (this.tut) this.hideCoach();

    const from = cardElement ? getRectCenter(cardElement) : getRectCenter(this.dom.playerHand);
    const result = this.game.playCard(0, idx);
    if (!result.ok) return;

    await this.animatePlayToSlot(ep, 0, result.card, from, 1);
    if (ep !== this.epoch) return;

    if (result.trickComplete) {
      await this.finishTrick(ep);
      if (ep !== this.epoch) return;
    }
    await this.continuePlay(ep);
  }

  async finishTrick(ep) {
    this.busy = true;
    this.render();
    await wait(750);
    if (ep !== this.epoch) return;

    const res = this.game.resolveCompletedTrick();
    if (res.moonCapture) { this.showCaptureToast(res.moonCapture); this.sfxMoonCapture(); }
    else if (res.winner === 0) this.sfxTrickMine();
    else this.sfxTrickOther();
    await this.animateTrickToWinner(res.plays, res.winner);
    if (ep !== this.epoch) return;

    this.render();
    this.flashStats(res.winner);
    if (this.tut) {
      await this.coach("trick" + (this.game.tricksPlayed - 1));
      if (ep !== this.epoch) return;
    }
    this.busy = false;
    this.render();
  }

  // =====================================================
  // ====================== Tutorial =====================
  // =====================================================

  // First-time players are offered the tutorial once.
  offerTutorialIfNew() {
    let seen = false;
    try { seen = localStorage.getItem("oh_tutorialSeen") === "1"; } catch (e) { /* ignore */ }
    const offer = document.getElementById("tut-offer");
    if (seen || !offer) return;
    offer.style.display = "flex";
    const close = () => { offer.style.display = "none"; this.markTutorialSeen(); };
    document.getElementById("btn-offer-skip").onclick = close;
    document.getElementById("btn-offer-tutorial").onclick = () => {
      close();
      document.getElementById("btn-tutorial").click();
    };
    setTimeout(() => document.getElementById("btn-offer-tutorial").focus(), 50);
  }

  markTutorialSeen() {
    try { localStorage.setItem("oh_tutorialSeen", "1"); } catch (e) { /* ignore */ }
  }

  startTutorial() {
    const T = TUTORIAL;
    this.epoch++;
    this.clearPick();
    this.busy = false;
    this.dealVisible = null;
    this.hiddenTrickSeat = null;
    this.trumpHidden = false;
    this.hideBidPanel();
    this.hideRoundSummary();

    this.tut = T;
    this.opponentNames = T.opponents.slice();
    this.game.startNewGame({
      numPlayers: T.opponents.length + 1,
      firstDealer: T.firstDealer,
      bidding: "simultaneous",
      trumpMode: "coin",
      presetRounds: T.rounds
    });
    this.buildSeats();
    this.render();

    const ep = this.epoch;
    (async () => {
      await wait(300);
      if (ep !== this.epoch) return;
      await this.coachSteps(T.intro);
      if (ep !== this.epoch) return;
      this.runRound(ep);
    })();
  }

  tutRound() {
    return this.tut ? this.tut.rounds[this.game.roundIndex] : null;
  }

  // Index in `seat`'s hand of the card the script plays this trick (or null).
  tutCardIdx(seat) {
    const r = this.tutRound();
    if (!r || this.game.phase !== "play") return null;
    const trick = r.tricks[this.game.tricksPlayed];
    const code = trick && trick[seat];
    if (!code) return null;
    const idx = this.game.hands[seat].cards.findIndex(c => cardCode(c) === code);
    return idx >= 0 ? idx : null;
  }

  // Show the coach step(s) for `key` in the current hand.
  coach(key) {
    const r = this.tutRound();
    const step = r && r.coach[key];
    if (!step) return Promise.resolve();
    if (Array.isArray(step)) return this.coachSteps(step);
    this.showCoach(step.prompt || step, null);
    return Promise.resolve();
  }

  async coachSteps(steps) {
    const ep = this.epoch;
    const prevBusy = this.busy;
    this.busy = true;
    for (const m of steps) {
      await new Promise(done => this.showCoach(m, done));
      if (ep !== this.epoch) return;
    }
    this.hideCoach();
    this.busy = prevBusy;
  }

  showCoach(msg, onNext) {
    let el = document.getElementById("coach");
    if (!el) {
      el = document.createElement("div");
      el.id = "coach";
      el.innerHTML = `<div class="coach-text"></div>` +
        `<div class="coach-buttons"><button type="button" class="coach-skip">Skip tutorial</button>` +
        `<button type="button" class="coach-next">Next ▸</button></div>`;
      document.body.appendChild(el);
      el.querySelector(".coach-skip").addEventListener("click", () => this.exitTutorial());
    }
    const text = typeof msg === "string" ? msg : msg.t;
    const spot = typeof msg === "string" ? null : msg.spot;
    // Suit symbols in the deck's suit colours.
    const suitCls = { "♠": "s-spade", "♥": "s-heart", "♦": "s-diamond", "♣": "s-club" };
    el.querySelector(".coach-text").innerHTML =
      suitWords(text).replace(/[♠♥♦♣]/g, ch => `<span class="coach-suit ${suitCls[ch]}">${INFERNAL ? suitMark(ch) : ch + "︎"}</span>`);

    this.placeSpot(spot);

    const next = el.querySelector(".coach-next");
    next.style.display = onNext ? "" : "none";
    next.onclick = onNext ? () => { next.onclick = null; onNext(); } : null;
    el.classList.toggle("prompt", !onNext);
    el.style.display = "flex";
    if (onNext) setTimeout(() => next.focus(), 30);
  }

  // Highlight box drawn around what's actually visible: for a hand, the union
  // of its cards (the hand container itself spans the full width).
  placeSpot(selector) {
    let box = document.getElementById("tut-spot");
    if (!selector) {
      if (box) box.style.display = "none";
      window.removeEventListener("resize", this._spotResize || (() => {}));
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.id = "tut-spot";
      document.body.appendChild(box);
    }
    const measure = () => {
      const els = [...document.querySelectorAll(selector)];
      const rects = [];
      els.forEach(el => {
        const cards = el.querySelectorAll(".card");
        (cards.length ? [...cards] : [el]).forEach(c => rects.push(c.getBoundingClientRect()));
      });
      if (!rects.length) { box.style.display = "none"; return; }
      const pad = 8;
      const l = Math.min(...rects.map(r => r.left)) - pad, t = Math.min(...rects.map(r => r.top)) - pad;
      const r = Math.max(...rects.map(r => r.right)) + pad, b = Math.max(...rects.map(r => r.bottom)) + pad;
      Object.assign(box.style, { display: "block", left: l + "px", top: t + "px", width: (r - l) + "px", height: (b - t) + "px" });
    };
    measure();
    window.removeEventListener("resize", this._spotResize || (() => {}));
    this._spotResize = measure;
    window.addEventListener("resize", measure);
  }

  hideCoach() {
    const el = document.getElementById("coach");
    if (el) el.style.display = "none";
    this.placeSpot(null);
  }

  async finishTutorial() {
    const ep = this.epoch;
    await this.coachSteps(this.tut.outro);
    if (ep !== this.epoch) return;
    this.exitTutorial();
  }

  // Rules and Settings in the corner: mid-game popups that borrow the How to play text and the Look & feel
  // tab from the start screen (they go back when the popup closes, so their settings stay wired up).
  bindCornerButtons() {
    document.getElementById("btn-quit").innerHTML = ICONS.quit;
    document.getElementById("btn-rules").innerHTML = ICONS.rules;
    document.getElementById("btn-settings").innerHTML = ICONS.gear;
    document.getElementById("btn-rules").addEventListener("click", e => { e.currentTarget.blur(); this.showLentPopup("Rules", document.querySelector("#instructions-panel .instructions-content")); });
    document.getElementById("btn-settings").addEventListener("click", e => { e.currentTarget.blur(); this.showLentPopup("Settings", document.querySelector('.tab-pane[data-pane="look"]')); });
    const shade = document.getElementById("oh-modal");
    document.getElementById("oh-modal-close").addEventListener("click", () => this.closeLentPopup());
    shade.addEventListener("click", e => { if (e.target === shade) this.closeLentPopup(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && shade.style.display !== "none") this.closeLentPopup(); });
    this.initTips();
  }
  showLentPopup(title, node) {
    if (!node) return;
    this.closeLentPopup();
    const shade = document.getElementById("oh-modal");
    document.getElementById("oh-modal-title").textContent = title;
    this._lent = { node, parent: node.parentNode, next: node.nextSibling, wasActive: node.classList.contains("active") };
    node.classList.add("active");
    shade.querySelector(".oh-modal-slot").appendChild(node);
    shade.querySelector(".oh-modal-panel").classList.toggle("is-rules", title === "Rules");
    shade.style.display = "flex";
    shade.querySelector(".oh-modal-slot").scrollTop = 0;
  }
  closeLentPopup() {
    const shade = document.getElementById("oh-modal");
    if (!shade || shade.style.display === "none") return;
    if (this._lent) {
      const { node, parent, next, wasActive } = this._lent;
      parent.insertBefore(node, next);
      node.classList.toggle("active", wasActive);
      this._lent = null;
    }
    shade.style.display = "none";
  }
  // Tooltips for anything with a data-tip (mouse only; phones have no hover).
  initTips() {
    if (window.matchMedia && matchMedia("(pointer: coarse)").matches) return;
    const tip = document.createElement("div");
    tip.id = "oh-tip";
    document.body.appendChild(tip);
    let cur = null;
    document.addEventListener("mouseover", e => {
      const el = e.target.closest && e.target.closest("[data-tip]");
      if (el === cur) return;
      cur = el;
      if (!el) { tip.classList.remove("on"); return; }
      const r = el.getBoundingClientRect();
      tip.textContent = el.dataset.tip;
      const w = tip.offsetWidth;
      tip.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + "px";
      tip.style.top = (r.bottom + 8 + tip.offsetHeight > window.innerHeight ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + "px";
      tip.classList.add("on");
    });
    document.addEventListener("mousedown", () => { tip.classList.remove("on"); cur = null; });
  }

  // Quit button: confirm, then back to the start screen.
  bindQuit() {
    const btn = document.getElementById("btn-quit");
    const box = document.getElementById("quit-confirm");
    if (!btn || !box) return;
    const close = () => { box.style.display = "none"; };
    btn.addEventListener("click", () => {
      if (this.game.phase === "idle" || document.getElementById("start-overlay").style.display !== "none") return;
      box.style.display = "flex";
      setTimeout(() => document.getElementById("btn-quit-no").focus(), 30);
    });
    document.getElementById("btn-quit-no").addEventListener("click", close);
    document.getElementById("btn-quit-yes").addEventListener("click", () => {
      close();
      const sc = document.getElementById("scorecard");
      if (sc) sc.style.display = "none";
      this.exitTutorial(); // returns to the start screen (works for any game)
    });
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && box.style.display !== "none") close(); });
  }

  exitTutorial() {
    this.tut = null;
    this.epoch++;
    this.clearPick();
    this.busy = false;
    this.dealVisible = null;
    this.hideCoach();
    this.hideBidPanel();
    this.hideRoundSummary();

    this.pickOpponents();
    this.game.startNewGame({ numPlayers: this.numPlayers, maxCards: 5, firstDealer: 0 });
    this.buildSeats();
    this.render();

    const overlay = document.getElementById("start-overlay");
    overlay.style.display = "flex";
    this.overlayActive = true;
    document.body.classList.add("overlay-active");
  }

  showCaptureToast({ seat, bonus }) {
    const t = document.createElement("div");
    t.className = "capture-toast";
    t.textContent = `🌙 Eclipse! ${this.seatName(seat)}'s Moon eclipses the Sun  +${bonus}`;
    document.body.appendChild(t);
    this.playSfx(this.sfx.cardShove2);
    setTimeout(() => t.remove(), 1900);
  }

  // =====================================================
  // ====================== Bidding UI ===================
  // =====================================================

  showBidPanel() {
    const g = this.game;
    const legal = g.legalBids(0);
    const forbidden = g.forbiddenBid(0);
    const trumpTxt = g.trumpSuit
      ? `trump <span class="suit-inline ${this.cardView.cardColorClass({ suit: g.trumpSuit })}">${suitMark(g.trumpSuit)}</span>`
      : "<b>no trump</b>";
    const cardsTxt = `${g.handSize} card${g.handSize === 1 ? "" : "s"}`;

    this.dom.bidTitle.innerHTML = g.simultaneous
      ? `Your secret bid · ${cardsTxt} · ${trumpTxt}`
      : `Your bid · ${cardsTxt} · ${trumpTxt}`;
    if (IS_TOUCH) this.dom.bidTitle.innerHTML = `${g.simultaneous ? "Secret bid" : "Your bid"} · ${cardsTxt}`;

    this.dom.bidButtons.innerHTML = "";
    this.dom.bidPanel.classList.toggle("touch", IS_TOUCH);
    if (IS_TOUCH) {
      this.buildBidPicker(legal);
    } else {
    // Even rows: at most 7 per row, spread so rows differ by at most one.
    const nBtns = g.handSize + 1;
    const rows = Math.ceil(nBtns / 7);
    const perRow = Math.ceil(nBtns / rows);
    const rowEls = [];
    for (let r = 0; r < rows; r++) {
      const row = document.createElement("div");
      row.className = "bid-row";
      this.dom.bidButtons.appendChild(row);
      rowEls.push(row);
    }
    for (let b = 0; b <= g.handSize; b++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(b);
      btn.className = "bid-btn";
      if (this.tut && b !== this.tutRound().bids[0]) {
        btn.disabled = true;
        btn.title = "Tutorial: bid " + this.tutRound().bids[0];
      } else if (!legal.includes(b)) {
        btn.disabled = true;
        btn.title = "The dealer can't make the bids add up to the number of tricks";
      } else {
        btn.addEventListener("click", () => this.onPlayerBid(b));
      }
      rowEls[Math.floor(b / perRow)].appendChild(btn);
    }
    }

    let note;
    if (g.simultaneous) {
      note = "Bids are revealed together.";
    } else {
      const made = g.bids.filter(b => b != null).length;
      note = made
        ? `Bid so far: ${g.bidTotal()} of ${g.handSize} trick${g.handSize === 1 ? "" : "s"}.`
        : "You bid first.";
      if (forbidden != null) note += ` You're the dealer, so you can't bid ${forbidden}.`;
    }
    // The compact touch picker only keeps the dealer's warning.
    if (IS_TOUCH) note = forbidden != null && !g.simultaneous ? `Dealer: you can't bid ${forbidden}.` : "";
    this.dom.bidNote.textContent = note;

    this.dom.bidPanel.style.display = "flex";
  }

  // Touch screens: a slider along the numbers 0..cards (drag it, or tap a
  // number) and a confirm button, so a finger can't hit the wrong bid.
  // Bids you may not make (dealer's hook, tutorial) are struck out.
  buildBidPicker(legal) {
    const n = this.game.handSize;
    const ok = b => (this.tut ? b === this.tutRound().bids[0] : legal.includes(b));
    const box = this.dom.bidButtons;
    let ticks = "";
    for (let b = 0; b <= n; b++) ticks += `<span class="bid-tick${ok(b) ? "" : " no"}" data-b="${b}">${b}</span>`;
    box.innerHTML =
      `<div class="bid-slider">` +
      `<input type="range" class="bid-range" min="0" max="${n}" step="1" aria-label="Bid">` +
      `<div class="bid-ticks">${ticks}</div></div>` +
      `<button type="button" class="bid-confirm"></button>`;
    const range = box.querySelector(".bid-range");
    const confirm = box.querySelector(".bid-confirm");
    const show = () => {
      const b = Number(range.value);
      box.querySelectorAll(".bid-tick").forEach(t => t.classList.toggle("on", Number(t.dataset.b) === b));
      confirm.disabled = !ok(b);
      confirm.innerHTML = ok(b) ? `Bid <b>${b}</b>` : `Can't bid ${b}`;
    };
    range.value = String([...Array(n + 1).keys()].find(ok) ?? 0);
    range.addEventListener("input", show);
    box.querySelectorAll(".bid-tick").forEach(t => t.addEventListener("click", () => { range.value = t.dataset.b; show(); }));
    confirm.addEventListener("click", () => { if (ok(Number(range.value))) this.onPlayerBid(Number(range.value)); });
    show();
  }

  hideBidPanel() {
    this.dom.bidPanel.style.display = "none";
  }

  // Round-by-round scorecard (click the scoreboard).
  bindScorecard() {
    const sb = document.getElementById("scoreboard");
    const box = document.getElementById("scorecard");
    if (!sb || !box) return;
    sb.title = "Show scorecard";
    sb.addEventListener("click", () => this.showScorecard());
    const close = () => { box.style.display = "none"; };
    document.getElementById("btn-scorecard-close").addEventListener("click", close);
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }

  showScorecard() {
    const g = this.game;
    if (!g.history || g.phase === "idle") return;
    const n = g.numPlayers;
    let html = `<table class="scorecard-table"><thead><tr><th>Cards</th><th>Trump</th>`;
    for (let s = 0; s < n; s++) html += `<th>${this.escape(this.seatName(s))}</th>`;
    html += `</tr></thead><tbody>`;
    g.history.forEach(r => {
      html += `<tr><td>${r.cards}</td><td>${r.trumpSuit ? suitMark(r.trumpSuit) : "–"}</td>`;
      for (let s = 0; s < n; s++) {
        const exact = r.bids[s] === r.won[s];
        html += `<td class="${exact ? "exact" : ""}"><span class="sc-bw">${r.bids[s]}/${r.won[s]}</span> <b>${r.totals[s]}</b></td>`;
      }
      html += `</tr>`;
    });
    if (!g.history.length) html += `<tr><td colspan="${n + 2}">No rounds finished yet.</td></tr>`;
    html += `</tbody></table><div class="scorecard-key">bid/won · <b>running total</b> · ${document.body.classList.contains("style-infernal") ? "gold" : "green"} = exact bid</div>`;
    document.querySelector("#scorecard .scorecard-body").innerHTML = html;
    document.getElementById("scorecard").style.display = "flex";
  }

  // Number keys bid while the bid panel is open (0-9).
  bindBidKeys() {
    document.addEventListener("keydown", (e) => {
      if (this.dom.bidPanel.style.display === "none" || e.ctrlKey || e.altKey || e.metaKey) return;
      if (!/^[0-9]$/.test(e.key)) return;
      const btn = [...this.dom.bidButtons.querySelectorAll(".bid-btn")].find(b => b.textContent === e.key);
      if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
    });
  }

  // =====================================================
  // =================== Round summary ===================
  // =====================================================

  showRoundSummary() {
    const g = this.game;
    const r = g.history[g.history.length - 1];
    if (!r) return;

    const overlay = document.getElementById("end-overlay");
    const title = document.getElementById("round-summary-title");
    const sub = document.getElementById("round-summary-sub");
    const table = document.getElementById("round-summary-table");
    const btn = document.getElementById("btn-end-next");

    title.textContent = `Round ${g.roundIndex + 1} of ${g.totalRounds} complete`;

    const gameOver = g.phase === "gameOver";
    if (gameOver) {
      sub.textContent = "That was the last round.";
    } else {
      const nextCards = g.schedule[g.roundIndex + 1];
      const nextDealer = this.seatName(g.nextSeat(g.dealer));
      sub.textContent = `Next: ${nextCards} card${nextCards === 1 ? "" : "s"}, ${nextDealer} deals`;
    }

    let html = `<thead><tr><th>Player</th><th>Bid</th><th>Won</th><th>Points</th><th>Total</th></tr></thead><tbody>`;
    for (let seat = 0; seat < g.numPlayers; seat++) {
      const exact = r.bids[seat] === r.won[seat];
      html += `<tr class="${exact ? "exact" : "missed"}${seat === 0 ? " me" : ""}">` +
        `<td>${this.escape(this.seatName(seat))}</td>` +
        `<td>${r.bids[seat]}</td><td>${r.won[seat]}</td>` +
        `<td>+${r.points[seat]}${exact ? " ✓" : ""}` +
        `${r.bonus && r.bonus[seat] ? ` <span class="bonus-tag" title="Eclipse: the Moon eclipsed the Sun">🌙+${r.bonus[seat]}</span>` : ""}</td>` +
        `<td>${r.totals[seat]}</td></tr>`;
    }
    html += "</tbody>";
    table.innerHTML = html;

    btn.textContent = gameOver ? "Final results" : "Next round";
    btn.onclick = () => {
      this.hideRoundSummary();
      if (this.tut) this.hideCoach();
      if (gameOver && this.tut) this.finishTutorial();
      else if (gameOver) this.showGameResults();
      else this.runRound(this.epoch);
    };
    if (this.tut) {
      btn.textContent = gameOver ? "Finish" : "Next hand";
      this.coach("end");
    }

    overlay.style.display = "flex";
    this.overlayActive = true;
    this.updateTurnHighlight();
    if (r.bids[0] === r.won[0] && !gameOver) this.sfxExact();
    setTimeout(() => btn.focus(), 50);
  }

  hideRoundSummary() {
    const overlay = document.getElementById("end-overlay");
    if (overlay) overlay.style.display = "none";
    const start = document.getElementById("start-overlay");
    this.overlayActive = !!(start && start.style.display !== "none");
  }

  // =====================================================
  // =================== Final results ===================
  // =====================================================

  showGameResults() {
    const g = this.game;
    const overlay = document.getElementById("start-overlay");
    const startPanel = document.getElementById("start-panel");
    const resultsPanel = document.getElementById("results-panel");
    const resultsWinner = document.getElementById("results-winner");
    const resultsSubtitle = document.getElementById("results-subtitle");
    const resultsTable = document.getElementById("results-match-table");
    const closeBtn = document.getElementById("btn-close-results");

    const startBody = overlay.querySelector(".start-body");
    const startButtons = overlay.querySelector(".start-buttons");

    const standings = g.scores
      .map((score, seat) => ({
        seat,
        score,
        exact: g.history.filter(r => r.bids[seat] === r.won[seat]).length
      }))
      .sort((a, b) => b.score - a.score || b.exact - a.exact);

    const top = standings[0].score;
    const winners = standings.filter(s => s.score === top);
    const playerWon = winners.some(s => s.seat === 0);

    if (winners.length === 1) {
      resultsWinner.textContent = winners[0].seat === 0
        ? `${this.seatName(0)} wins!`
        : `${this.seatName(winners[0].seat)} wins!`;
    } else {
      resultsWinner.textContent = "It's a tie!";
    }

    const names = winners.map(w => this.seatName(w.seat)).join(" & ");
    resultsSubtitle.textContent = `${names} · ${top} points`;

    let table = `<table><thead><tr><th>#</th><th>Player</th><th>Exact bids</th><th>Score</th></tr></thead><tbody>`;
    standings.forEach((s, i) => {
      table += `<tr><td>${i + 1}</td><td>${this.escape(this.seatName(s.seat))}</td>` +
        `<td>${s.exact} / ${g.history.length}</td><td>${s.score}</td></tr>`;
    });
    table += `</tbody></table>`;
    resultsTable.innerHTML = table;
    resultsTable.style.display = "block";

    if (!this.playedEndJingle) {
      this.playedEndJingle = true;
      this.playEndArpeggio({ outcome: playerWon ? "win" : "lose" });
    }

    overlay.style.display = "flex";
    this.overlayActive = true;
    document.body.classList.add("overlay-active");
    startPanel.classList.add("results-open");
    if (startBody) startBody.style.display = "none";
    if (startButtons) startButtons.style.display = "none";
    resultsPanel.style.display = "flex";

    closeBtn.onclick = () => this.hideGameResults();
  }

  hideGameResults() {
    const overlay = document.getElementById("start-overlay");
    const startPanel = document.getElementById("start-panel");
    const resultsPanel = document.getElementById("results-panel");
    const startBody = overlay.querySelector(".start-body");
    const startButtons = overlay.querySelector(".start-buttons");

    startPanel.classList.remove("results-open");
    startPanel.style.height = "";
    if (startBody) startBody.style.display = "";
    if (startButtons) startButtons.style.display = "";
    resultsPanel.style.display = "none";

    // Clear the old table while the start screen is up.
    this.epoch++;
    this.game.startNewGame({ numPlayers: this.numPlayers, maxCards: 5, firstDealer: 0 });
    this.buildSeats();
    this.render();
  }

  // =====================================================
  // ==================== Start overlay ==================
  // =====================================================

  bindStartOverlay() {
    const overlay = document.getElementById("start-overlay");
    const nameInput = document.getElementById("player-name-input");
    const opponentRadios = document.querySelectorAll('input[name="opponent"]');
    const playerRadios = document.querySelectorAll('input[name="players"]');
    const firstDealRadios = document.querySelectorAll('input[name="firstdeal"]');
    const suitRadios = document.querySelectorAll('input[name="suitcolors"]');
    const playBtn = document.getElementById("btn-play");
    const patternRadios = document.querySelectorAll('input[name="pattern"]');
    const instrBtn = document.getElementById("btn-instructions");
    const instrPanel = document.getElementById("instructions-panel");
    const instrDone = document.getElementById("btn-instructions-done");
    const startBody = overlay.querySelector(".start-body");
    const startButtons = overlay.querySelector(".start-buttons");

    document.body.classList.add("overlay-active");

    if (nameInput) nameInput.value = this.playerName || "Player";
    opponentRadios.forEach(r => { r.checked = (r.value === this.difficulty); });
    playerRadios.forEach(r => { r.checked = (r.value === this.playersChoice); });
    patternRadios.forEach(r => { r.checked = (r.value === this.pattern); });
    firstDealRadios.forEach(r => { r.checked = (r.value === this.firstDealMode); });
    suitRadios.forEach(r => { r.checked = (r.value === this.suitColors); });
    const biddingRadios = document.querySelectorAll('input[name="bidding"]');
    const trumpRadios = document.querySelectorAll('input[name="trumpmode"]');
    const deckRadios = document.querySelectorAll('input[name="deck"]');
    // Table surface (applied immediately, remembered).
    const TABLES = ["green", "red", "blue", "walnut", "mahogany", "tavern", "marble", "souls"];
    const applyTable = (t) => {
      TABLES.forEach(x => document.body.classList.remove("table-" + x));
      document.body.classList.add("table-" + t);
      // the Souls table is animated; a background must never stop the start screen working
      try { if (typeof SOULS !== "undefined") SOULS.setActive(t === "souls"); } catch (e) { /* ignore */ }
    };
    let table = "green";
    try { const t = localStorage.getItem("oh_table"); if (TABLES.includes(t)) table = t; } catch (e) { /* ignore */ }
    applyTable(table);
    document.querySelectorAll('input[name="table"]').forEach(r => {
      r.checked = (r.value === table);
      r.addEventListener("change", () => {
        applyTable(r.value);
        try { localStorage.setItem("oh_table", r.value); } catch (e) { /* ignore */ }
      });
    });

    // Card back (applied immediately, remembered).
    const BACKS = ["bugvictim", "hellfire", "classic-blue", "classic-red", "drakeharbour", "artifact", "infernal"];
    const applyBack = (k) => {
      BACKS.forEach(x => document.body.classList.remove("back-" + x));
      document.body.classList.add("back-" + k);
    };
    let back = "bugvictim";
    try { const k = localStorage.getItem("oh_cardback"); if (BACKS.includes(k)) back = k; } catch (e) { /* ignore */ }
    applyBack(back);
    document.querySelectorAll('input[name="cardback"]').forEach(r => {
      r.checked = (r.value === back);
      r.addEventListener("change", () => {
        applyBack(r.value);
        try { localStorage.setItem("oh_cardback", r.value); } catch (e) { /* ignore */ }
      });
    });

    document.querySelectorAll('input[name="faces"]').forEach(r => {
      r.checked = (r.value === FACES_MODE);
      r.addEventListener("change", () => {
        FACES_MODE = r.value;
        applyFaces();
        try { localStorage.setItem("oh_faces", r.value); } catch (e) { /* ignore */ }
      });
    });
    applyFaces();

    // Suit symbols: Classic or Infernal (redraws whatever is on the table)
    const applySuitSet = v => {
      INFERNAL = v === "infernal";
      document.body.classList.toggle("suits-infernal", INFERNAL);
    };
    let suitset = "classic";
    try { if (localStorage.getItem("oh_suits") === "infernal") suitset = "infernal"; } catch (e) { /* ignore */ }
    applySuitSet(suitset);
    document.querySelectorAll('input[name="suitset"]').forEach(r => {
      r.checked = (r.value === suitset);
      r.addEventListener("change", () => {
        applySuitSet(r.value);
        try { localStorage.setItem("oh_suits", r.value); } catch (e) { /* ignore */ }
        try { this.render(); } catch (e) { /* ignore */ }
      });
    });

    // Style: Classic or Infernal. Picking one sets the table, card back and suits to its own (by clicking
    // their options, so they're saved as usual); any of them can be changed afterwards.
    const STYLE_DEFAULTS = {
      classic: { table: "green", cardback: "bugvictim", suitset: "classic" },
      infernal: { table: "souls", cardback: "infernal", suitset: "infernal" }
    };
    const styleRadios = document.querySelectorAll('[data-style-group] input');
    const showStyle = v => {
      document.body.classList.toggle("style-infernal", v === "infernal");
      styleRadios.forEach(r => { r.checked = r.value === v; });
    };
    const applyStyleDefaults = v => {
      for (const [name, value] of Object.entries(STYLE_DEFAULTS[v])) {
        const r = document.querySelector(`input[name="${name}"][value="${value}"]`);
        if (r && !r.checked) r.click();
      }
    };
    let style = "classic";
    try { if (localStorage.getItem("oh_style") === "infernal") style = "infernal"; } catch (e) { /* ignore */ }
    showStyle(style);
    styleRadios.forEach(r => r.addEventListener("change", () => {
      if (!r.checked) return;
      style = r.value;
      try { localStorage.setItem("oh_style", style); } catch (e) { /* ignore */ }
      showStyle(style);
      applyStyleDefaults(style);
    }));
    document.querySelectorAll(".style-reset").forEach(b => b.addEventListener("click", () => applyStyleDefaults(style)));

    const speedRadios = document.querySelectorAll('input[name="speed"]');
    speedRadios.forEach(r => { r.checked = (r.value === (GAME_SPEED < 1 ? "fast" : "normal")); });
    speedRadios.forEach(r => r.addEventListener("change", () => {
      GAME_SPEED = r.value === "fast" ? 0.5 : 1;
      try { localStorage.setItem("oh_speed", r.value); } catch (e) { /* ignore */ }
    }));
    deckRadios.forEach(r => { r.checked = (r.value === (this.extended ? "extended" : "standard")); });
    biddingRadios.forEach(r => { r.checked = (r.value === this.bidding); });
    trumpRadios.forEach(r => { r.checked = (r.value === this.trumpMode); });

    const readSettings = () => {
      biddingRadios.forEach(r => { if (r.checked) this.bidding = r.value; });
      trumpRadios.forEach(r => { if (r.checked) this.trumpMode = r.value; });
      deckRadios.forEach(r => { if (r.checked) this.extended = (r.value === "extended"); });
      opponentRadios.forEach(r => { if (r.checked) this.difficulty = r.value; });
      playerRadios.forEach(r => {
        if (!r.checked) return;
        this.playersChoice = r.value;
        if (r.value !== "random") this.numPlayers = parseInt(r.value, 10);
      });
      patternRadios.forEach(r => { if (r.checked) this.pattern = r.value; });
      firstDealRadios.forEach(r => { if (r.checked) this.firstDealMode = r.value; });
      this.aiEngine.setDifficulty(this.difficulty);
    };

    const applySuitColorsClass = (mode) => {
      document.body.classList.remove("suitcolors-classic", "suitcolors-rbbg", "suitcolors-rbbo");
      document.body.classList.add(`suitcolors-${mode}`);
    };

    const chooseSuitColors = () => {
      let mode = this.suitColors || "rbbg";
      suitRadios.forEach(r => { if (r.checked) mode = r.value; });
      this.suitColors = mode;
      applySuitColorsClass(mode);
      try { localStorage.setItem("oh_suitcolors", this.suitColors); } catch (e) { /* ignore */ }
    };

    readSettings();
    chooseSuitColors();
    suitRadios.forEach(r => r.addEventListener("change", chooseSuitColors));

    // ---- tabs ----
    const tabBtns = overlay.querySelectorAll(".tab-btn");
    const showTab = (name) => {
      tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
      overlay.querySelectorAll(".tab-pane").forEach(p => p.classList.toggle("active", p.dataset.pane === name));
    };
    tabBtns.forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));

    // ---- hand sizes ----
    const maxEl = document.getElementById("max-cards-value");
    const summaryEl = document.getElementById("round-summary-line");
    const playSub = document.getElementById("btn-play-sub");
    const updateSummary = () => {
      readSettings();
      maxEl.textContent = String(this.maxCards);
      const sched = buildRoundSchedule(this.maxCards, this.pattern);
      const path = sched.length > 2
        ? { downup: `${this.maxCards} → 1 → ${this.maxCards}`, updown: `1 → ${this.maxCards} → 1`,
            down: `${this.maxCards} → 1`, up: `1 → ${this.maxCards}` }[this.pattern]
        : sched.join(" → ");
      const hands = `${sched.length} hand${sched.length === 1 ? "" : "s"}`;
      const who = this.playersChoice === "random" ? "2–5 players" : `${this.numPlayers} players`;
      summaryEl.textContent = `${path} cards · ${hands}`;
      if (playSub) playSub.textContent = `${who} · ${hands}`;
    };
    overlay.querySelectorAll(".step-btn").forEach(b => b.addEventListener("click", () => {
      this.maxCards = Math.max(1, Math.min(10, this.maxCards + parseInt(b.dataset.step, 10)));
      updateSummary();
    }));
    [...patternRadios, ...playerRadios].forEach(r => r.addEventListener("change", updateSummary));

    // ---- presets ----
    const setRadio = (name, value) => {
      const r = overlay.querySelector(`input[name="${name}"][value="${value}"]`);
      if (r) r.checked = true;
    };
    const PRESETS = {
      quick:    { players: "4", maxCards: 5,  pattern: "downup", bidding: "simultaneous", trumpmode: "coin", deck: "standard" },
      classic:  { players: "4", maxCards: 10, pattern: "downup", bidding: "sequential",   trumpmode: "card", deck: "standard" },
      house:    { maxCards: 7,  pattern: "downup", bidding: "simultaneous", trumpmode: "coin", deck: "standard" },
      extended: { maxCards: 7,  pattern: "downup", bidding: "simultaneous", trumpmode: "coin", deck: "extended" }
    };
    overlay.querySelectorAll(".preset-btn").forEach(b => b.addEventListener("click", () => {
      const p = PRESETS[b.dataset.preset];
      if (p.players) setRadio("players", p.players);
      ["pattern", "bidding", "trumpmode", "deck"].forEach(k => setRadio(k, p[k]));
      this.maxCards = p.maxCards;
      overlay.querySelectorAll(".preset-btn").forEach(x => x.classList.toggle("active", x === b));
      updateSummary();
      playerRadios.forEach(r => { if (r.checked) r.dispatchEvent(new Event("change")); });
    }));
    updateSummary();

    // Preview the seat layout behind the overlay when the player count changes.
    playerRadios.forEach(r => r.addEventListener("change", () => {
      readSettings();
      this.game.startNewGame({ numPlayers: this.numPlayers, maxCards: 5, firstDealer: 0 });
      this.buildSeats();
      this.render();
    }));

    const startHandler = () => {
      const rawName = nameInput && nameInput.value ? nameInput.value.trim() : "";
      this.playerName = rawName || "Player";
      readSettings();

      try {
        localStorage.setItem("oh_playerName", this.playerName);
        localStorage.setItem("oh_difficulty", this.difficulty);
        localStorage.setItem("oh_players", this.playersChoice);
        localStorage.setItem("oh_maxCards", String(this.maxCards));
        localStorage.setItem("oh_pattern", this.pattern);
        localStorage.setItem("oh_firstDeal", this.firstDealMode);
        localStorage.setItem("oh_suitcolors", this.suitColors);
        localStorage.setItem("oh_bidding", this.bidding);
        localStorage.setItem("oh_trumpMode", this.trumpMode);
        localStorage.setItem("oh_extended", this.extended ? "1" : "0");
      } catch (e) { /* ignore */ }

      overlay.style.display = "none";
      this.overlayActive = false;
      document.body.classList.remove("overlay-active");

      this.ensureAudioContext();
      this.startGame();
    };

    if (playBtn) playBtn.addEventListener("click", () => startHandler());

    // Splash: BugVictim logo, any click or key goes to the start panel.
    const splash = document.getElementById("splash");
    if (splash) {
      // The click is the user gesture browsers require for fullscreen and audio.
      const dismiss = () => {
        if (splash.classList.contains("gone")) return;
        splash.classList.add("gone");
        try {
          const root = document.documentElement;
          const fs = root.requestFullscreen || root.webkitRequestFullscreen;
          const p = fs && !this.getFullscreenElement() ? fs.call(root) : null;
          if (p && typeof p.catch === "function") p.catch(() => {});
        } catch (e) { /* ignore */ }
        this.setSoundMuted(false);
        this.ensureAudioContext();
        setTimeout(() => {
          splash.remove();
          this.offerTutorialIfNew();
        }, 600);
      };
      splash.addEventListener("click", dismiss);
      if (window.__splashEarly) dismiss();   // clicked while the game was still loading
      splash.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") { e.preventDefault(); dismiss(); }
      });
      setTimeout(() => splash.focus(), 50);
    }
    const tutBtn = document.getElementById("btn-tutorial");
    if (tutBtn) tutBtn.addEventListener("click", () => {
      this.markTutorialSeen();
      overlay.style.display = "none";
      this.overlayActive = false;
      document.body.classList.remove("overlay-active");
      this.ensureAudioContext();
      this.startTutorial();
    });


    const closeInstructions = () => {
      const startPanelEl = document.getElementById("start-panel");
      if (startPanelEl) {
        startPanelEl.classList.remove("instructions-open");
        startPanelEl.style.height = "";
      }
      if (startBody) startBody.style.display = "";
      if (startButtons) startButtons.style.display = "";
      instrPanel.style.display = "none";
      if (instrBtn) instrBtn.focus();
    };

    if (instrBtn && instrPanel) {
      instrBtn.addEventListener("click", () => {
        const startPanelEl = document.getElementById("start-panel");
        // The How to play page sizes itself (see oh.css), not to the start panel.
        if (startPanelEl) startPanelEl.classList.add("instructions-open");
        if (startBody) startBody.style.display = "none";
        if (startButtons) startButtons.style.display = "none";
        instrPanel.style.display = "flex";
        if (instrDone) setTimeout(() => instrDone.focus(), 50);
      });
    }

    if (instrDone && instrPanel) instrDone.addEventListener("click", closeInstructions);

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && instrPanel && instrPanel.style.display !== "none") {
        closeInstructions();
      }
    });
  }

  // =====================================================
  // ================= Sound / fullscreen ================
  // =====================================================

  applySoundMuted() {
    const muted = !!this.soundMuted;

    try {
      for (const k of Object.keys(this.sfx)) {
        const a = this.sfx[k];
        if (a && typeof a === "object") a.muted = muted;
      }
    } catch (e) { /* ignore */ }

    const btn = document.getElementById("btn-sound");
    if (btn) {
      btn.innerHTML = muted ? ICONS.muted : ICONS.sound;
      btn.setAttribute("aria-pressed", muted ? "true" : "false");
      btn.dataset.tip = muted ? "Sound: off" : "Sound: on";
      btn.classList.toggle("muted", muted);

      if (!btn.__ohBound) {
        btn.__ohBound = true;
        btn.addEventListener("click", () => {
          this.setSoundMuted(!this.soundMuted);
          if (!this.soundMuted) this.ensureAudioContext();
        });
      }
    }

    try { localStorage.setItem("oh_soundMuted", muted ? "1" : "0"); } catch (e) { /* ignore */ }
  }

  setSoundMuted(muted) {
    this.soundMuted = !!muted;
    this.applySoundMuted();
  }

  getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  isFullscreenEnabled() {
    return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  }

  applyFullscreenUi() {
    const btn = document.getElementById("btn-fullscreen");
    if (!btn) return;

    const root = document.documentElement;
    const supported = this.isFullscreenEnabled() && !!(root.requestFullscreen || root.webkitRequestFullscreen);
    if (!supported) {
      btn.style.display = "none";
      return;
    }

    const isFs = !!this.getFullscreenElement();
    btn.innerHTML = isFs ? ICONS.exitFull : ICONS.full;
    btn.setAttribute("aria-pressed", isFs ? "true" : "false");
    btn.dataset.tip = isFs ? "Leave fullscreen" : "Fullscreen";

    if (!btn.__ohBound) {
      btn.__ohBound = true;
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        try {
          if (this.getFullscreenElement()) {
            const fn = document.exitFullscreen || document.webkitExitFullscreen;
            const p = fn && fn.call(document);
            if (p && typeof p.catch === "function") p.catch(() => {});
          } else {
            const fn = root.requestFullscreen || root.webkitRequestFullscreen;
            const p = fn && fn.call(root);
            if (p && typeof p.catch === "function") p.catch(() => {});
          }
        } catch (e) { /* ignore */ }
      });
    }

    if (!this.__ohFullscreenChangeBound) {
      this.__ohFullscreenChangeBound = true;
      document.addEventListener("fullscreenchange", () => this.applyFullscreenUi());
      document.addEventListener("webkitfullscreenchange", () => this.applyFullscreenUi());
    }
  }

  playSfx(audio) {
    if (this.soundMuted || !audio) return;
    try {
      // Play a fresh copy so rapid repeats overlap instead of cutting each
      // other off (restarting one element makes quick sounds thin and quiet).
      const a = audio.cloneNode();
      a.volume = audio.volume;
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.audioCtx = new AC();
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      try { this.audioCtx.resume().catch(() => {}); } catch (e) { /* ignore */ }
    }
    return this.audioCtx;
  }

  // Short synthesised effects. notes: [[freqHz, startSec, durSec], ...]
  playTones(notes, { type = "triangle", gain = 0.12 } = {}) {
    if (this.soundMuted) return;
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const [f, t0, d] of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, now + t0);
      g.gain.setValueAtTime(0.0001, now + t0);
      g.gain.exponentialRampToValueAtTime(gain, now + t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t0 + d);
      osc.connect(g).connect(ctx.destination);
      osc.start(now + t0);
      osc.stop(now + t0 + d + 0.02);
    }
  }

  // A card landing: two quick filtered noise bursts, the double flick German Whist and Artifact use
  // (it replaced the recorded card-place sound).
  sfxFlick() {
    if (this.soundMuted) return;
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    const burst = (t, dur, freq, peak) => {
      const now = ctx.currentTime + t;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * (dur + 0.02)), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = freq;
      f.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(peak, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(f).connect(g).connect(ctx.destination);
      src.start(now);
      src.stop(now + dur + 0.02);
    };
    burst(0, 0.06, 2600, 0.29);
    burst(0.07, 0.05, 3400, 0.22);
  }
  sfxTick()        { this.playTones([[1800, 0, 0.03]], { type: "square", gain: 0.035 }); }
  sfxTrickMine()   { this.playTones([[784, 0, 0.12], [1175, 0.08, 0.2]], { gain: 0.13 }); }
  sfxTrickOther()  { this.playTones([[330, 0, 0.14]], { gain: 0.08 }); }
  sfxExact()       { this.playTones([[523, 0, 0.12], [659, 0.09, 0.12], [784, 0.18, 0.12], [1047, 0.27, 0.3]], { gain: 0.14 }); }
  sfxMoonCapture() {
    this.playTones([[392, 0, 0.18], [523, 0.12, 0.18], [659, 0.24, 0.18], [784, 0.36, 0.18], [1047, 0.48, 0.45]],
      { type: "sine", gain: 0.17 });
  }

  playEndArpeggio({ outcome } = {}) {
    if (this.soundMuted) return;
    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

    // Win: upbeat arpeggio. Lose: diminished-7 arpeggios stepping down.
    const seq = (outcome === "lose")
      ? [
        60, 63, 66, 69,  59, 62, 65, 68,  58, 61, 64, 67,
        57, 60, 63, 66,  56, 59, 62, 65,  55, 58, 61, 64
      ].map(midiToFreq)
      : [
        261.63, 329.63, 392.00, 523.25, 659.25,
        440.00, 523.25, 698.46, 587.33, 349.23,
        698.46, 587.33, 349.23, 698.46, 493.88,
        587.33, 783.99, 493.88, 659.25, 392.00,
        493.88, 659.25, 392.00, 523.25
      ];

    const noteGap = 0.1;
    const noteDur = 0.09;
    const totalTime = seq.length * noteGap;

    const gainNode = ctx.createGain();
    gainNode.connect(ctx.destination);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(0.22, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + totalTime + 0.12);

    seq.forEach((freq, index) => {
      const t = now + index * noteGap;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      osc.connect(gainNode);
      osc.start(t);
      osc.stop(t + noteDur);
    });

    setTimeout(() => {
      try { gainNode.disconnect(); } catch (_) {}
    }, (totalTime + 0.25) * 1000);
  }
}

// ---- scaling glue ----
function updateScale() {
  const cardsInHand = 10;
  const maxFanWidth = window.innerWidth * 0.9;
  const overlapFactor = 0.35;
  const scaleFromFan = maxFanWidth / (cardsInHand * BASE_CARD_WIDTH * overlapFactor);

  // Side seats + centre trick need roughly 7.5 card widths across.
  const scaleFromWidth = (window.innerWidth * 0.95) / (BASE_CARD_WIDTH * 7.5);

  // Top seat, trick area, player hand + labels stacked vertically.
  // (desktop windows have room to spare, so the rows are packed a little tighter and every card is bigger)
  const desktop = !(window.innerHeight <= 500 && window.innerWidth > window.innerHeight);
  // five players: the two top seats sit beside the trick, so their cards grow a little less
  const five = document.body && document.body.dataset.players === "5";
  const layoutRows = desktop ? (five ? 4.6 : 4.5) : 4.9;
  const scaleFromHeight = (window.innerHeight * 0.92) / (BASE_CARD_HEIGHT * layoutRows);

  let scale = Math.min(scaleFromFan, scaleFromWidth, scaleFromHeight);
  if (!isFinite(scale) || scale <= 0) scale = 1;
  scale = Math.max(0.4, scale);

  const root = document.documentElement;
  root.style.setProperty("--card-scale", scale.toString());
  root.style.setProperty("--index-size", Math.max(MIN_INDEX_PX, BASE_INDEX_PX * scale) + "px");
  root.style.setProperty("--pip-size", Math.max(MIN_PIP_PX, BASE_PIP_PX * scale) + "px");

  // Phones in landscape: your own hand is drawn bigger (it grows up from the
  // bottom edge) and the opponents' fans a little smaller.
  IS_PHONE = window.innerHeight <= 500 && window.innerWidth > window.innerHeight;
  HAND_SCALE = IS_PHONE ? PHONE_HAND_SCALE : 1;
  root.style.setProperty("--hand-scale", String(HAND_SCALE));

  layoutMetrics.scale = scale;
  layoutMetrics.cardWidth = BASE_CARD_WIDTH * scale;
  layoutMetrics.cardHeight = BASE_CARD_HEIGHT * scale;
  if (document.body) applyFaces();
}

updateScale();
const controller = new GameController();

window.addEventListener("resize", () => {
  updateScale();
  controller.updateOppScale();
  controller.render();
});
