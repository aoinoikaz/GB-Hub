// src/components/ModernDashboard.tsx - Modern Services Grid
import { useTheme } from "../context/theme-context";
import { useAuth } from "../context/auth-context";
import { 
  GameController, PlayCircle, Code, Coin, Rocket, 
  Lightning, Cloud, Shield, Star,
  ArrowRight, Sparkle
} from "phosphor-react";

const Dashboard = () => {
  const { theme } = useTheme();
  const { user } = useAuth();

  const services = [
    {
      id: "games",
      title: "Game Development",
      description: "Create immersive gaming experiences",
      icon: GameController,
      gradient: "from-orange-500 to-red-500",
      features: ["Unity & Unreal", "Multiplayer Systems", "Game Design"],
      status: "Coming Soon",
      link: "/dashboard/games"
    },
    {
      id: "media",
      title: "Media Streaming",
      description: "Your personal Netflix experience",
      icon: PlayCircle,
      gradient: "from-purple-500 to-pink-500",
      features: ["4K Streaming", "Offline Downloads", "Request System"],
      status: "Active",
      link: "/dashboard/media"
    },
    {
      id: "dev",
      title: "Dev Tools & Cloud",
      description: "Professional development environment",
      icon: Code,
      gradient: "from-blue-500 to-cyan-500",
      features: ["Cloud IDE", "CI/CD Pipeline", "Container Registry"],
      status: "Beta",
      link: "/dashboard/dev"
    },
    {
      id: "store",
      title: "Token Economy",
      description: "Manage your digital assets",
      icon: Coin,
      gradient: "from-yellow-500 to-orange-500",
      features: ["Buy Tokens", "Trade System", "Rewards Program"],
      status: "Active",
      link: "/store"
    }
  ];

  const stats = [
    { label: "Active Services", value: "3", icon: Lightning },
    { label: "Storage Used", value: "245 GB", icon: Cloud },
    { label: "Security Score", value: "98%", icon: Shield },
    { label: "Member Since", value: "2024", icon: Star }
  ];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className={`min-h-screen ${theme === "dark" ? "bg-gray-950" : "bg-gray-50"}`}>
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative p-6 md:p-8 max-w-7xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-12 text-center md:text-left">
          <h1 className={`text-4xl md:text-5xl font-bold mb-2 ${
            theme === "dark" ? "text-white" : "text-gray-900"
          }`}>
            {getGreeting()}, {user?.displayName || "Developer"}!
          </h1>
          <p className={`text-lg ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
            Welcome to your unified development hub
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {stats.map((stat, index) => (
            <div
              key={index}
              className={`relative overflow-hidden rounded-2xl p-6 backdrop-blur-xl ${
                theme === "dark" 
                  ? "bg-white/5 border border-white/10" 
                  : "bg-white/70 border border-gray-200"
              }`}
            >
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-purple-500/20 to-transparent rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <stat.icon size={24} className={theme === "dark" ? "text-purple-400" : "text-purple-600"} />
                  <Sparkle size={16} className="text-yellow-400" />
                </div>
                <p className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  {stat.value}
                </p>
                <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Services Grid */}
        <div className="mb-8">
          <h2 className={`text-2xl font-bold mb-6 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
            Your Services
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {services.map((service) => (
              <div
                key={service.id}
                className={`group relative overflow-hidden rounded-3xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                  theme === "dark" 
                    ? "bg-white/5 border border-white/10 hover:border-white/20" 
                    : "bg-white/70 border border-gray-200 hover:border-gray-300"
                }`}
              >
                {/* Background Gradient */}
                <div className={`absolute inset-0 bg-gradient-to-br ${service.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
                
                {/* Content */}
                <div className="relative p-8">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div className={`p-4 rounded-2xl bg-gradient-to-br ${service.gradient} shadow-lg group-hover:shadow-xl transition-shadow`}>
                      <service.icon size={28} className="text-white" />
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      service.status === "Active" 
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : service.status === "Beta"
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                    }`}>
                      {service.status}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 className={`text-2xl font-bold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    {service.title}
                  </h3>
                  <p className={`mb-6 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    {service.description}
                  </p>

                  {/* Features */}
                  <div className="space-y-2 mb-6">
                    {service.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${service.gradient}`} />
                        <span className={`text-sm ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Action Button */}
                  <button className={`w-full py-3 px-6 rounded-xl font-medium transition-all flex items-center justify-center gap-2 group-hover:gap-3 ${
                    service.status === "Active" || service.status === "Beta"
                      ? `bg-gradient-to-r ${service.gradient} text-white shadow-lg hover:shadow-xl`
                      : theme === "dark"
                      ? "bg-gray-800 text-gray-400"
                      : "bg-gray-200 text-gray-600"
                  }`}>
                    <span>{service.status === "Coming Soon" ? "Notify Me" : "Open"}</span>
                    <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                  </button>
                </div>

                {/* Decorative Elements */}
                <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className={`rounded-3xl p-8 backdrop-blur-xl ${
          theme === "dark" 
            ? "bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-white/10" 
            : "bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200"
        }`}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className={`text-xl font-bold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                Ready to build something amazing?
              </h3>
              <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                Explore our tools and start creating today
              </p>
            </div>
            <div className="flex gap-4">
              <button className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg transition-all flex items-center gap-2">
                <Rocket size={20} />
                <span>Start Project</span>
              </button>
              <button className={`px-6 py-3 rounded-xl font-medium transition-all ${
                theme === "dark" 
                  ? "bg-white/10 text-white hover:bg-white/20" 
                  : "bg-white text-gray-900 hover:bg-gray-100"
              }`}>
                Learn More
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;