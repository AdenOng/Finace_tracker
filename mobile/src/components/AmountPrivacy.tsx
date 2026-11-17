import React, { createContext, useContext, useState } from "react";
import { Pressable } from "react-native";

export const AmountPrivacy = createContext(0);

/** Keep a reveal local to this value; any eye-switch change discards it. */
export function SensitiveValue({
  hidden,
  render,
}: {
  hidden: boolean;
  render: (hidden: boolean) => React.ReactNode;
}) {
  const revision = useContext(AmountPrivacy);
  return (
    <Reveal key={`${revision}:${hidden}`} hidden={hidden} render={render} />
  );
}

function Reveal({
  hidden,
  render,
}: {
  hidden: boolean;
  render: (hidden: boolean) => React.ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  if (!hidden) return render(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={revealed ? "Hide amount" : "Reveal amount"}
      onPress={(event) => {
        event.stopPropagation();
        setRevealed(!revealed);
      }}
    >
      {render(!revealed)}
    </Pressable>
  );
}
