// Small helpers every page of the guest area (/my) shares: "is anyone signed
// in?", "the server says the session is over" and "sign out".
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, getGuestToken } from "../../api/client";
import { getMyAccount, guestLogout } from "../../api/guest";
import type { MyAccount } from "../../api/guest";
import { useToast } from "../../design/components";
import { asApiError } from "./FormProblem";
import { signInPath } from "./safeNext";

/**
 * True when a guest session is stored. When none is, the person is sent to
 * the sign-in page, which brings them back here afterwards.
 */
export function useRequireGuest(): boolean {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const signedIn = getGuestToken() !== null;
  useEffect(() => {
    if (!signedIn) navigate(signInPath(pathname), { replace: true });
  }, [signedIn, navigate, pathname]);
  return signedIn;
}

/**
 * Returns a function for failed calls: when the server says the session is
 * over (401), it sends the person to sign in and returns true.
 * (api/client.ts has already forgotten the token by then.)
 */
export function useSessionExpired(): (error: unknown) => boolean {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useCallback(
    (error: unknown) => {
      if (!(error instanceof ApiError) || error.code !== "unauthorised") return false;
      navigate(signInPath(pathname), { replace: true });
      return true;
    },
    [navigate, pathname],
  );
}

/** Signs out on every device, then shows the sign-in page. */
export function useSignOut(): () => Promise<void> {
  const navigate = useNavigate();
  const toast = useToast();
  return useCallback(async () => {
    try {
      await guestLogout();
    } catch {
      // The token is forgotten in this browser either way; the server ends it at its expiry.
    }
    toast.show("You are signed out.", "success");
    navigate("/my/sign-in");
  }, [navigate, toast]);
}

export type AccountLoad = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready"; me: MyAccount };

/** Loads GET /guest/me; a 401 sends the person to sign in. Shared with AccountPage. */
export function useMyAccount() {
  const signedIn = useRequireGuest();
  const expired = useSessionExpired();
  const [load, setLoad] = useState<AccountLoad>({ status: "loading" });

  const fetchMe = useCallback(async (): Promise<void> => {
    setLoad({ status: "loading" });
    try {
      setLoad({ status: "ready", me: await getMyAccount() });
    } catch (error) {
      if (!expired(error)) setLoad({ status: "error", error: asApiError(error) });
    }
  }, [expired]);

  useEffect(() => {
    if (signedIn) void fetchMe();
  }, [signedIn, fetchMe]);

  return { load, retry: fetchMe };
}
