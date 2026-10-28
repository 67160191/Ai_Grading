import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";

// Teacher pages
import CoursesPage from "./pages/teacher/CoursesPage";
import CourseDetailPage from "./pages/teacher/CourseDetailPage";
import AssignmentDetailPage from "./pages/teacher/AssignmentDetailPage";
import SubmissionReviewPage from "./pages/teacher/SubmissionReviewPage";
import TeacherAppealsPage from "./pages/teacher/TeacherAppealsPage";
import GradingSettingsPage from "./pages/teacher/GradingSettingsPage";
import ExamGradingPage from "./pages/teacher/ExamGradingPage";

// Admin pages
import AdminPage from "./pages/admin/AdminPage";

// Student pages
import StudentCoursesPage from "./pages/student/StudentCoursesPage";
import StudentAssignmentPage from "./pages/student/StudentAssignmentPage";
import StudentResultPage from "./pages/student/StudentResultPage";
import StudentSubmissionsPage from "./pages/student/StudentSubmissionsPage";
import StudentCourseDetailPage from "./pages/student/StudentCourseDetailPage";
import StudentExamTakePage from "./pages/student/StudentExamTakePage";
import StudentExamResultPage from "./pages/student/StudentExamResultPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function PrivateRoute({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "teacher")
    return <Navigate to="/teacher/courses" replace />;
  return <Navigate to="/student/courses" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<HomeRedirect />} />

              {/* Admin routes */}
              <Route
                path="/admin"
                element={
                  <PrivateRoute role="admin">
                    <Layout>
                      <AdminPage />
                    </Layout>
                  </PrivateRoute>
                }
              />

              {/* Teacher routes */}
              <Route
                path="/teacher/courses"
                element={
                  <PrivateRoute role="teacher">
                    <Layout>
                      <CoursesPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/teacher/courses/:courseId"
                element={
                  <PrivateRoute role="teacher">
                    <Layout>
                      <CourseDetailPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/teacher/assignments/:assignmentId"
                element={
                  <PrivateRoute role="teacher">
                    <Layout>
                      <AssignmentDetailPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/teacher/submissions/:submissionId"
                element={
                  <PrivateRoute role="teacher">
                    <Layout>
                      <SubmissionReviewPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/teacher/appeals"
                element={
                  <PrivateRoute role="teacher">
                    <Layout>
                      <TeacherAppealsPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/teacher/settings"
                element={
                  <PrivateRoute role="teacher">
                    <Layout>
                      <GradingSettingsPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/teacher/exams/:examId/grade"
                element={
                  <PrivateRoute role="teacher">
                    <Layout>
                      <ExamGradingPage />
                    </Layout>
                  </PrivateRoute>
                }
              />

              {/* Student routes */}
              <Route
                path="/student/courses"
                element={
                  <PrivateRoute role="student">
                    <Layout>
                      <StudentCoursesPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/student/courses/:courseId"
                element={
                  <PrivateRoute role="student">
                    <Layout>
                      <StudentCourseDetailPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/student/assignments/:assignmentId"
                element={
                  <PrivateRoute role="student">
                    <Layout>
                      <StudentAssignmentPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/student/submissions/:submissionId"
                element={
                  <PrivateRoute role="student">
                    <Layout>
                      <StudentResultPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/student/submissions"
                element={
                  <PrivateRoute role="student">
                    <Layout>
                      <StudentSubmissionsPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/student/exams/:examId"
                element={
                  <PrivateRoute role="student">
                    <Layout>
                      <StudentExamTakePage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/student/exams/:examId/result"
                element={
                  <PrivateRoute role="student">
                    <Layout>
                      <StudentExamResultPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
