import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from "firebase/auth";
import { auth } from "../../config/firebase";
import { useAuth } from "../../context/auth-context";
import { Spinner } from "phosphor-react";
import PasswordPolicyInput from "../PasswordPolicyInput";
import { Turnstile } from "@marsidev/react-turnstile";

const SignUpPanel = ({ onSwap }: { onSwap: () => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const { logout } = useAuth();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (!isPasswordValid) {
      setError("Please ensure the password meets the requirements");
      setLoading(false);
      return;
    }

    if (!turnstileToken) {
      setError("Please complete the security check");
      setLoading(false);
      return;
    }

    try {
      // First verify with backend
      const functions = getFunctions();
      const verifySignup = httpsCallable(functions, "verifySignup");
      
      await verifySignup({
        email,
        turnstileToken,
      });

      // If verification passes, create the account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: "New User" });

      await sendEmailVerification(user, {
        url: "https://gondolabros.com/auth/action",
        handleCodeInApp: true,
      });

      await logout();

      setSuccess("Account created! Please verify your email and log in.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
      {success && <p className="text-green-500 text-sm mb-2">{success}</p>}

      <form onSubmit={handleSignUp}>
        <div className="mb-4">
          <label htmlFor="email" className="block text-left font-medium mb-1 text-gray-300">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded-md bg-black/30 border-gray-400 text-white placeholder-gray-400 focus:ring-0 focus:outline-none focus:border-gray-500 hover:border-gray-300"
            placeholder="Enter your email"
            required
            disabled={loading}
          />
        </div>

        <div className="mb-4">
          <label htmlFor="password" className="block text-left font-medium mb-1 text-gray-300">
            Password
          </label>
          <PasswordPolicyInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onValidationChange={(isValid) => setIsPasswordValid(isValid)}
            className="w-full"
            showChecklist={false}
            placeholder="Create a password"
            confirmPassword={confirmPassword}
          />
        </div>

        <div className="mb-6">
          <label htmlFor="confirmPassword" className="block text-left font-medium mb-1 text-gray-300">
            Confirm Password
          </label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded-md bg-black/30 border-gray-400 text-white placeholder-gray-400 focus:ring-0 focus:outline-none focus:border-gray-500 hover:border-gray-300"
            placeholder="Confirm your password"
            required
            disabled={loading}
          />
          <PasswordPolicyInput
            value={password}
            onChange={() => {}}
            onValidationChange={() => {}}
            className="w-full"
            showInput={false}
            showChecklist={true}
            confirmPassword={confirmPassword}
          />
        </div>

        {/* Turnstile CAPTCHA */}
        <div className="mb-6 flex justify-center">
          <Turnstile
            siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
            onSuccess={(token) => {
              setTurnstileToken(token);
              setError(""); // Clear any previous errors
            }}
            onError={() => {
              setError("Security verification failed. Please try again.");
              setTurnstileToken(null);
            }}
            onExpire={() => {
              setTurnstileToken(null);
            }}
            options={{
              theme: 'dark',
              size: 'normal',
            }}
          />
        </div>

        <button
          type="submit"
          className={`w-full py-2 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md transition ${
            loading || !isPasswordValid ? "opacity-90 cursor-not-allowed" : "hover:opacity-90"
          }`}
          disabled={loading || !isPasswordValid}
        >
          {loading ? <Spinner size={20} className="animate-spin mx-auto" /> : "Sign Up"}
        </button>
      </form>

      <button onClick={onSwap} className="mt-4 text-sm text-gray-300 hover:text-white transition" disabled={loading}>
        Already have an account? Sign In
      </button>
    </>
  );
};

export default SignUpPanel;