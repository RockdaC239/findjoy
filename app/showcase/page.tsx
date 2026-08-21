import type { Metadata } from "next";
import ShowcaseDeck from "./ShowcaseDeck";

export const metadata: Metadata = {
  title: "findjoy · AI 人生模拟器",
  description: "一款由 AI 驱动的人生模拟游戏。不评价成功，不算幸福分数——你得到的不是评分，而是一面关于自己的镜子。",
};

export default function ShowcasePage() {
  return <ShowcaseDeck />;
}
