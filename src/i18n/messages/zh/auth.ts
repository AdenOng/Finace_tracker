import type en from "../en/auth";
import type { Translation } from "../../types";

const auth: Translation<typeof en> = {
  register: {
    mismatch: "两次输入的密码不一致",
    failed: "无法创建账号",
    setupToken: "初始化令牌",
    tokenHint: "请向部署管理员索取令牌。",
    name: "姓名",
    password: "密码",
    passwordHint: "至少 10 个字符。",
    confirm: "确认密码",
  },
  resetForm: {
    success: "密码已修改。",
    mismatch: "两次输入的密码不一致",
    newPassword: "新密码",
    passwordHint: "至少 10 个字符。",
    confirm: "确认密码",
    submit: "设置密码",
    signIn: "登录",
  },
  signIn: {
    back: "返回登录",
    askOperator:
      "请向此 Finfolio 的管理员索取密码重置链接。链接仅可使用一次，重置后你在其他设备上也会退出登录。",
    sent: "如果该邮箱已注册，我们会发送重置链接。链接一小时内有效，仅可使用一次。未收到邮件时，请检查垃圾邮件文件夹。",
    resetIntro: "输入登录邮箱，我们会发送链接供你设置新密码。",
    sendReset: "发送重置链接",
    failed: "登录失败",
    passkeyFailed: "通行密钥登录失败",
    password: "密码",
    forgot: "忘记密码？",
    submit: "登录",
    or: "或",
    passkey: "使用通行密钥",
  },
  twoFactor: {
    failed: "验证码无效",
    title: "两步验证",
    totpHint: "输入身份验证器应用中的 6 位验证码。",
    backupHint: "输入启用两步验证时保存的任一恢复码。",
    code: "验证码",
    backupCode: "恢复码",
    trust: "30 天内信任此设备",
    verify: "验证",
    useBackup: "改用恢复码",
    useApp: "改用身份验证器应用",
  },
  setup: {
    metaTitle: "初始化设置",
    title: "创建管理员账号",
    body: "这是首次使用。现在创建的账号将负责管理用户、券商、分类和 AI 服务商。",
    submit: "创建管理员账号",
  },
  invite: {
    metaTitle: "接受邀请",
    expiredTitle: "链接已失效",
    title: "你收到了邀请",
    submit: "创建账号",
    expiredBefore:
      "链接可能已过期、已使用或已撤销。请向管理员索取新邀请。如果已有账号，可以",
    signIn: "登录",
    expiredAfter: "。",
    beforeEmail: "使用 ",
    afterEmail: " 创建账号。你的数据仅自己可见。",
  },
  reset: {
    metaTitle: "重置密码",
    expiredTitle: "链接已失效",
    expired: "链接可能已过期、已被新链接替代或已使用。",
    emailHint: "请在登录时点击“忘记密码？”申请新链接，或联系管理员。",
    adminHint: "请向管理员索取新的重置链接。",
    title: "设置新密码",
    beforeEmail: "为 ",
    afterEmail: " 设置密码。你在其他设备上也会退出登录。",
  },
  workspaceInvite: {
    metaTitle: "加入共享空间",
    expiredTitle: "链接已失效",
    expired: "链接可能已过期、已使用或已撤销。请向共享空间所有者索取新链接。",
    enroll: "设置两步验证",
    enrollAfter: "，再重新打开此邀请即可加入。",
    existing: "已有账号？",
    signIn: "登录并加入",
    submit: "创建账号并加入",
    title: (name: string) => `加入 ${name}`,
    body: (role: string) =>
      `你受邀以${role}身份加入。空间内的所有成员都能查看共享账户。你的账户在主动共享前，仅自己可见。`,
    wrongEmail: (email: string) =>
      `此邀请发给 ${email}。请在设置中退出登录，再使用该邮箱登录。`,
    signInAfter: "。",
    roles: {
      owner: "所有者",
      member: "成员",
      viewer: "查看者",
    },
  },
};

export default auth;
