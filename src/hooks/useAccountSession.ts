import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  changeMyPassword,
  fetchMyAccount,
  loginAccount,
  logoutAccount,
  registerAccount,
  requestPasswordReset,
  resendMyVerification,
  resetPassword as resetPasswordRequest,
  updateMyAccount,
  verifyMyEmail,
} from "../lib/api";
import { usePersistentState } from "./usePersistentState";
import {
  AccountProfile,
  AuthMessageResponse,
  AuthSessionResponse,
  ChangePasswordInput,
  LoginInput,
  ProfileInput,
  RegisterInput,
  ResetPasswordInput,
} from "../shared/types";

const ACCOUNT_SESSION_KEY = "debate-account-session-token";

function describe(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * 账号会话 hook。
 *
 * 与旧版的区别：
 * - 会话 token 由服务端签发并存进 D1，可以真正吊销（登出 / 改密码）
 * - 新增登录、改密码、邮箱验证、找回密码
 * - 401 才清本地 token；网络故障不会把人踢下线
 */
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
        if (!cancelled) {
          setAccount(response.account);
        }
      })
      .catch((accountError) => {
        if (cancelled) {
          return;
        }

        if (accountError instanceof ApiError && accountError.status === 401) {
          // 令牌真的失效了，清掉本地状态
          setSessionToken("");
          setAccount(null);
          return;
        }

        // 网络/服务端故障：保留登录状态，只提示错误
        setError(describe(accountError, "账户信息读取失败"));
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

  /** 注册：成功后直接进入登录状态，并返回原始响应（里面可能带开发模式的验证码） */
  const register = useCallback(
    async (input: RegisterInput): Promise<AuthSessionResponse> => {
      setSaving(true);
      setError(null);

      try {
        const response = await registerAccount(input);
        setSessionToken(response.token);
        setAccount(response.account);
        return response;
      } catch (accountError) {
        setError(describe(accountError, "注册失败"));
        throw accountError;
      } finally {
        setSaving(false);
      }
    },
    [setSessionToken],
  );

  const login = useCallback(
    async (input: LoginInput): Promise<AuthSessionResponse> => {
      setSaving(true);
      setError(null);

      try {
        const response = await loginAccount(input);
        setSessionToken(response.token);
        setAccount(response.account);
        return response;
      } catch (accountError) {
        setError(describe(accountError, "登录失败"));
        throw accountError;
      } finally {
        setSaving(false);
      }
    },
    [setSessionToken],
  );

  const logout = useCallback(async (): Promise<void> => {
    const token = sessionToken;

    // 先清本地状态，保证界面立刻退出
    setSessionToken("");
    setAccount(null);
    setError(null);

    if (!token) {
      return;
    }

    try {
      await logoutAccount(token);
    } catch {
      // 服务端吊销失败不影响本地登出
    }
  }, [sessionToken, setSessionToken]);

  const updateProfile = useCallback(
    async (input: ProfileInput): Promise<void> => {
      if (!sessionToken) {
        throw new Error("当前没有登录的账户");
      }

      setSaving(true);
      setError(null);

      try {
        const response = await updateMyAccount(sessionToken, input);
        setAccount(response.account);
      } catch (accountError) {
        setError(describe(accountError, "资料保存失败"));
        throw accountError;
      } finally {
        setSaving(false);
      }
    },
    [sessionToken],
  );

  const changePassword = useCallback(
    async (input: ChangePasswordInput): Promise<void> => {
      if (!sessionToken) {
        throw new Error("当前没有登录的账户");
      }

      setSaving(true);
      setError(null);

      try {
        await changeMyPassword(sessionToken, input);
      } catch (accountError) {
        setError(describe(accountError, "密码修改失败"));
        throw accountError;
      } finally {
        setSaving(false);
      }
    },
    [sessionToken],
  );

  const verifyEmail = useCallback(
    async (code: string): Promise<void> => {
      if (!sessionToken) {
        throw new Error("当前没有登录的账户");
      }

      setSaving(true);
      setError(null);

      try {
        const response = await verifyMyEmail(sessionToken, code);
        setAccount(response.account);
      } catch (accountError) {
        setError(describe(accountError, "邮箱验证失败"));
        throw accountError;
      } finally {
        setSaving(false);
      }
    },
    [sessionToken],
  );

  const resendVerification = useCallback(async (): Promise<AuthMessageResponse> => {
    if (!sessionToken) {
      throw new Error("当前没有登录的账户");
    }

    setSaving(true);
    setError(null);

    try {
      return await resendMyVerification(sessionToken);
    } catch (accountError) {
      setError(describe(accountError, "验证码发送失败"));
      throw accountError;
    } finally {
      setSaving(false);
    }
  }, [sessionToken]);

  /** 申请重置密码：不需要登录 */
  const requestReset = useCallback(async (email: string): Promise<AuthMessageResponse> => {
    setSaving(true);
    setError(null);

    try {
      return await requestPasswordReset({ email });
    } catch (accountError) {
      setError(describe(accountError, "发送重置验证码失败"));
      throw accountError;
    } finally {
      setSaving(false);
    }
  }, []);

  /** 提交重置密码：不需要登录 */
  const resetPassword = useCallback(async (input: ResetPasswordInput): Promise<void> => {
    setSaving(true);
    setError(null);

    try {
      await resetPasswordRequest(input);
    } catch (accountError) {
      setError(describe(accountError, "重置密码失败"));
      throw accountError;
    } finally {
      setSaving(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    account,
    token: sessionToken,
    loading,
    saving,
    error,
    hasAccount: Boolean(account && sessionToken),
    needsEmailVerification: Boolean(account && !account.emailVerified),
    register,
    login,
    logout,
    updateProfile,
    changePassword,
    verifyEmail,
    resendVerification,
    requestReset,
    resetPassword,
    clearError,
  };
}

export type AccountSession = ReturnType<typeof useAccountSession>;
