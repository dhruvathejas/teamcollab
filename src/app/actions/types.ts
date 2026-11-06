export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  /**
   * The submitted (non-secret) values, echoed back on error. React resets a
   * form after its action runs, so inputs use these as defaultValue to keep
   * what the user typed.
   */
  values?: Record<string, string>;
};

/** Collect the given string fields from a submission. */
export function pickValues(formData: FormData, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const v = formData.get(key);
    if (typeof v === "string") out[key] = v;
  }
  return out;
}
