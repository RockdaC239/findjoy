# QA 报告（showcase-page）

## 目标视口与结果（无头 Chrome，真实尺寸测量）
| 视口 | 结果 | 二维码尺寸 | 备注 |
|---|---|---|---|
| 1920×1080（会场大屏） | PASS | 420×420px | 页面高度 = 视口，一屏无滚动 |
| 1366×768（笔记本） | PASS | 307×307px | max-height 收紧密距后一屏放下 |
| 390×844（手机） | PASS | 300×300px | 二维码置顶，页面可滚动 |
| 280×653（小屏） | PASS | 202×202px | 无横向溢出 |

## 检查项
- 横向溢出：四视口 scrollWidth === clientWidth，无溢出元素。
- 二维码资源：img 加载成功、naturalWidth 1024；服务器返回字节与已验证原图一致（shasum 匹配）。
- 控制台无报错（含 favicon 404 已通过 app/icon.svg 消除）。
- 回归：npm test 79 通过；typecheck / lint / build 通过；/showcase 与 /icon.svg 进入构建产物。
