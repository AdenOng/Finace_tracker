/**
 * Every language has the same shape as English: strings become any string, and message
 * functions (plurals, interpolation) keep their exact signature.
 */
export type Translation<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : { [K in keyof T]: Translation<T[K]> };
