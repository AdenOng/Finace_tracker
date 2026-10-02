/** Read a text field from FormData; file inputs and missing fields become "". */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
