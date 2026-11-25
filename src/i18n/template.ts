/** Serializable interpolation and conditional text for messages passed through React Server Components. */
type Part =
  | string
  | number
  | boolean
  | null
  | readonly ["text", ...Part[]]
  | readonly ["number", number]
  | readonly ["field", Part, string]
  | readonly ["if", Part, Part, Part]
  | readonly ["===" | "!==" | ">" | "&&" | "||" | "??", Part, Part]
  | readonly ["numeric" | "trim" | "toLowerCase", Part]
  | readonly ["stripPrefix", Part, string]
  | readonly ["join", Part, Part]
  | readonly ["joinPresent", Part, ...Part[]];

type Template<A extends unknown[]> = {
  readonly template: Part;
  readonly args?: A;
};

export function message<A extends unknown[]>(template: Part): Template<A> {
  return { template };
}

export type Resolved<T> =
  T extends Template<infer A>
    ? (...args: A) => string
    : T extends string
      ? T
      : { [K in keyof T]: Resolved<T[K]> };

function interpolate(part: Part, args: unknown[]): unknown {
  if (typeof part === "number") return args[part];
  if (part === null || typeof part !== "object") return part;

  switch (part[0]) {
    case "text":
      return part
        .slice(1)
        .map((entry) => String(interpolate(entry, args)))
        .join("");
    case "number":
      return part[1];
    case "field":
      return (interpolate(part[1], args) as Record<string, unknown>)[part[2]];
    case "if":
      return interpolate(interpolate(part[1], args) ? part[2] : part[3], args);
    case "===":
      return interpolate(part[1], args) === interpolate(part[2], args);
    case "!==":
      return interpolate(part[1], args) !== interpolate(part[2], args);
    case ">":
      return (
        Number(interpolate(part[1], args)) > Number(interpolate(part[2], args))
      );
    case "&&":
      return interpolate(part[1], args) && interpolate(part[2], args);
    case "||": {
      const value = interpolate(part[1], args);
      if (value) return value;
      return interpolate(part[2], args);
    }
    case "??":
      return interpolate(part[1], args) ?? interpolate(part[2], args);
    case "numeric":
      return Number(interpolate(part[1], args));
    case "trim":
      return String(interpolate(part[1], args)).trim();
    case "toLowerCase":
      return String(interpolate(part[1], args)).toLowerCase();
    case "stripPrefix": {
      const value = String(interpolate(part[1], args));
      return value.startsWith(part[2]) ? value.slice(part[2].length) : value;
    }
    case "join":
      return (interpolate(part[1], args) as string[]).join(
        String(interpolate(part[2], args)),
      );
    case "joinPresent":
      return part
        .slice(2)
        .map((entry) => interpolate(entry, args))
        .filter(Boolean)
        .join(String(interpolate(part[1], args)));
  }
}

function resolve(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if ("template" in value) {
    const { template } = value as Template<unknown[]>;
    return (...args: unknown[]) =>
      typeof template === "string"
        ? template.replace(/\{(\d+)\}/g, (_, index: string) =>
            String(args[Number(index)]),
          )
        : String(interpolate(template, args));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, resolve(entry)]),
  );
}

export function resolveMessages<T extends object>(dictionary: T): Resolved<T> {
  return resolve(dictionary) as Resolved<T>;
}
