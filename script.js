/* ==========================================================================
   SCRIPT.JS — Logique du calendrier de l'Avent
   (Aucune modification nécessaire : tout le contenu se règle dans data.js)

   MODE DEBUG (pendant le développement) — trois façons de l'activer :
   - debug: true dans CONFIG (data.js)
   - ?debug=true dans l'URL (ou l'ancien ?test=true)
   - ?debug=true&jour=5 → simule le 5 décembre (jour=0 : avant le 1er)

   En mode debug :
   - toutes les cases sont déblocables par défaut, sauvegarde séparée ;
   - un panneau « 🧪 Debug » permet de changer la date simulée, de tout
     réinitialiser et de tester l'envoi du SMS ;
   - la console expose window.advent (tape advent.help()).
   ========================================================================== */

(() => {
  "use strict";

  /* ------------------------------------------------------------------------
     Initialisation & constantes
     ------------------------------------------------------------------------ */
  if (typeof CONFIG === "undefined" || typeof SURPRISES === "undefined") {
    console.error("data.js est introuvable ou contient une erreur de syntaxe.");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const DEBUG =
    CONFIG.debug === true || params.get("debug") === "true" || params.get("test") === "true";

  const clampDay = (n) => Math.min(Math.max(n, 0), 25);

  /** Jour simulé (debug uniquement) : null = toutes les cases débloquées. */
  let simDay = (() => {
    if (!DEBUG || !params.has("jour")) return null;
    const n = parseInt(params.get("jour"), 10);
    return Number.isFinite(n) ? clampDay(n) : null;
  })();

  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const YEAR = Number(CONFIG.year) || new Date().getFullYear();
  const DECEMBER = 11; // les mois JS commencent à 0
  const THRESHOLD = typeof CONFIG.scratchThreshold === "number" ? CONFIG.scratchThreshold : 0.5;

  const TYPE_META = {
    message: { icon: "💌", teaser: "Un petit mot pour toi" },
    photo: { icon: "📸", teaser: "Un souvenir en image" },
    coupon: { icon: "🎟️", teaser: "Un bon rien que pour toi !" },
    quiz: { icon: "🧩", teaser: "Un petit quiz" },
    indice: { icon: "🗝️", teaser: "Un indice de chasse au trésor" },
    audio: { icon: "🎙️", teaser: "Un message vocal pour toi" },
  };

  const BONUS_DAY = 25; // case bonus : visible uniquement à partir du 25 décembre

  const LOCK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  /* ------------------------------------------------------------------------
     Petits utilitaires
     ------------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);

  /** Création d'éléments DOM concise et sûre (textContent, jamais innerHTML). */
  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2), value);
      } else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false || child === "") continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  /** Supprime l'indentation des textes écrits avec des backticks dans data.js. */
  function dedent(str = "") {
    return String(str)
      .replace(/^\s*\n/, "")
      .replace(/\s+$/, "")
      .split("\n")
      .map((line) => line.trim())
      .join("\n");
  }

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const pad = (n) => String(n).padStart(2, "0");

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    } catch {
      return "";
    }
  }

  /* ------------------------------------------------------------------------
     Données : index par jour + ordre de la grille validé
     ------------------------------------------------------------------------ */
  const SURPRISE_BY_DAY = new Map();
  SURPRISES.forEach((s) => SURPRISE_BY_DAY.set(Number(s.day), s));
  const HAS_BONUS = SURPRISE_BY_DAY.has(BONUS_DAY);

  for (let d = 1; d <= 24; d++) {
    if (!SURPRISE_BY_DAY.has(d)) console.warn(`[Calendrier] Aucune surprise définie pour le jour ${d}.`);
  }

  const ORDER = (() => {
    const seen = new Set();
    const list = [];
    const source = typeof GRID_ORDER !== "undefined" && Array.isArray(GRID_ORDER) ? GRID_ORDER : [];
    source.forEach((d) => {
      const n = Number(d);
      if (n >= 1 && n <= 24 && !seen.has(n)) {
        seen.add(n);
        list.push(n);
      }
    });
    for (let d = 1; d <= 24; d++) {
      if (!seen.has(d)) {
        console.warn(`[Calendrier] Le jour ${d} manquait dans GRID_ORDER : ajouté à la fin.`);
        list.push(d);
      }
    }
    return list;
  })();

  /* ------------------------------------------------------------------------
     Sauvegarde (localStorage)
     ------------------------------------------------------------------------ */
  const Store = {
    key: (CONFIG.storageKey || "advent-calendar") + (DEBUG ? "-debug" : ""),
    state: { opened: [], quizSolved: [], usedCoupons: {}, flags: {} },

    load() {
      try {
        const raw = localStorage.getItem(this.key);
        if (!raw) return;
        const data = JSON.parse(raw);
        this.state = {
          opened: Array.isArray(data.opened) ? data.opened.map(Number) : [],
          quizSolved: Array.isArray(data.quizSolved) ? data.quizSolved.map(Number) : [],
          usedCoupons: data.usedCoupons && typeof data.usedCoupons === "object" ? data.usedCoupons : {},
          flags: data.flags && typeof data.flags === "object" ? data.flags : {},
        };
      } catch (err) {
        console.warn("[Calendrier] Sauvegarde illisible, on repart de zéro.", err);
      }
    },
    save() {
      try {
        localStorage.setItem(this.key, JSON.stringify(this.state));
      } catch {
        /* navigation privée ou stockage plein : on continue sans sauvegarde */
      }
    },
    reset() {
      this.state = { opened: [], quizSolved: [], usedCoupons: {}, flags: {} };
      try { localStorage.removeItem(this.key); } catch { /* rien */ }
    },

    isOpened: (day) => Store.state.opened.includes(day),
    markOpened(day) {
      if (!this.isOpened(day)) {
        this.state.opened.push(day);
        this.save();
      }
    },
    isQuizSolved: (day) => Store.state.quizSolved.includes(day),
    solveQuiz(day) {
      if (!this.isQuizSolved(day)) {
        this.state.quizSolved.push(day);
        this.save();
      }
    },
    couponUsedAt: (id) => Store.state.usedCoupons[id] || null,
    useCoupon(id) {
      this.state.usedCoupons[id] = new Date().toISOString();
      this.save();
    },
    unuseCoupon(id) {
      delete this.state.usedCoupons[id];
      this.save();
    },
    markAllOpened() {
      this.state.opened = [...SURPRISE_BY_DAY.keys()];
      this.save();
    },
    setFlag(name) {
      this.state.flags[name] = true;
      this.save();
    },
  };

  /* ------------------------------------------------------------------------
     Dates & verrouillage
     ------------------------------------------------------------------------ */
  /**
   * Horloge du calendrier : la vraie date, sauf en debug avec un jour simulé
   * (on garde alors l'heure réelle, mais sur la date simulée).
   */
  function clockNow() {
    const real = new Date();
    if (simDay === null) return real;
    const d = simDay === 0 ? new Date(YEAR, 10, 30) : new Date(YEAR, DECEMBER, simDay);
    d.setHours(real.getHours(), real.getMinutes(), real.getSeconds(), real.getMilliseconds());
    return d;
  }

  /** Dernier jour débloqué pour une date donnée (0 = avant le 1er décembre). */
  function dayFromDate(now) {
    const y = now.getFullYear();
    const m = now.getMonth();
    if (y < YEAR || (y === YEAR && m < DECEMBER)) return 0;
    if (y > YEAR) return 25;
    return Math.min(now.getDate(), 25);
  }

  const unlockedDay = () => dayFromDate(clockNow());
  const allUnlocked = () => DEBUG && simDay === null;

  function isOpenable(day) {
    return allUnlocked() || day <= unlockedDay();
  }

  function daysUntil(day) {
    const now = clockNow();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(YEAR, DECEMBER, day);
    return Math.max(1, Math.round((target - today) / 86400000));
  }

  /* ------------------------------------------------------------------------
     En-tête
     ------------------------------------------------------------------------ */
  function initHeader() {
    const name = (CONFIG.name || "").trim();
    const de = /^[aeiouyàâäéèêëîïôöùûü]/i.test(name) ? "d'" : "de ";
    const fullName = name ? de + name : "";

    $("#title-main").textContent = CONFIG.title || "Le Calendrier de l'Avent";
    $("#title-name").textContent = fullName;
    $("#hero-eyebrow").textContent = `Décembre ${YEAR}`;
    $("#hero-subtitle").textContent = CONFIG.subtitle || "";
    $("#footer").textContent = CONFIG.footer || "";
    document.title = `${CONFIG.title || "Calendrier de l'Avent"} ${fullName}`.trim();
  }

  /* ------------------------------------------------------------------------
     Grille
     ------------------------------------------------------------------------ */
  const grid = $("#grid");

  function renderGrid({ intro = false } = {}) {
    const today = unlockedDay();
    const frag = document.createDocumentFragment();

    ORDER.forEach((day, i) => {
      const entry = SURPRISE_BY_DAY.get(day);
      const opened = Store.isOpened(day);
      const openable = isOpenable(day);
      const isToday = today > 0 && day === today;

      const classes = ["case", `case--v${i % 3}`];
      if (opened) classes.push("is-opened");
      else if (openable) classes.push("is-available");
      else classes.push("is-locked");
      if (isToday && !opened) classes.push("is-today");

      const status = opened ? "déjà ouverte" : openable ? "à ouvrir" : "verrouillée";
      const btn = h(
        "button",
        {
          type: "button",
          class: classes.join(" "),
          "data-day": day,
          "aria-label": `Jour ${day}, ${status}`,
          style: `--i:${i}`,
        },
        h("span", { class: "case__num", text: day }),
        opened && h("span", { class: "case__icon", "aria-hidden": "true", text: (TYPE_META[entry?.type] || {}).icon || "🎁" }),
        opened && h("span", { class: "case__check", "aria-hidden": "true", text: "✓" }),
        isToday && !opened && h("span", { class: "case__tag", text: "Aujourd'hui" })
      );

      if (!opened && !openable) {
        const lock = h("span", { class: "case__lock", "aria-hidden": "true" });
        lock.innerHTML = LOCK_SVG; // SVG statique, défini dans ce fichier
        btn.append(lock);
      }
      frag.append(btn);
    });

    // Case bonus du 25 : invisible avant le jour J
    if (isBonusVisible()) {
      const opened = Store.isOpened(BONUS_DAY);
      const entry = SURPRISE_BY_DAY.get(BONUS_DAY);
      frag.append(
        h(
          "button",
          {
            type: "button",
            class: `case case--bonus ${opened ? "is-opened" : "is-available is-today"}`,
            "data-day": BONUS_DAY,
            "aria-label": `Case bonus du 25 décembre, ${opened ? "déjà ouverte" : "à ouvrir"}`,
            style: `--i:${ORDER.length}`,
          },
          h("span", { class: "case__bonus-label", text: "✨ Case bonus ✨" }),
          h("span", { class: "case__num", text: opened ? (TYPE_META[entry.type] || {}).icon || "🎁" : "25" }),
          opened && h("span", { class: "case__check", "aria-hidden": "true", text: "✓" })
        )
      );
    }

    grid.replaceChildren(frag);
    grid.classList.toggle("grid--intro", intro && !REDUCED_MOTION);
    updateProgress();
    updateTree();
    updateHeroActions();
  }

  function updateProgress() {
    const n = Store.state.opened.filter((d) => d >= 1 && d <= 24).length;
    const el = $("#progress");
    el.replaceChildren("🎁 ", h("strong", { text: n }), ` / 24 surprise${n > 1 ? "s" : ""} découverte${n > 1 ? "s" : ""}`);
  }

  function shake(el) {
    el.classList.remove("is-shaking");
    void el.offsetWidth; // relance l'animation
    el.classList.add("is-shaking");
    el.addEventListener("animationend", () => el.classList.remove("is-shaking"), { once: true });
  }

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".case");
    if (!btn) return;
    const day = Number(btn.dataset.day);

    if (!isOpenable(day)) {
      shake(btn);
      showTeasingToast(day);
      Sound.locked();
      navigator.vibrate?.(30);
      return;
    }
    Sound.click();
    if (!SURPRISE_BY_DAY.has(day)) {
      toast("Cette case est encore vide… 🤫");
      return;
    }
    openDay(day);
  });

  /* ------------------------------------------------------------------------
     Toast
     ------------------------------------------------------------------------ */
  const toastEl = $("#toast");
  let toastTimer = null;
  let lastTeaseIndex = -1;

  function toast(message, duration = 3200) {
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), duration);
  }

  function showTeasingToast(day) {
    const list = Array.isArray(CONFIG.teasingMessages) && CONFIG.teasingMessages.length
      ? CONFIG.teasingMessages
      : ["Pas de triche ! Reviens dans {n} jour{s} 😏"];
    let index = Math.floor(Math.random() * list.length);
    if (list.length > 1 && index === lastTeaseIndex) index = (index + 1) % list.length;
    lastTeaseIndex = index;

    const n = daysUntil(day);
    const message = list[index]
      .replaceAll("{n}", n)
      .replaceAll("{s}", n > 1 ? "s" : "")
      .replaceAll("{jour}", day);
    toast(message);
  }

  /* ------------------------------------------------------------------------
     Confettis
     ------------------------------------------------------------------------ */
  function celebrate(size = "big") {
    if (typeof window.confetti !== "function") return;
    const base = {
      zIndex: 3000,
      colors: ["#d4af37", "#f3dc96", "#8a2042", "#ffffff", "#c0392b"],
      disableForReducedMotion: true,
    };
    if (size === "small") {
      window.confetti({ ...base, particleCount: 60, spread: 70, startVelocity: 35, origin: { y: 0.7 } });
      return;
    }
    window.confetti({ ...base, particleCount: 110, spread: 85, startVelocity: 45, origin: { y: 0.65 } });
    setTimeout(() => {
      window.confetti({ ...base, particleCount: 55, angle: 60, spread: 60, origin: { x: 0, y: 0.75 } });
      window.confetti({ ...base, particleCount: 55, angle: 120, spread: 60, origin: { x: 1, y: 0.75 } });
    }, 220);
  }

  /* ------------------------------------------------------------------------
     Modale
     ------------------------------------------------------------------------ */
  const modal = $("#modal");
  const dialog = $(".modal__dialog", modal);
  const modalBody = $("#modal-body");
  const modalTitle = $("#modal-title");
  const modalEyebrow = $("#modal-eyebrow");

  let isModalOpen = false;
  let closeTimer = null;
  let currentDay = null;
  let activeScratch = null;

  function openModal({ wide = false } = {}) {
    stopMedia();
    dialog.classList.toggle("modal__dialog--wide", wide);
    if (isModalOpen) {
      // Déjà ouverte (ex : du portefeuille vers une case) : on change juste le contenu
      dialog.scrollTop = 0;
      return;
    }
    clearTimeout(closeTimer);
    isModalOpen = true;
    modal.hidden = false;
    void modal.offsetWidth; // force le reflow pour déclencher la transition
    modal.classList.add("is-open");
    document.body.classList.add("no-scroll");
    dialog.scrollTop = 0;
    // Bouton « retour » Android/navigateur = fermer la modale
    try { history.pushState({ adventModal: true }, ""); } catch { /* rien */ }
    $(".modal__close", modal).focus({ preventScroll: true });
  }

  function closeModal({ fromHistory = false } = {}) {
    if (!isModalOpen) return;
    isModalOpen = false;
    modal.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    activeScratch?.destroy();
    activeScratch = null;
    Sound.scratchEnd();
    stopMedia();

    closeTimer = setTimeout(() => {
      modal.hidden = true;
      modalBody.replaceChildren();
      dialog.classList.remove("modal__dialog--wide");
    }, REDUCED_MOTION ? 0 : 380);

    if (!fromHistory && history.state && history.state.adventModal) history.back();

    renderGrid();
    if (currentDay !== null) {
      grid.querySelector(`[data-day="${currentDay}"]`)?.focus({ preventScroll: true });
    }
  }

  /** Coupe tout message vocal en cours (fermeture, changement de contenu). */
  function stopMedia() {
    modalBody.querySelectorAll("audio").forEach((a) => a.pause());
  }

  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeModal();
  });

  window.addEventListener("popstate", () => {
    if (isModalOpen) closeModal({ fromHistory: true });
  });

  // Échap + piège à focus
  document.addEventListener("keydown", (e) => {
    if (!isModalOpen) return;
    if (e.key === "Escape") {
      closeModal();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = [...dialog.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  function mount(node, animate = true) {
    if (animate && !REDUCED_MOTION) node.classList.add("stage--enter");
    const parts = [node];
    if (openedFrom === "wallet" && currentDay !== null) {
      parts.unshift(
        h("button", {
          type: "button",
          class: "back-link",
          text: "‹ Mes bons",
          onclick: () => {
            openedFrom = null;
            openWallet();
          },
        })
      );
    }
    modalBody.replaceChildren(...parts);
    dialog.scrollTop = 0;
    // Le bouton cliqué a pu disparaître : on garde le focus dans la fenêtre
    if (isModalOpen && !dialog.contains(document.activeElement)) {
      $(".modal__close", modal).focus({ preventScroll: true });
    }
  }

  /* ------------------------------------------------------------------------
     Ouverture d'une case
     ------------------------------------------------------------------------ */
  let openedFrom = null;

  function openDay(day, { from = null } = {}) {
    currentDay = day;
    openedFrom = from;
    const entry = SURPRISE_BY_DAY.get(day);
    modalEyebrow.textContent = `${day === 1 ? "1er" : day} décembre`;
    modalTitle.textContent = day === BONUS_DAY ? "Case bonus ✨" : `Case n°${day}`;
    openModal();
    modalBody.replaceChildren();

    const opened = Store.isOpened(day);
    if (opened) {
      renderReveal(day, entry, false);
    } else if (entry.type === "quiz" && !Store.isQuizSolved(day)) {
      renderQuiz(day, entry);
    } else {
      renderScratch(day, entry);
    }
  }

  /** Pour un quiz, la surprise révélée est sa récompense. */
  function contentOf(entry) {
    if (entry.type !== "quiz") return entry;
    return entry.reward || { type: "message", title: "Bravo !", text: "Tu as trouvé la bonne réponse 🎉" };
  }

  /* ---------- Étape quiz ---------- */
  function renderQuiz(day, entry) {
    const wrongMessages = Array.isArray(CONFIG.quizWrongMessages) && CONFIG.quizWrongMessages.length
      ? CONFIG.quizWrongMessages
      : ["Raté ! Essaie encore 😘"];

    const feedback = h("p", { class: "quiz__feedback", "aria-live": "polite" });
    const choices = h("div", { class: "quiz__choices" });
    const stage = h(
      "div",
      { class: "stage quiz" },
      h("p", { class: "kicker", text: "Quiz du couple" }),
      h("h3", { class: "quiz__question", text: entry.question }),
      choices,
      feedback
    );

    (entry.choices || []).forEach((choice, index) => {
      const btn = h("button", { type: "button", class: "quiz__choice", text: choice });
      btn.addEventListener("click", () => {
        if (index === Number(entry.answer)) {
          btn.classList.add("is-correct");
          choices.querySelectorAll("button").forEach((b) => (b.disabled = true));
          Store.solveQuiz(day);
          feedback.className = "quiz__feedback is-success";
          feedback.textContent = entry.successMessage || "Bravo ! 🎉";
          Sound.success();
          celebrate("small");
          const next = h("button", {
            type: "button",
            class: "btn btn--gold",
            text: "Gratter ma récompense ✨",
            onclick: () => renderScratch(day, entry),
          });
          stage.append(next);
          next.focus({ preventScroll: true });
        } else {
          btn.classList.add("is-wrong");
          btn.disabled = true;
          feedback.className = "quiz__feedback is-error";
          feedback.textContent = pick(wrongMessages);
          Sound.wrong();
          navigator.vibrate?.(40);
        }
      });
      choices.append(btn);
    });

    mount(stage);
  }

  /* ---------- Étape ticket à gratter ---------- */
  function renderScratch(day, entry) {
    activeScratch?.destroy();
    const content = contentOf(entry);
    const meta = TYPE_META[content.type] || { icon: "🎁", teaser: "Une surprise" };

    const canvas = h("canvas", {
      class: "scratch__canvas",
      tabindex: "0",
      role: "img",
      "aria-label": "Zone dorée à gratter. Appuie sur Entrée pour révéler la surprise.",
    });
    const stage = h(
      "div",
      { class: "stage" },
      h(
        "div",
        { class: "scratch" },
        h(
          "div",
          { class: "scratch__prize" },
          h("span", { class: "scratch__emoji", "aria-hidden": "true", text: meta.icon }),
          h("p", { class: "scratch__teaser", text: entry.teaser || content.teaser || meta.teaser })
        ),
        canvas
      ),
      h("p", { class: "scratch__hint", text: "Gratte la zone dorée avec ton doigt ✨" })
    );
    mount(stage);

    activeScratch = new ScratchCard(canvas, {
      threshold: THRESHOLD,
      onComplete: () => {
        Store.markOpened(day);
        Sound.scratchEnd();
        Sound.chime();
        notifyCaseOpened(day, entry);
        navigator.vibrate?.([30, 40, 30]);
        celebrate("big");
        setTimeout(() => {
          if (isModalOpen && currentDay === day) renderReveal(day, entry, true);
        }, REDUCED_MOTION ? 150 : 1100);
      },
    });
  }

  /* ---------- Étape révélation ---------- */
  function renderReveal(day, entry, animate) {
    activeScratch = null;
    const stage = h("div", { class: "stage reveal" });

    if (entry.type === "quiz") {
      const answer = (entry.choices || [])[Number(entry.answer)];
      stage.append(
        h("p", { class: "quiz-recap" }, "✓ ", entry.question, " ", h("strong", { text: answer }))
      );
    }
    stage.append(renderContent(contentOf(entry), day));
    mount(stage, animate);
  }

  /* ------------------------------------------------------------------------
     Rendu des différents types de surprises
     ------------------------------------------------------------------------ */
  const RENDERERS = {
    message(c) {
      return h(
        "article",
        { class: "card-message" },
        c.title && h("h3", { class: "card-message__title", text: c.title }),
        h("div", { class: "card-message__text", text: dedent(c.text) }),
        c.signature && h("p", { class: "card-message__sign", text: c.signature })
      );
    },

    photo(c) {
      const frame = h("div", { class: "card-photo__frame" });
      const img = h("img", {
        src: c.src,
        alt: c.alt || c.caption || "Souvenir",
        decoding: "async",
      });
      img.addEventListener(
        "error",
        () => {
          frame.replaceChildren(
            h(
              "div",
              { class: "card-photo__placeholder" },
              h("span", { "aria-hidden": "true", text: "📷" }),
              h("p", { text: "Photo à ajouter ici :" }),
              h("code", { text: c.src || "(chemin manquant)" })
            )
          );
        },
        { once: true }
      );
      frame.append(img);

      return h(
        "figure",
        { class: "card-photo" },
        frame,
        (c.caption || c.date) &&
          h("figcaption", {}, c.caption, c.date && h("span", { class: "card-photo__date", text: c.date }))
      );
    },

    coupon(c, day) {
      const id = String(c.id ?? day);
      const wrap = h("div", { class: "coupon-wrap" });

      const draw = (justUsed = false) => {
        const usedAt = Store.couponUsedAt(id);

        const ticket = h(
          "div",
          { class: `coupon${usedAt ? " is-used" : ""}` },
          h(
            "div",
            { class: "coupon__main" },
            h("p", { class: "coupon__kicker", text: c.title || "Bon pour" }),
            h("h3", { class: "coupon__offer", text: c.offer }),
            c.details && h("p", { class: "coupon__details", text: dedent(c.details) }),
            c.validity && h("p", { class: "coupon__validity", text: c.validity })
          ),
          h(
            "div",
            { class: "coupon__stub", "aria-hidden": "true" },
            h("span", { class: "coupon__no", text: `N° ${pad(day)} · ${YEAR}` }),
            h("span", { class: "coupon__heart", text: "♥" })
          ),
          usedAt && h("div", { class: `coupon__stamp${justUsed ? " stamp-in" : ""}`, text: "Consommé" })
        );

        const actions = h("div", { class: "coupon__actions" });

        if (!usedAt) {
          const label = "Utiliser ce bon";
          const btn = h("button", { type: "button", class: "btn btn--gold", text: label });
          let armed = false;
          let disarmTimer = null;
          btn.addEventListener("click", () => {
            // Double confirmation pour éviter un clic accidentel
            if (!armed) {
              armed = true;
              btn.textContent = "Sûre ? Touche encore pour confirmer";
              btn.classList.add("is-armed");
              disarmTimer = setTimeout(() => {
                armed = false;
                btn.textContent = label;
                btn.classList.remove("is-armed");
              }, 4000);
              return;
            }
            clearTimeout(disarmTimer);
            Store.useCoupon(id);
            Sound.stamp();
            notifyCouponUsed(c.offer);
            celebrate("small");
            draw(true);
            wrap.querySelector(".btn")?.focus({ preventScroll: true });
          });
          actions.append(btn);
        } else {
          actions.append(h("p", { class: "coupon__used-on", text: `Utilisé le ${formatDate(usedAt)}` }));
          if (CONFIG.phoneNumber) {
            actions.append(
              h("a", { class: "btn btn--ghost", href: smsLink(c.offer), text: "📱 Me le réclamer par SMS" })
            );
          }
          if (DEBUG) {
            actions.append(
              h("button", {
                type: "button",
                class: "btn btn--debug",
                text: "↺ Annuler l'utilisation (debug)",
                onclick: () => {
                  Store.unuseCoupon(id);
                  draw();
                },
              })
            );
          }
        }

        wrap.replaceChildren(ticket, actions);
      };

      draw();
      return wrap;
    },

    audio(c) {
      const fmt = (sec) => {
        if (!Number.isFinite(sec)) return "--:--";
        const m = Math.floor(sec / 60);
        return `${m}:${pad(Math.floor(sec % 60))}`;
      };

      const vinyl = h("div", { class: "vinyl", "aria-hidden": "true" }, h("div", { class: "vinyl__label" }));
      const audio = h("audio", { src: c.src, preload: "metadata" });
      const playBtn = h("button", { type: "button", class: "player__play", "aria-label": "Lire le message vocal" });
      const fill = h("div", { class: "player__fill" });
      const bar = h("div", {
        class: "player__bar",
        role: "slider",
        tabindex: "0",
        "aria-label": "Position dans le message",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": "0",
      }, fill);
      const time = h("span", { class: "player__time", text: "0:00" });
      const player = h("div", { class: "player" }, playBtn, bar, time);

      const card = h(
        "article",
        { class: "card-audio" },
        vinyl,
        c.title && h("h3", { class: "card-audio__title", text: c.title }),
        c.text && h("p", { class: "card-audio__text", text: dedent(c.text) }),
        player,
        audio,
        c.signature && h("p", { class: "card-audio__sign", text: c.signature })
      );

      const setPlaying = (playing) => {
        card.classList.toggle("is-playing", playing);
        playBtn.setAttribute("aria-label", playing ? "Mettre en pause" : "Lire le message vocal");
      };
      const updateTime = () => {
        const ratio = audio.duration ? audio.currentTime / audio.duration : 0;
        fill.style.width = `${ratio * 100}%`;
        bar.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
        time.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
      };

      playBtn.addEventListener("click", () => {
        if (audio.paused) {
          // Un seul message vocal à la fois (utile dans l'album)
          document.querySelectorAll("audio").forEach((a) => a !== audio && a.pause());
          audio.play().catch(() => toast("Impossible de lire ce message vocal 😕"));
        } else {
          audio.pause();
        }
      });

      const seek = (clientX) => {
        if (!audio.duration) return;
        const r = bar.getBoundingClientRect();
        audio.currentTime = Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * audio.duration;
        updateTime();
      };
      bar.addEventListener("click", (e) => seek(e.clientX));
      bar.addEventListener("keydown", (e) => {
        if (!audio.duration) return;
        if (e.key === "ArrowRight") audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
        else if (e.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 5);
        else return;
        e.preventDefault();
        updateTime();
      });

      audio.addEventListener("loadedmetadata", updateTime);
      audio.addEventListener("timeupdate", updateTime);
      audio.addEventListener("play", () => {
        setPlaying(true);
        Music.duck();
      });
      audio.addEventListener("pause", () => {
        setPlaying(false);
        Music.unduck();
      });
      audio.addEventListener("ended", () => {
        audio.currentTime = 0;
        updateTime();
      });
      audio.addEventListener(
        "error",
        () => {
          player.replaceWith(
            h(
              "div",
              { class: "card-audio__missing" },
              h("p", { text: "🎙️ Fichier audio à ajouter :" }),
              h("code", { text: c.src || "(chemin manquant)" })
            )
          );
        },
        { once: true }
      );

      return card;
    },

    indice(c) {
      const card = h(
        "article",
        { class: "card-hunt" },
        h("p", { class: "card-hunt__label", text: c.label || "Chasse au trésor" }),
        h("div", { class: "card-hunt__compass", "aria-hidden": "true", text: "🧭" }),
        c.title && h("h3", { class: "card-hunt__title", text: c.title }),
        h("p", { class: "card-hunt__clue", text: dedent(c.clue) })
      );

      if (c.hint) {
        const hint = h("p", { class: "card-hunt__hint", text: c.hint, hidden: true });
        const btn = h("button", {
          type: "button",
          class: "btn btn--ghost btn--small",
          text: "Besoin d'un coup de pouce ?",
        });
        btn.addEventListener("click", () => {
          hint.hidden = false;
          btn.remove();
        });
        card.append(btn, hint);
      }
      if (c.note) card.append(h("p", { class: "card-hunt__note", text: c.note }));
      return card;
    },
  };

  function renderContent(content, day) {
    const render = RENDERERS[content.type];
    if (!render) {
      console.warn(`[Calendrier] Type inconnu "${content.type}" (jour ${day}).`);
      return RENDERERS.message({ title: "Oups", text: "Cette surprise est mal configurée dans data.js." });
    }
    return render(content, day);
  }

  const IS_IOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function smsBody(offer) {
    const template = CONFIG.smsTemplate || "Je réclame mon bon : « {coupon} » 🎁";
    return template.replaceAll("{coupon}", offer || "un bon");
  }

  function smsLink(offer) {
    const phone = String(CONFIG.phoneNumber || "").replace(/[\s.-]/g, "");
    // iOS attend « & », Android et les autres « ? »
    return `sms:${phone}${IS_IOS ? "&" : "?"}body=${encodeURIComponent(smsBody(offer))}`;
  }

  /* ------------------------------------------------------------------------
     Ticket à gratter (canvas, tactile + souris)
     ------------------------------------------------------------------------ */
  class ScratchCard {
    constructor(canvas, { threshold = 0.5, onComplete } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { willReadFrequently: true });
      this.threshold = threshold;
      this.onComplete = onComplete;
      this.drawing = false;
      this.done = false;
      this.touched = false;
      this.last = null;
      this.lastCheck = 0;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);

      this.setupSize();
      this.paintFoil();
      // Repeint quand les polices sont chargées (si elle n'a pas encore gratté)
      document.fonts?.ready.then(() => {
        if (!this.touched && !this.done) this.paintFoil();
      });
      this.bind();
    }

    setupSize() {
      // clientWidth n'est pas affecté par les transformations CSS de la modale
      this.w = this.canvas.clientWidth || 300;
      this.h = this.canvas.clientHeight || 200;
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.brush = Math.max(30, Math.min(50, this.w / 8));
    }

    paintFoil() {
      const { ctx, w, h } = this;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);

      // Feuille dorée
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#a87b14");
      g.addColorStop(0.25, "#f3d784");
      g.addColorStop(0.5, "#c99a2e");
      g.addColorStop(0.75, "#f7e4a6");
      g.addColorStop(1, "#9c7012");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Reflets diagonaux
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 10;
      for (let x = -h; x < w; x += 34) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h, h);
        ctx.stroke();
      }

      // Paillettes
      const count = Math.round((w * h) / 70);
      for (let i = 0; i < count; i++) {
        const light = Math.random() > 0.35;
        ctx.fillStyle = light
          ? `rgba(255,255,255,${(Math.random() * 0.4).toFixed(2)})`
          : `rgba(90,60,0,${(Math.random() * 0.25).toFixed(2)})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.3, 1.3);
      }

      // Bordure pointillée
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "rgba(90,55,0,0.4)";
      ctx.lineWidth = 1.5;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(10, 10, w - 20, h - 20, 10);
        ctx.stroke();
      } else {
        ctx.strokeRect(10, 10, w - 20, h - 20);
      }
      ctx.setLineDash([]);

      // Textes
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#5a3a05";
      ctx.font = `700 ${Math.round(Math.min(28, w / 11))}px "Playfair Display", Georgia, serif`;
      ctx.fillText("Gratte-moi !", w / 2, h / 2 - 12);
      ctx.fillStyle = "rgba(90,58,5,0.85)";
      ctx.font = `500 13px "DM Sans", system-ui, sans-serif`;
      ctx.fillText("✦  une surprise se cache ici  ✦", w / 2, h / 2 + 22);
    }

    bind() {
      const c = this.canvas;

      this.onTouchStart = (e) => {
        e.preventDefault();
        this.start(this.pos(e.touches[0]));
      };
      this.onTouchMove = (e) => {
        e.preventDefault();
        if (this.drawing) this.move(this.pos(e.touches[0]));
      };
      this.onTouchEnd = () => this.end();

      this.onMouseDown = (e) => {
        e.preventDefault();
        this.start(this.pos(e));
      };
      this.onMouseMove = (e) => {
        if (this.drawing) this.move(this.pos(e));
      };
      this.onMouseUp = () => this.end();

      this.onKey = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.complete();
        }
      };

      c.addEventListener("touchstart", this.onTouchStart, { passive: false });
      c.addEventListener("touchmove", this.onTouchMove, { passive: false });
      c.addEventListener("touchend", this.onTouchEnd);
      c.addEventListener("touchcancel", this.onTouchEnd);
      c.addEventListener("mousedown", this.onMouseDown);
      window.addEventListener("mousemove", this.onMouseMove);
      window.addEventListener("mouseup", this.onMouseUp);
      c.addEventListener("keydown", this.onKey);
    }

    unbind() {
      const c = this.canvas;
      c.removeEventListener("touchstart", this.onTouchStart);
      c.removeEventListener("touchmove", this.onTouchMove);
      c.removeEventListener("touchend", this.onTouchEnd);
      c.removeEventListener("touchcancel", this.onTouchEnd);
      c.removeEventListener("mousedown", this.onMouseDown);
      window.removeEventListener("mousemove", this.onMouseMove);
      window.removeEventListener("mouseup", this.onMouseUp);
      c.removeEventListener("keydown", this.onKey);
    }

    pos(point) {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: ((point.clientX - r.left) / r.width) * this.w,
        y: ((point.clientY - r.top) / r.height) * this.h,
      };
    }

    start(p) {
      if (this.done) return;
      this.drawing = true;
      this.touched = true;
      this.last = p;
      Sound.scratchStart();
      this.scratch(p, p);
    }

    move(p) {
      if (this.done) return;
      Sound.scratchMove(Math.hypot(p.x - this.last.x, p.y - this.last.y));
      this.scratch(this.last, p);
      this.last = p;
      const now = performance.now();
      if (now - this.lastCheck > 120) {
        this.lastCheck = now;
        this.check();
      }
    }

    end() {
      if (!this.drawing) return;
      this.drawing = false;
      Sound.scratchEnd();
      this.check();
    }

    scratch(a, b) {
      const { ctx } = this;
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = this.brush;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x + 0.01, b.y + 0.01);
      ctx.stroke();
    }

    /** Calcule la proportion grattée en échantillonnant les pixels transparents. */
    check() {
      if (this.done) return;
      const { width, height } = this.canvas;
      if (!width || !height) return;
      const data = this.ctx.getImageData(0, 0, width, height).data;
      const stride = 4 * 8; // 1 pixel sur 8 suffit largement
      let cleared = 0;
      let total = 0;
      for (let i = 3; i < data.length; i += stride) {
        total++;
        if (data[i] < 128) cleared++;
      }
      if (total && cleared / total >= this.threshold) this.complete();
    }

    complete() {
      if (this.done) return;
      this.done = true;
      this.drawing = false;
      this.unbind();
      this.canvas.classList.add("is-cleared");
      this.onComplete?.();
    }

    destroy() {
      this.done = true;
      this.unbind();
    }
  }

  /* ------------------------------------------------------------------------
     Préférences (sons / musique), gardées dans le navigateur
     ------------------------------------------------------------------------ */
  const SOUND_CFG = CONFIG.sounds || {};
  const Prefs = {
    key: `${CONFIG.storageKey || "advent-calendar"}-prefs`,
    data: { effects: SOUND_CFG.effects !== false, music: false },
    load() {
      try {
        const raw = localStorage.getItem(this.key);
        if (raw) Object.assign(this.data, JSON.parse(raw));
      } catch { /* rien */ }
    },
    save() {
      try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { /* rien */ }
    },
  };

  /* ------------------------------------------------------------------------
     Sons (synthétisés en Web Audio : aucun fichier à fournir)
     Note : sur iPhone, le mode silencieux coupe ces bruitages.
     ------------------------------------------------------------------------ */
  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const Sound = {
    ctx: null,
    master: null,
    scratchSrc: null,
    scratchGain: null,
    noiseBuffer: null,

    /** Crée/réveille le contexte audio (doit suivre un geste de l'utilisatrice). */
    unlock() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!this.ctx) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.6;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    },

    ready() {
      return Prefs.data.effects && this.unlock();
    },

    /** Note « clochette / boîte à musique ». */
    bell(t, freq, { dur = 1.2, vol = 0.25, dest = null } = {}) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(dest || this.master);
      [
        [1, 1],
        [2, 0.28],
        [3, 0.08],
      ].forEach(([mult, level]) => {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq * mult;
        og.gain.value = level;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + dur + 0.05);
      });
    },

    tone(t, freq, { type = "triangle", dur = 0.12, vol = 0.18, to = null } = {}) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    noise() {
      if (!this.noiseBuffer) {
        const len = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buf;
      }
      return this.noiseBuffer;
    },

    click() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      this.bell(t, midiToFreq(84), { dur: 0.5, vol: 0.12 });
      this.bell(t + 0.07, midiToFreq(88), { dur: 0.6, vol: 0.1 });
    },

    locked() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      this.tone(t, 190, { dur: 0.09, vol: 0.2 });
      this.tone(t + 0.12, 150, { dur: 0.12, vol: 0.2 });
    },

    chime() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      [84, 88, 91, 96, 100].forEach((m, i) => this.bell(t + i * 0.09, midiToFreq(m), { dur: 1.6, vol: 0.16 }));
    },

    success() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      this.bell(t, midiToFreq(88), { dur: 0.8, vol: 0.16 });
      this.bell(t + 0.1, midiToFreq(91), { dur: 1, vol: 0.16 });
    },

    wrong() {
      if (!this.ready()) return;
      this.tone(this.ctx.currentTime, 330, { dur: 0.28, vol: 0.12, to: 200 });
    },

    stamp() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      this.tone(t, 140, { type: "sine", dur: 0.2, vol: 0.5, to: 50 });
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      src.buffer = this.noise();
      f.type = "lowpass";
      f.frequency.value = 900;
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
      src.stop(t + 0.15);
    },

    pop() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      this.bell(t, midiToFreq(93), { dur: 0.7, vol: 0.12 });
      this.bell(t + 0.08, midiToFreq(100), { dur: 0.9, vol: 0.08 });
    },

    /* --- Grattage : bruit filtré dont le volume suit la vitesse du doigt --- */
    scratchStart() {
      if (!this.ready() || this.scratchSrc) return;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise();
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 2800;
      band.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(band).connect(g).connect(this.master);
      src.start();
      this.scratchSrc = src;
      this.scratchGain = g;
    },

    scratchMove(distance) {
      if (!this.scratchGain) return;
      const t = this.ctx.currentTime;
      const level = Math.min(0.35, (distance / 30) * 0.35);
      this.scratchGain.gain.cancelScheduledValues(t);
      this.scratchGain.gain.setTargetAtTime(level, t, 0.015);
      this.scratchGain.gain.setTargetAtTime(0, t + 0.07, 0.05);
    },

    scratchEnd() {
      if (!this.scratchSrc) return;
      try { this.scratchSrc.stop(); } catch { /* déjà arrêté */ }
      this.scratchSrc = null;
      this.scratchGain = null;
    },
  };

  /* ------------------------------------------------------------------------
     Musique de fond : fichier (CONFIG.sounds.musicSrc) ou boîte à musique
     intégrée jouant « Douce nuit » (Franz Xaver Gruber, 1818 : domaine public)
     ------------------------------------------------------------------------ */
  // [note MIDI, durée en croches]
  const SILENT_NIGHT = [
    [67, 3], [69, 1], [67, 2], [64, 6], [67, 3], [69, 1], [67, 2], [64, 6],
    [74, 4], [74, 2], [71, 6], [72, 4], [72, 2], [67, 6],
    [69, 4], [69, 2], [72, 3], [71, 1], [69, 2], [67, 3], [69, 1], [67, 2], [64, 6],
    [69, 4], [69, 2], [72, 3], [71, 1], [69, 2], [67, 3], [69, 1], [67, 2], [64, 6],
    [74, 4], [74, 2], [77, 3], [74, 1], [71, 2], [72, 6], [76, 6],
    [72, 2], [67, 2], [64, 2], [67, 3], [65, 1], [62, 2], [60, 12],
  ];
  // Une note de basse par mesure (6 croches)
  const SILENT_NIGHT_BASS = [48, 48, 48, 48, 43, 43, 48, 48, 41, 48, 41, 48, 43, 43, 48, 48, 48, 43, 48, 48];

  const Music = {
    playing: false,
    ducked: false,
    el: null,
    bus: null,
    loopTimer: null,

    volume() {
      const v = Number(SOUND_CFG.musicVolume);
      return Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0.35;
    },

    start() {
      if (this.playing) return;
      this.playing = true;
      if (this.ducked) return; // reprendra après le message vocal

      if (SOUND_CFG.musicSrc) {
        if (!this.el) {
          this.el = new Audio(SOUND_CFG.musicSrc);
          this.el.loop = true;
        }
        this.el.volume = this.volume();
        this.el.play().catch(() => { /* lecture refusée : réessaiera au prochain geste */ });
        return;
      }

      const ctx = Sound.unlock();
      if (!ctx) return;
      this.bus = ctx.createGain();
      this.bus.gain.value = this.volume() * 0.55;
      this.bus.connect(ctx.destination);
      this.scheduleLoop(ctx.currentTime + 0.1);
    },

    scheduleLoop(t0) {
      const ctx = Sound.ctx;
      const bus = this.bus;
      const eighth = 0.3;
      let t = t0;
      SILENT_NIGHT.forEach(([note, len]) => {
        Sound.bell(t, midiToFreq(note), { dur: Math.max(1.2, len * eighth * 1.4), vol: 0.22, dest: bus });
        t += len * eighth;
      });
      SILENT_NIGHT_BASS.forEach((note, i) => {
        Sound.bell(t0 + i * 6 * eighth, midiToFreq(note), { dur: 2.2, vol: 0.1, dest: bus });
      });
      const total = t - t0 + 3; // petite pause avant de recommencer
      this.loopTimer = setTimeout(() => {
        if (this.playing && this.bus === bus) this.scheduleLoop(ctx.currentTime + 0.1);
      }, total * 1000 - 200);
    },

    stopOutput() {
      clearTimeout(this.loopTimer);
      if (this.el) this.el.pause();
      if (this.bus && Sound.ctx) {
        const bus = this.bus;
        const t = Sound.ctx.currentTime;
        bus.gain.setTargetAtTime(0, t, 0.15);
        setTimeout(() => bus.disconnect(), 800);
      }
      this.bus = null;
    },

    stop() {
      this.playing = false;
      this.stopOutput();
    },

    /** Met la musique en pause pendant un message vocal. */
    duck() {
      if (this.ducked) return;
      this.ducked = true;
      if (this.playing) this.stopOutput();
    },

    unduck() {
      if (!this.ducked) return;
      this.ducked = false;
      if (this.playing) {
        this.playing = false;
        this.start();
      }
    },
  };

  function initSoundControls() {
    Prefs.load();
    const musicBtn = $("#toggle-music");
    const fxBtn = $("#toggle-effects");

    const paint = () => {
      musicBtn.classList.toggle("is-off", !Prefs.data.music);
      musicBtn.setAttribute("aria-pressed", String(Prefs.data.music));
      musicBtn.title = Prefs.data.music ? "Couper la musique" : "Mettre la musique";
      fxBtn.classList.toggle("is-off", !Prefs.data.effects);
      fxBtn.setAttribute("aria-pressed", String(Prefs.data.effects));
      fxBtn.title = Prefs.data.effects ? "Couper les bruitages" : "Activer les bruitages";
    };

    musicBtn.addEventListener("click", () => {
      Prefs.data.music = !Prefs.data.music;
      Prefs.save();
      if (Prefs.data.music) Music.start();
      else Music.stop();
      paint();
    });

    fxBtn.addEventListener("click", () => {
      Prefs.data.effects = !Prefs.data.effects;
      Prefs.save();
      paint();
      Sound.click();
    });

    // Les navigateurs interdisent le son avant un premier geste : on attend le
    // premier toucher/clic pour réveiller l'audio (et relancer la musique si
    // elle était activée lors de la dernière visite).
    const firstGesture = () => {
      Sound.unlock();
      if (Prefs.data.music) Music.start();
      ["pointerdown", "keydown"].forEach((ev) => document.removeEventListener(ev, firstGesture, true));
    };
    ["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, firstGesture, true));

    paint();
  }

  /* ------------------------------------------------------------------------
     Notifications pour toi (ntfy) — jamais envoyées en mode debug,
     sauf via le bouton « Tester la notification » du panneau.
     ------------------------------------------------------------------------ */
  const NOTIFY = CONFIG.notify || {};

  function notify({ title, message, tags = [], priority = 3 }, { force = false } = {}) {
    if (!NOTIFY.enabled || !NOTIFY.topic) return Promise.resolve(false);
    if (DEBUG && !force) return Promise.resolve(false);
    const server = (NOTIFY.server || "https://ntfy.sh").replace(/\/+$/, "");
    const payload = { topic: NOTIFY.topic, title, message, tags, priority };
    const click = CONFIG.reminder && CONFIG.reminder.siteUrl;
    if (click) payload.click = click;
    // Corps JSON envoyé sans en-tête Content-Type : requête « simple », sans
    // pré-vérification CORS, que ntfy accepte sur son URL racine.
    return fetch(`${server}/`, { method: "POST", body: JSON.stringify(payload), keepalive: true })
      .then((r) => r.ok)
      .catch(() => false);
  }

  const HINT_LABELS = {
    message: "une lettre 💌",
    photo: "une photo 📸",
    coupon: "un bon 🎟️",
    quiz: "un quiz 🧩",
    indice: "un indice de chasse au trésor 🗝️",
    audio: "ton message vocal 🎙️",
  };

  function notifyCaseOpened(day, entry) {
    if (!NOTIFY.caseOpened) return;
    const content = contentOf(entry);
    const who = CONFIG.name && CONFIG.name !== "Prénom" ? CONFIG.name : "Elle";
    let detail = HINT_LABELS[content.type] || "une surprise";
    if (content.type === "coupon" && content.offer) detail += ` : « ${content.offer} »`;
    notify({
      title: day === BONUS_DAY ? "✨ Case bonus ouverte" : `🎁 Case n°${day} ouverte`,
      message: `${who} vient d'ouvrir la case du ${day === 1 ? "1er" : day} décembre (${detail}).`,
      tags: ["gift"],
    });
  }

  function notifyCouponUsed(offer) {
    if (!NOTIFY.couponUsed) return;
    const who = CONFIG.name && CONFIG.name !== "Prénom" ? CONFIG.name : "Elle";
    notify({
      title: "🎟️ Bon utilisé !",
      message: `${who} vient d'utiliser son bon : « ${offer} ». À toi de jouer 😏`,
      tags: ["ticket"],
      priority: 4,
    });
  }

  /* ------------------------------------------------------------------------
     Sapin qui se décore : une boule par case ouverte, l'étoile au complet
     ------------------------------------------------------------------------ */
  // Emplacements des 24 boules (repère SVG 200 × 230)
  const ORNAMENT_SPOTS = [
    [90, 50], [110, 62], [84, 72], [118, 74], [76, 98], [102, 104], [124, 96], [64, 118],
    [90, 120], [116, 116], [138, 122], [100, 138], [70, 150], [96, 156], [126, 148], [52, 172],
    [80, 170], [108, 174], [136, 168], [40, 190], [66, 192], [94, 190], [122, 193], [150, 189],
  ];
  const ORNAMENT_COLORS = ["gold", "red", "cream", "wine"];
  const SVG_NS = "http://www.w3.org/2000/svg";
  let litOrnaments = null; // jours déjà allumés au dernier rendu

  function svg(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  function initTree() {
    const host = $("#tree");
    if (!host) return;
    const root = svg("svg", { viewBox: "0 0 200 232", class: "tree__svg", "aria-hidden": "true" });

    const defs = svg("defs");
    defs.innerHTML = `
      <linearGradient id="tree-green" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1f5a3d"/><stop offset="1" stop-color="#0d2d1f"/>
      </linearGradient>
      <radialGradient id="orn-gold" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="#fff6d0"/><stop offset=".45" stop-color="#e6c36a"/><stop offset="1" stop-color="#8a6a14"/></radialGradient>
      <radialGradient id="orn-red" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="#ffb3b3"/><stop offset=".45" stop-color="#d0313d"/><stop offset="1" stop-color="#6e0f1a"/></radialGradient>
      <radialGradient id="orn-cream" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#f3e7cb"/><stop offset="1" stop-color="#a8987a"/></radialGradient>
      <radialGradient id="orn-wine" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="#f0a6c0"/><stop offset=".45" stop-color="#8a2042"/><stop offset="1" stop-color="#3d0b1c"/></radialGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    root.append(defs);

    root.append(svg("ellipse", { cx: 100, cy: 214, rx: 70, ry: 8, class: "tree__shadow" }));
    root.append(svg("rect", { x: 91, y: 196, width: 18, height: 20, rx: 2, class: "tree__trunk" }));
    root.append(svg("path", { d: "M100 92 L24 196 Q100 212 176 196 Z", class: "tree__tier" }));
    root.append(svg("path", { d: "M100 48 L44 132 Q100 146 156 132 Z", class: "tree__tier" }));
    root.append(svg("path", { d: "M100 22 L60 82 Q100 94 140 82 Z", class: "tree__tier" }));

    ["M66 74 Q100 90 134 70", "M52 122 Q100 142 148 116", "M34 186 Q100 206 166 182"].forEach((d) =>
      root.append(svg("path", { d, class: "tree__garland" }))
    );

    const ornaments = svg("g", { class: "tree__ornaments" });
    ORNAMENT_SPOTS.forEach(([x, y], i) => {
      const day = ORDER[i];
      const g = svg("g", { class: "orn", "data-orn": day, transform: `translate(${x} ${y})` });
      g.append(
        svg("circle", { r: 4.2, class: "orn__empty" }),
        svg("rect", { x: -1.6, y: -7.6, width: 3.2, height: 2.4, rx: 0.6, class: "orn__cap" }),
        svg("circle", { r: 5.4, class: "orn__ball", fill: `url(#orn-${ORNAMENT_COLORS[day % ORNAMENT_COLORS.length]})` }),
        svg("circle", { r: 1.4, cx: -1.8, cy: -1.8, class: "orn__shine" })
      );
      ornaments.append(g);
    });
    root.append(ornaments);

    const star = svg("g", { class: "tree__star", transform: "translate(100 20)" });
    star.append(
      svg("path", {
        d: "M0 -13 L3.8 -4.2 L13 -4 L5.8 2 L8.2 11 L0 5.8 L-8.2 11 L-5.8 2 L-13 -4 L-3.8 -4.2 Z",
        class: "tree__star-shape",
      })
    );
    root.append(star);

    host.replaceChildren(root);
  }

  function updateTree() {
    const host = $("#tree");
    if (!host || !host.firstChild) return;
    const openedNow = new Set(Store.state.opened.filter((d) => d >= 1 && d <= 24));
    let newOnes = 0;

    host.querySelectorAll(".orn").forEach((g) => {
      const day = Number(g.dataset.orn);
      const lit = openedNow.has(day);
      const wasLit = litOrnaments ? litOrnaments.has(day) : lit;
      g.classList.toggle("is-lit", lit);
      if (lit && !wasLit) {
        g.classList.remove("is-new");
        void g.getBoundingClientRect();
        g.classList.add("is-new");
        newOnes++;
      }
    });

    const complete = openedNow.size >= 24;
    const starWasLit = host.classList.contains("is-complete");
    host.classList.toggle("is-complete", complete);
    if (newOnes) setTimeout(() => Sound.pop(), 250);
    if (complete && !starWasLit && litOrnaments) {
      setTimeout(() => {
        Sound.chime();
        celebrate("big");
      }, 600);
    }
    litOrnaments = openedNow;
  }

  /* ------------------------------------------------------------------------
     Boutons « Mes bons » et « Notre album »
     ------------------------------------------------------------------------ */
  /** Jours qui existent et sont visibles (la case bonus n'apparaît que le 25). */
  function visibleDays() {
    const days = [];
    for (let d = 1; d <= 24; d++) if (SURPRISE_BY_DAY.has(d)) days.push(d);
    if (HAS_BONUS && isBonusVisible()) days.push(BONUS_DAY);
    return days;
  }

  function isBonusVisible() {
    return HAS_BONUS && (allUnlocked() || unlockedDay() >= BONUS_DAY);
  }

  function isAlbumAvailable() {
    return allUnlocked() || unlockedDay() >= 24;
  }

  function collectCoupons() {
    const available = [];
    const used = [];
    let hidden = 0;
    visibleDays().forEach((day) => {
      const entry = SURPRISE_BY_DAY.get(day);
      const content = contentOf(entry);
      if (content.type !== "coupon") return;
      if (!Store.isOpened(day)) {
        hidden++;
        return;
      }
      const id = String(content.id ?? day);
      const usedAt = Store.couponUsedAt(id);
      (usedAt ? used : available).push({ day, content, usedAt });
    });
    return { available, used, hidden };
  }

  function updateHeroActions() {
    const { available } = collectCoupons();
    const badge = $("#wallet-badge");
    setText(badge, available.length);
    badge.hidden = available.length === 0;
    $("#open-album").hidden = !isAlbumAvailable();
  }

  function walletRow({ day, content, usedAt }) {
    return h(
      "button",
      {
        type: "button",
        class: `wallet-item${usedAt ? " is-used" : ""}`,
        onclick: () => {
          Sound.click();
          openDay(day, { from: "wallet" });
        },
      },
      h("span", { class: "wallet-item__stub", text: `N°${pad(day)}` }),
      h(
        "span",
        { class: "wallet-item__main" },
        h("span", { class: "wallet-item__offer", text: content.offer }),
        h("span", {
          class: "wallet-item__meta",
          text: usedAt ? `Utilisé le ${formatDate(usedAt)}` : content.validity || "À utiliser quand tu veux",
        })
      ),
      h("span", { class: "wallet-item__chevron", "aria-hidden": "true", text: "›" })
    );
  }

  function openWallet() {
    currentDay = null;
    const { available, used, hidden } = collectCoupons();
    modalEyebrow.textContent = "Ton portefeuille";
    modalTitle.textContent = "Mes bons 🎟️";
    openModal();

    const stage = h("div", { class: "stage wallet" });
    if (!available.length && !used.length) {
      stage.append(h("p", { class: "wallet__empty", text: "Pas encore de bon dans ton portefeuille… Continue d'ouvrir tes cases 😉" }));
    }
    if (available.length) {
      stage.append(h("p", { class: "kicker kicker--left", text: `À utiliser (${available.length})` }), ...available.map(walletRow));
    }
    if (used.length) {
      stage.append(h("p", { class: "kicker kicker--left", text: `Déjà utilisés (${used.length})` }), ...used.map(walletRow));
    }
    if (hidden) {
      stage.append(
        h("p", { class: "wallet__hidden", text: `🤫 Encore ${hidden} bon${hidden > 1 ? "s" : ""} caché${hidden > 1 ? "s" : ""} dans ton calendrier…` })
      );
    }
    mount(stage);
  }

  function openAlbum() {
    currentDay = null;
    modalEyebrow.textContent = "Souvenirs";
    modalTitle.textContent = "Notre album de l'Avent";
    openModal({ wide: true });

    if (!Store.state.flags.albumNotified && NOTIFY.albumOpened && !DEBUG) {
      Store.setFlag("albumNotified");
      notify({ title: "📖 Album ouvert", message: "Elle feuillette votre album de l'Avent ❤️", tags: ["books"] });
    }

    const KEEP = ["message", "photo", "audio"];
    const items = [];
    let missing = 0;
    visibleDays().forEach((day) => {
      const content = contentOf(SURPRISE_BY_DAY.get(day));
      if (!KEEP.includes(content.type)) return;
      if (!Store.isOpened(day)) {
        missing++;
        return;
      }
      items.push(
        h(
          "section",
          { class: `album-item album-item--${content.type}` },
          h("p", { class: "album-item__date", text: day === BONUS_DAY ? "25 décembre · bonus" : `${day === 1 ? "1er" : day} décembre` }),
          renderContent(content, day)
        )
      );
    });

    const stage = h(
      "div",
      { class: "stage album" },
      h("p", { class: "album__intro", text: "Toutes nos photos, tous mes mots et mes messages, réunis au même endroit." }),
      items.length ? h("div", { class: "album__grid" }, items) : h("p", { class: "wallet__empty", text: "L'album se remplira au fil des cases que tu ouvres ✨" }),
      missing
        ? h("p", { class: "wallet__hidden", text: `Encore ${missing} souvenir${missing > 1 ? "s" : ""} à découvrir dans tes cases.` })
        : null,
      h("button", {
        type: "button",
        class: "btn btn--ghost",
        text: "🎟️ Voir mes bons",
        onclick: () => openWallet(),
      })
    );
    mount(stage);
  }

  function initHeroActions() {
    $("#open-wallet").addEventListener("click", () => {
      Sound.click();
      openWallet();
    });
    $("#open-album").addEventListener("click", () => {
      Sound.click();
      openAlbum();
    });
  }

  /* ------------------------------------------------------------------------
     Compte à rebours
     - Avant le 1er décembre : écran par-dessus la page, calendrier flouté.
     - Pendant décembre : petite pastille flottante « prochaine case dans… ».
     ------------------------------------------------------------------------ */
  const page = $(".page");
  const waiting = {
    root: $("#waiting"),
    unitDays: $("#w-unit-days"),
    days: $("#w-days"),
    hours: $("#w-hours"),
    minutes: $("#w-minutes"),
    seconds: $("#w-seconds"),
  };
  const pill = { root: $("#next-pill"), text: $("#next-pill-text"), icon: $("#next-pill-icon") };

  let lastDay = unlockedDay();
  let waitingVisible = false;
  let waitingTimer = null;

  function setText(el, value) {
    const v = String(value);
    if (el.textContent !== v) el.textContent = v;
  }

  function initWaitingTexts() {
    setText($("#waiting-title"), CONFIG.waitingTitle || "Ton calendrier s'ouvre dans");
    setText($("#waiting-note"), CONFIG.waitingNote || "Rendez-vous le 1er décembre à minuit ✨");
  }

  function showWaiting(show) {
    if (show === waitingVisible) return;
    waitingVisible = show;
    clearTimeout(waitingTimer);
    document.body.classList.toggle("is-waiting", show);
    page.inert = show;
    if (show) page.setAttribute("aria-hidden", "true");
    else page.removeAttribute("aria-hidden");

    if (show) {
      waiting.root.hidden = false;
      waiting.root.classList.remove("is-leaving");
    } else {
      waiting.root.classList.add("is-leaving");
      waitingTimer = setTimeout(() => {
        waiting.root.hidden = true;
        waiting.root.classList.remove("is-leaving");
      }, REDUCED_MOTION ? 0 : 700);
    }
  }

  function tick() {
    const now = clockNow();
    const unlocked = dayFromDate(now);

    // Une nouvelle case vient de se débloquer pendant que la page est ouverte
    if (unlocked !== lastDay) {
      const previous = lastDay;
      lastDay = unlocked;
      renderGrid();
      if (unlocked > previous && unlocked > 0 && !allUnlocked()) {
        if (previous === 0) celebrate("big");
        toast(
          previous === 0
            ? "🎄 Ton calendrier est ouvert !"
            : unlocked === BONUS_DAY && HAS_BONUS
              ? "✨ Une case bonus vient d'apparaître !"
              : "🎁 Une nouvelle case vient de s'ouvrir !"
        );
      }
    }

    // Écran d'attente uniquement avant le 1er décembre (sauf debug « tout débloqué »)
    showWaiting(unlocked === 0 && !allUnlocked());

    if (unlocked >= 24) {
      pill.root.hidden = waitingVisible;
      setText(pill.icon, "🎄");
      setText(pill.text, CONFIG.finalMessage || "Joyeux Noël ❤️");
      return;
    }

    const nextDay = unlocked + 1;
    const target = new Date(YEAR, DECEMBER, nextDay, 0, 0, 0);
    const total = Math.max(0, Math.floor((target - now) / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    // Écran d'attente
    waiting.unitDays.hidden = days === 0;
    setText(waiting.days, pad(days));
    setText(waiting.hours, pad(hours));
    setText(waiting.minutes, pad(minutes));
    setText(waiting.seconds, pad(seconds));

    // Pastille
    pill.root.hidden = waitingVisible;
    setText(pill.icon, "⏳");
    const time = days > 0
      ? `${days} j ${pad(hours)} h ${pad(minutes)} min`
      : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    setText(pill.text, `Case n°${nextDay} dans ${time}`);
  }

  /* ------------------------------------------------------------------------
     Neige (canvas léger, en pause quand l'onglet est caché)
     ------------------------------------------------------------------------ */
  function initSnow() {
    const canvas = $("#snow");
    if (!canvas) return;
    if (REDUCED_MOTION) {
      canvas.remove();
      return;
    }

    const ctx = canvas.getContext("2d");
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let hgt = 0;
    let flakes = [];
    let raf = null;
    let last = performance.now();

    const makeFlake = (anywhere) => {
      const r = Math.random() * 2.2 + 0.6;
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * hgt : -10,
        r,
        vy: r * 0.32 + 0.22,
        vx: (Math.random() - 0.5) * 0.25,
        phase: Math.random() * Math.PI * 2,
        sway: Math.random() * 0.5 + 0.15,
        alpha: Math.random() * 0.5 + 0.3,
      };
    };

    function resize() {
      w = window.innerWidth;
      hgt = window.innerHeight;
      canvas.width = Math.round(w * DPR);
      canvas.height = Math.round(hgt * DPR);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${hgt}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      // Densité adaptée à la taille de l'écran (≈ 35 sur mobile, 90 max)
      const target = Math.round(Math.min(90, Math.max(30, (w * hgt) / 13000)));
      while (flakes.length < target) flakes.push(makeFlake(true));
      flakes.length = target;
    }

    function frame(now) {
      const dt = Math.min(3, (now - last) / 16.67);
      last = now;
      ctx.clearRect(0, 0, w, hgt);
      ctx.fillStyle = "#ffffff";
      for (const f of flakes) {
        f.phase += 0.012 * dt;
        f.y += f.vy * dt;
        f.x += (f.vx + Math.sin(f.phase) * f.sway * 0.5) * dt;
        if (f.y > hgt + 6) Object.assign(f, makeFlake(false));
        if (f.x > w + 6) f.x = -6;
        else if (f.x < -6) f.x = w + 6;
        ctx.globalAlpha = f.alpha;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    function startLoop() {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function stopLoop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }

    let resizeTimer = null;
    let lastW = window.innerWidth;
    let lastH = window.innerHeight;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // Ignore les petits changements de hauteur dus à la barre d'adresse mobile
        if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 120) return;
        lastW = window.innerWidth;
        lastH = window.innerHeight;
        resize();
      }, 200);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopLoop();
      else startLoop();
    });

    resize();
    startLoop();
  }

  /* ------------------------------------------------------------------------
     Mode debug (panneau + console)
     ------------------------------------------------------------------------ */
  const PLACEHOLDER_PHONE = "+33600000000";

  function setSimDay(value) {
    simDay = value === null || value === "all" ? null : clampDay(Number(value));
    // Garde la date simulée dans l'URL (survit au rechargement)
    try {
      const url = new URL(window.location.href);
      if (simDay === null) url.searchParams.delete("jour");
      else url.searchParams.set("jour", simDay);
      history.replaceState(history.state, "", url);
    } catch { /* rien */ }
    lastDay = unlockedDay();
    renderGrid();
    tick();
    updateDebugPanel();
  }

  function sampleCoupon() {
    const all = SURPRISES.flatMap((s) => [s, s.reward]).filter((s) => s && s.type === "coupon");
    return all[0]?.offer || "Un bon de test";
  }

  function updateDebugPanel() {
    if (!DEBUG) return;
    $("#debug-day").value = simDay === null ? "all" : String(simDay);

    const phone = String(CONFIG.phoneNumber || "");
    const valid = /^\+?\d{8,15}$/.test(phone.replace(/[\s.-]/g, ""));
    const offer = sampleCoupon();
    const link = smsLink(offer);

    $("#debug-sms-phone").replaceChildren(
      ...[
        "Numéro : ",
        h("strong", { text: phone || "(vide)" }),
        !valid && h("span", { class: "debug__bad", text: " ⚠ format invalide" }),
        phone === PLACEHOLDER_PHONE && h("span", { class: "debug__bad", text: " ⚠ numéro d'exemple, à remplacer dans data.js" }),
      ].filter(Boolean)
    );
    setText($("#debug-sms-body"), smsBody(offer));
    setText($("#debug-sms-format"), `Format utilisé : ${IS_IOS ? "iOS (&body=)" : "Android / autres (?body=)"}`);
    setText($("#debug-sms-raw"), link);
    $("#debug-sms-link").href = link;
  }

  function initDebug() {
    if (!DEBUG) return;
    document.body.classList.add("is-debug");
    const root = $("#debug");
    const toggle = $("#debug-toggle");
    const panel = $("#debug-panel");
    root.hidden = false;

    if (CONFIG.debug === true) {
      $("#debug-warn").hidden = false;
      console.warn("[Calendrier] ⚠ debug: true dans data.js — pense à le repasser à false avant d'envoyer le lien !");
    }

    // Liste des dates simulables
    const select = $("#debug-day");
    select.append(
      h("option", { value: "all", text: "Toutes les cases débloquées" }),
      h("option", { value: "0", text: "Avant le 1er (écran d'attente)" })
    );
    for (let d = 1; d <= 24; d++) select.append(h("option", { value: String(d), text: `${d} décembre` }));
    if (HAS_BONUS) select.append(h("option", { value: "25", text: "25 décembre (case bonus)" }));

    // Test des notifications
    const notifyInfo = $("#debug-notify-info");
    if (!NOTIFY.enabled || !NOTIFY.topic) {
      notifyInfo.textContent = "Notifications désactivées (notify.enabled / notify.topic dans data.js).";
    } else {
      notifyInfo.replaceChildren(
        "Sujet ntfy : ",
        h("strong", { text: NOTIFY.topic }),
        ...(NOTIFY.topic.includes("change-moi") ? [h("span", { class: "debug__bad", text: " ⚠ nom d'exemple, invente le tien" })] : [])
      );
    }
    $("#debug-notify-test").addEventListener("click", async () => {
      const ok = await notify(
        { title: "🧪 Test du calendrier", message: "Si tu lis ça, les notifications fonctionnent 🎉", tags: ["test_tube"] },
        { force: true }
      );
      toast(ok ? "Notification envoyée 📲 Regarde ton téléphone !" : "Échec de l'envoi : vérifie le sujet et ta connexion.");
    });
    select.addEventListener("change", () => setSimDay(select.value));

    toggle.addEventListener("click", () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    });

    $("#debug-open-all").addEventListener("click", () => {
      Store.markAllOpened();
      renderGrid();
      toast("Toutes les cases sont marquées comme ouvertes ✅");
    });

    $("#debug-reset").addEventListener("click", () => {
      Store.reset();
      renderGrid();
      toast("Sauvegarde de debug réinitialisée 🧹");
    });

    $("#debug-sms-copy").addEventListener("click", async () => {
      const link = smsLink(sampleCoupon());
      try {
        await navigator.clipboard.writeText(link);
        toast("Lien SMS copié 📋");
      } catch {
        toast("Copie impossible ici : sélectionne le lien à la main.");
      }
    });

    updateDebugPanel();

    // Raccourcis console
    window.advent = {
      help() {
        console.info(
          [
            "advent.unlockAll()  → toutes les cases déblocables",
            "advent.setDay(n)    → simule le n décembre (0 = avant le 1er)",
            "advent.open(n)      → ouvre directement la case n",
            "advent.openAll()    → marque les 24 cases comme ouvertes",
            "advent.reset()      → efface la sauvegarde de debug",
            "advent.testSms()    → ouvre l'app SMS avec un message de test",
            "advent.smsLink()    → affiche le lien SMS généré",
          ].join("\n")
        );
      },
      unlockAll: () => setSimDay(null),
      setDay: (n) => setSimDay(n),
      open: (n) => (SURPRISE_BY_DAY.has(n) ? openDay(n) : console.warn("Jour inconnu", n)),
      openAll: () => $("#debug-open-all").click(),
      reset: () => $("#debug-reset").click(),
      testSms: () => { window.location.href = smsLink(sampleCoupon()); },
      smsLink: () => smsLink(sampleCoupon()),
    };
    console.info("[Calendrier] Mode debug actif 🧪 — tape advent.help() pour les raccourcis.");
  }

  /* ------------------------------------------------------------------------
     Démarrage
     ------------------------------------------------------------------------ */
  Store.load();
  initHeader();
  initWaitingTexts();
  initSoundControls();
  initTree();
  initHeroActions();
  initDebug();
  renderGrid({ intro: true });
  tick();
  setInterval(tick, 1000);
  initSnow();
})();
