import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { MotionConfig } from 'framer-motion';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { SiteProvider } from '@/contexts/SiteContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { BrandLoader } from '@/components/common/BrandLoader';
import { hideSplash } from '@/lib/brand';
import HomePage from '@/pages/Home/HomePage';
import NotFoundPage from '@/pages/NotFound/NotFoundPage';

const AboutPage = lazy(() => import('@/pages/About/AboutPage'));
const ProjectsPage = lazy(() => import('@/pages/Projects/ProjectsPage'));
const ProjectDetailsPage = lazy(() => import('@/pages/ProjectDetails/ProjectDetailsPage'));
const ServicesPage = lazy(() => import('@/pages/Services/ServicesPage'));
const ProcessPage = lazy(() => import('@/pages/Process/ProcessPage'));
const ContactPage = lazy(() => import('@/pages/Contact/ContactPage'));
const PrivacyPage = lazy(() => import('@/pages/Privacy/PrivacyPage'));

// Admin bundle: loaded only when visiting /admin.
const AdminLayout = lazy(() => import('@/components/admin/AdminLayout'));
const AdminLogin = lazy(() => import('@/pages/Admin/LoginPage'));
const AdminForgotPassword = lazy(() => import('@/pages/Admin/ForgotPasswordPage'));
const AdminResetPassword = lazy(() => import('@/pages/Admin/ResetPasswordPage'));
const AdminDashboard = lazy(() => import('@/pages/Admin/DashboardPage'));
const AdminProjects = lazy(() => import('@/pages/Admin/ProjectsAdminPage'));
const AdminProjectEditor = lazy(() => import('@/pages/Admin/ProjectEditorPage'));
const AdminCategories = lazy(() => import('@/pages/Admin/CategoriesPage'));
const AdminServices = lazy(() => import('@/pages/Admin/ServicesAdminPage'));
const AdminMessages = lazy(() => import('@/pages/Admin/MessagesPage'));
const AdminTestimonials = lazy(() => import('@/pages/Admin/TestimonialsPage'));
const AdminMedia = lazy(() => import('@/pages/Admin/MediaPage'));
const AdminProfile = lazy(() => import('@/pages/Admin/ProfilePage'));
const AdminSettings = lazy(() => import('@/pages/Admin/SettingsPage'));
const AdminModerators = lazy(() => import('@/pages/Admin/ModeratorsPage'));
const AdminAssignments = lazy(() => import('@/pages/Admin/AssignmentsPage'));
const AdminBriefs = lazy(() => import('@/pages/Admin/BriefsReviewPage'));
const AdminLeadActivity = lazy(() => import('@/pages/Admin/LeadActivityPage'));
const AdminLead = lazy(() => import('@/pages/Admin/AdminLeadPage'));
const AdminAnalytics = lazy(() => import('@/pages/Admin/AnalyticsPage'));
const NotificationsPage = lazy(() => import('@/pages/Notifications/NotificationsPage'));

// Moderator bundle: loaded only when visiting /moderator.
const ModeratorLayout = lazy(() => import('@/components/moderator/ModeratorLayout'));
const ModeratorOverview = lazy(() => import('@/pages/Moderator/OverviewPage'));
const ModeratorLeads = lazy(() => import('@/pages/Moderator/LeadsPage'));
const ModeratorLead = lazy(() => import('@/pages/Moderator/LeadPage'));
const ModeratorCommunication = lazy(() => import('@/pages/Moderator/CommunicationPage'));
const ModeratorBriefs = lazy(() => import('@/pages/Moderator/BriefsPage'));
const ModeratorArchive = lazy(() => import('@/pages/Moderator/ArchivePage'));
const ModeratorProfile = lazy(() => import('@/pages/Moderator/ProfilePage'));

// Client questionnaire: standalone (no public navigation, no analytics tracker), opened via a secret link.
const ClientQuestionnaire = lazy(() => import('@/pages/Questionnaire/QuestionnairePage'));

/** Page inside a layout (navbar or dashboard stays visible): compact branded loader. */
const page = (node: ReactNode) => <Suspense fallback={<BrandLoader size="md" />}>{node}</Suspense>;
/** Top-level screen (sign-in pages, dashboard shells): full-screen branded loader. */
const screen = (node: ReactNode) => <Suspense fallback={<BrandLoader className="min-h-dvh" />}>{node}</Suspense>;

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', element: page(<AboutPage />) },
      { path: 'projects', element: page(<ProjectsPage />) },
      { path: 'projects/:slug', element: page(<ProjectDetailsPage />) },
      { path: 'services', element: page(<ServicesPage />) },
      { path: 'process', element: page(<ProcessPage />) },
      { path: 'contact', element: page(<ContactPage />) },
      { path: 'privacy', element: page(<PrivacyPage />) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: 'admin/login', element: screen(<AdminLogin />) },
  { path: 'admin/forgot-password', element: screen(<AdminForgotPassword />) },
  { path: 'admin/reset-password', element: screen(<AdminResetPassword />) },
  {
    path: 'admin',
    element: screen(<AdminLayout />),
    children: [
      { index: true, element: page(<AdminDashboard />) },
      { path: 'projects', element: page(<AdminProjects />) },
      { path: 'projects/new', element: page(<AdminProjectEditor />) },
      { path: 'projects/:id', element: page(<AdminProjectEditor />) },
      { path: 'categories', element: page(<AdminCategories />) },
      { path: 'services', element: page(<AdminServices />) },
      { path: 'messages', element: page(<AdminMessages />) },
      { path: 'testimonials', element: page(<AdminTestimonials />) },
      { path: 'media', element: page(<AdminMedia />) },
      { path: 'profile', element: page(<AdminProfile />) },
      { path: 'settings', element: page(<AdminSettings />) },
      { path: 'moderators', element: page(<AdminModerators />) },
      { path: 'assignments', element: page(<AdminAssignments />) },
      { path: 'briefs', element: page(<AdminBriefs />) },
      { path: 'activity', element: page(<AdminLeadActivity />) },
      { path: 'leads/:messageId', element: page(<AdminLead />) },
      { path: 'notifications', element: page(<NotificationsPage area="admin" />) },
      { path: 'analytics', element: page(<AdminAnalytics />) },
    ],
  },
  { path: 'questionnaire', element: screen(<ClientQuestionnaire />) },
  { path: 'moderator/login', element: screen(<AdminLogin area="moderator" />) },
  { path: 'moderator/forgot-password', element: screen(<AdminForgotPassword area="moderator" />) },
  { path: 'moderator/set-password', element: screen(<AdminResetPassword area="moderator" />) },
  {
    path: 'moderator',
    element: screen(<ModeratorLayout />),
    children: [
      { index: true, element: page(<ModeratorOverview />) },
      { path: 'leads', element: page(<ModeratorLeads />) },
      { path: 'leads/:messageId', element: page(<ModeratorLead />) },
      { path: 'communication', element: page(<ModeratorCommunication />) },
      { path: 'briefs', element: page(<ModeratorBriefs />) },
      { path: 'archive', element: page(<ModeratorArchive />) },
      { path: 'profile', element: page(<ModeratorProfile />) },
      { path: 'notifications', element: page(<NotificationsPage area="moderator" />) },
    ],
  },
]);

export default function App() {
  // React has rendered: fade out the static splash from index.html.
  useEffect(() => hideSplash(), []);
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>
          <SiteProvider>
            <AuthProvider>
              <RouterProvider router={router} />
            </AuthProvider>
          </SiteProvider>
        </ToastProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
