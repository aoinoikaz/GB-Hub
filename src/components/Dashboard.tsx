// src/components/Dashboard.tsx - Final Complete Version
import { useState, useEffect } from "react";
import { useTheme } from "../context/theme-context";
import { useAuth } from "../context/auth-context";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { 
  GameController, PlayCircle, Coin, Rocket, 
  Users, Star, Heart, ShoppingCart,
  ArrowRight, Sparkle, Spinner
} from "phosphor-react";

const Dashboard = () => {
  const { theme } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [totalTokensPurchased, setTotalTokensPurchased] = useState<number>(0);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [totalTips, setTotalTips] = useState<number>(0);
  const [memberSince, setMemberSince] = useState<string>("New Member");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const services = [
    {
      id: "games",
      title: "Game Development",
      description: "Build immersive gaming experiences",
      icon: GameController,
      gradient: "from-orange-500 to-red-500",
      features: ["Unity & Unreal Engine", "Multiplayer Systems", "Cross-Platform"],
      status: "Coming Soon",
      link: "/games"
    },
    {
      id: "media",
      title: "Media Streaming",
      description: "Your personal streaming platform",
      icon: PlayCircle,
      gradient: "from-purple-500 to-pink-500",
      features: ["4K Content", "Request System", "Offline Downloads"],
      status: "Active",
      link: "/media"
    }
  ];

  const quickStats: Array<{
    label: string;
    value: string;
    icon: any;
  }> = [
    { 
      label: "Member Since", 
      value: memberSince, 
      icon: Star 
    },
    { 
      label: "Tokens Purchased", 
      value: totalTokensPurchased.toLocaleString(), 
      icon: ShoppingCart 
    },
    { 
      label: "Platform Members", 
      value: memberCount.toString(), 
      icon: Users 
    },
    { 
      label: "Tips Given", 
      value: `$${totalTips}`, 
      icon: Heart
    }
  ];

  useEffect(() => {
    let mounted = true;
    let isRunning = false;

    const fetchData = async () => {
      if (isRunning) {
        console.log("[Dashboard] Already fetching, skipping duplicate call");
        return;
      }
      
      if (authLoading) {
        console.log("[Dashboard] Auth still loading, waiting...");
        return;
      }

      if (!user) {
        console.log("[Dashboard] No user found after auth loaded");
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      isRunning = true;

      try {
        console.log("[Dashboard] Starting fetch for user:", user.uid);
        
        // Small delay to let React settle
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!mounted) {
          console.log("[Dashboard] Component unmounted, aborting");
          return;
        }

        // Fetch user's data
        try {
          console.log("[Dashboard] Getting user document...");
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (!mounted) return;
          
          console.log("[Dashboard] User doc exists:", userDoc.exists());
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log("[Dashboard] User data:", userData);
            
            // Set current token balance
            setTokenBalance(userData.tokenBalance || 0);
            
            // Set member since date with better formatting
            if (userData.createdAt) {
              const createdDate = userData.createdAt.toDate();
              const monthYear = createdDate.toLocaleDateString('en-US', { 
                month: 'short', 
                year: 'numeric' 
              });
              setMemberSince(monthYear); // e.g., "Jan 2025" instead of just "2025"
            }
          } else {
            console.warn("[Dashboard] User document doesn't exist!");
            if (mounted) {
              setError("User profile not found. Some features may be limited.");
            }
          }
        } catch (userError: any) {
          console.error("[Dashboard] Error fetching user doc:", userError);
          if (mounted) {
            setError(`Failed to load user data: ${userError.message}`);
          }
        }

        // Only continue if still mounted
        if (!mounted) return;

        // Get user's total token purchases
        try {
          console.log("[Dashboard] Getting user's token purchases...");
          const purchasesSnapshot = await getDocs(
            query(
              collection(db, "tokenPurchases"), 
              where("userId", "==", user.uid),
              where("status", "==", "completed")
            )
          );
          
          let totalPurchased = 0;
          purchasesSnapshot.forEach(doc => {
            const purchase = doc.data();
            totalPurchased += (purchase.tokens || 0);
          });
          
          console.log("[Dashboard] Total tokens purchased:", totalPurchased);
          setTotalTokensPurchased(totalPurchased);
          
        } catch (purchaseError: any) {
          console.error("[Dashboard] Error getting token purchases:", purchaseError);
          setTotalTokensPurchased(0);
        }

        // Only continue if still mounted
        if (!mounted) return;

        // Get platform stats
        try {
          console.log("[Dashboard] Getting platform stats...");
          
          // Total Platform Members
          const usersSnapshot = await getDocs(collection(db, "users"));
          const totalUsers = usersSnapshot.size;
          console.log("[Dashboard] Total users:", totalUsers);
          setMemberCount(totalUsers);
          
          // Total Tips Given
          const tipsSnapshot = await getDocs(
            query(collection(db, "tips"), where("status", "==", "completed"))
          );
          let tipsTotal = 0;
          tipsSnapshot.forEach(doc => {
            const tip = doc.data();
            tipsTotal += parseFloat(tip.amount || "0");
          });
          console.log("[Dashboard] Total tips:", tipsTotal);
          setTotalTips(Math.round(tipsTotal));
          
        } catch (statsError: any) {
          console.error("[Dashboard] Error getting platform stats:", statsError);
          if (mounted) {
            setMemberCount(0);
            setTotalTips(0);
          }
        }

      } catch (error: any) {
        console.error("[Dashboard] Fatal error:", error);
        
        if (mounted) {
          setTokenBalance(0);
          setTotalTokensPurchased(0);
          setMemberCount(0);
          setTotalTips(0);
          setError(`Dashboard error: ${error.message}`);
        }
      } finally {
        if (mounted) {
          console.log("[Dashboard] Loading complete");
          setLoading(false);
          isRunning = false;
        }
      }
    };

    fetchData();

    return () => {
      console.log("[Dashboard] Cleanup - unmounting");
      mounted = false;
    };
  }, [user, authLoading]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const handleServiceClick = (link: string, status: string) => {
    if (status === "Active") {
      navigate(link);
    }
  };

  // Show loading spinner while auth is loading OR while fetching data
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Spinner size={48} className="animate-spin text-purple-400 mx-auto mb-4" />
          <p className="text-gray-400">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${theme === "dark" ? "bg-gray-950" : "bg-gray-50"}`}>
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-orange-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative p-6 md:p-8 max-w-7xl mx-auto">
        {/* Error message if needed */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Welcome Section */}
        <div className="mb-12 text-center">
          <h1 className={`text-4xl md:text-5xl font-bold mb-2 ${
            theme === "dark" ? "text-white" : "text-gray-900"
          }`}>
            {getGreeting()}, {user?.displayName || "Developer"}!
          </h1>
          <p className={`text-lg ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
            Welcome to Gondola Bros Hub
          </p>
        </div>

        {/* Quick Stats - 4 cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {quickStats.map((stat, index) => (
            <div
              key={index}
              className={`relative overflow-hidden rounded-2xl p-6 backdrop-blur-xl ${
                theme === "dark" 
                  ? "bg-white/5 border border-white/10" 
                  : "bg-white/70 border border-gray-200"
              }`}
            >
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-purple-500/20 to-transparent rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <stat.icon size={24} className={theme === "dark" ? "text-purple-400" : "text-purple-600"} />
                  <Sparkle size={16} className="text-yellow-400" />
                </div>
                <p className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  {stat.value}
                </p>
                <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Main Services */}
        <div className="mb-8">
          <h2 className={`text-2xl font-bold mb-6 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
            Our Services
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {services.map((service) => (
              <div
                key={service.id}
                onClick={() => handleServiceClick(service.link, service.status)}
                className={`group relative overflow-hidden rounded-3xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] ${
                  service.status === "Active" ? "cursor-pointer" : "cursor-not-allowed"
                } ${
                  theme === "dark" 
                    ? "bg-white/5 border border-white/10 hover:border-white/20" 
                    : "bg-white/70 border border-gray-200 hover:border-gray-300"
                }`}
              >
                {/* Background Gradient */}
                <div className={`absolute inset-0 bg-gradient-to-br ${service.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
                
                {/* Content */}
                <div className="relative p-8">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div className={`p-4 rounded-2xl bg-gradient-to-br ${service.gradient} shadow-lg group-hover:shadow-xl transition-shadow`}>
                      <service.icon size={28} className="text-white" />
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      service.status === "Active" 
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                    }`}>
                      {service.status}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 className={`text-2xl font-bold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    {service.title}
                  </h3>
                  <p className={`mb-6 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    {service.description}
                  </p>

                  {/* Features */}
                  <div className="space-y-2 mb-6">
                    {service.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${service.gradient}`} />
                        <span className={`text-sm ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Action Button */}
                  <button className={`w-full py-3 px-6 rounded-xl font-medium transition-all flex items-center justify-center gap-2 group-hover:gap-3 ${
                    service.status === "Active"
                      ? `bg-gradient-to-r ${service.gradient} text-white shadow-lg hover:shadow-xl`
                      : theme === "dark"
                      ? "bg-gray-800 text-gray-400"
                      : "bg-gray-200 text-gray-600"
                  }`}>
                    <span>{service.status === "Coming Soon" ? "Notify Me" : "Enter"}</span>
                    <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                  </button>
                </div>

                {/* Decorative Elements */}
                <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Token Balance Card */}
          <div className={`relative overflow-hidden rounded-3xl backdrop-blur-xl p-8 ${
            theme === "dark" 
              ? "bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20" 
              : "bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Coin size={24} className="text-yellow-500" />
                  <h3 className={`text-xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    Token Balance
                  </h3>
                </div>
                <p className={`text-3xl font-bold mb-4 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  {tokenBalance.toLocaleString()}
                </p>
                <button 
                  onClick={() => navigate("/store")}
                  className="px-6 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
                >
                  Manage Tokens
                </button>
              </div>
              <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-yellow-500/20 rounded-full blur-2xl" />
            </div>
          </div>

          {/* Community Card */}
          <div className={`relative overflow-hidden rounded-3xl backdrop-blur-xl p-8 ${
            theme === "dark" 
              ? "bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20" 
              : "bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Rocket size={24} className="text-purple-500" />
                  <h3 className={`text-xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    Join Community
                  </h3>
                </div>
                <p className={`mb-4 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  Connect with other creators
                </p>
                <button className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:shadow-lg transition-all">
                  Discord Server
                </button>
              </div>
              <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-purple-500/20 rounded-full blur-2xl" />
            </div>
          </div>
        </div>

        {/* Footer Status Bar */}
        <div className="mt-12 text-center">
          <a 
            href="https://status.gondolabros.com/" 
            target="_blank" 
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
              theme === "dark" 
                ? "bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white" 
                : "bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900"
            }`}
          >
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm font-medium">All Systems Operational</span>
            <ArrowRight size={14} />
          </a>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;