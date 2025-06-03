// src/components/Layout.tsx - COMPLETE UPDATED VERSION

import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../context/theme-context";
import { useAuth } from "../context/auth-context";
import { 
  House, Gear, SignOut, Bell, ShoppingCart, PlayCircle, 
  GameController, Coin, X, List, User
} from "phosphor-react";
import { getFirestore, doc, getDoc } from "firebase/firestore";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const { theme } = useTheme();
  const { user: authUser, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const firestore = getFirestore();

  const navItems = [
    { icon: House, label: "Dashboard", path: "/dashboard", id: "dashboard" },
    { icon: PlayCircle, label: "Media", path: "/media", id: "media" },
    { icon: GameController, label: "Games", path: "/games", id: "games" },
    { icon: Coin, label: "Store", path: "/store", id: "store" },
    { icon: Gear, label: "Settings", path: "/settings", id: "settings" },
  ];

  useEffect(() => {
    const handleResize = () => setIsMobileMenuOpen(false);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        console.error("Error fetching profile image:", error);
      }
    };
    fetchProfileImage();
  }, [authUser, firestore]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className={`min-h-screen ${theme === "dark" ? "bg-gray-950" : "bg-gray-50"}`}>
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>
      </div>

      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex fixed inset-y-0 left-0 w-64 flex-col backdrop-blur-xl ${
        theme === "dark" 
          ? "bg-gray-900/80 border-r border-white/10" 
          : "bg-white/80 border-r border-gray-200"
      }`}>
        {/* Logo */}
        <div className="p-6">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
            Gondola Bros
          </h1>
          <p className={`text-xs mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
            Media • Games • Development
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 pb-4">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    isActive(item.path)
                      ? theme === "dark"
                        ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-white border border-purple-500/30"
                        : "bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-600 border border-purple-500/20"
                      : theme === "dark"
                        ? "text-gray-400 hover:text-white hover:bg-white/5"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  <item.icon size={20} weight={isActive(item.path) ? "fill" : "regular"} />
                  <span className="font-medium">{item.label}</span>
                  {isActive(item.path) && (
                    <div className="ml-auto w-1 h-4 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-4">
            {profileImage ? (
              <img
                src={profileImage}
                alt="Profile"
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <User size={20} className="text-white" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className={`font-medium truncate ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                {authUser?.displayName || "User"}
              </p>
              <p className={`text-xs truncate ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                {authUser?.email}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              theme === "dark"
                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "bg-red-50 text-red-600 hover:bg-red-100"
            }`}
          >
            <SignOut size={18} />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
        
      </aside>

      {/* Mobile Header */}
      <header className={`md:hidden fixed top-0 left-0 right-0 z-40 backdrop-blur-xl ${
        theme === "dark" 
          ? "bg-gray-900/90 border-b border-white/10" 
          : "bg-white/90 border-b border-gray-200"
      }`}>
        <div className="flex items-center justify-between p-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
            GB
          </h1>
          <div className="flex items-center gap-3">
            {/* Mobile Status Indicator - Dot Only */}
            <a 
              href="https://status.gondolabros.com/"
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2 rounded-lg ${
                theme === "dark" ? "text-green-400" : "text-green-600"
              }`}
            >
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            </a>
            <button className={`p-2 rounded-lg ${
              theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"
            }`}>
              <Bell size={20} />
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`p-2 rounded-lg ${
                theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {isMobileMenuOpen ? <X size={20} /> : <List size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className={`relative ml-auto w-80 h-full backdrop-blur-xl ${
            theme === "dark" 
              ? "bg-gray-900/95" 
              : "bg-white/95"
          }`}>
            {/* Mobile menu content */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                  Menu
                </h2>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`p-2 rounded-lg ${
                    theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <X size={20} />
                </button>
              </div>
              
              {/* Mobile Navigation */}
              <nav className="space-y-2">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      navigate(item.path);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      isActive(item.path)
                        ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-white"
                        : theme === "dark"
                          ? "text-gray-400 hover:text-white hover:bg-white/5"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    }`}
                  >
                    <item.icon size={20} weight={isActive(item.path) ? "fill" : "regular"} />
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </nav>
              
              {/* Mobile User Section */}
              <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-white/10">
                <div className="flex items-center gap-3 mb-4">
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt="Profile"
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <User size={20} className="text-white" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      {authUser?.displayName || "User"}
                    </p>
                    <p className={`text-xs truncate ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                      {authUser?.email}
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => {
                    handleLogout();
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    theme === "dark"
                      ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      : "bg-red-50 text-red-600 hover:bg-red-100"
                  }`}
                >
                  <SignOut size={18} />
                  <span className="text-sm font-medium">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={`${
        // Desktop margin for sidebar
        "md:ml-64"
      } ${
        // Mobile padding for header
        "pt-16 md:pt-0"
      }`}>
        {/* Top Bar for Desktop */}
        <div className={`hidden md:flex items-center justify-between px-8 py-4 backdrop-blur-sm ${
          theme === "dark" 
            ? "bg-gray-900/50 border-b border-white/10" 
            : "bg-white/50 border-b border-gray-200"
        }`}>
          <div>
            <h2 className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
              {navItems.find(item => isActive(item.path))?.label || "Dashboard"}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            {/* Status Indicator in Top Bar */}
            <a 
              href="https://status.gondolabros.com/"
              target="_blank"
              rel="noopener noreferrer"
              className={`hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                theme === "dark"
                  ? "bg-green-500/10 hover:bg-green-500/20 border border-green-500/20"
                  : "bg-green-50 hover:bg-green-100 border border-green-200"
              }`}
            >
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className={`text-xs font-medium ${
                theme === "dark" ? "text-green-400" : "text-green-700"
              }`}>All Systems Operational</span>
            </a>
            
            <button className={`p-2 rounded-lg transition-colors ${
              theme === "dark" 
                ? "text-gray-400 hover:text-white hover:bg-white/10" 
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}>
              <Bell size={20} />
            </button>
            <button 
              onClick={() => navigate("/store")}
              className={`p-2 rounded-lg transition-colors ${
                theme === "dark" 
                  ? "text-gray-400 hover:text-white hover:bg-white/10" 
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              <ShoppingCart size={20} />
            </button>
          </div>
        </div>

        {/* Page Content */}
        <div className="relative min-h-[calc(100vh-4rem)] pb-20 md:pb-0">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 backdrop-blur-xl ${
        theme === "dark" 
          ? "bg-gray-900/90 border-t border-white/10" 
          : "bg-white/90 border-t border-gray-200"
      }`}>
        <div className="flex justify-around items-center py-2">
          {navItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center p-2 rounded-lg transition-colors ${
                isActive(item.path)
                  ? "text-purple-500"
                  : theme === "dark"
                    ? "text-gray-400 hover:text-white"
                    : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <item.icon size={24} weight={isActive(item.path) ? "fill" : "regular"} />
              <span className="text-xs mt-1">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default Layout;