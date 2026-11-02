// Prüft die Themen im NEU-Block von public/index.html (siehe THEMEN.md)
// node tools/check-themen.mjs [--video]
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const lines = html.split("\n");
const table = (name) => {
  const l = lines.find((x) => x.startsWith(`const ${name}=`));
  if (!l) throw new Error(`Tabelle ${name} nicht gefunden`);
  return JSON.parse(l.slice(`const ${name}=`.length).trim().replace(/;$/, ""));
};
const VIDEO = table("VIDEO"), WG = table("WG"), LINK = table("LINK"), ROLL = table("ROLL");

// Themen zwischen dem NEU-Kommentar und dem nächsten Kommentar
const start = lines.findIndex((l) => l.includes("---------- NEU:"));
if (start < 0) throw new Error("NEU-Block nicht gefunden");
const topics = [];
for (let i = start + 1; i < lines.length && !lines[i].startsWith("/*"); i++) {
  const l = lines[i].trim().replace(/,$/, "");
  if (!l) continue;
  try { topics.push(JSON.parse(l)); } catch { console.log(`✗ Zeile ${i + 1}: kein gültiges JSON`); process.exitCode = 1; }
}

const RUBRIKEN = ["aktuell", "promi", "hamburg", "kneipe", "typisch", "geschichte", "kultur", "feste", "sprache", "verstehen", "allgemein"];
const pair = (x) => Array.isArray(x) && x.length === 2 && x.every((s) => typeof s === "string" && s);
const triple = (x) => Array.isArray(x) && x.length === 3 && x.every((s) => typeof s === "string" && s);

let errors = 0;
for (const d of topics) {
  const e = [], t = d.t;
  const need = (ok, msg) => { if (!ok) e.push(msg); };
  need(RUBRIKEN.includes(d.r), `r unbekannt: ${d.r}`);
  need(typeof d.w === "string" && d.w.length > 80, "w fehlt oder zu kurz");
  need(d.q?.length === 4, "q: 4 Fragen");
  need(d.v?.length === 6 && d.v.every(pair), "v: 6 Paare");
  need(d.s?.length === 5 && d.s.every(pair), "s: 5 Paare");
  need(d.a?.length === 5 && d.a.every(pair), "a: 5 Schritte");
  need(d.d?.length === 3, "d: 3 Fragen");
  need(triple(d.f), "f: [Fehler, richtig, Erklärung]");

  const w = WG[t];
  need(Array.isArray(w) && w.length === 5 && w.slice(0, 4).every((g) => g[1].length === 2 && g[1].every(triple)), "WG: 4 Schritte × 2 Einträge [de, ru, Beispiel] + Frage");
  const k = LINK[t];
  need(Array.isArray(k) && k.length === 4 && k.every((s) => s.h && s.say && s.prep && typeof s.video === "string"), "LINK: 4 Schritte {h, say, prep, video}");
  if (k && !VIDEO[t]) need(k.every((s) => !s.video), "LINK: Video-Aufgabe ohne VIDEO");
  const r = ROLL[t];
  need(r && r.B?.length === 10 && r.B.every(triple), "ROLL.B: 10 × [Begriff, Erklärung, Übersetzung]");
  need(r && r.F?.length >= 8 && r.F.length <= 10 && r.F.every((s) => typeof s === "string" && s), "ROLL.F: 8–10 Fakten");
  need(r && r.U?.length >= 8 && r.U.length <= 10 && r.U.every(pair), "ROLL.U: 8–10 Paare");
  need(r && r.X?.length >= 6 && r.X.length <= 8 && r.X.every(triple), "ROLL.X: 6–8 Fehler");
  need(r && r.Q?.length === 10 && r.Q.every((q) => typeof q[0] === "string" && Array.isArray(q[1]) && q[1].length === 3 && typeof q[2] === "string"), "ROLL.Q: 10 × [Frage, [richtig, falsch, falsch], Erklärung]");
  if (VIDEO[t]) need(triple(VIDEO[t]) && /^[\w-]{11}$/.test(VIDEO[t][0]), "VIDEO: [ID, Titel, Kanal]");

  if (process.argv.includes("--video") && VIDEO[t]) {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${VIDEO[t][0]}&format=json`);
    need(r.ok, `VIDEO: ${VIDEO[t][0]} nicht erreichbar (${r.status})`);
  }
  if (e.length) { errors += e.length; console.log(`✗ ${t}\n  - ${e.join("\n  - ")}`); }
  else console.log(`✓ ${t}${VIDEO[t] ? "" : " (ohne Video)"}`);
}
console.log(`\n${topics.length} Themen im NEU-Block, ${errors} Fehler`);
if (errors) process.exitCode = 1;
