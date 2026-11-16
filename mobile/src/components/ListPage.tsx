import React from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, styles } from "./ui";

/** One scrolling surface: headers and footers share the virtualized financial list. */
export function ListPage<T extends { id: string }>({
  data,
  renderItem,
  header,
  footer,
  topBar,
  refreshing,
  refresh,
}: {
  data: T[];
  renderItem: ListRenderItem<T>;
  header: React.ReactElement;
  footer?: React.ReactElement;
  topBar?: React.ReactNode;
  refreshing: boolean;
  refresh: () => void;
}) {
  return (
    <SafeAreaView style={styles.page} edges={["top", "left", "right"]}>
      {topBar}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={(row) => row.id}
          contentContainerStyle={styles.content}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          refreshing={refreshing}
          onRefresh={refresh}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          style={{ backgroundColor: colors.desk }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
