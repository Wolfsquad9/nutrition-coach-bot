import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-4 h-1 w-12 bg-primary" aria-hidden="true" />
        <h1 className="mb-4 font-display text-5xl font-bold tracking-tight text-foreground">404</h1>
        <p className="tactical-label mb-6">Page not found</p>
        <a href="/" className="text-primary text-sm font-medium underline-offset-4 hover:underline">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
