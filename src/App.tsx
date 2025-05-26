import { Routes, Route } from "react-router-dom";
import Home from "./Home";
import Auth from "./components/auth/Auth";
import AuthAction from "./components/auth/AuthAction";
import Dashboard from "./components/Dashboard";
import Store from "./components/Store";
import ProtectedRoute from "./routes/ProtectedRoute";
import Tips from "./components/Tips";
import Leaderboard from "./components/Leaderboard";

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/auth/action" element={<AuthAction />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/store" element={<Store />} />
        <Route path="/tipjar" element={<Tips />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
      </Route>
    </Routes>
  );
};

export default App;