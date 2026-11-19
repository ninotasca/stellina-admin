import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../platform/auth/AuthContext'
import { ApplicationRoutes } from './routes'

export default function Application() {
  return <BrowserRouter><AuthProvider><ApplicationRoutes /></AuthProvider></BrowserRouter>
}
