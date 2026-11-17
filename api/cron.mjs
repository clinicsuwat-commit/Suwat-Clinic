import { timingSafeEqual } from "node:crypto";
import { cfg, reply, errorReply, fail, flush, rpc } from "../lib/remote.mjs";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") throw fail(405, "Method not allowed");
    const actual = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from("Bearer " + cfg.cronSecret);
    if (
      !cfg.cronSecret ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw fail(401, "Unauthorized");
    }
    const started = Date.now();
    const staged = await rpc("sw_clinic_tick");
    let processed = 0;
    let sent = 0;
    while (Date.now() - started < 18500) {
      const result = await flush(20);
      sent += result.sent;
      processed += result.processed;
      if (result.processed < 20) break;
    }
    return reply(res, 200, { ok: true, ...staged, processed, sent });
  } catch (e) {
    return errorReply(res, e);
  }
}
