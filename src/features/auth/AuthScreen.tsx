import type { ReactNode, FormEvent } from "react";
import { Activity, Users, Wallet, ChevronRight } from "lucide-react";
export function AuthScreen({
  brand,
  themeButton,
  loginMode,
  setLoginMode,
  busy,
  error,
  toast,
  login,
}: {
  brand: ReactNode;
  themeButton: ReactNode;
  loginMode: string;
  setLoginMode: (mode: string) => void;
  busy: boolean;
  error: string;
  toast: string;
  login: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="login">
      <div className="login-theme">{themeButton}</div>
      <div className="login-art">
        <div className="brand">{brand}</div>
        <div>
          <span className="eyebrow">YOUR GYM. IN GOOD SHAPE.</span>
          <h1>
            Less paperwork.
            <br />
            More progress.
          </h1>
          <p>
            Members, memberships, collections and attendance.
            <br />
            One organised workspace for your everyday.
          </p>
          <div className="login-metrics">
            <span>
              <Users />
              Members
            </span>
            <span>
              <Wallet />
              Collections
            </span>
            <span>
              <Activity />
              Attendance
            </span>
          </div>
        </div>
        <span className="login-foot">Built for the way your gym works.</span>
      </div>
      <div className="login-form">
        <div className="mobile-brand brand">{brand}</div>
        <h2>
          {loginMode === "reset"
            ? "Reset your password"
            : "Welcome back"}
        </h2>
        <p className="muted">Sign in to your gym workspace.</p>
        <form onSubmit={login}>
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@gym.com"
            />
          </label>
          {loginMode === "login" && (
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </label>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : loginMode === "reset"
                ? "Send reset link"
                : "Sign in"}
            <ChevronRight size={18} />
          </button>
        </form>
        <button
          className="text-button"
          onClick={() =>
            setLoginMode(loginMode === "login" ? "reset" : "login")
          }
        >
          {loginMode === "login" ? "Forgot password?" : "Back to sign in"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
