import type en from "../en/shell";
import type { Translation } from "../../types";

const shell: Translation<typeof en> = {
  nav: {
    more: "更多",
    main: "主菜单",
    overview: "总览",
    accounts: "账户",
    portfolio: "投资组合",
    spending: "支出",
    cashFlow: "现金流",
    imports: "导入",
    workspaces: "共享空间",
    settings: "设置",
  },
  adminNav: {
    heading: "管理后台",
    status: "状态",
    users: "用户",
    security: "安全",
    importJobs: "导入任务",
    ai: "AI 服务商",
    institutions: "券商与银行",
    categories: "分类",
    data: "数据",
    system: "系统",
    activity: "活动日志",
  },
  signOut: "退出登录",
  openMenu: "打开菜单",
  meta: {
    description: "一站掌握所有账户的净资产与收支。",
  },
};

export default shell;
