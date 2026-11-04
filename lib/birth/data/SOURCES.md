# 出生地点资料与再分发许可

此目录是故事生成的本地地点素材，不是地址投递、法律行政证明或2026年实时行政区划查询服务。运行期不联网。检索日期2026-11-04。

## 资料来源与许可

- 大陆31省级区域：modood/Administrative-divisions-of-China，WTFPL v2，提交 `c49d495b40ac73eb1a66f6eeae5f8fd10696f035`。使用 `dist/provinces.json`、`cities.json`、`areas.json`，原始源项目声明数据截至2023-06-30；不是2026最新。保留完整许可于 `LICENSE-modood.txt`。来源：https://github.com/modood/Administrative-divisions-of-China/tree/c49d495b40ac73eb1a66f6eeae5f8fd10696f035 。县级记录2978条。
- 港澳：airyland/china-area-data，MIT，提交 `d6d2ef5a42971c38db2f980802d08efb945f1cf8` 的 `data.json` 中 `810000`、`820000` 两组。香港18地区、澳门8地理地区，保留原地名繁体。其版本说明为2019数据，不能当成当年全部行政制度已核验；澳门8项包括路氹填海区，不能统称8个行政堂区。保留完整许可于 `LICENSE-airyland.txt`。来源：https://github.com/airyland/china-area-data/tree/d6d2ef5a42971c38db2f980802d08efb945f1cf8 。该源台湾资料不完整且旧，未用于台湾部分。
- 台湾：内政部国土测绘中心，2026-11-04读取县市及乡镇市区名称，22县市、368乡镇市区。来源接口 https://api.nlsc.gov.tw/other/ListCounty 及 https://api.nlsc.gov.tw/other/ListTown1/{countycode} 。同机构行政区域名称字段及所属关系的开放资料目录：https://data.gov.tw/dataset/7441 （乡镇市区界线，授权为政府资料开放授权条款第1版）和 https://data.gov.tw/dataset/7442 （县市界线）。仅整理地名与隶属，无边界坐标。保留繁体地名，不擅自简繁替换或使用旧版第三方7市列表。

## 台湾资料显名声明

内政部国土测绘中心，2026，县市及乡镇市区名称与隶属关系（本地整理快照，2026-11-04）。此开放资料依政府资料开放授权条款（Open Government Data License）第1版进行公众释出，使用者于遵守该条款各项规定的前提下得利用。条款全文：https://data.gov.tw/license 。本项目已删除边界、编码与其他属性，转为统一故事地点格式；不暗示资料提供机构认可本产品。

## 覆盖与层级处理

合计34个省级入口、22个台湾县市全部覆盖；大陆2978、台湾368、港18、澳8，共3372个末级地点条目。覆盖全国省级入口，不声称各地行政层级一致，也不声称覆盖所有村镇街道或2026全部变更。

- 大陆直辖市源中的“市辖区”“县”分组统一以直辖市名称作city，区县仍保持原隶属。省/自治区直辖县级市直接以本市作city和county，不创造虚构地级市。
- 东莞、中山、儋州等不设县级区划的城市沿原areas记录以本市作county回退，不将pca树自动填入的镇街误叫区县。
- 台湾city字段容纳县或市，county字段容纳所属乡镇市区；港澳city用香港/澳门，county用地区。county是接口的统一末级地点字段，并不声称全是中国大陆县级行政单位。
- 生活形态settlement是虚构故事背景的编辑选择，不从行政数据推断城乡人口。采样对区名与港澳默认城区；县旗偏向县城/乡镇/乡村；其余地点可探索多种形态。不会生成具体村名或街道，未声称任何特定区内存在某种真实村庄。
- 省级先等权探索，省内城市等权，再在该城市末级地点等权。此分布服务重玩差异，不代表出生率、人口或经济统计。可避开近期省代码；所有省均被避开时回落完整池。

## 数据格式与再生成

`locations.json` 是省数组：`{code,name,cities:[{name,counties:string[]}]}`。仅保存本功能需要的名称/省代码，不带街村和地理边界。省代码用两位产品入口编码，台湾county来源代码不转换成大陆县编码。

重新整理时需固定源提交并保留许可；按provinces/cities/areas的provinceCode与cityCode关联，不按名称猜隶属；直辖分组合并，直管县级条目展开成本级city；台湾由每个countycode请求ListTown1，要求22组、368项再接纳。港澳只取上述两组。源停止服务或更新时，继续使用已验证本地快照，不从模型或网络临时补地名。
