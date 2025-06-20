import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/auth-context";
import { 
  Info, Spinner, FilmSlate, Television, Users,
  Check, X, Rocket, Lightning, Warning, CheckCircle, Clock, 
  CreditCard, ArrowRight, Sparkle, Gift,
  Headphones, Monitor, CloudArrowDown, Coins
} from "phosphor-react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/theme-context";

interface ProcessSubscriptionResponse {
  success: boolean;
  subscriptionId: string;
  endDate: string;
}

interface CheckSubscriptionStatusResponse {
  hasActiveSubscription: boolean;
  subscription?: {
    subscriptionId: string;
    planId: string;
    billingPeriod: string;
    startDate: string;
    endDate: string;
    status: string;
    autoRenew: boolean;
    daysRemaining: number;
    movieRequestsUsed?: number;
    tvRequestsUsed?: number;
    lastResetDate?: string;
  };
}

interface SubscriptionPlan {
  id: string;
  name: string;
  monthlyTokens: number;
  features: {
    streams: number;
    downloads: boolean;
    movieRequests: number;
    tvRequests: number;
    support: "standard" | "priority";
  };
  popular?: boolean;
  icon: React.ReactNode;
  color: string;
  gradient: string;
}

const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "basic",
    name: "Basic",
    monthlyTokens: 70,
    features: {
      streams: 1,
      downloads: true,
      movieRequests: 1,
      tvRequests: 1,
      support: "standard",
    },
    icon: <Monitor size={24} />,
    color: "gray",
    gradient: "from-gray-500 to-gray-600",
  },
  {
    id: "duo",
    name: "Duo",
    monthlyTokens: 120,
    features: {
      streams: 2,
      downloads: true,
      movieRequests: 2,
      tvRequests: 2,
      support: "standard",
    },
    icon: <Users size={24} />,
    color: "blue",
    gradient: "from-blue-500 to-purple-500",
    popular: true,
  },
  {
    id: "family",
    name: "Family",
    monthlyTokens: 200,
    features: {
      streams: 5,
      downloads: true,
      movieRequests: 5,
      tvRequests: 5,
      support: "priority",
    },
    icon: <Users size={24} />,
    color: "purple",
    gradient: "from-purple-500 to-pink-500",
  },
];

const boosterPacks = [
  {
    id: "movie-booster-5",
    name: "Movie Pack",
    tokens: 50,
    description: "+5 movie requests",
    icon: <FilmSlate size={20} />,
    gradient: "from-orange-500 to-red-500",
    type: "movie",
    amount: 5,
  },
  {
    id: "tv-booster-3",
    name: "TV Pack",
    tokens: 60,
    description: "+3 TV show requests",
    icon: <Television size={20} />,
    gradient: "from-teal-500 to-cyan-500",
    type: "tv",
    amount: 3,
  },
  {
    id: "mega-booster",
    name: "Mega Bundle",
    tokens: 150,
    description: "+10 movies & +5 TV shows",
    icon: <Rocket size={20} />,
    gradient: "from-purple-500 to-pink-500",
    type: "both",
    movieAmount: 10,
    tvAmount: 5,
  },
  {
    id: "ultra-booster",
    name: "Ultra Bundle",
    tokens: 300,
    description: "+20 movies & +10 TV shows",
    icon: <Lightning size={20} />,
    gradient: "from-yellow-500 to-red-500",
    type: "mega",
    movieAmount: 20,
    tvAmount: 10,
  },
];

const MediaDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [isLinked, setIsLinked] = useState(false);
  const [username, setUsername] = useState<string>("Not set");
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [activeSubscription, setActiveSubscription] = useState<any>(null);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [showBoosterPacks, setShowBoosterPacks] = useState(false);
  const [purchasingBooster, setPurchasingBooster] = useState<string | null>(null);
  const [autoRenewEnabled, setAutoRenewEnabled] = useState(true);
  const [togglingAutoRenew, setTogglingAutoRenew] = useState(false);
  const functions = getFunctions();

  const [quotaData, setQuotaData] = useState<{
    movieLimit: number;
    movieUsed: number;
    movieRemaining: number;
    movieDaysToReset: number;
    tvLimit: number;
    tvUsed: number;
    tvRemaining: number;
    tvDaysToReset: number;
  } | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);

  // Check subscription status
  const checkSubscriptionStatus = async () => {
    if (!user) return;
    
    try {
      const checkStatus = httpsCallable<{userId: string}, CheckSubscriptionStatusResponse>(
        functions, 
        "checkSubscriptionStatus"
      );
      const result = await checkStatus({ userId: user.uid });
      
      if (result.data.hasActiveSubscription && result.data.subscription) {
        setActiveSubscription(result.data.subscription);
        setCurrentPlan(result.data.subscription.planId);
      } else {
        setActiveSubscription(null);
        setCurrentPlan(null);
      }
    } catch (err) {
      console.error("Error checking subscription status:", err);
    }
  };

  // Toggle auto-renewal
  const handleToggleAutoRenew = async () => {
    if (!user || !activeSubscription) return;
    
    setTogglingAutoRenew(true);
    setError(null);

    try {
      const toggleAutoRenew = httpsCallable(functions, "toggleAutoRenew");
      const result = await toggleAutoRenew({
        userId: user.uid,
        autoRenew: !activeSubscription.autoRenew,
      });

      if (result.data) {
        await checkSubscriptionStatus();
      }
    } catch (err: any) {
      setError(err.message || "Failed to update subscription");
      console.error("Toggle auto-renew error:", err);
    } finally {
      setTogglingAutoRenew(false);
    }
  };

  useEffect(() => {
    if (!user || authLoading) return;

    const fetchUserData = async () => {
      try {
        setLoading(true);
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          setTokenBalance(data.tokenBalance || 0);
          const embyService = data.services?.emby;
          if (embyService?.serviceUserId) {
            setIsLinked(true);
            setUsername(user.displayName || "Not set");
            await checkSubscriptionStatus();
          } else {
            setIsLinked(false);
            setUsername(user.displayName || "Not set");
          }
        } else {
          setIsLinked(false);
          setUsername(user.displayName || "Not set");
        }
      } catch (err) {
        console.error("Error fetching Firestore data:", err);
        setError("Failed to fetch account data.");
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user, authLoading]);

  // Fetch quota data on mount and when subscription changes
  useEffect(() => {
    if (activeSubscription && isLinked) {
      fetchQuotaData();
    }
  }, [activeSubscription, isLinked, user]);

  // Refresh quota data when user returns to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeSubscription && isLinked && !quotaLoading) {
        console.log('Tab became visible, refreshing quota data...');
        fetchQuotaData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeSubscription, isLinked, quotaLoading]);

  const calculateTokenCost = () => {
    if (!selectedPlan) return 0;
    const plan = subscriptionPlans.find((p) => p.id === selectedPlan);
    if (!plan) return 0;
    return plan.monthlyTokens;
  };

  const calculateProrate = () => {
    if (!currentPlan || !selectedPlan || !activeSubscription) return 0;
    
    const currentPlanData = subscriptionPlans.find(p => p.id === currentPlan);
    const newPlanData = subscriptionPlans.find(p => p.id === selectedPlan);
    
    if (!currentPlanData || !newPlanData) return 0;
    
    const endDate = new Date(activeSubscription.endDate);
    const now = new Date();
    const totalDays = Math.ceil((endDate.getTime() - new Date(activeSubscription.startDate).getTime()) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const usedDays = totalDays - remainingDays;
    
    const currentPlanTokens = currentPlanData.monthlyTokens;
    const usedTokens = Math.floor((currentPlanTokens * usedDays) / totalDays);
    const unusedTokens = currentPlanTokens - usedTokens;
    
    return unusedTokens;
  };

  const handleRedeemSubscription = async () => {
    if (!selectedPlan || !user) return;
    
    setRedeeming(true);
    setError(null);

    try {
      let tokenCost = calculateTokenCost();
      const proRateCredit = calculateProrate();
      
      if (currentPlan && selectedPlan !== currentPlan && proRateCredit > 0) {
        const currentPlanIndex = subscriptionPlans.findIndex(p => p.id === currentPlan);
        const newPlanIndex = subscriptionPlans.findIndex(p => p.id === selectedPlan);
        
        if (newPlanIndex > currentPlanIndex) {
          tokenCost = Math.max(0, tokenCost - proRateCredit);
        }
      }
      
      if (tokenBalance < tokenCost) {
        throw new Error("Insufficient tokens for this subscription");
      }

      const processSubscription = httpsCallable<any, ProcessSubscriptionResponse>(
        functions, 
        "processSubscription"
      );
      
      const result = await processSubscription({
        userId: user.uid,
        planId: selectedPlan,
        billingPeriod: "monthly", // ALWAYS MONTHLY NOW
        duration: 1,
        autoRenew: !activeSubscription ? autoRenewEnabled : activeSubscription.autoRenew,
      });

      if (result.data.success) {
        const userRef = doc(db, `users/${user.uid}`);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setTokenBalance(data.tokenBalance || 0);
        }

        await checkSubscriptionStatus();
        setSelectedPlan(null);
        setAutoRenewEnabled(true);
      }
      
    } catch (err: any) {
      setError(err.message || "Failed to redeem subscription");
      console.error("Redemption error:", err);
    } finally {
      setRedeeming(false);
    }
  };

  const handlePurchaseBooster = async (boosterId: string) => {
    if (!user) return;
    
    setPurchasingBooster(boosterId);
    setError(null);

    try {
      const booster = boosterPacks.find(b => b.id === boosterId);
      if (!booster) throw new Error("Invalid booster pack");

      if (tokenBalance < booster.tokens) {
        throw new Error("Insufficient tokens for this booster pack");
      }

      const purchaseBooster = httpsCallable(functions, "purchaseBoosterPack");
      const result = await purchaseBooster({
        userId: user.uid,
        boosterId,
      });

      if (result.data) {
        const userRef = doc(db, `users/${user.uid}`);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setTokenBalance(data.tokenBalance || 0);
        }

        await checkSubscriptionStatus();
      }
    } catch (err: any) {
      setError(err.message || "Failed to purchase booster pack");
      console.error("Booster purchase error:", err);
    } finally {
      setPurchasingBooster(null);
    }
  };

  // Add this after handlePurchaseBooster function
  const fetchQuotaData = async () => {
    if (!user || !activeSubscription) return;
    
    setQuotaLoading(true);
    try {
      const getJellyseerrQuotas = httpsCallable(functions, "getJellyseerrQuotas");
      const result = await getJellyseerrQuotas({ userId: user.uid });
      
      if (result.data && (result.data as any).success && (result.data as any).quotas) {
        setQuotaData((result.data as any).quotas);
      }
    } catch (error) {
      console.error("Failed to fetch quota data:", error);
    } finally {
      setQuotaLoading(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        theme === "dark" ? "bg-gray-950" : "bg-gray-50"
      }`}>
        <div className="text-center">
          <Spinner size={48} className="animate-spin text-purple-400 mx-auto mb-4" />
          <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
            Loading your media experience...
          </p>
        </div>
      </div>
    );
  }

  const tokenCost = calculateTokenCost();
  const proRateCredit = calculateProrate();
  const finalCost = currentPlan && selectedPlan !== currentPlan && proRateCredit > 0 
    ? Math.max(0, tokenCost - proRateCredit) 
    : tokenCost;

  const isCancelled = activeSubscription && !activeSubscription.autoRenew;

  return (
    <div className={`min-h-screen ${
      theme === "dark" ? "bg-gray-950" : "bg-gray-50"
    }`}>
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-3">
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              Media Dashboard
            </span>
          </h1>
          <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
            Your streaming command center
          </p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl backdrop-blur-md">
            <p className="text-red-400 flex items-center gap-2">
              <Warning size={20} weight="fill" />
              {error}
            </p>
          </div>
        )}

        {!isLinked ? (
          <div className="max-w-2xl mx-auto">
            <div className={`relative overflow-hidden rounded-3xl backdrop-blur-md border p-8 ${
              theme === "dark"
                ? "bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-white/10"
                : "bg-gradient-to-br from-blue-50 to-purple-50 border-gray-200"
            }`}>
              <div className="relative flex items-start gap-6">
                <div className={`p-4 rounded-2xl backdrop-blur-sm ${
                  theme === "dark" ? "bg-blue-500/20" : "bg-blue-100"
                }`}>
                  <Info size={32} className="text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className={`text-2xl font-bold mb-3 ${
                    theme === "dark" ? "text-white" : "text-gray-900"
                  }`}>Complete Your Setup</h3>
                  <p className={`mb-6 leading-relaxed ${
                    theme === "dark" ? "text-gray-300" : "text-gray-700"
                  }`}>
                    Your media account needs to be linked to start streaming. This quick setup will get you access to thousands of movies and shows.
                  </p>
                  <a 
                    href="/auth" 
                    className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg shadow-purple-500/25"
                  >
                    Complete Setup
                    <ArrowRight size={20} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Account Overview Card */}
            <div className="mb-10 relative">
              <div className={`relative overflow-hidden rounded-3xl backdrop-blur-xl border ${
                theme === "dark"
                  ? "bg-gradient-to-br from-gray-800/80 to-gray-900/80 border-white/10"
                  : "bg-white border-gray-200"
              }`}>
                <div className="relative p-8">
                  <div className="flex flex-wrap gap-8 items-start justify-between">
                    {/* User Info Section */}
                    <div className="flex-1 min-w-[300px]">
                      <div className="flex items-center gap-5 mb-8">
                        <div className="relative">
                          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/50">
                            <span className="text-3xl font-bold text-white">
                              {username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className={`absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center border-4 ${
                            theme === "dark" ? "border-gray-800" : "border-white"
                          }`}>
                            <Check size={16} className="text-white" weight="bold" />
                          </div>
                        </div>
                        <div>
                          <h2 className={`text-3xl font-bold mb-1 ${
                            theme === "dark" ? "text-white" : "text-gray-900"
                          }`}>{username}</h2>
                          <div className="flex items-center gap-3">
                            {activeSubscription ? (
                              activeSubscription.autoRenew ? (
                                <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 rounded-full">
                                  <CheckCircle size={16} weight="fill" className="text-green-400" />
                                  <span className="text-sm font-medium text-green-400">Active</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/20 rounded-full">
                                  <Clock size={16} weight="fill" className="text-yellow-400" />
                                  <span className="text-sm font-medium text-yellow-400">Ending Soon</span>
                                </div>
                              )
                            ) : (
                              <div className="flex items-center gap-2 px-3 py-1 bg-gray-500/20 rounded-full">
                                <X size={16} weight="bold" className="text-gray-400" />
                                <span className="text-sm font-medium text-gray-400">No Subscription</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {currentPlan && activeSubscription && (
                        <>
                          {/* Plan Info */}
                          <div className={`mb-6 p-6 rounded-2xl backdrop-blur-sm border ${
                            theme === "dark"
                              ? "bg-white/5 border-white/10"
                              : "bg-gray-50 border-gray-200"
                          }`}>
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <div className={`p-3 rounded-xl bg-gradient-to-br ${subscriptionPlans.find(p => p.id === currentPlan)?.gradient} shadow-lg`}>
                                  {subscriptionPlans.find(p => p.id === currentPlan)?.icon}
                                </div>
                                <div>
                                  <h3 className={`text-xl font-semibold ${
                                    theme === "dark" ? "text-white" : "text-gray-900"
                                  }`}>
                                    {subscriptionPlans.find(p => p.id === currentPlan)?.name} Plan
                                  </h3>
                                  <p className={`text-sm ${
                                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                                  }`}>
                                    Monthly subscription
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`text-2xl font-bold ${
                                  theme === "dark" ? "text-white" : "text-gray-900"
                                }`}>{activeSubscription.daysRemaining}</p>
                                <p className={`text-xs ${
                                  theme === "dark" ? "text-gray-400" : "text-gray-600"
                                }`}>days left</p>
                              </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="mb-4">
                              <div className={`flex justify-between text-xs mb-2 ${
                                theme === "dark" ? "text-gray-400" : "text-gray-600"
                              }`}>
                                <span>Started {new Date(activeSubscription.startDate).toLocaleDateString()}</span>
                                <span>Ends {new Date(activeSubscription.endDate).toLocaleDateString()}</span>
                              </div>
                              <div className={`relative h-3 rounded-full overflow-hidden ${
                                theme === "dark" ? "bg-gray-700/50" : "bg-gray-200"
                              }`}>
                                <div 
                                  className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${
                                    activeSubscription.autoRenew 
                                      ? 'from-green-500 to-emerald-500' 
                                      : 'from-yellow-500 to-orange-500'
                                  } shadow-lg`}
                                  style={{
                                    width: `${Math.max(5, (activeSubscription.daysRemaining / 30) * 100)}%`
                                  }}
                                >
                                  <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                                </div>
                              </div>
                            </div>

                            {/* Auto-Renewal Toggle */}
                            <div className={`flex items-center justify-between p-4 rounded-xl ${
                              theme === "dark" ? "bg-gray-800/50" : "bg-gray-100"
                            }`}>
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${
                                  activeSubscription.autoRenew 
                                    ? 'bg-green-500/20 text-green-400' 
                                    : 'bg-yellow-500/20 text-yellow-400'
                                }`}>
                                  <CreditCard size={20} />
                                </div>
                                <div>
                                  <p className={`font-medium ${
                                    theme === "dark" ? "text-white" : "text-gray-900"
                                  }`}>
                                    {activeSubscription.autoRenew ? 'Auto-Renewal On' : 'Manual Renewal'}
                                  </p>
                                  <p className={`text-xs ${
                                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                                  }`}>
                                    {activeSubscription.autoRenew 
                                      ? 'Renews automatically' 
                                      : 'Renew manually before expiry'
                                    }
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={handleToggleAutoRenew}
                                disabled={togglingAutoRenew}
                                className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                                  activeSubscription.autoRenew
                                    ? theme === "dark"
                                      ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                                      : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                                    : "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg shadow-green-500/25"
                                } ${togglingAutoRenew ? "opacity-50 cursor-not-allowed" : ""}`}
                              >
                                {togglingAutoRenew ? (
                                  <Spinner size={16} className="animate-spin" />
                                ) : (
                                  activeSubscription.autoRenew ? "Turn Off" : "Turn On"
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Refresh button */}
                          {quotaData && (
                            <button
                              onClick={fetchQuotaData}
                              disabled={quotaLoading}
                              className={`text-xs flex items-center gap-1 mb-2 ${
                                theme === "dark" ? "text-gray-400 hover:text-gray-300" : "text-gray-600 hover:text-gray-700"
                              } ${quotaLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              <ArrowRight size={12} className={quotaLoading ? "animate-spin" : ""} />
                              {quotaLoading ? "Refreshing..." : "Refresh usage"}
                            </button>
                          )}

                          {/* Request Usage */}
                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className={`p-5 rounded-2xl border backdrop-blur-sm ${
                              theme === "dark"
                                ? "bg-gradient-to-br from-orange-500/20 to-orange-500/10 border-orange-500/20"
                                : "bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200"
                            }`}>
                              <div className="flex items-center justify-between mb-3">
                                <FilmSlate size={24} className="text-orange-400" />
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                  theme === "dark"
                                    ? "bg-orange-500/20 text-orange-400"
                                    : "bg-orange-200 text-orange-700"
                                }`}>Movies</span>
                              </div>
                              {quotaLoading ? (
                                <div className="animate-pulse">
                                  <div className="h-8 bg-gray-700/50 rounded mb-2 w-16"></div>
                                  <div className="h-3 bg-gray-700/50 rounded w-24"></div>
                                </div>
                              ) : quotaData ? (
                                <>
                                  <p className={`text-3xl font-bold mb-1 ${
                                    theme === "dark" ? "text-white" : "text-gray-900"
                                  }`}>
                                    {quotaData.movieRemaining}
                                  </p>
                                  <p className={`text-xs ${
                                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                                  }`}>
                                    of {quotaData.movieLimit} available
                                  </p>
                                  {quotaData.movieDaysToReset > 0 && (
                                    <p className={`text-xs mt-1 ${
                                      theme === "dark" ? "text-gray-500" : "text-gray-500"
                                    }`}>
                                      Resets in {quotaData.movieDaysToReset} days
                                    </p>
                                  )}
                                </>
                              ) : (
                                <>
                                  <p className={`text-3xl font-bold mb-1 ${
                                    theme === "dark" ? "text-white" : "text-gray-900"
                                  }`}>
                                    {subscriptionPlans.find(p => p.id === currentPlan)?.features.movieRequests || 0}
                                  </p>
                                  <p className={`text-xs ${
                                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                                  }`}>
                                    Login to Jellyseerr to view usage
                                  </p>
                                </>
                              )}
                            </div>
                            
                            <div className={`p-5 rounded-2xl border backdrop-blur-sm ${
                              theme === "dark"
                                ? "bg-gradient-to-br from-teal-500/20 to-teal-500/10 border-teal-500/20"
                                : "bg-gradient-to-br from-teal-50 to-teal-100 border-teal-200"
                            }`}>
                              <div className="flex items-center justify-between mb-3">
                                <Television size={24} className="text-teal-400" />
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                  theme === "dark"
                                    ? "bg-teal-500/20 text-teal-400"
                                    : "bg-teal-200 text-teal-700"
                                }`}>TV Shows</span>
                              </div>
                              {quotaLoading ? (
                                <div className="animate-pulse">
                                  <div className="h-8 bg-gray-700/50 rounded mb-2 w-16"></div>
                                  <div className="h-3 bg-gray-700/50 rounded w-24"></div>
                                </div>
                              ) : quotaData ? (
                                <>
                                  <p className={`text-3xl font-bold mb-1 ${
                                    theme === "dark" ? "text-white" : "text-gray-900"
                                  }`}>
                                    {quotaData.tvRemaining}
                                  </p>
                                  <p className={`text-xs ${
                                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                                  }`}>
                                    of {quotaData.tvLimit} available
                                  </p>
                                  {quotaData.tvDaysToReset > 0 && (
                                    <p className={`text-xs mt-1 ${
                                      theme === "dark" ? "text-gray-500" : "text-gray-500"
                                    }`}>
                                      Resets in {quotaData.tvDaysToReset} days
                                    </p>
                                  )}
                                </>
                              ) : (
                                <>
                                  <p className={`text-3xl font-bold mb-1 ${
                                    theme === "dark" ? "text-white" : "text-gray-900"
                                  }`}>
                                    {subscriptionPlans.find(p => p.id === currentPlan)?.features.tvRequests || 0}
                                  </p>
                                  <p className={`text-xs ${
                                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                                  }`}>
                                    Login to Jellyseerr to view usage
                                  </p>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Booster Packs Button */}
                          {!isCancelled && (
                            <button
                              onClick={() => setShowBoosterPacks(!showBoosterPacks)}
                              className={`w-full py-4 rounded-2xl transition-all flex items-center justify-center gap-3 border backdrop-blur-sm group ${
                                theme === "dark"
                                  ? "bg-gradient-to-r from-purple-500/10 to-pink-500/10 hover:from-purple-500/20 hover:to-pink-500/20 border-purple-500/20"
                                  : "bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 border-purple-200"
                              }`}
                            >
                              <Lightning size={20} className={`group-hover:text-purple-300 ${
                                theme === "dark" ? "text-purple-400" : "text-purple-600"
                              }`} />
                              <span className={`font-medium ${
                                theme === "dark" ? "text-white" : "text-gray-900"
                              }`}>{showBoosterPacks ? "Hide" : "View"} Power-Ups</span>
                              <Sparkle size={16} className="text-yellow-400" />
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {/* Token Balance */}
                    <div className="flex-shrink-0">
                      <div className="relative">
                        <div className={`relative rounded-2xl p-6 border ${
                          theme === "dark"
                            ? "bg-gradient-to-br from-gray-800 to-gray-900 border-yellow-500/20"
                            : "bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200"
                        }`}>
                          <div className="flex items-center gap-2 mb-3">
                            <Coins size={20} className="text-yellow-400" />
                            <p className={`text-sm font-medium ${
                              theme === "dark" ? "text-yellow-400" : "text-yellow-700"
                            }`}>Token Balance</p>
                          </div>
                          <p className={`text-4xl font-bold mb-4 ${
                            theme === "dark" ? "text-white" : "text-gray-900"
                          }`}>{tokenBalance}</p>
                          <button
                            onClick={() => navigate("/store")}
                            className={`w-full py-2 px-4 rounded-xl transition-all flex items-center justify-center gap-2 group ${
                              theme === "dark"
                                ? "bg-gradient-to-r from-yellow-500/20 to-orange-500/20 hover:from-yellow-500/30 hover:to-orange-500/30 text-yellow-400"
                                : "bg-gradient-to-r from-yellow-100 to-orange-100 hover:from-yellow-200 hover:to-orange-200 text-yellow-700"
                            }`}
                          >
                            <span className="text-sm font-medium">Add Tokens</span>
                            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Booster Packs Section */}
            {showBoosterPacks && activeSubscription && !isCancelled && (
              <div className="mb-10">
                <div className="flex items-center justify-between mb-6">
                  <h2 className={`text-2xl font-bold flex items-center gap-3 ${
                    theme === "dark" ? "text-white" : "text-gray-900"
                  }`}>
                    <Lightning size={28} className="text-yellow-400" />
                    Power-Up Booster Packs
                  </h2>
                  <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                    Instant request upgrades
                  </p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {boosterPacks.map((booster) => (
                    <div
                      key={booster.id}
                      className={`relative overflow-hidden rounded-2xl backdrop-blur-xl border transition-all transform hover:scale-105 ${
                        theme === "dark"
                          ? "bg-gradient-to-br from-gray-800/80 to-gray-900/80 border-white/10 hover:border-white/20"
                          : "bg-white border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${booster.gradient} opacity-10`}></div>
                      <div className="relative p-6">
                        <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${booster.gradient} mb-4 shadow-lg`}>
                          {booster.icon}
                        </div>
                        <h3 className={`text-lg font-semibold mb-1 ${
                          theme === "dark" ? "text-white" : "text-gray-900"
                        }`}>{booster.name}</h3>
                        <p className={`text-sm mb-4 ${
                          theme === "dark" ? "text-gray-400" : "text-gray-600"
                        }`}>{booster.description}</p>
                        <div className="flex items-end justify-between">
                          <p className={`text-2xl font-bold ${
                            theme === "dark" ? "text-white" : "text-gray-900"
                          }`}>{booster.tokens} <span className={`text-sm ${
                            theme === "dark" ? "text-gray-400" : "text-gray-600"
                          }`}>tokens</span></p>
                          <button
                            onClick={() => handlePurchaseBooster(booster.id)}
                            disabled={purchasingBooster === booster.id || tokenBalance < booster.tokens}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              purchasingBooster === booster.id || tokenBalance < booster.tokens
                                ? theme === "dark"
                                  ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                : `bg-gradient-to-r ${booster.gradient} text-white hover:shadow-lg transform hover:scale-105`
                            }`}
                          >
                            {purchasingBooster === booster.id ? (
                              <Spinner size={14} className="animate-spin" />
                            ) : tokenBalance < booster.tokens ? (
                              "Not enough"
                            ) : (
                              "Buy Now"
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Subscription Plans */}
            {!isCancelled && (
              <div className="mb-10">
                <div className="text-center mb-8">
                  <h2 className={`text-3xl font-bold mb-3 ${
                    theme === "dark" ? "text-white" : "text-gray-900"
                  }`}>
                    {activeSubscription ? "Upgrade Your Experience" : "Choose Your Plan"}
                  </h2>
                  <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                    {activeSubscription ? "Switch to a better plan anytime" : "Start streaming thousands of titles"}
                  </p>
                </div>

                {/* Plans Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                  {subscriptionPlans.map((plan) => {
                    const currentPlanIndex = currentPlan ? subscriptionPlans.findIndex(p => p.id === currentPlan) : -1;
                    const thisPlanIndex = subscriptionPlans.findIndex(p => p.id === plan.id);
                    const isLowerTier = currentPlan && thisPlanIndex < currentPlanIndex;
                    const isCurrentPlan = currentPlan === plan.id;
                    const isSelectable = !isCurrentPlan && !isLowerTier;

                    return (
                      <div
                        key={plan.id}
                        className={`relative overflow-hidden rounded-2xl transition-all transform ${
                          isSelectable ? "hover:scale-105 cursor-pointer" : ""
                        } ${selectedPlan === plan.id ? "ring-2 ring-purple-500 ring-offset-2 ring-offset-gray-900" : ""}`}
                        onClick={() => {
                          if (isSelectable) {
                            setSelectedPlan(plan.id);
                          }
                        }}
                      >
                        {/* Background */}
                        <div className={`absolute inset-0 bg-gradient-to-br ${plan.gradient} ${
                          isLowerTier ? "opacity-5" : "opacity-10"
                        }`}></div>
                        
                        {/* Content */}
                        <div className={`relative p-6 backdrop-blur-xl border ${
                          isLowerTier 
                            ? theme === "dark"
                              ? "opacity-50 bg-gray-800/80 border-gray-700"
                              : "opacity-50 bg-gray-100 border-gray-300"
                            : theme === "dark"
                              ? "bg-gray-800/80 border-white/10 hover:border-white/20"
                              : "bg-white border-gray-200 hover:border-gray-300"
                        }`}>
                          {/* Badges - positioned inside the card */}
                          {plan.popular && !isCurrentPlan && (
                            <div className="absolute top-6 right-6 px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full text-xs font-medium text-white shadow-lg">
                              Popular
                            </div>
                          )}
                          {isCurrentPlan && (
                            <div className="absolute top-6 right-6 px-3 py-1 bg-green-500 rounded-full text-xs font-medium text-white shadow-lg flex items-center gap-1">
                              <Check size={12} weight="bold" />
                              Current
                            </div>
                          )}
                          {isLowerTier && (
                            <div className={`absolute top-6 right-6 px-3 py-1 rounded-full text-xs font-medium ${
                              theme === "dark"
                                ? "bg-gray-600 text-gray-300"
                                : "bg-gray-400 text-white"
                            }`}>
                              Lower Tier
                            </div>
                          )}
                          
                          {/* Plan Icon */}
                          <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${plan.gradient} mb-4 shadow-lg`}>
                            {plan.icon}
                          </div>
                          
                          {/* Plan Name */}
                          <h3 className={`text-xl font-bold mb-2 ${
                            theme === "dark" ? "text-white" : "text-gray-900"
                          }`}>{plan.name}</h3>
                          
                          {/* Price */}
                          <div className="mb-6">
                            <p className={`text-3xl font-bold ${
                              theme === "dark" ? "text-white" : "text-gray-900"
                            }`}>
                              {plan.monthlyTokens}
                            </p>
                            <p className={`text-sm ${
                              theme === "dark" ? "text-gray-400" : "text-gray-600"
                            }`}>
                              tokens/month
                            </p>
                          </div>
                          
                          {/* Features */}
                          <ul className="space-y-3 text-sm mb-6">
                            
                            <li className={`flex items-center gap-2 ${
                              theme === "dark" ? "text-gray-300" : "text-gray-700"
                            }`}>
                              <Sparkle size={16} className={theme === "dark" ? "text-gray-400" : "text-gray-500"} />
                              <span>1080p & 4K library access</span>
                            </li>

                            <li className={`flex items-center gap-2 ${
                              theme === "dark" ? "text-gray-300" : "text-gray-700"
                            }`}>
                              <Monitor size={16} className={theme === "dark" ? "text-gray-400" : "text-gray-500"} />
                              <span>{plan.features.streams} simultaneous stream{plan.features.streams !== 1 ? "s" : ""}</span>
                            </li>
                            <li className={`flex items-center gap-2 ${
                              theme === "dark" ? "text-gray-300" : "text-gray-700"
                            }`}>
                              <CloudArrowDown size={16} className={theme === "dark" ? "text-gray-400" : "text-gray-500"} />
                              <span>Offline downloads</span>
                            </li>
                            <li className={`flex items-center gap-2 ${
                              theme === "dark" ? "text-gray-300" : "text-gray-700"
                            }`}>
                              <FilmSlate size={16} className={theme === "dark" ? "text-gray-400" : "text-gray-500"} />
                              <span>{plan.features.movieRequests} movie request{plan.features.movieRequests !== 1 ? "s" : ""}</span>
                            </li>
                            <li className={`flex items-center gap-2 ${
                              theme === "dark" ? "text-gray-300" : "text-gray-700"
                            }`}>
                              <Television size={16} className={theme === "dark" ? "text-gray-400" : "text-gray-500"} />
                              <span>{plan.features.tvRequests} TV request{plan.features.tvRequests !== 1 ? "s" : ""}</span>
                            </li>
                            {plan.features.support === "priority" ? (
                              <li className="flex items-center gap-2 text-yellow-400">
                                <Lightning size={16} weight="fill" />
                                <span className="font-medium">Priority support</span>
                              </li>
                            ) : (
                              <li className={`flex items-center gap-2 ${
                                theme === "dark" ? "text-gray-300" : "text-gray-700"
                              }`}>
                                <Headphones size={16} className={theme === "dark" ? "text-gray-400" : "text-gray-500"} />
                                <span>Standard support</span>
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Subscription Confirmation */}
            {selectedPlan && !isCancelled && (() => {
              const currentPlanIndex = currentPlan ? subscriptionPlans.findIndex(p => p.id === currentPlan) : -1;
              const selectedPlanIndex = subscriptionPlans.findIndex(p => p.id === selectedPlan);
              const isUpgrade = currentPlan && selectedPlanIndex > currentPlanIndex;
              const isNewSubscription = !currentPlan;
              
              if (!isNewSubscription && !isUpgrade) return null;
              
              return (
                <div className="max-w-2xl mx-auto">
                  <div className={`relative overflow-hidden rounded-3xl backdrop-blur-xl border p-8 ${
                    theme === "dark"
                      ? "bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-white/10"
                      : "bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200"
                  }`}>
                    <div className="relative">
                      <h3 className={`text-2xl font-bold mb-6 text-center ${
                        theme === "dark" ? "text-white" : "text-gray-900"
                      }`}>Confirm Your {isUpgrade ? "Upgrade" : "Subscription"}</h3>
                      
                      {/* Selected Plan Summary */}
                      <div className={`mb-6 p-4 rounded-2xl backdrop-blur-sm border ${
                        theme === "dark"
                          ? "bg-white/5 border-white/10"
                          : "bg-white border-gray-200"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-3 rounded-xl bg-gradient-to-br ${subscriptionPlans.find(p => p.id === selectedPlan)?.gradient} shadow-lg`}>
                              {subscriptionPlans.find(p => p.id === selectedPlan)?.icon}
                            </div>
                            <div>
                              <p className={`font-semibold ${
                                theme === "dark" ? "text-white" : "text-gray-900"
                              }`}>
                                {subscriptionPlans.find(p => p.id === selectedPlan)?.name} Plan
                              </p>
                              <p className={`text-sm ${
                                theme === "dark" ? "text-gray-400" : "text-gray-600"
                              }`}>Monthly billing</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-2xl font-bold ${
                              theme === "dark" ? "text-white" : "text-gray-900"
                            }`}>{finalCost}</p>
                            <p className={`text-sm ${
                              theme === "dark" ? "text-gray-400" : "text-gray-600"
                            }`}>tokens</p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Pro-rate Credit */}
                      {proRateCredit > 0 && isUpgrade && (
                        <div className="mb-6 p-4 bg-green-500/10 rounded-2xl border border-green-500/20">
                          <div className="flex items-center gap-3">
                            <Gift size={24} className="text-green-400" />
                            <div>
                              <p className="font-medium text-green-400">Pro-rate Credit Applied</p>
                              <p className={`text-sm ${
                                theme === "dark" ? "text-gray-300" : "text-gray-700"
                              }`}>
                                {proRateCredit} tokens credited from your current plan
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Auto-Renew Toggle for New Subscriptions */}
                      {!activeSubscription && (
                        <div className={`mb-6 p-4 rounded-2xl backdrop-blur-sm border ${
                          theme === "dark"
                            ? "bg-white/5 border-white/10"
                            : "bg-white border-gray-200"
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${
                                theme === "dark"
                                  ? "bg-purple-500/20 text-purple-400"
                                  : "bg-purple-100 text-purple-600"
                              }`}>
                                <CreditCard size={20} />
                              </div>
                              <div>
                                <p className={`font-medium ${
                                  theme === "dark" ? "text-white" : "text-gray-900"
                                }`}>Auto-Renewal</p>
                                <p className={`text-sm ${
                                  theme === "dark" ? "text-gray-400" : "text-gray-600"
                                }`}>
                                  {autoRenewEnabled ? "Renews automatically" : "Manual renewal required"}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => setAutoRenewEnabled(!autoRenewEnabled)}
                              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                                autoRenewEnabled ? 'bg-purple-500' : theme === "dark" ? 'bg-gray-600' : 'bg-gray-300'
                              }`}
                            >
                              <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-lg ${
                                  autoRenewEnabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* Balance Check */}
                      {tokenBalance < finalCost && (
                        <div className="mb-6 p-4 bg-red-500/10 rounded-2xl border border-red-500/20">
                          <p className="text-red-400 text-center">
                            You need {finalCost - tokenBalance} more tokens to complete this {isUpgrade ? "upgrade" : "subscription"}
                          </p>
                        </div>
                      )}
                      
                      {/* Action Buttons */}
                      <div className="flex gap-4">
                        <button
                          onClick={() => setSelectedPlan(null)}
                          className={`flex-1 py-3 px-6 rounded-xl font-medium transition-all ${
                            theme === "dark"
                              ? "bg-gray-700 hover:bg-gray-600 text-white"
                              : "bg-gray-200 hover:bg-gray-300 text-gray-900"
                          }`}
                        >
                          Cancel
                        </button>
                        {tokenBalance < finalCost ? (
                          <button
                            onClick={() => navigate("/store")}
                            className="flex-1 py-3 px-6 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-medium transition-all shadow-lg shadow-purple-500/25"
                          >
                            Get Tokens
                          </button>
                        ) : (
                          <button
                            onClick={handleRedeemSubscription}
                            disabled={redeeming}
                            className={`flex-1 py-3 px-6 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-medium transition-all shadow-lg shadow-purple-500/25 ${
                              redeeming ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                          >
                            {redeeming ? (
                              <Spinner size={20} className="animate-spin mx-auto" />
                            ) : isUpgrade ? (
                              "Confirm Upgrade"
                            ) : (
                              "Start Subscription"
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
};

export default MediaDashboard;