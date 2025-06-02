import { Sun, Moon, Camera, User, Bell, Link, Trash, Download, Shield, Globe, Envelope, Megaphone } from "phosphor-react";
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
  const [username, setUsername] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    updates: true,
    newsletter: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firestore = getFirestore();
  const functions = getFunctions(app);

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
    <div className={`p-6 md:p-8 max-w-4xl mx-auto`}>
      {/* Header */}
      <div className="mb-8">
        <h1 className={`text-3xl font-bold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
          Settings
        </h1>
        <p className={`${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
          Manage your account preferences and privacy
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl backdrop-blur-md">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Profile Section */}
      <div className={`mb-8 p-8 rounded-3xl backdrop-blur-xl ${
        theme === "dark" 
          ? "bg-white/5 border border-white/10" 
          : "bg-white/70 border border-gray-200"
      }`}>
        <h2 className={`text-2xl font-bold mb-6 flex items-center gap-3 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
          <User size={28} weight="duotone" className="text-purple-500" />
          Profile Information
        </h2>
        
        <div className="flex flex-col md:flex-row gap-8">
          {/* Profile Image */}
          <div className="flex flex-col items-center">
            <div 
              className="relative group cursor-pointer mb-4"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              {profileImage ? (
                <img
                  src={profileImage}
                  alt="Profile"
                  className="w-32 h-32 rounded-3xl object-cover group-hover:opacity-75 transition-all duration-200 ring-4 ring-purple-500/20"
                />
              ) : (
                <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center group-hover:opacity-75 transition-all duration-200">
                  <User size={48} className="text-white" />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200">
                <div className="bg-black/70 rounded-2xl p-3 backdrop-blur-sm">
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
                className={`px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium transition-all ${
                  uploading ? "opacity-50 cursor-not-allowed" : "hover:shadow-lg hover:scale-105"
                }`}
              >
                {uploading ? <Spinner size={20} className="animate-spin" /> : "Upload Photo"}
              </button>
            )}
          </div>

          {/* Profile Fields */}
          <div className="flex-1 space-y-6">
            <div>
              <label className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Username
              </label>
              <div className={`px-4 py-3 rounded-xl flex items-center gap-3 ${
                theme === "dark" 
                  ? "bg-gray-800/50 text-white border border-gray-700" 
                  : "bg-gray-100 text-gray-900 border border-gray-300"
              }`}>
                <User size={20} className="text-gray-400" />
                <span>{username}</span>
              </div>
            </div>
            
            <div>
              <label className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Email Address
              </label>
              <div className={`px-4 py-3 rounded-xl flex items-center gap-3 ${
                theme === "dark" 
                  ? "bg-gray-800/50 text-white border border-gray-700" 
                  : "bg-gray-100 text-gray-900 border border-gray-300"
              }`}>
                <Envelope size={20} className="text-gray-400" />
                <span>{email}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Appearance Card */}
        <div className={`p-6 rounded-3xl backdrop-blur-xl ${
          theme === "dark" 
            ? "bg-white/5 border border-white/10" 
            : "bg-white/70 border border-gray-200"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${
                theme === "dark" ? "bg-purple-500/20" : "bg-purple-100"
              }`}>
                {theme === "light" ? (
                  <Sun size={24} className="text-yellow-500" />
                ) : (
                  <Moon size={24} className="text-blue-400" />
                )}
              </div>
              <div>
                <h3 className={`font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  Dark Mode
                </h3>
                <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  {theme === "dark" ? "Currently enabled" : "Currently disabled"}
                </p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                theme === "dark" ? 'bg-purple-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-lg ${
                  theme === "dark" ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Two-Factor Auth Card */}
        <div className={`p-6 rounded-3xl backdrop-blur-xl ${
          theme === "dark" 
            ? "bg-white/5 border border-white/10" 
            : "bg-white/70 border border-gray-200"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${
                theme === "dark" ? "bg-green-500/20" : "bg-green-100"
              }`}>
                <Shield size={24} className="text-green-500" />
              </div>
              <div>
                <h3 className={`font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  2FA Security
                </h3>
                <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                  Not enabled
                </p>
              </div>
            </div>
            <button className="px-4 py-2 bg-green-500/20 text-green-400 rounded-xl hover:bg-green-500/30 transition-all text-sm font-medium">
              Enable
            </button>
          </div>
        </div>
      </div>

      {/* Notifications Section */}
      <div className={`mb-8 p-8 rounded-3xl backdrop-blur-xl ${
        theme === "dark" 
          ? "bg-white/5 border border-white/10" 
          : "bg-white/70 border border-gray-200"
      }`}>
        <h2 className={`text-2xl font-bold mb-6 flex items-center gap-3 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
          <Bell size={28} weight="duotone" className="text-purple-500" />
          Notifications
        </h2>
        
        <div className="space-y-4">
          {Object.entries(notifications).map(([key, value]) => (
            <div key={key} className={`flex items-center justify-between p-4 rounded-2xl ${
              theme === "dark" ? "bg-gray-800/30" : "bg-gray-50"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${
                  value 
                    ? theme === "dark" ? "bg-purple-500/20" : "bg-purple-100"
                    : theme === "dark" ? "bg-gray-700" : "bg-gray-200"
                }`}>
                  {key === "email" && <Envelope size={20} className={value ? "text-purple-500" : "text-gray-500"} />}
                  {key === "push" && <Bell size={20} className={value ? "text-purple-500" : "text-gray-500"} />}
                  {key === "updates" && <Megaphone size={20} className={value ? "text-purple-500" : "text-gray-500"} />}
                  {key === "newsletter" && <Globe size={20} className={value ? "text-purple-500" : "text-gray-500"} />}
                </div>
                <div>
                  <h3 className={`font-medium ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
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

      {/* Connected Accounts */}
      <div className={`mb-8 p-8 rounded-3xl backdrop-blur-xl ${
        theme === "dark" 
          ? "bg-white/5 border border-white/10" 
          : "bg-white/70 border border-gray-200"
      }`}>
        <h2 className={`text-2xl font-bold mb-6 flex items-center gap-3 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
          <Link size={28} weight="duotone" className="text-purple-500" />
          Connected Accounts
        </h2>
        
        <div className={`p-4 rounded-2xl flex items-center justify-between ${
          theme === "dark" ? "bg-gray-800/30" : "bg-gray-50"
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#5865F2] rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">D</span>
            </div>
            <div>
              <h3 className={`font-medium ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                Discord
              </h3>
              <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                Connect for community features
              </p>
            </div>
          </div>
          <button className="px-6 py-2 bg-[#5865F2] text-white rounded-xl hover:bg-[#4752C4] transition-all font-medium">
            Connect
          </button>
        </div>
      </div>

      {/* Actions Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button className={`p-4 rounded-2xl flex items-center justify-center gap-3 font-medium transition-all ${
          theme === "dark"
            ? "bg-gray-800/50 hover:bg-gray-800 text-gray-300"
            : "bg-gray-100 hover:bg-gray-200 text-gray-700"
        }`}>
          <Download size={20} />
          Download Your Data
        </button>
        
        <button className={`p-4 rounded-2xl flex items-center justify-center gap-3 font-medium transition-all ${
          theme === "dark"
            ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30"
            : "bg-red-50 hover:bg-red-100 text-red-600 border border-red-300"
        }`}>
          <Trash size={20} />
          Delete Account
        </button>
      </div>
    </div>
  );
};

export default Settings;