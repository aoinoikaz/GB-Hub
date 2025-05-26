import { useState, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../config/firebase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth-context";
import { doc, getDoc } from "firebase/firestore";
import { Spinner } from "phosphor-react"; // Import Spinner from phosphor-react

const SignInPanel = ({ onSwap, onForgot, setCurrentPanel }: { onSwap: () => void; onForgot: () => void; setCurrentPanel: (panel: "signin" | "signup" | "forgot" | "setup", password?: string) => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false); // Add loading state
  const navigate = useNavigate();
  const { user, logout } = useAuth();

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
    setLoading(true); // Set loading to true at the start of the operation

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      if (!firebaseUser.emailVerified) {
        setError("Please verify your email before logging in.");
        await logout();
        return;
      }

      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists() && firebaseUser.displayName === "New User") {
        console.log("Sign-in success, switching to setup with password:", password);
        setCurrentPanel("setup", password);
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false); // Set loading to false when the operation completes (success or failure)
    }
  };

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
            disabled={loading} // Disable input while loading
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
            disabled={loading} // Disable input while loading
          />
        </div>

        <button
          type="submit"
          className={`w-full py-2 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md transition ${
            loading ? "opacity-90 cursor-not-allowed" : "hover:opacity-90"
          }`} // Match the style from Auth.tsx and AuthAction.tsx
          disabled={loading} // Disable button while loading
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