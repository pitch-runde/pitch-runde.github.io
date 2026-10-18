import { getStore } from "@netlify/blobs";
import { sendReminders } from "../lib/core.mjs";

// Jeden Tag um 8:00 UTC (10 Uhr Sommerzeit, 9 Uhr Winterzeit in Hamburg)
export default async () => {
  const n = await sendReminders({ store: getStore("pitchrunde"), botToken: process.env.BOT_TOKEN });
  console.log("Erinnerungen gesendet:", n);
};

export const config = { schedule: "0 8 * * *" };
