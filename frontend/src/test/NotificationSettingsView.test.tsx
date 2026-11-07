import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationSettingsView } from '../components/NotificationSettingsView';
import { notificationsApi, SchoolNotificationSettings, PaginatedNotificationLogsResponse } from '../services/api';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    notificationsApi: {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      getLogs: vi.fn(),
      getLogById: vi.fn(),
    },
  };
});

describe('NotificationSettingsView Component', () => {
  const mockSettings: SchoolNotificationSettings = {
    id: 'setting-1',
    schoolId: 'sch-1',
    feeReminderEmailEnabled: false,
    studentAdmissionEmailEnabled: true,
    attendanceAbsenceEmailEnabled: false,
    examScheduleEmailEnabled: true,
    examResultsEmailEnabled: true,
    receiptEmailEnabled: true,
    paymentReversalEmailEnabled: true,
    refundSuccessEmailEnabled: true,
    refundFailureEmailEnabled: true,
    senderDisplayName: 'Springfield Academy',
    replyToEmail: 'admissions@springfield.edu',
    updatedAt: new Date().toISOString(),
  };

  const mockLogs: PaginatedNotificationLogsResponse = {
    data: [
      {
        id: 'log-1',
        channel: 'EMAIL',
        eventType: 'RECEIPT_ISSUED',
        recipientEmail: 'parent@example.com',
        recipientName: 'Jane Doe',
        status: 'SENT',
        templateKey: 'RECEIPT_ISSUED',
        attemptCount: 1,
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      {
        id: 'log-2',
        channel: 'EMAIL',
        eventType: 'ATTENDANCE_ABSENT',
        recipientEmail: 'guardian@example.com',
        recipientName: 'John Doe',
        status: 'SKIPPED',
        templateKey: 'ATTENDANCE_ABSENT',
        attemptCount: 0,
        sentAt: null,
        createdAt: new Date().toISOString(),
        lastErrorCode: null,
        lastErrorMessage: 'EVENT_DISABLED_BY_SCHOOL_SETTING:attendanceAbsenceEmailEnabled',
      },
    ],
    meta: {
      total: 2,
      page: 1,
      limit: 15,
      totalPages: 1,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notificationsApi.getSettings).mockResolvedValue({ ...mockSettings });
    vi.mocked(notificationsApi.updateSettings).mockImplementation(async (payload) => ({
      ...mockSettings,
      ...payload,
      updatedAt: new Date().toISOString(),
    }));
    vi.mocked(notificationsApi.getLogs).mockResolvedValue({ ...mockLogs });
  });

  it('1. loads and displays current notification preferences from backend', async () => {
    render(<NotificationSettingsView />);

    expect(screen.getByText(/Multi-Channel Transactional Notification Center/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(notificationsApi.getSettings).toHaveBeenCalled();
    });

    const admissionCard = screen.getByText('Student Admission Alert').closest('div.p-4');
    expect(admissionCard).toBeInTheDocument();
    const admissionInput = admissionCard!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(admissionInput.checked).toBe(true);

    const feeReminderCard = screen.getByText('Fee Due Date Reminder').closest('div.p-4');
    const feeReminderInput = feeReminderCard!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(feeReminderInput.checked).toBe(false);

    const absenceCard = screen.getByText('Daily Absence Notification').closest('div.p-4');
    const absenceInput = absenceCard!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(absenceInput.checked).toBe(false);

    const examScheduleCard = screen.getByText('Exam Schedule Published').closest('div.p-4');
    const examScheduleInput = examScheduleCard!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(examScheduleInput.checked).toBe(true);

    const examResultsCard = screen.getByText('Exam Results Released').closest('div.p-4');
    const examResultsInput = examResultsCard!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(examResultsInput.checked).toBe(true);
  });

  it('2. enables dirty state and successfully saves updated preferences to backend', async () => {
    render(<NotificationSettingsView />);

    await waitFor(() => {
      expect(notificationsApi.getSettings).toHaveBeenCalled();
    });

    const saveButton = screen.getByRole('button', { name: /save preferences/i });
    expect(saveButton).toBeDisabled();

    // Toggle fee reminder
    const feeReminderCard = screen.getByText('Fee Due Date Reminder').closest('div.p-4');
    const feeReminderInput = feeReminderCard!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(feeReminderInput);

    // Save button should now be enabled
    expect(saveButton).toBeEnabled();

    // Click Save
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(notificationsApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          feeReminderEmailEnabled: true,
          studentAdmissionEmailEnabled: true,
          attendanceAbsenceEmailEnabled: false,
          examScheduleEmailEnabled: true,
          examResultsEmailEnabled: true,
        }),
      );
    });

    expect(await screen.findByText(/Notification preferences saved and updated successfully/i)).toBeInTheDocument();
  });

  it('3. switches to delivery history tab and renders outbox records and statuses', async () => {
    render(<NotificationSettingsView />);

    await waitFor(() => {
      expect(notificationsApi.getSettings).toHaveBeenCalled();
    });

    const historyTab = screen.getByRole('button', { name: /delivery history & outbox/i });
    fireEvent.click(historyTab);

    await waitFor(() => {
      expect(notificationsApi.getLogs).toHaveBeenCalled();
    });

    expect(screen.getByText('RECEIPT_ISSUED')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('parent@example.com')).toBeInTheDocument();

    expect(screen.getByText('ATTENDANCE_ABSENT')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('guardian@example.com')).toBeInTheDocument();
  });

  it('4. displays channel configuration diagnostic and distinguishes Email vs WhatsApp', async () => {
    render(<NotificationSettingsView />);

    await waitFor(() => {
      expect(notificationsApi.getSettings).toHaveBeenCalled();
    });

    const channelsTab = screen.getByRole('button', { name: /channel status & diagnostic/i });
    fireEvent.click(channelsTab);

    expect(screen.getByText(/Email Channel \(Primary\)/i)).toBeInTheDocument();
    expect(screen.getByText(/OPERATIONAL/i)).toBeInTheDocument();

    expect(screen.getByText(/WhatsApp Channel \(Roadmap\)/i)).toBeInTheDocument();
    expect(screen.getByText(/CODE READY \/ UNCONFIGURED/i)).toBeInTheDocument();
    expect(screen.getByText(/Token Unconfigured \(MVP Default\)/i)).toBeInTheDocument();
  });

  it('5. handles API error states gracefully on failed settings fetch', async () => {
    vi.mocked(notificationsApi.getSettings).mockRejectedValueOnce(new Error('Network error'));

    render(<NotificationSettingsView />);

    expect(await screen.findByText(/Network error/i)).toBeInTheDocument();
  });
});
