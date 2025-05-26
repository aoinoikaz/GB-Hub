import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/auth-context";

const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  if (loading) return <div className="text-center mt-5">Loading...</div>;

  return user ? <Outlet /> : <Navigate to="/auth" replace />;
};

export default ProtectedRoute;