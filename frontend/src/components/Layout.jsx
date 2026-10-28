import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { getOllamaStatus } from "../api/settings";
import { getTeacherSummary } from "../api/courses";
import { changePassword } from "../api/auth";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const [pwModal, setPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const { data: summaryData } = useQuery({
    queryKey: ["teacher-summary"],
    queryFn: getTeacherSummary,
    enabled: user?.role === "teacher",
    refetchInterval: 60_000,
  });
  const pendingApproval = summaryData?.pending_approval || 0;
  const pendingAppeals = summaryData?.pending_appeals || 0;
  const approvalBreakdown = summaryData?.approval_breakdown || [];

  useEffect(() => {
    if (pendingApproval > 0) {
      document.title = `(${pendingApproval}) AI Grading`;
    } else {
      document.title = "AI Grading";
    }
  }, [pendingApproval]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError("");
    if (pwForm.next !== pwForm.confirm) {
      setPwError("รหัสผ่านใหม่ไม่ตรงกัน");
      return;
    }
    setPwLoading(true);
    try {
      await changePassword(pwForm.current, pwForm.next);
      setPwSuccess(true);
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      setPwError(err.response?.data?.error || "เกิดข้อผิดพลาด");
    } finally {
      setPwLoading(false);
    }
  };

  const openPwModal = () => {
    setPwModal(true);
    setPwError("");
    setPwSuccess(false);
    setPwForm({ current: "", next: "", confirm: "" });
    setUserMenuOpen(false);
  };

  // group breakdown by course_name
  const groupedBreakdown = approvalBreakdown.reduce((acc, item) => {
    if (!acc[item.course_name]) acc[item.course_name] = [];
    acc[item.course_name].push(item);
    return acc;
  }, {});

  const { data: ollamaStatus } = useQuery({
    queryKey: ["ollama-status"],
    queryFn: getOllamaStatus,
    enabled: !!user,
    refetchInterval: 60_000,
    retry: false,
  });
  const ollamaConnected = ollamaStatus?.connected ?? false;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav
        className={`${user?.role === "student" ? "bg-orange-50 border-orange-200" : user?.role === "admin" ? "bg-slate-800 border-slate-700" : "bg-purple-100 border-purple-300"} border-b px-6 py-3 flex items-center justify-between`}
      >
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className={`text-lg font-semibold hover:text-blue-400 transition-colors ${user?.role === "admin" ? "text-white" : "text-gray-900 hover:text-blue-600"}`}
          >
            AI Grading
          </Link>
          {user && (
            <span
              title={
                user.role === "student"
                  ? ollamaConnected
                    ? "ระบบ AI พร้อมใช้งาน"
                    : "ระบบ AI ขัดข้องชั่วคราว อาจตรวจงานล่าช้า"
                  : ollamaConnected
                    ? `${ollamaStatus.url} — ${ollamaStatus.model}${ollamaStatus.using === "backup" ? " (ใช้ URL สำรอง — ตัวหลักล่ม)" : ""}`
                    : "ไม่สามารถเชื่อมต่อ Ollama"
              }
              className={`w-2.5 h-2.5 rounded-full ${!ollamaConnected ? "bg-red-500" : ollamaStatus?.using === "backup" ? "bg-amber-500" : "bg-green-500"}`}
            />
          )}
        </div>
        {user && (
          <div className="flex items-center gap-4">
            {user.role === "student" && (
              <Link
                to="/student/submissions"
                className="text-sm text-gray-500 hover:text-indigo-600 transition-colors"
              >
                ประวัติส่งงาน
              </Link>
            )}
            {user.role === "teacher" && (
              <>
                {/* Pending Approval Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen((o) => !o)}
                    className="relative flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors"
                  >
                    รออนุมัติ
                    {pendingApproval > 0 && (
                      <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                        {pendingApproval}
                      </span>
                    )}
                  </button>
                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                      <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        งานรออนุมัติ
                      </div>
                      {Object.keys(groupedBreakdown).length === 0 ? (
                        <div className="px-3 py-3 text-sm text-gray-400">
                          ไม่มีงานรออนุมัติ
                        </div>
                      ) : (
                        <div className="max-h-80 overflow-y-auto">
                          {Object.entries(groupedBreakdown).map(
                            ([courseName, items]) => (
                              <div key={courseName}>
                                <div className="px-3 py-1.5 text-xs font-medium text-gray-400 bg-gray-50">
                                  {courseName}
                                </div>
                                {items.map((item) => (
                                  <Link
                                    key={item.assignment_id}
                                    to={`/teacher/assignments/${item.assignment_id}`}
                                    onClick={() => setDropdownOpen(false)}
                                    className="flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                                  >
                                    <span className="truncate">
                                      {item.assignment_title}
                                    </span>
                                    <span className="ml-2 min-w-fit w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs flex items-center justify-center font-bold">
                                      {item.count}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Link
                  to="/teacher/appeals"
                  className="relative flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors"
                >
                  Appeal Queue
                  {pendingAppeals > 0 && (
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center font-bold">
                      {pendingAppeals}
                    </span>
                  )}
                </Link>
                <Link
                  to="/teacher/settings"
                  className="text-sm text-gray-500 hover:text-indigo-600 transition-colors"
                >
                  ⚙️ ตั้งค่า AI
                </Link>
              </>
            )}
            {/* User dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <span>{user.role === "admin" ? "🛡️" : "👤"}</span>
                <span className={user.role === "admin" ? "text-white" : ""}>
                  {user.name}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    user.role === "teacher"
                      ? "bg-orange-100 text-orange-700"
                      : user.role === "admin"
                        ? "bg-slate-600 text-slate-100"
                        : "bg-green-100 text-green-700"
                  }`}
                >
                  {user.role === "teacher"
                    ? "อาจารย์"
                    : user.role === "admin"
                      ? "Admin"
                      : "นิสิต"}
                </span>
                <span className="text-gray-400 text-xs">▾</span>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  <button
                    onClick={openPwModal}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                  >
                    🔑 เปลี่ยนรหัสผ่าน
                  </button>
                  <hr className="border-gray-100" />
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-b-lg"
                  >
                    ออกจากระบบ
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>
      <main className="flex-1 w-full px-6 py-6">
        {children}
      </main>
      <footer className="text-center text-sm text-gray-500 py-4 border-t border-gray-200">
        คณะวิทยาการสารสนเทศ มหาวิทยาลัยบูรพา · v{__APP_VERSION__}
      </footer>

      {/* Change Password Modal */}
      {pwModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              เปลี่ยนรหัสผ่าน
            </h2>
            {pwSuccess ? (
              <div className="text-center py-4">
                <div className="text-green-500 text-3xl mb-2">✓</div>
                <p className="text-gray-700 font-medium">
                  เปลี่ยนรหัสผ่านสำเร็จ
                </p>
                <button
                  onClick={() => setPwModal(false)}
                  className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium"
                >
                  ปิด
                </button>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    รหัสผ่านปัจจุบัน
                  </label>
                  <input
                    type="password"
                    required
                    value={pwForm.current}
                    onChange={(e) =>
                      setPwForm((f) => ({ ...f, current: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    รหัสผ่านใหม่
                  </label>
                  <input
                    type="password"
                    required
                    value={pwForm.next}
                    onChange={(e) =>
                      setPwForm((f) => ({ ...f, next: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    ยืนยันรหัสผ่านใหม่
                  </label>
                  <input
                    type="password"
                    required
                    value={pwForm.confirm}
                    onChange={(e) =>
                      setPwForm((f) => ({ ...f, confirm: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                {pwError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">
                    {pwError}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPwModal(false)}
                    className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={pwLoading}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {pwLoading ? "กำลังบันทึก..." : "บันทึก"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
