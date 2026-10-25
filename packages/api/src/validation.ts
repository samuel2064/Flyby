function validateUUID(value: unknown): { valid: true; id: string } | { valid: false; error: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { valid: false, error: "Invalid or missing ID" };
  }
  const v = value.trim();
  // Standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Prisma CUID format: cxxxxxxxxxxxxxxxxxxxx (25 chars, starts with 'c')
  const cuidRegex = /^c[a-z0-9]{24}$/i;
  if (!uuidRegex.test(v) && !cuidRegex.test(v)) {
    return { valid: false, error: "Invalid ID format" };
  }
  return { valid: true, id: v };
}

function validateReportedAt(value: unknown): { valid: true; date: Date } | { valid: false; error: string } {
  if (value === undefined || value === null)
    return { valid: false, error: "reportedAt is required" };

  if (typeof value !== "string")
    return { valid: false, error: "reportedAt must be a valid ISO date string" };

  const date = new Date(value);
  if (isNaN(date.getTime()))
    return { valid: false, error: "reportedAt must be a valid ISO date string" };

  // reportedAt must not be in the future (allow 5 minute clock skew)
  const maxFuture = Date.now() + 5 * 60 * 1000;
  if (date.getTime() > maxFuture)
    return { valid: false, error: "reportedAt cannot be in the future" };

  // reportedAt must not be older than 30 days
  const minDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (date.getTime() < minDate.getTime())
    return { valid: false, error: "reportedAt cannot be older than 30 days" };

  return { valid: true, date };
}

function validateLineType(value: string | undefined | null): { valid: true; type: string } | { valid: false; error: string } {
  const validLineTypes = ["standard", "preclear", "clear"];
  if (typeof value !== "string" || !validLineTypes.includes(value)) {
    return { valid: false, error: `Invalid lineType. Must be one of: ${validLineTypes.join(", ")}` };
  }
  return { valid: true, type: value };
}

function validateReportType(value: string | undefined | null): { valid: true; type: string } | { valid: false; error: string } {
  const validReportTypes = ["standard", "preclear", "clear"];
  if (typeof value !== "string" || !validReportTypes.includes(value)) {
    return { valid: false, error: `Invalid reportType. Must be one of: ${validReportTypes.join(", ")}` };
  }
  return { valid: true, type: value };
}

function validateSource(value: string | undefined | null): { valid: true; source: string } | { valid: false; error: string } {
  const validSources = ["crowd", "official"] as const;
  if (typeof value !== "string") {
    return { valid: false, error: "source must be a string" };
  }
  if (!validSources.includes(value as typeof validSources[number])) {
    return { valid: false, error: `Invalid source. Must be one of: ${validSources.join(", ")}` };
  }
  return { valid: true, source: value };
}

function validateMinutes(minutes: unknown): { valid: true; minutes: number } | { valid: false; error: string } {
  if (typeof minutes !== "number" || Number.isInteger(minutes) === false || minutes < 0 || minutes > 300) {
    return { valid: false, error: "Invalid wait time minutes (must be a whole number between 0-300)" };
  }
  return { valid: true, minutes };
}

function validateHours(hoursInput: unknown): { valid: true; hours: number } | { valid: false; error: string } {
  if (typeof hoursInput !== "string" && typeof hoursInput !== "number" && hoursInput !== undefined && hoursInput !== null) {
    return { valid: false, error: "hours must be a positive integer between 1 and 168" };
  }

  let parsed: number;
  if (hoursInput === undefined || hoursInput === null) {
    parsed = 24; // default
  } else if (typeof hoursInput === "number") {
    parsed = hoursInput;
  } else {
    const trimmed = String(hoursInput).trim();
    if (trimmed.length === 0) {
      parsed = 24; // default
    } else {
      parsed = Number(trimmed);
    }
  }

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 168) {
    return { valid: false, error: "hours must be a positive integer between 1 and 168" };
  }
  return { valid: true, hours: parsed };
}

export { validateUUID, validateReportedAt, validateLineType, validateReportType, validateSource, validateMinutes, validateHours };