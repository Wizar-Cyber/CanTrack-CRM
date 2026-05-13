/**
 * Password policy constants and validation.
 * Centralized to ensure consistency across all auth endpoints.
 */

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_PATTERNS = {
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  digit: /\d/,
  special: /[!@#$%^&*(),.?":{}|<>_\-~`+=\[\]\\;'\/]/,
};

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a password against the current policy.
 * Returns an object with `valid` boolean and array of `errors`.
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (!PASSWORD_PATTERNS.uppercase.test(password)) {
    errors.push('Password must contain at least one uppercase letter.');
  }
  if (!PASSWORD_PATTERNS.lowercase.test(password)) {
    errors.push('Password must contain at least one lowercase letter.');
  }
  if (!PASSWORD_PATTERNS.digit.test(password)) {
    errors.push('Password must contain at least one number.');
  }
  if (!PASSWORD_PATTERNS.special.test(password)) {
    errors.push('Password must contain at least one special character.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Returns a human-readable password policy description.
 */
export function getPasswordPolicyDescription(): string {
  return `Minimum ${PASSWORD_MIN_LENGTH} characters, with at least one uppercase letter, one lowercase letter, one number, and one special character.`;
}
