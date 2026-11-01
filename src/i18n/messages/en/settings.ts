const settings = {
  countCpfSrs: {
    countCpfAndSrsIn: "Count CPF and SRS in net worth",
    theyStillShowOnThe:
      "They still show on the overview either way. Most of it can't be withdrawn until 55 or later.",
  },
  currencySelect: {
    displayCurrency: "Display currency",
  },
  hideAmounts: {
    hideAmounts: "Hide amounts",
    balancesTotalsAndTransactionAmounts:
      "Balances, totals and transaction amounts show as dots on every page. Click the dots to see one amount, or use the eye on a card to show or hide just that card; changing this setting resets every card.",
    couldntSaveThisToYour:
      "Couldn't save this to your account. It applies on this device until you reload; try again in a moment.",
  },
  passkeysCard: {
    device: "Device",
    passkeyWasNotAdded: "Passkey was not added",
    couldNotRemovePasskey: "Could not remove passkey",
    passkey: "Passkey",
    synced: "Synced",
    thisDeviceOnly: "This device only",
    removePasskey: "Remove passkey",
    noPasskeysYetAPasskey:
      "No passkeys yet. A passkey lets you sign in with Face ID, Touch ID or Windows Hello instead of a password.",
    addAPasskey: "Add a passkey",
    added: (date: string, synced: boolean) =>
      `Added ${date} · ${synced ? "Synced" : "This device only"}`,
  },
  passwordCard: {
    theNewPasswordsDontMatch: "The new passwords don't match.",
    chooseAPasswordYouArent: "Choose a password you aren't already using.",
    yourCurrentPasswordIsNot: "Your current password is not right.",
    yourPasswordWasNotChanged: "Your password was not changed.",
    yourPasswordWasChanged: "Your password was changed.",
    currentPassword: "Current password",
    newPassword: "New password",
    repeatNewPassword: "Repeat new password",
    signOutOfOtherDevices: "Sign out of other devices",
    recommendedIfYouThinkSomeone:
      "Recommended if you think someone else knows your password.",
    changePassword: "Change password",
    minPassword: (n: number) =>
      `Use at least ${n} characters for the new password.`,
    minHint: (n: number) => `At least ${n} characters.`,
  },
  profileCard: {
    enterYourName: "Enter your name.",
    yourNameWasNotSaved: "Your name was not saved.",
    yourNameWasSaved: "Your name was saved.",
    name: "Name",
    email: "Email",
    youSignInWithThis:
      "You sign in with this address. An admin can change it for you.",
    saveName: "Save name",
  },
  sessionsCard: {
    thisDevice: "This device",
    unknownIp: "Unknown IP",
    signOut: "Sign out?",
    signOutText: "Sign out",
    signOutOfAllOther: "Sign out of all other devices",
    revoked: (n: number) =>
      n === 1
        ? "Signed out of 1 other device."
        : `Signed out of ${n} other devices.`,
    activity: (ip: string, current: boolean, relative: string, date: string) =>
      `${ip} · ${current ? "active now" : `active ${relative}`} · signed in ${date}`,
    confirmDevices: (n: number) =>
      `Sign out ${n === 1 ? "1 device" : `${n} devices`}?`,
    unknownDevice: "Unknown device",
    browser: "Browser",
    deviceOn: (browser: string, os: string) => `${browser} on ${os}`,
    methods: {
      password: "Password",
      two_factor: "Password + two-step",
      backup_code: "Backup code",
      passkey: "Passkey",
    },
  },
  twoFactorCard: {
    couldNotStartEnrolment: "Could not start enrolment",
    thatCodeDidNotMatch: "That code did not match",
    couldNotTurnOffTwostep: "Could not turn off two-step sign-in",
    twostepSigninIsOnSave:
      "Two-step sign-in is on. Save these backup codes somewhere safe — each works once if you lose your phone.",
    copyCodes: "Copy codes",
    iveSavedThem: "I've saved them",
    scanWithGoogleAuthenticator1password:
      "Scan with Google Authenticator, 1Password, Authy or similar. Can't scan? Enter this key:",
    sixDigitCode: "6-digit code",
    confirm: "Confirm",
    cancel: "Cancel",
    confirmYourPasswordToTurn: "Confirm your password to turn it off",
    turnOff: "Turn off",
    onAnAuthenticatorCodeIs:
      "On — an authenticator code is required after your password.",
    confirmYourPasswordToBegin: "Confirm your password to begin",
    setUpAuthenticatorApp: "Set up authenticator app",
  },
  page: {
    settings: "Settings",
    yourPreferencesAndHowYou: "Your preferences and how you sign in.",
    profile: "Profile",
    howYouAppearToOthers: "How you appear to others.",
    sharedWorkspaces: "Shared workspaces",
    createAFamilyOrFund:
      "Create a family or fund workspace and choose which accounts to share.",
    manageWorkspaces: "Manage workspaces",
    displayCurrency: "Display currency",
    totalsAndChartsAreConverted:
      "Totals and charts are converted into this currency. Each record keeps its original currency.",
    privacy: "Privacy",
    keepYourNumbersOffScreen:
      "Keep your numbers off screen when someone is looking over your shoulder or you are sharing your screen.",
    twostepSignin: "Two-step sign-in",
    aTimebasedCodeFromAn:
      "A time-based code from an authenticator app, asked for after your password.",
    password: "Password",
    changeThePasswordYouSign: "Change the password you sign in with.",
    passkeys: "Passkeys",
    signInWithoutAPassword:
      "Sign in without a password using your device's biometrics or security key.",
    signedinDevices: "Signed-in devices",
    whereYourAccountIsSigned:
      "Where your account is signed in. Sign out anything you don't recognise.",
    enrolment: (welcome: boolean) =>
      `${welcome ? "Welcome aboard. " : ""}This instance requires two-step sign-in. Set up an authenticator app below to unlock the rest of the app.`,
  },
};
export default settings;
