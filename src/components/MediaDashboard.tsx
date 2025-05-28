import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/auth-context";
import { Info, Spinner, Monitor, Download, FilmSlate, Television, Users, Crown, Star, Check, X } from "phosphor-react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";

// Interfaces for the cloud function responses
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
  };
}

interface SubscriptionPlan {
  id: string;
  name: string;
  monthlyTokens: number;
  yearlyTokens: number;
  features: {
    streams: number | "unlimited";
    downloads: boolean;
    movieRequests: number | "unlimited";
    tvRequests: number | "unlimited";
    support: "standard" | "priority";
  };
  popular?: boolean;
  icon: React.ReactNode;
  color: string;
}

const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "basic",
    name: "Basic",
    monthlyTokens: 40,
    yearlyTokens: 400,
    features: {
      streams: 1,
      downloads: false,
      movieRequests: 0,
      tvRequests: 0,
      support: "standard",
    },
    icon: <Monitor size={24} />,
    color: "blue",
  },
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
    id: "vip",
    name: "VIP",
    monthlyTokens: 180,
    yearlyTokens: 1800,
    features: {
      streams: 5,
      downloads: true,
      movieRequests: 10,
      tvRequests: 5,
      support: "priority",
    },
    icon: <Crown size={24} />,
    color: "yellow",
  },
  {
    id: "ultimate",
    name: "Ultimate",
    monthlyTokens: 300,
    yearlyTokens: 3000,
    features: {
      streams: "unlimited",
      downloads: true,
      movieRequests: "unlimited",
      tvRequests: "unlimited",
      support: "priority",
    },
    icon: <Star size={24} />,
    color: "red",
  },
];

const MediaDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isLinked, setIsLinked] = useState(false);
  const [username, setUsername] = useState<string>("Not set");
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("Inactive");
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [activeSubscription, setActiveSubscription] = useState<any>(null);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [duration, setDuration] = useState<number>(1);
  const [redeeming, setRedeeming] = useState(false);
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
        setSubscriptionStatus("active");
      } else {
        setActiveSubscription(null);
        setCurrentPlan(null);
        setSubscriptionStatus("inactive");
      }
    } catch (err) {
      console.error("Error checking subscription status:", err);
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
            // Check subscription status via cloud function
            await checkSubscriptionStatus();
          } else {
            setIsLinked(false);
            setUsername(user.displayName || "Not set");
            setSubscriptionStatus("Inactive");
          }
        } else {
          setIsLinked(false);
          setUsername(user.displayName || "Not set");
          setSubscriptionStatus("Inactive");
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

  const handleActivate = async () => {
    if (!user) return;
    setActivating(activating);
    setError(null);

    try {
      const activateEmbyAccount = httpsCallable(functions, "activateEmbyAccount");
      const result = await activateEmbyAccount();
      const data = result.data as { success: boolean; message: string };
      if (data.success) {
        setSubscriptionStatus("active");
        console.log(data.message);
      }
    } catch (err: any) {
      setError("Failed to activate account: " + (err.message || "Unknown error"));
      console.error("Activation error:", err);
    } finally {
      setActivating(false);
    }
  };

  const calculateTokenCost = () => {
    if (!selectedPlan) return 0;
    const plan = subscriptionPlans.find((p) => p.id === selectedPlan);
    if (!plan) return 0;
    
    const baseTokens = billingPeriod === "monthly" ? plan.monthlyTokens : plan.yearlyTokens;
    const multiplier = billingPeriod === "monthly" ? duration : duration;
    return baseTokens * multiplier;
  };

  const handleRedeemSubscription = async () => {
    if (!selectedPlan || !user) return;
    
    setRedeeming(true);
    setError(null);

    try {
      const tokenCost = calculateTokenCost();
      
      if (tokenBalance < tokenCost) {
        throw new Error("Insufficient tokens for this subscription");
      }

      // Process subscription via cloud function
      const processSubscription = httpsCallable<any, ProcessSubscriptionResponse>(
        functions, 
        "processSubscription"
      );
      
      const result = await processSubscription({
        userId: user.uid,
        planId: selectedPlan,
        billingPeriod,
        duration,
      });

      if (result.data.success) {
        // Refresh user data
        const userRef = doc(db, `users/${user.uid}`);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setTokenBalance(data.tokenBalance || 0);
        }

        // Check subscription status again
        await checkSubscriptionStatus();
        
        setSelectedPlan(null);
        setDuration(1);
        
        // Activate the account if not already active
        if (subscriptionStatus !== "active") {
          await handleActivate();
        }
      }
      
    } catch (err: any) {
      setError(err.message || "Failed to redeem subscription");
      console.error("Redemption error:", err);
    } finally {
      setRedeeming(false);
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
              <strong>Status:</strong> {subscriptionStatus}
            </p>
            {currentPlan && (
              <p className="text-lg font-semibold">
                <strong>Current Plan:</strong> {subscriptionPlans.find(p => p.id === currentPlan)?.name || currentPlan}
              </p>
            )}
            {activeSubscription && (
              <p className="text-sm text-gray-400 mt-2">
                {activeSubscription.daysRemaining} days remaining • Expires {new Date(activeSubscription.endDate).toLocaleDateString()}
              </p>
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
          {/* Subscription Plans */}
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
              {subscriptionPlans.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative p-4 border-2 rounded-lg cursor-pointer transition ${
                    selectedPlan === plan.id
                      ? `border-${plan.color}-500 bg-gray-800/50`
                      : "border-gray-700 hover:border-gray-600"
                  } ${currentPlan === plan.id ? "ring-2 ring-green-500" : ""}`}
                  onClick={() => setSelectedPlan(plan.id)}
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
                      {plan.features.streams === "unlimited" ? "Unlimited" : plan.features.streams} stream{plan.features.streams !== 1 ? "s" : ""}
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
                        : plan.features.movieRequests === "unlimited"
                        ? "Unlimited movie requests"
                        : billingPeriod === "monthly"
                        ? `${plan.features.movieRequests} movie request${plan.features.movieRequests > 1 ? "s" : ""}/month`
                        : `${plan.features.movieRequests * 12} movie requests/year`}
                    </li>
                    <li className="flex items-center">
                      <Television size={16} className="mr-2 text-gray-400" />
                      {plan.features.tvRequests === 0
                        ? "No TV requests"
                        : plan.features.tvRequests === "unlimited"
                        ? "Unlimited TV requests"
                        : billingPeriod === "monthly"
                        ? `${plan.features.tvRequests} TV show${plan.features.tvRequests > 1 ? "s" : ""}/month`
                        : `${plan.features.tvRequests * 12} TV shows/year`}
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
              ))}
            </div>
          </div>

          {/* Redemption Section */}
          {selectedPlan && (
            <div className="mb-6 p-4 bg-gray-800 rounded-lg">
              <h3 className="text-xl font-semibold mb-4">Complete Your Subscription</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block mb-2 text-gray-300">Duration</label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value))}
                    className="w-full px-4 py-2 border rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  >
                    {billingPeriod === "monthly" ? (
                      <>
                        <option value={1}>1 month</option>
                        <option value={3}>3 months</option>
                        <option value={6}>6 months</option>
                        <option value={12}>12 months</option>
                      </>
                    ) : (
                      <>
                        <option value={1}>1 year</option>
                        <option value={2}>2 years</option>
                        <option value={3}>3 years</option>
                      </>
                    )}
                  </select>
                </div>
                
                <div className="flex items-end">
                  <div className="w-full">
                    <p className="text-gray-300 mb-2">Total Cost</p>
                    <p className="text-2xl font-bold text-yellow-400">{tokenCost} tokens</p>
                    {tokenBalance < tokenCost && (
                      <p className="text-red-400 text-sm mt-1">
                        You need {tokenCost - tokenBalance} more tokens
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex gap-4">
                <button
                  onClick={handleRedeemSubscription}
                  disabled={redeeming || tokenBalance < tokenCost || (activeSubscription && selectedPlan === currentPlan)}
                  className={`flex-1 py-2 px-4 rounded-md font-semibold transition ${
                    redeeming || tokenBalance < tokenCost || (activeSubscription && selectedPlan === currentPlan)
                      ? "bg-gray-600 cursor-not-allowed opacity-50"
                      : "bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
                  } text-white`}
                >
                  {redeeming ? (
                    <Spinner size={20} className="animate-spin mx-auto" />
                  ) : tokenBalance < tokenCost ? (
                    "Insufficient Tokens"
                  ) : activeSubscription && selectedPlan === currentPlan ? (
                    "Already Subscribed"
                  ) : activeSubscription ? (
                    "Upgrade Plan"
                  ) : (
                    "Subscribe Now"
                  )}
                </button>
                
                {tokenBalance < tokenCost && (
                  <button
                    onClick={() => navigate("/store")}
                    className="py-2 px-4 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition"
                  >
                    Get Tokens
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MediaDashboard;