import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { Spinner } from "phosphor-react"; // Import Spinner from phosphor-react

const ForgotPasswordPanel = ({ onSwap }: { onSwap: () => void }) => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false); // Add loading state

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); // Set loading to true at the start of the operation
    setMessage(''); // Clear previous messages
    setError(''); // Clear previous errors

    try {
      await sendPasswordResetEmail(auth, email, {
        url: 'https://gondolabros.com/auth/action',
        handleCodeInApp: true,
      });
      setMessage('Password reset email sent!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false); // Set loading to false when the operation completes (success or failure)
    }
  };

  return (
    <>
      {message && <p className="text-green-500 text-sm mb-2">{message}</p>}
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

      <form onSubmit={handlePasswordReset}>
        <div className="mb-4">
          <label htmlFor="email" className="block text-left font-medium mb-1 text-gray-300">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded-md bg-black/30 border-gray-400 text-white placeholder-gray-400 
                      focus:ring-0 focus:outline-none focus:border-gray-500"
            placeholder="Enter your email"
            disabled={loading} // Disable input while loading
          />
        </div>

        <button
          type="submit"
          className={`w-full py-2 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md transition ${
            loading ? "opacity-90 cursor-not-allowed" : "hover:opacity-90"
          }`} // Match the style from Auth.tsx and AuthAction.tsx
          disabled={loading} // Disable button while loading
        >
          {loading ? <Spinner size={20} className="animate-spin mx-auto" /> : "Reset Password"}
        </button>
      </form>

      <button onClick={onSwap} className="mt-4 text-sm text-gray-300 hover:text-white transition" disabled={loading}>
        Back to Sign In
      </button>
    </>
  );
};

export default ForgotPasswordPanel;