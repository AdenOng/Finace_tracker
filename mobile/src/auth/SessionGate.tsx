import React, { useEffect, useState } from "react";

/** Only initial restoration shows a spinner; refreshes preserve the 2FA form. */
export function SessionGate({
  pending,
  authenticated,
  loading,
  signIn,
  children,
}: React.PropsWithChildren<{
  pending: boolean;
  authenticated: boolean;
  loading: React.ReactNode;
  signIn: React.ReactNode;
}>) {
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    if (!pending) setResolved(true);
  }, [pending]);
  if (!resolved && pending) return loading;
  return authenticated ? children : signIn;
}
