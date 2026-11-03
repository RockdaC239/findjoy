"use client";

import { useRef } from "react";
import { NORMAL_LIFE_POINTS } from "../lib/points";

export function PointsUsageDialog() {
  const dialog = useRef<HTMLDialogElement>(null);

  return <>
    <button className="credit-pill points-usage-trigger" type="button" onClick={() => dialog.current?.showModal()}>积分使用说明</button>
    <dialog ref={dialog} className="points-usage-dialog" aria-labelledby="points-usage-title">
      <h2 id="points-usage-title">积分使用说明</h2>
      <ul>
        <li>普通模式每局 {NORMAL_LIFE_POINTS} 积分，首幕成功保存后扣除；开局失败，积分退回。</li>
        <li>同一局继续、恢复与查看已保存的回顾，不重复扣积分。</li>
        <li>积分仅用于 FindJoy，不设有效期；其他模式开放后将单独标价。</li>
      </ul>
      <form method="dialog"><button className="primary-button" type="submit">知道了</button></form>
    </dialog>
  </>;
}
