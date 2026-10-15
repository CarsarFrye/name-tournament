# 汉字评分资料来源

`src/game/unihan-facts.json` 是随网页打包的精简本地数据。生成时从 Unicode Unihan 数据库提取汉字的普通话默认读音（`kMandarin`）、《现代汉语频率词典》字符词频（`kHanyuPinlu`）、总笔画数（`kTotalStrokes`）和英文释义（`kDefinition`），再转换为游戏使用的简短数组。释义仅用于通用褒贬关键词估算。

- 数据规范与来源：Unicode Standard Annex #38, Unicode Han Database (Unihan), https://www.unicode.org/standard/reports/tr38/
- 数据许可：Unicode License v3, https://www.unicode.org/license.txt
- 数据版本：Unicode 18.0.0（从 Unicode Public UCD 中的 `Unihan.zip` 生成）
- 生成脚本：`scripts/build-unihan.mjs`，命令为 `node scripts/build-unihan.mjs <Unihan解压目录>`

Unicode 数据按原样提供，不附带任何明示或暗示的保证。该数据库是汉字级资料，不是姓名登记或姓名流行度数据库；它不能决定一个名字整体的语感、寓意、性别适配、时代感或重名率。本游戏从这些资料计算的分数仅为透明的启发式指标。

Unicode, Inc. Copyright © 1991–2026. All rights reserved. Used under Unicode License v3. License notice is provided here as associated documentation.
