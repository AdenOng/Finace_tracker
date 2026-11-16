import React, { useState } from "react";
import { Platform, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Button, Field } from "./ui";
import { validDate } from "../utils/server";
export { validDate } from "../utils/server";

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Field
        label={label}
        value={value}
        onChangeText={onChange}
        maxLength={10}
        placeholder="YYYY-MM-DD"
      />
      <Button
        title={`Choose ${label.toLowerCase()}`}
        variant="secondary"
        size="sm"
        icon="calendar"
        onPress={() => setOpen(true)}
      />
      {open && (
        <DateTimePicker
          mode="date"
          value={validDate(value) ? new Date(value + "T12:00:00") : new Date()}
          onChange={(event, date) => {
            setOpen(Platform.OS === "ios" && event.type !== "dismissed");
            if (event.type === "set" && date) {
              onChange(
                `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
              );
              setOpen(false);
            }
          }}
        />
      )}
    </View>
  );
}
