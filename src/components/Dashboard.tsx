// src/components/Dashboard.tsx
import { useState, useEffect } from "react";
import { getAuth, signOut } from "firebase/auth";
import { useTheme } from "../context/theme-context";
import {
  House,
  Gear,
  SignOut,
  Bell,
  ShoppingCart,
  PlayCircle,
  GameController,
  Coin,
} from "phosphor-react";
import MediaDashboard from "./MediaDashboard";
import Settings from "./Settings";
import Store from "./Store";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { useAuth } from "../context/auth-context";
import { ImageSquare } from "phosphor-react";

const Dashboard = () => {
  const auth = getAuth();
  const { theme } = useTheme();
  const [activeSection, setActiveSection] = useState("services");
  const { user: authUser } = useAuth();
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const firestore = getFirestore();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(() => {});
    return () => unsubscribe();
  }, [auth]);

  useEffect(() => {
    const fetchProfileImage = async () => {
      if (!authUser) return;
      try {
        const userDoc = await getDoc(doc(firestore, `users/${authUser.uid}`));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setProfileImage(data.profileImage || null);
        }
      } catch (error) {
        console.error("Error fetching profile image for navbar:", error);
      }
    };
    fetchProfileImage();
  }, [authUser, firestore]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = "/auth";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className={`min-h-screen flex flex-col md:flex-row ${theme === "dark" ? "bg-[#121212] text-gray-100" : "bg-gray-100 text-gray-900"}`}>
      
      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex fixed inset-y-0 left-0 w-20 flex-col items-center p-4 space-y-6 transition-transform ${theme === "dark" ? "bg-[#1c1c1c]" : "bg-white shadow-lg"}`}>
        <nav className="space-y-6">
          <button onClick={() => setActiveSection("services")} className="p-3 rounded-md hover:bg-gray-700">
            <House size={24} />
          </button>
          <button onClick={() => setActiveSection("media")} className="p-3 rounded-md hover:bg-gray-700">
            <PlayCircle size={24} />
          </button>
          <button onClick={() => setActiveSection("games")} className="p-3 rounded-md hover:bg-gray-700">
            <GameController size={24} />
          </button>
          <button onClick={() => setActiveSection("store")} className="p-3 rounded-md hover:bg-gray-700">
            <Coin size={24} />
          </button>
          <button onClick={() => setActiveSection("settings")} className="p-3 rounded-md hover:bg-gray-700">
            <Gear size={24} />
          </button>
          <button onClick={handleLogout} className="p-3 rounded-md text-red-500 hover:bg-red-700">
            <SignOut size={24} />
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen md:ml-20">
        {/* Top Navigation */}
        <header className="flex justify-end items-center px-6 py-4 bg-opacity-50 shadow-sm backdrop-blur-md">
          <div className="flex items-center space-x-4">
            <button className="p-2 rounded-md hover:bg-gray-700">
              <Bell size={24} />
            </button>
            <button className="p-2 rounded-md hover:bg-gray-700">
              <ShoppingCart size={24} />
            </button>
            <div className="flex items-center space-x-2">
              {profileImage ? (
                <img
                  src={profileImage}
                  alt={`${authUser?.displayName || "User"}'s profile`}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <ImageSquare size={24} className="text-gray-500 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center dark:text-gray-100" />
              )}
              <span className="text-gray-700 dark:text-gray-300">{authUser?.displayName || "Guest"}</span>
            </div>
          </div>
        </header>

        {/* Dashboard Sections */}
        <main className="p-6 flex-1">
          {activeSection === "services" && (
            <div>
              <h1 className="text-3xl font-bold mb-2">{getGreeting()}, {authUser?.displayName || "Guest"}!</h1>
              <p className="text-gray-500 dark:text-gray-400 mb-6">Explore your Gondola Bros services:</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-md cursor-pointer" onClick={() => setActiveSection("games")}>
                  <h2 className="text-xl font-semibold">Games</h2>
                  <p>View upcoming games</p>
                </div>
                <div className="p-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md cursor-pointer" onClick={() => setActiveSection("media")}>
                  <h2 className="text-xl font-semibold">Media</h2>
                  <p>Manage your Media Subscription</p>
                </div>
                <div className="p-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-md cursor-pointer" onClick={() => setActiveSection("store")}>
                  <h2 className="text-xl font-semibold">Store</h2>
                  <p>Manage your tokens and purchases</p>
                </div>
              </div>
            </div>
          )}
          {activeSection === "media" && <MediaDashboard />}
          {activeSection === "store" && <Store />}
          {activeSection === "games" && <div className="text-xl">Game projects coming soon!</div>}
          {activeSection === "settings" && <Settings />}
        </main>
      </div>
      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center p-4 md:hidden bg-white shadow-lg dark:bg-[#1c1c1c]">
        <button onClick={() => setActiveSection("services")} className="flex flex-col items-center text-gray-900 dark:text-gray-100">
          <House size={24} />
        </button>
        <button onClick={() => setActiveSection("media")} className="flex flex-col items-center text-gray-900 dark:text-gray-100">
          <PlayCircle size={24} />
        </button>
        <button onClick={() => setActiveSection("games")} className="flex flex-col items-center text-gray-900 dark:text-gray-100">
          <GameController size={24} />
        </button>
        <button onClick={() => setActiveSection("store")} className="flex flex-col items-center text-gray-900 dark:text-gray-100">
          <Coin size={24} />
        </button>
        <button onClick={() => setActiveSection("settings")} className="flex flex-col items-center text-gray-900 dark:text-gray-100">
          <Gear size={24} />
        </button>
        <button onClick={handleLogout} className="flex flex-col items-center text-red-500">
          <SignOut size={24} />
        </button>
      </nav>
    </div>
  );
};

export default Dashboard;