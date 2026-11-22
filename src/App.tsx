import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { MotionConfig } from 'framer-motion';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { SiteProvider } from '@/contexts/SiteContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { LoadingBlock } from '@/components/common/Feedback';
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

const page = (node: ReactNode) => (
  <Suspense fallback={<LoadingBlock className="min-h-[70dvh]" label="Loading…" />}>{node}</Suspense>
);

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
  { path: 'admin/login', element: page(<AdminLogin />) },
  { path: 'admin/forgot-password', element: page(<AdminForgotPassword />) },
  { path: 'admin/reset-password', element: page(<AdminResetPassword />) },
  {
    path: 'admin',
    element: page(<AdminLayout />),
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
    ],
  },
]);

export default function App() {
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
