export async function register() {
  // The inline NEXT_RUNTIME check lets webpack drop this import from the edge bundle.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.SKIP_DB_BOOTSTRAP !== "true"
  ) {
    const { bootstrapDatabase } = await import("./server/db/bootstrap");
    await bootstrapDatabase();
  }
}
