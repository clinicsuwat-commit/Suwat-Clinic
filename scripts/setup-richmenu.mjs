/**
 * OPTIONAL, EXPLICIT ACTION. Run manually only when you want to change the
 * default Rich Menu of the existing LINE OA. Does not create a new OA.
 * Requires LINE_CHANNEL_ACCESS_TOKEN, LINE_LIFF_ID and PUBLIC_BASE_URL.
 * The script will CREATE a rich menu, upload its image, then set it as default.
 */
import fs from "node:fs";
import path from "node:path";
if (fs.existsSync(".env")) process.loadEnvFile(".env");
const { cfg } = await import("../lib/remote.mjs");
if (!cfg.lineToken || !cfg.liffId)
  throw new Error(
    "Set LINE_CHANNEL_ACCESS_TOKEN and LINE_LIFF_ID in .env first",
  );
const image = fs.readFileSync(path.resolve("line-richmenu-th-en.png"));
const uri = (view) =>
  `https://liff.line.me/${cfg.liffId}?view=${encodeURIComponent(view)}`;
const actions = [
  { type: "uri", label: "Book", uri: uri("booking") },
  { type: "uri", label: "Shop", uri: uri("shop") },
  { type: "uri", label: "Appointments", uri: uri("appointments") },
  { type: "uri", label: "Orders", uri: uri("orders") },
  { type: "uri", label: "My account", uri: uri("account") },
  { type: "message", label: "Contact clinic", text: "ติดต่อเจ้าหน้าที่" },
];
const areas = actions.map((action, i) => ({
  bounds: {
    x: i % 3 === 0 ? 0 : i % 3 === 1 ? 833 : 1666,
    y: i < 3 ? 0 : 843,
    width: i % 3 === 2 ? 834 : 833,
    height: 843,
  },
  action,
}));
async function call(url, method, body, contentType = "application/json") {
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + cfg.lineToken,
      ...(body ? { "Content-Type": contentType } : {}),
    },
    body,
  });
  const value = await resp.text();
  if (!resp.ok) throw new Error(`${resp.status}: ${value}`);
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
const richmenu = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "Suwat Clinic bilingual menu",
  chatBarText: "SUWAT CLINIC",
  areas,
};
const { richMenuId } = await call(
  "https://api.line.me/v2/bot/richmenu",
  "POST",
  JSON.stringify(richmenu),
);
console.log("Created Rich Menu:", richMenuId);
await call(
  `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
  "POST",
  image,
  "image/png",
);
await call(
  `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
  "POST",
);
console.log(
  "Existing LINE OA default Rich Menu updated. Keep the Rich Menu ID for later management.",
);
