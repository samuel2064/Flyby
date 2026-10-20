import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiUrl } from "../lib/apiUrl";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      void navigate("/dashboard");
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiUrl("/v1/auth/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Signup failed");
      }

      const json = await res.json();
      const { user, token } = json.data;
      login(token, user);
      void navigate("/dashboard");
    } catch (err) {
      setError((err as Error).message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold mb-4">Welcome to Flyby!</h2>
        <p className="text-gray-600 mb-2">Your account has been created.</p>
        <p className="text-gray-500">You are now logged in as {user.email}.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center">Create your Flyby account</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="signup-name" className="block text-sm font-medium mb-1">Display Name</label>
          <input
            id="signup-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="Traveler One"
          />
        </div>
        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium mb-1">Email</label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="you@example.com"
            required
          />
        </div>
        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium mb-1">Password</label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="••••••••"
            required
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white font-semibold py-2 rounded-lg hover:bg-brandDark transition disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Sign up"}
        </button>
      </form>
    </div>
  );
}
