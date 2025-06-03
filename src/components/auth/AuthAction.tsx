import { useEffect, useState } from "react";
import {
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { Spinner } from "phosphor-react";
import PasswordPolicyInput from "../PasswordPolicyInput";
import { useNavigate } from "react-router-dom";
import { auth, db, functions } from "../../config/firebase";

const AuthAction = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Processing...");
  const [mode, setMode] = useState<string | null>(null);
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [actionCompleted, setActionCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    console.log("URL Parameters:", {
      mode: params.get("mode"),
      oobCode: params.get("oobCode"),
      email: params.get("email"),
    });
    setMode(params.get("mode"));
    setOobCode(params.get("oobCode"));

    if (!params.get("mode") || !params.get("oobCode")) {
      setMessage("❌ Invalid or expired link.");
    } else {
      setMessage(
        params.get("mode") === "verifyEmail"
          ? "🔍 Ready to verify your email!"
          : "🔐 Ready to reset your password!"
      );
    }
  }, []);

  // Auto-redirect after successful email verification
  useEffect(() => {
    if (mode === "verifyEmail" && actionCompleted) {
      const timer = setTimeout(() => {
        navigate("/auth"); // Redirect to login page after 3 seconds
      }, 3000);

      return () => clearTimeout(timer); // Cleanup timer on unmount
    }
  }, [mode, actionCompleted, navigate]);

  const handleVerifyEmail = async () => {
    if (!oobCode) return;
    setLoading(true);
    try {
      await applyActionCode(auth, oobCode);
      setMessage("✅ Email verified successfully! You can now sign in.");
      setActionCompleted(true);
    } catch (error) {
      setMessage("❌ Email verification failed. The link may be expired or already used.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!oobCode || !newPassword) {
      setError("Missing required information. Please try the reset link again.");
      return;
    }

    if (!isPasswordValid) {
      setError("Please ensure the password meets the requirements");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const email = await verifyPasswordResetCode(auth, oobCode);
      console.log("Email from verifyPasswordResetCode:", email);

      await confirmPasswordReset(auth, oobCode, newPassword);

      const userCredential = await signInWithEmailAndPassword(auth, email, newPassword);
      const uid = userCredential.user.uid;

      const userDoc = await getDoc(doc(db, `users/${uid}`));
      if (!userDoc.exists()) {
        throw new Error("User not found in Firestore");
      }
      const userInfo = userDoc.data();
      const username = userInfo?.username;
      if (!username) {
        throw new Error("Username not found for user");
      }

      console.log("Calling syncEmbyPassword with:", { username, newPassword });
      const syncEmbyPassword = httpsCallable(functions, "syncEmbyPassword");
      await syncEmbyPassword({ username, newPassword });

      // Sign out AFTER syncing the password
      await auth.signOut();

      setMessage("✅ Password reset successful! You can now sign in.");
      setActionCompleted(true);
    } catch (error) {
      setMessage("❌ Password reset failed. The link may be expired or invalid.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative text-gray-100">
      <video
        src="/hero.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover -z-10"
      ></video>

      <div className="w-full max-w-md p-8 rounded-xl shadow-lg backdrop-blur-md bg-black/80 border border-white/20 text-center">
        <h1 className="text-3xl font-bold mb-4">{message}</h1>

        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

        {mode === "verifyEmail" && !actionCompleted && (
          <button
            onClick={handleVerifyEmail}
            disabled={loading}
            className={`mt-4 w-full px-6 py-2 rounded-md font-semibold transition bg-gradient-to-r from-purple-500 to-pink-500 text-white ${
              loading ? "opacity-90 cursor-not-allowed" : "hover:opacity-90"
            }`}
          >
            {loading ? <Spinner size={20} className="animate-spin mx-auto" /> : "Click to Verify"}
          </button>
        )}

        {mode === "verifyEmail" && actionCompleted && (
          <p className="mt-4 text-gray-300">
            Redirecting to login in 3 seconds...{" "}
            <button
              onClick={() => navigate("/auth")}
              className="text-purple-500 hover:text-pink-500 underline"
            >
              Click here to go now
            </button>
          </p>
        )}

        {mode === "resetPassword" && !actionCompleted && (
          <>
            <h2 className="text-2xl font-semibold mt-4">Enter a new password</h2>
            <div className="mt-4">
              <PasswordPolicyInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onValidationChange={(isValid) => setIsPasswordValid(isValid)}
                className="w-full"
                showChecklist={false}
                placeholder="New password"
                confirmPassword={confirmPassword}
              />
            </div>
            <div className="mt-4">
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-md bg-black/30 border-gray-400 text-white placeholder-gray-400 focus:ring-0 focus:outline-none focus:border-gray-500 hover:border-gray-300"
              />
              <PasswordPolicyInput
                value={newPassword}
                onChange={() => {}}
                onValidationChange={() => {}}
                className="w-full"
                showInput={false}
                showChecklist={true}
                confirmPassword={confirmPassword}
              />
            </div>
            <button
              onClick={handleResetPassword}
              disabled={loading || !isPasswordValid}
              className={`mt-4 w-full px-6 py-2 rounded-md font-semibold transition bg-gradient-to-r from-purple-500 to-pink-500 text-white ${
                loading || !isPasswordValid ? "opacity-90 cursor-not-allowed" : "hover:opacity-90"
              }`}
            >
              {loading ? <Spinner size={20} className="animate-spin mx-auto" /> : "Reset Password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthAction;