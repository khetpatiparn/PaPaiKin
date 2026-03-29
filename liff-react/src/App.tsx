import { useState, useEffect } from 'react'
import axios from 'axios'
import liff from '@line/liff'
import './App.css'

const LIFF_ID = '2009619573-KoQIjGuU'
const BACKEND_URL = 'https://7gn1g5.instatunnel.my'

interface FoodEntry {
  menuName: string
  calories: number
  protein: number
  carb: number
  fat: number
  createdAt: string
}

function App() {
  const [entries, setEntries] = useState<FoodEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        await liff.init({ liffId: LIFF_ID })
        if (!liff.isLoggedIn()) {
          liff.login()
          return
        }
        const profile = await liff.getProfile()
        const res = await axios.get<FoodEntry[]>(`${BACKEND_URL}/history/data`, {
          params: { userId: profile.userId },
        })
        setEntries(res.data)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  if (loading) return <p className="center">กำลังโหลด...</p>
  if (error) return <p className="center">เกิดข้อผิดพลาด: {error}</p>

  const total = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carb: acc.carb + e.carb,
      fat: acc.fat + e.fat,
    }),
    { calories: 0, protein: 0, carb: 0, fat: 0 }
  )

  return (
    <>
      <h1>ประวัติการกิน</h1>
      <p className="subtitle">ข้อมูลทั้งหมดที่บันทึกผ่าน PaPaiKin</p>

      {entries.length === 0 ? (
        <p className="center">ยังไม่มีประวัติการกิน<br />ลองส่งรูปอาหารใน LINE ดูสิ!</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>เมนู</th>
              <th>วันที่</th>
              <th>แคล</th>
              <th>โปรตีน</th>
              <th>คาร์บ</th>
              <th>ไขมัน</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{e.menuName}</td>
                <td>{new Date(e.createdAt).toLocaleDateString()}</td>
                <td>{e.calories}</td>
                <td>{e.protein}</td>
                <td>{e.carb}</td>
                <td>{e.fat}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td colSpan={3}>รวมทั้งหมด</td>
              <td>{total.calories}</td>
              <td>{total.protein}</td>
              <td>{total.carb}</td>
              <td>{total.fat}</td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  )
}

export default App
