import { useState } from 'react'
import { UserProfile, UpdateProfileDto, api } from '../api'

interface Props {
  userId: string
  profile: UserProfile
  onSaved: (updated: UserProfile) => void
}

const goalOptions = [
  { value: 'lose', label: '⬇️ ลดน้ำหนัก' },
  { value: 'maintain', label: '⚖️ คงน้ำหนัก' },
  { value: 'gain', label: '⬆️ เพิ่มน้ำหนัก' },
]

const genderOptions = [
  { value: 'male', label: '👨 ชาย' },
  { value: 'female', label: '👩 หญิง' },
]

const activityOptions = [
  { value: 'sedentary', label: '🪑 นั่งโต๊ะเป็นส่วนใหญ่' },
  { value: 'light', label: '🚶 เดินเบาๆ บางวัน' },
  { value: 'moderate', label: '🏃 ออกกำลังสม่ำเสมอ' },
  { value: 'very_active', label: '💪 ออกกำลังหนักมาก' },
]

const bodyFatOptions = [
  { value: '', label: 'ไม่ระบุ' },
  { value: '10-15%', label: '10-15%' },
  { value: '16-20%', label: '16-20%' },
  { value: '21-25%', label: '21-25%' },
  { value: '26-30%', label: '26-30%' },
  { value: '31%+', label: '31%+' },
]

export default function ProfileEditor({ userId, profile, onSaved }: Props) {
  const [form, setForm] = useState<UpdateProfileDto>({
    goal: profile.goal,
    gender: profile.gender,
    age: profile.age,
    weight: profile.weight,
    height: profile.height,
    activityLevel: profile.activityLevel,
    bodyFatRange: profile.bodyFatRange ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const set = <K extends keyof UpdateProfileDto>(key: K, value: UpdateProfileDto[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await api.updateProfile(userId, form)
      onSaved(updated)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <h2 className="page-title">⚙️ แก้ไขโปรไฟล์</h2>
      <p className="page-subtitle">ระบบจะคำนวณ TDEE ใหม่อัตโนมัติเมื่อบันทึก</p>

      <div className="form">
        <label>🎯 เป้าหมาย</label>
        <select value={form.goal} onChange={(e) => set('goal', e.target.value as UpdateProfileDto['goal'])}>
          {goalOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label>👤 เพศ</label>
        <select value={form.gender} onChange={(e) => set('gender', e.target.value as UpdateProfileDto['gender'])}>
          {genderOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label>🎂 อายุ (ปี)</label>
        <input type="number" value={form.age} min={10} max={100}
          onChange={(e) => set('age', Number(e.target.value))} />

        <label>⚖️ น้ำหนัก (kg)</label>
        <input type="number" value={form.weight} min={30} max={300} step={0.1}
          onChange={(e) => set('weight', Number(e.target.value))} />

        <label>📏 ส่วนสูง (cm)</label>
        <input type="number" value={form.height} min={100} max={250}
          onChange={(e) => set('height', Number(e.target.value))} />

        <label>🏃 ระดับกิจกรรม</label>
        <select value={form.activityLevel} onChange={(e) => set('activityLevel', e.target.value as UpdateProfileDto['activityLevel'])}>
          {activityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label>📊 % ไขมันในร่างกาย</label>
        <select value={form.bodyFatRange ?? ''} onChange={(e) => set('bodyFatRange', e.target.value)}>
          {bodyFatOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
        </button>

        {saved && (
          <div className="saved-badge">
            ✅ บันทึกแล้ว! แคลอรี่เป้าหมายใหม่คือ {profile.dailyCalorieGoal} kcal/วัน
          </div>
        )}
      </div>
    </div>
  )
}
