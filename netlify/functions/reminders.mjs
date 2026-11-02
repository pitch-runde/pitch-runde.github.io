import { getStore } from "@netlify/blobs";
import { sendReminders, sendNachTreffen } from "../lib/core.mjs";

// Jeden Tag um 8:00 UTC (10 Uhr Sommerzeit, 9 Uhr Winterzeit in Hamburg):
// Erinnerung für morgen und Lern-Nachricht für das Treffen von gestern
export default async () => {
  const store = getStore({ name: "pitchrunde", consistency: "strong" });
  const site = process.env.URL || "https://pitchrunde.netlify.app";
  const n = await sendReminders({ store, botToken: process.env.BOT_TOKEN });
  const m = await sendNachTreffen({ store, botToken: process.env.BOT_TOKEN, botLink: process.env.BOT_LINK || "", getThemen: () => fetch(site + "/themen.js").then((r) => r.text()) });
  console.log("Erinnerungen gesendet:", n, "· Nach dem Treffen:", m);
};

export const config = { schedule: "0 8 * * *" };
