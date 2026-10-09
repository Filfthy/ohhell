// bv-more.js - "More card games" and "Please share with your friends", shared by BugVictim's card games.
// BVMore.init({...}) adds: a note on the splash, a More card games button and a sharing strip under the
// start buttons, and the More card games popup (in the game's own popup style).
// Each game sets its colours with the --bv-* variables (see bv-more.css).

const BV_GAMES = {
  "drakeharbour": { title: "Drakeharbour Syndicates", devices: "Desktop", image: "drakeharbour",
    description: "Meld cards to found Charters, spend stamina in a busy guild town and complete quests for renown, against up to three computer rivals." },
  "german-whist": { title: "German Whist", devices: "Mobile & desktop", image: "german-whist-v2",
    description: "Build your hand, then battle for tricks in this classic two-player card game. Choose from four computer skill levels." },
  "artifact": { title: "Artifact", devices: "Mobile & desktop", image: "artifact",
    description: "Tactical space rummy. Collect planet cards and steer a probe to discover alien artifacts, playing against up to three computer opponents." },
  "oh-hell-extended": { title: "Oh Hell! Extended", devices: "Mobile & desktop", image: "oh-hell-extended",
    description: "Bid your tricks, then win exactly that many. Play classic Oh Hell or add Suns, Moons, Dragons and Jokers, against up to four computer opponents." }
};

const BVMore = {
  o: null,

  init(o) {
    this.o = o;
    this.url = "https://bug-victim.itch.io/" + o.key;
    const pips = (a, b) => `<span class="bv-pips"><span class="pr">${a}</span><span class="pb">${b}</span></span>`;
    const friends = cls => `<div class="bv-friends ${cls}">
      <button type="button" class="bv-games-btn">${pips("♥", "♠")}More card games${pips("♦", "♣")}</button>
      ${this.shareBox()}</div>`;

    // the splash: just a note, so nothing there gets in the way of starting
    const start = document.querySelector("#splash .splash-start");
    if (start) start.insertAdjacentHTML("beforebegin", `<div class="bv-note">Remember to check out my other games</div>`);
    // under the Tutorial and Play buttons (not at the end of a game: that would be overdoing it)
    const main = document.querySelector(".start-buttons-main");
    if (main) main.insertAdjacentHTML("afterend", friends("bv-start"));

    document.body.insertAdjacentHTML("beforeend", `<div id="bv-more" class="modal-shade" style="display:none;">
      <div class="tut-offer-panel bv-panel" role="dialog" aria-modal="true" aria-labelledby="bv-more-title"></div></div>`);
    const shade = document.getElementById("bv-more");
    shade.addEventListener("click", e => { if (e.target === shade) this.close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && shade.style.display !== "none") this.close(); });

    document.querySelectorAll(".bv-games-btn").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      this.click();
      this.show();
    }));
    this.bindShareBoxes(document);
  },

  click() { if (this.o.click) try { this.o.click(); } catch (e) { /* ignore */ } },

  show() {
    const shade = document.getElementById("bv-more"), panel = shade.querySelector(".bv-panel");
    const games = this.o.others.map(k => Object.assign({ key: k }, BV_GAMES[k]));
    panel.innerHTML = `<div class="tut-offer-title" id="bv-more-title">More card games</div>
      <p class="bv-intro">Other games by BugVictim.</p>
      <div class="bv-games">${games.map(g => {
        const href = `href="https://bug-victim.itch.io/${g.key}" target="_blank" rel="noopener noreferrer"`;
        return `<article class="bv-game">
          <a class="bv-picture" ${href} aria-label="Play ${g.title} on itch.io (opens a new tab)"><img src="img/more-games-${g.image}.webp" alt="${g.title} artwork" loading="lazy"></a>
          <h3>${g.title}</h3><span class="bv-devices">${g.devices}</span><p>${g.description}</p>
          <a class="bv-play" ${href}>Play on itch.io</a>
        </article>`;
      }).join("")}</div>
      ${this.shareBox()}
      <div class="bv-close-row"><button type="button" class="bv-close">Back</button></div>`;
    panel.querySelector(".bv-close").onclick = () => { this.click(); this.close(); };
    this.bindShareBoxes(panel);
    shade.style.display = "flex";
    panel.querySelector(".bv-close").focus({ preventScroll: true });
  },
  close() { document.getElementById("bv-more").style.display = "none"; },

  // The sharing strip: a line of thanks and two buttons, no popup.
  shareBox() {
    return `<div class="bv-share">
      <p>Please share with your friends if you enjoy.</p>
      <div class="bv-share-buttons"><button type="button" data-share="share">Share</button><button type="button" data-share="copy">Copy link</button></div>
      <input class="bv-share-link" type="url" readonly aria-label="Game link to copy" hidden>
      <div class="bv-share-status" role="status" aria-live="polite"></div>
    </div>`;
  },
  bindShareBoxes(root) {
    root.querySelectorAll(".bv-share").forEach(box => {
      if (box._bound) return;
      box._bound = true;
      box.addEventListener("click", e => {
        e.stopPropagation();
        const b = e.target.closest("[data-share]");
        if (!b) return;
        this.click();
        if (b.dataset.share === "share") this.share(box); else this.copyLink(box);
      });
    });
  },
  async share(box) {
    box.querySelector(".bv-share-status").textContent = "";
    if (navigator.share) {
      try {
        await navigator.share({ title: this.o.title, text: this.o.shareText, url: this.url });
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    await this.copyLink(box);
  },
  async copyLink(box) {
    const status = box.querySelector(".bv-share-status");
    try {
      await navigator.clipboard.writeText(this.url);
      status.textContent = "Link copied. Share it with a friend!";
      box.querySelector('[data-share="copy"]').textContent = "Copied!";
    } catch (e) {
      const link = box.querySelector(".bv-share-link");
      link.value = this.url;
      link.hidden = false;
      link.focus();
      link.select();
      status.textContent = "Copy the link above to share.";
    }
  }
};
