import axios from 'axios'

export const BACKEND_URL = 'https://1kbj7t.instatunnel.my'

export interface FoodEntry {
  menuName: string
  calories: number
  protein: number
  carb: number
  fat: number
  createdAt: string
}

export interface UserProfile {
  lineUserId: string
  goal: 'lose' | 'maintain' | 'gain'
  gender: 'male' | 'female'
  age: number
  weight: number
  height: number
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'very_active'
  bodyFatRange?: string
  dailyCalorieGoal: number
  dailyProteinGoal: number
  dailyCarbGoal: number
  dailyFatGoal: number
}

export interface WeeklyDay {
  date: string
  calories: number
  protein: number
  carb: number
  fat: number
  entryCount: number
}

export interface WeeklySummary {
  days: WeeklyDay[]
  avgCalories: number
  avgProtein: number
  avgCarb: number
  avgFat: number
}

export interface UpdateProfileDto {
  goal: 'lose' | 'maintain' | 'gain'
  gender: 'male' | 'female'
  age: number
  weight: number
  height: number
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'very_active'
  bodyFatRange?: string
}

export const api = {
  getHistory: (userId: string) =>
    axios.get<FoodEntry[]>(`${BACKEND_URL}/history/data`, { params: { userId } }).then(r => r.data),

  getProfile: (userId: string) =>
    axios.get<UserProfile>(`${BACKEND_URL}/user-profile`, { params: { userId } }).then(r => r.data),

  updateProfile: (userId: string, dto: UpdateProfileDto) =>
    axios.put<UserProfile>(`${BACKEND_URL}/user-profile`, dto, { params: { userId } }).then(r => r.data),

  getWeeklySummary: (userId: string) =>
    axios.get<WeeklySummary>(`${BACKEND_URL}/nutrition/weekly`, { params: { userId } }).then(r => r.data),
}
