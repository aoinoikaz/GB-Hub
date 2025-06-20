import { useState, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../config/firebase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth-context";
import { doc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Spinner, Shield } from "phosphor-react";

const SignInPanel = ({ onSwap, onForgot, setCurrentPanel }: { 
  onSwap: () => void; 
  onForgot: () => void; 
  setCurrentPanel: (panel: "signin" | "signup" | "forgot" | "setup", password?: string) => void 
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempUser, setTempUser] = useState<any>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const functions = getFunctions();

  useEffect(() => {
    const checkFirstLogin = async () => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists() && user.displayName === "New User") {
          console.log("First login, switching to setup with password:", password);
          setCurrentPanel("setup", password);
        }
      }
    };
    checkFirstLogin();
  }, [user, setCurrentPanel, password]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      // Check email verification
      if (!firebaseUser.emailVerified) {
        setError("Please verify your email before logging in. Check your inbox for the verification link.");
        await logout();
        setLoading(false);
        return;
      }

      // Check if user has 2FA enabled
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Check if 2FA is enabled
        if (userData.twoFactorEnabled) {
          // Store the user temporarily and show 2FA input
          setTempUser(firebaseUser);
          setRequires2FA(true);
          setLoading(false);
          return;
        }
        
        // No 2FA, proceed with normal login
        if (firebaseUser.displayName === "New User") {
          console.log("First login detected, switching to setup");
          setCurrentPanel("setup", password);
        } else {
          navigate("/dashboard");
        }
      } else {
        // First login flow
        if (firebaseUser.displayName === "New User") {
          setCurrentPanel("setup", password);
        } else {
          navigate("/dashboard");
        }
      }
    } catch (err: any) {
      // Better error messages
      if (err.code === 'auth/user-not-found') {
        setError("No account found with this email.");
      } else if (err.code === 'auth/wrong-password') {
        setError("Incorrect password.");
      } else if (err.code === 'auth/invalid-email') {
        setError("Invalid email address.");
      } else if (err.code === 'auth/too-many-requests') {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (useBackupCode) {
      // Backup code validation
      if (!twoFactorCode || twoFactorCode.length !== 9 || !twoFactorCode.includes('-')) {
        setError("Please enter a valid backup code (format: XXXX-XXXX)");
        return;
      }
    } else {
      // Regular TOTP validation
      if (!twoFactorCode || twoFactorCode.length !== 6) {
        setError("Please enter a 6-digit code");
        return;
      }
    }

    setLoading(true);
    setError("");

    try {
      // Verify the 2FA code
      const verify2FALogin = httpsCallable(functions, "verify2FALogin");
      const result = await verify2FALogin({ 
        token: useBackupCode ? undefined : twoFactorCode,
        backupCode: useBackupCode ? twoFactorCode : undefined
      });
      
      if ((result.data as any).success) {
        // 2FA verified successfully, proceed with login
        if (tempUser.displayName === "New User") {
          setCurrentPanel("setup", password);
        } else {
          navigate("/dashboard");
        }
      } else {
        setError(useBackupCode ? "Invalid backup code" : "Invalid authentication code");
      }
    } catch (err: any) {
      setError("Failed to verify authentication code.");
      console.error("2FA verification error:", err);
    } finally {
      setLoading(false);
    }
  };

  // If 2FA is required, show 2FA input screen
  if (requires2FA) {
    return (
      <>
        <form onSubmit={handleVerify2FA}>
          <div className="text-center mb-6">
            <div className="inline-flex p-3 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 mb-4">
              <Shield size={32} className="text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Two-Factor Authentication</h3>
            <p className="text-gray-400 text-sm">
              {useBackupCode 
                ? "Enter your backup code" 
                : "Enter the 6-digit code from your authenticator app"
              }
            </p>
          </div>

          {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

          <div className="mb-4">
            <input
              type="text"
              value={twoFactorCode}
              onChange={(e) => {
                const value = e.target.value;
                if (useBackupCode) {
                  // Backup code format - allow letters, numbers and hyphen
                  const formatted = value.toUpperCase().slice(0, 9);
                  setTwoFactorCode(formatted);
                } else {
                  // Regular TOTP format - only digits
                  setTwoFactorCode(value.replace(/\D/g, '').slice(0, 6));
                }
              }}
              className={`w-full px-4 py-4 border rounded-md bg-black/30 text-white placeholder-gray-400 
                         focus:ring-0 focus:outline-none focus:border-gray-600 text-center font-mono text-2xl tracking-[0.5em]
                         ${useBackupCode ? 'border-purple-500' : 'border-gray-500'}`}
              placeholder={useBackupCode ? "XXXX-XXXX" : "000000"}
              maxLength={useBackupCode ? 9 : 6}
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="text-center mb-6">
            <button
              type="button"
              onClick={() => {
                setUseBackupCode(!useBackupCode);
                setTwoFactorCode("");
                setError("");
              }}
              className="text-sm text-purple-400 hover:text-purple-300 transition"
              disabled={loading}
            >
              {useBackupCode ? "Use authenticator app instead" : "Use backup code instead"}
            </button>
          </div>

          <button
            type="submit"
            className={`w-full py-2 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md transition ${
              loading || (twoFactorCode.length !== 6 && twoFactorCode.length !== 9) ? "opacity-50 cursor-not-allowed" : "hover:opacity-90"
            }`}
            disabled={loading || (useBackupCode ? twoFactorCode.length !== 9 : twoFactorCode.length !== 6)}
          >
            {loading ? <Spinner size={20} className="animate-spin mx-auto" /> : "Verify & Sign In"}
          </button>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setRequires2FA(false);
                setTwoFactorCode("");
                setError("");
                logout(); // Sign out the temp user
              }}
              className="text-sm text-gray-300 hover:text-white transition"
              disabled={loading}
            >
              Back to login
            </button>
          </div>
        </form>
      </>
    );
  }

  // Normal login form
  return (
    <>
      <form onSubmit={handleSignIn}>
        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        <div className="mb-4">
          <label htmlFor="email" className="block text-left font-medium mb-1 text-gray-300">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded-md bg-black/30 border-gray-500 text-white placeholder-gray-400 
                       focus:ring-0 focus:outline-none focus:border-gray-600"
            placeholder="Enter your email"
            disabled={loading}
          />
        </div>

        <div className="mb-6">
          <label htmlFor="password" className="block text-left font-medium mb-1 text-gray-300">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded-md bg-black/30 border-gray-500 text-white placeholder-gray-400 
                       focus:ring-0 focus:outline-none focus:border-gray-600"
            placeholder="Enter your password"
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          className={`w-full py-2 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md transition ${
            loading ? "opacity-90 cursor-not-allowed" : "hover:opacity-90"
          }`}
          disabled={loading}
        >
          {loading ? <Spinner size={20} className="animate-spin mx-auto" /> : "Sign In"}
        </button>
      </form>

      <div className="flex justify-between items-center mt-6">
        <button onClick={onForgot} className="text-sm text-gray-300 hover:text-white transition" disabled={loading}>
          Forgot Password?
        </button>
        <button onClick={onSwap} className="text-sm text-gray-300 hover:text-white transition" disabled={loading}>
          Create Account
        </button>
      </div>
    </>
  );
};

export default SignInPanel;