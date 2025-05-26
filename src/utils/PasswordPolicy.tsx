// src/utils/PasswordPolicy.ts

export interface PasswordRule {
  message: string;
  test: (password: string) => boolean;
  value?: number; // For minLength and maxLength
}

export interface PasswordPolicy {
  minLength: PasswordRule;
  maxLength: PasswordRule;
  uppercase: PasswordRule;
  lowercase: PasswordRule;
  number: PasswordRule;
  specialChar: PasswordRule;
}

export const passwordPolicy: PasswordPolicy = {
  minLength: {
    value: 6,
    message: "At least 6 characters",
    test: (password: string) => password.length >= 6,
  },
  maxLength: {
    value: 32,
    message: "At most 32 characters",
    test: (password: string) => password.length <= 32,
  },
  uppercase: {
    message: "At least one uppercase letter",
    test: (password: string) => /[A-Z]/.test(password),
  },
  lowercase: {
    message: "At least one lowercase letter",
    test: (password: string) => /[a-z]/.test(password),
  },
  number: {
    message: "At least one number",
    test: (password: string) => /[0-9]/.test(password),
  },
  specialChar: {
    message: "At least one special character (!@#$%^&*)",
    test: (password: string) => /[!@#$%^&*]/.test(password),
  },
};