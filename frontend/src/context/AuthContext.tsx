import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import {
  authApi,
  schoolsApi,
  setActiveSchoolId,
  setOnUnauthorized,
  UserRole,
  SchoolRecord,
} from '../services/api';

export const SUPER_ADMIN_ACTIVE_SCHOOL_KEY = 'super_admin_active_school_id';

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

  // Organization context state (Phase 1)
  selectedSchoolId: string | null;
  selectedSchool: SchoolRecord | null;
  availableSchools: SchoolRecord[];
  organizationContextLoading: boolean;
  organizationContextError: string | null;

  // Organization context actions (Phase 1)
  selectSchool: (schoolId: string) => Promise<void>;
  clearSelectedSchool: () => void;
  refreshAvailableSchools: () => Promise<void>;
  setSelectedSchoolId: (schoolId: string | null) => void; // Backward compatibility

  // Authentication actions
  login: (email: string, password: string, schoolId?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Safe sessionStorage helpers that gracefully handle disabled/unavailable storage
function getStoredSchoolId(): string | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(SUPER_ADMIN_ACTIVE_SCHOOL_KEY);
    }
  } catch {
    // ignore sessionStorage access exceptions
  }
  return null;
}

function setStoredSchoolId(id: string | null): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (id) {
        window.sessionStorage.setItem(SUPER_ADMIN_ACTIVE_SCHOOL_KEY, id);
      } else {
        window.sessionStorage.removeItem(SUPER_ADMIN_ACTIVE_SCHOOL_KEY);
      }
    }
  } catch {
    // ignore sessionStorage access exceptions
  }
}

/**
 * Helper to fetch all pages of schools for Super Admin.
 * Handles pagination transparently so that availableSchools contains all organizations,
 * even when total count exceeds a single page limit.
 */
async function fetchAllSchools(): Promise<SchoolRecord[]> {
  const firstPage = await schoolsApi.list({ page: 1, limit: 100 });
  const allRecords: SchoolRecord[] = [...(firstPage?.data || [])];
  const totalPages = firstPage?.meta?.totalPages || 1;

  if (totalPages > 1) {
    const pagePromises: Promise<any>[] = [];
    for (let p = 2; p <= totalPages; p++) {
      pagePromises.push(schoolsApi.list({ page: p, limit: 100 }));
    }
    const subsequentPages = await Promise.all(pagePromises);
    for (const res of subsequentPages) {
      if (res?.data && Array.isArray(res.data)) {
        allRecords.push(...res.data);
      }
    }
  }

  return allRecords;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Organization context state
  const [selectedSchoolId, setSelectedSchoolIdState] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<SchoolRecord | null>(null);
  const [availableSchools, setAvailableSchools] = useState<SchoolRecord[]>([]);
  const [organizationContextLoading, setOrganizationContextLoading] = useState<boolean>(false);
  const [organizationContextError, setOrganizationContextError] = useState<string | null>(null);

  // Version counter to prevent older async requests from overwriting newer selections
  const orgRequestIdRef = useRef<number>(0);

  // Helper to sync state and header atomically
  const applySelectedSchool = useCallback((school: SchoolRecord | null) => {
    if (school) {
      setSelectedSchoolIdState(school.id);
      setSelectedSchool(school);
      setActiveSchoolId(school.id);
      setStoredSchoolId(school.id);
    } else {
      setSelectedSchoolIdState(null);
      setSelectedSchool(null);
      setActiveSchoolId(null);
      setStoredSchoolId(null);
    }
  }, []);

  const clearSelectedSchool = useCallback(() => {
    applySelectedSchool(null);
    setOrganizationContextError(null);
  }, [applySelectedSchool]);

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
    setToken(null);
    setAvailableSchools([]);
    applySelectedSchool(null);
    setOrganizationContextError(null);
    setOrganizationContextLoading(false);
  }, [applySelectedSchool]);

  // Register unauthorized (401) global handler with api.ts
  useEffect(() => {
    setOnUnauthorized(() => {
      logout();
    });
    return () => {
      setOnUnauthorized(null);
    };
  }, [logout]);

  // Load and validate available schools for Platform Super Admin
  const refreshAvailableSchools = useCallback(async (): Promise<void> => {
    const currentRequestId = ++orgRequestIdRef.current;
    setOrganizationContextLoading(true);
    setOrganizationContextError(null);

    try {
      const list = await fetchAllSchools();
      if (orgRequestIdRef.current !== currentRequestId) {
        return; // Stale request, ignore
      }

      setAvailableSchools(list);

      // Validate currently active or stored school selection
      const currentOrStoredId = selectedSchoolId || getStoredSchoolId();
      if (currentOrStoredId) {
        let found = list.find((s) => s.id === currentOrStoredId);

        // Fallback: If not found in paginated list, check direct API
        if (!found && typeof schoolsApi.get === 'function') {
          try {
            const direct = await schoolsApi.get(currentOrStoredId);
            if (direct && direct.status === 'ACTIVE') {
              found = direct;
            }
          } catch {
            // Not accessible
          }
        }

        if (found && found.status === 'ACTIVE') {
          applySelectedSchool(found);
        } else {
          // Inactive, suspended, or nonexistent: clear selection
          applySelectedSchool(null);
        }
      }
    } catch (err: any) {
      if (orgRequestIdRef.current !== currentRequestId) {
        return;
      }
      const msg = err?.response?.data?.message || err?.message || 'Failed to load organization directory.';
      setOrganizationContextError(msg);
    } finally {
      if (orgRequestIdRef.current === currentRequestId) {
        setOrganizationContextLoading(false);
      }
    }
  }, [selectedSchoolId, applySelectedSchool]);

  const selectSchool = useCallback(
    async (schoolId: string): Promise<void> => {
      if (!schoolId) {
        clearSelectedSchool();
        return;
      }

      setOrganizationContextError(null);

      // Find from current available schools
      let targetSchool = availableSchools.find((s) => s.id === schoolId);

      // If not yet in memory or availableSchools empty, attempt to fetch directly if schoolsApi.get exists
      if (!targetSchool && typeof schoolsApi.get === 'function') {
        try {
          const directSchool = await schoolsApi.get(schoolId);
          if (directSchool) {
            targetSchool = directSchool;
          }
        } catch {
          // If fetch fails, keep targetSchool undefined
        }
      }

      if (!targetSchool) {
        applySelectedSchool(null);
        const err = `School tenant with ID ${schoolId} not found in directory.`;
        setOrganizationContextError(err);
        throw new Error(err);
      }

      if (targetSchool.status !== 'ACTIVE') {
        applySelectedSchool(null);
        const err = `School tenant "${targetSchool.name}" is ${targetSchool.status} and cannot be selected.`;
        setOrganizationContextError(err);
        throw new Error(err);
      }

      // Valid and active: apply context
      applySelectedSchool(targetSchool);
    },
    [availableSchools, applySelectedSchool, clearSelectedSchool],
  );

  // Backward-compatible setSelectedSchoolId wrapper
  const setSelectedSchoolId = useCallback(
    (schoolId: string | null) => {
      if (!schoolId) {
        clearSelectedSchool();
      } else {
        // Look up school in availableSchools
        const found = availableSchools.find((s) => s.id === schoolId);
        if (found) {
          applySelectedSchool(found);
        } else if (typeof schoolsApi.get === 'function') {
          // If not in preloaded list, look up directly or synthesize active placeholder
          schoolsApi
            .get(schoolId)
            .then((directSchool) => {
              if (directSchool) {
                applySelectedSchool(directSchool);
              } else {
                applySelectedSchool({
                  id: schoolId,
                  code: 'TARGET',
                  name: `Target (${schoolId.slice(0, 8)}...)`,
                  status: 'ACTIVE',
                  country: 'IN',
                  currency: 'INR',
                  timezone: 'Asia/Kolkata',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
              }
            })
            .catch(() => {
              applySelectedSchool({
                id: schoolId,
                code: 'TARGET',
                name: `Target (${schoolId.slice(0, 8)}...)`,
                status: 'ACTIVE',
                country: 'IN',
                currency: 'INR',
                timezone: 'Asia/Kolkata',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            });
        } else {
          // If schoolsApi.get is not defined (e.g. In older test mocks), synthesize valid SchoolRecord
          applySelectedSchool({
            id: schoolId,
            code: 'TARGET',
            name: `Target (${schoolId.slice(0, 8)}...)`,
            status: 'ACTIVE',
            country: 'IN',
            currency: 'INR',
            timezone: 'Asia/Kolkata',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    },
    [availableSchools, applySelectedSchool, clearSelectedSchool],
  );

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
          setSelectedSchool(null);
          setAvailableSchools([]);
          setStoredSchoolId(null);
        } else if (authenticatedUser.role === UserRole.PLATFORM_SUPER_ADMIN) {
          // Platform Super Admin: load available schools and validate stored context
          const storedCandidateId = getStoredSchoolId();
          setOrganizationContextLoading(true);
          try {
            const list = await fetchAllSchools();
            if (isMounted) {
              setAvailableSchools(list);

              if (storedCandidateId) {
                let found = list.find((s) => s.id === storedCandidateId);

                // Fallback direct check if beyond pages or created recently
                if (!found && typeof schoolsApi.get === 'function') {
                  try {
                    const direct = await schoolsApi.get(storedCandidateId);
                    if (direct && direct.status === 'ACTIVE') {
                      found = direct;
                    }
                  } catch {
                    // Not accessible
                  }
                }

                if (found && found.status === 'ACTIVE') {
                  setSelectedSchoolIdState(found.id);
                  setSelectedSchool(found);
                  setActiveSchoolId(found.id);
                } else {
                  // Inactive, suspended or missing
                  setStoredSchoolId(null);
                  setActiveSchoolId(null);
                  setSelectedSchoolIdState(null);
                  setSelectedSchool(null);
                }
              } else {
                setActiveSchoolId(null);
                setSelectedSchoolIdState(null);
                setSelectedSchool(null);
              }
            }
          } catch (orgErr: any) {
            if (isMounted) {
              setOrganizationContextError(
                orgErr?.response?.data?.message || orgErr?.message || 'Failed to load organization directory.',
              );
              setActiveSchoolId(null);
              setSelectedSchoolIdState(null);
              setSelectedSchool(null);
            }
          } finally {
            if (isMounted) {
              setOrganizationContextLoading(false);
            }
          }
        } else {
          setActiveSchoolId(null);
          setSelectedSchoolIdState(null);
          setSelectedSchool(null);
          setStoredSchoolId(null);
        }
      } catch (err) {
        // Validation failed (401 or network error): purge cached auth and reset state
        if (isMounted) {
          authApi.logout();
          setUser(null);
          setToken(null);
          setActiveSchoolId(null);
          setSelectedSchoolIdState(null);
          setSelectedSchool(null);
          setAvailableSchools([]);
          setStoredSchoolId(null);
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

  const login = useCallback(async (email: string, password: string, schoolId?: string) => {
    const response = schoolId
      ? await authApi.login(email, password, schoolId)
      : await authApi.login(email, password);

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
      setSelectedSchool(null);
      setAvailableSchools([]);
      setStoredSchoolId(null);
    } else if (loggedInUser.role === UserRole.PLATFORM_SUPER_ADMIN) {
      // Platform Super Admin: initialize with Platform-Wide context and load schools
      setActiveSchoolId(null);
      setSelectedSchoolIdState(null);
      setSelectedSchool(null);
      setStoredSchoolId(null);

      // Asynchronously fetch available schools for selector
      setOrganizationContextLoading(true);
      try {
        const list = await fetchAllSchools();
        setAvailableSchools(list);
      } catch (err: any) {
        setOrganizationContextError(
          err?.response?.data?.message || err?.message || 'Failed to load organization directory.',
        );
      } finally {
        setOrganizationContextLoading(false);
      }
    } else {
      setActiveSchoolId(null);
      setSelectedSchoolIdState(null);
      setSelectedSchool(null);
      setStoredSchoolId(null);
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
        selectedSchool,
        availableSchools,
        organizationContextLoading,
        organizationContextError,
        selectSchool,
        clearSelectedSchool,
        refreshAvailableSchools,
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
