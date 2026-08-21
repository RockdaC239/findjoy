# 参考与配图分析（reference-analysis.md）

## 视觉参考
- 用户明确表示：没有外部视觉参考，按现有品牌风格（paper / ink / orange，DM Sans + DM Serif Display，句点锚点）执行。
- 品牌约束来自 app/globals.css 与现有 showcase 页：纸白底、墨色文字、橙色点缀、发丝分隔线、衬线大标题。

## 配图选型（Wikimedia Commons，全部自由许可，已下载到 references/images/）
| 页 | 主题 | 主选 | 备选 |
|----|------|------|------|
| 01 idea | 灯泡（暖光钨丝） | deck-01-idea.jpg（Filament bulb, CC BY-SA 4.0） | — |
| 02 thickness | 年轮/树木截面（生命的厚度） | deck-02-thickness.jpg（松树截面, CC BY-SA 4.0） | — |
| 03 decisions | 黑白国际象棋兵 | deck-03-decisions.jpg（Dietmar Rabich 黑白棋子, CC BY-SA 4.0） | — |
| 04 nodes | 星轨（实时推演节点） | deck-04-nodes.jpg（ESO 阿塔卡马星轨, CC BY 4.0） | deck-04-nodes-alt.jpg（ISS 气辉星轨, CC BY 4.0） |
| 05 directions | 铁轨岔道 / 路牌（人生方向） | deck-05-directions.jpg（墨尔本铁路岔道, CC BY-SA 4.0） | deck-05-directions-alt.jpg（Dingle 路牌, CC0） |
| 06 path | 晨雾林间小径（没有对错） | deck-06-path.jpg（Dülmen 黑白晨雾, CC BY-SA 4.0） | — |
| 07 happiness | 日出/海岸（幸福是什么） | deck-07-happiness.jpg（Dingle 冬日黎明, CC BY-SA 4.0） | deck-07-happiness-alt.jpg（Sète 日落, CC BY 4.0） |
| 08 heart | 人形剪影（答案在心里） | deck-08-heart.jpg（海边行走剪影, Public domain） | deck-08-heart-alt.jpg（海边三人剪影, Public domain） |

统一处理：CSS 暖调黑白（grayscale + 轻微 sepia + 微饱和），与大屏投影的安静克制气质一致。

## 候选方向（previews/）
1. **preview-1.html · 左右分栏**：左文右图，延续现有海报的构图语言，图片带细线外框。
2. **preview-2.html · 全幅沉浸**：图片铺满全屏 + 墨色渐变遮罩，文字压在图上（Keynote 风格），结尾页回到纸白底。
3. **preview-3.html · 留白极简**：超大字标题 + 右下图框 + 超大描边页码装饰，编辑杂志感。

截图见 preview-screenshots/（1920×1080，含第 1 页与第 9 页结尾页）。
