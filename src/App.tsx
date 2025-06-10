// src/App.tsx - Fixed route structure
import { Routes, Route } from "react-router-dom";
//import { useState, useEffect } from "react";
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