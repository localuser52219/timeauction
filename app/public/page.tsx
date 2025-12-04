'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

export default function PublicPage() {
  const [gameState, setGameState] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [bids, setBids] = useState<any[]>([])

  useEffect(() => {
    // 初始加載
    fetchData()

    // 訂閱所有變動
    const channel = supabase.channel('public_view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_rooms' }, (payload) => {
         setGameState(payload.new)
         // 狀態改變時 (如揭曉)，重新拉取 Bids 以獲得最新解密數據
         fetchBids(payload.new.current_round) 
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_players' }, fetchPlayers)
      // 注意：在 Bidding 階段監聽 ta_bids 沒用 (因為 RLS 擋住)，但在 Revealed 階段有用
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_bids' }, () => {
         if(gameState) fetchBids(gameState.current_round)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const fetchData = async () => {
    const { data: room } = await supabase.from('ta_rooms').select('*').single()
    if (room) {
      setGameState(room)
      fetchBids(room.current_round)
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

  // 輔助顯示
  const getBidDisplay = (playerId: string) => {
    if (!gameState) return '-'
    const bid = bids.find(b => b.player_id === playerId)
    
    // 競價階段
    if (gameState.game_status === 'bidding') {
       // 這裡我們其實無法知道誰已經出價 (因為 RLS 擋住了)，除非我們在 DB 加一個 public 欄位 'has_bid'
       // 目前設計：只能顯示 ?
       return <span className="text-gray-400 animate-pulse">???</span>
    }
    
    // 揭曉階段
    if (bid) {
       if (bid.is_fold) return <span className="text-gray-400 text-sm">FOLD</span>
       return <span className="text-blue-600 text-3xl font-bold font-mono">{bid.bid_seconds.toFixed(2)}s</span>
    }
    return <span className="text-red-300 text-sm">NO BID</span>
  }

  // 計算最高分高亮 (僅在揭曉時)
  const getWinnerId = () => {
     if(gameState?.game_status !== 'revealed' || bids.length === 0) return null
     const validBids = bids.filter(b => !b.is_fold)
     if(validBids.length === 0) return null
     const max = Math.max(...validBids.map(b => b.bid_seconds))
     const winners = validBids.filter(b => b.bid_seconds === max)
     return winners.length === 1 ? winners[0].player_id : null // Tie = no winner
  }
  
  const winnerId = getWinnerId()

  if (!gameState) return <div className="p-10 text-xl">Loading Arena...</div>

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8 overflow-hidden">
      {/* 頂部 Header */}
      <div className="flex justify-between items-end mb-10 border-b border-gray-700 pb-4">
        <div>
           <h1 className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-600 uppercase italic">
             Time Auction
           </h1>
        </div>
        <div className="text-right">
           <div className="text-gray-400 text-sm uppercase tracking-widest">Current Round</div>
           <div className="text-6xl font-mono font-bold">{gameState.current_round} <span className="text-2xl text-gray-500">/ 19</span></div>
        </div>
      </div>

      {/* 狀態大標題 */}
      <div className="text-center mb-8">
         <span className={`inline-block px-8 py-2 rounded-full text-2xl font-bold tracking-widest uppercase
            ${gameState.game_status === 'bidding' ? 'bg-green-600 animate-pulse' : 'bg-red-600'}`}>
            {gameState.game_status}
         </span>
      </div>

      {/* 玩家列表 Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {players.map(p => {
          const isWinner = p.id === winnerId
          return (
            <div key={p.id} 
                 className={`relative bg-gray-800 rounded-xl p-6 border-2 transition-all duration-500
                 ${isWinner ? 'border-yellow-400 scale-105 shadow-[0_0_30px_rgba(250,204,21,0.5)] z-10' : 'border-gray-700 opacity-90'}
                 `}>
              {isWinner && <div className="absolute -top-4 -right-4 text-4xl">👑</div>}
              
              <div className="flex justify-between items-start mb-4">
                 <h2 className="text-2xl font-bold truncate">{p.name}</h2>
                 <div className="text-yellow-400 font-bold text-xl flex">
                   {p.tokens}<span className="text-xs mt-1 ml-1">★</span>
                 </div>
              </div>

              <div className="bg-gray-900 rounded-lg p-4 text-center mb-2">
                 <div className="text-xs text-gray-500 uppercase mb-1">Bid Time</div>
                 <div>{getBidDisplay(p.id)}</div>
              </div>

              <div className="text-right">
                 <span className="text-xs text-gray-500 mr-2">REMAINING:</span>
                 <span className={`font-mono text-xl ${p.total_time_left < 30 ? 'text-red-500' : 'text-gray-300'}`}>
                   {p.total_time_left.toFixed(1)}s
                 </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
