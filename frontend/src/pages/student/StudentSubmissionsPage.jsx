import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getMySubmissions } from '../../api/grading'

const statusConfig = {
  pending:  { text: 'รอตรวจ',      cls: 'bg-yellow-100 text-yellow-700' },
  grading:  { text: 'กำลังตรวจ',   cls: 'bg-blue-100 text-blue-700' },
  graded:   { text: 'ตรวจแล้ว',    cls: 'bg-indigo-100 text-indigo-700' },
  approved: { text: 'อนุมัติแล้ว', cls: 'bg-green-100 text-green-700' },
  rejected: { text: 'ปฏิเสธ',      cls: 'bg-red-100 text-red-700' },
}

export default function StudentSubmissionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-submissions'],
    queryFn: getMySubmissions
  })

  const submissions = data?.submissions || []

  if (isLoading) return <div className="text-gray-500 py-10 text-center">กำลังโหลด...</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">ประวัติการส่งงาน</h1>
        <p className="text-sm text-gray-400 mt-0.5">งานทั้งหมดที่เคยส่ง</p>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">ยังไม่มีประวัติการส่งงาน</p>
          <p className="text-sm mt-1">
            ไปที่ <Link to="/student/courses" className="text-indigo-500 hover:underline">วิชาของฉัน</Link> เพื่อส่งงาน
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map(s => {
            const st = statusConfig[s.status] || { text: s.status, cls: 'bg-gray-100 text-gray-600' }
            const displayLevel = s.status === 'approved' && s.final_level != null
              ? Number(s.final_level).toFixed(2)
              : s.avg_level != null ? Number(s.avg_level).toFixed(2) : null
            return (
              <Link
                key={s.id}
                to={`/student/submissions/${s.id}`}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 hover:shadow-sm hover:border-indigo-200 transition-all"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-800 truncate">{s.assignment_title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.course_name} · ครั้งที่ {s.attempt} · {new Date(s.submitted_at).toLocaleString('th-TH')}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                  {displayLevel != null && (
                    <span className="text-sm font-semibold text-gray-700">
                      {displayLevel}/{Number(s.max_level ?? 4).toFixed(2)}
                    </span>
                  )}
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.cls}`}>
                    {st.text}
                  </span>
                  <span className="text-gray-300 text-sm">→</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
