import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginView } from '../components/LoginView';
import { ForgotPasswordView } from '../components/ForgotPasswordView';
import { ResetPasswordView } from '../components/ResetPasswordView';
import { authApi } from '../services/api';
import { AuthProvider } from '../context/AuthContext';

// Mock authApi
vi.mock('../services/api', async () => {
  const actual = await vi.importActual('../services/api');
  return {
    ...actual,
    authApi: {
      getToken: vi.fn().mockReturnValue(null),
      getRefreshToken: vi.fn().mockReturnValue(null),
      login: vi.fn(),
      getMe: vi.fn().mockResolvedValue({ id: 'u1', email: 'test@school.edu', role: 'STUDENT' }),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      changePassword: vi.fn(),
    },
  };
});

describe('Forgot Password & Password Reset Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. LoginView Forgot Password Navigation', () => {
    it('renders "Forgot password?" link pointing to /forgot-password', () => {
      render(
        <MemoryRouter>
          <AuthProvider>
            <LoginView />
          </AuthProvider>
        </MemoryRouter>,
      );

      const forgotLink = screen.getByRole('link', { name: /forgot password\?/i });
      expect(forgotLink).toBeInTheDocument();
      expect(forgotLink.getAttribute('href')).toBe('/forgot-password');
    });
  });

  describe('2. ForgotPasswordView Request Form', () => {
    it('validates required and format email errors', async () => {
      render(
        <MemoryRouter>
          <ForgotPasswordView />
        </MemoryRouter>,
      );

      const submitButton = screen.getByRole('button', { name: /send reset link/i });

      // Click submit with empty email
      fireEvent.click(submitButton);
      expect(await screen.findByText(/email address is required/i)).toBeInTheDocument();
      expect(authApi.forgotPassword).not.toHaveBeenCalled();

      // Enter invalid email format
      const emailInput = screen.getByLabelText(/institutional email address/i);
      fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
      fireEvent.click(submitButton);

      expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument();
      expect(authApi.forgotPassword).not.toHaveBeenCalled();
    });

    it('submits valid email and renders neutral success confirmation preventing account enumeration', async () => {
      (authApi.forgotPassword as any).mockResolvedValueOnce({
        message: 'If an active account exists with this email address, password reset instructions have been sent.',
      });

      render(
        <MemoryRouter>
          <ForgotPasswordView />
        </MemoryRouter>,
      );

      const emailInput = screen.getByLabelText(/institutional email address/i);
      fireEvent.change(emailInput, { target: { value: 'teacher@greenwood.edu' } });

      const submitButton = screen.getByRole('button', { name: /send reset link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(authApi.forgotPassword).toHaveBeenCalledWith('teacher@greenwood.edu');
      });

      expect(await screen.findByText(/instructions dispatched/i)).toBeInTheDocument();
      expect(screen.getByText(/teacher@greenwood.edu/i)).toBeInTheDocument();
      expect(screen.getByText(/if an active account exists with the email/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try another email/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /return to sign in/i })).toBeInTheDocument();
    });

    it('renders neutral success state even if API encounters unknown email to prevent enumeration', async () => {
      // Simulate non-existent account where backend or network returns 200/neutral
      (authApi.forgotPassword as any).mockResolvedValueOnce({
        message: 'If an active account exists with this email address, password reset instructions have been sent.',
      });

      render(
        <MemoryRouter>
          <ForgotPasswordView />
        </MemoryRouter>,
      );

      const emailInput = screen.getByLabelText(/institutional email address/i);
      fireEvent.change(emailInput, { target: { value: 'ghost@nowhere.edu' } });
      fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

      expect(await screen.findByText(/instructions dispatched/i)).toBeInTheDocument();
      expect(screen.getByText(/if an active account exists with the email/i)).toBeInTheDocument();
    });

    it('handles rate limiting (429) error gracefully', async () => {
      (authApi.forgotPassword as any).mockRejectedValueOnce({
        response: { status: 429, data: { message: 'Too many requests' } },
      });

      render(
        <MemoryRouter>
          <ForgotPasswordView />
        </MemoryRouter>,
      );

      const emailInput = screen.getByLabelText(/institutional email address/i);
      fireEvent.change(emailInput, { target: { value: 'abuser@school.edu' } });
      fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

      expect(await screen.findByText(/too many reset requests/i)).toBeInTheDocument();
    });
  });

  describe('3. ResetPasswordView Reset Form', () => {
    it('displays error state when token query parameter is absent', () => {
      render(
        <MemoryRouter initialEntries={['/reset-password']}>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordView />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText(/invalid reset link/i)).toBeInTheDocument();
      expect(screen.getByText(/missing a valid security token/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /request new reset link/i })).toBeInTheDocument();
    });

    it('validates password length (min 8 chars) and confirmation mismatch', async () => {
      render(
        <MemoryRouter initialEntries={['/reset-password?token=valid-secret-token-123']}>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordView />} />
          </Routes>
        </MemoryRouter>,
      );

      const submitButton = screen.getByRole('button', { name: /update password/i });

      // Short password (< 8 chars)
      const newPasswordInput = screen.getByLabelText(/^new password/i);
      const confirmPasswordInput = screen.getByLabelText(/^confirm new password/i);

      fireEvent.change(newPasswordInput, { target: { value: 'short1' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'short1' } });
      fireEvent.click(submitButton);

      expect(await screen.findByText(/password must be at least 8 characters long/i)).toBeInTheDocument();
      expect(authApi.resetPassword).not.toHaveBeenCalled();

      // Mismatched passwords
      fireEvent.change(newPasswordInput, { target: { value: 'Password123!' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'PasswordMismatch!' } });
      fireEvent.click(submitButton);

      expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
      expect(authApi.resetPassword).not.toHaveBeenCalled();
    });

    it('submits valid new password and displays success state', async () => {
      (authApi.resetPassword as any).mockResolvedValueOnce({
        success: true,
        message: 'Password has been successfully reset.',
      });

      render(
        <MemoryRouter initialEntries={['/reset-password?token=secure-token-abc']}>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordView />} />
          </Routes>
        </MemoryRouter>,
      );

      const newPasswordInput = screen.getByLabelText(/^new password/i);
      const confirmPasswordInput = screen.getByLabelText(/^confirm new password/i);

      fireEvent.change(newPasswordInput, { target: { value: 'StrongNewPassword123' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'StrongNewPassword123' } });

      const submitButton = screen.getByRole('button', { name: /update password/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(authApi.resetPassword).toHaveBeenCalledWith('secure-token-abc', 'StrongNewPassword123');
      });

      expect(await screen.findByText(/password successfully reset/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in with new password/i })).toBeInTheDocument();
    });

    it('handles expired or used reset token error from API', async () => {
      (authApi.resetPassword as any).mockRejectedValueOnce({
        response: {
          status: 400,
          data: { message: 'Invalid, expired, or already used password reset token' },
        },
      });

      render(
        <MemoryRouter initialEntries={['/reset-password?token=expired-token-xyz']}>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordView />} />
          </Routes>
        </MemoryRouter>,
      );

      const newPasswordInput = screen.getByLabelText(/^new password/i);
      const confirmPasswordInput = screen.getByLabelText(/^confirm new password/i);

      fireEvent.change(newPasswordInput, { target: { value: 'ValidPassword123' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'ValidPassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /update password/i }));

      expect(await screen.findByText(/invalid, expired, or already used password reset token/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /request a fresh password reset link/i })).toBeInTheDocument();
    });
  });
});
