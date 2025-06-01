// src/components/MediaDashboard.tsx - Complete updated component

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/auth-context";
import { Info, Spinner, Download, FilmSlate, Television, Users, Crown, Star, Check, X, Rocket, Lightning, Warning } from "phosphor-react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";

// Interfaces
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
  yearlyTokens: number;
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
}

const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "standard",
    name: "Standard",
    monthlyTokens: 60,
    yearlyTokens: 600,
    features: {
      streams: 1,
      downloads: true,
      movieRequests: 1,
      tvRequests: 1,
      support: "standard",
    },
    icon: <Download size={24} />,
    color: "green",
  },
  {
    id: "duo",
    name: "Duo",
    monthlyTokens: 80,
    yearlyTokens: 800,
    features: {
      streams: 2,
      downloads: true,
      movieRequests: 2,
      tvRequests: 1,
      support: "standard",
    },
    icon: <Users size={24} />,
    color: "purple",
    popular: true,
  },
  {
    id: "family",
    name: "Family",
    monthlyTokens: 120,
    yearlyTokens: 1200,
    features: {
      streams: 4,
      downloads: true,
      movieRequests: 4,
      tvRequests: 2,
      support: "standard",
    },
    icon: <Users size={24} />,
    color: "pink",
  },
  {
    id: "ultimate",
    name: "Ultimate",
    monthlyTokens: 250,
    yearlyTokens: 2500,
    features: {
      streams: 10,
      downloads: true,
      movieRequests: 10,
      tvRequests: 5,
      support: "priority",
    },
    icon: <Crown size={24} />,
    color: "yellow",
  },
];

const boosterPacks = [
  {
    id: "movie-booster-5",
    name: "Movie Pack +5",
    tokens: 50,
    description: "Add 5 movie requests this month",
    icon: <FilmSlate size={20} />,
    color: "orange",
    type: "movie",
    amount: 5,
  },
  {
    id: "tv-booster-3",
    name: "TV Pack +3",
    tokens: 60,
    description: "Add 3 TV show requests this month",
    icon: <Television size={20} />,
    color: "teal",
    type: "tv",
    amount: 3,
  },
  {
    id: "mega-booster",
    name: "Mega Booster",
    tokens: 150,
    description: "+10 movies & +5 TV shows this month",
    icon: <Rocket size={20} />,
    color: "purple",
    type: "both",
    movieAmount: 10,
    tvAmount: 5,
  },
  {
    id: "ultra-booster",
    name: "Ultra Pack",
    tokens: 300,
    description: "+20 movies & +10 TV shows this month",
    icon: <Lightning size={20} />,
    color: "yellow",
    type: "mega",
    movieAmount: 20,
    tvAmount: 10,
  },
];

const MediaDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isLinked, setIsLinked] = useState(false);
  const [username, setUsername] = useState<string>("Not set");
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [activeSubscription, setActiveSubscription] = useState<any>(null);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [redeeming, setRedeeming] = useState(false);
  const [showBoosterPacks, setShowBoosterPacks] = useState(false);
  const [purchasingBooster, setPurchasingBooster] = useState<string | null>(null);
  const [autoRenewEnabled, setAutoRenewEnabled] = useState(true);
  const [togglingAutoRenew, setTogglingAutoRenew] = useState(false);
  const functions = getFunctions();

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
        // Refresh subscription status
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
          if (embyService?.linked) {
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
        console.error("🔥 Error fetching Firestore data:", err);
        setError("Failed to fetch account data.");
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user, authLoading]);

  const calculateTokenCost = () => {
    if (!selectedPlan) return 0;
    const plan = subscriptionPlans.find((p) => p.id === selectedPlan);
    if (!plan) return 0;
    
    const baseTokens = billingPeriod === "monthly" ? plan.monthlyTokens : plan.yearlyTokens;
    return baseTokens;
  };

  const calculateProrate = () => {
    if (!currentPlan || !selectedPlan || !activeSubscription) return 0;
    
    const currentPlanData = subscriptionPlans.find(p => p.id === currentPlan);
    const newPlanData = subscriptionPlans.find(p => p.id === selectedPlan);
    
    if (!currentPlanData || !newPlanData) return 0;
    
    // Calculate remaining days
    const endDate = new Date(activeSubscription.endDate);
    const now = new Date();
    const totalDays = Math.ceil((endDate.getTime() - new Date(activeSubscription.startDate).getTime()) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const usedDays = totalDays - remainingDays;
    
    // Calculate prorated amount
    const currentPlanTokens = activeSubscription.billingPeriod === "monthly" ? currentPlanData.monthlyTokens : currentPlanData.yearlyTokens;
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
      
      // Apply pro-rate credit for upgrades
      if (currentPlan && selectedPlan !== currentPlan && proRateCredit > 0) {
        const currentPlanIndex = subscriptionPlans.findIndex(p => p.id === currentPlan);
        const newPlanIndex = subscriptionPlans.findIndex(p => p.id === selectedPlan);
        
        if (newPlanIndex > currentPlanIndex) {
          // Upgrade - apply credit
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
        billingPeriod,
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
        setAutoRenewEnabled(true); // Reset for next time
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
        // Refresh user data
        const userRef = doc(db, `users/${user.uid}`);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setTokenBalance(data.tokenBalance || 0);
        }

        // Refresh subscription status
        await checkSubscriptionStatus();
      }
    } catch (err: any) {
      setError(err.message || "Failed to purchase booster pack");
      console.error("Booster purchase error:", err);
    } finally {
      setPurchasingBooster(null);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="p-6 bg-gray-900 text-white rounded-lg text-center">
        <div className="text-left mb-6">
          <h1 className="text-3xl font-bold">Media Dashboard</h1>
          <p className="text-gray-400">Manage your media account preferences</p>
        </div>
        <div className="flex justify-center">
          <Spinner size={32} className="animate-spin text-white" />
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
    <div className="p-6 bg-gray-900 text-white rounded-lg">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Media Dashboard</h1>
        <p className="text-gray-400">Manage your media account and subscription</p>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {/* Account Status */}
      <div className="mb-6 p-4 bg-gray-800 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-lg font-semibold">
              <strong>Username:</strong> {username}
            </p>
            <p className="text-lg font-semibold">
              <strong>Status:</strong> {
                isCancelled ? (
                  <span className="text-yellow-400">Subscription Cancelled</span>
                ) : activeSubscription ? (
                  <span className="text-green-400">Active</span>
                ) : (
                  <span className="text-gray-400">Inactive</span>
                )
              }
            </p>
            {currentPlan && (
              <p className="text-lg font-semibold">
                <strong>Current Plan:</strong> {subscriptionPlans.find(p => p.id === currentPlan)?.name || currentPlan}
                {isCancelled && <span className="text-yellow-400 text-sm ml-2">(Ending {new Date(activeSubscription.endDate).toLocaleDateString()})</span>}
              </p>
            )}

            {activeSubscription && (
              <>
                <p className="text-sm text-gray-400 mt-2">
                  {activeSubscription.daysRemaining} days remaining • {isCancelled ? "Access ends" : "Expires"} {new Date(activeSubscription.endDate).toLocaleDateString()}
                </p>
                
                {/* Auto-Renew / Cancel Section */}
                <div className="mt-3 p-3 bg-gray-700 rounded-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white flex items-center gap-2">
                        {activeSubscription.autoRenew ? (
                          <>
                            <Check size={16} className="text-green-400" />
                            Auto-Renewal Active
                          </>
                        ) : (
                          <>
                            <X size={16} className="text-yellow-400" />
                            Subscription Ending
                          </>
                        )}
                      </p>
                      <p className="text-sm text-gray-400">
                        {activeSubscription.autoRenew 
                          ? `Renews on ${new Date(activeSubscription.endDate).toLocaleDateString()}`
                          : `Access until ${new Date(activeSubscription.endDate).toLocaleDateString()}`
                        }
                      </p>
                    </div>
                    <button
                      onClick={handleToggleAutoRenew}
                      disabled={togglingAutoRenew}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                        activeSubscription.autoRenew
                          ? "bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30"
                          : "bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-600/30"
                      } ${togglingAutoRenew ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {togglingAutoRenew ? (
                        <Spinner size={16} className="animate-spin" />
                      ) : activeSubscription.autoRenew ? (
                        "Cancel"
                      ) : (
                        "Resume"
                      )}
                    </button>
                  </div>
                </div>

                {/* Show warning when cancelled */}
                {!activeSubscription.autoRenew && (
                  <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-md">
                    <p className="text-sm text-yellow-400 flex items-start gap-2">
                      <Warning size={16} className="mt-0.5 flex-shrink-0" />
                      <span>
                        Your subscription has been cancelled. You'll have access until {new Date(activeSubscription.endDate).toLocaleDateString()}, 
                        after which your media access will be disabled. You can resume your subscription anytime before it expires.
                      </span>
                    </p>
                  </div>
                )}
                
                {/* Request Usage */}
                {currentPlan && currentPlan !== "basic" && (
                  <div className="mt-3 flex gap-4">
                    <div className="flex items-center gap-2">
                      <FilmSlate size={16} className="text-orange-400" />
                      <span className="text-sm">
                        Movies: {activeSubscription.movieRequestsUsed || 0}/{subscriptionPlans.find(p => p.id === currentPlan)?.features.movieRequests || 0}
                      </span>
                    </div>
                    {(subscriptionPlans.find(p => p.id === currentPlan)?.features.tvRequests || 0) > 0 && (
                      <div className="flex items-center gap-2">
                        <Television size={16} className="text-teal-400" />
                        <span className="text-sm">
                          TV: {activeSubscription.tvRequestsUsed || 0}/{subscriptionPlans.find(p => p.id === currentPlan)?.features.tvRequests || 0}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Booster Packs Button - Hide when cancelled */}
                {currentPlan && !isCancelled && (
                  <button
                    onClick={() => setShowBoosterPacks(!showBoosterPacks)}
                    className="mt-3 text-sm bg-gradient-to-r from-orange-500 to-red-500 px-3 py-1 rounded-md hover:opacity-90 transition flex items-center gap-2"
                  >
                    <Lightning size={16} />
                    {showBoosterPacks ? "Hide" : "Show"} Booster Packs
                  </button>
                )}
              </>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-yellow-400">{tokenBalance} tokens</p>
            <button
              onClick={() => navigate("/store")}
              className="mt-2 text-sm text-purple-400 hover:text-purple-300 underline"
            >
              Get more tokens
            </button>
          </div>
        </div>
      </div>

      {!isLinked ? (
        <div className="p-4 bg-gray-800 text-white rounded-lg flex flex-col items-center shadow-md">
          <div className="flex items-center mb-4">
            <Info size={24} className="mr-2 text-blue-400" />
            <h3 className="text-2xl font-bold text-white">Media Account Not Linked</h3>
          </div>
          <p className="mb-4 text-white text-center">
            Your media account is not yet linked. Please complete the setup process via the{" "}
            <a href="/auth" className="text-white hover:underline">
              authentication page
            </a>{" "}
            to link your account.
          </p>
        </div>
      ) : (
        <>
          {/* Booster Packs Section - Hide when cancelled */}
          {showBoosterPacks && activeSubscription && !isCancelled && (
            <div className="mb-6 p-4 bg-gray-800 rounded-lg">
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <Lightning size={24} className="mr-2 text-yellow-400" />
                Power-Up Booster Packs
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                Need more requests this month? Get instant access with booster packs!
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {boosterPacks.map((booster) => (
                  <div
                    key={booster.id}
                    className={`p-4 border-2 rounded-lg border-gray-700 hover:border-${booster.color}-500 transition`}
                  >
                    <div className={`flex items-center mb-2 text-${booster.color}-400`}>
                      {booster.icon}
                      <h4 className="text-lg font-semibold ml-2">{booster.name}</h4>
                    </div>
                    <p className="text-sm text-gray-300 mb-3">{booster.description}</p>
                    <div className="flex justify-between items-center">
                      <p className="text-xl font-bold text-yellow-400">{booster.tokens} tokens</p>
                      <button
                        onClick={() => handlePurchaseBooster(booster.id)}
                        disabled={purchasingBooster === booster.id || tokenBalance < booster.tokens}
                        className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
                          purchasingBooster === booster.id || tokenBalance < booster.tokens
                            ? "bg-gray-600 cursor-not-allowed opacity-50"
                            : `bg-gradient-to-r from-${booster.color}-500 to-${booster.color}-600 hover:opacity-90`
                        } text-white`}
                      >
                        {purchasingBooster === booster.id ? (
                          <Spinner size={16} className="animate-spin" />
                        ) : tokenBalance < booster.tokens ? (
                          "Not enough tokens"
                        ) : (
                          "Buy Now"
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subscription Plans - Hide when cancelled */}
          {!isCancelled && (
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-4">
                {activeSubscription ? "Upgrade Your Plan" : "Choose Your Plan"}
              </h2>
              
              {/* Billing Period Toggle */}
              <div className="flex justify-center mb-6">
                <div className="bg-gray-800 rounded-lg p-1 flex">
                  <button
                    onClick={() => setBillingPeriod("monthly")}
                    className={`px-4 py-2 rounded-md transition ${
                      billingPeriod === "monthly"
                        ? "bg-purple-500 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingPeriod("yearly")}
                    className={`px-4 py-2 rounded-md transition ${
                      billingPeriod === "yearly"
                        ? "bg-purple-500 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Yearly (Save up to 20%)
                  </button>
                </div>
              </div>

              {/* Plans Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {subscriptionPlans.map((plan) => {
                  // Determine if this plan is selectable
                  const currentPlanIndex = currentPlan ? subscriptionPlans.findIndex(p => p.id === currentPlan) : -1;
                  const thisPlanIndex = subscriptionPlans.findIndex(p => p.id === plan.id);
                  const isLowerTier = currentPlan && thisPlanIndex < currentPlanIndex;
                  const isCurrentPlan = currentPlan === plan.id;
                  const isSelectable = !isCurrentPlan && !isLowerTier;

                  return (
                    <div
                      key={plan.id}
                      className={`relative p-4 border-2 rounded-lg transition ${
                        selectedPlan === plan.id
                          ? `border-${plan.color}-500 bg-gray-800/50`
                          : isLowerTier
                          ? "border-gray-700 opacity-50 cursor-not-allowed"
                          : "border-gray-700 hover:border-gray-600 cursor-pointer"
                      } ${currentPlan === plan.id ? "ring-2 ring-green-500" : ""}`}
                      onClick={() => {
                        if (isSelectable && !isLowerTier) {
                          setSelectedPlan(plan.id);
                        }
                      }}
                    >
                      {plan.popular && (
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-purple-500 text-white px-3 py-1 rounded-full text-xs">
                          Most Popular
                        </div>
                      )}
                      {currentPlan === plan.id && (
                        <div className="absolute -top-3 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs">
                          Current Plan
                        </div>
                      )}
                      {isLowerTier && (
                        <div className="absolute -top-3 right-4 bg-gray-600 text-gray-300 px-3 py-1 rounded-full text-xs">
                          Lower Tier
                        </div>
                      )}
                      
                      <div className={`flex items-center mb-3 text-${plan.color}-400`}>
                        {plan.icon}
                        <h3 className="text-xl font-semibold ml-2">{plan.name}</h3>
                      </div>
                      
                      <p className="text-2xl font-bold mb-1">
                        {billingPeriod === "monthly" ? plan.monthlyTokens : plan.yearlyTokens} tokens
                      </p>
                      <p className="text-sm text-gray-400 mb-4">
                        per {billingPeriod === "monthly" ? "month" : "year"}
                        {billingPeriod === "yearly" && (
                          <span className="text-green-400 ml-1">
                            (save {plan.monthlyTokens * 12 - plan.yearlyTokens} tokens)
                          </span>
                        )}
                      </p>
                      
                      <ul className="text-sm space-y-2">
                        <li className="flex items-center">
                          <Check size={16} className="text-green-400 mr-2" />
                          Full library access
                        </li>
                        <li className="flex items-center">
                          <Check size={16} className="text-green-400 mr-2" />
                          {plan.features.streams} stream{plan.features.streams !== 1 ? "s" : ""}
                        </li>
                        <li className="flex items-center">
                          {plan.features.downloads ? (
                            <Check size={16} className="text-green-400 mr-2" />
                          ) : (
                            <X size={16} className="text-red-400 mr-2" />
                          )}
                          Downloads
                        </li>
                        <li className="flex items-center">
                          <FilmSlate size={16} className="mr-2 text-gray-400" />
                          {plan.features.movieRequests === 0
                            ? "No movie requests"
                            : `${plan.features.movieRequests} movie request${plan.features.movieRequests > 1 ? "s" : ""}/month`}
                        </li>
                        <li className="flex items-center">
                          <Television size={16} className="mr-2 text-gray-400" />
                          {plan.features.tvRequests === 0
                            ? "No TV requests"
                            : `${plan.features.tvRequests} TV show${plan.features.tvRequests > 1 ? "s" : ""}/month`}
                        </li>
                        <li className="flex items-center">
                          {plan.features.support === "priority" ? (
                            <Star size={16} className="text-yellow-400 mr-2" />
                          ) : (
                            <Info size={16} className="text-gray-400 mr-2" />
                          )}
                          {plan.features.support === "priority" ? "Priority" : "Regular"} support
                        </li>
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Redemption Section */}
          {selectedPlan && !isCancelled && (() => {
          const currentPlanIndex = currentPlan ? subscriptionPlans.findIndex(p => p.id === currentPlan) : -1;
          const selectedPlanIndex = subscriptionPlans.findIndex(p => p.id === selectedPlan);
          const isUpgrade = currentPlan && selectedPlanIndex > currentPlanIndex;
          const isNewSubscription = !currentPlan;
          
          // Only show completion panel for new subscriptions or upgrades
          if (!isNewSubscription && !isUpgrade) return null;
          
          return (
            <div className="mb-6 p-4 bg-gray-800 rounded-lg">
              <h3 className="text-xl font-semibold mb-4">Complete Your Subscription</h3>
              
              <div className="mb-4">
                <p className="text-gray-300 mb-2">Total Cost</p>
                <p className="text-2xl font-bold text-yellow-400">
                  {finalCost} tokens
                  {proRateCredit > 0 && currentPlan && selectedPlan !== currentPlan && (
                    <span className="text-sm text-green-400 ml-2">
                      (Pro-rate credit: {proRateCredit} tokens)
                    </span>
                  )}
                </p>
                {tokenBalance < finalCost && (
                  <p className="text-red-400 text-sm mt-1">
                    You need {finalCost - tokenBalance} more tokens
                  </p>
                )}
              </div>
              
              {/* Auto-Renew Toggle for NEW subscriptions */}
              {!activeSubscription && (
                <div className="mb-4 p-3 bg-gray-700 rounded-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">Auto-Renewal</p>
                      <p className="text-sm text-gray-400">
                        {autoRenewEnabled 
                          ? "Your subscription will automatically renew each period"
                          : "Your subscription will expire at the end of the billing period"
                        }
                      </p>
                    </div>
                    <button
                      onClick={() => setAutoRenewEnabled(!autoRenewEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        autoRenewEnabled ? 'bg-purple-500' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          autoRenewEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}
              
              {/* Show pro-rate info for plan changes */}
              {currentPlan && selectedPlan !== currentPlan && (
                <div className="mb-4 p-3 bg-gray-700 rounded-md">
                  <p className="text-sm text-gray-300">
                    <span className="text-green-400 font-semibold">Upgrade Benefits:</span> Immediate access to new features. 
                    Pro-rated credit of {proRateCredit} tokens applied from your current plan.
                  </p>
                </div>
              )}
              
              <div className="flex gap-4">
                <button
                  onClick={handleRedeemSubscription}
                  disabled={redeeming || tokenBalance < finalCost}
                  className={`flex-1 py-2 px-4 rounded-md font-semibold transition ${
                    redeeming || tokenBalance < finalCost
                      ? "bg-gray-600 cursor-not-allowed opacity-50"
                      : "bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
                  } text-white`}
                >
                  {redeeming ? (
                    <Spinner size={20} className="animate-spin mx-auto" />
                  ) : tokenBalance < finalCost ? (
                    "Insufficient Tokens"
                  ) : activeSubscription ? (
                    "Upgrade Now"
                  ) : (
                    "Subscribe Now"
                  )}
                </button>
                
                {tokenBalance < finalCost && (
                  <button
                    onClick={() => navigate("/store")}
                    className="py-2 px-4 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition"
                  >
                    Get Tokens
                  </button>
                )}
              </div>
            </div>
          );
        })()}
        </>
      )}
    </div>
  );
};

export default MediaDashboard;