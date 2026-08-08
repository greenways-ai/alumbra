export class AlumbraValidationError extends TypeError {
  constructor(message, { code = "alumbra/invalid", details = null } = {}) {
    super(message);
    this.name = "AlumbraValidationError";
    this.code = code;
    this.details = details;
  }
}

export class AlumbraConflictError extends Error {
  constructor(message, { code = "alumbra/conflict", details = null } = {}) {
    super(message);
    this.name = "AlumbraConflictError";
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, code, details = null) {
  throw new AlumbraValidationError(message, { code, details });
}

export function conflictError(message, code, details = null) {
  throw new AlumbraConflictError(message, { code, details });
}
