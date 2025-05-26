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
    </div>
  );
};

export default MediaDashboard;