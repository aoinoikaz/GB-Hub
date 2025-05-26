import NavigationBar from "./components/NavigationBar";
import Footer from "./components/Footer";
import { useTheme } from "./context/theme-context";
import { GameController, DesktopTower, Users, Lightbulb, Heart, Rocket, ArrowRight } from "phosphor-react";

const Home = () => {
  const { theme } = useTheme();

  return (
    <div className={`flex flex-col min-h-screen ${theme === "dark" ? "bg-[#1f1f1f] text-gray-100" : "bg-gray-100 text-gray-900"}`}>
      <NavigationBar />

      {/* Hero Section - No Text */}
      <section className="relative w-full h-screen overflow-hidden">
        <video
          src="/hero.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        ></video>
      </section>

      {/* Our Core Services */}
      <section className="w-full max-w-6xl mx-auto px-6 py-12 flex-grow">
        <h2 className="text-4xl font-bold text-center mb-4">Our Core Services</h2>
        <p className="text-center text-gray-400 mb-16">
          Expert solutions in development, infrastructure, and community engagement.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Game & Software Development */}
          <div className={`p-8 ${theme === "dark" ? "bg-gray-800 text-gray-100" : "bg-white text-gray-900"} rounded-lg shadow-lg text-center`}>
            <GameController size={60} className="mx-auto mb-6 text-blue-400" />
            <h3 className="text-2xl font-semibold mb-3">Game & Software Development</h3>
            <p className="text-base">Develop video games, web, mobile, and blockchain solutions with full-stack expertise.</p>
          </div>

          {/* IT Infrastructure */}
          <div className={`p-8 ${theme === "dark" ? "bg-gray-800 text-gray-100" : "bg-white text-gray-900"} rounded-lg shadow-lg text-center`}>
            <DesktopTower size={60} className="mx-auto mb-6 text-purple-400" />
            <h3 className="text-2xl font-semibold mb-3">IT Infrastructure</h3>
            <p className="text-base">Provide scalable cloud and self-hosted infrastructure for optimal performance.</p>
          </div>

          {/* Community Engagement */}
          <div className={`p-8 ${theme === "dark" ? "bg-gray-800 text-gray-100" : "bg-white text-gray-900"} rounded-lg shadow-lg text-center`}>
            <Users size={60} className="mx-auto mb-6 text-yellow-400" />
            <h3 className="text-2xl font-semibold mb-3">Community Engagement</h3>
            <p className="text-base">Join our community to connect, collaborate, and unlock exclusive opportunities.</p>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="w-full max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-4xl font-bold text-center mb-4">Why Choose Us</h2>
        <p className="text-center text-gray-400 mb-16">We’re committed to delivering exceptional solutions that drive innovation.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="text-center">
            <Lightbulb size={60} className="mx-auto mb-6 text-blue-400" />
            <h3 className="text-2xl font-semibold mb-3">Innovative Solutions</h3>
            <p className="text-base">We use the latest tools to deliver forward-thinking solutions.</p>
          </div>

          <div className="text-center">
            <Heart size={60} className="mx-auto mb-6 text-red-400" />
            <h3 className="text-2xl font-semibold mb-3">Community-Driven</h3>
            <p className="text-base">Our platform thrives on collaboration and user engagement.</p>
          </div>

          <div className="text-center">
            <Rocket size={60} className="mx-auto mb-6 text-purple-400" />
            <h3 className="text-2xl font-semibold mb-3">Scalable Technology</h3>
            <p className="text-base">Our solutions grow with your needs, from startups to enterprises.</p>
          </div>
        </div>
      </section>

      {/* Get Started Section */}
      <section className="w-full bg-gradient-to-r from-purple-500 to-pink-500 py-16">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to Join?</h2>
          <p className="text-lg text-white mb-8">Start building, collaborating, and innovating with us today.</p>
          <a
            href="/dashboard"
            className="inline-flex items-center px-6 py-3 bg-white text-purple-600 rounded-md font-semibold hover:bg-gray-100"
          >
            Join Now <ArrowRight size={20} className="ml-2" />
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Home;