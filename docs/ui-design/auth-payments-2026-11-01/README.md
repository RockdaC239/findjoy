# 登录、套餐与支付页面验收

日期：2026-11-01。页面沿用纸白、墨色、橙色，无新 UI 依赖。

- 登录：`/findjoy/login`，自有品牌页 → Authing 验证码登录。真实认证页已到达，未发送验证码。
- 套餐：`/findjoy/plans`，三档演示价、我的余额与订单记录。
- 确认：`/findjoy/checkout?product=possibilities`，支付方式选择；登录后可进入。
- 订单：`/findjoy/checkout/<id>`，演示完成/支付待确认/已到账状态，订单所有权校验。

| 页面 | 375px | 390px | 768px | 1440px |
| --- | --- | --- | --- | --- |
| 登录 | 无横向溢出 | 无横向溢出 | 无横向溢出 | 无横向溢出 |
| 套餐 | 单列、按钮可用 | 单列、按钮可用 | 三列、允许按钮换行 | 三列、按钮可用 |
| 支付 | 单列、渠道可选 | 单列、渠道可选 | 双列、内容可读 | 双列、内容可读 |

浏览器测得各宽度 `documentElement.scrollWidth === innerWidth`；套餐按钮高度至少 48px，新增账号导航点击目标至少 44px。主页 375px 下新增导航换行后容器自动增高（实测 148px），无裁切。

实际操作：本地验收专用会话 → 选择套餐 → 创建演示订单 → 模拟支付 → 展示完成提示 → 查询余额（没有增加真实次数）→ 退出登录。此会话仅用于本地验证，产品没有绕过 Authing 的公开登录接口。

生产构建隔离验收使用独立临时数据库与本机模型协议替身，验证权限、扣次、请求重放、推进重放、结局缓存、伪造回调拒绝与会话撤销；不访问外部模型或真实收款接口。

截图均为合成验收数据，不包含真实玩家资料：

- [登录桌面](screenshots/login-desktop.png) / [登录手机](screenshots/login-mobile.png)
- [套餐桌面](screenshots/plans-desktop.png) / [套餐手机](screenshots/plans-mobile.png)
- [支付桌面](screenshots/checkout-desktop.png) / [支付手机](screenshots/checkout-mobile.png)
- [演示完成](screenshots/demo-success-desktop.png)

未验证真实短信/邮箱送达、真实支付首单和线上回调；这些需要账户二次验证、部署与正式商品配置，不能用上述演示替代。
