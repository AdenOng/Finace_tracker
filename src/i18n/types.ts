/** Dictionaries use the English key structure and keep the parameter types of its templates. */
export type Translation<T> = T extends string
  ? string
  : T extends { readonly template: unknown }
    ? T
    : { [K in keyof T]: Translation<T[K]> };
