import { useCallback, useEffect, useState } from "react";
import { fetchMyAccount, registerAccount, updateMyAccount } from "../lib/api";
import { usePersistentState } from "./usePersistentState";
import { AccountInput, AccountProfile } from "../shared/types";

const ACCOUNT_SESSION_KEY = "debate-account-session-token";

export function useAccountSession() {
  const [sessionToken, setSessionToken] = usePersistentState<string>(ACCOUNT_SESSION_KEY, "");
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken) {
      setAccount(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchMyAccount(sessionToken)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setAccount(response.account);
      })
      .catch((accountError) => {
        if (cancelled) {
          return;
        }

        setSessionToken("");
        setAccount(null);
        setError(accountError instanceof Error ? accountError.message : "账户信息读取失败");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionToken, setSessionToken]);

  const register = useCallback(
    async (input: AccountInput) => {
      setSaving(true);
      setError(null);

      try {
        const response = await registerAccount(input);
        setSessionToken(response.token);
        setAccount(response.account);
      } catch (accountError) {
        setError(accountError instanceof Error ? accountError.message : "账户创建失败");
        throw accountError;
      } finally {
        setSaving(false);
      }
    },
    [setSessionToken],
  );

  const update = useCallback(
    async (input: AccountInput) => {
      if (!sessionToken) {
        throw new Error("当前没有可更新的账户");
      }

      setSaving(true);
      setError(null);

      try {
        const response = await updateMyAccount(sessionToken, input);
        setAccount(response.account);
      } catch (accountError) {
        setError(accountError instanceof Error ? accountError.message : "账户更新失败");
        throw accountError;
      } finally {
        setSaving(false);
      }
    },
    [sessionToken],
  );

  const logout = useCallback(() => {
    setSessionToken("");
    setAccount(null);
    setError(null);
  }, [setSessionToken]);

  return {
    account,
    loading,
    saving,
    error,
    hasAccount: Boolean(account && sessionToken),
    register,
    update,
    logout,
  };
}
