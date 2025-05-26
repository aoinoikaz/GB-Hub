import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/theme-context';
import { MagnifyingGlass, X, List, Globe } from 'phosphor-react';
import { useAuth } from '../context/auth-context';

const NavigationBar = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isTransparent, setIsTransparent] = useState(true);

  useEffect(() => {
    const handleResize = () => setMenuOpen(false);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsTransparent(window.scrollY <= 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-10 px-6 py-3 transition ${
        isTransparent
          ? 'bg-transparent text-white'
          : theme === 'dark'
          ? 'bg-[#1C1C1E] text-white'
          : 'bg-white text-gray-900'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <div className="text-2xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
            GB
          </div>
          <div className="hidden lg:flex items-center space-x-6 font-sans text-sm font-medium uppercase">
            <a href="#" className="hover:text-primary transition tracking-wide">
              Who We Are
            </a>
            <a href="#" className="hover:text-primary transition tracking-wide">
              Work With Us
            </a>
            <a href="#" className="hover:text-primary transition tracking-wide">
              News
            </a>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Globe Icon */}
          <button
            className={`p-2 rounded-full transition ${
              isTransparent ? 'hover:bg-white/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Globe
              size={20}
              className={`${
                isTransparent
                  ? 'text-white'
                  : theme === 'dark'
                  ? 'text-gray-300'
                  : 'text-gray-700'
              }`}
            />
          </button>

          {/* Search Bar */}
          <div className="relative hidden lg:block">
            <input
              type="text"
              placeholder="Search"
              className={`px-4 py-2 pr-10 rounded-full border focus:outline-none focus:ring-2 ${
                isTransparent
                  ? 'bg-transparent text-white placeholder-white border-white focus:ring-white'
                  : theme === 'dark'
                  ? 'bg-transparent text-white placeholder-gray-400 border-gray-600 focus:ring-gray-400'
                  : 'bg-transparent text-gray-900 placeholder-gray-500 border-gray-300 focus:ring-gray-500'
              }`}
            />
            <MagnifyingGlass
              size={20}
              className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${
                isTransparent
                  ? 'text-white'
                  : theme === 'dark'
                  ? 'text-white'
                  : 'text-gray-500'
              }`}
            />
          </div>

          {/* Sign In / Dashboard Button */}
          <Link to={user ? '/dashboard' : '/auth'}>
            <button
              className={`hidden lg:block px-4 py-2 rounded-full font-sans text-sm font-medium uppercase tracking-wide border transition ${
                isTransparent
                  ? 'bg-transparent text-white border-white hover:bg-gradient-to-r from-purple-500 to-pink-500 hover:text-white'
                  : theme === 'dark'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 border-none'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 border-none'
              }`}
            >
              {user ? 'Dashboard' : 'Sign In'}
            </button>
          </Link>

          {/* Hamburger Menu */}
          <button
            className="block lg:hidden p-2 rounded-full bg-transparent hover:bg-gray-300 dark:hover:bg-gray-600 transition"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <List size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {menuOpen && (
        <div
          className={`absolute top-0 left-0 w-full h-screen p-6 ${
            theme === 'dark' ? 'bg-[#1C1C1E] text-white' : 'bg-white text-gray-900'
          } flex flex-col`}
        >
          {/* Close Button */}
          <div className="flex justify-between items-center">
            <div className="text-2xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
              GB
            </div>
            <button onClick={() => setMenuOpen(false)}>
              <X size={24} className="text-gray-400 hover:text-gray-200 transition" />
            </button>
          </div>

          <div className="mt-8 flex flex-col space-y-4 font-sans text-lg font-medium uppercase">
            <a href="#" className="hover:text-primary transition tracking-wide">
              Who We Are
            </a>
            <a href="#" className="hover:text-primary transition tracking-wide">
              Work With Us
            </a>
            <a href="#" className="hover:text-primary transition tracking-wide">
              News
            </a>
            <div className="relative">
              <input
                type="text"
                placeholder="Search"
                className={`px-4 py-2 pr-10 rounded-full border focus:outline-none focus:ring-2 w-full ${
                  theme === 'dark'
                    ? 'bg-transparent text-white placeholder-gray-400 border-gray-600 focus:ring-gray-400'
                    : 'bg-transparent text-gray-900 placeholder-gray-500 border-gray-300 focus:ring-gray-500'
                }`}
              />
              <MagnifyingGlass
                size={20}
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-500'
                }`}
              />
            </div>

            <Link to={user ? '/dashboard' : '/auth'}>
              <button
                className={`w-full px-4 py-3 rounded-lg font-sans text-lg font-medium uppercase tracking-wide border transition ${
                  theme === 'dark'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 border-none'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 border-none'
                }`}
              >
                {user ? 'Dashboard' : 'Sign In'}
              </button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default NavigationBar;