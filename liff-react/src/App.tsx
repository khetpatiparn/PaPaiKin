import { useState, useEffect } from 'react'
import liff from '@line/liff'
import { api } from './api'
import type { UserProfile, FoodEntry } from './api'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import ProfileEditor from './pages/ProfileEditor'
import './App.css'

const LIFF_ID = '2009619573-KoQIjGuU'

type Tab = 'dashboard' | 'history' | 'profile'

function App() {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [entries, setEntries] = useState<FoodEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')

  useEffect(() => {
    async function init() {
      try {
        await liff.init({ liffId: LIFF_ID })
        if (!liff.isLoggedIn()) { liff.login(); return }
        const lineProfile = await liff.getProfile()
        const uid = lineProfile.userId
        setUserId(uid)

        const [profileData, historyData] = await Promise.all([
          api.getProfile(uid),
          api.getHistory(uid),
        ])
        setProfile(profileData)
        setEntries(historyData)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  if (loading) return <div className="center-screen"><p>กำลังโหลด...</p></div>
  if (error) return <div className="center-screen"><p>เกิดข้อผิดพลาด: {error}</p></div>
  if (!profile) return <div className="center-screen"><p>ไม่พบข้อมูลโปรไฟล์<br />กรุณาตั้งค่าผ่าน LINE ก่อน</p></div>

  const today = new Date().toDateString()
  const todayEntries = entries.filter(e => new Date(e.createdAt).toDateString() === today)

  return (
    <div className="app">
      <div className="content">
        {tab === 'dashboard' && <Dashboard profile={profile} todayEntries={todayEntries} />}
        {tab === 'history' && <History entries={entries} />}
        {tab === 'profile' && userId && (
          <ProfileEditor
            userId={userId}
            profile={profile}
            onSaved={(updated) => setProfile(updated)}
          />
        )}
      </div>

      <nav className="bottom-nav">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
          <span>📊</span><span>Dashboard</span>
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          <span>📋</span><span>ประวัติ</span>
        </button>
        <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
          <span>⚙️</span><span>โปรไฟล์</span>
        </button>
      </nav>
    </div>
  )
}

export default App
