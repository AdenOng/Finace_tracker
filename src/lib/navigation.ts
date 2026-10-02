/** Accept only local paths, including when the browser normalizes backslashes or controls. */
export function safeNextPath(value: string | null): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  ) {
    return "/";
  }
  return value;
}
