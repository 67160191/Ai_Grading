import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCourses, enrollCourse } from '../../api/courses'
import safeStorage from '../../utils/storage'

const CARD_STYLES = {
  indigo:  { card: 'bg-indigo-50  border-indigo-200  hover:border-indigo-400',  link: 'text-indigo-600' },
  pink:    { card: 'bg-pink-50    border-pink-200    hover:border-pink-400',    link: 'text-pink-600' },
  emerald: { card: 'bg-emerald-50 border-emerald-200 hover:border-emerald-400', link: 'text-emerald-600' },
  amber:   { card: 'bg-amber-50   border-amber-200   hover:border-amber-400',   link: 'text-amber-600' },
  sky:     { card: 'bg-sky-50     border-sky-200     hover:border-sky-400',     link: 'text-sky-600' },
  violet:  { card: 'bg-violet-50  border-violet-200  hover:border-violet-400',  link: 'text-violet-600' },
  rose:    { card: 'bg-rose-50    border-rose-200    hover:border-rose-400',    link: 'text-rose-600' },
  orange:  { card: 'bg-orange-50  border-orange-200  hover:border-orange-400',  link: 'text-orange-600' },
  fuchsia: { card: 'bg-fuchsia-50 border-fuchsia-200 hover:border-fuchsia-400', link: 'text-fuchsia-600' },
  white:   { card: 'bg-white      border-gray-200    hover:border-gray-400',    link: 'text-gray-600' },
}

export default function StudentCoursesPage() {
  const qc = useQueryClient()
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [semesterFilter, setSemesterFilter] = useState(() => safeStorage.getItem('student_semester_filter') || 'all')

  const setSemester = (s) => {
    setSemesterFilter(s)
    safeStorage.setItem('student_semester_filter', s)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['student-courses', showArchived],
    queryFn: () => getCourses(showArchived)
  })

  const enrollMutation = useMutation({
    mutationFn: (code) => enrollCourse(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-courses'] })
      setJoinCode('')
      setError('')
      setShowModal(false)
    },
    onError: (err) => setError(err.response?.data?.error || 'เกิดข้อผิดพลาด')
  })

  const closeModal = () => {
    setShowModal(false)
    setJoinCode('')
    setError('')
  }

  if (isLoading) return <div className="text-gray-500 py-10 text-center">กำลังโหลด...</div>

  const courses = data?.courses || []

  const semesters = [...new Set(courses.map(c => c.semester).filter(Boolean))].sort()
  const filteredCourses = semesterFilter === 'all'
    ? courses
    : courses.filter(c => c.semester === semesterFilter)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">วิชาของฉัน</h1>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex rounded-lg bg-gray-100 p-1 w-fit">
          <button
            type="button"
            onClick={() => setShowArchived(false)}
            className={`px-4 py-1.5 text-sm rounded-md transition-all ${!showArchived ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
          >
            วิชาปัจจุบัน
          </button>
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className={`px-4 py-1.5 text-sm rounded-md transition-all ${showArchived ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
          >
            วิชาที่จบแล้ว
          </button>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-indigo-700"
        >
          + เข้าร่วมวิชา
        </button>
      </div>

      {semesters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setSemester('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${semesterFilter === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-300 hover:border-gray-500'}`}
          >
            ทั้งหมด
          </button>
          {semesters.map(s => (
            <button
              key={s}
              onClick={() => setSemester(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${semesterFilter === s ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-300 hover:border-gray-500'}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {filteredCourses.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">ยังไม่ได้เข้าร่วมวิชาใด</p>
          <p className="text-sm mt-1">กดปุ่ม "เข้าร่วมวิชา" เพื่อเข้าร่วม</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredCourses.map(course => {
            const style = CARD_STYLES[course.color] || CARD_STYLES.indigo
            return (
            <Link key={course.id} to={`/student/courses/${course.id}`}
              className={`block border rounded-xl p-5 hover:shadow-md transition-all ${style.card}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <h2 className="font-semibold text-gray-800">{course.name}</h2>
                {course.semester && (
                  <span className="shrink-0 text-xs bg-white/70 border border-black/10 text-gray-500 px-2 py-0.5 rounded-full">
                    {course.semester}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-3">{course.description || '—'}</p>
              <span className={`text-xs hover:underline ${style.link}`}>
                ดูงานทั้งหมด →
              </span>
            </Link>
          )})}
        </div>
      )}

      {/* Modal เข้าร่วมวิชา */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">เข้าร่วมวิชา</h2>
            <input
              type="text"
              placeholder="รหัสวิชา เช่น ABC-123"
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError('') }}
              onKeyDown={e => e.key === 'Enter' && joinCode && enrollMutation.mutate(joinCode)}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono tracking-wider mb-2"
            />
            {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => enrollMutation.mutate(joinCode)}
                disabled={!joinCode || enrollMutation.isPending}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {enrollMutation.isPending ? 'กำลัง...' : 'เข้าร่วม'}
              </button>
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
