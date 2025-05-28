import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/auth-context";
import { Info, Spinner } from "phosphor-react";
import { getFunctions, httpsCallable } from "firebase/functions";

const MediaDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const [isLinked, setIsLinked] = useState(false);
  const [username, setUsername] = useState<string>("Not set");
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("Inactive");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); // New state to handle data fetching
  const [activating, setActivating] = useState(false); // New state for activation loading
  const functions = getFunctions();

  useEffect(() => {
    if (!user || authLoading) return;

    console.log("User authenticated in MediaDashboard:", {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
    });

    const fetchUserData = async () => {
      try {
        setLoading(true);
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          const embyService = data.services?.emby;
          if (embyService?.linked) {
            setIsLinked(true);
            setUsername(user.displayName || "Not set");
            setSubscriptionStatus(embyService.subscriptionStatus || "Inactive");
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
    setActivating(true);
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

  // Show a loading state while fetching data
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

  return (
    <div className="p-6 bg-gray-900 text-white rounded-lg text-center">
      <div className="text-left mb-6">
        <h1 className="text-3xl font-bold">Media Dashboard</h1>
        <p className="text-gray-400">Manage your media account preferences</p>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {isLinked ? (
        <div className="p-4 bg-gray-800 text-white rounded-lg shadow-md">
          <p className="mb-2 text-lg font-semibold">
            <strong>Username:</strong> {username}
          </p>
          <p className="text-lg font-semibold">
            <strong>Subscription Status:</strong> {subscriptionStatus}
          </p>
          <button
            onClick={handleActivate}
            className={`mt-4 px-4 py-2 rounded-md text-white ${
              subscriptionStatus === "active" || activating
                ? "bg-gray-500 opacity-50 cursor-not-allowed"
                : "bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
            }`}
            disabled={subscriptionStatus === "active" || activating}
          >
            {activating ? <Spinner size={20} className="animate-spin mx-auto" /> : "Activate Account"}
          </button>
        </div>
      ) : (
        <div className="p-4 bg-gray-800 text-white rounded-lg mx-auto flex flex-col items-center shadow-md max-w-md w-full">
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
      )}

      {/* Subscription Plans Information */}
      {isLinked && (
        <div className="mt-8 p-6 bg-gray-800 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">Subscription Plans</h2>
          <p className="text-gray-300 mb-6">
            Upgrade your plan to unlock more features. All plans include full access to our media library.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Basic Plan */}
            <div className="p-4 border border-gray-600 rounded-lg">
              <h3 className="text-xl font-semibold text-blue-400 mb-2">Basic</h3>
              <p className="text-2xl font-bold mb-2">60 tokens/month</p>
              <p className="text-sm text-gray-400 mb-4">600 tokens/year (save 120 tokens)</p>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Full media library access</li>
                <li>• 2 simultaneous streams</li>
                <li>• Standard support</li>
              </ul>
            </div>

            {/* Standard Plan */}
            <div className="p-4 border-2 border-purple-500 rounded-lg relative">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-purple-500 text-white px-3 py-1 rounded-full text-xs">
                Most Popular
              </div>
              <h3 className="text-xl font-semibold text-purple-400 mb-2">Standard</h3>
              <p className="text-2xl font-bold mb-2">120 tokens/month</p>
              <p className="text-sm text-gray-400 mb-4">1200 tokens/year (save 240 tokens)</p>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Full media library access</li>
                <li>• 4 simultaneous streams</li>
                <li>• Priority support</li>
                <li>• Request priority</li>
              </ul>
            </div>

            {/* Premium Plan */}
            <div className="p-4 border border-gray-600 rounded-lg">
              <h3 className="text-xl font-semibold text-pink-400 mb-2">Premium</h3>
              <p className="text-2xl font-bold mb-2">180 tokens/month</p>
              <p className="text-sm text-gray-400 mb-4">1800 tokens/year (save 360 tokens)</p>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Full media library access</li>
                <li>• 6 simultaneous streams</li>
                <li>• Premium support</li>
                <li>• Highest request priority</li>
                <li>• Early access features</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Visit the <a href="/store" className="text-purple-400 hover:text-purple-300 underline">Store</a> to purchase tokens and subscribe to a plan.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaDashboard;