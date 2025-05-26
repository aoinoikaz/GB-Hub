// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./context/theme-context";
import { AuthProvider } from "./context/auth-context";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PayPalScriptProvider
      options={{
        clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID,
        components: "buttons",
        currency: "USD",
        disableFunding: "venmo",
      }}
    >
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </PayPalScriptProvider>
  </React.StrictMode>
);