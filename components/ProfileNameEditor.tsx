"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function ProfileNameEditor({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/findjoy/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "保存失败，请稍后重试");
      setName(result.displayName);
      setEditing(false);
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请稍后重试");
    } finally { setBusy(false); }
  }

  return <>
    {editing ? <form className="profile-name-editor" onSubmit={save}>
      <label className="sr-only" htmlFor="profile-nickname">昵称</label>
      <input id="profile-nickname" value={name} onChange={event => setName(event.target.value)} required maxLength={80} autoComplete="nickname" autoFocus disabled={busy} />
      <div><button className="text-button" type="submit" disabled={busy}>{busy ? "保存中…" : "保存"}</button><button className="text-button" type="button" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>取消</button></div>
    </form> : <div className="profile-name-value"><span>{saved ? name : displayName}</span><button className="text-button" type="button" onClick={() => { setName(saved ? name : displayName); setSaved(false); setError(""); setEditing(true); }}>修改昵称</button></div>}
    {error && <p className="account-error" role="alert">{error}</p>}
    {saved && <p className="profile-name-status" role="status">昵称已保存</p>}
  </>;
}
