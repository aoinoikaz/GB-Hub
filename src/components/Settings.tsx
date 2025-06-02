import { Sun, Moon, Camera, User, Bell, Lock, Palette, Database, Link, Eye, Trash, Download } from "phosphor-react";
import { useTheme } from "../context/theme-context";
import { useState, useEffect, useRef } from "react";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { useAuth } from "../context/auth-context";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebase";
import { Spinner } from "phosphor-react";

const Settings = () => {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"account" | "preferences" | "privacy" | "data">("account");
  const [username, setUsername] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [showEmail, setShowEmail] = useState(true);
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    updates: true,
    newsletter: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firestore = getFirestore();
  const functions = getFunctions(app);

  const tabs = [
    { id: "account", label: "Account", icon: User },
    { id: "preferences", label: "Preferences", icon: Palette },
    { id: "privacy", label: "Privacy", icon: Lock },
    { id: "data", label: "Data", icon: Database },
  ];

  const fetchProfileImage = async () => {
    if (!user) return;

    try {
      const userDoc = await getDoc(doc(firestore, `users/${user.uid}`));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setProfileImage(data.profileImage || null);
        setUsername(data.username || "");
        setEmail(user.email || "");
      }
    } catch (error) {
      console.error("Failed to fetch profile data:", error);
      setError("Failed to load profile data");
    }
  };

  useEffect(() => {
    fetchProfileImage();
  }, [user]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/bmp"];
      if (!validTypes.includes(file.type.toLowerCase())) {
        setError("Unsupported file type. Use PNG, JPEG, JPG, or BMP.");
        setSelectedFile(null);
        return;
      }
      const MAX_FILE_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        setError("File size exceeds 5MB limit.");
        setSelectedFile(null);
        return;
      }
      setError(null);
      setSelectedFile(file);
      
      // Preview the image
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setProfileImage(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadProfileImage = async () => {
    if (!selectedFile) {
      setError("Please select an image to upload.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      if (!user) throw new Error("User not authenticated");

      const base64String: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(selectedFile);
        reader.onloadend = () => {
          const result = reader.result?.toString().split(",")[1];
          if (!result || result.length === 0) {
            reject(new Error("Failed to encode image to base64"));
          } else {
            resolve(result);
          }
        };
        reader.onerror = () => reject(new Error("FileReader error"));
      });

      const payload = {
        fileName: selectedFile.name,
        contentType: selectedFile.type.toLowerCase(),
        file: base64String,
      };

      const uploadFunction = httpsCallable(functions, "uploadProfileImage");
      const result = await uploadFunction(payload);
      const data = result.data as { success: boolean; message: string; url: string; storagePath: string };

      console.log("Upload success:", data.message);
      await fetchProfileImage();
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
      console.error("Error uploading profile image:", error.message);
      setError("Failed to upload image: " + (error.message || "Unknown error"));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const event = { target: { files: [file] } } as any;
      handleFileChange(event);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className={`min-h-screen p-6 ${theme === "dark" ? "bg-[#121212]" : "bg-gray-50"}`}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className={`text-4xl font-bold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
            Settings
          </h1>
          <p className={`${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
            Manage your account and preferences
          </p>
        </div>

        {/* Main Settings Container */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Navigation */}
          <div className={`lg:w-64 ${theme === "dark" ? "bg-gray-900/50" : "bg-white"} rounded-2xl p-2 backdrop-blur-xl border ${theme === "dark" ? "border-white/10" : "border-gray-200"}`}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  activeTab === tab.id
                    ? theme === "dark"
                      ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-white"
                      : "bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-600"
                    : theme === "dark"
                      ? "text-gray-400 hover:text-white hover:bg-white/5"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <tab.icon size={20} weight={activeTab === tab.id ? "fill" : "regular"} />
                <span className="font-medium">{tab.label}</span>
                {activeTab === tab.id && (
                  <div className="ml-auto w-1 h-4 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1">
            {error && (
              <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-400">{error}</p>
              </div>
            )}

            {/* Account Tab */}
            {activeTab === "account" && (
              <div className="space-y-6">
                {/* Profile Section */}
                <div className={`p-6 rounded-2xl backdrop-blur-xl ${theme === "dark" ? "bg-gray-900/50 border border-white/10" : "bg-white border border-gray-200"}`}>
                  <h2 className={`text-xl font-bold mb-6 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    Profile Information
                  </h2>
                  
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Profile Image Upload */}
                    <div className="flex flex-col items-center">
                      <div 
                        className="relative group cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                      >
                        {profileImage ? (
                          <img
                            src={profileImage}
                            alt="Profile"
                            className="w-32 h-32 rounded-2xl object-cover group-hover:opacity-75 transition"
                          />
                        ) : (
                          <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center group-hover:opacity-75 transition">
                            <User size={48} className="text-white" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                          <div className="bg-black/50 rounded-full p-3">
                            <Camera size={24} className="text-white" />
                          </div>
                        </div>
                      </div>
                      
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/bmp"
                        onChange={handleFileChange}
                        className="hidden"
                        ref={fileInputRef}
                      />
                      
                      {selectedFile && (
                        <button
                          onClick={uploadProfileImage}
                          disabled={uploading}
                          className={`mt-4 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium transition ${
                            uploading ? "opacity-50 cursor-not-allowed" : "hover:shadow-lg"
                          }`}
                        >
                          {uploading ? <Spinner size={20} className="animate-spin" /> : "Upload Photo"}
                        </button>
                      )}
                    </div>

                    {/* Profile Fields */}
                    <div className="flex-1 space-y-4">
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                          Username
                        </label>
                        <input
                          type="text"
                          value={username}
                          readOnly
                          className={`w-full px-4 py-2 rounded-lg ${
                            theme === "dark" 
                              ? "bg-gray-800 text-white border border-gray-700" 
                              : "bg-gray-100 text-gray-900 border border-gray-300"
                          }`}
                        />
                      </div>
                      
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                          Email
                        </label>
                        <input
                          type="email"
                          value={email}
                          readOnly
                          className={`w-full px-4 py-2 rounded-lg ${
                            theme === "dark" 
                              ? "bg-gray-800 text-white border border-gray-700" 
                              : "bg-gray-100 text-gray-900 border border-gray-300"
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Security Section */}
                <div className={`p-6 rounded-2xl backdrop-blur-xl ${theme === "dark" ? "bg-gray-900/50 border border-white/10" : "bg-white border border-gray-200"}`}>
                  <h2 className={`text-xl font-bold mb-6 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    Security
                  </h2>
                  
                  <div className="space-y-4">
                    <button className="w-full md:w-auto px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:shadow-lg transition">
                      Change Password
                    </button>
                    
                    <div className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800/50" : "bg-gray-50"}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className={`font-medium ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                            Two-Factor Authentication
                          </h3>
                          <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                            Add an extra layer of security to your account
                          </p>
                        </div>
                        <button className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition">
                          Enable
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Preferences Tab */}
            {activeTab === "preferences" && (
              <div className="space-y-6">
                {/* Appearance */}
                <div className={`p-6 rounded-2xl backdrop-blur-xl ${theme === "dark" ? "bg-gray-900/50 border border-white/10" : "bg-white border border-gray-200"}`}>
                  <h2 className={`text-xl font-bold mb-6 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    Appearance
                  </h2>
                  
                  <div className={`flex items-center justify-between p-4 rounded-lg border transition ${
                    theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                  }`}>
                    <div className="flex items-center space-x-3">
                      {theme === "light" ? (
                        <Sun size={24} className="text-yellow-500" />
                      ) : (
                        <Moon size={24} className="text-blue-400" />
                      )}
                      <div>
                        <h3 className={`font-medium ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                          Dark Mode
                        </h3>
                        <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                          Toggle between light and dark themes
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={toggleTheme}
                      className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-lg transition"
                    >
                      Toggle
                    </button>
                  </div>
                </div>

                {/* Notifications */}
                <div className={`p-6 rounded-2xl backdrop-blur-xl ${theme === "dark" ? "bg-gray-900/50 border border-white/10" : "bg-white border border-gray-200"}`}>
                  <h2 className={`text-xl font-bold mb-6 flex items-center gap-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    <Bell size={24} />
                    Notifications
                  </h2>
                  
                  <div className="space-y-4">
                    {Object.entries(notifications).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <div>
                          <h3 className={`font-medium capitalize ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                            {key === "email" ? "Email Notifications" : 
                             key === "push" ? "Push Notifications" :
                             key === "updates" ? "Product Updates" : "Newsletter"}
                          </h3>
                          <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                            {key === "email" ? "Receive notifications via email" : 
                             key === "push" ? "Browser push notifications" :
                             key === "updates" ? "Get notified about new features" : "Monthly newsletter and tips"}
                          </p>
                        </div>
                        <button
                          onClick={() => setNotifications(prev => ({ ...prev, [key]: !value }))}
                          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                            value ? 'bg-purple-500' : theme === "dark" ? 'bg-gray-600' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-lg ${
                              value ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Privacy Tab */}
            {activeTab === "privacy" && (
              <div className="space-y-6">
                <div className={`p-6 rounded-2xl backdrop-blur-xl ${theme === "dark" ? "bg-gray-900/50 border border-white/10" : "bg-white border border-gray-200"}`}>
                  <h2 className={`text-xl font-bold mb-6 flex items-center gap-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    <Eye size={24} />
                    Privacy Settings
                  </h2>
                  
                  <div className="space-y-4">
                    <div className={`flex items-center justify-between p-4 rounded-lg ${theme === "dark" ? "bg-gray-800/50" : "bg-gray-50"}`}>
                      <div>
                        <h3 className={`font-medium ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                          Profile Visibility
                        </h3>
                        <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                          Control who can see your profile
                        </p>
                      </div>
                      <select className={`px-4 py-2 rounded-lg ${
                        theme === "dark" 
                          ? "bg-gray-700 text-white border border-gray-600" 
                          : "bg-white text-gray-900 border border-gray-300"
                      }`}>
                        <option>Everyone</option>
                        <option>Friends Only</option>
                        <option>Private</option>
                      </select>
                    </div>
                    
                    <div className={`flex items-center justify-between p-4 rounded-lg ${theme === "dark" ? "bg-gray-800/50" : "bg-gray-50"}`}>
                      <div>
                        <h3 className={`font-medium ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                          Show Email
                        </h3>
                        <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                          Display email on your public profile
                        </p>
                      </div>
                      <button
                        onClick={() => setShowEmail(!showEmail)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                          showEmail ? 'bg-purple-500' : theme === "dark" ? 'bg-gray-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-lg ${
                            showEmail ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Connected Accounts */}
                <div className={`p-6 rounded-2xl backdrop-blur-xl ${theme === "dark" ? "bg-gray-900/50 border border-white/10" : "bg-white border border-gray-200"}`}>
                  <h2 className={`text-xl font-bold mb-6 flex items-center gap-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    <Link size={24} />
                    Connected Accounts
                  </h2>
                  
                  <div className="space-y-3">
                    <div className={`flex items-center justify-between p-4 rounded-lg border ${theme === "dark" ? "bg-gray-800/50 border-gray-700" : "bg-gray-50 border-gray-300"}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#5865F2] rounded-lg flex items-center justify-center">
                          <span className="text-white font-bold">D</span>
                        </div>
                        <div>
                          <h3 className={`font-medium ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                            Discord
                          </h3>
                          <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                            Not connected
                          </p>
                        </div>
                      </div>
                      <button className="px-4 py-2 bg-[#5865F2] text-white rounded-lg hover:bg-[#4752C4] transition">
                        Connect
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Data Tab */}
            {activeTab === "data" && (
              <div className="space-y-6">
                <div className={`p-6 rounded-2xl backdrop-blur-xl ${theme === "dark" ? "bg-gray-900/50 border border-white/10" : "bg-white border border-gray-200"}`}>
                  <h2 className={`text-xl font-bold mb-6 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    Your Data
                  </h2>
                  
                  <div className="space-y-4">
                    <div className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800/50" : "bg-gray-50"}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className={`font-medium flex items-center gap-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                            <Download size={20} />
                            Download Your Data
                          </h3>
                          <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                            Get a copy of all your data
                          </p>
                        </div>
                        <button className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition">
                          Request
                        </button>
                      </div>
                    </div>
                    
                    <div className={`p-4 rounded-lg border ${theme === "dark" ? "bg-red-500/10 border-red-500/30" : "bg-red-50 border-red-300"}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className={`font-medium flex items-center gap-2 text-red-400`}>
                            <Trash size={20} />
                            Delete Account
                          </h3>
                          <p className={`text-sm ${theme === "dark" ? "text-red-400/70" : "text-red-600"}`}>
                            Permanently delete your account and data
                          </p>
                        </div>
                        <button className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;