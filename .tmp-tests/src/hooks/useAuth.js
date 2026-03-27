"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthProvider = AuthProvider;
exports.useAuth = useAuth;
exports.getCurrentUserId = getCurrentUserId;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * Minimal authentication hook for Supabase
 * Handles anonymous auth to ensure auth.uid() is always available
 */
const react_1 = require("react");
const client_1 = require("@/integrations/supabase/client");
const AuthContext = (0, react_1.createContext)({
    user: null,
    session: null,
    userId: null,
    isLoading: true,
    isAuthenticated: false,
    signOut: async () => { },
});
function AuthProvider({ children }) {
    const [user, setUser] = (0, react_1.useState)(null);
    const [session, setSession] = (0, react_1.useState)(null);
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    (0, react_1.useEffect)(() => {
        // Set up auth state listener BEFORE checking session
        const { data: { subscription } } = client_1.supabase.auth.onAuthStateChange(async (event, currentSession) => {
            console.log('[Auth] State changed:', event, currentSession?.user?.id);
            setSession(currentSession);
            setUser(currentSession?.user ?? null);
            setIsLoading(false);
        });
        // Check for existing session
        const initializeAuth = async () => {
            try {
                const { data: { session: existingSession }, error } = await client_1.supabase.auth.getSession();
                if (error) {
                    console.error('[Auth] Error getting session:', error);
                }
                if (existingSession) {
                    console.log('[Auth] Existing session found:', existingSession.user.id);
                    setSession(existingSession);
                    setUser(existingSession.user);
                    setIsLoading(false);
                    return;
                }
                // No session exists, create anonymous session
                console.log('[Auth] No session, creating anonymous user...');
                const { data: anonData, error: anonError } = await client_1.supabase.auth.signInAnonymously();
                if (anonError) {
                    console.error('[Auth] Anonymous sign-in failed:', anonError);
                    // Still set loading to false even if anon fails
                    setIsLoading(false);
                    return;
                }
                console.log('[Auth] Anonymous user created:', anonData.user?.id);
                // State will be set by onAuthStateChange
            }
            catch (err) {
                console.error('[Auth] Initialization error:', err);
                setIsLoading(false);
            }
        };
        initializeAuth();
        return () => {
            subscription.unsubscribe();
        };
    }, []);
    const signOut = async () => {
        await client_1.supabase.auth.signOut();
        setUser(null);
        setSession(null);
    };
    const value = {
        user,
        session,
        userId: user?.id ?? null,
        isLoading,
        isAuthenticated: !!user,
        signOut,
    };
    return ((0, jsx_runtime_1.jsx)(AuthContext.Provider, { value: value, children: children }));
}
function useAuth() {
    const context = (0, react_1.useContext)(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
/**
 * Helper to get current user ID synchronously from a resolved auth state
 * Use this in services when you need the UID for database writes
 */
async function getCurrentUserId() {
    const { data: { session } } = await client_1.supabase.auth.getSession();
    return session?.user?.id ?? null;
}
