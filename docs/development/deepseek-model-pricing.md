# DeepSeek Flash 模型与价格记录

核对日期：2026-11-04。来源：[DeepSeek 官方模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。价格可能变化，后续成本核算应重新核对。

当前版本：DeepSeek-V4.1-Flash-1017。官方推荐 API 模型ID：`deepseek-flash`。
旧ID `deepseek-v4-flash` 和 `deepseek-v4-flash-vision-exp` 仍可请求，但旧模型已下线，由上述V4.1版本承接并按Flash价格收费。因此旧ID调用记录不能解释为仍使用旧版V4。

单价单位：人民币元／百万tokens。

| 项目 | 空闲时段 | 高峰时段 |
| --- | ---: | ---: |
| 输入，缓存命中 | 0.02 | 0.04 |
| 输入，缓存未命中 | 1 | 2 |
| 输出 | 4 | 8 |

北京时间周一至周五（中国法定节假日除外）9:00–12:00、14:00–18:00为高峰，其余时间含周末、法定节假日为空闲。不能仅按星期判断法定节假日，也不能用最终保存时间代替所有请求发生时间。

单次成本：缓存命中tokens×命中输入单价，加缓存未命中tokens×未命中输入单价，加输出tokens×输出单价，合计除以1,000,000；分时段逐次累计。推理输出同属输出用量，不能只按用户可见字符计费。

Search/Fetch为独立接口，各5元／1000次成功请求，本产品普通人生生成未接入这两项，不默认计入故事调用。

## 本次配置

本地`.env.local`的LLM_MODEL已切换为`deepseek-flash`，保留原地址与密钥；供应商目录新增该标准ID并作为DeepSeek默认选项。未修改生产配置或发布。

当前引擎的inputCostPerMillion/outputCostPerMillion及estimatedCostUsd是美元估算字段，不支持人民币分时缓存计价；本次记录不会把人民币直接填入美元字段，也不猜测汇率。新目录项美元估算为0表示未配置，不表示免费。实际费用以供应商账单为准，人民币自动计费统计需另外接入上述三类用量与时段规则。

验证：resolveModelConfig实际解析为deepseek-flash，以该ID发起最小真实JSON请求成功；开发进程已重载本地配置。345项测试、lint、build和typecheck通过。配置文件继续Git忽略，不提交密钥；标准ID与本价格记录提交源码仓库。先前实测仍保留原始旧请求名称，不篡改历史usage。
