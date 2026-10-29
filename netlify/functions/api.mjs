import { getStore } from "@netlify/blobs";
import { makeApi } from "../lib/core.mjs";

export default async (req) => {
  const handle = makeApi({
    store: getStore("pitchrunde"),
    botToken: process.env.BOT_TOKEN,
    botLink: process.env.BOT_LINK || "",
    groupChatId: process.env.GROUP_CHAT_ID || "",
    adminIds: (process.env.ADMIN_TELEGRAM_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
  });
  return handle(req);
};

export const config = { path: "/api/*" };
