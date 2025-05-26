import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User, updateProfile as updateUserProfile } from "firebase/auth"; // Imported updateProfile
import { useNavigate } from "react-router-dom";
import { auth } from "../config/firebase"; // Use shared auth instance

// Define AuthUser Type (For Roles in Future)
interface AuthUser extends User {
  role?: string;
}

// Define Auth Context Type
interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  updateProfile: (data: { displayName?: string; photoURL?: string }) => Promise<void>; // Added updateProfile
}

// Create Context
const AuthContext = createContext<AuthContextType | null>(null);

// Auth Provider Component
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    console.log("Initializing auth listener with shared auth instance:", auth); // Debug
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.log("Firebase User from onAuthStateChanged:", firebaseUser); // Debug the user object
      if (firebaseUser) {
        // Set user directly to preserve the User prototype
        const authUser: AuthUser = Object.create(firebaseUser, { role: { value: "user", enumerable: true } });
        setUser(authUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    navigate("/auth");
  };

  const updateProfile = async (data: { displayName?: string; photoURL?: string }) => {
    if (user) {
      await updateUserProfile(user, data);
      console.log("Profile updated with:", data); // Debug log
    } else {
      throw new Error("No user logged in to update profile");
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, updateProfile }}>
      {!loading ? children : <div className="text-center mt-5">Loading...</div>}
    </AuthContext.Provider>
  );
};

// Hook to Use Auth
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};