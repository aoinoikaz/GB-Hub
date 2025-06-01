import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User, updateProfile as updateUserProfile } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../config/firebase";

interface AuthUser extends User {
  role?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  updateProfile: (data: { displayName?: string; photoURL?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    console.log("[AuthContext] Setting up auth listener");
    
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.log("[AuthContext] Auth state changed:", firebaseUser?.uid || "null");
      
      if (firebaseUser) {
        // Just set the user, keep it simple
        const authUser: AuthUser = Object.create(firebaseUser);
        authUser.role = "user";
        setUser(authUser);
      } else {
        setUser(null);
      }
      
      setLoading(false);
    });

    return () => {
      console.log("[AuthContext] Cleaning up auth listener");
      unsubscribe();
    };
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      navigate("/auth");
    } catch (error) {
      console.error("[AuthContext] Logout error:", error);
      throw error;
    }
  };

  const updateProfile = async (data: { displayName?: string; photoURL?: string }) => {
    if (user) {
      try {
        await updateUserProfile(user, data);
        // Re-fetch the user to update the state
        const updatedUser = auth.currentUser;
        if (updatedUser) {
          const authUser: AuthUser = Object.create(updatedUser);
          authUser.role = "user";
          setUser(authUser);
        }
        console.log("[AuthContext] Profile updated:", data);
      } catch (error) {
        console.error("[AuthContext] Update profile error:", error);
        throw error;
      }
    } else {
      throw new Error("No user logged in to update profile");
    }
  };

  // Better loading screen instead of ugly centered spinner
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          {/* Animated Logo */}
          <div className="mb-8 relative">
            <div className="w-24 h-24 mx-auto relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-pulse"></div>
              <div className="absolute inset-2 bg-gray-900 rounded-full"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  GB
                </span>
              </div>
            </div>
          </div>
          
          {/* Loading animation */}
          <div className="flex justify-center gap-1 mb-4">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          
          <p className="text-gray-400 text-sm">Loading your experience...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};