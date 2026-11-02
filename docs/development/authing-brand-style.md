# Authing 托管登录页样式

样式源文件为 `public/authing-brand.css`，覆盖验证码登录、密码登录和找回密码中的基础组件。使用固定类名，不依赖带 hash 的类名；保留错误提示的语义色。

文件经仓库现有流程发布、且公网能访问后，在 FindJoy 应用的「品牌化 → 整体样式 → 自定义 CSS」中用以下内容替换旧内联样式，保存一次：

```css
@import url("https://findfire.club/findjoy/authing-brand.css");
```

以后修改仓库中的文件并正常发布即可；本地修改不会自动影响 Authing 托管页面。先确认外链样式能加载，再移除旧 CSS。此设置只用于 FindJoy 应用，避免全局配置影响 FindFire 等其他应用。

当前文件尚未发布、未替换 Authing 配置。样式迭代可能仍需随 Authing 组件升级检查兼容性。

参考：[Authing 全局登录框](https://docs.authing.cn/v2/guides/customize/global-guard/)。
