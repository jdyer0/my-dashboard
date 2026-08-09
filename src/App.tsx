import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { SignIn } from './auth/SignIn'
import { Splash } from './auth/Splash'
import { BootGuardProvider } from './motion/BootSequence'
import { AppShell } from './shell/AppShell'
import { Overview } from './screens/Overview'
import { Gym } from './screens/Gym'
import { GymSession } from './screens/GymSession'
import { GymSessionDetail } from './screens/GymSessionDetail'
import { GymCoach } from './screens/GymCoach'
import { GymHistory } from './screens/GymHistory'
import { GymExercises } from './screens/GymExercises'
import { GymSplit } from './screens/GymSplit'
import { GymSplitTemplate } from './screens/GymSplitTemplate'
import { FoodLayout } from './screens/FoodLayout'
import { FoodDiary } from './screens/FoodDiary'
import { FoodTrends } from './screens/FoodTrends'
import { FoodMicros } from './screens/FoodMicros'
import { FoodWater } from './screens/FoodWater'
import { FoodChat } from './screens/FoodChat'
import { FoodManual } from './screens/FoodManual'
import { FoodEntry } from './screens/FoodEntry'
import { FoodProgram } from './screens/FoodProgram'
import { FoodWeight } from './screens/FoodWeight'

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
        {/* The four food views share a header and segmented nav; the logging
            and settings screens are full-width pushes off them. */}
        <Route path="food" element={<FoodLayout />}>
          <Route index element={<FoodDiary />} />
          <Route path="trends" element={<FoodTrends />} />
          <Route path="micros" element={<FoodMicros />} />
          <Route path="water" element={<FoodWater />} />
        </Route>
        <Route path="food/chat" element={<FoodChat />} />
        <Route path="food/manual" element={<FoodManual />} />
        <Route path="food/entry/:id" element={<FoodEntry />} />
        <Route path="food/program" element={<FoodProgram />} />
        <Route path="food/weight" element={<FoodWeight />} />
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
