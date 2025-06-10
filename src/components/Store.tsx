import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/auth-context";
import { useTheme } from "../context/theme-context";
import { db, functions } from "../config/firebase";
import { doc, getDoc, collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { Spinner, Coin, CurrencyDollar, Handshake, Gift, Trophy, ArrowRight, Lightning, Star, Plus, Sparkle, Clock, CheckCircle, Copy } from "phosphor-react";
import { debounce } from "lodash";
import { v4 as uuidv4 } from "uuid";
import { useNavigate } from "react-router-dom";
import Pagination from "./Pagination";

// Define the return type of the processTokenPurchase Cloud Function
interface ProcessTokenPurchaseResponse {
  success: boolean;
  orderId: string;
}

// Define the return type of the createPaypalOrder Cloud Function
interface CreatePaypalOrderResponse {
  orderId: string;
}

// Define the return type of the processTokenTrade Cloud Function
interface ProcessTokenTradeResponse {
  success: boolean;
}

// Define the return type of the checkUsername Cloud Function
interface CheckUsernameResponse {
  available: boolean;
}

// Define the shape of the order object for createOrder
interface PayPalOrder {
  create: (orderData: {
    intent: "CAPTURE" | "AUTHORIZE";
    purchase_units: Array<{
      amount: { value: string; currency_code: string };
      description?: string;
      custom_id?: string;
    }>;
  }) => Promise<string>;
}

// Define the shape of the actions object for createOrder
interface CustomCreateOrderActions {
  order: PayPalOrder;
}

// Define a minimal type for the actions object in onApprove
interface OnApproveActions {
  order?: {
    capture: () => Promise<{ id?: string; [key: string]: any }>;
  };
}

// Define a type for transactions
interface Transaction {
  id: string;
  type: "purchase" | "redemption" | "trade";
  direction?: "sent" | "received";
  tokens?: number;
  amount?: string;
  currency?: string;
  status?: string;
  createdAt: Date;
  productType?: string;
  productId?: string;
  tokenCost?: number;
  senderId?: string;
  senderUsername?: string;
  receiverId?: string;
  receiverUsername?: string;
}

const Store = () => {
  const { user: authUser } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [{ isPending, isResolved, isRejected }] = usePayPalScriptReducer();
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [selectedTokenPackage, setSelectedTokenPackage] = useState<"50" | "100" | "300" | "600" | "1200" | "2500" | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState<boolean>(false);
  const [tradeRecipientUsername, setTradeRecipientUsername] = useState<string>("");
  const [tradeRecipientExists, setTradeRecipientExists] = useState<boolean | null>(null);
  const [tradeAmount, setTradeAmount] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionHistory, setTransactionHistory] = useState<Transaction[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
  const [copiedCode, setCopiedCode] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [transactionsPerPage, setTransactionsPerPage] = useState<number>(5);
  const [totalTransactions, setTotalTransactions] = useState<number>(0);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);

  // Fetch the user's token balance from Firestore
  const fetchTokenBalance = async () => {
    if (!authUser) return;
    const userDocRef = doc(db, `users/${authUser.uid}`);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      setTokenBalance(userDoc.data().tokenBalance || 0);
    }
  };

  useEffect(() => {
    fetchTokenBalance();
  }, [authUser]);

  // Check recipient username availability
  const checkRecipientUsername = useCallback(
    debounce(async (username: string) => {
      if (!username || username.trim().length < 3) {
        setTradeRecipientExists(null);
        return;
      }

      try {
        const checkUsername = httpsCallable(functions, "checkUsername");
        const result = (await checkUsername({ username })) as { data: CheckUsernameResponse };
        const exists = !result.data.available;
        setTradeRecipientExists(exists);
      } catch (err: any) {
        setTradeRecipientExists(false);
        console.error("Error checking username:", err);
      }
    }, 300),
    []
  );

  useEffect(() => {
    checkRecipientUsername(tradeRecipientUsername);
    return () => checkRecipientUsername.cancel();
  }, [tradeRecipientUsername, checkRecipientUsername]);

  // Fetch transaction history from Firestore
  const fetchTransactionHistory = async (direction: "next" | "prev" | "initial" = "initial") => {
    if (!authUser) {
      setAllTransactions([]);
      setTotalTransactions(0);
      setIsLoadingHistory(false);
      return;
    }

    setIsLoadingHistory(true);

    try {
      if (direction === "initial") {
        const tokenPurchasesRef = collection(db, `tokenPurchases`);
        const redemptionsRef = collection(db, `redemptions`);
        const tradesRef = collection(db, `trades`);

        const [totalPurchases, totalRedemptions, totalTradesSender, totalTradesReceiver] = await Promise.all([
          getDocs(query(tokenPurchasesRef, where("userId", "==", authUser.uid), orderBy("createdAt", "desc"))),
          getDocs(query(redemptionsRef, where("userId", "==", authUser.uid), orderBy("createdAt", "desc"))),
          getDocs(query(tradesRef, where("senderId", "==", authUser.uid), orderBy("createdAt", "desc"))),
          getDocs(query(tradesRef, where("receiverId", "==", authUser.uid), orderBy("createdAt", "desc"))),
        ]);

        const tradesSetForCount = new Set<string>();
        let fetchedTransactions: Transaction[] = [];

        totalPurchases.forEach(doc => {
          const docData = doc.data();
          const createdAt = docData.createdAt?.toDate() ?? new Date();
          fetchedTransactions.push({ type: "purchase", ...docData, createdAt, id: doc.id });
        });

        totalRedemptions.forEach(doc => {
          const docData = doc.data();
          const createdAt = docData.createdAt?.toDate() ?? new Date();
          fetchedTransactions.push({ type: "redemption", ...docData, createdAt, id: doc.id });
        });

        totalTradesSender.forEach(doc => {
          const docData = doc.data();
          const createdAt = docData.createdAt?.toDate() ?? new Date();
          fetchedTransactions.push({ type: "trade", direction: "sent", ...docData, createdAt, id: doc.id });
          tradesSetForCount.add(doc.id);
        });

        totalTradesReceiver.forEach(doc => {
          const docData = doc.data();
          const createdAt = docData.createdAt?.toDate() ?? new Date();
          if (docData.senderId === docData.receiverId) {
            fetchedTransactions.push({ type: "trade", direction: "received", ...docData, createdAt, id: doc.id + "-received" });
          } else if (!tradesSetForCount.has(doc.id)) {
            fetchedTransactions.push({ type: "trade", direction: "received", ...docData, createdAt, id: doc.id });
          }
        });

        // Sort all transactions
        fetchedTransactions.sort((a, b) => {
          const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
          if (timeDiff !== 0) return timeDiff;
          if (a.type === "trade" && b.type === "trade") {
            return (a.direction === "received" ? -1 : 1) - (b.direction === "received" ? -1 : 1);
          }
          return 0;
        });

        setAllTransactions(fetchedTransactions);
        setTotalTransactions(fetchedTransactions.length);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch transaction history";
      setError(errorMessage);
      console.error(err);
      setIsLoadingHistory(false);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Paginate the transactions
  useEffect(() => {
    if (allTransactions.length === 0) return;

    const startIndex = (currentPage - 1) * transactionsPerPage;
    const endIndex = Math.min(startIndex + transactionsPerPage, allTransactions.length);
    const paginatedHistory = allTransactions.slice(startIndex, endIndex);

    setTransactionHistory(paginatedHistory);

  }, [allTransactions, currentPage, transactionsPerPage, totalTransactions]);

  // Initial load
  useEffect(() => {
    fetchTransactionHistory("initial");
  }, [authUser]);

  // Update transactions per page and reset to page 1
  const handleTransactionsPerPageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newPerPage = parseInt(event.target.value);
    setTransactionsPerPage(newPerPage);
    setCurrentPage(1);
  };

  const tokenPackages = {
    "70": { amount: "7.00", currency: "USD", bonus: 0 },
    "120": { amount: "12.00", currency: "USD", bonus: 0 },
    "200": { amount: "20.00", currency: "USD", bonus: 10 },
    "300": { amount: "30.00", currency: "USD", bonus: 15 },
    "1200": { amount: "120.00", currency: "USD", bonus: 96 },
    "2500": { amount: "250.00", currency: "USD", bonus: 250 },
  };

  const handleCreateOrder = async (_data: any, actions: CustomCreateOrderActions) => {
    if (!actions.order) {
      throw new Error("PayPal actions.order is not available");
    }
    if (!selectedTokenPackage || !authUser) {
      throw new Error("No token package selected or user not authenticated");
    }

    setIsCreatingOrder(true);
    setError(null);

    try {
      const tokenPackage = tokenPackages[selectedTokenPackage];
      const sessionId = uuidv4();
      const createPaypalOrder = httpsCallable<unknown, CreatePaypalOrderResponse>(functions, "createPaypalOrder");
      const result = await createPaypalOrder({
        userId: authUser.uid,
        sessionId,
        tokens: parseInt(selectedTokenPackage),
        amount: tokenPackage.amount,
        currency: tokenPackage.currency,
      });

      if (!result.data.orderId) {
        throw new Error("Failed to create PayPal order: No order ID in response.");
      }

      const orderId = result.data.orderId;
      localStorage.setItem("sessionId", sessionId);
      return orderId;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create PayPal order";
      setError(errorMessage);
      console.error("Error creating PayPal order:", err);
      throw err;
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handleOnApprove = async (_data: any, actions: OnApproveActions) => {
    try {
      if (!actions.order) {
        throw new Error("PayPal actions.order is not available");
      }
      if (!selectedTokenPackage || !authUser) {
        throw new Error("No token package selected or user not authenticated");
      }

      const orderId = _data.orderID;
      const sessionId = localStorage.getItem("sessionId");
      if (!orderId || !sessionId) {
        throw new Error("Order ID or session ID missing");
      }

      const tokenPackage = tokenPackages[selectedTokenPackage];
      const processTokenPurchase = httpsCallable<unknown, ProcessTokenPurchaseResponse>(functions, "processTokenPurchase");
      const result = await processTokenPurchase({
        userId: authUser.uid,
        orderId,
        sessionId,
        tokens: parseInt(selectedTokenPackage),
        amount: tokenPackage.amount,
        currency: tokenPackage.currency,
      });

      if (!result.data.success) {
        throw new Error("Failed to process token purchase");
      }

      await fetchTokenBalance();
      setCurrentPage(1);
      await fetchTransactionHistory("initial");

      setLoading(false);
      setSelectedTokenPackage(null);
      localStorage.removeItem("sessionId");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to complete token purchase";
      setError(errorMessage);
      console.error("PayPal onApprove Error:", err);
      setLoading(false);
      localStorage.removeItem("sessionId");
    }
  };

  const handleOnError = (err: Record<string, unknown>) => {
    const errorMessage = typeof err.message === "string" ? err.message : "Failed to purchase tokens. Please try again.";
    setError(errorMessage);
    console.error("PayPal Button Error:", err);
    setLoading(false);
    localStorage.removeItem("sessionId");
  };

  const handleTradeTokens = async () => {
    if (!tradeRecipientUsername || !tradeAmount || !authUser) return;

    setLoading(true);
    setError(null);

    try {
      const tradeAmountNum = parseInt(tradeAmount);
      if (tradeAmountNum <= 0 || tradeAmountNum > tokenBalance) {
        throw new Error("Invalid trade amount or insufficient tokens");
      }

      if (!tradeRecipientExists) {
        throw new Error("Recipient username does not exist");
      }

      const processTokenTrade = httpsCallable<unknown, ProcessTokenTradeResponse>(functions, "processTokenTrade");
      const result = await processTokenTrade({
        senderId: authUser.uid,
        receiverUsername: tradeRecipientUsername,
        tokens: tradeAmountNum,
      });

      if (!result.data.success) {
        throw new Error("Failed to process token trade");
      }

      await fetchTokenBalance();
      setCurrentPage(1);
      await fetchTransactionHistory("initial");

      setLoading(false);
      setTradeRecipientUsername("");
      setTradeAmount("");
      setTradeRecipientExists(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to trade tokens";
      setError(errorMessage);
      console.error(err);
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalTransactions / transactionsPerPage);

  const referralCode = authUser?.uid?.slice(0, 8).toUpperCase() || "N/A";

  const copyReferralCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className={`p-6 md:p-8 max-w-7xl mx-auto`}>
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-500 shadow-lg">
            <Coin size={36} className="text-white" />
          </div>
          <h1 className={`text-4xl md:text-5xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
            Token Store
          </h1>
        </div>
        <p className={`text-lg ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
          Purchase, trade, and manage your tokens
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl backdrop-blur-md">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Token Balance & Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* Balance Card */}
        <div className={`p-6 rounded-3xl backdrop-blur-xl ${
          theme === "dark" 
            ? "bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20" 
            : "bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200"
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 shadow-lg">
              <Coin size={24} className="text-white" />
            </div>
            <Sparkle size={20} className="text-yellow-400" />
          </div>
          <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"} mb-1`}>
            Current Balance
          </p>
          <p className={`text-3xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
            {tokenBalance.toLocaleString()}
          </p>
        </div>

        {/* Quick Action: Media */}
        <button
          onClick={() => navigate("/media")}
          className={`group p-6 rounded-3xl backdrop-blur-xl transition-all hover:scale-105 ${
            theme === "dark" 
              ? "bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 hover:border-purple-500/40" 
              : "bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 hover:border-purple-300"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg">
              <CurrencyDollar size={24} className="text-white" />
            </div>
            <ArrowRight size={20} className={`transition-transform group-hover:translate-x-1 ${
              theme === "dark" ? "text-purple-400" : "text-purple-600"
            }`} />
          </div>
          <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"} mb-1 text-left`}>
            Spend Tokens
          </p>
          <p className={`font-semibold text-left ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
            Subscribe to Media
          </p>
        </button>

        {/* Quick Action: Leaderboard */}
        <button
          onClick={() => navigate("/leaderboard")}
          className={`group p-6 rounded-3xl backdrop-blur-xl transition-all hover:scale-105 ${
            theme === "dark" 
              ? "bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 hover:border-blue-500/40" 
              : "bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 hover:border-blue-300"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 shadow-lg">
              <Trophy size={24} className="text-white" />
            </div>
            <ArrowRight size={20} className={`transition-transform group-hover:translate-x-1 ${
              theme === "dark" ? "text-blue-400" : "text-blue-600"
            }`} />
          </div>
          <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"} mb-1 text-left`}>
            Community
          </p>
          <p className={`font-semibold text-left ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
            View Leaderboard
          </p>
        </button>
      </div>

      {/* Token Packages */}
      <div className={`mb-12 p-8 rounded-3xl backdrop-blur-xl ${
        theme === "dark" 
          ? "bg-white/5 border border-white/10" 
          : "bg-white/70 border border-gray-200"
      }`}>
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg">
            <Plus size={28} className="text-white" />
          </div>
          <div>
            <h2 className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
              Purchase Tokens
            </h2>
            <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
              Select a package to get started
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {Object.entries(tokenPackages).map(([tokens, pkg]) => {
            const isSelected = selectedTokenPackage === tokens;
            const hasBonus = pkg.bonus > 0;
            
            return (
              <div
                key={tokens}
                onClick={() => setSelectedTokenPackage(tokens as any)}
                className={`relative p-6 rounded-2xl cursor-pointer transition-all hover:scale-105 ${
                  isSelected
                    ? theme === "dark"
                      ? "bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-2 border-purple-500"
                      : "bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-2 border-purple-500"
                    : theme === "dark"
                      ? "bg-gray-800/50 border border-gray-700 hover:border-gray-600"
                      : "bg-gray-50 border border-gray-300 hover:border-gray-400"
                }`}
              >
                {hasBonus && (
                  <div className="absolute -top-3 -right-3">
                    <div className="px-3 py-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full text-xs font-bold text-white shadow-lg flex items-center gap-1">
                      <Star size={12} weight="fill" />
                      {Math.round((pkg.bonus / parseInt(tokens)) * 100)}% Bonus
                    </div>
                  </div>
                )}
                
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className={`text-3xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      {tokens}
                    </p>
                    <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                      tokens
                    </p>
                    {hasBonus && (
                      <p className="text-sm text-green-400 mt-1">
                        +{pkg.bonus} bonus!
                      </p>
                    )}
                  </div>
                  <p className={`text-2xl font-bold ${
                    theme === "dark" ? "text-green-400" : "text-green-600"
                  }`}>
                    ${pkg.amount}
                  </p>
                </div>
                
                {isSelected && (
                  <div className="absolute bottom-2 right-2">
                    <CheckCircle size={24} weight="fill" className="text-purple-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* PayPal Buttons */}
        {selectedTokenPackage && (
          <div className="max-w-md mx-auto">
            {isPending && (
              <div className="text-center py-8">
                <Spinner size={32} className="animate-spin mx-auto mb-2 text-purple-400" />
                <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                  Loading PayPal...
                </p>
              </div>
            )}
            
            {isRejected && (
              <div className="text-center py-8">
                <p className="text-red-400">
                  Error loading PayPal. Please refresh and try again.
                </p>
              </div>
            )}
            
            {isResolved && (
              <div className="space-y-4">
                <div className={`p-4 rounded-xl text-center ${
                  theme === "dark" ? "bg-gray-800/50" : "bg-gray-100"
                }`}>
                  <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    You're purchasing
                  </p>
                  <p className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    {selectedTokenPackage} tokens for ${tokenPackages[selectedTokenPackage].amount}
                  </p>
                </div>
                
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
                  disabled={loading || isCreatingOrder}
                />
                
                {isCreatingOrder && (
                  <div className="text-center">
                    <Spinner size={24} className="animate-spin mx-auto text-purple-400" />
                    <p className={`text-sm mt-2 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                      Preparing payment...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        <p className={`text-xs text-center mt-6 ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
          By purchasing, you agree to our Terms and Refund Policy
        </p>
      </div>

      {/* Trade Tokens */}
      <div className={`mb-12 p-8 rounded-3xl backdrop-blur-xl ${
        theme === "dark" 
          ? "bg-white/5 border border-white/10" 
          : "bg-white/70 border border-gray-200"
      }`}>
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 shadow-lg">
            <Handshake size={28} className="text-white" />
          </div>
          <div>
            <h2 className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
              Trade Tokens
            </h2>
            <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
              Send tokens to other users
            </p>
          </div>
        </div>
        
        <div className="max-w-md mx-auto space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${
              theme === "dark" ? "text-gray-300" : "text-gray-700"
            }`}>
              Recipient Username
            </label>
            <div className="relative">
              <input
                type="text"
                value={tradeRecipientUsername}
                onChange={(e) => setTradeRecipientUsername(e.target.value)}
                placeholder="Enter username"
                className={`w-full px-4 py-3 rounded-xl pr-10 ${
                  theme === "dark" 
                    ? "bg-gray-800/50 text-white border border-gray-700 focus:border-purple-500" 
                    : "bg-white text-gray-900 border border-gray-300 focus:border-purple-500"
                } focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all`}
                disabled={loading}
              />
              {tradeRecipientExists !== null && tradeRecipientUsername && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  {tradeRecipientExists ? (
                    <CheckCircle size={20} weight="fill" className="text-green-500" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">!</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div>
            <label className={`block text-sm font-medium mb-2 ${
              theme === "dark" ? "text-gray-300" : "text-gray-700"
            }`}>
              Amount
            </label>
            <input
              type="number"
              value={tradeAmount}
              onChange={(e) => setTradeAmount(e.target.value)}
              placeholder="0"
              className={`w-full px-4 py-3 rounded-xl ${
                theme === "dark" 
                  ? "bg-gray-800/50 text-white border border-gray-700 focus:border-purple-500" 
                  : "bg-white text-gray-900 border border-gray-300 focus:border-purple-500"
              } focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all`}
              disabled={loading}
              min="1"
              max={tokenBalance}
            />
            {tradeAmount && parseInt(tradeAmount) > tokenBalance && (
              <p className="text-red-400 text-sm mt-1">
                Insufficient balance
              </p>
            )}
          </div>
          
          <button
            onClick={handleTradeTokens}
            disabled={loading || !tradeRecipientUsername || !tradeAmount || parseInt(tradeAmount) <= 0 || parseInt(tradeAmount) > tokenBalance || !tradeRecipientExists}
            className={`w-full py-3 px-6 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
              loading || !tradeRecipientUsername || !tradeAmount || parseInt(tradeAmount) <= 0 || parseInt(tradeAmount) > tokenBalance || !tradeRecipientExists 
                ? theme === "dark"
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:shadow-lg hover:scale-105"
            }`}
          >
            {loading ? (
              <Spinner size={20} className="animate-spin" />
            ) : (
              <>
                Send Tokens
                <ArrowRight size={20} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Community Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {/* Monthly Giveaway */}
        <div className={`p-8 rounded-3xl backdrop-blur-xl ${
          theme === "dark" 
            ? "bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20" 
            : "bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200"
        }`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg">
              <Gift size={24} className="text-white" />
            </div>
            <h3 className={`text-xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
              Monthly Giveaway
            </h3>
          </div>
          <p className={`mb-6 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
            Win up to 600 tokens every month! Enter for your chance to win.
          </p>
          <button className="w-full py-3 px-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg hover:scale-105 transition-all">
            Enter Giveaway
          </button>
        </div>

        {/* Referral Program */}
        <div className={`p-8 rounded-3xl backdrop-blur-xl ${
          theme === "dark" 
            ? "bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20" 
            : "bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200"
        }`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-500 shadow-lg">
              <Lightning size={24} className="text-white" />
            </div>
            <h3 className={`text-xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
              Referral Program
            </h3>
          </div>
          <p className={`mb-4 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
            Earn 30 tokens for each friend who joins!
          </p>
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            theme === "dark" ? "bg-gray-800/50" : "bg-gray-100"
          }`}>
            <code className={`flex-1 font-mono text-sm ${
              theme === "dark" ? "text-white" : "text-gray-900"
            }`}>
              {referralCode}
            </code>
            <button
              onClick={copyReferralCode}
              className={`p-2 rounded-lg transition-all ${
                copiedCode
                  ? "bg-green-500 text-white"
                  : theme === "dark"
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {copiedCode ? <CheckCircle size={20} /> : <Copy size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className={`p-8 rounded-3xl backdrop-blur-xl ${
        theme === "dark" 
          ? "bg-white/5 border border-white/10" 
          : "bg-white/70 border border-gray-200"
      }`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-gray-500 to-gray-600 shadow-lg">
              <Clock size={24} className="text-white" />
            </div>
            <h2 className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
              Transaction History
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <label className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
              Show:
            </label>
            <select
              value={transactionsPerPage}
              onChange={handleTransactionsPerPageChange}
              className={`px-3 py-1 rounded-lg text-sm ${
                theme === "dark" 
                  ? "bg-gray-800 text-white border border-gray-700" 
                  : "bg-white text-gray-900 border border-gray-300"
              }`}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
        
        <div className="space-y-3">
          {isLoadingHistory ? (
            <div className="text-center py-12">
              <Spinner size={32} className="animate-spin mx-auto mb-4 text-purple-400" />
              <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                Loading transactions...
              </p>
            </div>
          ) : transactionHistory.length > 0 ? (
            transactionHistory.map((tx) => (
              <div key={tx.id} className={`p-4 rounded-xl transition-all hover:scale-[1.02] ${
                theme === "dark" 
                  ? "bg-gray-800/50 hover:bg-gray-800/70" 
                  : "bg-gray-50 hover:bg-gray-100"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      tx.type === "purchase" 
                        ? "bg-green-500/20 text-green-500"
                        : tx.type === "redemption"
                          ? "bg-purple-500/20 text-purple-500"
                          : tx.direction === "sent"
                            ? "bg-red-500/20 text-red-500"
                            : "bg-blue-500/20 text-blue-500"
                    }`}>
                      {tx.type === "purchase" && <Plus size={20} weight="bold" />}
                      {tx.type === "redemption" && <CurrencyDollar size={20} />}
                      {tx.type === "trade" && <Handshake size={20} />}
                    </div>
                    <div>
                      <p className={`font-medium ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                        {tx.type === "purchase" && `Purchased ${tx.tokens} tokens`}
                        {tx.type === "redemption" && `Subscribed to ${tx.productId} plan`}
                        {tx.type === "trade" && tx.direction === "sent" && `Sent to ${tx.receiverUsername || "user"}`}
                        {tx.type === "trade" && tx.direction === "received" && `Received from ${tx.senderUsername || "user"}`}
                      </p>
                      <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                        {tx.createdAt.toLocaleString("en-US", { 
                          month: "short", 
                          day: "numeric", 
                          hour: "numeric", 
                          minute: "numeric" 
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-lg ${
                      tx.type === "purchase" || (tx.type === "trade" && tx.direction === "received")
                        ? "text-green-500"
                        : "text-red-500"
                    }`}>
                      {tx.type === "purchase" && `+${tx.tokens}`}
                      {tx.type === "redemption" && `-${tx.tokenCost}`}
                      {tx.type === "trade" && tx.direction === "sent" && `-${tx.tokens}`}
                      {tx.type === "trade" && tx.direction === "received" && `+${tx.tokens}`}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800/50 flex items-center justify-center">
                <Clock size={32} className="text-gray-500" />
              </div>
              <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                No transactions yet
              </p>
            </div>
          )}
        </div>
        
        {totalTransactions > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            isLoading={isLoadingHistory}
            className="mt-6"
          />
        )}
      </div>
    </div>
  );
};

export default Store;