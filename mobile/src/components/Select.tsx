import React, { useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState, Field, Icon, IconButton, colors, styles } from "./ui";

/** Searchable native sheet keeps long account and category catalogs out of forms. */
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected =
    options.find((option) => option.value === value)?.label ?? "Choose…";
  const filtered = options.filter((option) =>
    option.label
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <View style={{ gap: 8 }}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${selected}`}
          onPress={() => {
            setSearch("");
            setOpen(true);
          }}
          style={({ pressed }) => [
            styles.input,
            styles.row,
            pressed && { backgroundColor: colors.wash },
          ]}
        >
          <Text style={[styles.text, { flex: 1 }]}>{selected}</Text>
          <Icon name="chevron-down" size={18} />
        </Pressable>
      </View>
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.page}>
          <View style={[styles.content, { flex: 1 }]}>
            <View style={styles.row}>
              <Text
                accessibilityRole="header"
                style={[styles.title, { flex: 1 }]}
              >
                {label}
              </Text>
              <IconButton
                icon="x"
                label="Close selection"
                onPress={() => setOpen(false)}
              />
            </View>
            <Field
              label={`Search ${label.toLowerCase()}`}
              value={search}
              onChangeText={setSearch}
              placeholder="Type to filter…"
              autoCorrect={false}
            />
            <FlatList
              data={filtered}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(option) => option.value}
              ListEmptyComponent={
                <EmptyState
                  title="No matches"
                  detail="Try a different search."
                  icon="search"
                />
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: item.value === value }}
                  accessibilityLabel={item.label}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      minHeight: 56,
                      paddingHorizontal: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.line,
                    },
                    item.value === value && {
                      backgroundColor: colors.paper,
                    },
                    pressed && { backgroundColor: colors.wash },
                  ]}
                >
                  <Text style={[styles.text, { flex: 1 }]}>{item.label}</Text>
                  <Icon
                    name={item.value === value ? "check-circle" : "circle"}
                    size={20}
                    color={item.value === value ? colors.ink : colors.line2}
                  />
                </Pressable>
              )}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
