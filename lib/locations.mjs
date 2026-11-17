import { fail, first, rows } from "./remote.mjs";

export function branchId(value, optional = false) {
  if (optional && !value) return null;
  if (value !== "ubon" && value !== "yasothon")
    throw fail(400, "BRANCH_REQUIRED");
  return value;
}

export async function locations() {
  return rows("sw_clinic_locations", {
    select: "id,name_th,name_en,map_url",
    order: "id.asc",
  });
}

export function validMapUrl(value) {
  if (typeof value !== "string" || value.length > 1000 || !value.trim())
    return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.port || url.username || url.password)
      return "";
    if (["maps.app.goo.gl", "maps.google.com"].includes(url.hostname))
      return url.href;
    if (url.hostname === "goo.gl" && url.pathname.startsWith("/maps/"))
      return url.href;
    if (
      [
        "www.google.com",
        "google.com",
        "www.google.co.th",
        "google.co.th",
      ].includes(url.hostname) &&
      /^\/maps(?:\/|$)/.test(url.pathname)
    )
      return url.href;
  } catch {}
  return "";
}

export async function branchMap(value) {
  const id = branchId(value);
  const location = await first("sw_clinic_locations", {
    select: "id,name_th,map_url",
    id: "eq." + id,
  });
  if (!location) throw fail(404, "BRANCH_REQUIRED");
  return (
    validMapUrl(location.map_url) ||
    "https://www.google.com/maps/search/?" +
      new URLSearchParams({
        api: "1",
        query: "คลินิกกระดูกและข้อหมอสุวัฒน์ " + location.name_th,
      })
  );
}
