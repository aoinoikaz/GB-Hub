import { useState, useEffect } from "react";
import { useTheme } from "../context/theme-context";
import { useAuth } from "../context/auth-context";
import { collection, query, getDocs, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { Spinner, Flame, Trophy, Crown, Handshake, Coin, Star } from "phosphor-react";
import Pagination from "./Pagination"; // NEW IMPORT

interface LeaderboardEntry {
  userId: string;
  username: string;
  value: number; // total tips (USD), total tokens traded, or token balance
}

const Leaderboard = () => {
  const { theme } = useTheme();
  const { user: authUser } = useAuth();
  const [type, setType] = useState<"tippers" | "trades" | "tokens">("tippers");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [entriesPerPage, setEntriesPerPage] = useState<number>(5);
  const [totalEntries, setTotalEntries] = useState<number>(0);
  const [allEntries, setAllEntries] = useState<LeaderboardEntry[]>([]);
  // REMOVED: isMobile state and useEffect for mobile detection

  // Fetch leaderboard data
  useEffect(() => {
    const fetchLeaderboard = async () => {
      if (!authUser) {
        setError("You must be logged in to view the leaderboard.");
        setAllEntries([]);
        setTotalEntries(0);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        let entries: LeaderboardEntry[] = [];

        if (type === "tippers") {
          const tipsSnapshot = await getDocs(query(collection(db, "tips"), where("status", "==", "completed")));
          const userTotals: { [key: string]: { username: string; total: number } } = {};

          tipsSnapshot.forEach((doc) => {
            const tip = doc.data();
            const userId = tip.userId;
            if (!userTotals[userId]) {
              userTotals[userId] = { username: tip.username || "Anonymous", total: 0 };
            }
            userTotals[userId].total += parseFloat(tip.amount || "0");
          });

          entries = Object.entries(userTotals)
            .map(([userId, { username, total }]) => ({
              userId,
              username,
              value: total,
            }))
            .sort((a, b) => b.value - a.value);
        } else if (type === "trades") {
          const tradesSnapshot = await getDocs(collection(db, "trades"));
          const userTotals: { [key: string]: { username: string; total: number } } = {};

          tradesSnapshot.forEach((doc) => {
            const trade = doc.data();
            const senderId = trade.senderId;
            const receiverId = trade.receiverId;
            const tokens = trade.tokens || 0;

            if (!userTotals[senderId]) {
              userTotals[senderId] = { username: trade.senderUsername || "Anonymous", total: 0 };
            }
            userTotals[senderId].total += tokens;

            if (!userTotals[receiverId]) {
              userTotals[receiverId] = { username: trade.receiverUsername || "Anonymous", total: 0 };
            }
            userTotals[receiverId].total += tokens;
          });

          entries = Object.entries(userTotals)
            .map(([userId, { username, total }]) => ({
              userId,
              username,
              value: total,
            }))
            .sort((a, b) => b.value - a.value);
        } else if (type === "tokens") {
          const q = query(collection(db, "users"), where("tokenBalance", ">", 0));
          const snapshot = await getDocs(q);
          entries = snapshot.docs
            .map((doc) => {
              const data = doc.data();
              return {
                userId: doc.id,
                username: data.username || "Anonymous",
                value: data.tokenBalance || 0,
              };
            })
            .sort((a, b) => b.value - a.value);
        }

        setAllEntries(entries);
        setTotalEntries(entries.length);
      } catch (err: any) {
        setError("Failed to load leaderboard. Please try again.");
        console.error("[Leaderboard] Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [type, authUser]);

  // Paginate entries
  useEffect(() => {
    if (allEntries.length === 0) {
      setLeaderboard([]);
      return;
    }

    const startIndex = (currentPage - 1) * entriesPerPage;
    const endIndex = Math.min(startIndex + entriesPerPage, allEntries.length);
    const paginatedEntries = allEntries.slice(startIndex, endIndex);

    setLeaderboard(paginatedEntries);
  }, [allEntries, currentPage, entriesPerPage]);

  // Update entries per page and reset to page 1
  const handleEntriesPerPageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newPerPage = parseInt(event.target.value);
    setEntriesPerPage(newPerPage);
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalEntries / entriesPerPage);
  // REMOVED: getPageNumbers() and handlePageChange() functions

  const getRankIcon = (index: number, type: string) => {
    const globalIndex = index + (currentPage - 1) * entriesPerPage;
    if (globalIndex === 0) {
      return <Trophy size={24} className="text-yellow-400" />; // Gold trophy for #1
    } else if (globalIndex === 1) {
      return <Crown size={24} className="text-gray-300" />; // Silver crown for #2
    } else if (globalIndex === 2) {
      return <Star size={24} className="text-orange-500" />; // Bronze star for #3
    }
    // Type-specific icons for other ranks with a new color
    if (type === "tippers") {
      return <Flame size={24} className="text-teal-500" />;
    } else if (type === "trades") {
      return <Handshake size={24} className="text-teal-500" />;
    } else {
      return <Coin size={24} className="text-teal-500" />;
    }
  };

  const getBadgeColor = (index: number) => {
    const globalIndex = index + (currentPage - 1) * entriesPerPage;
    if (globalIndex === 0) {
      return "border-yellow-400"; // Gold badge for #1
    } else if (globalIndex === 1) {
      return "border-gray-300"; // Silver badge for #2
    } else if (globalIndex === 2) {
      return "border-orange-500"; // Bronze badge for #3
    }
    return ""; // No badge for ranks 4+
  };

  return (
    <div
      className={`min-h-screen p-6 ${theme === "dark" ? "bg-[#121212] text-gray-100" : "bg-gray-100 text-gray-900"}`}
    >
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-extrabold mb-8 text-center bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
          Gondola Bros Leaderboard
        </h1>
        <div className="mb-8 p-6 bg-[#1c1c1c] rounded-xl shadow-xl flex justify-center items-center">
          <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-6">
            <label className="text-gray-200 text-lg font-semibold">Filter by:</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "tippers" | "trades" | "tokens")}
              className="px-4 py-2 border rounded-lg bg-gray-800 border-gray-600 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all duration-200"
            >
              <option value="tippers">Top Tippers</option>
              <option value="trades">Top Traders</option>
              <option value="tokens">Token Whales</option>
            </select>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-6 text-center">{error}</p>}

        <div className="mb-8 p-6 bg-[#1c1c1c] rounded-xl shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">
              {type === "tippers" ? "Top Tippers" : type === "trades" ? "Top Traders" : "Token Whales"}
            </h2>
            <div className="flex items-center space-x-3">
              <label className="text-gray-200 font-medium">Show:</label>
              <select
                value={entriesPerPage}
                onChange={handleEntriesPerPageChange}
                className="px-3 py-1 border rounded-lg bg-gray-800 border-gray-600 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
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
            {loading ? (
              <div className="text-gray-200 text-center py-6">
                <Spinner size={32} className="animate-spin mx-auto mb-2" />
                <p>Loading leaderboard...</p>
              </div>
            ) : leaderboard.length > 0 ? (
              leaderboard.map((entry, index) => {
                const globalRank = index + (currentPage - 1) * entriesPerPage;
                console.log(`Entry #${globalRank + 1}: globalRank=${globalRank}, shouldHaveBorder=${globalRank < 3}`);
                return (
                  <div
                    key={entry.userId}
                    className={`p-3 bg-gray-800 rounded-lg shadow-md flex items-center space-x-4 hover:scale-105 hover:shadow-lg transition-transform duration-200 ${
                      globalRank < 3 ? `border-l-4 ${getBadgeColor(index)}` : ""
                    }`}
                  >
                    <div className="flex-shrink-0">{getRankIcon(index, type)}</div>
                    <div className="flex-1">
                      <p className="text-gray-100 font-medium">
                        #{globalRank + 1}: {entry.username}
                      </p>
                      <p className="text-gray-400 text-sm">
                        {type === "tippers"
                          ? `$${entry.value.toFixed(2)}`
                          : `${entry.value} ${type === "trades" ? "tokens traded" : "tokens"}`}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-gray-200 text-center py-6">No entries yet.</p>
            )}
          </div>
          
          {/* NEW: Using the Pagination component */}
          {totalEntries > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              isLoading={loading}
              className="mt-6"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;