import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white gap-8 p-4">
      <h1 className="text-5xl font-bold italic">Time Auction</h1>
      
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <Link href="/play" className="bg-blue-600 hover:bg-blue-700 text-white text-center py-4 rounded-xl text-xl font-bold transition">
           我是玩家 (Player)
        </Link>
        
        <Link href="/public" className="bg-gray-700 hover:bg-gray-600 text-white text-center py-4 rounded-xl text-xl font-bold transition">
           觀看大螢幕 (Public)
        </Link>

        <Link href="/admin" className="text-gray-500 hover:text-gray-300 text-center text-sm mt-4">
           Admin Login
        </Link>
      </div>
    </div>
  )
}
