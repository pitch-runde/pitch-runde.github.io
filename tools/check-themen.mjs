// Prüft public/themen.js (siehe THEMEN.md)
// node tools/check-themen.mjs [--video]
import { readFileSync } from "node:fs";

const lines = readFileSync(new URL("../public/themen.js", import.meta.url), "utf8").split("\n");

// Jede Themenzeile muss gültiges JSON sein, Titel eindeutig
const all = [];
let errors = 0, inNeu = false;
const neu = [];
lines.forEach((l, i) => {
  if (l.startsWith("/*")) { inNeu = l.includes("---------- NEU:"); return; }
  if (!l.startsWith("{")) return;
  try { const x = JSON.parse(l.replace(/,$/, "")); all.push(x); if (inNeu) neu.push(x); }
  catch { console.log(`✗ Zeile ${i + 1}: kein gültiges JSON`); errors++; }
});
const seen = new Set();
for (const x of all) {
  if (!x.T || !x.T.t) { console.log("✗ Thema ohne T.t"); errors++; continue; }
  if (seen.has(x.T.t)) { console.log(`✗ Titel doppelt: ${x.T.t}`); errors++; }
  seen.add(x.T.t);
}

// Neue Themen (NEU-Block) streng nach Schema prüfen
const RUBRIKEN = ["aktuell", "promi", "hamburg", "kneipe", "typisch", "geschichte", "kultur", "feste", "sprache", "verstehen", "allgemein"];
const pair = (x) => Array.isArray(x) && x.length === 2 && x.every((s) => typeof s === "string" && s);
const triple = (x) => Array.isArray(x) && x.length === 3 && x.every((s) => typeof s === "string" && s);

for (const x of neu) {
  const e = [], d = x.T, t = d.t, need = (ok, msg) => { if (!ok) e.push(msg); };
  need(RUBRIKEN.includes(d.r), `r unbekannt: ${d.r}`);
  need(typeof d.w === "string" && d.w.length > 80, "w fehlt oder zu kurz");
  need(d.q?.length === 4, "q: 4 Fragen");
  need(d.v?.length === 6 && d.v.every(pair), "v: 6 Paare");
  need(d.s?.length === 5 && d.s.every(pair), "s: 5 Paare");
  need(d.a?.length === 5 && d.a.every(pair), "a: 5 Schritte");
  need(d.d?.length === 3, "d: 3 Fragen");
  need(triple(d.f), "f: [Fehler, richtig, Erklärung]");
  need(/^\d{4}-\d{2}-\d{2}$/.test(d.stand || ""), "stand: Datum JJJJ-MM-TT (für das Archiv)");
  const w = x.WG;
  need(Array.isArray(w) && w.length === 5 && w.slice(0, 4).every((g) => g[1].length === 2 && g[1].every(triple)), "WG: 4 Schritte × 2 Einträge [de, ru, Beispiel] + Frage");
  const k = x.LINK;
  need(Array.isArray(k) && k.length === 4 && k.every((s) => s.h && s.say && s.prep && typeof s.video === "string"), "LINK: 4 Schritte {h, say, prep, video}");
  if (k && !x.VIDEO) need(k.every((s) => !s.video), "LINK: Video-Aufgabe ohne VIDEO");
  const r = x.ROLL;
  need(r && r.B?.length === 10 && r.B.every(triple), "ROLL.B: 10 × [Begriff, Erklärung, Übersetzung]");
  need(r && r.F?.length >= 8 && r.F.length <= 10 && r.F.every((s) => typeof s === "string" && s), "ROLL.F: 8–10 Fakten");
  need(r && r.U?.length >= 8 && r.U.length <= 10 && r.U.every(pair), "ROLL.U: 8–10 Paare");
  need(r && r.X?.length >= 6 && r.X.length <= 8 && r.X.every(triple), "ROLL.X: 6–8 Fehler");
  need(r && r.Q?.length === 10 && r.Q.every((q) => typeof q[0] === "string" && Array.isArray(q[1]) && q[1].length === 3 && typeof q[2] === "string"), "ROLL.Q: 10 × [Frage, [richtig, falsch, falsch], Erklärung]");
  if (x.VIDEO) need(triple(x.VIDEO) && /^[\w-]{11}$/.test(x.VIDEO[0]), "VIDEO: [ID, Titel, Kanal]");
  if (process.argv.includes("--video") && x.VIDEO) {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${x.VIDEO[0]}&format=json`);
    need(res.ok, `VIDEO: ${x.VIDEO[0]} nicht erreichbar (${res.status})`);
  }
  if (e.length) { errors += e.length; console.log(`✗ ${t}\n  - ${e.join("\n  - ")}`); }
  else console.log(`✓ ${t}${x.VIDEO ? "" : " (ohne Video)"}`);
}
console.log(`\n${all.length} Themen insgesamt, ${neu.length} im NEU-Block, ${errors} Fehler`);
if (errors) process.exitCode = 1;
