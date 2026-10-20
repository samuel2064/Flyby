import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="text-center py-16">
      <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
      <p className="text-xl text-gray-600 mb-8">Page not found</p>
      <p className="text-gray-500 mb-8">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="inline-block bg-brand text-white px-6 py-3 rounded-lg font-semibold hover:bg-brandDark transition"
      >
        Go back home
      </Link>
    </div>
  );
}
