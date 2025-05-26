import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/auth-context";
import { useTheme } from "../context/theme-context";
import { db, functions } from "../config/firebase";
import { doc, getDoc, collection, getDocs, query, where, addDoc, updateDoc, serverTimestamp, orderBy } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { Spinner, Coin } from "phosphor-react";
import { debounce } from "lodash";
import { v4 as uuidv4 } from "uuid";

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
  const [{ isPending, isResolved, isRejected }] = usePayPalScriptReducer();
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [selectedTokenPackage, setSelectedTokenPackage] = useState<"60" | "120" | "600" | "1200" | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState<boolean>(false);
  const [selectedProductType, setSelectedProductType] = useState<"subscription" | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [duration, setDuration] = useState<"1" | "3" | "6" | "12">("1");
  const [tradeRecipientUsername, setTradeRecipientUsername] = useState<string>("");
  const [tradeRecipientExists, setTradeRecipientExists] = useState<boolean | null>(null);
  const [tradeAmount, setTradeAmount] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionHistory, setTransactionHistory] = useState<Transaction[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [transactionsPerPage, setTransactionsPerPage] = useState<number>(5);
  const [totalTransactions, setTotalTransactions] = useState<number>(0);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]); // Store all transactions for pagination

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.matchMedia("(max-width: 640px)").matches;
      setIsMobile(mobile);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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
      // Only fetch all transactions if it's the initial load or after a data change
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
        console.log(`Total transactions: ${fetchedTransactions.length}`);
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

  // Paginate the transactions whenever allTransactions, currentPage, or transactionsPerPage changes
  useEffect(() => {
    if (allTransactions.length === 0) return; // Skip if no transactions are loaded yet

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
    setCurrentPage(1); // Reset to page 1
  };

  const tokenPackages = {
    "60": { amount: "5.00", currency: "USD" },
    "120": { amount: "10.00", currency: "USD" },
    "600": { amount: "45.00", currency: "USD" },
    "1200": { amount: "85.00", currency: "USD" },
  };

  const subscriptionCosts = {
    basic: { monthly: 60, yearly: 600 },
    standard: { monthly: 120, yearly: 1200 },
    premium: { monthly: 180, yearly: 1800 },
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
      await fetchTransactionHistory("initial"); // Re-fetch transactions to include the new purchase

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

  const handleRedeemTokens = async () => {
    if (!selectedProductType || !selectedProduct || !authUser) return;

    setLoading(true);
    setError(null);

    try {
      let tokenCost = 0;
      let productId = selectedProduct;

      if (selectedProductType === "subscription") {
        tokenCost = subscriptionCosts[selectedProduct as "basic" | "standard" | "premium"][billingPeriod];
      }

      if (tokenBalance < tokenCost) {
        throw new Error("Insufficient tokens to redeem this product");
      }

      const userRef = doc(db, `users/${authUser.uid}`);
      await updateDoc(userRef, {
        tokenBalance: tokenBalance - tokenCost,
      });

      await addDoc(collection(db, "redemptions"), {
        userId: authUser.uid,
        productType: selectedProductType,
        productId,
        tokenCost,
        createdAt: serverTimestamp(),
      });

      await fetchTokenBalance();
      setCurrentPage(1);
      await fetchTransactionHistory("initial"); // Re-fetch transactions to include the new redemption

      setLoading(false);
      setSelectedProductType(null);
      setSelectedProduct(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to redeem tokens";
      setError(errorMessage);
      console.error(err);
      setLoading(false);
    }
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
      await fetchTransactionHistory("initial"); // Re-fetch transactions to include the new trade

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

  const calculateTokensNeeded = () => {
    if (!selectedProductType || !selectedProduct) return 0;

    let tokenCost = 0;
    if (selectedProductType === "subscription") {
      const baseCost = subscriptionCosts[selectedProduct as "basic" | "standard" | "premium"][billingPeriod];
      const durationMonths = parseInt(duration) * (billingPeriod === "yearly" ? 12 : 1);
      tokenCost = baseCost * (durationMonths / (billingPeriod === "yearly" ? 12 : 1));
    }

    return tokenCost;
  };

  const tokensNeeded = calculateTokensNeeded();
  const totalPages = Math.ceil(totalTransactions / transactionsPerPage);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxButtonsToShow = 5; // Total buttons (including first/last pages and ellipses) on desktop

    if (isMobile) {
      // On mobile, we don't need page numbers since we'll show "Page X of Y"
      return [];
    } else {
      // On desktop, show up to maxButtonsToShow buttons (including first/last pages and ellipses)
      if (totalPages <= maxButtonsToShow) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
      } else {
        // Always include the first and last pages, so we have maxButtonsToShow - 2 slots for the main range and ellipses
        const maxMainRange = maxButtonsToShow - 2; // Subtract 2 for first/last pages
        const half = Math.floor(maxMainRange / 2);
        let leftBound = Math.max(2, currentPage - half); // Start after the first page
        let rightBound = Math.min(totalPages - 1, currentPage + half); // End before the last page

        // Adjust bounds to ensure the main range is exactly maxMainRange buttons
        const currentRangeSize = rightBound - leftBound + 1;
        if (currentRangeSize > maxMainRange) {
          if (currentPage <= half + 1) {
            rightBound = leftBound + maxMainRange - 1;
          } else if (currentPage >= totalPages - half) {
            leftBound = rightBound - maxMainRange + 1;
          } else {
            leftBound = currentPage - Math.floor(maxMainRange / 2);
            rightBound = leftBound + maxMainRange - 1;
          }
        } else if (currentRangeSize < maxMainRange) {
          if (currentPage <= half + 1) {
            rightBound = leftBound + maxMainRange - 1;
          } else if (currentPage >= totalPages - half) {
            leftBound = rightBound - maxMainRange + 1;
          }
        }

        // Add the first page and ellipsis if needed
        pages.push(1);
        if (leftBound > 2) {
          pages.push("...");
        } else if (leftBound === 2) {
          pages.push(2);
          leftBound = 3; // Avoid duplicating page 2
        }

        // Add the main range of pages
        for (let i = leftBound; i <= rightBound; i++) {
          pages.push(i);
        }

        // Add the last page and ellipsis if needed, avoiding duplication
        if (rightBound < totalPages - 1) {
          pages.push("...");
          pages.push(totalPages);
        } else if (rightBound === totalPages - 1) {
          pages.push(totalPages);
        }
      }
    }

    return pages;
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const referralCode = authUser?.uid || "N/A";

  return (
    <div className={`min-h-screen p-6 ${theme === "dark" ? "bg-[#121212] text-gray-100" : "bg-gray-100 text-gray-900"}`}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center space-x-2 mb-6">
          <Coin size={32} />
          <h1 className="text-3xl font-bold">Your Token Balance: {tokenBalance}</h1>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {/* Token Calculator */}
        <div className="mb-6 p-4 bg-[#1c1c1c] rounded-md shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-white">Token Calculator</h2>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-gray-200">Product Type</label>
              <select
                value={selectedProductType || ""}
                onChange={(e) => setSelectedProductType(e.target.value as "subscription" | null)}
                className="w-full px-4 py-2 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-0 focus:outline-none focus:border-gray-500"
              >
                <option value="" disabled>Select a product type</option>
                <option value="subscription">Media Subscription</option>
              </select>
            </div>
            {selectedProductType && (
              <div>
                <label className="block mb-1 text-gray-200">Product</label>
                <select
                  value={selectedProduct || ""}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full px-4 py-2 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-0 focus:outline-none focus:border-gray-500"
                >
                  <option value="" disabled>Select a product</option>
                  {selectedProductType === "subscription" && (
                    <>
                      <option value="basic">Basic ({subscriptionCosts.basic[billingPeriod]} tokens)</option>
                      <option value="standard">Standard ({subscriptionCosts.standard[billingPeriod]} tokens)</option>
                      <option value="premium">Premium ({subscriptionCosts.premium[billingPeriod]} tokens)</option>
                    </>
                  )}
                </select>
              </div>
            )}
            {selectedProductType === "subscription" && selectedProduct && (
              <>
                <div>
                  <label className="block mb-1 text-gray-200">Billing Period</label>
                  <select
                    value={billingPeriod}
                    onChange={(e) => setBillingPeriod(e.target.value as "monthly" | "yearly")}
                    className="w-full px-4 py-2 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-0 focus:outline-none focus:border-gray-500"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-gray-200">Duration</label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value as "1" | "3" | "6" | "12")}
                    className="w-full px-4 py-2 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-0 focus:outline-none focus:border-gray-500"
                  >
                    <option value="1">{billingPeriod === "monthly" ? "1 month" : "1 year"}</option>
                    <option value="3">{billingPeriod === "monthly" ? "3 months" : "3 years"}</option>
                    <option value="6">{billingPeriod === "monthly" ? "6 months" : "6 years"}</option>
                    <option value="12">{billingPeriod === "monthly" ? "12 months" : "12 years"}</option>
                  </select>
                </div>
              </>
            )}
            {tokensNeeded > 0 && (
              <div>
                <p className="text-gray-200">
                  You need {tokensNeeded} tokens for {selectedProductType === "subscription" ? `${duration} ${billingPeriod === "monthly" ? "month(s)" : "year(s)"} of ${selectedProduct}` : selectedProduct}. 
                  You have {tokenBalance} tokens—{tokenBalance >= tokensNeeded ? "you’re all set!" : `purchase ${tokensNeeded - tokenBalance} more.`}
                </p>
                {tokenBalance < tokensNeeded && (
                  <button
                    onClick={() => document.getElementById("token-purchase")?.scrollIntoView({ behavior: "smooth" })}
                    className="mt-2 py-2 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md hover:opacity-90"
                  >
                    Purchase Tokens
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Token Purchase */}
        <div id="token-purchase" className="mb-6 p-4 bg-[#1c1c1c] rounded-md shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-white">Purchase Tokens</h2>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-gray-200">Token Package</label>
              <select
                value={selectedTokenPackage || ""}
                onChange={(e) => setSelectedTokenPackage(e.target.value as "60" | "120" | "600" | "1200")}
                className="w-full px-4 py-2 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-0 focus:outline-none focus:border-gray-500"
              >
                <option value="" disabled>Select a token package</option>
                <option value="60">60 Tokens ($5)</option>
                <option value="120">120 Tokens ($10)</option>
                <option value="600">600 Tokens ($45 - 10% discount)</option>
                <option value="1200">1200 Tokens ($85 - 15% discount)</option>
              </select>
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
            <p className="text-gray-200 text-sm text-center mt-4">
              Token purchases are non-refundable once completed. By purchasing tokens, you agree to our{" "}
              <a href="/terms" className="text-purple-500 hover:text-purple-400 underline">Terms of Service</a>{" "}
              and{" "}
              <a href="/refund-policy" className="text-purple-500 hover:text-purple-400 underline">Refund Policy</a>.
            </p>
          </div>
        </div>

        {/* Redeem Tokens */}
        <div className="mb-6 p-4 bg-[#1c1c1c] rounded-md shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-white">Redeem Tokens</h2>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-gray-200">Product Type</label>
              <select
                value={selectedProductType || ""}
                onChange={(e) => setSelectedProductType(e.target.value as "subscription" | null)}
                className="w-full px-4 py-2 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-0 focus:outline-none focus:border-gray-500"
              >
                <option value="" disabled>Select a product type</option>
                <option value="subscription">Media Subscription</option>
              </select>
            </div>
            {selectedProductType && (
              <div>
                <label className="block mb-1 text-gray-200">Product</label>
                <select
                  value={selectedProduct || ""}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full px-4 py-2 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-0 focus:outline-none focus:border-gray-500"
                >
                  <option value="" disabled>Select a product</option>
                  {selectedProductType === "subscription" && (
                    <>
                      <option value="basic">Basic ({subscriptionCosts.basic[billingPeriod]} tokens)</option>
                      <option value="standard">Standard ({subscriptionCosts.standard[billingPeriod]} tokens)</option>
                      <option value="premium">Premium ({subscriptionCosts.premium[billingPeriod]} tokens)</option>
                    </>
                  )}
                </select>
              </div>
            )}
            {selectedProductType === "subscription" && selectedProduct && (
              <div>
                <label className="block mb-1 text-gray-200">Billing Period</label>
                <select
                  value={billingPeriod}
                  onChange={(e) => setBillingPeriod(e.target.value as "monthly" | "yearly")}
                  className="w-full px-4 py-2 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-0 focus:outline-none focus:border-gray-500"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            )}
            <button
              onClick={handleRedeemTokens}
              disabled={loading || !selectedProductType || !selectedProduct}
              className={`w-full py-2 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md transition ${
                loading || !selectedProductType || !selectedProduct ? "opacity-90 cursor-not-allowed" : "hover:opacity-90"
              }`}
            >
              {loading ? <Spinner size={20} className="animate-spin mx-auto" /> : "Redeem Tokens"}
            </button>
          </div>
        </div>

        {/* Trade Tokens */}
        <div className="mb-6 p-4 bg-[#1c1c1c] rounded-md shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-white">Trade Tokens</h2>
          <div className="space-y-4">
            <div className="relative">
              <label className="block mb-1 text-gray-200">Recipient Username</label>
              <div className="relative">
                <input
                  type="text"
                  value={tradeRecipientUsername}
                  onChange={(e) => setTradeRecipientUsername(e.target.value)}
                  placeholder="Enter username to trade with"
                  className="w-full px-4 py-2 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-0 focus:outline-none focus:border-gray-500 pr-10"
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
              <label className="block mb-1 text-gray-200">Number of Tokens</label>
              <input
                type="number"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                placeholder="Enter number of tokens to trade"
                className="w-full px-4 py-2 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-0 focus:outline-none focus:border-gray-500"
                disabled={loading}
              />
            </div>
            <button
              onClick={handleTradeTokens}
              disabled={loading || !tradeRecipientUsername || !tradeAmount || parseInt(tradeAmount) <= 0 || parseInt(tradeAmount) > tokenBalance || !tradeRecipientExists}
              className={`w-full py-2 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md transition ${
                loading || !tradeRecipientUsername || !tradeAmount || parseInt(tradeAmount) <= 0 || parseInt(tradeAmount) > tokenBalance || !tradeRecipientExists ? "opacity-90 cursor-not-allowed" : "hover:opacity-90"
              }`}
            >
              {loading ? <Spinner size={20} className="animate-spin mx-auto" /> : "Send Tokens"}
            </button>
          </div>
        </div>

        {/* Transaction History */}
        <div className="mb-6 p-4 bg-[#1c1c1c] rounded-md shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Transaction History</h2>
            <div className="flex items-center space-x-2">
              <label className="text-gray-200">Show:</label>
              <select
                value={transactionsPerPage}
                onChange={handleTransactionsPerPageChange}
                className="px-2 py-1 border rounded-md bg-gray-800 border-gray-600 text-white focus:ring-0 focus:outline-none focus:border-gray-500"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            {isLoadingHistory ? (
              <p className="text-gray-200 text-center py-4">Loading transactions...</p>
            ) : transactionHistory.length > 0 ? (
              transactionHistory.map((tx) => (
                <div key={tx.id} className="p-2 bg-gray-800 rounded-md">
                  <p className="text-gray-200">
                    {tx.type === "purchase" && `Purchased ${tx.tokens} tokens on ${tx.createdAt.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "numeric", hour12: true })}`}
                    {tx.type === "redemption" && `Redeemed ${tx.productType} (${tx.productId}) for ${tx.tokenCost} tokens on ${tx.createdAt.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "numeric", hour12: true })}`}
                    {tx.type === "trade" && tx.direction === "sent" && `Sent ${tx.tokens} tokens to user ${tx.receiverUsername || tx.receiverId} on ${tx.createdAt.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "numeric", hour12: true })}`}
                    {tx.type === "trade" && tx.direction === "received" && `Received ${tx.tokens} tokens from user ${tx.senderUsername || tx.senderId} on ${tx.createdAt.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "numeric", hour12: true })}`}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-gray-200 text-center py-4">No transactions yet.</p>
            )}
          </div>
          {totalTransactions > 0 && (
            <div className="flex flex-col items-center mt-4 space-y-2">
              <div className="flex justify-between items-center w-full sm:w-auto sm:space-x-1">
                <button
                  onClick={() => {
                    const newPage = Math.max(currentPage - 1, 1);
                    setCurrentPage(newPage);
                  }}
                  disabled={currentPage === 1 || isLoadingHistory}
                  className={`py-2 px-4 rounded-md text-white sm:px-2 sm:py-1 sm:text-sm ${currentPage === 1 || isLoadingHistory ? "bg-gray-500 cursor-not-allowed" : "bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"}`}
                >
                  Back
                </button>
                {isMobile ? (
                  <span className="text-gray-200 text-sm py-1">
                    Page {currentPage} of {totalPages}
                  </span>
                ) : (
                  <div className="flex space-x-1 sm:space-x-1">
                    {getPageNumbers().map((page, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          if (typeof page === "number") {
                            handlePageChange(page);
                          }
                        }}
                        className={`py-1 px-3 rounded-md sm:px-2 sm:text-xs ${typeof page === "number" && page === currentPage ? "bg-purple-500 text-white" : "bg-gray-700 text-gray-200 hover:bg-gray-600"} ${typeof page === "string" ? "cursor-default" : ""}`}
                        disabled={typeof page === "string" || isLoadingHistory}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => {
                    const newPage = Math.min(currentPage + 1, totalPages);
                    setCurrentPage(newPage);
                  }}
                  disabled={currentPage === totalPages || isLoadingHistory}
                  className={`py-2 px-4 rounded-md text-white sm:px-2 sm:py-1 sm:text-sm ${currentPage === totalPages || isLoadingHistory ? "bg-gray-500 cursor-not-allowed" : "bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"}`}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Community Features */}
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-md shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-white">Community Features</h2>
          <div className="space-y-4">
            <div className="p-2 bg-[#1c1c1c] rounded-md">
              <p className="text-gray-200">Enter our giveaway to win 600 tokens!</p>
              <button className="mt-2 py-2 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md hover:opacity-90">
                Enter Giveaway
              </button>
            </div>
            <div className="p-2 bg-[#1c1c1c] rounded-md">
              <p className="text-gray-200">Top Token Traders This Month:</p>
              <ul className="list-disc list-inside text-gray-200">
                <li>1. User123: 500 tokens traded</li>
                <li>2. User456: 300 tokens traded</li>
                <li>3. User789: 200 tokens traded</li>
              </ul>
            </div>
            <div className="p-2 bg-[#1c1c1c] rounded-md">
              <p className="text-gray-200">
                Invite a friend and earn 30 tokens! Your referral code: {referralCode}
              </p>
              <button className="mt-2 py-2 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md hover:opacity-90">
                Copy Referral Code
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Store;