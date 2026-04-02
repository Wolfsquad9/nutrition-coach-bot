"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthProvider = AuthProvider;
exports.useAuth = useAuth;
exports.getCurrentUserId = getCurrentUserId;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * Authentication hook for Supabase — email/password auth.
 * Provides session state and sign-in/sign-up/sign-out helpers.
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
        const { data: { subscription } } = client_1.supabase.auth.onAuthStateChange((_event, currentSession) => {
            setSession(currentSession);
            setUser(currentSession?.user ?? null);
            setIsLoading(false);
        });
        // Check for existing session
        client_1.supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
            setSession(existingSession);
            setUser(existingSession?.user ?? null);
            setIsLoading(false);
        });
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
        isAuthenticated: !!session,
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
 * Helper to get current user ID from a resolved auth state.
 * Use this in services when you need the UID for database writes.
 */
async function getCurrentUserId() {
    const { data: { session } } = await client_1.supabase.auth.getSession();
    return session?.user?.id ?? null;
}
