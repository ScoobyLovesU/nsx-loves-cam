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

  const clampDay = (n) => Math.min(Math.max(n, 0), 24);

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
  };

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
    state: { opened: [], quizSolved: [], usedCoupons: {} },

    load() {
      try {
        const raw = localStorage.getItem(this.key);
        if (!raw) return;
        const data = JSON.parse(raw);
        this.state = {
          opened: Array.isArray(data.opened) ? data.opened.map(Number) : [],
          quizSolved: Array.isArray(data.quizSolved) ? data.quizSolved.map(Number) : [],
          usedCoupons: data.usedCoupons && typeof data.usedCoupons === "object" ? data.usedCoupons : {},
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
      this.state = { opened: [], quizSolved: [], usedCoupons: {} };
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
      this.state.opened = Array.from({ length: 24 }, (_, i) => i + 1);
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
    if (y > YEAR) return 24;
    return Math.min(now.getDate(), 24);
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

    grid.replaceChildren(frag);
    grid.classList.toggle("grid--intro", intro && !REDUCED_MOTION);
    updateProgress();
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
      navigator.vibrate?.(30);
      return;
    }
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

  function openModal() {
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

    closeTimer = setTimeout(() => {
      modal.hidden = true;
      modalBody.replaceChildren();
    }, REDUCED_MOTION ? 0 : 380);

    if (!fromHistory && history.state && history.state.adventModal) history.back();

    renderGrid();
    if (currentDay !== null) {
      grid.querySelector(`[data-day="${currentDay}"]`)?.focus({ preventScroll: true });
    }
  }

  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeModal();
  });

  window.addEventListener("popstate", () => {
    if (isModalOpen) closeModal({ fromHistory: true });
  });

  // Échap + piège à focus
  modal.addEventListener("keydown", (e) => {
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
    modalBody.replaceChildren(node);
    dialog.scrollTop = 0;
  }

  /* ------------------------------------------------------------------------
     Ouverture d'une case
     ------------------------------------------------------------------------ */
  function openDay(day) {
    currentDay = day;
    const entry = SURPRISE_BY_DAY.get(day);
    modalEyebrow.textContent = `${day === 1 ? "1er" : day} décembre`;
    modalTitle.textContent = `Case n°${day}`;
    modalBody.replaceChildren();
    openModal();

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
      this.scratch(p, p);
    }

    move(p) {
      if (this.done) return;
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
        toast(previous === 0 ? "🎄 Ton calendrier est ouvert !" : "🎁 Une nouvelle case vient de s'ouvrir !");
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
  initDebug();
  renderGrid({ intro: true });
  tick();
  setInterval(tick, 1000);
  initSnow();
})();