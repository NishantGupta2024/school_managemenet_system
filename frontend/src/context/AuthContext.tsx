import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  authApi,
  setActiveSchoolId,
  setOnUnauthorized,
  UserRole,
} from '../services/api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  schoolId: string | null;
  schoolName?: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  selectedSchoolId: string | null;
  setSelectedSchoolId: (schoolId: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedSchoolId, setSelectedSchoolIdState] = useState<string | null>(null);

  const setSelectedSchoolId = useCallback((schoolId: string | null) => {
    setSelectedSchoolIdState(schoolId);
    setActiveSchoolId(schoolId);
  }, []);

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
    setToken(null);
    setSelectedSchoolIdState(null);
    setActiveSchoolId(null);
  }, []);

  // Register unauthorized (401) global handler with api.ts
  useEffect(() => {
    setOnUnauthorized(() => {
      logout();
    });
    return () => {
      setOnUnauthorized(null);
    };
  }, [logout]);

  // Session revalidation on startup
  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      const savedToken = authApi.getToken();
      if (!savedToken) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      try {
        // Revalidate token against backend GET /api/v1/auth/me
        const validatedProfile = await authApi.getProfile();

        if (!isMounted) return;

        // Try reading cached schoolName from localStorage if present
        let cachedSchoolName: string | undefined;
        try {
          const cachedUser = authApi.getUser();
          if (cachedUser && cachedUser.id === validatedProfile.id) {
            cachedSchoolName = cachedUser.schoolName;
          }
        } catch {
          // ignore malformed cache
        }

        const authenticatedUser: AuthUser = {
          id: validatedProfile.id,
          email: validatedProfile.email,
          name: validatedProfile.name,
          role: validatedProfile.role,
          schoolId: validatedProfile.schoolId,
          schoolName: cachedSchoolName,
        };

        setUser(authenticatedUser);
        setToken(savedToken);

        // Derive tenant context: if user has a validated schoolId, bind it
        if (authenticatedUser.schoolId) {
          setActiveSchoolId(authenticatedUser.schoolId);
          setSelectedSchoolIdState(null);
        } else {
          // Platform Super Admin starts without a default fabricated tenant
          setActiveSchoolId(null);
          setSelectedSchoolIdState(null);
        }
      } catch (err) {
        // Validation failed (401 or network error): purge cached auth and reset state
        if (isMounted) {
          authApi.logout();
          setUser(null);
          setToken(null);
          setActiveSchoolId(null);
          setSelectedSchoolIdState(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);

    const loggedInUser: AuthUser = {
      id: response.user.id,
      email: response.user.email,
      name: response.user.name,
      role: response.user.role,
      schoolId: response.user.schoolId,
      schoolName: response.user.schoolName,
    };

    setUser(loggedInUser);
    setToken(response.accessToken);

    if (loggedInUser.schoolId) {
      setActiveSchoolId(loggedInUser.schoolId);
      setSelectedSchoolIdState(null);
    } else {
      // Platform Super Admin
      setActiveSchoolId(null);
      setSelectedSchoolIdState(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        selectedSchoolId,
        setSelectedSchoolId,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useOptionalAuth = (): AuthContextType | undefined => {
  return useContext(AuthContext);
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

