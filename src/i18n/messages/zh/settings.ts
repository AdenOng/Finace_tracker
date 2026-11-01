import type { Translation } from "../../types";
import type en from "../en/settings";
const settings: Translation<typeof en> = {
  countCpfSrs: {
    countCpfAndSrsIn: "将 CPF 与 SRS 计入净资产",
    theyStillShowOnThe:
      "无论是否计入，总览都会显示这些余额。大部分资金需年满 55 岁或更晚才能提取。",
  },
  currencySelect: {
    displayCurrency: "显示币种",
  },
  hideAmounts: {
    hideAmounts: "隐藏金额",
    balancesTotalsAndTransactionAmounts:
      "在所有页面以圆点隐藏余额、总额和交易金额。点击圆点查看单笔金额，或用卡片上的眼睛图标显示或隐藏该卡片的金额；更改此设置会重置所有卡片。",
    couldntSaveThisToYour:
      "无法保存到你的账号。此设置在本设备上生效，重新加载后失效；请稍后重试。",
  },
  passkeysCard: {
    device: "设备",
    passkeyWasNotAdded: "未能添加通行密钥",
    couldNotRemovePasskey: "无法移除通行密钥",
    passkey: "通行密钥",
    synced: "已同步",
    thisDeviceOnly: "仅限本设备",
    removePasskey: "移除通行密钥",
    noPasskeysYetAPasskey:
      "暂无通行密钥。添加后，你可以通过 Face ID、Touch ID 或 Windows Hello 登录。",
    addAPasskey: "添加通行密钥",
    added: (date: string, synced: boolean) =>
      `添加于 ${date} · ${synced ? "已同步" : "仅限本设备"}`,
  },
  passwordCard: {
    theNewPasswordsDontMatch: "两次输入的新密码不一致。",
    chooseAPasswordYouArent: "请选择与当前密码不同的新密码。",
    yourCurrentPasswordIsNot: "当前密码不正确。",
    yourPasswordWasNotChanged: "未能更改密码。",
    yourPasswordWasChanged: "密码已更改。",
    currentPassword: "当前密码",
    newPassword: "新密码",
    repeatNewPassword: "再次输入新密码",
    signOutOfOtherDevices: "退出其他设备",
    recommendedIfYouThinkSomeone:
      "如果你认为其他人知道你的密码，建议勾选此项。",
    changePassword: "更改密码",
    minPassword: (n: number) => `新密码至少需要 ${n} 个字符。`,
    minHint: (n: number) => `至少 ${n} 个字符。`,
  },
  profileCard: {
    enterYourName: "请输入姓名。",
    yourNameWasNotSaved: "未能保存姓名。",
    yourNameWasSaved: "姓名已保存。",
    name: "姓名",
    email: "邮箱",
    youSignInWithThis: "使用此邮箱登录。管理员可为你更改邮箱。",
    saveName: "保存姓名",
  },
  sessionsCard: {
    thisDevice: "本设备",
    unknownIp: "未知 IP",
    signOut: "确认退出登录？",
    signOutText: "退出登录",
    signOutOfAllOther: "退出所有其他设备",
    revoked: (n: number) => `已退出其他 ${n} 台设备。`,
    activity: (ip: string, current: boolean, relative: string, date: string) =>
      `${ip} · ${current ? "当前在线" : `${relative}活跃`} · 登录于 ${date}`,
    confirmDevices: (n: number) => `确认退出 ${n} 台设备？`,
    unknownDevice: "未知设备",
    browser: "浏览器",
    deviceOn: (browser: string, os: string) => `${os} 上的 ${browser}`,
    methods: {
      password: "密码",
      two_factor: "密码与两步验证",
      backup_code: "恢复码",
      passkey: "通行密钥",
    },
  },
  twoFactorCard: {
    couldNotStartEnrolment: "无法开始设置",
    thatCodeDidNotMatch: "验证码不匹配",
    couldNotTurnOffTwostep: "无法停用两步验证",
    twostepSigninIsOnSave:
      "两步验证已启用。请妥善保存这些恢复码；丢失手机时可使用，每个恢复码仅限使用一次。",
    copyCodes: "复制恢复码",
    iveSavedThem: "我已保存",
    scanWithGoogleAuthenticator1password:
      "使用 Google Authenticator、1Password、Authy 等应用扫码。无法扫码？请输入此密钥：",
    sixDigitCode: "6 位验证码",
    confirm: "确认",
    cancel: "取消",
    confirmYourPasswordToTurn: "确认密码以停用",
    turnOff: "停用",
    onAnAuthenticatorCodeIs: "已启用：输入密码后，还需输入身份验证器验证码。",
    confirmYourPasswordToBegin: "确认密码以开始设置",
    setUpAuthenticatorApp: "设置身份验证器应用",
  },
  page: {
    settings: "设置",
    yourPreferencesAndHowYou: "偏好设置与登录方式。",
    profile: "个人资料",
    howYouAppearToOthers: "其他人看到的个人资料。",
    sharedWorkspaces: "共享空间",
    createAFamilyOrFund: "创建家庭或基金共享空间，并选择要共享的账户。",
    manageWorkspaces: "管理共享空间",
    displayCurrency: "显示币种",
    totalsAndChartsAreConverted:
      "总额和图表均换算为此币种，每条记录仍保留原始币种。",
    privacy: "隐私",
    keepYourNumbersOffScreen: "旁人查看或共享屏幕时，隐藏财务金额。",
    twostepSignin: "两步验证",
    aTimebasedCodeFromAn:
      "输入密码后，还需输入身份验证器应用生成的动态验证码。",
    password: "密码",
    changeThePasswordYouSign: "更改登录密码。",
    passkeys: "通行密钥",
    signInWithoutAPassword: "使用设备的生物识别功能或安全密钥免密码登录。",
    signedinDevices: "已登录设备",
    whereYourAccountIsSigned: "查看账号的登录设备，退出你不认识的设备。",
    enrolment: (welcome: boolean) =>
      `${welcome ? "欢迎使用。" : ""}此实例要求启用两步验证。请在下方设置身份验证器应用，以使用其余功能。`,
  },
};
export default settings;
