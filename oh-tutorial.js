// oh-tutorial.js
// Scripted three-hand tutorial: two normal hands, one extended.
//
// Seats: 0 = you (bottom), 1 = Persephone (left), 2 = Loki (right).
// Each hand lists every player's cards, the opponents' bids, and for every
// trick the card each seat plays (your card is the one you'll be asked to
// play; every other card stays disabled).
//
// Coach steps: an array is shown one message at a time with a "Next" button;
// { prompt } waits for you to act. A message can be a string or
// { t: text, spot: CSS selector to highlight }.

const TUTORIAL = {
  opponents: ["Persephone", "Loki"],
  firstDealer: 2,          // so you lead the first trick

  intro: [
    "Welcome to <b>Oh Hell</b>! Each hand you predict exactly how many tricks " +
    "you'll win, then try to win exactly that many. Four quick hands and you're ready."
  ],

  rounds: [
    // ---------------------------------------------------------- Hand 1
    {
      trump: "♥",
      hands: [
        ["A♠", "7♣", "2♥"],
        ["K♠", "5♣", "9♦"],
        ["3♠", "4♥", "Q♦"]
      ],
      bids: [2, 0, 2],
      tricks: [
        { 0: "A♠", 1: "K♠", 2: "3♠" },
        { 0: "7♣", 1: "5♣", 2: "4♥" },
        { 2: "Q♦", 0: "2♥", 1: "9♦" }
      ],
      coach: {
        start: [
          { t: "The <b>trump coin</b> is flipped every hand. It landed on <b>♥</b>: " +
               "any heart beats any card of another suit.", spot: "#trump-slot" },
          { t: "Your 3 cards. <b>A♠</b> is the top spade, almost a sure trick. " +
               "<b>2♥</b> is a trump, so it can win when you can't follow a suit.", spot: "#player-hand" }
        ],
        bid: { prompt: "Everyone bids <b>at the same time, in secret</b>. Bid <b>2</b>: your ace and your trump." },
        reveal: [
          "The tokens flip together: you 2, Persephone 0, Loki 2. Nobody saw anyone else's bid first."
        ],
        play0: { prompt: "You lead. Play the <b>A♠</b>. The highest card of the suit led wins." },
        trick0: [
          "Everyone had to <b>follow suit</b> with a spade, and your ace won."
        ],
        play1: { prompt: "The winner leads next. Lead the <b>7♣</b> and keep your trump for later." },
        trick1: [
          "Loki had no clubs, so could play anything, and played a <b>trump</b> heart. " +
          "Trumps beat every other suit, so Loki won."
        ],
        play2: { prompt: "Loki leads Q♦. You have no diamonds, so trump it with your <b>2♥</b>." },
        trick2: [
          "Even the lowest trump beats a queen of another suit. Two tricks: exactly your bid!"
        ],
        end: { prompt: "<b>Scoring:</b> 1 point per trick, <b>+10</b> for winning exactly your bid. " +
                       "You and Persephone (bid 0, won 0) got the bonus. Loki bid 2, won 1: just 1 point." }
      }
    },

    // ---------------------------------------------------------- Hand 2
    {
      trump: null,
      hands: [
        ["10♦", "3♣"],
        ["K♦", "9♣"],
        ["5♠", "2♠"]
      ],
      bids: [0, 1, 0],
      tricks: [
        { 1: "K♦", 2: "5♠", 0: "10♦" },
        { 1: "9♣", 2: "2♠", 0: "3♣" }
      ],
      coach: {
        start: [
          "The number of cards changes every hand. Now just 2 each.",
          { t: "The coin landed <b>blank: no trump</b>. The highest card of the suit led always wins.", spot: "#trump-slot" },
          { t: "10♦ and 3♣ are weak cards. <b>Zero</b> is a great bid: win nothing and it's still worth 10.", spot: "#player-hand" }
        ],
        bid: { prompt: "Bid <b>0</b>." },
        reveal: [
          "You 0, Persephone 1, Loki 0."
        ],
        play0: { prompt: "Persephone led K♦. You must follow suit: play the <b>10♦</b>. It's lower than the king, so you lose the trick, which is what you want." },
        trick0: [
          "Loki had no diamonds. With no trumps, a card of another suit can never win."
        ],
        play1: { prompt: "Follow with the <b>3♣</b> and stay on zero." },
        trick1: [
          "Persephone bid 1 but won 2. <b>Too many is a miss too</b>: just 2 points. " +
          "You and Loki made zero exactly: +10 each."
        ],
        end: { prompt: "That's the standard game. Next: the <b>Extended deck</b>, an optional variant with special cards." }
      }
    },

    // ---------------------------------------------------------- Hand 3
    {
      trump: "♠",
      extended: true,
      hands: [
        ["DRAGON", "4♦", "MOON"],
        ["A♠", "JOKER", "K♠"],
        ["7♦", "9♦", "SUN"]
      ],
      bids: [2, 0, 1],
      tricks: [
        { 2: "7♦", 0: "DRAGON", 1: "A♠" },
        { 0: "4♦", 1: "JOKER", 2: "9♦" },
        { 2: "SUN", 0: "MOON", 1: "K♠" }
      ],
      coach: {
        start: [
          "The <b>Extended deck is optional</b>: choose <b>Standard</b> or <b>Extended</b> on the start screen.",
          "It adds 8 special cards: the <b>Sun</b>, the <b>Moon</b>, 4 <b>Dragons</b> and 2 <b>Jokers</b>. " +
          "You can play a special card <b>at any time</b>, even if you could follow suit.",
          "<b>Who wins:</b> the Sun beats everything, except the Moon, which <b>eclipses the Sun for +20</b>. " +
          "Otherwise the first Dragon wins. Jokers never win.",
          { t: "Trumps are ♠. You hold a Dragon, a 4♦ and the Moon.", spot: "#player-hand" }
        ],
        bid: { prompt: "The Dragon should win a trick, and the Moon might catch the Sun. Bid <b>2</b>." },
        reveal: [
          "You 2, Persephone 0, Loki 1."
        ],
        play0: { prompt: "Loki led 7♦. You hold a diamond, but specials can be played any time: play the <b>Dragon</b>." },
        trick0: [
          "The Dragon beat even Persephone's A♠ trump."
        ],
        play1: { prompt: "Lead your <b>4♦</b>." },
        trick1: [
          "Persephone played a <b>Joker</b>. Jokers never win, which makes them perfect for losing a trick. Loki's 9♦ won."
        ],
        play2: { prompt: "Loki leads the <b>Sun</b>! Play the <b>Moon</b> to eclipse it." },
        trick2: [
          "<b>Eclipse!</b> The Moon eclipses the Sun: you win the trick <b>and +20</b>, and you made your bid of 2."
        ],
        end: { prompt: "One more extended hand: how to <b>lose</b> tricks on purpose." }
      }
    },

    // ---------------------------------------------------------- Hand 4
    {
      trump: "♣",
      extended: true,
      hands: [
        ["A♥", "JOKER", "MOON"],
        ["K♥", "Q♠", "8♣"],
        ["6♥", "9♠", "J♦"]
      ],
      bids: [1, 2, 0],
      tricks: [
        { 0: "A♥", 1: "K♥", 2: "6♥" },
        { 0: "JOKER", 1: "Q♠", 2: "9♠" },
        { 1: "8♣", 0: "MOON", 2: "J♦" }
      ],
      coach: {
        start: [
          { t: "Trumps are ♣. Your A♥ should win one trick. The <b>Joker</b> and the <b>Moon</b> can help you lose the rest.", spot: "#player-hand" }
        ],
        bid: { prompt: "Bid <b>1</b>: the A♥." },
        reveal: [
          "You 1, Persephone 2, Loki 0."
        ],
        play0: { prompt: "Lead the <b>A♥</b> to win your one trick." },
        trick0: [
          "That's your bid made. Now you must <b>lose</b> the next two tricks."
        ],
        play1: { prompt: "You lead again. Lead the <b>Joker</b>: it can't win a trick." },
        trick1: [
          "A special card doesn't set the suit. Persephone's Q♠ did, and won. Your Joker ducked the trick."
        ],
        play2: { prompt: "Persephone leads 8♣. Play the <b>Moon</b>: without the Sun in the trick, it can't win." },
        trick2: [
          "The Moon only wins by eclipsing the Sun. Otherwise it's a safe card to lose with, like a Joker. You made exactly 1."
        ],
        end: { prompt: "That's the whole game: <b>bid exactly</b>, <b>follow suit</b>, <b>trumps beat suits</b>. With the Extended deck, specials can be played at any time." }
      }
    }
  ],

  outro: [
    "You're ready! A real game deals more cards and the hand sizes go down, then back up. " +
    "Choose your players, <b>Standard</b> or <b>Extended</b> deck, and other options on the start screen. Have fun!"
  ]
};
