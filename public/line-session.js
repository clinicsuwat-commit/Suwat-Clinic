export const lineSignedOutKey = "sc_line_signed_out";
export const lineLoginPendingKey = "sc_line_login_pending";

export function clearExternalLineSession(liff) {
  if (!liff.isInClient() && liff.isLoggedIn()) liff.logout();
}

function startExternalLineLogin(liff, storage, callbackUrl) {
  clearExternalLineSession(liff);
  const redirect = new URL(callbackUrl);
  for (const key of [
    "code",
    "state",
    "error",
    "error_description",
    "liff.state",
  ])
    redirect.searchParams.delete(key);
  redirect.hash = "";
  liff.login({ redirectUri: redirect.href });
  storage.setItem(lineLoginPendingKey, "true");
  storage.removeItem(lineSignedOutKey);
}

export async function authenticateLineCustomer({
  liff,
  storage,
  callbackUrl,
  verify,
  interactive = false,
  returningFromLogin = false,
}) {
  const signedOut = storage.getItem(lineSignedOutKey);
  const loggedIn = liff.isLoggedIn();
  const canRedirect = interactive && !liff.isInClient();
  if (canRedirect && (signedOut || !loggedIn)) {
    startExternalLineLogin(liff, storage, callbackUrl);
    return null;
  }
  if (!interactive && !returningFromLogin && (signedOut || !loggedIn))
    return null;

  const token = loggedIn && liff.getIDToken();
  if (!token && canRedirect) {
    startExternalLineLogin(liff, storage, callbackUrl);
    return null;
  }
  if (!token)
    throw Object.assign(new Error("Missing LINE token"), {
      code: "LINE_TOKEN_MISSING",
    });
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
    startExternalLineLogin(liff, storage, callbackUrl);
    return null;
  }
}
