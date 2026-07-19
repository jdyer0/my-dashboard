import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { SignIn } from './auth/SignIn'
import { Splash } from './auth/Splash'
import { BootGuardProvider } from './motion/BootSequence'
import { AppShell } from './shell/AppShell'
import { EmptyModule } from './shell/EmptyModule'
import { Overview } from './screens/Overview'
import { Gym } from './screens/Gym'
import { GymSession } from './screens/GymSession'
import { GymSessionDetail } from './screens/GymSessionDetail'
import { GymCoach } from './screens/GymCoach'
import { GymHistory } from './screens/GymHistory'
import { GymExercises } from './screens/GymExercises'
import { GymSplit } from './screens/GymSplit'
import { GymSplitTemplate } from './screens/GymSplitTemplate'
import { Food } from './screens/Food'
import { FoodSearch } from './screens/FoodSearch'
import { FoodChat } from './screens/FoodChat'
import { FoodPortion } from './screens/FoodPortion'
import { FoodCustom } from './screens/FoodCustom'
import { FoodEntry } from './screens/FoodEntry'
import { FoodMicros } from './screens/FoodMicros'
import { FoodGoals } from './screens/FoodGoals'

function Gate() {
  const auth = useAuth()

  if (auth.status === 'loading') return <Splash />
  if (auth.status === 'signed-out') return <SignIn />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="gym" element={<Gym />} />
        <Route path="gym/session" element={<GymSession />} />
        <Route path="gym/session/:id" element={<GymSessionDetail />} />
        <Route path="gym/history" element={<GymHistory />} />
        <Route path="gym/exercises" element={<GymExercises />} />
        <Route path="gym/coach" element={<GymCoach />} />
        <Route path="gym/split" element={<GymSplit />} />
        <Route path="gym/split/:focus" element={<GymSplitTemplate />} />
        <Route path="food" element={<Food />} />
        <Route path="food/log" element={<FoodSearch />} />
        <Route path="food/chat" element={<FoodChat />} />
        <Route path="food/portion/:foodId" element={<FoodPortion />} />
        <Route path="food/new" element={<FoodCustom />} />
        <Route path="food/entry/:id" element={<FoodEntry />} />
        <Route path="food/micros" element={<FoodMicros />} />
        <Route path="food/goals" element={<FoodGoals />} />
        <Route
          path="money"
          element={<EmptyModule title="Money" invitation="Connect your bank" />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BootGuardProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </BootGuardProvider>
    </AuthProvider>
  )
}
