// src/App.tsx - Fixed route structure
import { Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import Home from "./Home";
import Auth from "./components/auth/Auth";
import AuthAction from "./components/auth/AuthAction";
import Dashboard from "./components/Dashboard";
import MediaDashboard from "./components/MediaDashboard";
import Store from "./components/Store";
import Settings from "./components/Settings";
import ProtectedRoute from "./routes/ProtectedRoute";
import Layout from "./components/Layout";
import Tips from "./components/Tips";
import Leaderboard from "./components/Leaderboard";

const App = () => {
  // ============ LAUNCH COUNTDOWN - DELETE THIS ENTIRE BLOCK AFTER LAUNCH ============
  // Delete from here...
  const launchTime = new Date("2025-06-10T21:00:00-05:00"); // 9 PM EST - JUNE 10, 2025
  const [timeLeft, setTimeLeft] = useState(launchTime.getTime() - new Date().getTime());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(launchTime.getTime() - new Date().getTime());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  if (timeLeft > 0) {
    const hours = Math.floor(timeLeft / (1000 * 60 * 60) - 1);
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-pink-900 flex items-center justify-center relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute top-40 right-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        </div>
        
        <div className="text-center z-10 px-6 max-w-6xl mx-auto py-8">
          {/* Logo/Title */}
          <div className="mb-16">
            <h1 className="text-7xl md:text-8xl font-black mb-6">
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                GONDOLA BROS
              </span>
            </h1>
            <p className="text-2xl text-gray-300">Media • Games • Development</p>
          </div>
          
          {/* Countdown */}
          <div className="mb-20">
            <p className="text-gray-400 text-lg mb-8 uppercase tracking-widest">Launching In</p>
            <div className="flex justify-center gap-4 md:gap-8">
              <div className="text-center">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 md:p-8 border border-white/20 shadow-2xl">
                  <div className="text-4xl md:text-6xl font-bold text-white font-mono">
                    {hours.toString().padStart(2, '0')}
                  </div>
                </div>
                <p className="text-gray-400 mt-3 text-sm uppercase tracking-wider">Hours</p>
              </div>
              <div className="text-center">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 md:p-8 border border-white/20 shadow-2xl">
                  <div className="text-4xl md:text-6xl font-bold text-white font-mono">
                    {minutes.toString().padStart(2, '0')}
                  </div>
                </div>
                <p className="text-gray-400 mt-3 text-sm uppercase tracking-wider">Minutes</p>
              </div>
              <div className="text-center">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 md:p-8 border border-white/20 shadow-2xl">
                  <div className="text-4xl md:text-6xl font-bold text-white font-mono">
                    {seconds.toString().padStart(2, '0')}
                  </div>
                </div>
                <p className="text-gray-400 mt-3 text-sm uppercase tracking-wider">Seconds</p>
              </div>
            </div>
          </div>
          
          {/* Launch Info */}
          <div className="mb-16">
            <p className="text-3xl font-bold text-white mb-3">June 10th, 9:00 PM EST</p>
            <p className="text-gray-400 text-lg">Get ready for something amazing</p>
          </div>
          
          {/* FAQ/Info Section */}
          <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-8 border border-white/10 hover:bg-white/10 transition-all duration-300">
              <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-3">
                <span className="text-purple-400 text-2xl">✦</span> Registration Opens
              </h3>
              <p className="text-gray-400 text-base leading-relaxed">Sign-ups go live at exactly 9:00 PM EST. Be ready!</p>
            </div>
            
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-8 border border-white/10 hover:bg-white/10 transition-all duration-300">
              <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-3">
                <span className="text-green-400 text-2xl">✦</span> Join Discord
              </h3>
              <p className="text-gray-400 text-base leading-relaxed">Get updates and connect: discord.gg/vzWfWX9MNG</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  // ...delete to here
  // ============ END OF LAUNCH COUNTDOWN ============
  
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Home />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/auth/action" element={<AuthAction />} />
      
      {/* Protected Routes with Layout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout><Dashboard /></Layout>} path="/dashboard" />
        <Route element={<Layout><MediaDashboard /></Layout>} path="/media" />
        <Route element={<Layout><Store /></Layout>} path="/store" />
        <Route element={<Layout><Settings /></Layout>} path="/settings" />
        <Route element={<Layout><Leaderboard /></Layout>} path="/leaderboard" />
        
        {/* Tips doesn't use Layout (it's a special page) */}
        <Route element={<Tips />} path="/tipjar" />
        
        {/* Future Routes */}
        <Route element={<Layout><div className="p-8 text-center"><h1 className="text-3xl font-bold">Games Coming Soon!</h1></div></Layout>} path="/games" />
        <Route element={<Layout><div className="p-8 text-center"><h1 className="text-3xl font-bold">Dev Tools Coming Soon!</h1></div></Layout>} path="/dev" />
      </Route>
    </Routes>
  );
};

export default App;