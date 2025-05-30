import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/auth-context";
import { useTheme } from "../context/theme-context";
import { db, functions } from "../config/firebase";
import { doc, getDoc, collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { Spinner, Coin, CurrencyDollar, Handshake, Gift, Trophy, ArrowRight } from "phosphor-react";
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
    "50": { amount: "5.00", currency: "USD", bonus: 0 },
    "100": { amount: "10.00", currency: "USD", bonus: 0 },
    "300": { amount: "27.00", currency: "USD", bonus: 30 }, // 10% bonus (pay for 270, get 300)
    "600": { amount: "48.00", currency: "USD", bonus: 120 }, // 20% bonus (pay for 480, get 600)
    "1200": { amount: "84.00", currency: "USD", bonus: 360 }, // 30% bonus (pay for 840, get 1200)
    "2500": { amount: "150.00", currency: "USD", bonus: 1000 }, // 40% bonus (pay for 1500, get 2500)
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

  return (
    <div className={`min-h-screen p-6 ${theme === "dark" ? "bg-[#121212] text-gray-100" : "bg-gray-100 text-gray-900"}`}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Coin size={48} className="text-yellow-400" />
            <h1 className="text-4xl font-bold">Token Store</h1>
          </div>
          <p className="text-gray-400 text-lg">Purchase, trade, and manage your tokens</p>
          <div className="mt-4 p-4 bg-gray-800 rounded-lg inline-block">
            <p className="text-2xl font-bold text-yellow-400">{tokenBalance} tokens</p>
            <p className="text-gray-400 text-sm">Current Balance</p>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

        {/* Quick Actions */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => navigate("/media")}
            className="p-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg hover:opacity-90 transition"
          >
            <h3 className="font-semibold mb-2 flex items-center justify-center">
              <CurrencyDollar size={20} className="mr-2" />
              Spend Tokens
            </h3>
            <p className="text-sm opacity-90">Subscribe to media plans</p>
          </button>
          
          <button
            onClick={() => document.getElementById("trade-tokens")?.scrollIntoView({ behavior: "smooth" })}
            className="p-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:opacity-90 transition"
          >
            <h3 className="font-semibold mb-2 flex items-center justify-center">
              <Handshake size={20} className="mr-2" />
              Trade Tokens
            </h3>
            <p className="text-sm opacity-90">Send tokens to friends</p>
          </button>
          
          <button
            onClick={() => navigate("/leaderboard")}
            className="p-4 bg-gradient-to-r from-yellow-600 to-orange-600 rounded-lg hover:opacity-90 transition"
          >
            <h3 className="font-semibold mb-2 flex items-center justify-center">
              <Trophy size={20} className="mr-2" />
              Leaderboard
            </h3>
            <p className="text-sm opacity-90">View top contributors</p>
          </button>
        </div>

        {/* Token Purchase */}
        <div id="token-purchase" className="mb-8 p-6 bg-[#1c1c1c] rounded-xl shadow-xl">
          <h2 className="text-2xl font-bold mb-6 text-white flex items-center">
            <CurrencyDollar size={28} className="mr-2 text-green-400" />
            Purchase Tokens
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {Object.entries(tokenPackages).map(([tokens, pkg]) => (
              <div
                key={tokens}
                onClick={() => setSelectedTokenPackage(tokens as "50" | "100" | "300" | "600" | "1200" | "2500")}
                className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                  selectedTokenPackage === tokens
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-gray-600 hover:border-gray-500"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-2xl font-bold text-white">{tokens} tokens</p>
                    {pkg.bonus > 0 && (
                      <p className="text-sm text-green-400">+{pkg.bonus} bonus tokens!</p>
                    )}
                  </div>
                  <p className="text-xl font-semibold text-green-400">${pkg.amount}</p>
                </div>
                {pkg.bonus > 0 && (
                  <p className="text-sm text-gray-400">
                    {Math.round((pkg.bonus / parseInt(tokens)) * 100)}% discount
                  </p>
                )}
              </div>
            ))}
          </div>

          {isPending && (
            <div className="text-gray-200 text-center">
              <Spinner size={24} className="animate-spin mx-auto" />
              <p>Loading PayPal...</p>
            </div>
          )}
          
          {isRejected && (
            <div className="text-red-500 text-center">
              <p>Error loading PayPal. Please refresh the page or try again later.</p>
            </div>
          )}
          
          {selectedTokenPackage && isResolved && (
            <div className="mt-4">
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
                <div className="text-gray-200 text-center mt-2">
                  <Spinner size={24} className="animate-spin mx-auto" />
                  <p>Preparing Payment...</p>
                </div>
              )}
            </div>
          )}
          
          <p className="text-gray-400 text-xs text-center mt-4">
            Token purchases are non-refundable. By purchasing, you agree to our{" "}
            <a href="/terms" className="text-purple-400 hover:text-purple-300 underline">Terms</a>{" "}
            and{" "}
            <a href="/refund-policy" className="text-purple-400 hover:text-purple-300 underline">Refund Policy</a>.
          </p>
        </div>

        {/* Trade Tokens */}
        <div id="trade-tokens" className="mb-8 p-6 bg-[#1c1c1c] rounded-xl shadow-xl">
          <h2 className="text-2xl font-bold mb-6 text-white flex items-center">
            <Handshake size={28} className="mr-2 text-blue-400" />
            Trade Tokens
          </h2>
          <div className="space-y-4">
            <div className="relative">
              <label className="block mb-2 text-gray-300">Recipient Username</label>
              <div className="relative">
                <input
                  type="text"
                  value={tradeRecipientUsername}
                  onChange={(e) => setTradeRecipientUsername(e.target.value)}
                  placeholder="Enter username to trade with"
                  className="w-full px-4 py-2 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none pr-10"
                  disabled={loading}
                />
                {tradeRecipientExists !== null && (
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center text-lg">
                    {tradeRecipientExists ? (
                      <span className="text-green-500">✓</span>
                    ) : (
                      <span className="text-red-500">✗</span>
                    )}
                  </span>
                )}
              </div>
            </div>
            <div>
              <label className="block mb-2 text-gray-300">Number of Tokens</label>
              <input
                type="number"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                placeholder="Enter number of tokens to trade"
                className="w-full px-4 py-2 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                disabled={loading}
                min="1"
                max={tokenBalance}
              />
              {tradeAmount && parseInt(tradeAmount) > tokenBalance && (
                <p className="text-red-400 text-sm mt-1">You only have {tokenBalance} tokens</p>
              )}
            </div>
            <button
              onClick={handleTradeTokens}
              disabled={loading || !tradeRecipientUsername || !tradeAmount || parseInt(tradeAmount) <= 0 || parseInt(tradeAmount) > tokenBalance || !tradeRecipientExists}
              className={`w-full py-3 px-4 rounded-md font-semibold transition flex items-center justify-center ${
                loading || !tradeRecipientUsername || !tradeAmount || parseInt(tradeAmount) <= 0 || parseInt(tradeAmount) > tokenBalance || !tradeRecipientExists 
                  ? "bg-gray-600 cursor-not-allowed opacity-50" 
                  : "bg-gradient-to-r from-blue-500 to-purple-500 hover:opacity-90"
              } text-white`}
            >
              {loading ? (
                <Spinner size={20} className="animate-spin" />
              ) : (
                <>
                  <ArrowRight size={20} className="mr-2" />
                  Send Tokens
                </>
              )}
            </button>
          </div>
        </div>

        {/* Transaction History */}
        <div className="mb-8 p-6 bg-[#1c1c1c] rounded-xl shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Transaction History</h2>
            <div className="flex items-center space-x-2">
              <label className="text-gray-300">Show:</label>
              <select
                value={transactionsPerPage}
                onChange={handleTransactionsPerPageChange}
                className="px-2 py-1 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
          
          <div className="space-y-2">
            {isLoadingHistory ? (
              <div className="text-gray-200 text-center py-8">
                <Spinner size={32} className="animate-spin mx-auto mb-2" />
                <p>Loading transactions...</p>
              </div>
            ) : transactionHistory.length > 0 ? (
              transactionHistory.map((tx) => (
                <div key={tx.id} className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-gray-200 font-medium">
                        {tx.type === "purchase" && `Purchased ${tx.tokens} tokens`}
                        {tx.type === "redemption" && `Subscribed to ${tx.productId} plan`}
                        {tx.type === "trade" && tx.direction === "sent" && `Sent ${tx.tokens} tokens to ${tx.receiverUsername || "user"}`}
                        {tx.type === "trade" && tx.direction === "received" && `Received ${tx.tokens} tokens from ${tx.senderUsername || "user"}`}
                      </p>
                      <p className="text-gray-400 text-sm">
                        {tx.createdAt.toLocaleString("en-US", { 
                          month: "short", 
                          day: "numeric", 
                          hour: "numeric", 
                          minute: "numeric" 
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      {tx.type === "purchase" && (
                        <span className="text-green-400 font-semibold">+{tx.tokens}</span>
                      )}
                      {tx.type === "redemption" && (
                        <span className="text-red-400 font-semibold">-{tx.tokenCost}</span>
                      )}
                      {tx.type === "trade" && tx.direction === "sent" && (
                        <span className="text-red-400 font-semibold">-{tx.tokens}</span>
                      )}
                      {tx.type === "trade" && tx.direction === "received" && (
                        <span className="text-green-400 font-semibold">+{tx.tokens}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-400 text-center py-8">No transactions yet.</p>
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

        {/* Community Features */}
        <div className="p-6 bg-gradient-to-r from-purple-900/50 to-pink-900/50 rounded-xl shadow-xl">
          <h2 className="text-2xl font-bold mb-6 text-white flex items-center">
            <Gift size={28} className="mr-2" />
            Community Features
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-black/30 rounded-lg">
              <h3 className="font-semibold mb-2 text-purple-300">🎁 Monthly Giveaway</h3>
              <p className="text-gray-300 text-sm mb-3">Win up to 600 tokens every month!</p>
              <button className="py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm transition">
                Enter Giveaway
              </button>
            </div>
            
            <div className="p-4 bg-black/30 rounded-lg">
              <h3 className="font-semibold mb-2 text-pink-300">💝 Referral Program</h3>
              <p className="text-gray-300 text-sm mb-1">Your code: <span className="font-mono bg-gray-800 px-2 py-1 rounded">{referralCode}</span></p>
              <p className="text-gray-400 text-xs mb-3">Earn 30 tokens for each friend who joins!</p>
              <button 
                onClick={() => navigator.clipboard.writeText(referralCode)}
                className="py-2 px-4 bg-pink-600 hover:bg-pink-700 text-white rounded-md text-sm transition"
              >
                Copy Code
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Store;