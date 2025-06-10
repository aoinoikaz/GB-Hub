import { useState, useEffect, useCallback } from "react";
import SignInPanel from "./SignInPanel";
import SignUpPanel from "./SignUpPanel";
import ForgotPasswordPanel from "./ForgotPasswordPanel";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useAuth } from "../../context/auth-context";
import { debounce } from "lodash";
import { useNavigate } from "react-router-dom";
import { Spinner } from "phosphor-react";

// Interface for checkUsername response
interface CheckUsernameResponse {
  available: boolean;
}

const Auth = () => {
  const { user, updateProfile } = useAuth();
  const [currentPanel, setCurrentPanel] = useState<"signin" | "signup" | "forgot" | "setup">("signin");
  const [username, setUsername] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const functions = getFunctions();
  const navigate = useNavigate();

  const checkUsernameAvailability = useCallback(
    debounce(async (username: string) => {
      if (!username || username.trim().length < 3) {
        setUsernameAvailable(null);
        setError("");
        return;
      }
      try {
        const checkUsername = httpsCallable(functions, "checkUsername");
        const result = (await checkUsername({ username })) as { data: CheckUsernameResponse };
        setUsernameAvailable(result.data.available);
        setError(result.data.available ? "" : "Username is already taken.");
      } catch (err: any) {
        setUsernameAvailable(false);
        setError("Error checking username availability.");
        console.error("Error checking username:", err);
      }
    }, 300),
    []
  );

  useEffect(() => {
    checkUsernameAvailability(username);
    return () => checkUsernameAvailability.cancel();
  }, [username, checkUsernameAvailability]);

  const handleSetup = async () => {
    if (usernameAvailable === false || usernameAvailable === null) {
      setError("Please choose a valid and available username.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (!user || !user.email) {
        setError("User not authenticated or email missing.");
        return;
      }
      console.log("Setup params:", { email: user.email, username, password });
      const setupUserAccount = httpsCallable(functions, "setupUserAccount");
      await setupUserAccount({
        email: user.email,
        username,
        password,
      });

      if (updateProfile) {
        await updateProfile({ displayName: username });
        console.log("Frontend displayName updated to:", username);
      } else {
        console.warn("No updateProfile function available in context");
      }

      setCurrentPanel("signin");
      navigate("/dashboard");
      
    } catch (err: any) {
      setError("Setup failed. Please try again.");
      console.error("Setup error:", err);
    } finally {
      setLoading(false);
    }
  };

  const customSetCurrentPanel = (panel: "signin" | "signup" | "forgot" | "setup", password?: string) => {
    setCurrentPanel(panel);
    if (password) {
      setPassword(password);
      console.log("Password set:", password);
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

      {/* Glassmorphic Panel */}
      <div className="w-full max-w-md p-8 rounded-xl shadow-lg backdrop-blur-md bg-black/80 border border-white/20">
        <h2 className="text-2xl font-semibold text-center mb-4">
          {currentPanel === "signin"
            ? "Sign In"
            : currentPanel === "signup"
            ? "Sign Up"
            : currentPanel === "forgot"
            ? "Reset Password"
            : "Set Up Your Profile"}
        </h2>

        {currentPanel === "signin" && (
          <SignInPanel
            onSwap={() => customSetCurrentPanel("signup")}
            onForgot={() => customSetCurrentPanel("forgot")}
            setCurrentPanel={customSetCurrentPanel}
          />
        )}
        {currentPanel === "signup" && <SignUpPanel onSwap={() => customSetCurrentPanel("signin")} />}
        {currentPanel === "forgot" && <ForgotPasswordPanel onSwap={() => customSetCurrentPanel("signin")} />}
        {currentPanel === "setup" && (
          <>
            {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
            <p className="mb-4 text-gray-300">
              Hey, we’ll set a username now which you will use to access Gondola Bros services.
            </p>
            <div className="mb-4 relative">
              <label htmlFor="username" className="block text-left font-medium mb-1 text-gray-300">
                Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2 border rounded-md bg-black/30 border-gray-500 text-white placeholder-gray-400 
                             focus:ring-0 focus:outline-none focus:border-gray-600 pr-10"
                  placeholder="Enter your username"
                  disabled={loading}
                />
                {usernameAvailable !== null && (
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center text-lg">
                    {usernameAvailable ? (
                      <span className="text-green-500">✓</span>
                    ) : (
                      <span className="text-red-500">✗</span>
                    )}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleSetup}
              className={`w-full py-2 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md transition ${
                loading ? "opacity-90 cursor-not-allowed" : "hover:opacity-90"
              }`}
              disabled={usernameAvailable === false || usernameAvailable === null || loading}
            >
              {loading ? <Spinner size={20} className="animate-spin mx-auto" /> : "Set Up and Continue"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Auth;