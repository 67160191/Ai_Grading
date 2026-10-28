import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAppeals, respondAppeal } from '../../api/grading'

const statusLabel = {
  pending:  { text: 'รอพิจารณา', cls: 'bg-orange-100 text-orange-700' },
  resolved: { text: 'เสร็จสิ้น', cls: 'bg-green-100 text-green-700' },
}

export default function TeacherAppealsPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('pending')
  const [respondingId, setRespondingId] = useState(null)
  const [form, setForm] = useState({ teacher_response: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['appeals'],
    queryFn: getAppeals,
    refetchInterval: 30_000
  })

  const respondMutation = useMutation({
    mutationFn: ({ id, data }) => respondAppeal(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appeals'] })
      qc.invalidateQueries({ queryKey: ['appeal-count'] })
      setRespondingId(null)
      setForm({ teacher_response: '' })
    }
  })

  const appeals = data?.appeals || []
  const filtered = filter === 'all' ? appeals : appeals.filter(a => a.status === filter)

  const pendingCount = appeals.filter(a => a.status === 'pending').length
  const resolvedCount = appeals.filter(a => a.status === 'resolved').length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Appeal Queue</h1>
        <p className="text-sm text-gray-400 mt-0.5">คำร้องขอแก้ไขคะแนนจากนิสิต</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          { label: 'รอพิจารณา', value: pendingCount, color: 'text-orange-600' },
          { label: 'เสร็จสิ้น', value: resolvedCount, color: 'text-green-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {[
          ['pending', 'รอพิจารณา'],
          ['resolved', 'เสร็จสิ้น'],
          ['all', 'ทั้งหมด'],
        ].map(([value, label]) => (
          <button key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              filter === value
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Appeals list */}
      {isLoading ? (
        <p className="text-gray-400 text-center py-8">กำลังโหลด...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-base">ไม่มี Appeal ในหมวดนี้</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(appeal => {
            const st = statusLabel[appeal.status]
            const isResponding = respondingId === appeal.id
            return (
              <div key={appeal.id} className="bg-white border border-gray-200 rounded-xl p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.cls}`}>
                        {st.text}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(appeal.created_at).toLocaleString('th-TH')}
                      </span>
                    </div>
                    <p className="font-semibold text-gray-800">{appeal.student_name}</p>
                    <p className="text-xs text-gray-400">{appeal.student_username}</p>
                  </div>
                  <Link
                    to={`/teacher/submissions/${appeal.submission_id}`}
                    className="text-xs text-indigo-500 hover:underline shrink-0"
                  >
                    ดู submission →
                  </Link>
                </div>

                {/* Context */}
                <div className="flex gap-2 text-xs text-gray-500 mb-3">
                  <span className="bg-gray-100 rounded-full px-2 py-0.5">{appeal.course_name}</span>
                  <span className="bg-gray-100 rounded-full px-2 py-0.5">{appeal.assignment_title}</span>
                </div>

                {/* Reason */}
                <div className="bg-orange-50 rounded-lg p-3 mb-3">
                  <p className="text-xs font-medium text-orange-700 mb-1">เหตุผลของนิสิต</p>
                  <p className="text-sm text-gray-700">{appeal.reason}</p>
                </div>

                {/* Teacher response (if any) */}
                {appeal.teacher_response && (
                  <div className="bg-indigo-50 rounded-lg p-3 mb-3">
                    <p className="text-xs font-medium text-indigo-600 mb-1">ความเห็นของอาจารย์</p>
                    <p className="text-sm text-gray-700">{appeal.teacher_response}</p>
                  </div>
                )}

                {/* Actions */}
                {appeal.status !== 'resolved' && (
                  isResponding ? (
                    <div className="space-y-2">
                          <textarea
                        rows={2}
                        placeholder="ตอบกลับนิสิต..."
                        value={form.teacher_response}
                        onChange={e => setForm(f => ({ ...f, teacher_response: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => respondMutation.mutate({ id: appeal.id, data: { status: 'resolved', teacher_response: form.teacher_response } })}
                          disabled={!form.teacher_response.trim() || respondMutation.isPending}
                          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {respondMutation.isPending ? 'กำลังบันทึก...' : 'ตอบกลับและปิด Appeal'}
                        </button>
                        <button
                          onClick={() => { setRespondingId(null); setForm({ teacher_response: '' }) }}
                          className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-600 hover:bg-gray-200"
                        >
                          ยกเลิก
                        </button>
                      </div>
                      {respondMutation.isError && (
                        <p className="text-red-500 text-xs">
                          {respondMutation.error?.response?.data?.error || 'เกิดข้อผิดพลาด'}
                        </p>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => { setRespondingId(appeal.id); setForm({ teacher_response: '' }) }}
                      className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                    >
                      ตอบกลับ
                    </button>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
