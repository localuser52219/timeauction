'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/utils/supabase'

export default function PublicPage() {
  const [gameState, setGameState] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [bids, setBids] = useState<any[]>([])

  // 使用 Ref 來避免閉包問題
  const gameStateRef = useRef<any>(null)

  useEffect(() => {
    fetchData()

    const channel = supabase.channel('public_view')
      // 1. 監聽房間狀態 (最重要)
      // 當 DB 觸發器將狀態改為 'revealed' 時，這裡會立刻收到通知
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ta_rooms' }, (payload: any) => {
         const newRoom = payload.new
         setGameState(newRoom)
         gameStateRef.current = newRoom 

         if (newRoom.game_status === 'revealed') {
            // 收到揭曉訊號，拉取結果
            // 小技巧：延遲 500ms 讓資料庫事務完全提交，確保 RLS 權限已釋放
            setTimeout(() => fetchBids(newRoom.current_round), 500)
         } else if (newRoom.game_status === 'bidding') {
            // 進入下一局，清空舊出價
            setBids([]) 
         }
      })
      // 2. 監聽玩家分數/時間變化
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_players' }, fetchPlayers)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const fetchData = async () => {
    const { data: room } = await supabase.from('ta_rooms').select('*').single()
    if (room) {
      setGameState(room)
      gameStateRef.current = room
      if(room.game_status === 'revealed') fetchBids(room.current_round)
    }
    fetchPlayers()
  }

  const fetchPlayers = async () => {
    const { data } = await supabase.from('ta_players').select('*').order('tokens', { ascending: false }).order('total_time_left', { ascending: true })
    setPlayers(data || [])
  }

  const fetchBids = async (round: number) => {
    const { data } = await supabase.from('ta_bids').select('*').eq('round_number', round)
    setBids(data || [])
  }

  const getBidDisplay = (playerId: string) => {
    if (!gameState) return '-'
    const bid = bids.find(b => b.player_id === playerId)
    
    if (gameState.game_status === 'bidding') {
       return <span className="text-gray-500 animate-pulse text-sm font-mono tracking-widest">THINKING...</span>
    }
    
    if (bid) {
       if (bid.is_fold) return <span className="text-gray-500 text-sm font-bold">FOLD</span>
       return <span className="text-blue-400 text-3xl font-bold font-mono">{bid.bid_seconds.toFixed(1)}s</span>
    }
    return <span className="text-red-900 text-sm">NO BID</span>
  }

  const getWinnerId = () => {
     if(gameState?.game_status !== 'revealed' || bids.length === 0) return null
     const validBids = bids.filter(b => !b.is_fold)
     if(validBids.length === 0) return null
     const max = Math.max(...validBids.map(b => b.bid_seconds))
     const winners = validBids.filter(b => b.bid_seconds === max)
     return winners.length === 1 ? winners[0].player_id : null
  }
  
  const winnerId = getWinnerId()

  if (!gameState) return <div className="p-10 text-xl text-white">Connecting System...</div>

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8 overflow-hidden font-sans selection:bg-blue-500 selection:text-white">
      {/* 頂部資訊列 */}
      <div className="flex justify-between items-end mb-10 border-b border-white/10 pb-6">
        <div>
           <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-400 to-gray-600 italic">
             TIME AUCTION
           </h1>
           <div className="text-gray-500 text-xs tracking-[0.3em] mt-2 uppercase">Survival Game Protocol</div>
        </div>
        <div className="text-right">
           <div className="text-blue-500 text-xs uppercase tracking-[0.2em] mb-1 font-bold">Current Round</div>
           <div className="text-7xl font-mono font-bold text-white leading-none">
             {gameState.current_round}
             <span className="text-3xl text-gray-700 ml-2 font-light">/ {gameState.settings_total_rounds || 19}</span>
           </div>
        </div>
      </div>

      {/* 狀態指示燈 */}
      <div className="flex justify-center mb-12">
         <div className={`relative px-12 py-4 rounded-full border transition-all duration-500
            ${gameState.game_status === 'bidding' 
              ? 'bg-blue-900/20 border-blue-500/50 shadow-[0_0_40px_rgba(59,130,246,0.2)]' 
              : 'bg-red-900/20 border-red-500/50 shadow-[0_0_40px_rgba(239,68,68,0.2)]'}`}>
            <span className={`text-3xl font-bold tracking-[0.25em] uppercase
              ${gameState.game_status === 'bidding' ? 'text-blue-400 animate-pulse' : 'text-red-500'}`}>
              {gameState.game_status === 'bidding' ? 'BIDDING OPEN' : 'RESULTS REVEALED'}
            </span>
         </div>
      </div>

      {/* 玩家卡片網格 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {players.map(p => {
          const isWinner = p.id === winnerId
          return (
            <div key={p.id} 
                 className={`relative bg-neutral-900 rounded-2xl p-6 border transition-all duration-500 group
                 ${isWinner 
                    ? 'border-yellow-500/80 shadow-[0_0_50px_rgba(234,179,8,0.3)] scale-105 z-10' 
                    : 'border-white/5 hover:border-white/10 hover:bg-neutral-800'
                 }
                 `}>
              
              {isWinner && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-yellow-500 text-black font-bold px-4 py-1 rounded-full text-xs tracking-wider shadow-lg">
                  ROUND WINNER
                </div>
              )}
              
              <div className="flex justify-between items-start mb-6">
                 <h2 className="text-xl font-bold truncate text-gray-200 group-hover:text-white transition">{p.name}</h2>
                 <div className="flex items-center gap-1 bg-yellow-500/10 px-2 py-1 rounded-lg border border-yellow-500/20">
                   <span className="text-yellow-500 font-bold text-lg">{p.tokens}</span>
                   <span className="text-[10px] text-yellow-600 uppercase">WIN</span>
                 </div>
              </div>

              <div className="bg-black/40 rounded-xl p-5 text-center border border-white/5 relative overflow-hidden">
                 <div className="text-[9px] text-gray-600 uppercase mb-2 tracking-[0.2em]">Bid Submitted</div>
                 <div className="relative z-10">{getBidDisplay(p.id)}</div>
                 <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/5 opacity-0 group-hover:opacity-100 transition"></div>
              </div>

              <div className="mt-4 flex justify-center items-center gap-2 opacity-30">
                 <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
                 <span className="text-[9px] uppercase tracking-widest text-gray-500">Time Hidden</span>
                 <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
