import { ZodError } from "zod";

/** Extract a human-readable message from a ZodError */
export function getZodErrorMessage(err: ZodError): string {
  const issues = err.issues.map((issue) => {
    const path = issue.path.join(".");
    return `${path}: ${issue.message}`;
  });
  return issues.join("; ");
}

/** Get only the first validation issue from a ZodError */
export function getFirstZodIssue(err: ZodError): { path: string[]; message: string } {
  const issue = err.issues[0];
  return { path: issue.path as string[], message: issue.message };
}

/** Create a ZodError from a validation error */
export function createZodError(message: string, path: string[] = []): ZodError {
  return new ZodError([
    { path, message, code: "custom" },
  ]);
}