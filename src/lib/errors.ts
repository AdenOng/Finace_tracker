type ApiError = {
  message: string;
  data?: {
    zodError?: {
      formErrors: string[];
      fieldErrors: Record<string, string[] | undefined>;
    } | null;
  } | null;
};

/** The first validation message for a failed request, instead of the raw issue list. */
export function errorMessage(error: ApiError) {
  const zod = error.data?.zodError;
  return (
    zod?.formErrors[0] ??
    Object.values(zod?.fieldErrors ?? {}).flat()[0] ??
    error.message
  );
}
