import { Sun, Moon, ImageSquare } from "phosphor-react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firestore = getFirestore();
  const functions = getFunctions(app);

  // Debug: Log uploading state changes
  useEffect(() => {
    console.log("uploading state changed:", uploading);
  }, [uploading]);

  const fetchProfileImage = async () => {
    if (!user) return;

    try {
      const userDoc = await getDoc(doc(firestore, `users/${user.uid}`));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setProfileImage(data.profileImage || null);
      }
    } catch (error) {
      console.error("🔥 Failed to fetch profile image:", error);
      setError("Failed to load profile image");
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
      console.log("Selected file:", { name: file.name, type: file.type, size: file.size });
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

      // Wrap FileReader in a Promise to make it awaitable
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
      console.log("Calling function with payload:", {
        fileName: payload.fileName,
        contentType: payload.contentType,
        filePreview: payload.file.slice(0, 50) + "...",
      });

      const uploadFunction = httpsCallable(functions, "uploadProfileImage");
      const result = await uploadFunction(payload);
      const data = result.data as { success: boolean; message: string; url: string; storagePath: string };

      console.log("Upload success:", data.message);
      await fetchProfileImage();
      // Clear the selected file and reset the input after a successful upload
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
      console.error("🔥 Error uploading profile image:", error.message);
      setError("Failed to upload image: " + (error.message || "Unknown error"));
    } finally {
      setUploading(false);
    }
  };

  const handleSelectFileClick = () => {
    if (fileInputRef.current && !uploading) {
      fileInputRef.current.click();
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Settings</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">Manage your account preferences</p>

      <div className="space-y-4">
        <div
          className={`flex items-center justify-between p-4 rounded-lg border transition ${
            theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
          }`}
        >
          <div className="flex items-center space-x-3">
            {theme === "light" ? (
              <Sun size={24} className="text-yellow-500" />
            ) : (
              <Moon size={24} className="text-blue-400" />
            )}
            <span className="text-gray-700 dark:text-gray-300">Dark Mode</span>
          </div>
          <button
            onClick={toggleTheme}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md hover:from-purple-600 hover:to-pink-600 transition"
          >
            Toggle
          </button>
        </div>

        <div
          className={`flex flex-col items-center p-4 rounded-lg border transition ${
            theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
          }`}
        >
          <div className="flex items-center space-x-3">
            <ImageSquare size={24} className="text-blue-500" />
            <span className="text-gray-700 dark:text-gray-300">Profile Picture</span>
          </div>

          {profileImage ? (
            <img
              src={profileImage}
              alt="Profile"
              className="w-24 h-24 rounded-full mt-4 object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-full mt-4 bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
              <ImageSquare size={32} className="text-gray-500" />
            </div>
          )}
          {error && <p className="text-red-500 mt-2">{error}</p>}

          {/* Custom File Upload UI */}
          <div className="mt-4 flex flex-col items-center space-y-3">
            <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {selectedFile ? selectedFile.name : "No file selected"}
            </span>
            <button
              type="button"
              onClick={handleSelectFileClick}
              className={`px-4 py-2 bg-gradient-to-r from-purple-400 to-pink-400 text-white rounded-md transition min-w-[120px] ${
                uploading ? "opacity-90 cursor-not-allowed" : "hover:from-purple-500 hover:to-pink-500"
              }`}
              disabled={uploading}
            >
              Select Image
            </button>
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
                disabled={uploading || !user}
                className={`px-4 py-2 bg-gradient-to-r from-purple-400 to-pink-400 text-white rounded-md transition min-w-[120px] ${
                  uploading || !user
                    ? "opacity-90 cursor-not-allowed"
                    : "hover:from-purple-500 hover:to-pink-500"
                }`}
              >
                {uploading ? <Spinner size={20} className="animate-spin mx-auto" /> : "Upload"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;