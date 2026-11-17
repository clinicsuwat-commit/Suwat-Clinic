export const lineSignedOutKey = "sc_line_signed_out";
export const lineLoginPendingKey = "sc_line_login_pending";
export const lineReturnParam = "clinic_line_return";

const views = new Set([
  "booking",
  "shop",
  "appointments",
  "orders",
  "account",
  "medications",
]);

export function lineEntryUrl(currentUrl, view, liffId) {
  const current = new URL(currentUrl);
  if (liffId !== undefined && !/^\d+-[A-Za-z0-9]+$/.test(liffId)) return "";
  const destination = liffId
    ? new URL("https://liff.line.me/" + liffId)
    : new URL("/", current.origin);
  if (views.has(view)) destination.searchParams.set("view", view);
  for (const key of ["booking", "action", "refill", "map"]) {
    const value = current.searchParams.get(key);
    if (value) destination.searchParams.set(key, value);
  }
  return destination.href;
}

export function isReturningFromLine(currentUrl, storage) {
  const query = new URL(currentUrl).searchParams;
  return (
    storage.getItem(lineLoginPendingKey) === "true" ||
    query.get(lineReturnParam) === "1" ||
    (query.has("state") && (query.has("code") || query.has("error")))
  );
}

export function rememberLineLogin(storage) {
  storage.setItem(lineLoginPendingKey, "true");
  storage.removeItem(lineSignedOutKey);
}

export function lineSignInError(code) {
  return Object.assign(new Error(code), { code });
}

export function clearExternalLineSession(liff) {
  if (!liff.isInClient() && liff.isLoggedIn()) liff.logout();
}

function startExternalLineLogin(liff, storage, redirectUri) {
  clearExternalLineSession(liff);
  const callback = new URL(redirectUri);
  callback.searchParams.set(lineReturnParam, "1");
  liff.login({ redirectUri: callback.href });
  rememberLineLogin(storage);
}

export async function authenticateLineCustomer({
  liff,
  storage,
  redirectUri,
  verify,
  interactive = false,
  returningFromLogin = false,
}) {
  const signedOut = storage.getItem(lineSignedOutKey);
  const loggedIn = liff.isLoggedIn();
  const inClient = liff.isInClient();
  if (!interactive && signedOut) return null;
  const canRedirect = interactive && !inClient;
  if (canRedirect && (signedOut || !loggedIn)) {
    startExternalLineLogin(liff, storage, redirectUri);
    return null;
  }
  if (!interactive && !returningFromLogin && !inClient && !loggedIn)
    return null;

  if (!loggedIn) throw lineSignInError("LINE_LOGIN_INCOMPLETE");
  const token = liff.getIDToken();
  if (!token && canRedirect) {
    startExternalLineLogin(liff, storage, redirectUri);
    return null;
  }
  if (!token) throw lineSignInError("LINE_TOKEN_MISSING");
  try {
    const customer = await verify(token);
    storage.removeItem(lineSignedOutKey);
    return customer;
  } catch (error) {
    if (
      !canRedirect ||
      !["LINE_TOKEN_EXPIRED", "LINE_TOKEN_INVALID"].includes(error.code)
    )
      throw error;
    startExternalLineLogin(liff, storage, redirectUri);
    return null;
  }
}
