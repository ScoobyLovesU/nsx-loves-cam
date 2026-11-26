/* ==========================================================================
   RAPPEL.MJS — Envoie le mail de rappel du soir (lancé par GitHub Actions)

   Lit la configuration dans data.js (CONFIG.reminder), calcule le jour à
   Paris, construit un joli mail HTML et l'envoie par SMTP (nodemailer).

   Variables d'environnement :
   - SMTP_USER, SMTP_PASS      → ton compte mail (Gmail : mot de passe d'application)
   - MAIL_TO                   → son adresse mail
   - SMTP_HOST, SMTP_PORT      → facultatif (défaut : smtp.gmail.com / 465)
   - JOUR                      → forcer un jour (1-24), pour tester
   - DESTINATAIRE              → envoyer à une autre adresse (ex. la tienne), pour tester
   - FORCE=true                → envoyer même hors de la période 1-24 décembre
   - DRY_RUN=1                 → n'envoie rien, écrit un aperçu dans rappel-apercu.html

   Aperçu en local :  DRY_RUN=1 JOUR=5 node scripts/rappel.mjs
   ========================================================================== */

import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";

const env = process.env;
const DRY_RUN = env.DRY_RUN === "1" || env.DRY_RUN === "true";
const FORCE = env.FORCE === "true";

/* ---------- Lecture de data.js ---------- */
const dataPath = new URL("../data.js", import.meta.url);
const code = await readFile(dataPath, "utf8");
const { CONFIG, SURPRISES } = vm.runInNewContext(`${code}\n;({ CONFIG, SURPRISES });`);
const R = CONFIG.reminder || {};

if (R.enabled === false) {
  console.log("Rappels désactivés (reminder.enabled = false). Rien à envoyer.");
  process.exit(0);
}

/* ---------- Jour à Paris ---------- */
function parisToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, Number(p.value)])
  );
  return parts; // { year, month, day }
}

const today = parisToday();
// La case bonus du 25 n'a de rappel que si elle existe dans data.js
const LAST_DAY = SURPRISES.some((s) => Number(s.day) === 25) ? 25 : 24;
let day;

if (env.JOUR && env.JOUR.trim() !== "") {
  day = Number.parseInt(env.JOUR, 10);
} else if (today.year === Number(CONFIG.year) && today.month === 12 && today.day <= LAST_DAY) {
  day = today.day;
} else if (FORCE) {
  day = 1; // test manuel en dehors de décembre : on prend la case 1 comme exemple
  console.log("Hors période : envoi de test avec la case n°1.");
} else {
  console.log(`Nous sommes le ${today.day}/${today.month}/${today.year} : hors période (1-${LAST_DAY} déc. ${CONFIG.year}). Rien à envoyer.`);
  process.exit(0);
}

if (!Number.isInteger(day) || day < 1 || day > LAST_DAY) {
  console.error(`Jour invalide : « ${env.JOUR} » (attendu : 1 à ${LAST_DAY}).`);
  process.exit(1);
}

/* ---------- Contenu ---------- */
const HINTS = {
  message: "une petite lettre 💌",
  photo: "un souvenir en photo 📸",
  coupon: "un bon cadeau 🎟️",
  quiz: "un petit quiz 🧩",
  indice: "un indice de chasse au trésor 🗝️",
  audio: "un message vocal 🎙️",
};

const surprise = SURPRISES.find((s) => Number(s.day) === day);
const fill = (str = "") =>
  String(str)
    .replaceAll("{jour}", day)
    .replaceAll("{indice}", HINTS[surprise?.type] || "une surprise 🎁")
    .replaceAll("{prenom}", CONFIG.name || "");

const subject = fill(
  day === 25
    ? R.subjectBonus || "✨ Une case bonus t'attend…"
    : R.subject || "🎁 Case n°{jour} : tu l'as ouverte ?"
);
const message = fill((R.messages && R.messages[day]) || R.message || "La case du {jour} décembre t'attend ✨");
const siteUrl = R.siteUrl || "";
const buttonLabel = R.buttonLabel || "Ouvrir mon calendrier";
const signature = R.signature || "";

const escapeHtml = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const messageHtml = message
  .split(/\n{2,}/)
  .map((p) => `<p style="margin:0 0 16px;">${escapeHtml(p).replaceAll("\n", "<br>")}</p>`)
  .join("");

/* Mail HTML en tableaux + styles en ligne (compatible Gmail, Outlook, Apple Mail) */
const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0a1230;">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(message.split("\n")[0])}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1230;background-image:linear-gradient(160deg,#3d0b1c 0%,#0a1230 55%,#060b1c 100%);">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <tr>
            <td align="center" style="font-family:Georgia,'Times New Roman',serif;color:#e6c36a;font-size:12px;letter-spacing:4px;text-transform:uppercase;padding-bottom:10px;">
              ${day === 1 ? "1er" : day} décembre ${CONFIG.year}
            </td>
          </tr>
          <tr>
            <td align="center" style="font-size:52px;line-height:1;padding-bottom:12px;">🎁</td>
          </tr>
          <tr>
            <td align="center" style="font-family:Georgia,'Times New Roman',serif;color:#faedc4;font-size:28px;font-weight:bold;line-height:1.2;padding-bottom:24px;">
              ${day === 25 ? "Case bonus ✨" : `Case n°${day}`}
            </td>
          </tr>
          <tr>
            <td style="background:#fdf8ec;border-radius:16px;padding:28px 26px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#2b1a08;">
              ${messageHtml}
              ${signature ? `<p style="margin:8px 0 0;text-align:right;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:20px;color:#5c1229;">${escapeHtml(signature)}</p>` : ""}
            </td>
          </tr>
          ${
            siteUrl
              ? `<tr>
            <td align="center" style="padding:28px 0 8px;">
              <a href="${escapeHtml(siteUrl)}" style="display:inline-block;padding:15px 30px;border-radius:999px;background:#d4af37;color:#2b1a08;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;">${escapeHtml(buttonLabel)} ✨</a>
            </td>
          </tr>`
              : ""
          }
          <tr>
            <td align="center" style="padding-top:18px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:rgba(245,239,225,0.55);">
              ${day === 25 ? "Joyeux Noël 🎄" : day === 24 ? "Joyeux Noël demain 🎄" : day === 23 ? "Plus qu'une case avant Noël 🎄" : `Plus que ${24 - day} cases avant Noël 🎄`}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const text = `${message}\n\n${signature ? `${signature}\n\n` : ""}${siteUrl ? `${buttonLabel} : ${siteUrl}` : ""}`;

/* ---------- Aperçu ou envoi ---------- */
if (DRY_RUN) {
  const out = new URL("../rappel-apercu.html", import.meta.url);
  await writeFile(out, html, "utf8");
  console.log(`[DRY_RUN] Sujet : ${subject}`);
  console.log(`[DRY_RUN] Aperçu écrit dans ${out.pathname}`);
  process.exit(0);
}

const to = (env.DESTINATAIRE && env.DESTINATAIRE.trim()) || env.MAIL_TO;
const missing = ["SMTP_USER", "SMTP_PASS"].filter((k) => !env[k]);
if (!to) missing.push("MAIL_TO");
if (missing.length) {
  console.error(`Secrets manquants : ${missing.join(", ")}. Ajoute-les dans Settings → Secrets and variables → Actions.`);
  process.exit(1);
}

const { default: nodemailer } = await import("nodemailer");
const port = Number(env.SMTP_PORT) || 465;
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST || "smtp.gmail.com",
  port,
  secure: port === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

const info = await transporter.sendMail({
  from: { name: R.fromName || "Calendrier de l'Avent", address: env.SMTP_USER },
  to,
  subject,
  text,
  html,
});

// L'adresse est masquée dans les logs (le dépôt peut être public)
const masked = to.replace(/^(.{2}).*(@.*)$/, "$1***$2");
console.log(`✅ Rappel de la case n°${day} envoyé à ${masked} (${info.messageId}).`);
