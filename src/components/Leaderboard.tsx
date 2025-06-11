import { useState, useEffect } from "react";
import { useTheme } from "../context/theme-context";
import { useAuth } from "../context/auth-context";
import { collection, query, getDocs, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { Spinner, Trophy, Crown, Handshake, Coin, Star, Heart, Warning, Sparkle } from "phosphor-react";
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
      return <Trophy size={24} className="text-white" weight="fill" />; // Gold trophy for #1
    } else if (globalIndex === 1) {
      return <Crown size={24} className="text-white" weight="fill" />; // Silver crown for #2
    } else if (globalIndex === 2) {
      return <Star size={24} className="text-white" weight="fill" />; // Bronze star for #3
    }
    // Type-specific icons for other ranks
    if (type === "tippers") {
      return <Heart size={24} className="text-red-400" weight="fill" />;
    } else if (type === "trades") {
      return <Handshake size={24} className="text-blue-400" weight="fill" />;
    } else {
      return <Coin size={24} className="text-yellow-400" weight="fill" />;
    }
  };

  return (
    <div className={`min-h-screen ${theme === "dark" ? "bg-gray-950" : "bg-gray-50"}`}>
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative p-6 md:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-500 shadow-lg">
              <Trophy size={36} className="text-white" />
            </div>
            <h1 className={`text-4xl md:text-5xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
              Leaderboard
            </h1>
          </div>
          <p className={`text-lg ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
            See who's leading the Gondola Bros community
          </p>
        </div>

        {/* Filter Section */}
        <div className={`mb-10 p-8 rounded-3xl backdrop-blur-xl ${
          theme === "dark" 
            ? "bg-white/5 border border-white/10" 
            : "bg-white/70 border border-gray-200"
        }`}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <div className="flex items-center gap-3">
              <Sparkle size={20} className="text-yellow-400" />
              <p className={`font-medium ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                View Rankings For:
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {[
                { value: "tippers", label: "Top Supporters", icon: Heart, gradient: "from-red-500 to-pink-500" },
                { value: "trades", label: "Trading Leaders", icon: Handshake, gradient: "from-blue-500 to-purple-500" },
                { value: "tokens", label: "Token Whales", icon: Coin, gradient: "from-yellow-500 to-orange-500" }
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setType(option.value as any)}
                  className={`px-6 py-3 rounded-2xl font-medium transition-all flex items-center gap-2 ${
                    type === option.value
                      ? `bg-gradient-to-r ${option.gradient} text-white shadow-lg transform scale-105`
                      : theme === "dark"
                        ? "bg-gray-800/50 text-gray-300 hover:bg-gray-700/50"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <option.icon size={18} weight={type === option.value ? "fill" : "regular"} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl backdrop-blur-md">
            <p className="text-red-400 text-center flex items-center justify-center gap-2">
              <Warning size={20} weight="fill" />
              {error}
            </p>
          </div>
        )}

        {/* Main Leaderboard */}
        <div className={`p-8 rounded-3xl backdrop-blur-xl ${
          theme === "dark" 
            ? "bg-white/5 border border-white/10" 
            : "bg-white/70 border border-gray-200"
        }`}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl bg-gradient-to-br ${
                type === "tippers" ? "from-red-500 to-pink-500" :
                type === "trades" ? "from-blue-500 to-purple-500" :
                "from-yellow-500 to-orange-500"
              } shadow-lg`}>
                {type === "tippers" ? <Heart size={24} className="text-white" /> :
                 type === "trades" ? <Handshake size={24} className="text-white" /> :
                 <Coin size={24} className="text-white" />}
              </div>
              <div>
                <h2 className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  {type === "tippers" ? "Top Supporters" : type === "trades" ? "Trading Leaders" : "Token Whales"}
                </h2>
                <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  {type === "tippers" ? "Most generous community members" :
                   type === "trades" ? "Most active token traders" :
                   "Highest token holders"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                Show:
              </label>
              <select
                value={entriesPerPage}
                onChange={handleEntriesPerPageChange}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  theme === "dark" 
                    ? "bg-gray-800/50 text-white border border-gray-700 focus:border-purple-500" 
                    : "bg-white text-gray-900 border border-gray-300 focus:border-purple-500"
                } focus:outline-none focus:ring-2 focus:ring-purple-500/20`}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-12">
                <Spinner size={48} className="animate-spin mx-auto mb-4 text-purple-400" />
                <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                  Loading rankings...
                </p>
              </div>
            ) : leaderboard.length > 0 ? (
              leaderboard.map((entry, index) => {
                const globalRank = index + (currentPage - 1) * entriesPerPage;
                return (
                  <div
                    key={entry.userId}
                    className={`group relative overflow-hidden rounded-2xl backdrop-blur-xl border transition-all duration-300 hover:scale-[1.02] ${
                      theme === "dark" 
                        ? "bg-gradient-to-r from-gray-800/50 to-gray-900/50 border-white/10 hover:border-white/20" 
                        : "bg-gradient-to-r from-gray-50 to-gray-100 border-gray-200 hover:border-gray-300"
                    } ${globalRank < 3 ? `ring-2 ${
                      globalRank === 0 ? "ring-yellow-400/50" :
                      globalRank === 1 ? "ring-gray-300/50" :
                      "ring-orange-500/50"
                    }` : ""}`}
                  >
                    {/* Gradient overlay for top 3 */}
                    {globalRank < 3 && (
                      <div className={`absolute inset-0 bg-gradient-to-r ${
                        globalRank === 0 ? "from-yellow-500/10 to-orange-500/10" :
                        globalRank === 1 ? "from-gray-300/10 to-gray-400/10" :
                        "from-orange-500/10 to-red-500/10"
                      }`}></div>
                    )}
                    
                    <div className="relative p-6 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Rank Badge */}
                        <div className={`relative flex items-center justify-center w-14 h-14 rounded-2xl ${
                          globalRank === 0 ? "bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg shadow-yellow-500/30" :
                          globalRank === 1 ? "bg-gradient-to-br from-gray-300 to-gray-400 shadow-lg shadow-gray-400/30" :
                          globalRank === 2 ? "bg-gradient-to-br from-orange-400 to-red-500 shadow-lg shadow-orange-500/30" :
                          theme === "dark" ? "bg-gray-800" : "bg-gray-200"
                        }`}>
                          {globalRank < 3 ? (
                            getRankIcon(index, type)
                          ) : (
                            <span className={`text-lg font-bold ${
                              theme === "dark" ? "text-gray-400" : "text-gray-600"
                            }`}>#{globalRank + 1}</span>
                          )}
                        </div>
                        
                        {/* User Info */}
                        <div>
                          <p className={`text-lg font-semibold ${
                            theme === "dark" ? "text-white" : "text-gray-900"
                          }`}>
                            {entry.username}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className={`h-1.5 w-1.5 rounded-full ${
                              type === "tippers" ? "bg-red-400" :
                              type === "trades" ? "bg-blue-400" :
                              "bg-yellow-400"
                            }`}></div>
                            <p className={`text-sm ${
                              theme === "dark" ? "text-gray-400" : "text-gray-600"
                            }`}>
                              {globalRank === 0 ? "Champion" :
                               globalRank === 1 ? "Runner-up" :
                               globalRank === 2 ? "3rd Place" :
                               `Rank #${globalRank + 1}`}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Value Display */}
                      <div className="text-right">
                        <p className={`text-2xl font-bold ${
                          type === "tippers" ? "text-red-400" :
                          type === "trades" ? "text-blue-400" :
                          "text-yellow-400"
                        }`}>
                          {type === "tippers" ? `$${entry.value.toFixed(2)}` : entry.value.toLocaleString()}
                        </p>
                        <p className={`text-sm ${
                          theme === "dark" ? "text-gray-500" : "text-gray-500"
                        }`}>
                          {type === "tippers" ? "donated" :
                           type === "trades" ? "tokens traded" :
                           "tokens"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12">
                <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${
                  theme === "dark" ? "bg-gray-800" : "bg-gray-200"
                }`}>
                  <Trophy size={40} className={theme === "dark" ? "text-gray-600" : "text-gray-400"} />
                </div>
                <p className={`text-lg font-medium mb-2 ${
                  theme === "dark" ? "text-gray-300" : "text-gray-700"
                }`}>
                  No entries yet
                </p>
                <p className={theme === "dark" ? "text-gray-500" : "text-gray-500"}>
                  Be the first to make it on the leaderboard!
                </p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalEntries > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              isLoading={loading}
              className="mt-8"
              showPageNumbers={true}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;