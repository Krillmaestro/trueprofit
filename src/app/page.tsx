// Root page - middleware handles redirects to /login or /dashboard
// This is a fallback that should rarely be rendered
export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  )
}
