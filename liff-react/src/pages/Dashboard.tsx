import type { UserProfile, FoodEntry, WeeklySummary } from '../api'
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from 'recharts'

interface Props {
  profile: UserProfile
  todayEntries: FoodEntry[]
  weekly: WeeklySummary | null
}

export default function Dashboard({ profile, todayEntries, weekly }: Props) {
  const today = todayEntries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carb: acc.carb + e.carb,
      fat: acc.fat + e.fat,
    }),
    { calories: 0, protein: 0, carb: 0, fat: 0 }
  )

  const macros = [
    { name: 'แคลอรี่', consumed: today.calories, goal: profile.dailyCalorieGoal, unit: 'kcal', color: '#D97A2B' },
    { name: 'โปรตีน', consumed: today.protein, goal: profile.dailyProteinGoal, unit: 'g', color: '#E85D5D' },
    { name: 'คาร์บ', consumed: today.carb, goal: profile.dailyCarbGoal, unit: 'g', color: '#F5A623' },
    { name: 'ไขมัน', consumed: today.fat, goal: profile.dailyFatGoal, unit: 'g', color: '#7ED321' },
  ]

  const goalLabel: Record<string, string> = {
    lose: '⬇️ ลดน้ำหนัก',
    maintain: '⚖️ คงน้ำหนัก',
    gain: '⬆️ เพิ่มน้ำหนัก',
  }

  return (
    <div className="page">
      <h2 className="page-title">📊 สรุปวันนี้</h2>

      <div className="profile-badge">
        <span>{goalLabel[profile.goal]}</span>
        <span>{profile.weight} kg · {profile.height} cm</span>
      </div>

      <div className="macro-grid">
        {macros.map((m) => {
          const pct = Math.min(Math.round((m.consumed / m.goal) * 100), 100)
          const remaining = Math.max(m.goal - m.consumed, 0)
          return (
            <div key={m.name} className="macro-card">
              <div className="macro-chart">
                <ResponsiveContainer width={80} height={80}>
                  <RadialBarChart
                    innerRadius={28}
                    outerRadius={40}
                    data={[{ value: pct, fill: m.color }]}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar dataKey="value" cornerRadius={4} background={{ fill: '#f0f0f0' }} />
                    <Tooltip formatter={(v) => `${v}%`} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <span className="macro-pct" style={{ color: m.color }}>{pct}%</span>
              </div>
              <div className="macro-info">
                <div className="macro-name">{m.name}</div>
                <div className="macro-consumed">{m.consumed} / {m.goal} {m.unit}</div>
                <div className="macro-remaining">เหลือ {remaining} {m.unit}</div>
              </div>
            </div>
          )
        })}
      </div>

      {todayEntries.length === 0 && (
        <p className="empty-hint">ยังไม่มีบันทึกวันนี้<br />ถ่ายรูปอาหารใน LINE ได้เลย 📸</p>
      )}

      {todayEntries.length > 0 && (
        <div className="today-list">
          <h3>มื้อวันนี้</h3>
          {todayEntries.map((e, i) => (
            <div key={i} className="today-item">
              <span className="today-menu">{e.menuName}</span>
              <span className="today-cal">🔥 {e.calories} kcal</span>
            </div>
          ))}
        </div>
      )}

      {weekly && (
        <div className="weekly-summary">
          <h3>📅 สรุปสัปดาห์นี้ (เฉลี่ย/วัน)</h3>
          <div className="weekly-avg-row">
            <div className="weekly-avg-item">
              <span className="weekly-avg-label">🔥 แคลอรี่</span>
              <span className="weekly-avg-value">{weekly.avgCalories}</span>
              <span className="weekly-avg-unit">kcal</span>
            </div>
            <div className="weekly-avg-item">
              <span className="weekly-avg-label">🥩 โปรตีน</span>
              <span className="weekly-avg-value">{weekly.avgProtein}</span>
              <span className="weekly-avg-unit">g</span>
            </div>
            <div className="weekly-avg-item">
              <span className="weekly-avg-label">🍚 คาร์บ</span>
              <span className="weekly-avg-value">{weekly.avgCarb}</span>
              <span className="weekly-avg-unit">g</span>
            </div>
            <div className="weekly-avg-item">
              <span className="weekly-avg-label">🥑 ไขมัน</span>
              <span className="weekly-avg-value">{weekly.avgFat}</span>
              <span className="weekly-avg-unit">g</span>
            </div>
          </div>
          <div className="weekly-days">
            {weekly.days.map((d) => {
              const pct = Math.min(Math.round((d.calories / profile.dailyCalorieGoal) * 100), 100)
              const dayName = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][new Date(d.date).getDay()]
              return (
                <div key={d.date} className="weekly-day">
                  <div
                    className="weekly-bar"
                    style={{ height: `${Math.max(pct, 4)}%`, background: d.entryCount > 0 ? '#D97A2B' : '#e8e0d8' }}
                  />
                  <span className="weekly-day-label">{dayName}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
