// src/components/auth/TwoFactorSetup.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../context/theme-context";
import { useAuth } from "../../context/auth-context";
import { getFunctions, httpsCallable } from "firebase/functions";
import { ArrowLeft, Shield, CheckCircle, X, Spinner, Copy, Warning, ShieldCheck } from "phosphor-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../config/firebase";

const TwoFactorSetup = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const functions = getFunctions();
  
  const [qrData, setQrData] = useState<{secret: string; qrCodeUrl: string; manualEntryKey: string} | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'setup' | 'backup'>('setup');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [confirmingDisable, setConfirmingDisable] = useState(false);

  useEffect(() => {
    // Check if user is authenticated
    if (!user) {
      navigate('/auth');
      return;
    }
    
    // Check 2FA status
    checkStatus();
  }, [user, navigate]);

  const checkStatus = async () => {
    if (!user) return;
    
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.twoFactorEnabled) {
          setIs2FAEnabled(true);
        } else {
          // Only generate QR if 2FA is not enabled
          initiate2FA();
        }
      } else {
        initiate2FA();
      }
    } catch (error) {
      console.error("Error checking 2FA status:", error);
      initiate2FA();
    } finally {
      setCheckingStatus(false);
    }
  };

  const initiate2FA = async () => {
    setLoading(true);
    setError(null);
    try {
      const initiate2FA = httpsCallable(functions, "initiate2FA");
      const result = await initiate2FA();
      setQrData(result.data as any);
    } catch (error: any) {
      setError(error.message || "Failed to initialize 2FA");
      console.error("2FA init error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    if (!qrData) {
      setError("No QR data available");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call verify2FA function with the secret and token
      const verify2FA = httpsCallable(functions, "verify2FA");
      const result = await verify2FA({
        secret: qrData.secret,
        token: verificationCode
      });
      
      const data = result.data as { success: boolean; backupCodes?: string[] };
      
      if (data.success && data.backupCodes) {
        setBackupCodes(data.backupCodes);
        setStep('backup');
      } else {
        throw new Error("Verification failed");
      }
    } catch (error: any) {
      setError(error.message || "Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const copyAllCodes = () => {
    const allCodes = backupCodes.join('\n');
    navigator.clipboard.writeText(allCodes);
    setCopiedCode('all');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleDisable2FA = async () => {
    setLoading(true);
    setError(null);
    try {
      const disable2FA = httpsCallable(functions, "disable2FA");
      await disable2FA();
      setIs2FAEnabled(false);
      navigate('/settings');
    } catch (error: any) {
      setError(error.message || "Failed to disable 2FA");
    } finally {
      setLoading(false);
      setConfirmingDisable(false);
    }
  };

  // BACKUP CODES SCREEN
  if (step === 'backup') {
    return (
      <div className={`min-h-screen ${theme === "dark" ? "bg-gray-950" : "bg-gray-50"}`}>
        <div className="p-6 md:p-8 max-w-2xl mx-auto">
          <div className={`mb-8 p-8 rounded-3xl backdrop-blur-xl ${
            theme === "dark" 
              ? "bg-white/5 border border-white/10" 
              : "bg-white/70 border border-gray-200"
          }`}>
            <div className="text-center mb-8">
              <div className="inline-flex p-4 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 mb-4">
                <CheckCircle size={48} className="text-white" weight="fill" />
              </div>
              <h1 className={`text-3xl font-bold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                2FA Enabled Successfully!
              </h1>
              <p className={`${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                Save these backup codes in a safe place
              </p>
            </div>

            <div className={`p-6 rounded-2xl mb-6 ${
              theme === "dark" ? "bg-gray-800/50" : "bg-gray-100"
            }`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-lg font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  Backup Codes
                </h2>
                <button
                  onClick={copyAllCodes}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    theme === "dark"
                      ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  }`}
                >
                  <Copy size={16} />
                  {copiedCode === 'all' ? 'Copied!' : 'Copy All'}
                </button>
              </div>
              
              <p className={`text-sm mb-4 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                Use these codes to access your account if you lose your authenticator device. Each code can only be used once.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {backupCodes.map((code, index) => (
                  <div
                    key={index}
                    onClick={() => copyToClipboard(code)}
                    className={`p-3 rounded-lg font-mono text-sm cursor-pointer transition-all ${
                      copiedCode === code
                        ? "bg-green-500/20 text-green-400"
                        : theme === "dark"
                          ? "bg-gray-700/50 hover:bg-gray-700 text-gray-300"
                          : "bg-white hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <div className={`p-4 rounded-xl flex items-start gap-3 mb-6 ${
              theme === "dark" 
                ? "bg-yellow-500/10 border border-yellow-500/20" 
                : "bg-yellow-50 border border-yellow-200"
            }`}>
              <Shield size={20} className="text-yellow-500 mt-0.5" />
              <p className={`text-sm ${theme === "dark" ? "text-yellow-200" : "text-yellow-800"}`}>
                Store these codes securely. You won't be able to see them again after leaving this page.
              </p>
            </div>

            <button
              onClick={() => navigate('/settings')}
              className="w-full py-3 px-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // SETUP SCREEN
  return (
    <div className={`min-h-screen ${theme === "dark" ? "bg-gray-950" : "bg-gray-50"}`}>
      <div className="p-6 md:p-8 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/settings')}
            className={`p-2 rounded-lg transition-all ${
              theme === "dark" 
                ? "hover:bg-white/10 text-gray-400 hover:text-white" 
                : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
            }`}
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
              {is2FAEnabled ? "Manage Two-Factor Authentication" : "Set Up Two-Factor Authentication"}
            </h1>
            <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
              {is2FAEnabled ? "Your account is protected with 2FA" : "Add an extra layer of security to your account"}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl backdrop-blur-md">
            <p className="text-red-400 flex items-center gap-2">
              <X size={20} weight="bold" />
              {error}
            </p>
          </div>
        )}

        {/* Loading State */}
        {checkingStatus ? (
          <div className={`p-8 rounded-3xl backdrop-blur-xl ${
            theme === "dark" 
              ? "bg-white/5 border border-white/10" 
              : "bg-white/70 border border-gray-200"
          }`}>
            <div className="text-center py-12">
              <Spinner size={48} className="animate-spin mx-auto mb-4 text-purple-400" />
              <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                Loading...
              </p>
            </div>
          </div>
        ) : is2FAEnabled ? (
          /* 2FA IS ALREADY ENABLED - SHOW MANAGE VIEW */
          <div className={`p-8 rounded-3xl backdrop-blur-xl ${
            theme === "dark" 
              ? "bg-white/5 border border-white/10" 
              : "bg-white/70 border border-gray-200"
          }`}>
            <div className="text-center mb-8">
              <div className="inline-flex p-4 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 mb-4">
                <ShieldCheck size={48} className="text-white" />
              </div>
              <h2 className={`text-2xl font-bold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                2FA is Active
              </h2>
              <p className={`${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                Your account is protected with two-factor authentication
              </p>
            </div>

            <div className={`p-6 rounded-2xl mb-6 ${
              theme === "dark" ? "bg-gray-800/50" : "bg-gray-100"
            }`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle size={24} weight="fill" className="text-green-500" />
                    <span className={`font-medium ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      2FA is enabled
                    </span>
                  </div>
                  <span className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    Active
                  </span>
                </div>
              </div>
            </div>

            <div className={`p-4 rounded-xl flex items-start gap-3 mb-6 ${
              theme === "dark" 
                ? "bg-yellow-500/10 border border-yellow-500/20" 
                : "bg-yellow-50 border border-yellow-200"
            }`}>
              <Warning size={20} className="text-yellow-500 mt-0.5" />
              <div>
                <p className={`text-sm font-medium mb-1 ${theme === "dark" ? "text-yellow-200" : "text-yellow-800"}`}>
                  Keep your backup codes safe
                </p>
                <p className={`text-sm ${theme === "dark" ? "text-yellow-300/80" : "text-yellow-700"}`}>
                  You'll need them if you lose access to your authenticator app
                </p>
              </div>
            </div>

            {!confirmingDisable ? (
              <button
                onClick={() => setConfirmingDisable(true)}
                disabled={loading}
                className={`w-full py-3 px-6 rounded-xl font-medium transition-all ${
                  loading
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                } ${
                  theme === "dark"
                    ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-red-50 hover:bg-red-100 text-red-600 border border-red-300"
                }`}
              >
                Disable Two-Factor Authentication
              </button>
            ) : (
              <div className={`p-6 rounded-2xl ${
                theme === "dark" ? "bg-red-500/10 border border-red-500/30" : "bg-red-50 border border-red-200"
              }`}>
                <h3 className={`text-lg font-semibold mb-3 ${
                  theme === "dark" ? "text-red-400" : "text-red-700"
                }`}>
                  Are you sure?
                </h3>
                <p className={`text-sm mb-4 ${
                  theme === "dark" ? "text-red-300/80" : "text-red-600"
                }`}>
                  Disabling 2FA will make your account less secure. You'll need to set it up again if you want to re-enable it.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmingDisable(false)}
                    className={`flex-1 py-2 px-4 rounded-xl font-medium transition-all ${
                      theme === "dark"
                        ? "bg-gray-700 hover:bg-gray-600 text-white"
                        : "bg-gray-200 hover:bg-gray-300 text-gray-900"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDisable2FA}
                    disabled={loading}
                    className={`flex-1 py-2 px-4 rounded-xl font-medium transition-all ${
                      loading
                        ? "bg-gray-500 text-gray-300 cursor-not-allowed"
                        : "bg-gradient-to-r from-red-500 to-red-600 text-white hover:shadow-lg"
                    }`}
                  >
                    {loading ? <Spinner size={20} className="animate-spin mx-auto" /> : "Yes, Disable"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* SETUP CARD - Original setup flow */
          <div className={`p-8 rounded-3xl backdrop-blur-xl ${
            theme === "dark" 
              ? "bg-white/5 border border-white/10" 
              : "bg-white/70 border border-gray-200"
          }`}>
            {loading && !qrData ? (
              <div className="text-center py-12">
                <Spinner size={48} className="animate-spin mx-auto mb-4 text-purple-400" />
                <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
                  Generating secure code...
                </p>
              </div>
            ) : qrData ? (
              <div className="space-y-8">
                {/* Step 1 - QR Code */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold">
                      1
                    </div>
                    <h2 className={`text-lg font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      Scan QR Code
                    </h2>
                  </div>
                  
                  <p className={`mb-6 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    Use your authenticator app (Google Authenticator, Authy, etc.) to scan this code
                  </p>

                  <div className="flex justify-center mb-6">
                    <div className="p-6 bg-white rounded-2xl shadow-lg">
                      <img src={qrData.qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />
                    </div>
                  </div>

                  <div className={`p-4 rounded-xl ${
                    theme === "dark" ? "bg-gray-800/50" : "bg-gray-100"
                  }`}>
                    <p className={`text-sm mb-2 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                      Can't scan? Enter this code manually:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className={`flex-1 text-sm font-mono break-all ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                        {qrData.manualEntryKey}
                      </code>
                      <button
                        onClick={() => copyToClipboard(qrData.manualEntryKey)}
                        className={`p-2 rounded-lg transition-all flex-shrink-0 ${
                          copiedCode === qrData.manualEntryKey
                            ? "bg-green-500/20 text-green-400"
                            : theme === "dark"
                              ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                              : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                        }`}
                        title="Copy to clipboard"
                      >
                        {copiedCode === qrData.manualEntryKey ? (
                          <CheckCircle size={16} weight="fill" />
                        ) : (
                          <Copy size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 2 - Verify */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold">
                      2
                    </div>
                    <h2 className={`text-lg font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      Verify Setup
                    </h2>
                  </div>

                  <p className={`mb-4 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    Enter the 6-digit code from your authenticator app
                  </p>

                  <div className="space-y-4">
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className={`w-full px-4 py-4 rounded-xl text-center font-mono text-2xl tracking-[0.5em] ${
                        theme === "dark" 
                          ? "bg-gray-800/50 text-white border border-gray-700 focus:border-purple-500" 
                          : "bg-white text-gray-900 border border-gray-300 focus:border-purple-500"
                      } focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all`}
                      maxLength={6}
                    />

                    <button
                      onClick={handleVerify}
                      disabled={loading || verificationCode.length !== 6}
                      className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                        verificationCode.length === 6
                          ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg"
                          : theme === "dark"
                            ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                            : "bg-gray-200 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {loading ? (
                        <Spinner size={20} className="animate-spin" />
                      ) : (
                        <>
                          <Shield size={20} />
                          Enable 2FA
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default TwoFactorSetup;