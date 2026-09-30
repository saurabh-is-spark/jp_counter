"use client";

import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/entries";
import { JaapApp } from "./jaap-app";

type Mode = "login" | "register" | "forgot" | "reset";

export function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("flow") === "recovery") {
      Promise.resolve().then(() => setMode("reset"));
    }
    if (!supabase) { Promise.resolve().then(() => setReady(true)); return; }
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setReady(true);
      if (event === "PASSWORD_RECOVERY") setMode("reset");
      if (event === "SIGNED_OUT") { setPassword(""); setConfirmation(""); setMode("login"); setMessage(""); setError(""); }
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) setError(sessionError.message);
      setUser(data.session?.user ?? null);
      setReady(true);
    }).catch(() => { if (mounted) { setError("Could not load your session. Please try again."); setReady(true); } });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  function changeMode(next: Mode) {
    setMode(next); setMessage(""); setError(""); setPassword(""); setConfirmation("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setError(""); setMessage("");
    if ((mode === "register" || mode === "reset") && password !== confirmation) {
      setError("The passwords do not match."); return;
    }
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (!data.session) setMessage("Check your email to confirm your account, then log in. If you already have an account, use Log in.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${redirectTo}?flow=recovery` });
        if (error) throw error;
        setMessage("If an account exists for this email, you will receive a password reset link.");
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        window.history.replaceState(null, "", "/");
        setMode("login");
        setMessage("Password updated.");
      }
      setPassword(""); setConfirmation("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  async function logout() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  }

  if (!ready) return <div className="auth-page"><p role="status">Loading your account…</p></div>;
  if (user && !user.is_anonymous && mode !== "reset") return <JaapApp key={user.id} user={user} onLogout={logout} />;

  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand">✦ <strong>Jaap Tally</strong></div>
    <span className="auth-eyebrow">YOUR DAILY PRACTICE</span>
    <h1>{mode === "register" ? "Create your account." : mode === "forgot" ? "Reset your password." : mode === "reset" ? "Choose a new password." : "Welcome back."}</h1>
    <p>{mode === "register" ? "Keep your tallies together wherever you log in." : mode === "forgot" ? "We will send you a link to choose a new password." : mode === "reset" ? "Set a password to secure your account." : "Log in to continue your daily practice."}</p>
    {!supabase ? <p className="auth-error" role="alert">Account access is not available yet. Please try again later.</p> : <>
      {(mode === "login" || mode === "register") && <div className="auth-tabs"><button type="button" className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Log in</button><button type="button" className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Register</button></div>}
      <form onSubmit={submit}>
        {mode !== "reset" && <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>}
        {mode !== "forgot" && <label>Password<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? undefined : 8} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>}
        {(mode === "register" || mode === "reset") && <><small className="auth-hint">Use at least 8 characters.</small><label>Confirm password<input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /></label></>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Update password" : "Log in"}</button>
      </form>
      {mode === "login" && <button className="auth-link" onClick={() => changeMode("forgot")}>Forgot password?</button>}
      {mode === "forgot" && <button className="auth-link" onClick={() => changeMode("login")}>Back to log in</button>}
    </>}
  </section></main>;
}
