// src/components/PasswordPolicyInput.tsx

import React, { useState, useEffect } from "react";
import { passwordPolicy } from "../utils/PasswordPolicy";

interface PasswordPolicyInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValidationChange: (isValid: boolean) => void;
  className?: string;
  showInput?: boolean;
  showChecklist?: boolean;
  placeholder?: string;
  confirmPassword?: string;
}

interface ValidationState {
  minLength: boolean;
  maxLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  specialChar: boolean;
  matchConfirm: boolean;
}

const PasswordPolicyInput: React.FC<PasswordPolicyInputProps> = ({
  value,
  onChange,
  onValidationChange,
  className,
  showInput = true,
  showChecklist = false,
  placeholder,
  confirmPassword = "",
}) => {
  const [validationState, setValidationState] = useState<ValidationState>({
    minLength: false,
    maxLength: true, // Starts true since an empty password is <= 32
    uppercase: false,
    lowercase: false,
    number: false,
    specialChar: false,
    matchConfirm: true, // Starts true since confirmPassword is initially empty
  });
  const [hideChecklist, setHideChecklist] = useState(false);

  useEffect(() => {
    const newValidationState: ValidationState = {
      minLength: passwordPolicy.minLength.test(value),
      maxLength: passwordPolicy.maxLength.test(value),
      uppercase: passwordPolicy.uppercase.test(value),
      lowercase: passwordPolicy.lowercase.test(value),
      number: passwordPolicy.number.test(value),
      specialChar: passwordPolicy.specialChar.test(value),
      matchConfirm: confirmPassword.length === 0 || value === confirmPassword,
    };
    setValidationState(newValidationState);

    const isValid = Object.values(newValidationState).every((valid) => valid);
    onValidationChange(isValid);

    // Hide the checklist once all rules are met (including confirm password match)
    if (isValid) {
      setHideChecklist(true);
    } else {
      // Show the checklist again if the password becomes invalid
      setHideChecklist(false);
    }
  }, [value, confirmPassword, onValidationChange]);

  const rulesMet = Object.values(validationState).filter((valid) => valid).length;
  const strength = rulesMet < 4 ? "Weak" : rulesMet < 6 ? "Medium" : "Strong";
  const strengthColor =
    strength === "Weak"
      ? "text-purple-500"
      : strength === "Medium"
      ? "text-pink-500"
      : "text-green-500";

  return (
    <div className={className}>
      {showInput && (
        <input
          type="password"
          value={value}
          onChange={onChange}
          onInput={onChange}
          className="w-full px-4 py-2 border rounded-md bg-black/30 border-gray-400 text-white placeholder-gray-400 focus:ring-0 focus:outline-none focus:border-gray-500 hover:border-gray-300"
          aria-label="Password"
          placeholder={placeholder}
        />
      )}
      {showChecklist && value.length > 0 && !hideChecklist && (
        <div className="password-policy mt-2">
          <div
            className={`strength-indicator ${strengthColor} text-gray-100 text-sm font-semibold text-shadow-sm`}
            aria-live="polite"
          >
            Strength: {strength}
          </div>
          <div className="checklist mt-1 text-gray-100 text-sm space-y-1" aria-live="polite">
            {Object.entries(passwordPolicy).map(([key, rule]) => (
              <div
                key={key}
                className={`flex items-center gap-1 ${
                  validationState[key as keyof ValidationState]
                    ? "text-green-500"
                    : "text-red-500"
                } bg-transparent`}
              >
                <span>{validationState[key as keyof ValidationState] ? "✔" : "✘"}</span>
                <span>{rule.message}</span>
              </div>
            ))}
            {confirmPassword.length > 0 && (
              <div
                className={`flex items-center gap-1 ${
                  validationState.matchConfirm ? "text-green-500" : "text-red-500"
                } bg-transparent`}
              >
                <span>{validationState.matchConfirm ? "✔" : "✘"}</span>
                <span>{validationState.matchConfirm ? "Passwords match" : "Passwords do not match"}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PasswordPolicyInput;