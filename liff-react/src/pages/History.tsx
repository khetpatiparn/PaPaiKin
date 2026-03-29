import type { FoodEntry } from '../api'

interface Props {
  entries: FoodEntry[]
}

export default function History({ entries }: Props) {
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
    <div className="page">
      <h2 className="page-title">📋 ประวัติการกิน</h2>

      {entries.length === 0 ? (
        <p className="empty-hint">ยังไม่มีประวัติการกิน<br />ลองส่งรูปอาหารใน LINE ดูสิ!</p>
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
                <td>{new Date(e.createdAt).toLocaleDateString('th-TH')}</td>
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
    </div>
  )
}
