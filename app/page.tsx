import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      
      {/* 背景裝飾：動態光暈 */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-600/10 rounded-full blur-[120px]" />
      </div>

      {/* 中央主顯示器外框 */}
      <div className="relative z-10 w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl ring-1 ring-white/5">
        
        {/* 標題區 */}
        <div className="text-center mb-10 relative">
          <div className="inline-block relative">
            <h1 className="text-5xl md:text-6xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-200 to-gray-500 drop-shadow-lg">
              TIME<br/>AUCTION
            </h1>
            {/* 裝飾線條 */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-24 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-70"></div>
          </div>
          <p className="mt-6 text-blue-200/60 text-xs font-mono tracking-[0.3em] uppercase">
            System Online • Ready to Bid
          </p>
        </div>

        {/* 按鈕分流區 */}
        <div className="space-y-4 flex flex-col">
          
          {/* 1. 玩家入口 (最醒目) */}
          <Link href="/play" className="group relative w-full">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-xl blur opacity-40 group-hover:opacity-70 transition duration-300"></div>
            <div className="relative h-16 bg-gradient-to-r from-blue-900 to-slate-900 border border-blue-500/30 rounded-xl flex items-center justify-between px-6 transition-transform transform group-hover:-translate-y-1 active:translate-y-0 shadow-lg">
              <div className="flex items-center gap-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-bold text-sm border border-blue-500/30">P</span>
                <div className="flex flex-col text-left">
                  <span className="text-white font-bold tracking-wide text-lg">ENTER GAME</span>
                  <span className="text-blue-400/60 text-[10px] uppercase tracking-wider">Player Access</span>
                </div>
              </div>
              <span className="text-blue-400 group-hover:translate-x-1 transition">→</span>
            </div>
          </Link>

          {/* 2. 公告大屏 (次要) */}
          <Link href="/public" className="group relative w-full">
            <div className="relative h-14 bg-slate-800/50 border border-white/10 rounded-xl flex items-center justify-between px-6 hover:bg-slate-800 hover:border-white/20 transition-all">
              <div className="flex items-center gap-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/10 text-yellow-500 font-bold text-sm">TV</span>
                <div className="flex flex-col text-left">
                  <span className="text-gray-200 font-bold text-sm">PUBLIC DISPLAY</span>
                  <span className="text-gray-500 text-[10px] uppercase">Big Screen View</span>
                </div>
              </div>
            </div>
          </Link>

          {/* 分隔線 */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-2"></div>

          {/* 3. 管理員入口 (隱密) */}
          <Link href="/admin" className="text-center group">
            <span className="text-xs font-mono text-gray-600 group-hover:text-gray-400 transition-colors cursor-pointer flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-900 group-hover:bg-red-500 transition-colors"></span>
              ADMINISTRATION TERMINAL
            </span>
          </Link>

        </div>
      </div>

      {/* 底部版權/裝飾文字 */}
      <div className="absolute bottom-6 text-[10px] text-white/10 font-mono">
        ID: {Math.floor(Math.random() * 9000) + 1000}-SECURE
      </div>
    </div>
  )
}
