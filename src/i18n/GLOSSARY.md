# Finfolio English → Simplified Chinese glossary

This is the shared terminology contract for all app-area translators. Use the preferred terms below consistently, including page titles, buttons, help text, accessibility labels and error messages. The choices reflect the current UI in `src/components/`, `src/app/`, `src/lib/accounts.ts` and `src/presets/`.

## Tone & style

- Write concise, natural Simplified Chinese for Singapore residents. Use friendly, direct wording and 你 when a pronoun is needed; avoid repeated 您 and literal English sentence structures.
- Use short action buttons, such as 保存、取消、删除. Use full-width Chinese punctuation in Chinese sentences: ，。：；？！“”. Keep ASCII punctuation inside code-like tokens, URLs and keyboard shortcuts such as Ctrl+C.
- Put one half-width space between Chinese and Latin letters or digits: 导入 PDF 对账单、共 3 个账户. Do not add spaces beside full-width punctuation: 中央公积金（CPF）、Mac 上按 ⌘C.
- Use a single ellipsis character for ongoing actions: 保存中…、加载中…. Do not use three periods.
- Keep Finfolio, product/provider/institution names (Google, Anthropic, OpenAI, IBKR, DBS, etc.) and acronyms (ETF, PDF, CSV, AI, API, 2FA/TOTP) in Latin script. Keep currency codes and S$ unchanged.
- Translate string values only. Preserve object keys, function signatures, placeholders, interpolation tokens, URLs and stored identifiers. Reorder placeholders only when the surrounding grammar requires it; do not alter their contents.
- Translate preset category display names using `messages/zh/common.ts`; preserve the stored English keys. Show user-created or renamed categories as entered. Do not translate user-entered account, workspace or institution names.
- Keep concepts distinct: financial account = 账户; sign-in account = 账号. Holdings = 持仓, never 控股. Balance = 余额, never 平衡. Statement = 对账单, never 声明. Transfer = 转账, never 传输. Reconciliation = 对账, never 调解.
- CPF is 中央公积金（CPF） on first mention, then 公积金 in prose. In compact labels keep CPF, e.g. CPF 普通账户. SRS is 退休辅助计划（SRS） on first mention, then SRS. Keep OA/SA/MA/RA when the source includes those acronyms.
- Review = 审核 for extracted imports, 核对 for balances or transfer candidates, and 已核对 for reviewed cash-flow items. Cleared = 已核实 is a transaction flag; it does not mean 已对账 or 已结算.
- For a Name field, use 名称 for accounts/items and 姓名 for a person's profile. Use the contextual distinctions recorded below rather than forcing identical English words into one Chinese term.

## Navigation & pages

| English                | Preferred Chinese | Usage                                      |
| ---------------------- | ----------------- | ------------------------------------------ |
| Overview               | 总览              |                                            |
| Accounts               | 账户              | Financial accounts.                        |
| Portfolio              | 投资组合          |                                            |
| Spending               | 支出              |                                            |
| Cash flow              | 现金流            |                                            |
| Imports                | 导入              |                                            |
| Workspaces / Workspace | 共享空间          | Avoid 工作区; these spaces share finances. |
| Settings               | 设置              |                                            |
| Admin                  | 管理后台          |                                            |
| Status                 | 状态              |                                            |
| Categories / Category  | 分类              |                                            |
| Activity log           | 活动日志          | User-facing history of actions.            |
| Personal view          | 个人视图          |                                            |

## Accounts & institutions

| English                       | Preferred Chinese   | Usage                                     |
| ----------------------------- | ------------------- | ----------------------------------------- |
| Investments                   | 投资                | Account group.                            |
| Bank & cards                  | 银行与信用卡        | Account group.                            |
| CPF & SRS                     | CPF 与 SRS          | Compact account group.                    |
| Brokerage / Brokerage account | 证券账户            | Account type; broker itself is 券商.      |
| Retirement account            | 退休账户            | Also the CPF Retirement sub-account.      |
| Crypto wallet                 | 加密货币钱包        |                                           |
| Current / checking            | 往来账户            | Singapore banking terminology.            |
| Savings / Savings account     | 储蓄账户            |                                           |
| Credit card                   | 信用卡              |                                           |
| Cash                          | 现金                |                                           |
| Institution                   | 金融机构            |                                           |
| Broker                        | 券商                |                                           |
| Bank                          | 银行                |                                           |
| Card issuer                   | 发卡机构            |                                           |
| Crypto exchange               | 加密货币交易所      |                                           |
| Depository                    | 证券存管机构        |                                           |
| CPF                           | 中央公积金（CPF）   | Short prose: 公积金; compact labels: CPF. |
| SRS                           | 退休辅助计划（SRS） | Compact labels: SRS.                      |
| Ordinary (OA)                 | 普通账户            | Compact combined label: CPF 普通账户.     |
| Special (SA)                  | 特别账户            |                                           |
| MediSave (MA)                 | 保健储蓄账户        |                                           |
| Balance                       | 余额                |                                           |
| Net worth                     | 净资产              |                                           |
| Currency                      | 币种                |                                           |
| Display currency              | 显示币种            |                                           |
| Last four digits              | 尾号                | Field hint may specify 后 4 位.           |

## Investing, holdings & prices

| English               | Preferred Chinese | Usage                                     |
| --------------------- | ----------------- | ----------------------------------------- |
| Holdings / Position   | 持仓              | Never 控股.                               |
| Consolidated holdings | 合并持仓          | Same security across accounts.            |
| Stock                 | 股票              |                                           |
| ETF                   | ETF               | Keep acronym.                             |
| Fund                  | 基金              | Investment product and workspace purpose. |
| Bond                  | 债券              |                                           |
| Option                | 期权              |                                           |
| Crypto                | 加密货币          |                                           |
| Asset class           | 资产类别          |                                           |
| Asset allocation      | 资产配置          |                                           |
| Symbol                | 证券代码          | Crypto context: 币种代码.                 |
| Exchange              | 交易所            | For currency conversion, use 换汇.        |
| Quantity              | 数量              |                                           |
| Price                 | 价格              |                                           |
| Average cost          | 平均成本          | Per-unit cost.                            |
| Market value          | 市值              |                                           |
| Unrealised gain       | 浮动盈亏          | Signed gain field may be negative.        |
| Broker cash           | 证券账户现金      |                                           |
| Exchange rate         | 汇率              |                                           |
| Price refresh         | 更新价格          |                                           |
| Snapshot              | 快照              | Dated holdings and cash record.           |
| As of                 | 截至日期          | Label for snapshot/balance date.          |

## Spending, transactions, transfers & merchant rules

| English                    | Preferred Chinese | Usage                                                         |
| -------------------------- | ----------------- | ------------------------------------------------------------- |
| Transaction                | 交易              | Bank/card ledger record.                                      |
| Entry                      | 记录              | Generic saved record.                                         |
| Trade                      | 买卖交易          | Securities purchase/sale; distinguish from bank transactions. |
| Income                     | 收入              |                                                               |
| Expense                    | 支出              |                                                               |
| Transfer                   | 转账              |                                                               |
| Between Own Accounts       | 本人账户互转      | Preset category.                                              |
| Investment Funding         | 投资资金划转      | Includes deposits and withdrawals.                            |
| Credit Card Payment        | 信用卡还款        | Preset category.                                              |
| Merchant                   | 商户              |                                                               |
| Merchant rules             | 商户规则          |                                                               |
| Text contains              | 包含文本          | Merchant matching field.                                      |
| Assign category            | 设置分类          |                                                               |
| Uncategorised              | 未分类            |                                                               |
| Description                | 摘要              | Transaction field; explanatory prose: 说明.                   |
| Posted date                | 入账日期          |                                                               |
| Cleared / Uncleared        | 已核实／未核实    | Manual transaction flag; not settlement.                      |
| Reconciliation / Reconcile | 对账              |                                                               |
| Reconciled                 | 已对账            |                                                               |
| Transfer match             | 转账配对          | Links both sides of an internal transfer.                     |
| Refund                     | 退款              |                                                               |
| Cashback                   | 返现              |                                                               |
| Dividends                  | 股息              |                                                               |
| Interest                   | 利息              |                                                               |

## Cash flow & bills

| English                   | Preferred Chinese | Usage                                    |
| ------------------------- | ----------------- | ---------------------------------------- |
| Cash-flow forecast        | 现金流预测        |                                          |
| Forecast period           | 预测时段          |                                          |
| Projected balance         | 预计余额          |                                          |
| Recurring item            | 周期性收支        | A plan, not a posted transaction.        |
| Frequency                 | 频率              |                                          |
| Weekly / Monthly / Yearly | 每周／每月／每年  |                                          |
| Occurrence                | 本期收支          | One scheduled occurrence.                |
| Credit-card bills         | 信用卡账单        | Use 对账单 for the source document.      |
| Statement closing date    | 账单日            | Credit-card bill context.                |
| Payment due date          | 到期还款日        |                                          |
| Amount due                | 应还金额          |                                          |
| Remaining amount          | 待还金额          | Credit-card bill context.                |
| Payment bank              | 还款银行账户      | Recorded payment source.                 |
| Direct debit              | 自动扣款          | Linking an account does not enable this. |
| Carried balance           | 上期未还金额      |                                          |
| Skip                      | 跳过              | Scheduled occurrence action.             |

## Imports, statements & review

| English               | Preferred Chinese | Usage                                          |
| --------------------- | ----------------- | ---------------------------------------------- |
| Statement             | 对账单            | Never 声明.                                    |
| Bank statement        | 银行对账单        |                                                |
| Credit-card statement | 信用卡对账单      | Source document, distinct from a tracked bill. |
| Import job            | 导入任务          |                                                |
| Extraction            | 数据提取          |                                                |
| Extract               | 提取              |                                                |
| Import review         | 导入审核          |                                                |
| Review extracted data | 审核提取结果      | Check before saving.                           |
| Statement period      | 对账单周期        |                                                |
| Opening balance       | 期初余额          |                                                |
| Closing balance       | 期末余额          |                                                |
| Row / Line item       | 明细              | User-facing record, not source-code line.      |
| Duplicate             | 重复记录          |                                                |
| Confidence            | 置信度            | Extraction confidence.                         |
| Scanned PDF           | 扫描版 PDF        |                                                |

## Workspaces, sharing & invitations

| English             | Preferred Chinese | Usage                       |
| ------------------- | ----------------- | --------------------------- |
| Account sharing     | 账户共享          |                             |
| Shared account      | 共享账户          |                             |
| Shared transactions | 共享交易          |                             |
| Owner               | 所有者            | Workspace or account owner. |
| Member              | 成员              |                             |
| Viewer              | 查看者            | Role with read-only access. |
| Read-only           | 只读              |                             |
| Permission / Access | 权限              |                             |
| Invitation          | 邀请              |                             |
| Invitation link     | 邀请链接          |                             |
| Accept invitation   | 接受邀请          |                             |
| Revoke invitation   | 撤销邀请          |                             |
| Family              | 家庭              | Workspace purpose.          |

## Auth & security

| English                    | Preferred Chinese | Usage                                      |
| -------------------------- | ----------------- | ------------------------------------------ |
| Sign in                    | 登录              |                                            |
| Sign out                   | 退出登录          |                                            |
| Register / Sign up         | 注册              |                                            |
| Account (sign-in identity) | 账号              | Distinguish from financial 账户.           |
| Email                      | 邮箱              |                                            |
| Password                   | 密码              |                                            |
| Current password           | 当前密码          |                                            |
| New password               | 新密码            |                                            |
| Confirm password           | 确认密码          |                                            |
| Reset password             | 重置密码          |                                            |
| Passkey                    | 通行密钥          | Never 万能钥匙.                            |
| Two-step sign-in           | 两步验证          | Keep 2FA/TOTP acronyms where present.      |
| Authenticator app          | 身份验证器应用    |                                            |
| Verification code          | 验证码            |                                            |
| Recovery codes             | 恢复码            |                                            |
| Session                    | 登录会话          |                                            |
| Device                     | 设备              |                                            |
| Revoke session             | 撤销登录会话      |                                            |
| Setup token                | 初始化令牌        | Secret used for first administrator setup. |
| Credentials                | 凭据              |                                            |

## Admin, AI, data & operations

| English               | Preferred Chinese | Usage                                       |
| --------------------- | ----------------- | ------------------------------------------- |
| AI provider           | AI 服务商         |                                             |
| Model                 | 模型              |                                             |
| API key               | API 密钥          |                                             |
| Endpoint URL          | 接口地址          | Preserve actual URLs.                       |
| Tokens (AI)           | Token             | e.g. 输入 Token、共 100 个 Token; not 令牌. |
| Usage                 | 用量              |                                             |
| Monthly token limit   | 每月 Token 上限   |                                             |
| Fallback provider     | 备用服务商        |                                             |
| Extraction playground | 数据提取测试      |                                             |
| Backup                | 备份              |                                             |
| Restore               | 恢复              | Backup action.                              |
| Audit log             | 审计日志          | Distinct from general 活动日志.             |
| Storage               | 存储              |                                             |
| Presets               | 预设数据          |                                             |
| Market data           | 行情数据          |                                             |

## Statuses

| English                            | Preferred Chinese        | Usage                                                                             |
| ---------------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| Pending                            | 待处理                   | Awaiting a task or decision.                                                      |
| Queued                             | 排队中                   |                                                                                   |
| Processing                         | 处理中…                  |                                                                                   |
| Ready                              | 已就绪                   |                                                                                   |
| Failed                             | 失败                     |                                                                                   |
| Completed                          | 已完成                   |                                                                                   |
| Archived                           | 已归档                   |                                                                                   |
| Active / Open                      | 使用中                   | Non-archived account filter; active schedules: 已启用; sign-in session: 当前有效. |
| Enabled / Disabled                 | 已启用／已停用           | Configuration status.                                                             |
| Paid off / Unpaid / Partially paid | 已还清／未还款／部分还款 | Card bills.                                                                       |
| Overdue                            | 已逾期                   |                                                                                   |
| Unknown                            | 未知                     |                                                                                   |
| Stale balance                      | 余额待更新               | Not a zero or missing balance.                                                    |

## Common actions

| English           | Preferred Chinese | Usage                               |
| ----------------- | ----------------- | ----------------------------------- |
| Save / Saving…    | 保存／保存中…     |                                     |
| Cancel            | 取消              |                                     |
| Delete / Remove   | 删除／移除        | Delete data vs. remove a link/item. |
| Edit              | 编辑              |                                     |
| Add / Create      | 添加／创建        |                                     |
| Archive           | 归档              |                                     |
| Confirm           | 确认              |                                     |
| Retry             | 重试              |                                     |
| Refresh           | 刷新              |                                     |
| Upload / Download | 上传／下载        |                                     |
| Import / Export   | 导入／导出        |                                     |
| Copy / Copy link  | 复制／复制链接    |                                     |
