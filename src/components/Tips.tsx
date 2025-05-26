import { useState, useEffect } from "react";
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { Spinner } from "phosphor-react";
import { useTheme } from "../context/theme-context";
import { useAuth } from "../context/auth-context";
import { getFunctions, httpsCallable } from "firebase/functions";

const Tips = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [{ isPending, isRejected, isInitial, isResolved }] = usePayPalScriptReducer();
  const [loading, setLoading] = useState<boolean>(false);
  const [transactionStatus, setTransactionStatus] = useState<"completed" | "error" | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [orderAmount, setOrderAmount] = useState<string>(""); // Store the amount for consistency
  const [isPaypalReady, setIsPaypalReady] = useState<boolean>(false); // Control PayPalButtons rendering
  const functions = getFunctions();

  // Auto-hide transaction status message after 5 seconds for better visibility
  useEffect(() => {
    if (transactionStatus) {
      const timer = setTimeout(() => {
        setTransactionStatus(null);
        setStatusMessage("");
        setIsPaypalReady(false); // Reset PayPal readiness after transaction
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [transactionStatus]);

  // Log PayPal script state for debugging
  useEffect(() => {
    console.log("[Tips] PayPal SDK State:", {
      isInitial,
      isPending,
      isResolved,
      isRejected,
      clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID,
      themeApplied: theme,
    });
  }, [isInitial, isPending, isResolved, isRejected, theme]);

  const validateInput = () => {
    console.log("[Tips] Validating input:", { amount, user });
    if (!user) {
      setTransactionStatus("error");
      setStatusMessage("You must be logged in to tip.");
      return false;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setTransactionStatus("error");
      setStatusMessage("Please enter a valid tip amount.");
      return false;
    }
    if (parseFloat(amount) < 1.0) {
      setTransactionStatus("error");
      setStatusMessage("Minimum tip amount is $1.00.");
      return false;
    }
    return true;
  };

  const handlePaypalClick = () => {
    if (validateInput()) {
      setIsPaypalReady(true); // Show PayPalButtons to trigger the popup
    }
  };

  const handleCreateOrder = async (_data: any, _actions: any) => {
    console.log("[Tips] handleCreateOrder called", { amount, user });
    // Validation already handled before opening the popup
    if (!user) {
      throw new Error("User not authenticated");
    }

    try {
      const formattedAmount = parseFloat(amount).toFixed(2);
      setOrderAmount(formattedAmount); // Store the formatted amount
      const createTipOrder = httpsCallable(functions, "createTipOrder");
      const sessionId = `${user.uid}-${Date.now()}`;
      const result = await createTipOrder({
        userId: user.uid,
        sessionId,
        amount: formattedAmount,
        currency: "USD",
      });
      const { orderId } = result.data as { orderId: string };
      console.log("[Tips] Created tip order:", orderId);
      localStorage.setItem("sessionId", sessionId);
      return orderId;
    } catch (err: any) {
      console.error("[Tips] Create Order Error:", err);
      setTransactionStatus("error");
      setStatusMessage("Failed to create tip order. Please try again.");
      setIsPaypalReady(false); // Reset PayPal readiness on error
      throw err;
    }
  };

  const handleOnApprove = async (_data: any, actions: any) => {
    console.log("[Tips] handleOnApprove called, actions:", actions);
    if (!user) {
      setTransactionStatus("error");
      setStatusMessage("User not authenticated.");
      return;
    }
    try {
      if (!actions.order) {
        throw new Error("PayPal actions.order is not available");
      }
      setLoading(true); // Start loading right before capture
      const order = await actions.order.capture();
      const sessionId = localStorage.getItem("sessionId");
      if (!sessionId) {
        throw new Error("Session ID missing");
      }
      const processTip = httpsCallable(functions, "processTip");
      await processTip({
        userId: user.uid,
        orderId: order.id,
        sessionId,
        amount: orderAmount, // Use the stored orderAmount to ensure consistency
        currency: "USD",
      });
      console.log("[Tips] Tip successfully captured:", order);
      setTransactionStatus("completed");
      setStatusMessage("Thank you for your support!");
      setAmount("");
      setOrderAmount(""); // Reset orderAmount
      localStorage.removeItem("sessionId");
      window.close();
    } catch (err: any) {
      setTransactionStatus("error");
      setStatusMessage("Failed to process tip. Please try again.");
      console.error("[Tips] Capture Error:", err);
    } finally {
      setLoading(false); // Stop loading after everything is done
    }
  };

  const handleOnError = (err: any) => {
    setTransactionStatus("error");
    setStatusMessage("Failed to process tip. Please check your connection or try again.");
    console.error("[Tips] PayPal Error:", err);
    setLoading(false);
    setIsPaypalReady(false); // Reset PayPal readiness on error
    localStorage.removeItem("sessionId");
  };

  if (isInitial || isPending) {
    return <div className="text-center mt-5">Loading PayPal SDK...</div>;
  }

  if (isRejected) {
    return <div className="text-center mt-5">Error loading PayPal SDK. Please refresh the page.</div>;
  }

  return (
    <div
      className={`flex flex-col items-center justify-center min-h-screen p-6 ${
        theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900"
      } relative`}
    >
      {loading && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 z-50">
          <div className="flex flex-col items-center">
            <Spinner size={40} className="animate-spin text-white" />
            <p className="mt-2 text-white text-lg font-semibold">Processing your tip...</p>
          </div>
        </div>
      )}
      <div className={`w-full max-w-md relative ${loading ? "opacity-50 pointer-events-none" : ""}`}>
        {transactionStatus && (
          <div
            className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 p-4 w-4/5 max-w-md text-center rounded-lg shadow-lg z-10 transition-all duration-300 ease-in-out opacity-100 ${
              transactionStatus === "completed"
                ? theme === "dark"
                  ? "bg-green-700 text-white border border-green-500"
                  : "bg-green-100 text-green-800 border border-green-300"
                : theme === "dark"
                ? "bg-red-700 text-white border border-red-500"
                : "bg-red-100 text-red-800 border border-red-300"
            }`}
          >
            {statusMessage}
          </div>
        )}
        <h1 className="text-3xl font-bold mb-6 text-center">Support Gondola Bros</h1>
        <p className={`text-center mb-6 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
          If you enjoy our services, consider leaving a tip! Every little bit helps us keep the servers running.
        </p>

        <div className="mb-6 p-4 bg-[#1c1c1c] rounded-md shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-center text-white">Tip Jar</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-gray-300 mb-1">Tip Amount (USD)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "" || parseFloat(value) >= 0) {
                    setAmount(value);
                    setTransactionStatus(null); // Clear error when user starts typing
                    setStatusMessage("");
                    setIsPaypalReady(false); // Reset PayPal readiness when amount changes
                  }
                }}
                placeholder="Enter amount (e.g., 5.00)"
                className="w-full px-4 py-2 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-0 focus:outline-none focus:border-gray-500"
                min="1"
                step="1"
                disabled={loading} // Disable input during loading
              />
            </div>
            {isResolved && !isPaypalReady && (
              <button
                onClick={handlePaypalClick}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200"
              >
                Confirm amount
              </button>
            )}
            {isResolved && isPaypalReady && (
              <PayPalButtons
                style={{
                  shape: "rect",
                  color: "blue",
                  layout: "vertical",
                  label: "pay",
                }}
                createOrder={handleCreateOrder}
                onApprove={handleOnApprove}
                onError={handleOnError}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tips;