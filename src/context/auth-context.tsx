// src/context/auth-context.tsx - EVERYTHING auth in one place
import { createContext, useContext, useEffect, useState } from "react";
import { 
  onAuthStateChanged, 
  signOut, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  User, 
  updateProfile as updateUserProfile,
  UserCredential
} from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../config/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

// Define AuthUser Type
interface AuthUser extends User {
  role?: string;
}

// Define Auth Context Type - ALL auth operations here
interface AuthContextType {
  // State
  user: AuthUser | null;
  loading: boolean;
  
  // Auth Operations
  signIn: (email: string, password: string) => Promise<UserCredential>;
  signUp: (email: string, password: string) => Promise<UserCredential>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  sendVerificationEmail: (user: User) => Promise<void>;
  updateProfile: (data: { displayName?: string; photoURL?: string }) => Promise<void>;
  
  // Utility
  checkFirstTimeUser: (uid: string) => Promise<boolean>;
}

// Create Context
const AuthContext = createContext<AuthContextType | null>(null);

// Auth Provider Component
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Set up auth state listener
  useEffect(() => {
    console.log("[AuthContext] Initializing auth listener");
    
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.log("[AuthContext] Auth state changed:", firebaseUser?.uid || "null");
      
      if (firebaseUser) {
        // Preserve prototype chain for methods like getIdToken()
        const authUser: AuthUser = Object.assign(
          Object.create(Object.getPrototypeOf(firebaseUser)), 
          firebaseUser,
          { role: "user" }
        );
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

  // CENTRALIZED AUTH OPERATIONS

  const signIn = async (email: string, password: string): Promise<UserCredential> => {
    console.log("[AuthContext] Signing in user:", email);
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle setting the user
      return credential;
    } catch (error) {
      console.error("[AuthContext] Sign in error:", error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string): Promise<UserCredential> => {
    console.log("[AuthContext] Creating new user:", email);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      // Set default display name
      await updateProfile({ displayName: "New User" });
      return credential;
    } catch (error) {
      console.error("[AuthContext] Sign up error:", error);
      throw error;
    }
  };

  const logout = async () => {
    console.log("[AuthContext] Logging out user");
    try {
      await signOut(auth);
      setUser(null);
      navigate("/auth");
    } catch (error) {
      console.error("[AuthContext] Logout error:", error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    console.log("[AuthContext] Sending password reset to:", email);
    try {
      await sendPasswordResetEmail(auth, email, {
        url: 'https://gondolabros.com/auth/action',
        handleCodeInApp: true,
      });
    } catch (error) {
      console.error("[AuthContext] Password reset error:", error);
      throw error;
    }
  };

  const sendVerificationEmail = async (user: User) => {
    console.log("[AuthContext] Sending verification email");
    try {
      await sendEmailVerification(user, {
        url: "https://gondolabros.com/auth/action",
        handleCodeInApp: true,
      });
    } catch (error) {
      console.error("[AuthContext] Verification email error:", error);
      throw error;
    }
  };

  const updateProfile = async (data: { displayName?: string; photoURL?: string }) => {
    if (!user) throw new Error("No user logged in");
    
    console.log("[AuthContext] Updating profile:", data);
    try {
      await updateUserProfile(user, data);
      
      // Force re-read of current user
      if (auth.currentUser) {
        const authUser: AuthUser = Object.assign(
          Object.create(Object.getPrototypeOf(auth.currentUser)), 
          auth.currentUser,
          { role: "user" }
        );
        setUser(authUser);
      }
    } catch (error) {
      console.error("[AuthContext] Update profile error:", error);
      throw error;
    }
  };

  const checkFirstTimeUser = async (uid: string): Promise<boolean> => {
    try {
      const userDocRef = doc(db, "users", uid);
      const userDoc = await getDoc(userDocRef);
      return !userDoc.exists();
    } catch (error) {
      console.error("[AuthContext] Check first time user error:", error);
      return false;
    }
  };

  // Context value with all auth operations
  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signUp,
    logout,
    resetPassword,
    sendVerificationEmail,
    updateProfile,
    checkFirstTimeUser,
  };

  // Don't render children until auth is ready
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
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