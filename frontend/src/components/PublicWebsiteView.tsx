import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CymbixLogo } from './CymbixLogo';
import {
  School,
  ArrowRight,
  Lock,
  ChevronDown,
} from 'lucide-react';

export const PublicWebsiteView: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Role Tab Switching state
  const [activeRole, setActiveRole] = useState<'super-admin' | 'school-admin' | 'fee-staff' | 'student' | 'parent'>('super-admin');

  // FAQ Accordion state
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Enquiry form state
  const [enquiryForm, setEnquiryForm] = useState({
    schoolName: '',
    contactPerson: '',
    email: '',
    phone: '',
    studentCount: '500 - 1,500',
    institutionType: 'K-12 School',
    currentSystem: 'Manual Ledgers / Excel',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleEnquirySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 600);
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-sans flex flex-col selection:bg-primary-container selection:text-on-primary">
      {/* 1. Sticky Navigation Header */}
      <header className="sticky top-0 z-50 bg-surface/90 backdrop-blur-md border-b border-outline-variant/30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-20 sm:h-[88px] lg:h-24 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center transition-opacity hover:opacity-90">
              <CymbixLogo />
              <span className="sr-only">School ERP</span>
            </a>
          </div>

          <nav className="hidden lg:flex items-center gap-8 text-sm font-semibold text-on-surface-variant">
            <a href="#overview" className="hover:text-primary-container transition-colors">
              Overview
            </a>
            <a href="#features" className="hover:text-primary-container transition-colors">
              Features
            </a>
            <a href="#solutions" className="hover:text-primary-container transition-colors">
              Role Workspaces
            </a>
            <a href="#security" className="hover:text-primary-container transition-colors">
              Security
            </a>
            <a href="#dashboard-preview" className="hover:text-primary-container transition-colors">
              Live Preview
            </a>
            <a href="#contact" className="hover:text-primary-container transition-colors">
              Enquiry
            </a>
            <a href="#faq" className="hover:text-primary-container transition-colors">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <button
                onClick={() => navigate('/app')}
                className="px-5 py-2.5 bg-primary-container hover:bg-primary text-on-primary rounded-xl text-sm font-bold transition-all shadow-sm shadow-primary-container/20 flex items-center gap-2 group"
              >
                <span>Go to ERP Dashboard</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="px-5 py-2.5 bg-primary-container hover:bg-primary text-on-primary rounded-xl text-sm font-bold transition-all shadow-sm shadow-primary-container/20 flex items-center gap-2"
              >
                <Lock className="w-4 h-4 text-primary-fixed-dim" />
                <span>Portal Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section
        id="hero"
        className="relative overflow-hidden pt-12 pb-20 px-4 sm:px-6 lg:px-8 border-b border-outline-variant/30"
        style={{ background: 'linear-gradient(180deg, #ffffff 0%, rgba(238, 242, 255, 0.25) 60%, #f8f9ff 100%)' }}
      >
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Copy & Value Proposition */}
          <div className="lg:col-span-6 flex flex-col items-start gap-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-primary-container bg-primary-fixed/40 border border-primary-fixed-dim/60 text-xs font-bold tracking-wider uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span>
              BUILT FOR MODERN EDUCATIONAL INSTITUTIONS
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-on-surface tracking-tight leading-[1.1]">
              One Unified System for{' '}
              <span style={{ background: 'linear-gradient(90deg, #4f46e5, #3525cd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Every School Function
              </span>
            </h1>

            <p className="text-lg text-secondary leading-relaxed max-w-xl">
              Transform campus administration with a single authoritative student identity, centralized academic structuring, and an enterprise financial ledger engine.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2 w-full sm:w-auto">
              <a
                href="#contact"
                className="inline-flex items-center justify-center px-7 py-3.5 bg-primary-container text-on-primary font-semibold text-sm rounded-xl shadow-lg shadow-primary-container/25 hover:bg-primary transition-all duration-200"
              >
                Request a Demo
              </a>
              <button
                onClick={() => navigate(isAuthenticated ? '/app' : '/login')}
                className="inline-flex items-center justify-center px-7 py-3.5 bg-surface-container-lowest text-on-surface-variant border border-outline-variant/60 rounded-xl font-semibold text-sm hover:border-primary-container hover:text-primary-container transition-all duration-200"
              >
                {isAuthenticated ? 'Enter ERP Launcher' : 'Sign In to School ERP'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-4 text-secondary text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-tertiary text-[18px]">verified</span>
                Zero Duplicate Records
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-tertiary text-[18px]">verified</span>
                Multi-Tenant Isolation
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-tertiary text-[18px]">verified</span>
                Immutable Ledger Trail
              </span>
            </div>
          </div>

          {/* Right Column: Live Financial Collection HUD Card */}
          <div className="lg:col-span-6 relative">
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-xl p-6 lg:p-7 relative z-10">
              <div className="flex items-center justify-between pb-5 border-b border-outline-variant/20">
                <div>
                  <div className="text-sm font-semibold text-on-surface">Institutional Fee Collection HUD</div>
                  <div className="text-xs text-secondary">Academic Session 2026–2027 • Term 1</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-tertiary-fixed text-on-tertiary-fixed">
                    <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
                    Operational
                  </span>
                </div>
              </div>

              {/* Metric Cards Row */}
              <div className="grid grid-cols-3 gap-3 my-5">
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
                  <div className="text-[11px] font-medium text-secondary uppercase tracking-wider">Total Billed</div>
                  <div className="text-lg font-bold text-on-surface mt-1">₹48,25,000</div>
                  <div className="text-[10px] text-tertiary font-medium mt-0.5">100% Cohort Billed</div>
                </div>
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
                  <div className="text-[11px] font-medium text-secondary uppercase tracking-wider">Collected</div>
                  <div className="text-lg font-bold text-tertiary mt-1">₹41,80,000</div>
                  <div className="text-[10px] text-tertiary font-medium mt-0.5">86.6% Recovery</div>
                </div>
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
                  <div className="text-[11px] font-medium text-secondary uppercase tracking-wider">Overdue Dues</div>
                  <div className="text-lg font-bold text-error mt-1">₹6,45,000</div>
                  <div className="text-[10px] text-error font-medium mt-0.5">Late Fines Active</div>
                </div>
              </div>

              {/* Sample Real-Time Student Ledger Table */}
              <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-container text-on-surface-variant font-semibold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Student Name</th>
                      <th className="py-2.5 px-3">Class</th>
                      <th className="py-2.5 px-3">Amount</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20 bg-surface-container-lowest text-on-surface">
                    <tr>
                      <td className="py-2.5 px-3 font-medium">Aarav Sharma</td>
                      <td className="py-2.5 px-3 text-secondary">Class 8-A</td>
                      <td className="py-2.5 px-3 font-semibold">₹4,500.00</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Cleared
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium">Diya Sen</td>
                      <td className="py-2.5 px-3 text-secondary">Class 8-A</td>
                      <td className="py-2.5 px-3 font-semibold">₹4,500.00</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          Pending Cheque
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium">Vivaan Patel</td>
                      <td className="py-2.5 px-3 text-secondary">Class 8-B</td>
                      <td className="py-2.5 px-3 font-semibold">₹3,200.00</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          UPI Paid
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between text-[11px] text-secondary">
                <span>Direct integration with Razorpay, Cash Desk & Bank UTR</span>
                <span className="font-semibold text-primary-container">Live Monolith Sync</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Trust Strip */}
      <section id="trust" className="py-12 bg-surface-container-low border-b border-outline-variant/30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <h2 className="text-2xl font-bold text-on-surface">Everything Your Institution Needs to Manage Fees Efficiently</h2>
            <p className="text-sm text-secondary mt-1.5">
              Built on clean architecture with NestJS, React, TypeScript, PostgreSQL, and Prisma ORM.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 flex items-start gap-4">
              <div className="p-2.5 bg-primary-fixed/40 text-primary-container rounded-lg">
                <span className="material-symbols-outlined text-[24px]">account_balance</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface">Centralized Fee Ledger</h3>
                <p className="text-xs text-secondary mt-1">One immutable financial record per student across all academic sessions.</p>
              </div>
            </div>

            <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 flex items-start gap-4">
              <div className="p-2.5 bg-tertiary-fixed/40 text-tertiary rounded-lg">
                <span className="material-symbols-outlined text-[24px]">payments</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface">Parent Payment Access</h3>
                <p className="text-xs text-secondary mt-1">Transparent breakdown, online checkout, and digital receipt archives.</p>
              </div>
            </div>

            <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 flex items-start gap-4">
              <div className="p-2.5 bg-secondary-fixed/40 text-secondary rounded-lg">
                <span className="material-symbols-outlined text-[24px]">receipt_long</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface">Financial Transparency</h3>
                <p className="text-xs text-secondary mt-1">Instant reconciliation between physical cash drawers and bank statements.</p>
              </div>
            </div>

            <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 flex items-start gap-4">
              <div className="p-2.5 bg-error-container/40 text-error rounded-lg">
                <span className="material-symbols-outlined text-[24px]">security</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface">Institutional Data Isolation</h3>
                <p className="text-xs text-secondary mt-1">Row-level multi-tenant separation prevents any cross-school data leak.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Three Pillars Overview */}
      <section id="overview" className="py-20 bg-surface border-b border-outline-variant/30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-2">
            <span className="text-xs font-bold text-primary-container tracking-wider uppercase">System Architecture</span>
            <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">One Platform. Complete Fee Management.</h2>
            <p className="text-sm text-secondary">
              Specialized workspaces operate seamlessly on an authoritative student identity and academic master foundation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-surface-container-lowest p-7 rounded-2xl border border-outline-variant/40 shadow-sm space-y-4 hover:border-primary-container/50 transition-all">
              <div className="w-12 h-12 bg-primary-fixed/40 text-primary-container rounded-xl flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-[26px]">corporate_fare</span>
              </div>
              <h3 className="text-lg font-bold text-on-surface">Institutional Administration</h3>
              <p className="text-xs text-secondary leading-relaxed">
                Configure academic sessions, class rosters, fee structures, fine rules, and staff permissions with fine-grained role-based governance.
              </p>
            </div>

            <div className="bg-surface-container-lowest p-7 rounded-2xl border border-outline-variant/40 shadow-sm space-y-4 hover:border-primary-container/50 transition-all">
              <div className="w-12 h-12 bg-tertiary-fixed/40 text-tertiary rounded-xl flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-[26px]">point_of_sale</span>
              </div>
              <h3 className="text-lg font-bold text-on-surface">Fee Operations</h3>
              <p className="text-xs text-secondary leading-relaxed">
                Rapid counter collections across Cash, Cheque, Bank Transfer, and UPI with automatic change calculations, partial allocations, and instant receipts.
              </p>
            </div>

            <div className="bg-surface-container-lowest p-7 rounded-2xl border border-outline-variant/40 shadow-sm space-y-4 hover:border-primary-container/50 transition-all">
              <div className="w-12 h-12 bg-secondary-fixed/40 text-secondary rounded-xl flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-[26px]">family_restroom</span>
              </div>
              <h3 className="text-lg font-bold text-on-surface">Parent & Student Portal</h3>
              <p className="text-xs text-secondary leading-relaxed">
                Self-service fee visibility, multi-child ward switcher, online Razorpay checkout, automated email alerts, and Section 80C tax certificates.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Core Features Showcase Grid */}
      <section id="features" className="py-20 bg-surface-container-lowest border-b border-outline-variant/30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-2">
            <span className="text-xs font-bold text-primary-container tracking-wider uppercase">Modular Architecture</span>
            <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">Specialized Modules on One Data Foundation</h2>
            <p className="text-sm text-secondary">
              Every department operates in dedicated workspaces while sharing authorized student identity and academic structures.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1: Fee Management */}
            <div className="bg-surface-container-low rounded-2xl border border-outline-variant/40 p-6 flex flex-col justify-between hover:border-primary-container/50 hover:shadow-md transition-all group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                    <span className="material-symbols-outlined text-[24px]">payments</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    Live
                  </span>
                </div>
                <h3 className="text-base font-bold text-on-surface group-hover:text-primary-container transition-colors">
                  Fee Management
                </h3>
                <p className="text-xs text-secondary mt-2 leading-relaxed">
                  Fee structures, multi-frequency allocations, automated monthly invoicing, cashier desk, Razorpay gateway, and compact receipt generation.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-outline-variant/30 text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <span>Fully Operational</span>
              </div>
            </div>

            {/* Feature 2: Student Management */}
            <div className="bg-surface-container-low rounded-2xl border border-outline-variant/40 p-6 flex flex-col justify-between hover:border-primary-container/50 hover:shadow-md transition-all group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                    <span className="material-symbols-outlined text-[24px]">group</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    Live
                  </span>
                </div>
                <h3 className="text-base font-bold text-on-surface group-hover:text-primary-container transition-colors">
                  Student & Admissions
                </h3>
                <p className="text-xs text-secondary mt-2 leading-relaxed">
                  Authoritative student master directory, individual admissions, demographic tracking, safe profile editing, and live fee statement drawers.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-outline-variant/30 text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <span>Fully Operational</span>
              </div>
            </div>

            {/* Feature 3: Academic Setup */}
            <div className="bg-surface-container-low rounded-2xl border border-outline-variant/40 p-6 flex flex-col justify-between hover:border-primary-container/50 hover:shadow-md transition-all group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
                    <span className="material-symbols-outlined text-[24px]">school</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    Live
                  </span>
                </div>
                <h3 className="text-base font-bold text-on-surface group-hover:text-primary-container transition-colors">
                  Academic Setup
                </h3>
                <p className="text-xs text-secondary mt-2 leading-relaxed">
                  Academic session lifecycle, grade levels, section capacity management, and financial reference protection preventing unsafe deletions.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-outline-variant/30 text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <span>Fully Operational</span>
              </div>
            </div>

            {/* Feature 4: Platform Security */}
            <div className="bg-surface-container-low rounded-2xl border border-outline-variant/40 p-6 flex flex-col justify-between hover:border-primary-container/50 hover:shadow-md transition-all group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
                    <span className="material-symbols-outlined text-[24px]">admin_panel_settings</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    Live
                  </span>
                </div>
                <h3 className="text-base font-bold text-on-surface group-hover:text-primary-container transition-colors">
                  Teacher & Staff Management
                </h3>
                <p className="text-xs text-secondary mt-2 leading-relaxed">
                  Multi-tenant isolation, user provisioning, role-based authorization guards, and school onboarding for enterprise governance.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-outline-variant/30 text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <span>Fully Operational</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Institutional Security & Tenancy Spotlight */}
      <section id="security" className="py-20 bg-surface border-b border-outline-variant/30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-8 lg:p-12 shadow-xl">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 backdrop-blur border border-white/20 text-indigo-200 mb-4">
                <span className="material-symbols-outlined text-[16px] text-indigo-300">verified_user</span>
                Enterprise Trust Architecture
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Built for Institutional Control and Data Isolation</h2>
              <p className="mt-3 text-indigo-100 text-sm sm:text-base leading-relaxed">
                Every institutional record is protected by multi-tenant schema partitioning. School accounts remain completely isolated with zero cross-tenant data leakage.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-8 pt-8 border-t border-white/10">
                <div>
                  <div className="text-xl font-bold text-white">Row-Level Isolation</div>
                  <div className="text-xs text-indigo-200 mt-1">Prisma composite key scoping ensures absolute database segregation.</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-white">Immutable Ledger</div>
                  <div className="text-xs text-indigo-200 mt-1">Historical invoices and payment allocations cannot be altered or overwritten.</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-white">Automated Backups</div>
                  <div className="text-xs text-indigo-200 mt-1">Automated PostgreSQL backups with SHA-256 integrity verification.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Interactive Role-Based Solutions */}
      <section id="solutions" className="py-20 bg-surface-container-lowest border-b border-outline-variant/30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
            <span className="text-xs font-bold text-primary-container tracking-wider uppercase">User Personas</span>
            <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">Designed for Every Role in Your Institution</h2>
            <p className="text-sm text-secondary">
              Tailored interfaces optimized for administrators, cashier desks, students, and guardians.
            </p>
          </div>

          {/* Role Tabs */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-10" id="role-tab-buttons">
            <button
              onClick={() => setActiveRole('super-admin')}
              className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                activeRole === 'super-admin'
                  ? 'bg-primary-container text-on-primary shadow-sm'
                  : 'bg-surface-container-low text-secondary border border-outline-variant/40 hover:bg-surface-container'
              }`}
            >
              Platform Super Admin
            </button>
            <button
              onClick={() => setActiveRole('school-admin')}
              className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                activeRole === 'school-admin'
                  ? 'bg-primary-container text-on-primary shadow-sm'
                  : 'bg-surface-container-low text-secondary border border-outline-variant/40 hover:bg-surface-container'
              }`}
            >
              School Admin
            </button>
            <button
              onClick={() => setActiveRole('fee-staff')}
              className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                activeRole === 'fee-staff'
                  ? 'bg-primary-container text-on-primary shadow-sm'
                  : 'bg-surface-container-low text-secondary border border-outline-variant/40 hover:bg-surface-container'
              }`}
            >
              Fee Staff (Cashier)
            </button>
            <button
              onClick={() => setActiveRole('student')}
              className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                activeRole === 'student'
                  ? 'bg-primary-container text-on-primary shadow-sm'
                  : 'bg-surface-container-low text-secondary border border-outline-variant/40 hover:bg-surface-container'
              }`}
            >
              Student Portal
            </button>
            <button
              onClick={() => setActiveRole('parent')}
              className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                activeRole === 'parent'
                  ? 'bg-primary-container text-on-primary shadow-sm'
                  : 'bg-surface-container-low text-secondary border border-outline-variant/40 hover:bg-surface-container'
              }`}
            >
              Parent Portal
            </button>
          </div>

          {/* Role Content Panels */}
          <div className="bg-surface-container-low rounded-2xl border border-outline-variant/40 p-8 lg:p-10">
            {activeRole === 'super-admin' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary-fixed/40 text-primary-container">
                    Multi-Tenant Governance
                  </span>
                  <h3 className="text-2xl font-bold text-on-surface">Platform Super Admin Workspace</h3>
                  <p className="text-sm text-secondary leading-relaxed">
                    Onboard new educational institutions, allocate tenant codes, govern active or suspended subscription states, monitor backend service health, and execute database backups with safety blocklists.
                  </p>
                  <ul className="space-y-2 text-xs text-on-surface-variant">
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Instant school provisioning with isolated schema bindings.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Header tenant context switcher to inspect workspaces without credential overrides.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Deep health probes monitoring PostgreSQL pool and Redis responsiveness.
                    </li>
                  </ul>
                </div>
                <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 space-y-3">
                  <div className="text-xs font-bold text-secondary uppercase">Active School Directory</div>
                  <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-on-surface">Greenwood International Academy</div>
                      <div className="text-[11px] text-secondary">Code: SCH001 • 420 Students • Active</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Active</span>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-on-surface">Starlight Valley School</div>
                      <div className="text-[11px] text-secondary">Code: SCH002 • 310 Students • Active</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Active</span>
                  </div>
                </div>
              </div>
            )}

            {activeRole === 'school-admin' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary-fixed/40 text-primary-container">
                    Campus Management
                  </span>
                  <h3 className="text-2xl font-bold text-on-surface">School Administrator Workspace</h3>
                  <p className="text-sm text-secondary leading-relaxed">
                    Set up academic years, class cohorts, and fee heads. Assemble customized class fee structures with monthly, termly, or annual frequencies and configure automated late payment fine policies.
                  </p>
                  <ul className="space-y-2 text-xs text-on-surface-variant">
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Batch monthly fee invoicing with pre-run simulation previews.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Student admissions with Excel roster bulk import preflight.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Late fee grace period configuration (fixed surcharge or daily stepped rates).
                    </li>
                  </ul>
                </div>
                <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 space-y-3">
                  <div className="text-xs font-bold text-secondary uppercase">Class 8 Standard Fee Structure</div>
                  <div className="divide-y divide-outline-variant/20 text-xs">
                    <div className="py-2 flex justify-between"><span>Tuition Fee (Monthly)</span><span className="font-bold">₹4,500.00</span></div>
                    <div className="py-2 flex justify-between"><span>Computer & Lab (Termly)</span><span className="font-bold">₹1,500.00</span></div>
                    <div className="py-2 flex justify-between"><span>Annual Library & Sports</span><span className="font-bold">₹5,000.00</span></div>
                  </div>
                </div>
              </div>
            )}

            {activeRole === 'fee-staff' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-tertiary-fixed/40 text-tertiary">
                    Fast Counter POS
                  </span>
                  <h3 className="text-2xl font-bold text-on-surface">Fee Staff & Cashier Desk</h3>
                  <p className="text-sm text-secondary leading-relaxed">
                    Perform rapid student lookups by admission number, roll number, or guardian mobile. Accept cash, cheques, bank transfers, or counter UPI QR with pro-rata partial payment allocations.
                  </p>
                  <ul className="space-y-2 text-xs text-on-surface-variant">
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Instant cash change calculation and excess balance advance wallet crediting.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Bounced cheque payment reversal with sequence-tracked audit logging.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      End-of-day counter closing sheet balancing cash, cheques, and online totals.
                    </li>
                  </ul>
                </div>
                <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 space-y-3">
                  <div className="text-xs font-bold text-secondary uppercase">Counter Collection Terminal</div>
                  <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 space-y-1">
                    <div className="text-xs text-secondary">Student: Aarav Sharma (Class 8-A)</div>
                    <div className="text-base font-bold text-on-surface">Amount Tendered: ₹5,000.00</div>
                    <div className="text-xs text-tertiary font-semibold">Change to Return: ₹500.00 (Invoice Cleared)</div>
                  </div>
                </div>
              </div>
            )}

            {activeRole === 'student' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary-fixed/40 text-primary-container">
                    Student Transparency
                  </span>
                  <h3 className="text-2xl font-bold text-on-surface">Student Self-Service Portal</h3>
                  <p className="text-sm text-secondary leading-relaxed">
                    Enrolled learners access their institutional identity, chronological fee ledger, upcoming deadlines, itemized invoice breakdowns, and download official payment receipts in PDF.
                  </p>
                  <ul className="space-y-2 text-xs text-on-surface-variant">
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Real-time fee summary card highlighting net dues and paid credits.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Itemized fee head breakdown modal (Tuition, Lab, Annual charges).
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Permanent digital receipt archive for scholarship and audit verification.
                    </li>
                  </ul>
                </div>
                <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 space-y-3">
                  <div className="text-xs font-bold text-secondary uppercase">Student Fee Summary</div>
                  <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-emerald-800 font-medium">All Dues Cleared</div>
                      <div className="text-lg font-bold text-emerald-700">₹0.00 Balance</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">Settled</span>
                  </div>
                </div>
              </div>
            )}

            {activeRole === 'parent' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-tertiary-fixed/40 text-tertiary">
                    Family Portal
                  </span>
                  <h3 className="text-2xl font-bold text-on-surface">Parent Portal & Online Checkout</h3>
                  <p className="text-sm text-secondary leading-relaxed">
                    Parents manage multiple enrolled children through a unified child switcher in the navigation bar. Pay fees 24/7 via Razorpay (UPI, Cards, NetBanking) and download Section 80C income tax certificates.
                  </p>
                  <ul className="space-y-2 text-xs text-on-surface-variant">
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Multi-child ward switcher updating fee ledgers with zero reloads.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Secure Razorpay pop-up modal with cryptographic HMAC signature check.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                      Automated email notification with printable PDF receipt upon completion.
                    </li>
                  </ul>
                </div>
                <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/30 space-y-3">
                  <div className="text-xs font-bold text-secondary uppercase">Parent Online Payment Card</div>
                  <div className="p-3.5 rounded-lg bg-surface-container-low border border-outline-variant/30 space-y-2">
                    <div className="flex justify-between text-xs"><span>July 2026 Tuition Invoice</span><span className="font-bold">₹3,600.00</span></div>
                    <button className="w-full py-2 bg-primary-container text-on-primary text-xs font-bold rounded-lg shadow-sm">
                      Pay Online via Razorpay
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 8. How It Works: 4-Step Lifecycle */}
      <section id="how-it-works" className="py-20 bg-surface border-b border-outline-variant/30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-2">
            <span className="text-xs font-bold text-primary-container tracking-wider uppercase">Operational Flow</span>
            <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">From Institutional Setup to Fee Collection</h2>
            <p className="text-sm text-secondary">
              A logical four-step sequence orchestrates your institution's complete financial lifecycle.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 space-y-3 relative">
              <span className="text-3xl font-black text-primary-container/20">01</span>
              <h3 className="text-base font-bold text-on-surface">Institutional Setup</h3>
              <p className="text-xs text-secondary leading-relaxed">
                Super Admin creates school tenant, registers domain bindings, and defines academic sessions.
              </p>
            </div>

            <div className="p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 space-y-3 relative">
              <span className="text-3xl font-black text-primary-container/20">02</span>
              <h3 className="text-base font-bold text-on-surface">Student Ingestion</h3>
              <p className="text-xs text-secondary leading-relaxed">
                Import student rosters via bulk Excel template with preflight validation and roll assignment.
              </p>
            </div>

            <div className="p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 space-y-3 relative">
              <span className="text-3xl font-black text-primary-container/20">03</span>
              <h3 className="text-base font-bold text-on-surface">Fee Configuration</h3>
              <p className="text-xs text-secondary leading-relaxed">
                Define fee heads, assemble grade fee schedules, set fine rules, and allocate student concessions.
              </p>
            </div>

            <div className="p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 space-y-3 relative">
              <span className="text-3xl font-black text-primary-container/20">04</span>
              <h3 className="text-base font-bold text-on-surface">Collection & Audit</h3>
              <p className="text-xs text-secondary leading-relaxed">
                Execute monthly billing, collect online or at the counter, issue PDF receipts, and balance ledgers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Live Dashboard & Cashier Terminal Preview */}
      <section id="dashboard-preview" className="py-20 bg-surface-container-lowest border-b border-outline-variant/30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-2">
            <span className="text-xs font-bold text-primary-container tracking-wider uppercase">Interface Preview</span>
            <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">Gain Clear Visibility into School Fee Collections</h2>
            <p className="text-sm text-secondary">
              Real-time analytics, cashier counter balancing sheets, and student ledger statements at a glance.
            </p>
          </div>

          <div className="bg-surface-container-low rounded-3xl border border-outline-variant/40 p-6 lg:p-8 shadow-lg">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30">
                <div className="text-xs text-secondary uppercase font-semibold">Today's Collections</div>
                <div className="text-xl font-bold text-on-surface mt-1">₹1,42,800.00</div>
                <div className="text-[11px] text-tertiary mt-0.5">34 Receipts Issued</div>
              </div>
              <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30">
                <div className="text-xs text-secondary uppercase font-semibold">Cash in Drawer</div>
                <div className="text-xl font-bold text-on-surface mt-1">₹45,000.00</div>
                <div className="text-[11px] text-secondary mt-0.5">Balanced at Counter</div>
              </div>
              <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30">
                <div className="text-xs text-secondary uppercase font-semibold">Online Gateway</div>
                <div className="text-xl font-bold text-on-surface mt-1">₹78,800.00</div>
                <div className="text-[11px] text-primary-container mt-0.5">Auto-Reconciled</div>
              </div>
              <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30">
                <div className="text-xs text-secondary uppercase font-semibold">Pending Cheques</div>
                <div className="text-xl font-bold text-amber-600 mt-1">₹19,000.00</div>
                <div className="text-[11px] text-secondary mt-0.5">4 Instruments in Clearing</div>
              </div>
            </div>

            <div className="p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
              <div className="flex items-center justify-between mb-4">
                <div className="font-bold text-sm text-on-surface">End-of-Day Daily Collection Reconciliation</div>
                <button
                  onClick={() => navigate(isAuthenticated ? '/app/fees/reports' : '/login')}
                  className="px-3 py-1.5 bg-primary-fixed/40 text-primary-container text-xs font-semibold rounded-lg hover:bg-primary-fixed"
                >
                  View Full Report
                </button>
              </div>
              <div className="text-xs text-secondary leading-relaxed">
                Categorized collection breakdowns across Cash, Cheque, Bank Transfer, and Online Gateway matching physical till drawers against database receipt counters.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 10. Institutional Onboarding Enquiry Form */}
      <section id="contact" className="py-20 bg-surface border-b border-outline-variant/30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-4">
              <span className="text-xs font-bold text-primary-container tracking-wider uppercase">Institutional Onboarding</span>
              <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">Bring Your Institution onto a Unified Fee Management Platform</h2>
              <p className="text-sm text-secondary leading-relaxed">
                Connect with our institutional advisory team to evaluate your school's specific fee management workflows and migration roadmap.
              </p>

              <div className="space-y-4 pt-4 text-xs text-on-surface">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-tertiary text-[20px] mt-0.5">verified_user</span>
                  <div>
                    <div className="font-semibold text-on-surface">Data Migration Guarantee</div>
                    <div className="text-secondary">Assisted ingestion of past academic records, ledger balances, and student accounts.</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-tertiary text-[20px] mt-0.5">support_agent</span>
                  <div>
                    <div className="font-semibold text-on-surface">Dedicated Account Controller</div>
                    <div className="text-secondary">Direct onboarding desk for your bursars, finance committee, and trustees.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="bg-surface-container-low p-8 lg:p-10 rounded-2xl border border-outline-variant/30 shadow-md">
                {isSubmitted ? (
                  <div className="text-center py-10 space-y-3">
                    <div className="w-12 h-12 bg-tertiary-fixed text-tertiary rounded-2xl flex items-center justify-center mx-auto">
                      <span className="material-symbols-outlined text-[28px]">check_circle</span>
                    </div>
                    <h3 className="text-lg font-bold text-on-surface">Enquiry Submitted Successfully</h3>
                    <p className="text-xs text-secondary max-w-md mx-auto">
                      Thank you for your interest. An administrative representative will review your institutional request and reach out within 2 business hours.
                    </p>
                    <button
                      onClick={() => setIsSubmitted(false)}
                      className="mt-4 px-4 py-2 border border-outline-variant/60 rounded-xl text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors"
                    >
                      Submit Another Enquiry
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleEnquirySubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-on-surface mb-1">
                          School / Institution Name <span className="text-error">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={enquiryForm.schoolName}
                          onChange={(e) => setEnquiryForm({ ...enquiryForm, schoolName: e.target.value })}
                          placeholder="e.g. Springfield International School"
                          className="w-full px-3.5 py-2.5 bg-surface-container-lowest border border-outline-variant/40 rounded-xl text-sm focus:outline-none focus:border-primary-container"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-on-surface mb-1">
                          Contact Person & Designation <span className="text-error">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={enquiryForm.contactPerson}
                          onChange={(e) => setEnquiryForm({ ...enquiryForm, contactPerson: e.target.value })}
                          placeholder="e.g. Dr. Rajesh Sharma (Principal)"
                          className="w-full px-3.5 py-2.5 bg-surface-container-lowest border border-outline-variant/40 rounded-xl text-sm focus:outline-none focus:border-primary-container"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-on-surface mb-1">
                          Official Email <span className="text-error">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          value={enquiryForm.email}
                          onChange={(e) => setEnquiryForm({ ...enquiryForm, email: e.target.value })}
                          placeholder="admin@school.edu"
                          className="w-full px-3.5 py-2.5 bg-surface-container-lowest border border-outline-variant/40 rounded-xl text-sm focus:outline-none focus:border-primary-container"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-on-surface mb-1">
                          Contact Phone <span className="text-error">*</span>
                        </label>
                        <input
                          type="tel"
                          required
                          value={enquiryForm.phone}
                          onChange={(e) => setEnquiryForm({ ...enquiryForm, phone: e.target.value })}
                          placeholder="+91 9876543210"
                          className="w-full px-3.5 py-2.5 bg-surface-container-lowest border border-outline-variant/40 rounded-xl text-sm focus:outline-none focus:border-primary-container"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-on-surface mb-1">
                          Estimated Student Strength
                        </label>
                        <select
                          value={enquiryForm.studentCount}
                          onChange={(e) => setEnquiryForm({ ...enquiryForm, studentCount: e.target.value })}
                          className="w-full px-3.5 py-2.5 bg-surface-container-lowest border border-outline-variant/40 rounded-xl text-sm focus:outline-none focus:border-primary-container"
                        >
                          <option value="Under 500">Under 500 Students</option>
                          <option value="500 - 1,500">500 – 1,500 Students</option>
                          <option value="1,500 - 3,500">1,500 – 3,500 Students</option>
                          <option value="3,500+">3,500+ Students</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-on-surface mb-1">
                          Institution Type
                        </label>
                        <select
                          value={enquiryForm.institutionType}
                          onChange={(e) => setEnquiryForm({ ...enquiryForm, institutionType: e.target.value })}
                          className="w-full px-3.5 py-2.5 bg-surface-container-lowest border border-outline-variant/40 rounded-xl text-sm focus:outline-none focus:border-primary-container"
                        >
                          <option value="K-12 School">K-12 School</option>
                          <option value="Higher Ed / College">Higher Ed / College</option>
                          <option value="School Network / Group">School Network / Group</option>
                          <option value="Other Educational Entity">Other Educational Entity</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-on-surface mb-1">
                          Specific Requirements / Notes
                        </label>
                        <textarea
                          rows={3}
                          value={enquiryForm.message}
                          onChange={(e) => setEnquiryForm({ ...enquiryForm, message: e.target.value })}
                          placeholder="Please mention your current requirements or specific fee structures..."
                          className="w-full px-3.5 py-2.5 bg-surface-container-lowest border border-outline-variant/40 rounded-xl text-sm focus:outline-none focus:border-primary-container"
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-6 py-3 bg-primary-container hover:bg-primary text-on-primary rounded-xl text-sm font-bold transition-all shadow-sm shadow-primary-container/20 flex items-center gap-2"
                      >
                        {isSubmitting ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                            <span>Processing Enquiry...</span>
                          </>
                        ) : (
                          <>
                            <span>Submit Institutional Enquiry</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 11. FAQ Accordion Section */}
      <section id="faq" className="py-20 bg-surface-container-lowest border-b border-outline-variant/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 space-y-2">
            <span className="text-xs font-bold text-primary-container tracking-wider uppercase">Answers & Clarifications</span>
            <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">Frequently Asked Questions</h2>
            <p className="text-sm text-secondary">
              Everything you need to know about tenancy isolation, gateway settlements, and data migration.
            </p>
          </div>

          <div className="space-y-3" id="faq-accordion">
            {[
              {
                q: 'How does multi-tenant isolation protect our school’s confidential financial data?',
                a: 'The platform implements logical row-level multi-tenancy. Every student, fee head, invoice, and payment contains a mandatory schoolId foreign key. Database queries executed through Prisma ORM automatically scope queries to the authenticated tenant. No school administrator, cashier, or parent can view or query data belonging to another institution.',
              },
              {
                q: 'Can we collect fees at the physical counter as well as online via parents?',
                a: 'Yes. The Fee Staff collection desk supports physical Cash (with change calculation or advance wallet crediting), Cheques & Demand Drafts (with clearance tracking), Bank Transfers (NEFT/RTGS with UTR logging), and Counter UPI QR codes. Online payments flow directly through our integrated Razorpay checkout modal with cryptographic HMAC signature verification.',
              },
              {
                q: 'What happens if a parent pays less than the full monthly fee amount?',
                a: 'The platform features an automated pro-rata partial payment allocation cascade: payments first clear overdue late fee penalties, then settle historic core tuition arrears, and finally apply toward current month ancillary heads. Invoice balances update instantly and reflect accurately on the student statement.',
              },
              {
                q: 'How are late payment fines and grace periods handled?',
                a: 'School Admins configure fine rules per grade. You can specify a grace period (e.g., 10 days post-due date). If payment is made after the grace window, the system automatically applies either a fixed surcharge or a daily compounding stepped penalty, eliminating cashier dispute.',
              },
              {
                q: 'Can parents manage multiple enrolled children with a single login?',
                a: 'Yes. The Parent Portal features a dedicated multi-child ward switcher in the top navigation bar. Parents can seamlessly toggle between siblings across different grades to view distinct fee ledgers, upcoming deadlines, and complete online checkout with zero page reloads.',
              },
            ].map((faq, idx) => (
              <div key={idx} className="rounded-xl border border-outline-variant/40 overflow-hidden bg-surface-container-low">
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  className="w-full p-5 text-left font-bold text-sm text-on-surface flex items-center justify-between hover:bg-surface-container transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-secondary transition-transform duration-200 ${
                      openFaq === idx ? 'rotate-180 text-primary-container' : ''
                    }`}
                  />
                </button>
                {openFaq === idx && (
                  <div className="px-5 pb-5 text-xs text-secondary leading-relaxed border-t border-outline-variant/20 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 12. Institutional Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800 text-xs">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary-container p-2 rounded-xl text-on-primary">
                <School className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-white text-sm">School ERP Unified Platform</span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Multi-Tenant Monolith Architecture • Protected by Institutional Boundary Isolation
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-slate-500">apartment</span>
                Multi-School SaaS
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-slate-500">mail</span>
                contact@schoolerp.internal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-slate-500">call</span>
                +91 (080) 4123-4567
              </span>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800 text-center text-[11px] text-slate-600">
            © {new Date().getFullYear()} Unified School ERP Platform. All institutional data strictly isolated per registered tenant.
          </div>
        </div>
      </footer>
    </div>
  );
};
