// Pitch-Runde · Server-Logik (unabhängig von Netlify, damit sie testbar ist)
import crypto from "node:crypto";

/* ---------- Telegram: initData prüfen ---------- */
export function verifyInitData(initData, botToken, maxAgeSec = 60 * 60 * 24 * 7) {
  if (!initData || !botToken) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if (!hash) return null;
  p.delete("hash");
  const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calc = crypto.createHmac("sha256", secret).update(dcs).digest("hex");
  const a = Buffer.from(calc, "hex"), b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const authDate = Number(p.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  let user = null;
  try { user = JSON.parse(p.get("user") || "null"); } catch { return null; }
  if (!user || !user.id) return null;
  return user;
}


/* ---------- Telegram Login Widget (Browser am Computer) ---------- */
export function verifyLoginWidget(raw, botToken, maxAgeSec = 60 * 60 * 24 * 30) {
  if (!raw || !botToken) return null;
  let d;
  try { d = JSON.parse(decodeURIComponent(raw)); } catch { return null; }
  if (!d || typeof d !== "object" || !d.hash || !d.id) return null;
  const { hash, ...rest } = d;
  const dcs = Object.keys(rest).filter((k) => rest[k] !== undefined && rest[k] !== null && rest[k] !== "").sort().map((k) => `${k}=${rest[k]}`).join("\n");
  const secret = crypto.createHash("sha256").update(botToken).digest();
  const calc = crypto.createHmac("sha256", secret).update(dcs).digest("hex");
  const a = Buffer.from(calc, "hex"), b = Buffer.from(String(hash), "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!d.auth_date || Date.now() / 1000 - Number(d.auth_date) > maxAgeSec) return null;
  return { id: d.id, first_name: d.first_name || "", last_name: d.last_name || "", username: d.username || "", photo_url: d.photo_url || "" };
}

/* ---------- Pfade und Regeln ---------- */
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
export function cleanPath(path) {
  if (typeof path !== "string") return null;
  const s = path.split("/");
  if (s.length < 1 || s.length > 16 || !s.every((x) => SEG.test(x) && x !== "." && x !== "..")) return null;
  return s;
}
// read/write erlaubt?
export function allowed(seg, uid, isAdmin, op) {
  const [a, b, c] = seg;
  if (a === "data" && b === "users") return c === uid;            // eigener Bereich
  if (a === "treffen") return op === "read" || isAdmin;           // Termine: alle lesen, Admin schreibt
  if (a === "signups") {
    if (op === "read") return true;
    return seg.length >= 2 && (b === uid || isAdmin);             // nur eigene Anmeldung (Admin alle)
  }
  return false;
}

/* ---------- Telegram Bot senden ---------- */
export async function tgSend(botToken, chatId, text) {
  if (!botToken) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    return r.ok;
  } catch { return false; }
}
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"], MO = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
export function fmtTreffen(t) {
  const d = new Date(t.datum + "T12:00:00Z");
  return `${WT[d.getUTCDay()]}, ${d.getUTCDate()}. ${MO[d.getUTCMonth()]} um ${t.zeit || ""} Uhr, ${t.ort || ""}`;
}

/* ---------- Store-Helfer ---------- */
async function listDocs(store, colPath) {
  const prefix = colPath + "/";
  const { blobs } = await store.list({ prefix });
  const depth = colPath.split("/").length + 1;
  const keys = blobs.map((b) => b.key).filter((k) => k.split("/").length === depth);
  const out = [];
  for (const k of keys) {
    const v = await store.get(k, { type: "json" });
    if (v != null) out.push({ id: k.split("/").pop(), data: v });
  }
  return out;
}
const tgIdOf = (uid) => (uid && uid.startsWith("tg") ? uid.slice(2) : null);
function signVal(v) {
  if (typeof v === "string") return { at: v, thema: "" };
  if (v && typeof v === "object") return { at: String(v.at || ""), thema: typeof v.thema === "string" ? v.thema : "" };
  return null;
}
async function confirmedFor(store, tid, signups) {
  const t = await store.get("treffen/" + tid, { type: "json" });
  if (!t) return { t: null, ok: [] };
  const cap = Math.max(1, Number(t.plaetze) || 1);
  const ppl = signups.map(({ id, data }) => { const v = signVal(data && data[tid]); return v ? { id, ...v } : null; })
    .filter(Boolean).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return { t, ok: ppl.slice(0, cap).map((p) => p.id), all: ppl };
}

/* ---------- API ---------- */
export function makeApi({ store, botToken, adminIds = [], botLink = "", send = tgSend }) {
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  return async function handle(req) {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\/api\/?/, "");
    if (route === "config") { const m = /t\.me\/([A-Za-z0-9_]+)/.exec(botLink || ""); return json({ botLink: botLink || "", botName: m ? m[1] : "" }); }
    const user = verifyInitData(req.headers.get("x-telegram-init-data"), botToken) || verifyLoginWidget(req.headers.get("x-telegram-login"), botToken);
    if (!user) return json({ error: "unauthorized" }, 401);
    const uid = "tg" + user.id;
    const isAdmin = adminIds.includes(String(user.id));
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Jemand";

    if (route === "me" && req.method === "GET") {
      await store.setJSON("profiles/" + uid, { name, username: user.username || "", photo: user.photo_url || "", seen: new Date().toISOString() });
      return json({ id: uid, tgId: String(user.id), name, username: user.username || "", photo: user.photo_url || "", isAdmin });
    }
    if (route === "profiles" && req.method === "GET") {
      const ids = (url.searchParams.get("ids") || "").split(",").filter(Boolean).slice(0, 200);
      const out = {};
      for (const id of ids) {
        if (!SEG.test(id)) continue;
        const p = await store.get("profiles/" + id, { type: "json" });
        out[id] = { name: (p && p.name) || "", username: (p && p.username) || "" };
      }
      return json(out);
    }
    const seg = cleanPath(url.searchParams.get("path"));
    if (!seg) return json({ error: "bad_path" }, 400);
    const path = seg.join("/");

    if (route === "col") {
      if (seg.length % 2 !== 1) return json({ error: "not_collection" }, 400);
      if (req.method === "GET") {
        if (!allowed(seg, uid, isAdmin, "read")) return json({ error: "forbidden" }, 403);
        return json(await listDocs(store, path));
      }
      if (req.method === "POST") {
        if (!allowed([...seg, "x"], uid, isAdmin, "write")) return json({ error: "forbidden" }, 403);
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== "object") return json({ error: "bad_body" }, 400);
        const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
        await store.setJSON(path + "/" + id, body);
        return json({ id });
      }
    }
    if (route === "doc") {
      if (seg.length % 2 !== 0) return json({ error: "not_document" }, 400);
      if (req.method === "GET") {
        if (!allowed(seg, uid, isAdmin, "read")) return json({ error: "forbidden" }, 403);
        const v = await store.get(path, { type: "json" });
        return json({ exists: v != null, data: v ?? null });
      }
      if (!allowed(seg, uid, isAdmin, "write")) return json({ error: "forbidden" }, 403);
      // Wartelisten-Nachrücker merken (nur bei Abmeldungen relevant)
      const isSign = seg[0] === "signups" && seg.length === 2;
      let before = null, touched = [];
      if (isSign) {
        const old = (await store.get(path, { type: "json" })) || {};
        touched = Object.keys(old);
        const all = await listDocs(store, "signups");
        before = {};
        for (const tid of touched) before[tid] = (await confirmedFor(store, tid, all)).ok;
      }
      if (req.method === "PUT" || req.method === "PATCH") {
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== "object") return json({ error: "bad_body" }, 400);
        let next = body;
        if (req.method === "PATCH") next = { ...((await store.get(path, { type: "json" })) || {}), ...body };
        if (JSON.stringify(next).length > 100000) return json({ error: "too_large" }, 413);
        await store.setJSON(path, next);
      } else if (req.method === "DELETE") {
        await store.delete(path);
      } else return json({ error: "method" }, 405);
      if (isSign && touched.length) {
        const all = await listDocs(store, "signups");
        for (const tid of touched) {
          const { t, ok } = await confirmedFor(store, tid, all);
          if (!t) continue;
          for (const p of ok) if (!before[tid].includes(p) && p !== seg[1]) {
            const chat = tgIdOf(p);
            if (chat) await send(botToken, chat, `🎉 Ein Platz ist frei geworden, du bist dabei!\n<b>${esc(fmtTreffen(t))}</b>`);
          }
        }
      }
      return json({ ok: true });
    }
    return json({ error: "not_found" }, 404);
  };
}

/* ---------- Erinnerungen (täglich) ---------- */
export async function sendReminders({ store, botToken, send = tgSend, now = new Date() }) {
  const berlin = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const tomorrow = berlin(new Date(now.getTime() + 24 * 3600 * 1000));
  const treffen = (await listDocs(store, "treffen")).filter((x) => x.data && x.data.datum === tomorrow);
  if (!treffen.length) return 0;
  const signups = await listDocs(store, "signups");
  let n = 0;
  for (const { id, data: t } of treffen) {
    const cap = Math.max(1, Number(t.plaetze) || 1);
    const { all } = await confirmedFor(store, id, signups);
    for (let i = 0; i < all.length; i++) {
      const p = all[i], chat = tgIdOf(p.id);
      if (!chat) continue;
      const msg = i < cap
        ? `⏰ Morgen ist Pitch-Runde!\n<b>${esc(fmtTreffen(t))}</b>\n${p.thema ? `Dein Thema: <b>${esc(p.thema)}</b>` : "Du hast noch kein Thema gewählt."}`
        : `⏰ Morgen ist Pitch-Runde: <b>${esc(fmtTreffen(t))}</b>\nDu stehst auf der Warteliste (Platz ${i - cap + 1}). Wir sagen Bescheid, wenn ein Platz frei wird.`;
      if (await send(botToken, chat, msg)) n++;
    }
  }
  return n;
}
