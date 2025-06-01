import React, { createContext, useContext, useEffect, useState } from "react";

// Type definitions for the theme context
interface ThemeContextType {
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const getStoredTheme = (): "light" | "dark" => {
  if (typeof window === 'undefined') return "dark";
  
  try {
    const stored = window.localStorage?.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch (error) {
    console.warn("localStorage not available:", error);
  }
  
  // Check system preference as fallback
  try {
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  } catch (error) {
    console.warn("matchMedia not available:", error);
  }
  
  return "dark"; // Default to dark theme
};

const setStoredTheme = (theme: "light" | "dark") => {
  try {
    window.localStorage?.setItem("theme", theme);
  } catch (error) {
    console.warn("Could not save theme preference:", error);
  }
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<"light" | "dark">(getStoredTheme);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    setStoredTheme(newTheme);
    
    // Update document class
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(newTheme);
  };

  useEffect(() => {
    // Set initial theme class
    document.documentElement.classList.add(theme);
    
    // Listen for system theme changes
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      if (!window.localStorage?.getItem("theme")) {
        // Only update if user hasn't set a preference
        const newTheme = e.matches ? "dark" : "light";
        setTheme(newTheme);
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(newTheme);
      }
    };
    
    mediaQuery?.addEventListener?.("change", handleChange);
    return () => mediaQuery?.removeEventListener?.("change", handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};