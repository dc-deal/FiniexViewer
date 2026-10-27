/**
 * What one validation check asserts, as `GET /api/v1/validation-checks` serves it: the id a
 * `major` warning names in `check`, a title and a sentence. Their warnings document: *"somebody
 * wrote the rule that fired, and `GET /api/v1/validation-checks` serves what every check id means"*.
 */
export interface ValidationCheck {
  check: string
  title: string
  description: string
}

/** `GET /api/v1/validation-checks` — every check the backend can report, keyed by its id. */
export interface ValidationCheckList {
  /** `["check"]` */
  key: string[]
  checks: ValidationCheck[]
}
