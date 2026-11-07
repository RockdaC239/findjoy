"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { EARLY_SIGNUP_LIMIT, EARLY_SIGNUP_POINTS } from "../lib/points";
import { API_BASE } from "../lib/life-session";
import styles from "./AdminDashboard.module.css";

interface AdminStats {
  users: number;
  plays: number;
  maxAge: number;
}

interface AdminUser {
  id: string;
  displayName: string;
  createdAt: number;
  signupRank: number;
  balance: number;
  lives: number;
  maxAge: number;
}

interface GrantResponse {
  error?: string;
  recipients?: number;
  balance?: { available: number; held: number };
}

const MAX_GRANT = 100_000;

function formatCount(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString("zh-CN") : "—";
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [scope, setScope] = useState<"user" | "all">("user");
  const [amount, setAmount] = useState("100");
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const amountValue = Number(amount);
  const amountValid = Number.isSafeInteger(amountValue) && amountValue >= 1 && amountValue <= MAX_GRANT;
  const totalCredits = amountValid && stats ? (scope === "all" ? stats.users * amountValue : amountValue) : 0;

  const loadStats = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/admin/stats`, { cache: "no-store" });
    if (!response.ok) throw new Error("后台数据读取失败，请刷新重试");
    setStats(await response.json() as AdminStats);
  }, []);

  const fetchUsers = useCallback(async (text: string) => {
    const response = await fetch(`${API_BASE}/api/admin/users?q=${encodeURIComponent(text)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("用户列表读取失败，请刷新重试");
    const payload = await response.json() as { users?: AdminUser[] };
    setUsers(Array.isArray(payload.users) ? payload.users : []);
  }, []);

  const loadUsers = useCallback(async (text: string) => {
    setIsLoadingUsers(true);
    try {
      await fetchUsers(text);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [fetchUsers]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        await Promise.all([loadStats(), fetchUsers("")]);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "后台数据读取失败，请刷新重试");
      } finally {
        if (!cancelled) setIsLoadingUsers(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [loadStats, fetchUsers]);

  function resetFeedback() {
    setMessage("");
    setError("");
    setIsConfirming(false);
    setIdempotencyKey("");
  }

  function changeScope(next: "user" | "all") {
    if (next === scope) return;
    setScope(next);
    resetFeedback();
  }

  function changeAmount(value: string) {
    setAmount(value);
    setMessage("");
    setError("");
    setIsConfirming(false);
    setIdempotencyKey("");
  }

  function chooseUser(user: AdminUser) {
    setSelected(user);
    setMessage("");
    setError("");
    setIsConfirming(false);
    setIdempotencyKey("");
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = query.trim();
    setSubmittedQuery(text);
    setMessage("");
    setError("");
    loadUsers(text).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "用户列表读取失败，请刷新重试");
    });
  }

  function requestGrant() {
    setMessage("");
    setError("");
    if (!amountValid) { setError(`积分数量需为 1–${MAX_GRANT} 的整数`); return; }
    if (scope === "user" && !selected) { setError("请先在注册用户列表中选择一位用户"); return; }
    if (scope === "all" && !stats) { setError("用户总数还没有读取完成"); return; }
    setIsConfirming(true);
  }

  async function grant() {
    if (isBusy || !amountValid) return;
    if (scope === "user" && !selected) return;
    setIsBusy(true);
    setError("");
    const key = idempotencyKey || crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(key);
    try {
      const response = await fetch(`${API_BASE}/api/admin/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ scope, amount: amountValue, ...(scope === "user" ? { userId: selected!.id } : {}) }),
      });
      const payload = await response.json().catch(() => null) as GrantResponse | null;
      if (!response.ok) throw new Error(payload?.error || "发放失败，请稍后重试");
      setIsConfirming(false);
      setIdempotencyKey("");
      const recipients = payload?.recipients ?? 0;
      if (recipients === 0) {
        setMessage("这次没有重复发放：同样的请求已经处理过。");
      } else if (scope === "all") {
        setMessage(`已给 ${recipients} 位用户各发放 ${amountValue} 积分。`);
      } else {
        setMessage(`已给「${selected?.displayName}」发放 ${amountValue} 积分，当前余额 ${payload?.balance?.available ?? 0} 积分。`);
        if (payload?.balance) {
          setSelected(current => current && current.id === selected?.id ? { ...current, balance: payload.balance!.available } : current);
        }
      }
      await Promise.all([loadStats(), loadUsers(submittedQuery)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发放失败，请稍后重试");
    } finally {
      setIsBusy(false);
    }
  }

  return <>
    <section className={styles.heading}>
      <p className="eyebrow">OPERATIONS</p>
      <h1>后台</h1>
      <p className={styles.lead}>查看注册与游玩情况，给指定用户或全体用户发放积分。</p>
    </section>

    <section className={styles.stats} aria-label="总体数据">
      <div><span>注册用户</span><strong>{formatCount(stats?.users)}</strong><small>累计创建账号</small></div>
      <div><span>游玩次数</span><strong>{formatCount(stats?.plays)}</strong><small>已创建的人生局数</small></div>
      <div><span>最长人生</span><strong>{formatCount(stats?.maxAge)}<em>岁</em></strong><small>所有存档中的最高年龄</small></div>
    </section>

    <section className={styles.usersPanel} aria-labelledby="admin-users-title">
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>
          <h2 id="admin-users-title">注册用户</h2>
          <p>按注册顺序排列；前 {EARLY_SIGNUP_LIMIT} 位注册赠送 {EARLY_SIGNUP_POINTS} 积分</p>
        </div>
        <form className={styles.searchRow} onSubmit={search}>
          <input type="search" value={query} maxLength={80} placeholder="搜索昵称或用户 ID" aria-label="搜索用户" onChange={(event) => setQuery(event.target.value)} />
          <button type="submit" disabled={isLoadingUsers}>{isLoadingUsers ? "读取中…" : "搜索"}</button>
        </form>
      </div>
      <p className={styles.pickerHint}>{submittedQuery ? "搜索结果（最多 50 位）" : `前 ${EARLY_SIGNUP_LIMIT} 位注册用户`}</p>
      {users.length === 0 && !isLoadingUsers
        ? <p className={styles.empty}>没有找到用户。</p>
        : <ul className={styles.users}>{users.map((user) => <li key={user.id}>
            <button type="button" className={styles.userRow} aria-pressed={selected?.id === user.id} onClick={() => chooseUser(user)}>
              <span className={styles.userRank}>#{user.signupRank}</span>
              <span className={styles.userIdentity}>
                <span className={styles.userName}><span className={styles.userNameText}>{user.displayName}</span>{user.signupRank <= EARLY_SIGNUP_LIMIT && <em className={styles.promoBadge}>前 {EARLY_SIGNUP_LIMIT}</em>}</span>
                <span className={styles.userMeta}>{user.id.slice(0, 8)} · {new Date(user.createdAt).toLocaleDateString("zh-CN")} 注册 · {user.lives} 局 · 最长 {user.maxAge} 岁</span>
              </span>
              <span className={styles.userBalance}>{user.balance} 积分</span>
            </button>
          </li>)}</ul>}
      <p className={styles.selected} aria-live="polite">{selected ? `已选择「${selected.displayName}」· 第 ${selected.signupRank} 位 · ${selected.id.slice(0, 8)}` : "点击任意用户即可选中，用于下方发放积分。"}</p>
    </section>

    <section className={styles.gift} aria-labelledby="admin-gift-title">
      <div className={styles.giftHead}>
        <h2 id="admin-gift-title">发放积分</h2>
        <p>写入积分流水，立即到账</p>
      </div>

      <div className={styles.scopeTabs} role="group" aria-label="发放对象">
        <button type="button" aria-pressed={scope === "user"} onClick={() => changeScope("user")}>指定用户</button>
        <button type="button" aria-pressed={scope === "all"} onClick={() => changeScope("all")}>全体用户</button>
      </div>

      {scope === "user"
        ? <div className={styles.target}>{selected
            ? <p>目标：「{selected.displayName}」· 第 {selected.signupRank} 位 · 当前 {selected.balance} 积分</p>
            : <p>请先在上方「注册用户」列表中选择一位用户。</p>}</div>
        : <div className={styles.allNote}>
            <p>将给当前全部 <strong>{formatCount(stats?.users)}</strong> 位注册用户每人发放积分。</p>
            <p>发放后不可撤回，请确认数量。</p>
          </div>}

      <div className={styles.amountRow}>
        <label htmlFor="admin-amount">每人积分数量</label>
        <input id="admin-amount" type="number" inputMode="numeric" min={1} max={MAX_GRANT} step={1} value={amount} onChange={(event) => changeAmount(event.target.value)} aria-describedby="admin-amount-hint" />
        <p id="admin-amount-hint">{amountValid ? `本次共发放 ${totalCredits.toLocaleString("zh-CN")} 积分` : `请输入 1–${MAX_GRANT} 的整数`}</p>
      </div>

      {isConfirming ? <div className={styles.confirm} role="group" aria-label="确认发放">
        <p>{scope === "all"
          ? `确认给全部 ${formatCount(stats?.users)} 位用户各发放 ${amountValue} 积分，共 ${totalCredits.toLocaleString("zh-CN")} 积分？`
          : `确认给「${selected?.displayName}」发放 ${amountValue} 积分？`}</p>
        <div className={styles.confirmActions}>
          <button className="primary-button" type="button" onClick={grant} disabled={isBusy}>{isBusy ? "发放中…" : "确认发放"}</button>
          <button className="text-button" type="button" onClick={() => setIsConfirming(false)} disabled={isBusy}>返回修改</button>
        </div>
      </div> : <button className="primary-button" type="button" onClick={requestGrant} disabled={isBusy || !amountValid || (scope === "user" && !selected) || (scope === "all" && !stats)}>发放积分</button>}

      {message && <p className={styles.message} role="status">{message}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  </>;
}
