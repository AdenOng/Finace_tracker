const auth = {
  register: {
    mismatch: "Passwords do not match",
    failed: "Could not create the account",
    setupToken: "Setup token",
    tokenHint: "Ask the instance operator for this token.",
    name: "Name",
    password: "Password",
    passwordHint: "At least 10 characters.",
    confirm: "Confirm password",
  },
  resetForm: {
    success: "Your password has been changed.",
    mismatch: "Passwords do not match",
    newPassword: "New password",
    passwordHint: "At least 10 characters.",
    confirm: "Confirm password",
    submit: "Set password",
    signIn: "Sign in",
  },
  signIn: {
    back: "Back to sign in",
    askOperator:
      "Ask whoever runs this Finfolio for a password reset link. It works once and signs you out everywhere else.",
    sent: "If an account uses that address, a reset link is on its way. It works once within the hour. Check your spam folder if it doesn't arrive.",
    resetIntro:
      "Enter the email you sign in with and we'll send you a link to choose a new password.",
    sendReset: "Email me a reset link",
    failed: "Sign-in failed",
    passkeyFailed: "Passkey sign-in failed",
    password: "Password",
    forgot: "Forgot password?",
    submit: "Sign in",
    or: "or",
    passkey: "Use a passkey",
  },
  twoFactor: {
    failed: "That code did not work",
    title: "Two-step check",
    totpHint: "Enter the 6-digit code from your authenticator app.",
    backupHint:
      "Enter one of the backup codes you saved when you turned on two-step sign-in.",
    code: "Code",
    backupCode: "Backup code",
    trust: "Trust this device for 30 days",
    verify: "Verify",
    useBackup: "Use a backup code instead",
    useApp: "Use authenticator app instead",
  },
  setup: {
    metaTitle: "Set up",
    title: "Create the admin account",
    body: "This is a fresh instance. The account you create now manages users, brokers, categories and AI providers.",
    submit: "Create admin account",
  },
  invite: {
    metaTitle: "Accept invitation",
    expiredTitle: "This link no longer works",
    title: "You're invited",
    submit: "Create account",
    expiredBefore:
      "It may have expired, been used already or been revoked. Ask the admin for a new invitation, or ",
    signIn: "sign in",
    expiredAfter: " if you already have an account.",
    beforeEmail: "Create your account for ",
    afterEmail: ". Your data stays private to you.",
  },
  reset: {
    metaTitle: "Reset password",
    expiredTitle: "This link no longer works",
    expired:
      "It may have expired, been replaced by a newer link or been used already.",
    emailHint:
      " Ask for a new one with “Forgot password?” when signing in, or ask the admin.",
    adminHint: " Ask the admin for a new reset link.",
    title: "Choose a new password",
    beforeEmail: "For ",
    afterEmail: ". You will be signed out everywhere else.",
  },
  workspaceInvite: {
    metaTitle: "Join workspace",
    expiredTitle: "This link no longer works",
    expired:
      "It may have expired, been used or been revoked. Ask the workspace owner for a new link.",
    enroll: "Set up two-step sign-in",
    enrollAfter: ", then reopen this invitation to join.",
    existing: "Already have an account?",
    signIn: "Sign in to join",
    submit: "Create account and join",
    title: (name: string) => `Join ${name}`,
    body: (role: string) =>
      `You are invited as a ${role}. Everyone in this workspace can view its shared accounts. Your accounts stay private until you choose to share them.`,
    wrongEmail: (email: string) =>
      `This invitation is for ${email}. Sign out from Settings and sign in with that email address.`,
    signInAfter: ".",
    roles: {
      owner: "owner",
      member: "member",
      viewer: "viewer",
    },
  },
};

export default auth;
